package stream

import "fmt"

// Limits defines the authorization and response capacity of one service instance.
type Limits struct {
	Sessions              int
	Grants                int
	SessionGrants         int
	SessionMediaResponses int
	MediaResponses        int
}

// DefaultLimits returns the current single-instance capacity defaults.
func DefaultLimits() Limits {
	return Limits{Sessions: 10000, Grants: 80000, SessionGrants: 8, SessionMediaResponses: 8, MediaResponses: 256}
}

func validateLimits(limits Limits) error {
	for _, value := range []int{limits.Sessions, limits.Grants, limits.SessionGrants, limits.SessionMediaResponses, limits.MediaResponses} {
		if value < 1 || value > 1000000 {
			return fmt.Errorf("each service limit must be between 1 and 1000000")
		}
	}
	return nil
}
