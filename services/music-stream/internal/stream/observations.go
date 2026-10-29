package stream

import "net/http"

func (service *Service) createPlaybackObservation(writer *responseWriter, request *http.Request) {
	var input playbackObservation
	if !readInput(writer, request, &input) {
		return
	}
	if (input.GrantMS != nil && *input.GrantMS > input.ElapsedMS) ||
		(input.ReadyMS != nil && *input.ReadyMS > input.ElapsedMS) ||
		(input.GrantMS != nil && input.ReadyMS != nil && *input.GrantMS > *input.ReadyMS) {
		sendError(writer, 400, "invalid_request")
		return
	}
	key, _, valid := service.sessionKey(request)
	service.mu.Lock()
	session, exists := service.sessions[key]
	authenticated := valid && exists && service.config.Now().Before(session.expires)
	_, known := service.tracks[input.TrackID]
	service.mu.Unlock()
	if !authenticated {
		sendError(writer, 401, "session_required")
		return
	}
	if !known {
		sendError(writer, 404, "not_found")
		return
	}
	writer.trackID = input.TrackID
	service.config.Logger.Info("music_playback_observation", "trackId", input.TrackID, "outcome", input.Outcome, "action", input.Action, "browser", input.Browser, "timeZone", input.TimeZone, "elapsedMs", input.ElapsedMS, "grantMs", input.GrantMS, "readyMs", input.ReadyMS)
	writer.WriteHeader(http.StatusNoContent)
}
