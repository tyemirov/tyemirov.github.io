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
	GrantID     string    `json:"grantId"`
	TrackID     string    `json:"trackId"`
	PlaylistURL string    `json:"playlistUrl"`
	DurationMS  int64     `json:"durationMs"`
	ServerTime  time.Time `json:"serverTime"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

var schemaNames = map[string]string{"grantInput": "grantInput", "grantExpiration": "expiration"}
