package gallery_test

import (
	"bufio"
	"context"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/tyemirov/pinguin/pkg/grpcapi"
	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestLocalMailSinkStoresGalleryReceiptAcrossRestart(t *testing.T) {
	directory := t.TempDir()
	binary := filepath.Join(directory, "gallery-mail-sink")
	if output, err := exec.Command("go", "build", "-race", "-o", binary, "./cmd/gallery-mail-sink").CombinedOutput(); err != nil {
		t.Fatalf("build local mail executable: %v: %s", err, output)
	}
	const key = "local-mail-integration-key-never-production"
	start := func() (grpcapi.NotificationServiceClient, string, func()) {
		t.Helper()
		command := exec.Command(binary, "serve", "--listen=127.0.0.1:0", "--database="+filepath.Join(directory, "mail.db"))
		command.Env = append(os.Environ(), "GALLERY_PINGUIN_API_KEY="+key)
		stderr, err := command.StderrPipe()
		if err != nil {
			t.Fatal(err)
		}
		if err := command.Start(); err != nil {
			t.Fatal(err)
		}
		ready := make(chan string, 1)
		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				line := scanner.Text()
				if _, address, ok := strings.Cut(line, "mail sink ready address="); ok {
					ready <- address
				}
			}
			close(ready)
		}()
		var once sync.Once
		stop := func() {
			once.Do(func() {
				if err := command.Process.Signal(os.Interrupt); err != nil {
					t.Error(err)
				}
				if err := command.Wait(); err != nil {
					t.Errorf("stop local mail: %v", err)
				}
			})
		}
		t.Cleanup(stop)
		var address string
		select {
		case address = <-ready:
			if address == "" {
				t.Fatal("mail executable exited before readiness")
			}
		case <-time.After(20 * time.Second):
			t.Fatal("mail executable did not become ready")
		}
		connection, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { connection.Close() })
		return grpcapi.NewNotificationServiceClient(connection), address, stop
	}
	client, address, stop := start()
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	_, err := client.ListNotifications(ctx, &grpcapi.ListNotificationsRequest{})
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("anonymous mail read: %v", status.Code(err))
	}
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+key)
	for _, input := range []*grpcapi.NotificationRequest{
		{NotificationType: grpcapi.NotificationType_SMS, Recipient: "buyer@example.test", Message: "test"},
		{Recipient: "Display Name <buyer@example.test>", Subject: "test", Message: "test"},
		{Recipient: "buyer@example.test", Subject: "test"},
	} {
		_, err := client.SendNotification(ctx, input)
		if status.Code(err) != codes.InvalidArgument {
			t.Fatalf("invalid mail request: %v", status.Code(err))
		}
	}
	_, _, closeGallery, configuration, path, headers := paidDownloadFixture(t)
	closeGallery()
	configuration.Receipts = &gallery.ReceiptConfig{Address: address, APIKey: key}
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service)
	awaitReceiptStatus(t, server, path, headers, "sent")
	server.Close()
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	list, err := client.ListNotifications(ctx, &grpcapi.ListNotificationsRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Notifications) != 1 {
		t.Fatal("mail sink did not store one gallery receipt")
	}
	message := list.Notifications[0]
	if message.Status != grpcapi.Status_SENT || message.Recipient != "buyer@example.test" || !strings.Contains(message.Message, "USD 12.50") || !strings.Contains(message.Message, "Access code: "+strings.TrimPrefix(headers["Authorization"], "Bearer ")) {
		t.Fatal("mail sink did not preserve the submitted receipt")
	}
	stop()
	client, address, _ = start()
	stored, err := client.GetNotificationStatus(ctx, &grpcapi.GetNotificationStatusRequest{NotificationId: message.NotificationId})
	if err != nil {
		t.Fatal(err)
	}
	if !proto.Equal(stored, message) {
		t.Fatal("mail restart changed the stored receipt")
	}
	listing := exec.Command(binary, "list", "--address="+address)
	listing.Env = append(os.Environ(), "GALLERY_PINGUIN_API_KEY="+key)
	output, err := listing.Output()
	if err != nil {
		t.Fatalf("inspect local receipt: %v", err)
	}
	var inspected grpcapi.ListNotificationsResponse
	if err := protojson.Unmarshal(output, &inspected); err != nil {
		t.Fatal(err)
	}
	if !proto.Equal(list, &inspected) {
		t.Fatal("inspection CLI changed receipt contents")
	}
	filtered, err := client.ListNotifications(ctx, &grpcapi.ListNotificationsRequest{Statuses: []grpcapi.Status{grpcapi.Status_QUEUED}})
	if err != nil || len(filtered.GetNotifications()) != 0 {
		t.Fatal("mail status filter ignored stored delivery state")
	}
	_, err = client.GetNotificationStatus(ctx, &grpcapi.GetNotificationStatusRequest{NotificationId: "b1b80b2e-ff84-42d8-a7b7-2b4633dc563d"})
	if status.Code(err) != codes.NotFound {
		t.Fatalf("unknown notification: %v", status.Code(err))
	}
}
