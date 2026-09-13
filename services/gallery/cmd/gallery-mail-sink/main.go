// gallery-mail-sink records local receipts through the Pinguin gRPC contract.
package main

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/mail"
	"os"
	"os/signal"
	"slices"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/tyemirov/pinguin/pkg/grpcapi"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	_ "modernc.org/sqlite"
)

const keyVariable = "GALLERY_PINGUIN_API_KEY"
const messageLimit = 1 << 20

type mailSink struct {
	grpcapi.UnimplementedNotificationServiceServer
	database *sql.DB
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := run(ctx, os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	key := os.Getenv(keyVariable)
	if len(key) < 32 || strings.TrimSpace(key) != key {
		return fmt.Errorf("configure local mail: %s requires at least 32 bytes without surrounding whitespace", keyVariable)
	}
	if len(args) == 0 {
		return errors.New("use gallery-mail-sink serve, list, or ready")
	}
	switch args[0] {
	case "serve":
		flags := flag.NewFlagSet("serve", flag.ContinueOnError)
		listen := flags.String("listen", "127.0.0.1:50051", "local gRPC listener")
		database := flags.String("database", "", "persistent local receipt database")
		if err := flags.Parse(args[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 || *database == "" {
			return errors.New("serve requires --database and no positional arguments")
		}
		return serve(ctx, *listen, *database, key)
	case "list", "ready":
		flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
		address := flags.String("address", "127.0.0.1:50051", "local gRPC address")
		if err := flags.Parse(args[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return fmt.Errorf("%s accepts no positional arguments", args[0])
		}
		return inspect(ctx, *address, key, args[0])
	default:
		return errors.New("use gallery-mail-sink serve, list, or ready")
	}
}

func serve(ctx context.Context, address, databasePath, key string) (result error) {
	database, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return fmt.Errorf("open local mail database: %w", err)
	}
	defer func() { result = errors.Join(result, database.Close()) }()
	database.SetMaxOpenConns(1)
	if _, err := database.ExecContext(ctx, `PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS notifications(sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, message BLOB NOT NULL);`); err != nil {
		return fmt.Errorf("initialize local mail database: %w", err)
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen for local mail: %w", err)
	}
	server := grpc.NewServer(grpc.MaxRecvMsgSize(messageLimit), grpc.UnaryInterceptor(func(ctx context.Context, request any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		values, _ := metadata.FromIncomingContext(ctx)
		auth := values.Get("authorization")
		if len(auth) != 1 || subtle.ConstantTimeCompare([]byte(auth[0]), []byte("Bearer "+key)) != 1 {
			return nil, status.Error(codes.Unauthenticated, "local mail authorization required")
		}
		return handler(ctx, request)
	}))
	grpcapi.RegisterNotificationServiceServer(server, &mailSink{database: database})
	healthService := health.NewServer()
	healthService.SetServingStatus("", grpc_health_v1.HealthCheckResponse_SERVING)
	grpc_health_v1.RegisterHealthServer(server, healthService)
	finished := make(chan error, 1)
	go func() { finished <- server.Serve(listener) }()
	slog.Info("mail sink ready", "address", listener.Addr().String())
	select {
	case err := <-finished:
		return fmt.Errorf("serve local mail: %w", err)
	case <-ctx.Done():
		server.GracefulStop()
		if err := <-finished; err != nil {
			return fmt.Errorf("stop local mail: %w", err)
		}
		return nil
	}
}

func inspect(ctx context.Context, address, key, command string) (result error) {
	connection, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("connect to local mail: %w", err)
	}
	defer func() { result = errors.Join(result, connection.Close()) }()
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+key)
	if command == "ready" {
		reply, err := grpc_health_v1.NewHealthClient(connection).Check(ctx, &grpc_health_v1.HealthCheckRequest{})
		if err != nil {
			return fmt.Errorf("check local mail: %s", status.Code(err))
		}
		if reply.Status != grpc_health_v1.HealthCheckResponse_SERVING {
			return errors.New("local mail is not ready")
		}
		return nil
	}
	reply, err := grpcapi.NewNotificationServiceClient(connection).ListNotifications(ctx, &grpcapi.ListNotificationsRequest{})
	if err != nil {
		return fmt.Errorf("list local receipts: %s", status.Code(err))
	}
	body, err := (protojson.MarshalOptions{Indent: "  ", EmitUnpopulated: true}).Marshal(reply)
	if err != nil {
		return fmt.Errorf("encode local receipt list: %w", err)
	}
	if _, err := fmt.Fprintln(os.Stdout, string(body)); err != nil {
		return fmt.Errorf("write local receipt list: %w", err)
	}
	return nil
}

func (sink *mailSink) SendNotification(ctx context.Context, input *grpcapi.NotificationRequest) (*grpcapi.NotificationResponse, error) {
	address, err := mail.ParseAddress(input.Recipient)
	if err != nil || address.Address != input.Recipient || input.NotificationType != grpcapi.NotificationType_EMAIL || input.Subject == "" || input.Message == "" || input.ScheduledTime != nil || len(input.Attachments) != 0 {
		return nil, status.Error(codes.InvalidArgument, "local mail accepts immediate email receipts with an address, subject, and message")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	reply := &grpcapi.NotificationResponse{
		NotificationId: uuid.NewString(), NotificationType: input.NotificationType, Recipient: input.Recipient,
		Subject: input.Subject, Message: input.Message, Status: grpcapi.Status_SENT, CreatedAt: now, UpdatedAt: now,
	}
	body, err := proto.Marshal(reply)
	if err != nil {
		return nil, storageError("encode receipt", err)
	}
	if _, err := sink.database.ExecContext(ctx, "INSERT INTO notifications(id,message) VALUES(?,?)", reply.NotificationId, body); err != nil {
		return nil, storageError("store receipt", err)
	}
	return reply, nil
}

func (sink *mailSink) GetNotificationStatus(ctx context.Context, input *grpcapi.GetNotificationStatusRequest) (*grpcapi.NotificationResponse, error) {
	parsed, err := uuid.Parse(input.NotificationId)
	if err != nil || parsed.String() != input.NotificationId {
		return nil, status.Error(codes.InvalidArgument, "use a canonical notification UUID")
	}
	var body []byte
	err = sink.database.QueryRowContext(ctx, "SELECT message FROM notifications WHERE id=?", input.NotificationId).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, status.Error(codes.NotFound, "local receipt not found")
	}
	if err != nil {
		return nil, storageError("read receipt", err)
	}
	reply := new(grpcapi.NotificationResponse)
	if err := proto.Unmarshal(body, reply); err != nil {
		return nil, storageError("decode receipt", err)
	}
	return reply, nil
}

func (sink *mailSink) ListNotifications(ctx context.Context, input *grpcapi.ListNotificationsRequest) (*grpcapi.ListNotificationsResponse, error) {
	for _, state := range input.Statuses {
		if _, ok := grpcapi.Status_name[int32(state)]; !ok {
			return nil, status.Error(codes.InvalidArgument, "unknown notification status")
		}
	}
	reply := &grpcapi.ListNotificationsResponse{Notifications: []*grpcapi.NotificationResponse{}}
	if len(input.Statuses) > 0 && !slices.Contains(input.Statuses, grpcapi.Status_SENT) {
		return reply, nil
	}
	rows, err := sink.database.QueryContext(ctx, "SELECT message FROM notifications ORDER BY sequence")
	if err != nil {
		return nil, storageError("list receipts", err)
	}
	defer rows.Close()
	for rows.Next() {
		var body []byte
		if err := rows.Scan(&body); err != nil {
			return nil, storageError("read receipt list", err)
		}
		message := new(grpcapi.NotificationResponse)
		if err := proto.Unmarshal(body, message); err != nil {
			return nil, storageError("decode receipt list", err)
		}
		reply.Notifications = append(reply.Notifications, message)
	}
	if err := rows.Err(); err != nil {
		return nil, storageError("finish receipt list", err)
	}
	return reply, nil
}

func storageError(operation string, err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return status.FromContextError(err).Err()
	}
	slog.Error("local mail storage failed", "operation", operation)
	return status.Error(codes.Internal, "local mail storage failed")
}
