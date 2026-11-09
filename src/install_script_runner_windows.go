//go:build windows

package main

// Generic one-at-a-time PowerShell-script-backed setup helper. Mirrors the
// busy/message state machine already used by arkArgos (argos_windows.go) and
// ollamaManager's install fields, so Whisper- and Kiwix-setup behave exactly
// like the existing Argos/Ollama setup flows instead of introducing a new
// pattern. Every run is confirm-gated by the caller (an explicit POST from
// the dashboard); nothing here starts on its own.
import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
)

type scriptInstaller struct {
	mu      sync.Mutex
	busy    bool
	message string
}

func (s *scriptInstaller) state() (bool, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.busy, s.message
}

// start runs f in the background, refusing a second concurrent run. f is
// expected to call runPowerShellScript itself and return its error verbatim.
func (s *scriptInstaller) start(busyMsg, doneMsg string, f func() error) error {
	s.mu.Lock()
	if s.busy {
		s.mu.Unlock()
		return errors.New("Einrichtung läuft bereits")
	}
	s.busy = true
	s.message = busyMsg
	s.mu.Unlock()
	go func() {
		err := f()
		s.mu.Lock()
		s.busy = false
		if err != nil {
			s.message = "Fehler: " + err.Error()
		} else {
			s.message = doneMsg
		}
		s.mu.Unlock()
	}()
	return nil
}

// runPowerShellScript executes an existing .ps1 next to the ARK executable
// and returns a trimmed tail of its combined output on failure, the same
// convention registerARKArgos already uses for ARK_ARGOS_EINRICHTEN.ps1.
func runPowerShellScript(ctx context.Context, root, scriptName string, extraArgs ...string) error {
	script := filepath.Join(root, scriptName)
	if !installFile(root, scriptName) {
		return fmt.Errorf("%s fehlt im Programmordner", scriptName)
	}
	args := append([]string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script}, extraArgs...)
	cmd := exec.CommandContext(ctx, "powershell.exe", args...)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil {
		v := string(out)
		if len(v) > 600 {
			v = v[len(v)-600:]
		}
		return fmt.Errorf("%v %s", err, v)
	}
	return nil
}
