package gallery_test

import (
	"context"
	"net"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tyemirov/pinguin/pkg/grpcapi"
	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

type receiptSink struct {
	grpcapi.UnimplementedNotificationServiceServer
	mutex       sync.Mutex
	unavailable bool
	state       grpcapi.Status
	submissions int
	queries     int
	messages    []*grpcapi.NotificationRequest
	changed     chan struct{}
	blocked     chan struct{}
}

func newReceiptSink(t *testing.T) (*receiptSink, *gallery.ReceiptConfig) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	sink := &receiptSink{state: grpcapi.Status_QUEUED, changed: make(chan struct{}, 100)}
	server := grpc.NewServer()
	grpcapi.RegisterNotificationServiceServer(server, sink)
	go func() {
		if err := server.Serve(listener); err != nil {
			t.Error(err)
		}
	}()
	t.Cleanup(server.Stop)
	return sink, &gallery.ReceiptConfig{Address: listener.Addr().String(), APIKey: "local-receipt-test-key"}
}
func (sink *receiptSink) authenticate(ctx context.Context) error {
	values, _ := metadata.FromIncomingContext(ctx)
	if auth := values.Get("authorization"); len(auth) != 1 || auth[0] != "Bearer local-receipt-test-key" {
		return status.Error(codes.Unauthenticated, "test authentication required")
	}
	return nil
}
func (sink *receiptSink) SendNotification(ctx context.Context, input *grpcapi.NotificationRequest) (*grpcapi.NotificationResponse, error) {
	if sink.blocked != nil {
		close(sink.blocked)
		<-ctx.Done()
		return nil, status.FromContextError(ctx.Err()).Err()
	}
	if err := sink.authenticate(ctx); err != nil {
		return nil, err
	}
	sink.mutex.Lock()
	defer sink.mutex.Unlock()
	sink.submissions++
	sink.changed <- struct{}{}
	if sink.unavailable {
		return nil, status.Error(codes.Unavailable, "local mail service unavailable")
	}
	sink.messages = append(sink.messages, proto.Clone(input).(*grpcapi.NotificationRequest))
	return &grpcapi.NotificationResponse{NotificationId: "receipt-message", NotificationType: input.NotificationType, Recipient: input.Recipient, Subject: input.Subject, Message: input.Message, Status: sink.state}, nil
}
func (sink *receiptSink) GetNotificationStatus(ctx context.Context, input *grpcapi.GetNotificationStatusRequest) (*grpcapi.NotificationResponse, error) {
	if err := sink.authenticate(ctx); err != nil {
		return nil, err
	}
	sink.mutex.Lock()
	defer sink.mutex.Unlock()
	sink.queries++
	sink.changed <- struct{}{}
	if sink.unavailable {
		return nil, status.Error(codes.Unavailable, "local mail status unavailable")
	}
	if input.NotificationId != "receipt-message" || len(sink.messages) == 0 {
		return nil, status.Error(codes.NotFound, "unknown receipt")
	}
	message := sink.messages[len(sink.messages)-1]
	return &grpcapi.NotificationResponse{NotificationId: input.NotificationId, NotificationType: message.NotificationType, Recipient: message.Recipient, Subject: message.Subject, Message: message.Message, Status: sink.state}, nil
}
func awaitReceiptCalls(t *testing.T, sink *receiptSink, sends, queries int) {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	for {
		sink.mutex.Lock()
		ready := sink.submissions >= sends && sink.queries >= queries
		sink.mutex.Unlock()
		if ready {
			return
		}
		select {
		case <-sink.changed:
		case <-deadline.C:
			t.Fatal("receipt worker did not contact the local mail service")
		}
	}
}

func TestReceiptRetriesPersistAcrossRestartWithoutCancelingPurchase(t *testing.T) {
	_, _, closeService, configuration, path, headers := paidDownloadFixture(t)
	closeService()
	sink, delivery := newReceiptSink(t)
	sink.unavailable = true
	var clock atomic.Int64
	initial := time.Now()
	clock.Store(initial.UnixNano())
	configuration.Now = func() time.Time { return time.Unix(0, clock.Load()) }
	configuration.ReconcileInterval = 10 * time.Millisecond
	configuration.Receipts = delivery
	start := func() (*httptest.Server, func()) {
		t.Helper()
		service, err := gallery.New(configuration)
		if err != nil {
			t.Fatal(err)
		}
		server := httptest.NewServer(service)
		var once sync.Once
		stop := func() {
			once.Do(func() {
				server.Close()
				if err := service.Close(); err != nil {
					t.Error(err)
				}
			})
		}
		t.Cleanup(stop)
		return server, stop
	}
	server, stop := start()
	awaitReceiptCalls(t, sink, 1, 0)
	res, payload := request(t, server, "GET", path, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["status"] != "complete" {
		t.Fatal("email failure canceled the paid purchase")
	}
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 201)
	stop()
	sink.mutex.Lock()
	sink.unavailable = false
	sink.mutex.Unlock()
	server, stop = start()
	// A restart does not discard the persisted retry deadline.
	time.Sleep(30 * time.Millisecond)
	sink.mutex.Lock()
	count := sink.submissions
	sink.mutex.Unlock()
	if count != 1 {
		t.Fatal("restart retried before the stored deadline")
	}
	clock.Store(initial.Add(time.Minute).UnixNano())
	awaitReceiptCalls(t, sink, 2, 0)
	awaitReceiptStatus(t, server, path, headers, "queued")
	stop()
	sink.mutex.Lock()
	if len(sink.messages) != 1 {
		t.Fatal("receipt was not accepted once")
	}
	message := proto.Clone(sink.messages[0]).(*grpcapi.NotificationRequest)
	sink.unavailable = true
	sink.mutex.Unlock()
	id := strings.TrimPrefix(path, "/gallery/orders/")
	secret := strings.TrimPrefix(headers["Authorization"], "Bearer ")
	if message.NotificationType != grpcapi.NotificationType_EMAIL || message.Recipient != "buyer@example.test" || !strings.Contains(message.Subject, id) || !strings.Contains(message.Message, "USD 12.50") || !strings.Contains(message.Message, "Test license for one buyer.") || !strings.Contains(message.Message, configuration.AllowedOrigin+"/gallery/order/?order="+id) || !strings.Contains(message.Message, "Access code: "+secret) {
		t.Fatal("receipt lacks the purchased terms or private order access")
	}
	for _, word := range strings.Fields(message.Message) {
		if strings.HasPrefix(word, "https://") && strings.Contains(word, secret) {
			t.Fatal("receipt put its access secret in a URL")
		}
	}
	clock.Store(initial.Add(2 * time.Minute).UnixNano())
	server, stop = start()
	awaitReceiptCalls(t, sink, 2, 1)
	stop()
	sink.mutex.Lock()
	sink.unavailable = false
	sink.state = grpcapi.Status_SENT
	sink.mutex.Unlock()
	clock.Store(initial.Add(3 * time.Minute).UnixNano())
	server, stop = start()
	awaitReceiptCalls(t, sink, 2, 2)
	awaitReceiptStatus(t, server, path, headers, "sent")
	stop()
	clock.Store(initial.Add(4 * time.Minute).UnixNano())
	_, stop = start()
	defer stop()
	time.Sleep(30 * time.Millisecond)
	sink.mutex.Lock()
	defer sink.mutex.Unlock()
	if sink.submissions != 2 || sink.queries != 2 {
		t.Fatal("delivered receipt was submitted or queried again after restart")
	}
}

func awaitReceiptStatus(t *testing.T, server *httptest.Server, path string, headers map[string]string, expected string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		res, payload := request(t, server, "GET", path, nil, nil, headers)
		requireStatus(t, res, payload, 200)
		receipt, ok := decodeObject(t, payload)["receipt"].(map[string]any)
		if ok && receipt["status"] == expected {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("buyer order did not report receipt status %s", expected)
}

func TestReceiptsRequireVerifiedPaymentAndIgnoreDuplicateEvents(t *testing.T) {
	_, _, closeService, configuration := saleFixture(t)
	closeService()
	sink, delivery := newReceiptSink(t)
	sink.state = grpcapi.Status_SENT
	configuration.Receipts = delivery
	configuration.ReconcileInterval = 10 * time.Millisecond
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service)
	defer service.Close()
	defer server.Close()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("3e19b11b-bdcb-4f0c-a3e5-1b629e385cb4"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	invalid := decodeObject(t, completedEvent(t, "RECEIPT-WRONG-AMOUNT"))
	invalid["resource"].(map[string]any)["amount"].(map[string]any)["value"] = "0.01"
	event := encodeObject(t, invalid)
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 422)
	res, payload = request(t, server, "GET", path, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["receipt"] != nil {
		t.Fatal("unverified payment created a receipt")
	}
	for _, id := range []string{"RECEIPT-VERIFIED", "RECEIPT-VERIFIED", "RECEIPT-DUPLICATE"} {
		event = completedEvent(t, id)
		res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
		requireStatus(t, res, payload, 204)
		awaitReceiptStatus(t, server, path, headers, "sent")
	}
	sink.mutex.Lock()
	defer sink.mutex.Unlock()
	if sink.submissions != 1 || len(sink.messages) != 1 {
		t.Fatal("duplicate payment events created another receipt")
	}
}

func TestReceiptRetriesAfterPinguinReportsTerminalDeliveryFailure(t *testing.T) {
	_, _, closeService, configuration, path, headers := paidDownloadFixture(t)
	closeService()
	sink, delivery := newReceiptSink(t)
	var clock atomic.Int64
	initial := time.Now()
	clock.Store(initial.UnixNano())
	configuration.Now = func() time.Time { return time.Unix(0, clock.Load()) }
	configuration.Receipts = delivery
	configuration.ReconcileInterval = 10 * time.Millisecond
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service)
	defer service.Close()
	defer server.Close()
	awaitReceiptStatus(t, server, path, headers, "queued")
	sink.mutex.Lock()
	sink.state = grpcapi.Status_UNKNOWN
	sink.mutex.Unlock()
	clock.Store(initial.Add(time.Minute).UnixNano())
	awaitReceiptStatus(t, server, path, headers, "attention")
	sink.mutex.Lock()
	sink.state = grpcapi.Status_ERRORED
	sink.mutex.Unlock()
	clock.Store(initial.Add(2 * time.Minute).UnixNano())
	awaitReceiptStatus(t, server, path, headers, "pending")
	sink.mutex.Lock()
	sink.state = grpcapi.Status_SENT
	sink.mutex.Unlock()
	clock.Store(initial.Add(3 * time.Minute).UnixNano())
	awaitReceiptStatus(t, server, path, headers, "sent")
	sink.mutex.Lock()
	defer sink.mutex.Unlock()
	if sink.submissions != 2 || sink.queries != 2 || len(sink.messages) != 2 {
		t.Fatal("terminal email failure did not retry as a new notification")
	}
	if !proto.Equal(sink.messages[0], sink.messages[1]) {
		t.Fatal("receipt retry changed the purchased terms or order access")
	}
}

func TestReceiptShutdownCancelsBlockedDeliveryWithoutLockingOrders(t *testing.T) {
	_, _, closeService, configuration, path, headers := paidDownloadFixture(t)
	closeService()
	sink, delivery := newReceiptSink(t)
	sink.blocked = make(chan struct{})
	configuration.Receipts = delivery
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service)
	select {
	case <-sink.blocked:
	case <-time.After(3 * time.Second):
		server.Close()
		service.Close()
		t.Fatal("receipt request did not start")
	}
	res, payload := request(t, server, "GET", path, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	server.Close()
	stopped := make(chan error, 1)
	go func() { stopped <- service.Close() }()
	select {
	case err := <-stopped:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("shutdown did not cancel the blocked receipt request")
	}
}
