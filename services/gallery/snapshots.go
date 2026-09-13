package gallery

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
)

// Snapshot identifies a complete, validated standalone gallery database.
type Snapshot struct {
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

// CreateDatabaseSnapshot copies a consistent database snapshot into a new path.
// The source is opened read-only. An existing destination is never replaced.
func CreateDatabaseSnapshot(ctx context.Context, source, destination string) (result Snapshot, resultErr error) {
	if source == "" || destination == "" {
		return result, errors.New("snapshot gallery: source and destination paths are required")
	}
	input, err := filepath.Abs(source)
	if err != nil {
		return result, fmt.Errorf("resolve snapshot source: %w", err)
	}
	output, err := filepath.Abs(destination)
	if err != nil {
		return result, fmt.Errorf("resolve snapshot destination: %w", err)
	}
	for _, path := range []string{output, output + "-wal", output + "-shm", output + "-journal"} {
		file, err := os.Open(path)
		if err == nil {
			return result, errors.Join(fmt.Errorf("snapshot destination already exists: %s", path), file.Close())
		}
		if !errors.Is(err, os.ErrNotExist) {
			return result, fmt.Errorf("check snapshot destination: %w", err)
		}
	}
	uri := url.URL{Scheme: "file", Path: input, RawQuery: "mode=ro"}
	database, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return result, fmt.Errorf("open snapshot source: %w", err)
	}
	database.SetMaxOpenConns(1)
	defer func() { resultErr = errors.Join(resultErr, database.Close()) }()
	if _, err := database.ExecContext(ctx, `PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;`); err != nil {
		return result, fmt.Errorf("configure snapshot source: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(output), ".gallery-snapshot-*.db")
	if err != nil {
		return result, fmt.Errorf("create pending snapshot: %w", err)
	}
	temporaryPath := temporary.Name()
	defer func() {
		resultErr = errors.Join(resultErr, temporary.Close())
		for _, path := range []string{temporaryPath, temporaryPath + "-wal", temporaryPath + "-shm", temporaryPath + "-journal"} {
			if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
				resultErr = errors.Join(resultErr, fmt.Errorf("remove pending snapshot: %w", err))
			}
		}
	}()
	if _, err := database.ExecContext(ctx, `VACUUM INTO ?`, temporaryPath); err != nil {
		return result, fmt.Errorf("create gallery snapshot: %w", err)
	}
	if err := validateSnapshot(ctx, temporaryPath); err != nil {
		return result, fmt.Errorf("validate gallery snapshot: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return result, fmt.Errorf("sync gallery snapshot: %w", err)
	}
	digest := sha256.New()
	result.Bytes, err = io.Copy(digest, temporary)
	if err != nil {
		return result, fmt.Errorf("checksum gallery snapshot: %w", err)
	}
	result.SHA256 = hex.EncodeToString(digest.Sum(nil))
	if err := ctx.Err(); err != nil {
		return Snapshot{}, fmt.Errorf("finish gallery snapshot: %w", err)
	}
	// A hard link exposes the complete file atomically and rejects an existing path.
	if err := os.Link(temporaryPath, output); err != nil {
		return Snapshot{}, fmt.Errorf("publish gallery snapshot: %w", err)
	}
	directory, err := os.Open(filepath.Dir(output))
	if err != nil {
		return result, fmt.Errorf("open snapshot directory: %w", err)
	}
	if err := errors.Join(directory.Sync(), directory.Close()); err != nil {
		return result, fmt.Errorf("sync snapshot directory: %w", err)
	}
	return result, nil
}

type schemaObject struct{ kind, name, table, sql string }

func readDatabaseSchema(ctx context.Context, database *sql.DB) ([]schemaObject, error) {
	rows, err := database.QueryContext(ctx, `SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name`)
	if err != nil {
		return nil, fmt.Errorf("read database schema: %w", err)
	}
	defer rows.Close()
	objects := []schemaObject{}
	for rows.Next() {
		var object schemaObject
		if err := rows.Scan(&object.kind, &object.name, &object.table, &object.sql); err != nil {
			return nil, fmt.Errorf("read schema object: %w", err)
		}
		object.sql = strings.Join(strings.Fields(object.sql), " ")
		objects = append(objects, object)
	}
	return objects, rows.Err()
}
func validateSnapshot(ctx context.Context, path string) (resultErr error) {
	uri := url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro"}
	database, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return err
	}
	database.SetMaxOpenConns(1)
	defer func() { resultErr = errors.Join(resultErr, database.Close()) }()
	var integrity string
	if err := database.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&integrity); err != nil {
		return fmt.Errorf("check snapshot integrity: %w", err)
	}
	if integrity != "ok" {
		return errors.New("snapshot failed the SQLite integrity check")
	}
	rows, err := database.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return fmt.Errorf("check snapshot references: %w", err)
	}
	broken := rows.Next()
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return fmt.Errorf("read snapshot references: %w", err)
	}
	if broken {
		return errors.New("snapshot contains invalid foreign keys")
	}
	expected, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return err
	}
	expected.SetMaxOpenConns(1)
	defer func() { resultErr = errors.Join(resultErr, expected.Close()) }()
	if _, err := expected.ExecContext(ctx, gallerySchema); err != nil {
		return fmt.Errorf("construct current gallery schema: %w", err)
	}
	current, err := readDatabaseSchema(ctx, expected)
	if err != nil {
		return err
	}
	actual, err := readDatabaseSchema(ctx, database)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(current, actual) {
		return errors.New("snapshot schema differs from the current gallery schema")
	}
	return nil
}
