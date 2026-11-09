//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Wikipedia is optional and isolated: no writes to the ZIM source disk.
// kiwix-serve is a separate localhost-only process, launched only when configured.
type wikiConfig struct {
	ZIM string `json:"zim"`
}
type wikiService struct {
	mu         sync.Mutex
	zim        string
	extra      []string // zusaetzliche Buecher (Wikibooks, Gutenberg, ...), siehe library.go
	cmd        *exec.Cmd
	ready      bool
	message    string
	generation uint64
}

func newWiki() *wikiService {
	w := &wikiService{message: "Noch nicht eingerichtet"}
	if b, err := os.ReadFile("wikipedia.json"); err == nil {
		var c wikiConfig
		if json.Unmarshal(b, &c) == nil {
			w.zim = c.ZIM
		}
	}
	if selected := resolveWikipediaBinding(); selected != "" {
		w.zim = selected
	}
	// Discover existing ZIM without changing its location or writing configuration.
	if w.zim == "" || !regularFile(w.zim) {
		if candidate := findWikipediaRoot(); candidate != "" {
			w.zim = candidate
			w.message = "Wikipedia im ARK-Hauptordner gefunden"
		}
	}
	return w
}

// resolveWikipediaBinding re-derives the primary Wikipedia ZIM from the
// current ARK-0 "wikipedia" binding: a bound folder (preferred, may contain
// several ZIMs - e.g. Wikipedia plus Wiktionary/Wikivoyage) or a single bound
// .zim file. It never touches wikipedia.json: that legacy single-file config
// is only ever written by the explicit setZIM() API call. Returns "" if
// nothing is bound, in which case callers fall back to findWikipediaRoot().
func resolveWikipediaBinding() string {
	if folder := installSelected("wikipedia", true); folder != "" {
		paths := installZIMFiles(folder)
		if len(paths) == 0 {
			return ""
		}
		best := paths[0]
		for _, p := range paths {
			if strings.HasPrefix(strings.ToLower(filepath.Base(p)), "wikipedia") &&
				strings.ToLower(filepath.Base(p)) > strings.ToLower(filepath.Base(best)) {
				best = p
			}
		}
		return best
	}
	if selected := installSelected("wikipedia", false); selected != "" && strings.EqualFold(filepath.Ext(selected), ".zim") {
		return selected
	}
	return ""
}

// applyWikipediaBinding re-reads the ARK-0 "wikipedia" binding and, if it now
// resolves to a different ZIM than currently configured, restarts Kiwix with
// it right away. Unlike newWiki()'s one-time startup resolution, this is
// what lets a binding made through the ARK-0 dashboard take effect without
// requiring a full ARK restart (previously the only way to apply it).
func (w *wikiService) applyWikipediaBinding() {
	selected := resolveWikipediaBinding()
	if selected == "" {
		return
	}
	w.mu.Lock()
	changed := selected != w.zim
	if changed {
		w.zim = selected
	}
	w.mu.Unlock()
	if changed {
		go w.restart()
	}
}
func regularFile(name string) bool {
	fi, err := os.Stat(name)
	return err == nil && !fi.IsDir()
}
func findWikipediaRoot() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	dir := filepath.Dir(executable)
	// Users may keep the .zim beside ARK.exe, in Media\Wikipedia (or flat in
	// Media), or at the drive root (classic layout before the Media
	// reorganisation).
	roots := []string{
		dir,
		filepath.Join(dir, "Media", "Wikipedia"),
		filepath.Join(dir, "Media"),
		filepath.Join(dir, "..", "Media", "Wikipedia"),
		filepath.Join(dir, "..", "Media"),
	}
	if volume := filepath.VolumeName(dir); volume != "" {
		sep := string(filepath.Separator)
		roots = append(roots,
			volume+sep,
			filepath.Join(volume+sep, "Media", "Wikipedia"),
			filepath.Join(volume+sep, "Media"),
		)
	}
	if media := rzMediaCurrent(); media.State == "ready" {
		roots = append([]string{filepath.Join(media.Path, "Wikipedia"), media.Path}, roots...)
	}
	for _, folder := range roots {
		entries, err := os.ReadDir(folder)
		if err != nil {
			continue
		}
		var candidates []string
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := strings.ToLower(e.Name())
			if strings.HasPrefix(name, "wikipedia") && strings.HasSuffix(name, ".zim") {
				candidates = append(candidates, filepath.Join(folder, e.Name()))
			}
		}
		// Prefer the latest dated filename rather than an arbitrary directory order.
		sort.Sort(sort.Reverse(sort.StringSlice(candidates)))
		if len(candidates) > 0 {
			return candidates[0]
		}
	}
	return ""
}
func (w *wikiService) status() any {
	w.mu.Lock()
	defer w.mu.Unlock()
	name := strings.TrimSuffix(filepath.Base(w.zim), filepath.Ext(w.zim))
	if w.zim == "" {
		name = ""
	}
	return map[string]any{"ready": w.ready, "configured": w.zim != "", "zim": w.zim, "book": name, "message": w.message, "url": "/wiki/"}
}
func (w *wikiService) isReady() bool      { w.mu.Lock(); defer w.mu.Unlock(); return w.ready }
func (w *wikiService) currentZIM() string { w.mu.Lock(); defer w.mu.Unlock(); return w.zim }
func (w *wikiService) setZIM(value string) error {
	value = strings.Trim(strings.TrimSpace(value), `"`)
	if value != "" {
		if !strings.EqualFold(filepath.Ext(value), ".zim") {
			return fmt.Errorf("Bitte eine .zim-Datei auswählen")
		}
		fi, err := os.Stat(value)
		if err != nil {
			return fmt.Errorf("ZIM nicht gefunden: %v", err)
		}
		if fi.IsDir() {
			return fmt.Errorf("Pfad verweist auf einen Ordner")
		}
	}
	bytes, err := json.MarshalIndent(wikiConfig{ZIM: value}, "", "  ")
	if err != nil {
		return err
	}
	// Save config to the ARK application folder, never to ARK-0.
	if err := os.WriteFile("wikipedia.json", append(bytes, '\n'), 0600); err != nil {
		return err
	}
	w.mu.Lock()
	w.zim = value
	w.mu.Unlock()
	go w.restart()
	return nil
}
func (w *wikiService) startFromConfig() { w.restart() }

// setLibraryZIMs replaces the set of additional books (Wikibooks, Gutenberg,
// ...) served alongside Wikipedia and restarts Kiwix so the change takes
// effect. Wikipedia's own ZIM (w.zim) is never touched by this. A no-op call
// (identical list) skips the restart so library-status polling never causes
// unnecessary Kiwix bounces.
// presetLibraryZIMs sets the additional book list without starting Kiwix.
// Used only during startup wiring (before wiki.startFromConfig() runs) so the
// very first kiwix-serve launch already includes previously-downloaded
// library books, instead of a second restart() racing the initial one for
// port 8791.
func (w *wikiService) presetLibraryZIMs(paths []string) {
	w.mu.Lock()
	w.extra = append([]string{}, paths...)
	w.mu.Unlock()
}
func (w *wikiService) setLibraryZIMs(paths []string) {
	w.mu.Lock()
	same := len(paths) == len(w.extra)
	if same {
		for i := range paths {
			if paths[i] != w.extra[i] {
				same = false
				break
			}
		}
	}
	if same {
		w.mu.Unlock()
		return
	}
	w.extra = append([]string{}, paths...)
	w.mu.Unlock()
	go w.restart()
}
func (w *wikiService) stop() {
	w.mu.Lock()
	w.generation++
	c := w.cmd
	w.cmd = nil
	w.ready = false
	w.mu.Unlock()
	if c != nil && c.Process != nil {
		_ = c.Process.Kill()
	}
}
func (w *wikiService) restart() {
	w.stop()
	w.mu.Lock()
	w.generation++
	gen := w.generation
	path := w.zim
	extra := append([]string{}, w.extra...)
	w.message = "Prüfe Kiwix und ZIM-Datei ..."
	w.mu.Unlock()
	update := func(msg string) {
		w.mu.Lock()
		if gen == w.generation {
			w.message = msg
		}
		w.mu.Unlock()
	}
	if path == "" {
		update("Wikipedia-ZIM-Pfad eintragen")
		return
	}
	if _, err := os.Stat(path); err != nil {
		update("ZIM-Datei nicht erreichbar: " + err.Error())
		return
	}
	binary := installSelectOr("kiwix_serve", false, filepath.Join("kiwix-tools", "kiwix-serve.exe"))
	if _, err := os.Stat(binary); err != nil {
		update("kiwix-serve.exe fehlt: WIKI_SETUP.bat ausführen")
		return
	}
	// Do not attach to ports used by arbitrary applications. stop() kills the
	// previous kiwix-serve asynchronously, so the OS may need a moment to
	// release the socket (e.g. when swapping in a newly downloaded library
	// book right after Wikipedia was already serving) - retry briefly before
	// giving up instead of failing on a transient race.
	var ln net.Listener
	var err error
	for i := 0; i < 20; i++ {
		ln, err = net.Listen("tcp4", "127.0.0.1:8791")
		if err == nil {
			break
		}
		time.Sleep(150 * time.Millisecond)
	}
	if err != nil {
		update("Port 8791 belegt: anderes Programm beenden")
		return
	}
	_ = ln.Close()
	// Zusaetzliche Buecher (Wikibooks, Gutenberg, ...) werden als weitere
	// ZIMPATH-Argumente angehaengt - kiwix-serve bedient beliebig viele ZIMs
	// aus einem einzigen Prozess. --skipInvalid verhindert, dass ein fehlendes
	// oder beschaedigtes Zusatzarchiv die Wikipedia-Auslieferung mit abreisst.
	args := []string{"--address=127.0.0.1", "--port=8791", "--urlRootLocation=/wiki", "--blockexternal", "--skipInvalid", path}
	for _, e := range extra {
		if st, statErr := os.Stat(e); statErr == nil && !st.IsDir() {
			args = append(args, e)
		}
	}
	cmd := exec.Command(binary, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		update("Kiwix konnte nicht gestartet werden: " + err.Error())
		return
	}
	w.mu.Lock()
	if w.generation != gen {
		w.mu.Unlock()
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
		return
	}
	w.cmd = cmd
	w.message = "Kiwix startet ..."
	w.mu.Unlock()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	client := &http.Client{Timeout: 2 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	for i := 0; i < 35; i++ {
		select {
		case err := <-done:
			w.mu.Lock()
			if w.generation == gen {
				w.ready = false
				w.message = fmt.Sprintf("Kiwix beendet: %v", err)
				w.cmd = nil
			}
			w.mu.Unlock()
			return
		default:
		}
		req, _ := http.NewRequest("GET", "http://127.0.0.1:8791/wiki/", nil)
		if res, err := client.Do(req); err == nil {
			_ = res.Body.Close()
			if res.StatusCode >= 200 && res.StatusCode < 400 {
				w.mu.Lock()
				if w.generation == gen {
					w.ready = true
					w.message = "Wikipedia bereit – offline"
				}
				w.mu.Unlock()
				// Observe unexpected exits even after successful startup.
				go func() {
					err := <-done
					w.mu.Lock()
					if w.generation == gen {
						w.ready = false
						w.cmd = nil
						w.message = fmt.Sprintf("Kiwix wurde beendet: %v", err)
					}
					w.mu.Unlock()
				}()
				return
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	update("Kiwix startete, aber die lokale Webseite antwortet nicht")
}
