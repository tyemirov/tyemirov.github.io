// mail-seed sends one fixed message to the isolated local mail test service.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/tyemirov/pinguin/pkg/grpcapi"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

func main() {
	address := flag.String("address", "", "isolated test mail address")
	flag.Parse()
	if *address == "" {
		panic("mail test requires --address")
	}
	connection, err := grpc.NewClient(*address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		panic(err)
	}
	defer connection.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+os.Getenv("GALLERY_PINGUIN_API_KEY"))
	reply, err := grpcapi.NewNotificationServiceClient(connection).SendNotification(ctx, &grpcapi.NotificationRequest{
		Recipient: "buyer@example.test", Subject: "Local mail storage test", Message: "Keep this local test message across shutdown.",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(reply.NotificationId)
}
