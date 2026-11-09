package main

import (
	"strings"
	"sync"
	"time"
)

// Page sessions allow more than one ARK tab. Closing the final one triggers
// shutdown after a brief grace period, so a reload doesn't kill the controller.
type pageTracker struct {
	mu       sync.Mutex
	live     map[string]time.Time
	everSeen bool
	lastSeen time.Time
}

func newPageTracker() *pageTracker { return &pageTracker{live: make(map[string]time.Time)} }
func validPageID(id string) bool {
	if len(id) < 8 || len(id) > 100 {
		return false
	}
	for _, c := range id {
		if !strings.ContainsRune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_", c) {
			return false
		}
	}
	return true
}
func (p *pageTracker) ping(id string, now time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.everSeen = true
	p.live[id] = now
	p.lastSeen = now
}
func (p *pageTracker) close(id string, now time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.live, id)
	if p.everSeen {
		p.lastSeen = now
	}
}
func (p *pageTracker) shouldExit(now time.Time) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.everSeen {
		return false
	} // browser start failed: allow manual Ctrl+C
	// Backgrounded tabs can have throttled timers. Allow up to three minutes
	// without a heartbeat before deciding a browser process crashed.
	for id, last := range p.live {
		if now.Sub(last) > 3*time.Minute {
			delete(p.live, id)
		}
	}
	if len(p.live) > 0 {
		return false
	}
	return now.Sub(p.lastSeen) >= 5*time.Second
}
