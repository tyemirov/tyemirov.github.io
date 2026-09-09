// Command music-media validates and selects private media indexes offline.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/tyemirov/tyemirov.github.io/services/music-stream/internal/stream"
	"os"
)

type receiptPaths []string

func (paths *receiptPaths) String() string         { return fmt.Sprint([]string(*paths)) }
func (paths *receiptPaths) Set(value string) error { *paths = append(*paths, value); return nil }

func run(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("use candidate, validate, or activate")
	}
	command := args[0]
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	root := flags.String("media-root", "", "Private media root")
	allowlist := flags.String("allowlist", "", "Publication playback allowlist")
	var index, candidate, base string
	var receipts receiptPaths
	switch command {
	case "candidate":
		flags.StringVar(&base, "base-index", "", "Prior index for retained tracks")
		flags.Var(&receipts, "receipt", "Preparation receipt; repeat for each track")
	case "validate":
		flags.StringVar(&index, "index", "", "Index to validate")
	case "activate":
		flags.StringVar(&index, "index", "", "Selected index path")
		flags.StringVar(&candidate, "candidate", "", "Candidate index path")
	default:
		return fmt.Errorf("unknown media command %q", command)
	}
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 || *root == "" || *allowlist == "" {
		return fmt.Errorf("media-root and allowlist are required; positional arguments are invalid")
	}
	switch command {
	case "candidate":
		path, err := stream.CandidateIndex(*root, *allowlist, base, receipts)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]string{"indexPath": path})
	case "validate":
		if index == "" {
			return fmt.Errorf("index is required")
		}
		if err := stream.ValidateIndex(*root, index, *allowlist); err != nil {
			return err
		}
	case "activate":
		if index == "" || candidate == "" {
			return fmt.Errorf("index and candidate are required")
		}
		if err := stream.ActivateIndex(*root, *allowlist, candidate, index); err != nil {
			return err
		}
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]string{"indexPath": index, "status": "valid"})
}
func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "music-media:", err)
		os.Exit(1)
	}
}
