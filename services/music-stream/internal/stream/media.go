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
	"sort"
	"strconv"
	"strings"
)

const playlistName = "index.m3u8"
const initializationName = "init.mp4"
const reportName = "package.json"
const packagesDirectory = "packages"
const audioCodec = "mp4a.40.2"

var trackPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,79}$`)
var assetPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var segmentPattern = regexp.MustCompile(`^seg-[0-9]{5}\.m4s$`)

type mediaRecord struct {
	AssetID    string `json:"assetId"`
	DurationMS int64  `json:"durationMs"`
	Playlist   string `json:"playlist"`
	Codec      string `json:"codec"`
	SampleRate int    `json:"sampleRateHz"`
	Channels   int    `json:"channels"`
}

type fileRecord struct {
	Name   string `json:"name"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type packageRecord struct {
	Files       []fileRecord `json:"files"`
	DurationMS  int64        `json:"durationMs"`
	PeakBitrate int          `json:"peakBitrate"`
	Codec       string       `json:"codec"`
	SampleRate  int          `json:"sampleRateHz"`
	Channels    int          `json:"channels"`
	Preparation struct {
		Profile        string `json:"profile"`
		FFmpegVersion  string `json:"ffmpegVersion"`
		FFprobeVersion string `json:"ffprobeVersion"`
		SourceFormat   string `json:"sourceFormat"`
		SourceCodec    string `json:"sourceCodec"`
		SourceSHA256   string `json:"sourceSHA256"`
	} `json:"preparation"`
}

type validatedPackage struct {
	record mediaRecord
	files  map[string]fileRecord
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

func loadCatalog(config Config, root *os.Root) (map[string]*validatedPackage, error) {
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
	validatedIndex := make(map[string]*validatedPackage)
	for id, record := range index.Tracks {
		if !trackPattern.MatchString(id) {
			return nil, fmt.Errorf("invalid index track ID")
		}
		validated, err := validatePackage(config.MediaRoot, root, record)
		if err != nil {
			return nil, fmt.Errorf("validate index track %s: %w", id, err)
		}
		validatedIndex[id] = validated
	}
	tracks := make(map[string]*validatedPackage)
	seen := make(map[string]bool)
	for _, track := range allowlist.Tracks {
		if !trackPattern.MatchString(track.ID) || seen[track.ID] {
			return nil, fmt.Errorf("invalid or duplicate track ID")
		}
		seen[track.ID] = true
		switch track.Playback.Kind {
		case "external":
			if track.Playback.DurationMS != nil {
				return nil, fmt.Errorf("external track has HLS duration")
			}
		case "hls":
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

func packagePath(assetID, name string) string { return filepath.Join(packagesDirectory, assetID, name) }

func readPackageFile(mediaRoot string, root *os.Root, path string) ([]byte, error) {
	realPath, err := filepath.EvalSymlinks(filepath.Join(mediaRoot, path))
	if err != nil {
		return nil, fmt.Errorf("resolve package file: %w", err)
	}
	if realPath != filepath.Join(mediaRoot, path) {
		return nil, fmt.Errorf("media path contains symbolic links")
	}
	file, err := root.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open package file: %w", err)
	}
	defer file.Close()
	return readBounded(file)
}

func validatePackage(mediaRoot string, root *os.Root, record mediaRecord) (*validatedPackage, error) {
	if !assetPattern.MatchString(record.AssetID) || record.DurationMS < 1000 || record.DurationMS > 7200250 || record.Playlist != playlistName || record.Codec != audioCodec || record.SampleRate != 48000 || record.Channels != 2 {
		return nil, fmt.Errorf("invalid media record")
	}
	var metadata packageRecord
	data, err := readPackageFile(mediaRoot, root, packagePath(record.AssetID, reportName))
	if err != nil {
		return nil, fmt.Errorf("read package report: %w", err)
	}
	if err = decodeJSON(data, &metadata); err != nil {
		return nil, fmt.Errorf("parse package report: %w", err)
	}
	if metadata.DurationMS != record.DurationMS || metadata.Codec != audioCodec || metadata.SampleRate != 48000 || metadata.Channels != 2 || metadata.PeakBitrate <= 0 || len(metadata.Files) < 3 {
		return nil, fmt.Errorf("package report differs from index")
	}
	if !assetPattern.MatchString(metadata.Preparation.SourceSHA256) || metadata.Preparation.FFmpegVersion != "8.1.2" || metadata.Preparation.FFprobeVersion != "8.1.2" || metadata.Preparation.SourceFormat == "" || metadata.Preparation.SourceCodec == "" || metadata.Preparation.Profile != "aac-lc-192k-48khz-stereo-fmp4-6s" {
		return nil, fmt.Errorf("invalid preparation identity")
	}
	files := make(map[string]fileRecord)
	names := make([]string, 0, len(metadata.Files))
	for _, file := range metadata.Files {
		if file.Name != playlistName && file.Name != initializationName && !segmentPattern.MatchString(file.Name) {
			return nil, fmt.Errorf("invalid media filename")
		}
		if _, exists := files[file.Name]; exists || file.Bytes <= 0 || file.Bytes > 16*1024*1024 || !assetPattern.MatchString(file.SHA256) {
			return nil, fmt.Errorf("invalid or duplicate file record")
		}
		path := packagePath(record.AssetID, file.Name)
		bytes, err := readPackageFile(mediaRoot, root, path)
		if err != nil {
			return nil, fmt.Errorf("read media file: %w", err)
		}
		digest := sha256.Sum256(bytes)
		if int64(len(bytes)) != file.Bytes || hex.EncodeToString(digest[:]) != file.SHA256 {
			return nil, fmt.Errorf("media checksum mismatch")
		}
		files[file.Name] = file
		names = append(names, file.Name)
	}
	sort.Strings(names)
	var identity strings.Builder
	for _, name := range names {
		fmt.Fprintf(&identity, "%s\t%s\n", name, files[name].SHA256)
	}
	digest := sha256.Sum256([]byte(identity.String()))
	if hex.EncodeToString(digest[:]) != record.AssetID {
		return nil, fmt.Errorf("asset identity mismatch")
	}
	playlist, err := readPackageFile(mediaRoot, root, packagePath(record.AssetID, playlistName))
	if err != nil {
		return nil, fmt.Errorf("read playlist: %w", err)
	}
	if err = validatePlaylist(string(playlist), files, record.DurationMS); err != nil {
		return nil, err
	}
	return &validatedPackage{record: record, files: files}, nil
}

func validatePlaylist(playlist string, files map[string]fileRecord, durationMS int64) error {
	lines := strings.Split(strings.TrimSpace(playlist), "\n")
	if len(lines) < 7 || lines[0] != "#EXTM3U" || lines[len(lines)-1] != "#EXT-X-ENDLIST" {
		return fmt.Errorf("invalid completed playlist")
	}
	seen := map[string]bool{playlistName: true}
	target := float64(0)
	duration := float64(0)
	pending := false
	vod := false
	for _, line := range lines[1 : len(lines)-1] {
		switch {
		case line == "#EXT-X-PLAYLIST-TYPE:VOD":
			vod = true
		case line == `#EXT-X-MAP:URI="init.mp4"`:
			seen[initializationName] = true
		case strings.HasPrefix(line, "#EXT-X-TARGETDURATION:"):
			value, err := strconv.Atoi(strings.TrimPrefix(line, "#EXT-X-TARGETDURATION:"))
			if err != nil || value < 1 {
				return fmt.Errorf("invalid target duration")
			}
			target = float64(value)
		case strings.HasPrefix(line, "#EXTINF:"):
			value, err := strconv.ParseFloat(strings.TrimSuffix(strings.TrimPrefix(line, "#EXTINF:"), ","), 64)
			if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 || math.Round(value) > target || pending {
				return fmt.Errorf("invalid segment duration")
			}
			duration += value
			pending = true
		case segmentPattern.MatchString(line):
			if !pending || seen[line] {
				return fmt.Errorf("invalid segment reference")
			}
			seen[line] = true
			pending = false
		case line == "#EXT-X-VERSION:7" || line == "#EXT-X-MEDIA-SEQUENCE:0":
		default:
			return fmt.Errorf("unsupported playlist tag or reference")
		}
	}
	if !vod || !seen[initializationName] || pending || len(seen) != len(files) || math.Abs(duration*1000-float64(durationMS)) > 1 {
		return fmt.Errorf("playlist package mismatch")
	}
	for name := range seen {
		if _, exists := files[name]; !exists {
			return fmt.Errorf("playlist file is absent")
		}
	}
	return nil
}
