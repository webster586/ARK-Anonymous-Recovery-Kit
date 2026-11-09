package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestMediaURL(t *testing.T) {
	good := []string{"https://youtu.be/AbC123", "https://www.instagram.com/reel/example/", "https://www.tiktok.com/@x/video/123", "https://x.com/test/status/123", "https://www.youtube.com/watch?v=111"}
	for _, u := range good {
		if _, e := validMediaURL(u); e != nil {
			t.Errorf("valid %s: %v", u, e)
		}
	}
	bad := []string{"", "file:///etc/passwd", "https://localhost/secret", "http://127.0.0.1:8765/api/status", "https://192.168.1.1/test", "https://[::1]/", "https://evil.com:5555", "https://user:secret@example.com", "javascript:alert(1)", "https://intranet/", "-o bad"}
	for _, u := range bad {
		if _, e := validMediaURL(u); e == nil {
			t.Errorf("accepted %s", u)
		}
	}
}
func TestArgs(t *testing.T) {
	for _, mp3 := range []bool{true, false} {
		a := downloaderArgs("https://youtu.be/xyz", filepath.Join("D:", "Media"), "C:\\ffmpeg", mp3, false)
		s := strings.Join(a, " ")
		if !strings.Contains(s, "--no-playlist") || !strings.HasSuffix(s, " -- https://youtu.be/xyz") {
			t.Error(s)
		}
		if mp3 && !strings.Contains(s, "--audio-format mp3") {
			t.Error(s)
		}
		if !mp3 && !strings.Contains(s, "--merge-output-format mp4") {
			t.Error(s)
		}
	}
}

func TestPlaylistOptIn(t *testing.T) {
	for _, mp3 := range []bool{false, true} {
		args := downloaderArgs("https://www.youtube.com/watch?v=xyz&list=ABC", filepath.Join("D:", "Media"), "C:\\ffmpeg", mp3, true)
		joined := strings.Join(args, " ")
		if !strings.Contains(joined, "--yes-playlist") || strings.Contains(joined, "--no-playlist") {
			t.Error(joined)
		}
		if !strings.HasSuffix(joined, " -- https://www.youtube.com/watch?v=xyz&list=ABC") {
			t.Error(joined)
		}
	}
	if !requiresPlaylistOptIn("https://www.youtube.com/playlist?list=ABC") {
		t.Error("playlist URL must need consent")
	}
	if requiresPlaylistOptIn("https://www.youtube.com/watch?v=xyz&list=ABC") {
		t.Error("watch URL is allowed as single clip")
	}
}
