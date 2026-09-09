package stream

// Counters contains aggregate operational data for private process logs.
type Counters struct {
	Requests         uint64 `json:"requests"`
	RejectedRequests uint64 `json:"rejectedRequests"`
	Bytes            uint64 `json:"bytes"`
	ActiveSessions   int    `json:"activeSessions"`
	ActiveGrants     int    `json:"activeGrants"`
	MediaResponses   int    `json:"mediaResponses"`
	TrackedAddresses int    `json:"trackedAddresses"`
}

// Snapshot returns bounded aggregate data without listener or package identities.
func (service *Service) Snapshot() Counters {
	service.mu.Lock()
	defer service.mu.Unlock()
	counters := service.counters
	now := service.config.Now()
	for _, session := range service.sessions {
		if now.Before(session.expires) {
			counters.ActiveSessions++
		}
	}
	for _, grant := range service.grants {
		session := service.sessions[grant.session]
		if !grant.revoked && now.Before(grant.expires) && session != nil && now.Before(session.expires) && service.tracks[grant.trackID] != nil {
			counters.ActiveGrants++
		}
	}
	counters.MediaResponses = service.responses
	counters.TrackedAddresses = len(service.addresses)
	return counters
}
