package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func runSnapshot(operation string, args []string) error {
	flags := flag.NewFlagSet(operation, flag.ContinueOnError)
	var source, destination string
	switch operation {
	case "backup":
		flags.StringVar(&source, "database", "", "Source gallery database")
		flags.StringVar(&destination, "output", "", "New backup file")
	case "restore":
		flags.StringVar(&source, "backup", "", "Source gallery backup")
		flags.StringVar(&destination, "database", "", "New restored database file")
	default:
		return errors.New("unknown database operation")
	}
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return errors.New("database operation has unexpected arguments")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	snapshot, err := gallery.CreateDatabaseSnapshot(ctx, source, destination)
	if err != nil {
		return fmt.Errorf("gallery %s: %w", operation, err)
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		Operation string `json:"operation"`
		SHA256    string `json:"sha256"`
		Bytes     int64  `json:"bytes"`
	}{operation, snapshot.SHA256, snapshot.Bytes})
}
