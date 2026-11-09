//go:build windows

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type micCandidate struct {
	ID       int     `json:"id"`
	Name     string  `json:"name"`
	LevelDb  float64 `json:"levelDb"`
	Activity float64 `json:"activity"`
	Score    float64 `json:"score"`
	Detected bool    `json:"detected"`
}
type micIdentifyResult struct {
	Candidates []micCandidate `json:"candidates"`
	Suggested  *micCandidate  `json:"suggested"`
	Confidence string         `json:"confidence"`
	Count      int            `json:"count"`
}
type micIdentifyStatus struct {
	Running bool               `json:"running"`
	Phase   string             `json:"phase"`
	Error   string             `json:"error,omitempty"`
	Result  *micIdentifyResult `json:"result,omitempty"`
}
type micIdentifier struct {
	mu     sync.Mutex
	status micIdentifyStatus
}

func (m *micIdentifier) snapshot() micIdentifyStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}
func (m *micIdentifier) update(phase, problem string, result *micIdentifyResult, finished bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status.Phase = phase
	m.status.Error = problem
	if result != nil {
		m.status.Result = result
	}
	if finished {
		m.status.Running = false
	}
}
func (m *micIdentifier) start(parent context.Context) error {
	m.mu.Lock()
	if m.status.Running {
		m.mu.Unlock()
		return errors.New("Mikrofontest läuft bereits")
	}
	m.status = micIdentifyStatus{Running: true, Phase: "preparing"}
	m.mu.Unlock()
	go m.run(parent)
	return nil
}
func (m *micIdentifier) run(parent context.Context) {
	ctx, cancel := context.WithTimeout(parent, 25*time.Second)
	defer cancel()
	exe, err := os.Executable()
	if err != nil {
		m.update("failed", err.Error(), nil, true)
		return
	}
	dir := filepath.Dir(exe)
	script := filepath.Join(dir, "mic_identify.ps1")
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script)
	cmd.Dir = dir
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		m.update("failed", err.Error(), nil, true)
		return
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err = cmd.Start(); err != nil {
		m.update("failed", err.Error(), nil, true)
		return
	}
	var result *micIdentifyResult
	var failure string
	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			continue
		}
		switch parts[0] {
		case "STATE":
			switch parts[1] {
			case "BASELINE":
				m.update("quiet", "", nil, false)
			case "SPEAK":
				m.update("speaking", "", nil, false)
			case "ANALYZING":
				m.update("analyzing", "", nil, false)
			}
		case "ERROR":
			failure = parts[1]
		case "RESULT":
			var parsed micIdentifyResult
			if err := json.Unmarshal([]byte(parts[1]), &parsed); err == nil {
				result = &parsed
			} else {
				failure = "Auswertung konnte nicht gelesen werden"
			}
		}
	}
	if e := scanner.Err(); e != nil {
		failure = e.Error()
	}
	if e := cmd.Wait(); e != nil && failure == "" {
		failure = fmt.Sprintf("Audiotest fehlgeschlagen: %v %s", e, strings.TrimSpace(stderr.String()))
	}
	if ctx.Err() != nil {
		failure = "Audiotest abgebrochen oder Zeitlimit erreicht"
	}
	if failure != "" {
		m.update("failed", failure, nil, true)
		return
	}
	if result == nil {
		m.update("failed", "Keine Auswertung zurückgegeben", nil, true)
		return
	}
	m.update("done", "", result, true)
}
