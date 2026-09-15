package stream

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"regexp"
)

const audioRoute = "/music/audio/"
const audioCodec = "mp4a.40.2"

var trackPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,79}$`)
var assetPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var audioFilePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,79}\.m4a$`)

type mediaRecord struct {
	AssetID    string `json:"assetId"`
	DurationMS int64  `json:"durationMs"`
	File       string `json:"file"`
	Bytes      int64  `json:"bytes"`
	Codec      string `json:"codec"`
	SampleRate int    `json:"sampleRateHz"`
	Channels   int    `json:"channels"`
}

type validatedMedia struct {
	record mediaRecord
}

type playbackRecord struct {
	Kind       string `json:"kind"`
	DurationMS *int64 `json:"durationMs,omitempty"`
}

func decodeJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("unexpected trailing JSON")
	}
	return nil
}

const maximumFileBytes = 16 * 1024 * 1024

func readBounded(reader io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, maximumFileBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maximumFileBytes {
		return nil, fmt.Errorf("file exceeds size limit")
	}
	return data, nil
}

func readBoundedFile(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return readBounded(file)
}

func readJSON(path string, target any) error {
	data, err := readBoundedFile(path)
	if err != nil {
		return fmt.Errorf("read JSON: %w", err)
	}
	if err := decodeJSON(data, target); err != nil {
		return fmt.Errorf("parse JSON: %w", err)
	}
	return nil
}

func loadCatalog(config Config, root *os.Root) (map[string]*validatedMedia, error) {
	var index mediaIndex
	if err := readJSON(config.IndexPath, &index); err != nil {
		return nil, fmt.Errorf("load media index: %w", err)
	}
	var allowlist struct {
		Tracks []struct {
			ID       string         `json:"id"`
			Playback playbackRecord `json:"playback"`
		} `json:"tracks"`
	}
	if err := readJSON(config.AllowlistPath, &allowlist); err != nil {
		return nil, fmt.Errorf("load playback allowlist: %w", err)
	}
	if index.Tracks == nil || allowlist.Tracks == nil {
		return nil, fmt.Errorf("catalog tracks are required")
	}
	validatedIndex := make(map[string]*validatedMedia)
	for id, record := range index.Tracks {
		if !trackPattern.MatchString(id) {
			return nil, fmt.Errorf("invalid index track ID")
		}
		validated, err := validateMedia(config.MediaRoot, root, record)
		if err != nil {
			return nil, fmt.Errorf("validate index track %s: %w", id, err)
		}
		validatedIndex[id] = validated
	}
	tracks := make(map[string]*validatedMedia)
	seen := make(map[string]bool)
	for _, track := range allowlist.Tracks {
		if !trackPattern.MatchString(track.ID) || seen[track.ID] {
			return nil, fmt.Errorf("invalid or duplicate track ID")
		}
		seen[track.ID] = true
		switch track.Playback.Kind {
		case "external":
			if track.Playback.DurationMS != nil {
				return nil, fmt.Errorf("external track has audio duration")
			}
		case "file":
			record, exists := index.Tracks[track.ID]
			if !exists || track.Playback.DurationMS == nil || math.Abs(float64(*track.Playback.DurationMS-record.DurationMS)) > 250 {
				return nil, fmt.Errorf("track %s has no matching media duration", track.ID)
			}
			tracks[track.ID] = validatedIndex[track.ID]
		default:
			return nil, fmt.Errorf("unknown playback kind")
		}
	}
	return tracks, nil
}

func validateMedia(mediaRoot string, root *os.Root, record mediaRecord) (*validatedMedia, error) {
	if !assetPattern.MatchString(record.AssetID) || !audioFilePattern.MatchString(record.File) || record.Bytes <= 0 || record.Bytes > 256*1024*1024 || record.DurationMS < 1000 || record.DurationMS > 7200250 || record.Codec != audioCodec || record.SampleRate != 48000 || record.Channels != 2 {
		return nil, fmt.Errorf("invalid media record")
	}
	path := filepath.Join(mediaRoot, record.File)
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, fmt.Errorf("resolve audio file: %w", err)
	}
	if realPath != path {
		return nil, fmt.Errorf("media path contains symbolic links")
	}
	file, err := root.Open(record.File)
	if err != nil {
		return nil, fmt.Errorf("open audio file: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("read audio size: %w", err)
	}
	if info.Size() != record.Bytes {
		return nil, fmt.Errorf("media size mismatch")
	}
	hash := sha256.New()
	count, err := io.Copy(hash, io.LimitReader(file, record.Bytes+1))
	if err != nil {
		return nil, fmt.Errorf("read audio bytes: %w", err)
	}
	if count != record.Bytes || hex.EncodeToString(hash.Sum(nil)) != record.AssetID {
		return nil, fmt.Errorf("media checksum mismatch")
	}
	return &validatedMedia{record: record}, nil
}
