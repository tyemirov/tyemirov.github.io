// Code generated from contracts/music.schema.json. DO NOT EDIT.
package stream

import "time"

type grantInput struct {
	TrackID string `json:"trackId"`
}

type grantExpiration struct {
	ExpiresAt time.Time `json:"expiresAt"`
}

type grantResponse struct {
	GrantID    string    `json:"grantId"`
	TrackID    string    `json:"trackId"`
	MediaURL   string    `json:"mediaUrl"`
	DurationMS int64     `json:"durationMs"`
	ServerTime time.Time `json:"serverTime"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

type playbackObservation struct {
	TrackID   string `json:"trackId"`
	Outcome   string `json:"outcome"`
	Action    string `json:"action"`
	Browser   string `json:"browser"`
	ElapsedMS int64  `json:"elapsedMs"`
	GrantMS   *int64 `json:"grantMs"`
	ReadyMS   *int64 `json:"readyMs"`
	TimeZone  string `json:"timeZone"`
}

var schemaNames = map[string]string{"grantInput": "grantInput", "grantExpiration": "expiration", "playbackObservation": "playbackObservation"}
