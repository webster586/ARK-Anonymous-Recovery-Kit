//go:build windows

package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Only invoked for a user-started download. ARK does not index, download,
// contact websites or install tools in the background.
type downloadState struct {
	Running    bool     `json:"running"`
	Installing bool     `json:"installing"`
	Phase      string   `json:"phase"`
	Message    string   `json:"message"`
	Percent    float64  `json:"percent"`
	Playlist   bool     `json:"playlist"`
	Item       int      `json:"item"`
	Total      int      `json:"total"`
	Lines      []string `json:"lines"`
	VideoDir   string   `json:"video_dir"`
	MP3Dir     string   `json:"mp3_dir"`
}
type downloader struct {
	mu     sync.Mutex
	state  downloadState
	cancel context.CancelFunc
	appDir string
	media  *mediaService
}
type dlRequest struct {
	URL      string `json:"url"`
	Video    bool   `json:"video"`
	MP3      bool   `json:"mp3"`
	Playlist bool   `json:"playlist"`
	VideoDir string `json:"video_dir"`
	MP3Dir   string `json:"mp3_dir"`
}

func newDownloader(m *mediaService) *downloader {
	root := m.rootPath()
	return &downloader{media: m, appDir: m.appDir, state: downloadState{Phase: "bereit", Message: "URL einfügen und Formate wählen.", Lines: []string{}, VideoDir: filepath.Join(root, "Videos"), MP3Dir: filepath.Join(root, "MP3")}}
}
func (d *downloader) snapshot() downloadState {
	d.mu.Lock()
	defer d.mu.Unlock()
	s := d.state
	s.Lines = append([]string{}, s.Lines...)
	return s
}
func (d *downloader) update(phase, msg string, percent float64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if phase != "" {
		d.state.Phase = phase
	}
	if msg != "" {
		d.state.Message = msg
	}
	if percent >= 0 {
		d.state.Percent = percent
	}
}
func (d *downloader) logLine(line string) {
	line = strings.TrimSpace(strings.ReplaceAll(line, "\r", ""))
	if line == "" {
		return
	}
	if len(line) > 350 {
		line = line[:350]
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if len(d.state.Lines) >= 18 {
		d.state.Lines = d.state.Lines[1:]
	}
	d.state.Lines = append(d.state.Lines, line)
	d.state.Message = line
	if d.state.Playlist {
		if v := downloadItem.FindStringSubmatch(line); len(v) == 3 {
			i, _ := strconv.Atoi(v[1])
			n, _ := strconv.Atoi(v[2])
			if n > 0 && i > 0 && i <= n {
				d.state.Item, d.state.Total = i, n
			}
		}
	}
	if strings.Contains(line, "[download]") {
		if v := downloadPct.FindStringSubmatch(line); len(v) == 2 {
			if p, e := strconv.ParseFloat(v[1], 64); e == nil {
				// Playlist progress is per item; show a rough total instead of
				// bouncing to 100% after the first item.
				if d.state.Playlist && d.state.Total > 0 && d.state.Item > 0 {
					d.state.Percent = (float64(d.state.Item-1)*100 + p) / float64(d.state.Total)
				} else {
					d.state.Percent = p
				}
			}
		}
	}
}

var downloadPct = regexp.MustCompile(`\b(\d{1,3}(?:\.\d+)?)%`)
var downloadItem = regexp.MustCompile(`(?i)\bDownloading (?:item|video) (\d+) of (\d+)\b`)

type dlLogger struct {
	d       *downloader
	mu      sync.Mutex
	partial string
}

func (l *dlLogger) Write(b []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.partial += string(b)
	for {
		i := strings.IndexAny(l.partial, "\r\n")
		if i < 0 {
			break
		}
		line := l.partial[:i]
		l.partial = l.partial[i+1:]
		l.d.logLine(line)
	}
	if len(l.partial) > 8000 {
		l.d.logLine(l.partial)
		l.partial = ""
	}
	return len(b), nil
}
func (l *dlLogger) flush() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.partial != "" {
		l.d.logLine(l.partial)
		l.partial = ""
	}
}

func (d *downloader) tools() (yt, ffmpeg string) {
	yt = installSelectOr("yt_dlp",false,filepath.Join(d.appDir,"tools","yt-dlp.exe"))
    ffmpeg = installSelectOr("ffmpeg",false,filepath.Join(d.appDir,"tools","ffmpeg.exe"))
    if _,err:=os.Stat(ffmpeg);err!=nil {ffmpeg=filepath.Join(d.appDir,"ffmpeg.exe")}

	if _, err := os.Stat(yt); err != nil {
		yt, _ = exec.LookPath("yt-dlp.exe")
	}
	if _, err := os.Stat(ffmpeg); err != nil {
		ffmpeg, _ = exec.LookPath("ffmpeg.exe")
	}
	return
}
func (d *downloader) available() map[string]any {
	yt, ff := d.tools()
	return map[string]any{"yt_dlp": yt != "", "ffmpeg": ff != "", "yt_path": yt, "ffmpeg_path": ff, "supported": "YouTube, TikTok, Instagram, X, Facebook, Reddit, Vimeo, Twitch, SoundCloud und weitere – abhängig von yt-dlp"}
}
func (d *downloader) register(mux *http.ServeMux, address string) {
	mux.HandleFunc("/api/downloader/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET only", 405)
			return
		}
		writeJSON(w, map[string]any{"state": d.snapshot(), "tools": d.available()})
	})
	mux.HandleFunc("/api/downloader/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var req dlRequest
		if e := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&req); e != nil {
			http.Error(w, "Ungültige Anfrage", 400)
			return
		}
		mediaURL, e := validMediaURL(req.URL)
		if e != nil {
			http.Error(w, e.Error(), 400)
			return
		}
		req.URL = mediaURL
		if !req.Playlist && requiresPlaylistOptIn(req.URL) {
			http.Error(w, "Playlist-URL erkannt. Bitte 'Gesamte Playlist herunterladen' aktivieren.", 400)
			return
		}
		if !req.Video && !req.MP3 {
			http.Error(w, "Video oder MP3 auswählen", 400)
			return
		}
		yt, ff := d.tools()
		if yt == "" || ff == "" {
			http.Error(w, "Download-Werkzeuge fehlen. Bitte zuerst yt-dlp und FFmpeg einrichten.", 409)
			return
		}
		if req.Video {
			req.VideoDir, e = destinationFolder(req.VideoDir)
			if e != nil {
				http.Error(w, e.Error(), 400)
				return
			}
			if st, er := os.Stat(req.VideoDir); er != nil || !st.IsDir() {
				http.Error(w, "Video-Zielordner nicht vorhanden: "+req.VideoDir, 400)
				return
			}
		}
		if req.MP3 {
			req.MP3Dir, e = destinationFolder(req.MP3Dir)
			if e != nil {
				http.Error(w, e.Error(), 400)
				return
			}
			if st, er := os.Stat(req.MP3Dir); er != nil || !st.IsDir() {
				http.Error(w, "MP3-Zielordner nicht vorhanden: "+req.MP3Dir, 400)
				return
			}
		}
		d.mu.Lock()
		if d.state.Running || d.state.Installing {
			d.mu.Unlock()
			http.Error(w, "Bereits ein Vorgang aktiv", 409)
			return
		}
		ctx, cancel := context.WithCancel(context.Background())
		d.cancel = cancel
		d.state.Running = true
		d.state.Phase = "Start"
		d.state.Percent = 0
		d.state.Playlist = req.Playlist
		d.state.Item = 0
		d.state.Total = 0
		d.state.Message = "Download startet ..."
		d.state.Lines = []string{}
		if req.Video {
			d.state.VideoDir = req.VideoDir
		}
		if req.MP3 {
			d.state.MP3Dir = req.MP3Dir
		}
		d.mu.Unlock()
		go d.run(ctx, yt, ff, req)
		w.WriteHeader(http.StatusAccepted)
		writeJSON(w, d.snapshot())
	})
	mux.HandleFunc("/api/downloader/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		d.mu.Lock()
		cancel := d.cancel
		d.mu.Unlock()
		if cancel != nil {
			cancel()
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/downloader/folder", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var req struct {
			Initial string `json:"initial"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 2048)).Decode(&req)
		p, e := openWinFolder(req.Initial)
		if e != nil {
			http.Error(w, e.Error(), 500)
			return
		}
		writeJSON(w, map[string]any{"path": p, "cancelled": p == ""})
	})
	mux.HandleFunc("/api/downloader/install", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		d.mu.Lock()
		if d.state.Running || d.state.Installing {
			d.mu.Unlock()
			http.Error(w, "Bereits ein Vorgang aktiv", 409)
			return
		}
		d.state.Installing = true
		d.state.Phase = "Werkzeuge einrichten"
		d.state.Percent = 0
		d.state.Lines = []string{}
		d.state.Message = "Lade yt-dlp und FFmpeg von den offiziellen Projekt-/Build-Seiten ..."
		d.mu.Unlock()
		go d.install()
		w.WriteHeader(202)
		writeJSON(w, d.snapshot())
	})
}
func (d *downloader) run(ctx context.Context, yt, ff string, req dlRequest) {
	var err error
	defer func() {
		d.mu.Lock()
		d.state.Running = false
		d.cancel = nil
		if errors.Is(ctx.Err(), context.Canceled) {
			d.state.Phase = "abgebrochen"
			d.state.Message = "Download abgebrochen"
		} else if err != nil {
			d.state.Phase = "Fehler"
			d.state.Message = "Fehler: " + err.Error()
		} else {
			d.state.Phase = "fertig"
			d.state.Percent = 100
			d.state.Message = "Download(s) abgeschlossen – im Media-Ordner verfügbar."
		}
		d.mu.Unlock()
	}()
	modes := []struct {
		enabled bool
		audio   bool
		folder  string
		name    string
	}{{req.Video, false, req.VideoDir, "Video mit Ton"}, {req.MP3, true, req.MP3Dir, "MP3"}}
	for _, m := range modes {
		if !m.enabled {
			continue
		}
		if ctx.Err() != nil {
			err = ctx.Err()
			return
		}
		d.update(m.name, "Starte "+m.name+" ...", 0)
		d.mu.Lock()
		d.state.Item, d.state.Total = 0, 0
		d.mu.Unlock()
		args := downloaderArgs(req.URL, m.folder, filepath.Dir(ff), m.audio, req.Playlist)
		cmd := exec.CommandContext(ctx, yt, args...)
		logger := &dlLogger{d: d}
		cmd.Stdout = logger
		cmd.Stderr = logger
		cmd.Dir = d.appDir
		err = cmd.Run()
		logger.flush()
		if err != nil {
			return
		}
		d.logLine(m.name + " erfolgreich gespeichert in " + m.folder)
	}
}

// Native Windows folder picker, called only by an explicit button press.
func openWinFolder(initial string) (string, error) {
	script := `Add-Type -AssemblyName System.Windows.Forms; $dlg=New-Object System.Windows.Forms.FolderBrowserDialog; $dlg.Description='ARK Download-Zielordner'; $dlg.ShowNewFolderButton=$true; if(Test-Path -LiteralPath $env:ARK_FOLDER_START -PathType Container){$dlg.SelectedPath=$env:ARK_FOLDER_START}; if($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Out.Write($dlg.SelectedPath)}`
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-STA", "-Command", script)
	cmd.Env = append(os.Environ(), "ARK_FOLDER_START="+initial)
	b, e := cmd.CombinedOutput()
	if e != nil {
		return "", fmt.Errorf("Ordnerauswahl: %s", strings.TrimSpace(string(b)))
	}
	return strings.TrimSpace(string(b)), nil
}

// Optional, user-triggered installation of the two freely distributed
// standalone executables into ARK/tools; never touches original Media files.
func (d *downloader) install() {
	var err error
	defer func() {
		d.mu.Lock()
		d.state.Installing = false
		if err != nil {
			d.state.Phase = "Fehler"
			d.state.Message = "Einrichtung fehlgeschlagen: " + err.Error()
		} else {
			d.state.Phase = "bereit"
			d.state.Percent = 100
			d.state.Message = "yt-dlp und FFmpeg eingerichtet. Download bereit."
		}
		d.mu.Unlock()
	}()
	path := filepath.Join(d.appDir, "tools")
	if err = os.MkdirAll(path, 0755); err != nil {
		return
	}
	yt, ff := d.tools()
	if yt == "" {
		d.update("yt-dlp", "Lade yt-dlp.exe ...", 0)
		target := filepath.Join(path, "yt-dlp.exe")
		if err = downloadFile("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", target, 90<<20); err != nil {
			return
		}
		yt = target
	}
	if ff == "" {
		d.update("FFmpeg", "Lade FFmpeg Essentials (ZIP) ...", 0)
		zpath := filepath.Join(path, "ffmpeg-essentials-download.zip")
		if err = downloadFile("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zpath, 280<<20); err != nil {
			return
		}
		defer os.Remove(zpath)
		d.update("FFmpeg", "Entpacke FFmpeg ...", -1)
		err = extractFFmpeg(zpath, path)
		if err != nil {
			return
		}
	}
	// The installed standalone yt-dlp and ffmpeg executables are verified with
	// their own version probes; an unsupported build must fail visibly.
	for _, probe := range [][]string{{yt, "--version"}, {filepath.Join(path, "ffmpeg.exe"), "-version"}} {
		exe := probe[0]
		if exe == "" {
			continue
		}
		if filepath.Base(exe) == "ffmpeg.exe" {
			if _, e := os.Stat(exe); e != nil {
				if _, fromPath := exec.LookPath("ffmpeg.exe"); fromPath == nil {
					continue
				}
			}
		}
		c, cc := context.WithTimeout(context.Background(), 20*time.Second)
		b, e := exec.CommandContext(c, exe, probe[1]).CombinedOutput()
		cc()
		if e != nil {
			err = fmt.Errorf("%s funktioniert nicht: %s", filepath.Base(exe), strings.TrimSpace(string(b)))
			return
		}
	}
}
func downloadFile(uri, target string, limit int64) error {
	client := &http.Client{Timeout: 9 * time.Minute, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) > 9 || r.URL.Scheme != "https" {
			return errors.New("Unsichere Weiterleitung")
		}
		return nil
	}}
	req, e := http.NewRequest("GET", uri, nil)
	if e != nil {
		return e
	}
	req.Header.Set("User-Agent", "ARK-Downloader-Setup/1.4")
	resp, e := client.Do(req)
	if e != nil {
		return e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d bei %s", resp.StatusCode, uri)
	}
	if resp.ContentLength > limit {
		return errors.New("Datei überschreitet Sicherheitslimit")
	}
	tmp := target + ".part"
	defer os.Remove(tmp)
	f, e := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if e != nil {
		return e
	}
	n, e := io.Copy(f, io.LimitReader(resp.Body, limit+1))
	ce := f.Close()
	if e != nil {
		return e
	}
	if ce != nil {
		return ce
	}
	if n > limit {
		return errors.New("Datei zu groß")
	}
	if n < 1024 {
		return errors.New("Download unvollständig")
	}
	if strings.HasSuffix(strings.ToLower(target), ".exe") {
		b := make([]byte, 2)
		f, _ := os.Open(tmp)
		if f != nil {
			_, _ = f.Read(b)
			_ = f.Close()
		}
		if string(b) != "MZ" {
			return errors.New("yt-dlp Download ist keine Windows-EXE")
		}
	}
	return os.Rename(tmp, target)
}
func extractFFmpeg(zipPath, outDir string) error {
	zr, e := zip.OpenReader(zipPath)
	if e != nil {
		return e
	}
	defer zr.Close()
	found := map[string]bool{}
	for _, file := range zr.File {
		n := strings.ToLower(strings.ReplaceAll(file.Name, "\\", "/"))
		name := ""
		for _, x := range []string{"ffmpeg.exe", "ffprobe.exe"} {
			if strings.HasSuffix(n, "/bin/"+x) {
				name = x
			}
		}
		if name == "" || found[name] {
			continue
		}
		if file.UncompressedSize64 > 180<<20 {
			return errors.New("FFmpeg-Binärdatei unerwartet groß")
		}
		src, e := file.Open()
		if e != nil {
			return e
		}
		path := filepath.Join(outDir, name)
		tmp := path + ".part"
		out, e := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0755)
		if e != nil {
			src.Close()
			return e
		}
		count, e := io.Copy(out, io.LimitReader(src, (180<<20)+1))
		ce := out.Close()
		src.Close()
		if e != nil || ce != nil || count > 180<<20 {
			os.Remove(tmp)
			return errors.New("FFmpeg entpacken fehlgeschlagen")
		}
		if e = os.Rename(tmp, path); e != nil {
			return e
		}
		found[name] = true
	}
	if !found["ffmpeg.exe"] {
		return errors.New("FFmpeg.exe nicht im offiziellen ZIP gefunden")
	}
	return nil
}
