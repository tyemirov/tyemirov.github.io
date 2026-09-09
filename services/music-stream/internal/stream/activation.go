package stream

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type mediaIndex struct {
	Tracks map[string]mediaRecord `json:"tracks"`
}

// ValidateIndex verifies the complete private index against publication authority and package bytes.
func ValidateIndex(mediaRoot, indexPath, allowlistPath string) error {
	rootPath, err := filepath.EvalSymlinks(mediaRoot)
	if err != nil {
		return fmt.Errorf("resolve media root: %w", err)
	}
	rootPath, err = filepath.Abs(rootPath)
	if err != nil {
		return fmt.Errorf("resolve absolute media root: %w", err)
	}
	root, err := os.OpenRoot(rootPath)
	if err != nil {
		return fmt.Errorf("open media root: %w", err)
	}
	defer root.Close()
	_, err = loadCatalog(Config{MediaRoot: rootPath, IndexPath: indexPath, AllowlistPath: allowlistPath}, root)
	return err
}

// CandidateIndex creates a content-addressed candidate from preparation receipts.
// A base index is optional for the first import and required to retain earlier tracks.
func CandidateIndex(mediaRoot, allowlistPath, basePath string, receipts []string) (string, error) {
	index := mediaIndex{Tracks: make(map[string]mediaRecord)}
	if basePath != "" {
		if err := readJSON(basePath, &index); err != nil {
			return "", fmt.Errorf("read base index: %w", err)
		}
		if index.Tracks == nil {
			return "", fmt.Errorf("base index tracks are required")
		}
	}
	if len(receipts) == 0 {
		return "", fmt.Errorf("at least one receipt is required")
	}
	seen := make(map[string]bool)
	for _, path := range receipts {
		var receipt struct {
			TrackID string `json:"trackId"`
			mediaRecord
		}
		if err := readJSON(path, &receipt); err != nil {
			return "", fmt.Errorf("read receipt %s: %w", path, err)
		}
		if !trackPattern.MatchString(receipt.TrackID) || seen[receipt.TrackID] {
			return "", fmt.Errorf("invalid or duplicate receipt track ID")
		}
		seen[receipt.TrackID] = true
		index.Tracks[receipt.TrackID] = receipt.mediaRecord
	}
	data, err := json.MarshalIndent(index, "", "  ")
	if err != nil {
		return "", fmt.Errorf("encode candidate index: %w", err)
	}
	data = append(data, '\n')
	directory := filepath.Join(mediaRoot, "indexes")
	if err = os.MkdirAll(directory, 0755); err != nil {
		return "", fmt.Errorf("create index directory: %w", err)
	}
	temporary, err := writeIndexStage(directory, data)
	if err != nil {
		return "", err
	}
	defer os.Remove(temporary)
	if err = ValidateIndex(mediaRoot, temporary, allowlistPath); err != nil {
		return "", fmt.Errorf("validate candidate: %w", err)
	}
	digest := sha256.Sum256(data)
	selected := filepath.Join(directory, hex.EncodeToString(digest[:])+".json")
	if err = os.Rename(temporary, selected); err != nil {
		return "", fmt.Errorf("publish candidate index: %w", err)
	}
	return selected, nil
}

func writeIndexStage(directory string, data []byte) (string, error) {
	file, err := os.CreateTemp(directory, ".music-index-*")
	if err != nil {
		return "", fmt.Errorf("create index staging file: %w", err)
	}
	name := file.Name()
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(name)
		return "", fmt.Errorf("write index staging file: %w", err)
	}
	return name, nil
}

// ActivateIndex validates a private snapshot, then atomically replaces the selected index.
// The operator reloads the running service after successful activation.
func ActivateIndex(mediaRoot, allowlistPath, candidatePath, selectedPath string) error {
	data, err := readBoundedFile(candidatePath)
	if err != nil {
		return fmt.Errorf("read candidate index: %w", err)
	}
	temporary, err := writeIndexStage(filepath.Dir(selectedPath), data)
	if err != nil {
		return err
	}
	defer os.Remove(temporary)
	if err = ValidateIndex(mediaRoot, temporary, allowlistPath); err != nil {
		return fmt.Errorf("validate activation: %w", err)
	}
	if err = os.Rename(temporary, selectedPath); err != nil {
		return fmt.Errorf("select media index: %w", err)
	}
	return nil
}
