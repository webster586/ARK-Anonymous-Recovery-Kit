package main

import (
	"testing"
	"time"
)

func TestPageTrackerLifecycle(t *testing.T) {
	p := newPageTracker()
	t0 := time.Unix(1000, 0)
	if p.shouldExit(t0) {
		t.Fatal("Must not stop before browser connects")
	}
	p.ping("page-first-1", t0)
	if p.shouldExit(t0.Add(10 * time.Second)) {
		t.Fatal("Active page should keep ARK alive")
	}
	p.close("page-first-1", t0.Add(time.Second))
	if p.shouldExit(t0.Add(4 * time.Second)) {
		t.Fatal("Grace period needed for reload")
	}
	p.ping("page-second-2", t0.Add(4*time.Second))
	if p.shouldExit(t0.Add(6 * time.Second)) {
		t.Fatal("Reloaded page should keep ARK alive")
	}
	p.close("page-second-2", t0.Add(7*time.Second))
	if !p.shouldExit(t0.Add(12 * time.Second)) {
		t.Fatal("Last tab closed should stop ARK")
	}
}
func TestMultipleTabsAndCrash(t *testing.T) {
	p := newPageTracker()
	t0 := time.Unix(2000, 0)
	p.ping("page-first-1", t0)
	p.ping("page-second-2", t0)
	p.close("page-first-1", t0)
	if p.shouldExit(t0.Add(10 * time.Second)) {
		t.Fatal("Other tab still open")
	}
	if p.shouldExit(t0.Add(2 * time.Minute)) {
		t.Fatal("Background tab should survive timer throttle")
	}
	if !p.shouldExit(t0.Add(3*time.Minute + 6*time.Second)) {
		t.Fatal("Crashed browser should eventually release ARK")
	}
}
func TestPageIDs(t *testing.T) {
	for _, id := range []string{"short", "contains space 1", "../evil/page", ""} {
		if validPageID(id) {
			t.Fatalf("accepted invalid id %q", id)
		}
	}
	if !validPageID("c1fd3e4aa281-1234") {
		t.Fatal("valid ID rejected")
	}
}
