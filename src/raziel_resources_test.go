//go:build windows

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRZMediaSignature(t *testing.T) {
	root := t.TempDir()
	if rzMediaSignature(root) {
		t.Fatal("empty folder must not be media root")
	}
	if err := os.Mkdir(filepath.Join(root, "Geodaten"), 0755); err != nil {
		t.Fatal(err)
	}
	if !rzMediaSignature(root) {
		t.Fatal("Geodaten marker not detected")
	}
}
func TestRZAddUniqueCaseInsensitive(t *testing.T) {
	x := rzAddUnique(nil, `D:\Media`)
	x = rzAddUnique(x, `d:\media`)
	if len(x) != 1 {
		t.Fatalf("duplicate root: %v", x)
	}
}
func TestRZNoAccidentalRootSelection(t *testing.T) {
	root := t.TempDir()
	// A random folder without media marker is never accepted as config.
	r := rzChooseMedia(root, filepath.Join(root, "irrelevant"))
	if r.State == "ready" && r.Source == "user-config" {
		t.Fatalf("invalid config accepted: %+v", r)
	}
}

func TestRZBindingRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	b := `{"volume_serial":"AABBCCDD","relative":"..\\bad"}`
	if e := os.WriteFile(filepath.Join(root, "raziel_bindings.json"), []byte(b), 0600); e != nil {
		t.Fatal(e)
	}
	if got := rzFindBoundMedia(root); got != "" {
		t.Fatalf("unsafe binding accepted: %q", got)
	}
}
func TestRZResourceCandidatesEmptyOnMissingResources(t *testing.T) {
	// Discoveries must report missing instead of inventing paths.
	if got := rzResourceCandidates("no_such_resource_kind"); len(got) != 0 {
		t.Fatalf("unexpected candidates %v", got)
	}
}
func TestRZContainedPath(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "Geodaten", "tiles.pmtiles")
	if !rzIsContained(root, inside) {
		t.Fatal("nested path rejected")
	}
	if rzIsContained(root, filepath.Join(root, "..", "other")) {
		t.Fatal("path escape accepted")
	}
}

// Integration wiring: Atlas must consume Raziel's resource candidate resolver
// instead of waiting for an unambiguous overall Media root.
func TestRZAtlasUsesResourceCandidates(t *testing.T) {
	data, err := os.ReadFile("atlas.go")
	if err != nil {
		t.Skip("source unavailable during packaged test")
	}
	if !strings.Contains(string(data), `rzResourceCandidates("natural_earth")`) {
		t.Fatal("Atlas must use Raziel natural_earth candidates")
	}
}
