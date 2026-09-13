package stream

import (
	"crypto/sha256"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"time"
)

func (service *Service) sessionKey(request *http.Request) ([32]byte, string, bool) {
	cookie, err := request.Cookie(service.cookie.Name)
	if err != nil {
		return [32]byte{}, "", false
	}
	bytes, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil || len(bytes) != 32 || len(cookie.Value) != 43 {
		return [32]byte{}, "", false
	}
	return sha256.Sum256([]byte(cookie.Value)), cookie.Value, true
}

func (service *Service) setSessionCookie(writer http.ResponseWriter, value string) {
	cookie := service.cookie
	cookie.Value = value
	http.SetCookie(writer, &cookie)
}

func lifetime(media *validatedPackage) time.Duration {
	return max(minimumGrantLifetime, time.Duration(media.record.DurationMS)*time.Millisecond+grantMargin)
}

func (service *Service) response(grant *playbackGrant, now time.Time) grantResponse {
	return grantResponse{GrantID: grant.id, TrackID: grant.trackID, PlaylistURL: service.config.PublicOrigin + "/music/hls/" + grant.id + "/" + grant.media.record.AssetID + "/" + playlistName, DurationMS: grant.media.record.DurationMS, ServerTime: now.UTC(), ExpiresAt: grant.expires.UTC()}
}

func readInput(writer http.ResponseWriter, request *http.Request, input any) bool {
	if request.Header.Get("Content-Type") != "application/json" {
		sendError(writer, 415, "json_required")
		return false
	}
	data, err := io.ReadAll(io.LimitReader(request.Body, jsonBodyLimit+1))
	if err != nil {
		sendError(writer, 400, "invalid_request")
		return false
	}
	if len(data) > jsonBodyLimit {
		sendError(writer, 413, "body_too_large")
		return false
	}
	if decodeTransport(data, input) != nil {
		sendError(writer, 400, "invalid_request")
		return false
	}
	return true
}

func (service *Service) createGrant(writer *responseWriter, request *http.Request) {
	var input grantInput
	if !readInput(writer, request, &input) {
		return
	}
	if !trackPattern.MatchString(input.TrackID) {
		sendError(writer, 400, "invalid_request")
		return
	}
	now := service.config.Now()
	service.mu.Lock()
	defer service.mu.Unlock()
	service.expire(now)
	if !service.admitAddress(writer, request, now) {
		return
	}
	media, exists := service.tracks[input.TrackID]
	if !exists {
		sendError(writer, 404, "not_found")
		return
	}
	writer.trackID = input.TrackID
	key, raw, valid := service.sessionKey(request)
	session, exists := service.sessions[key]
	if !valid || !exists || !now.Before(session.expires) {
		if len(service.sessions) >= service.limits.Sessions || len(service.grants) >= service.limits.Grants {
			sendError(writer, 503, "media_unavailable")
			return
		}
		newRaw, err := randomValue(32)
		if err != nil {
			sendError(writer, 503, "media_unavailable")
			return
		}
		raw = newRaw
		key = sha256.Sum256([]byte(raw))
		session = &browserSession{expires: now.Add(sessionLifetime), creation: newBucket(now, service.limits.SessionGrantBurst), media: newBucket(now, service.limits.SessionMediaBurst)}
		service.sessions[key] = session
	}
	if delay := session.creation.take(now, service.limits.SessionGrantRate, service.limits.SessionGrantBurst); delay > 0 {
		rejectRate(writer, delay)
		return
	}
	active := 0
	for _, grant := range service.grants {
		if grant.session == key && !grant.revoked && now.Before(grant.expires) {
			active++
		}
	}
	if active >= service.limits.SessionGrants {
		sendError(writer, 409, "grant_limit")
		return
	}
	if len(service.grants) >= service.limits.Grants {
		sendError(writer, 503, "media_unavailable")
		return
	}
	id, err := randomValue(16)
	if err != nil {
		sendError(writer, 503, "media_unavailable")
		return
	}
	grant := &playbackGrant{id: id, session: key, trackID: input.TrackID, media: media, created: now, expires: now.Add(lifetime(media)), renewal: newBucket(now, service.limits.GrantRenewalBurst)}
	service.grants[id] = grant
	session.expires = now.Add(sessionLifetime)
	service.setSessionCookie(writer, raw)
	writer.Header().Set("Location", grantRoute+"/"+id)
	sendJSON(writer, 201, service.response(grant, now))
}

func (service *Service) authorize(request *http.Request, id string, now time.Time) (*playbackGrant, int, string) {
	key, _, valid := service.sessionKey(request)
	session, exists := service.sessions[key]
	if !valid || !exists || !now.Before(session.expires) {
		return nil, 401, "session_required"
	}
	grant, exists := service.grants[id]
	if !exists || grant.session != key {
		return nil, 404, "not_found"
	}
	if !now.Before(grant.expires) {
		return nil, 410, "grant_expired"
	}
	if _, enabled := service.tracks[grant.trackID]; !enabled {
		return nil, 410, "track_unavailable"
	}
	return grant, 0, ""
}

func (service *Service) grantResource(writer *responseWriter, request *http.Request) {
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, grantRoute+"/"), "/")
	if len(parts) < 1 || len(parts) > 2 || len(parts[0]) != 22 || (len(parts) == 2 && parts[1] != "expiration") {
		sendError(writer, 404, "not_found")
		return
	}
	renew := len(parts) == 2
	if (renew && request.Method != http.MethodPut) || (!renew && request.Method != http.MethodGet && request.Method != http.MethodHead && request.Method != http.MethodDelete) {
		if renew {
			methodError(writer, "PUT, OPTIONS")
		} else {
			methodError(writer, "GET, HEAD, DELETE, OPTIONS")
		}
		return
	}
	if request.Method != http.MethodGet && request.Method != http.MethodHead && !service.origins[request.Header.Get("Origin")] {
		sendError(writer, 403, "origin_denied")
		return
	}
	var expiration grantExpiration
	if renew {
		if !readInput(writer, request, &expiration) {
			return
		}
	} else if data, err := io.ReadAll(io.LimitReader(request.Body, 1)); err != nil || len(data) != 0 {
		sendError(writer, 400, "invalid_request")
		return
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	now := service.config.Now()
	grant, status, code := service.authorize(request, parts[0], now)
	if status != 0 {
		sendError(writer, status, code)
		return
	}
	writer.trackID = grant.trackID
	if request.Method == http.MethodDelete {
		grant.revoked = true
		writer.WriteHeader(204)
		return
	}
	if grant.revoked {
		sendError(writer, 410, "grant_expired")
		return
	}
	if renew {
		if !expiration.ExpiresAt.After(now) || expiration.ExpiresAt.After(now.Add(lifetime(grant.media))) || expiration.ExpiresAt.Before(grant.expires) {
			sendError(writer, 400, "invalid_request")
			return
		}
		if expiration.ExpiresAt.Equal(grant.expires) {
			sendJSON(writer, 200, service.response(grant, now))
			return
		}
		if delay := grant.renewal.take(now, service.limits.GrantRenewalRate, service.limits.GrantRenewalBurst); delay > 0 {
			rejectRate(writer, delay)
			return
		}
		grant.expires = expiration.ExpiresAt.UTC()
		service.sessions[grant.session].expires = now.Add(sessionLifetime)
		_, raw, _ := service.sessionKey(request)
		service.setSessionCookie(writer, raw)
	}
	sendJSON(writer, 200, service.response(grant, now))
}

func (service *Service) mediaResource(writer *responseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		methodError(writer, "GET, HEAD, OPTIONS")
		return
	}
	parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/music/hls/"), "/")
	if len(parts) != 3 || len(parts[0]) != 22 || !assetPattern.MatchString(parts[1]) {
		sendError(writer, 404, "not_found")
		return
	}
	service.mu.Lock()
	grant, status, code := service.authorize(request, parts[0], service.config.Now())
	if status != 0 {
		service.mu.Unlock()
		sendError(writer, status, code)
		return
	}
	writer.trackID = grant.trackID
	if grant.revoked {
		service.mu.Unlock()
		sendError(writer, 410, "grant_expired")
		return
	}
	file, exists := grant.media.files[parts[2]]
	if !exists || parts[1] != grant.media.record.AssetID {
		service.mu.Unlock()
		sendError(writer, 404, "not_found")
		return
	}
	session := service.sessions[grant.session]
	if session.responses >= service.limits.SessionMediaResponses || service.responses >= service.limits.MediaResponses {
		service.mu.Unlock()
		rejectRate(writer, time.Second)
		return
	}
	if delay := session.media.take(service.config.Now(), service.limits.SessionMediaRate, service.limits.SessionMediaBurst); delay > 0 {
		service.mu.Unlock()
		rejectRate(writer, delay)
		return
	}
	session.responses++
	service.responses++
	service.mu.Unlock()
	defer func() { service.mu.Lock(); session.responses--; service.responses--; service.mu.Unlock() }()
	opened, err := service.root.Open(packagePath(parts[1], file.Name))
	if err != nil {
		sendError(writer, 503, "media_unavailable")
		return
	}
	defer opened.Close()
	info, err := opened.Stat()
	if err != nil || info.Size() != file.Bytes {
		sendError(writer, 503, "media_unavailable")
		return
	}
	contentType := "audio/mp4"
	if file.Name == playlistName {
		contentType = "application/vnd.apple.mpegurl"
	}
	writer.Header().Set("Content-Type", contentType)
	http.ServeContent(writer, request, file.Name, time.Time{}, opened)
}
