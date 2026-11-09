//go:build windows

package main

// Zusaetzliche Offline-Wissensarchive (Wikibooks, Project Gutenberg) fuer die
// bestehende Kiwix-Installation. Jedes Archiv bekommt einen eigenen
// Media-Unterordner und wird erst nach erfolgreicher Pruefung als weiteres
// Buch an den laufenden Kiwix-Server (wiki.go) angehaengt - Wikipedia selbst
// wird dabei nie veraendert, verschoben oder ueberschrieben. Heruntergeladen
// wird ausschliesslich nach einem expliziten Klick des Nutzers.
import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type libraryBookDef struct {
	ID       string // stabiler Schluessel fuer die API
	Name     string // Anzeigename
	Folder   string // Media-Unterordner (wird bei Bedarf angelegt)
	Prefix   string // Dateiname-Praefix fuer Erkennung bereits vorhandener ZIMs
	Category string // OPDS _category-Tag im Kiwix-Katalog
	Flavour  string // "" = egal/erster Treffer, sonst muss die Variante exakt passen
}

var libraryBooks = []libraryBookDef{
	{ID: "wikibooks_de", Name: "Wikibooks (Deutsch)", Folder: "Wikibooks", Prefix: "wikibooks_de", Category: "wikibooks", Flavour: "maxi"},
	{ID: "gutenberg_de", Name: "Project Gutenberg (Deutsch)", Folder: "Gutenberg", Prefix: "gutenberg_de", Category: "gutenberg", Flavour: ""},
}

type libraryBookState struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Installed  bool    `json:"installed"`
	File       string  `json:"file"`
	Bytes      int64   `json:"bytes"`
	Running    bool    `json:"running"`
	Phase      string  `json:"phase"`
	Message    string  `json:"message"`
	Percent    float64 `json:"percent"`
	TotalBytes int64   `json:"total_bytes"`
	DoneBytes  int64   `json:"done_bytes"`
}

type libraryService struct {
	mu      sync.Mutex
	media   *mediaService
	wiki    *wikiService
	state   map[string]*libraryBookState
	cancels map[string]context.CancelFunc
}

func newLibrary(media *mediaService, wiki *wikiService) *libraryService {
	ls := &libraryService{media: media, wiki: wiki, state: map[string]*libraryBookState{}, cancels: map[string]context.CancelFunc{}}
	for _, def := range libraryBooks {
		st := &libraryBookState{ID: def.ID, Name: def.Name, Phase: "bereit", Message: "Noch nicht heruntergeladen"}
		if file, size := findLibraryZIM(filepath.Join(media.rootPath(), def.Folder), def.Prefix); file != "" {
			st.Installed = true
			st.File = file
			st.Bytes = size
			st.Phase = "installiert"
			st.Message = "Bereits vorhanden"
		}
		ls.state[def.ID] = st
	}
	// Bereits vorhandene Archive sofort fuer den allerersten Kiwix-Start
	// vormerken, auch nach einem ARK-Neustart ohne erneuten Klick. Kein
	// eigener restart() hier - das wuerde mit wiki.startFromConfig() um
	// Port 8791 konkurrieren; stattdessen uebernimmt dessen einziger,
	// anschliessender Start bereits diese Buecher mit.
	ls.wiki.presetLibraryZIMs(ls.installedPaths())
	go ls.watchForNewZIMs()
	return ls
}

// watchForNewZIMs periodically rescans the Media folders so a .zim file the
// user drops in manually (e.g. a newly downloaded book outside the built-in
// libraryBooks catalog) gets served by Kiwix without requiring an ARK
// restart. setLibraryZIMs() already skips the restart when the list is
// unchanged, so this adds no unnecessary Kiwix bounces.
func (ls *libraryService) watchForNewZIMs() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		ls.wiki.setLibraryZIMs(ls.installedPaths())
	}
}

// scanMediaZIMs looks directly inside the Media root and one level into its
// subfolders for additional .zim archives, so a future book category (not
// just the hardcoded Wikibooks/Gutenberg definitions) is picked up
// automatically as long as it lives somewhere under I:\Media. skip excludes
// paths already accounted for elsewhere (Wikipedia's own ZIM, already-listed
// libraryBooks files) to avoid passing the same archive twice to kiwix-serve.
func scanMediaZIMs(mediaRoot string, skip map[string]bool) []string {
	var found []string
	scanDir := func(folder string) {
		entries, err := os.ReadDir(folder)
		if err != nil {
			return
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".zim") {
				continue
			}
			full := filepath.Join(folder, e.Name())
			if skip[full] {
				continue
			}
			found = append(found, full)
		}
	}
	scanDir(mediaRoot)
	if entries, err := os.ReadDir(mediaRoot); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				scanDir(filepath.Join(mediaRoot, e.Name()))
			}
		}
	}
	sort.Strings(found)
	return found
}

func findLibraryZIM(folder, prefix string) (path string, size int64) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return "", 0
	}
	var candidates []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := strings.ToLower(e.Name())
		if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ".zim") {
			candidates = append(candidates, e.Name())
		}
	}
	// Bei mehreren Dateien (z. B. nach manuellem Nachlegen) die zuletzt
	// datierte bevorzugen, nicht eine zufaellige Verzeichnisreihenfolge.
	sort.Sort(sort.Reverse(sort.StringSlice(candidates)))
	if len(candidates) == 0 {
		return "", 0
	}
	full := filepath.Join(folder, candidates[0])
	if st, err := os.Stat(full); err == nil {
		return full, st.Size()
	}
	return "", 0
}

func (ls *libraryService) installedPaths() []string {
	ls.mu.Lock()
	seen := map[string]bool{}
	var out []string
	for _, def := range libraryBooks {
		if st := ls.state[def.ID]; st != nil && st.Installed && st.File != "" && !seen[st.File] {
			seen[st.File] = true
			out = append(out, st.File)
		}
	}
	ls.mu.Unlock()
	skip := map[string]bool{}
	if z := ls.wiki.currentZIM(); z != "" {
		skip[z] = true
	}
	for p := range seen {
		skip[p] = true
	}
	// ARK-0 may bind an entire folder for Wikipedia (not just a single
	// .zim). Every archive in it besides the primary one Kiwix already
	// serves (already in skip via currentZIM()) is treated like any other
	// library book. Read-only: nothing here is ever moved or renamed.
	if boundFolder := installSelected("wikipedia", true); boundFolder != "" {
		for _, extra := range installZIMFiles(boundFolder) {
			if !skip[extra] && !seen[extra] {
				seen[extra] = true
				out = append(out, extra)
			}
		}
	}
	for _, extra := range scanMediaZIMs(ls.media.rootPath(), skip) {
		if !seen[extra] {
			seen[extra] = true
			out = append(out, extra)
		}
	}
	sort.Strings(out)
	return out
}

// refresh immediately re-scans every known ZIM source (downloaded library
// books, the Media folder, and any ARK-0-bound Wikipedia folder) and pushes
// the result to Kiwix. setLibraryZIMs() already skips the restart when the
// list is unchanged. Used right after a binding change through the ARK-0
// dashboard instead of waiting for the next watchForNewZIMs() tick.
func (ls *libraryService) refresh() {
	ls.wiki.setLibraryZIMs(ls.installedPaths())
}
func (ls *libraryService) snapshot() []libraryBookState {
	ls.mu.Lock()
	defer ls.mu.Unlock()
	out := make([]libraryBookState, 0, len(libraryBooks))
	for _, def := range libraryBooks {
		if st := ls.state[def.ID]; st != nil {
			out = append(out, *st)
		}
	}
	return out
}
func (ls *libraryService) update(id string, fn func(*libraryBookState)) {
	ls.mu.Lock()
	defer ls.mu.Unlock()
	if st := ls.state[id]; st != nil {
		fn(st)
	}
}
func bookDef(id string) (libraryBookDef, bool) {
	for _, def := range libraryBooks {
		if def.ID == id {
			return def, true
		}
	}
	return libraryBookDef{}, false
}

func (ls *libraryService) start(id string) error {
	def, ok := bookDef(id)
	if !ok {
		return fmt.Errorf("unbekanntes Archiv: %s", id)
	}
	ls.mu.Lock()
	st := ls.state[id]
	if st == nil {
		ls.mu.Unlock()
		return errors.New("unbekanntes Archiv")
	}
	if st.Running {
		ls.mu.Unlock()
		return errors.New("Download läuft bereits")
	}
	if st.Installed {
		ls.mu.Unlock()
		return errors.New("Bereits heruntergeladen – kein doppelter Download")
	}
	ctx, cancel := context.WithCancel(context.Background())
	ls.cancels[id] = cancel
	st.Running = true
	st.Phase = "Suche aktuelle Version"
	st.Message = "Kiwix-Katalog wird abgefragt ..."
	st.Percent = 0
	st.DoneBytes = 0
	st.TotalBytes = 0
	ls.mu.Unlock()
	go ls.run(ctx, def)
	return nil
}
func (ls *libraryService) cancel(id string) {
	ls.mu.Lock()
	c := ls.cancels[id]
	ls.mu.Unlock()
	if c != nil {
		c()
	}
}

func (ls *libraryService) run(ctx context.Context, def libraryBookDef) {
	id := def.ID
	var finalErr error
	defer func() {
		ls.mu.Lock()
		delete(ls.cancels, id)
		ls.mu.Unlock()
		ls.update(id, func(st *libraryBookState) {
			st.Running = false
			switch {
			case errors.Is(ctx.Err(), context.Canceled):
				st.Phase = "abgebrochen"
				st.Message = "Download abgebrochen"
			case finalErr != nil:
				st.Phase = "Fehler"
				st.Message = "Fehler: " + finalErr.Error()
			default:
				st.Phase = "installiert"
				st.Percent = 100
				st.Message = "Heruntergeladen, geprüft und in Kiwix eingebunden"
			}
		})
	}()

	zimURL, catLen, err := fetchCatalogZIMURL(ctx, def.Category, def.Flavour)
	if err != nil {
		finalErr = fmt.Errorf("Katalogabfrage fehlgeschlagen: %w", err)
		return
	}
	folder := filepath.Join(ls.media.rootPath(), def.Folder)
	if err = os.MkdirAll(folder, 0755); err != nil {
		finalErr = err
		return
	}
	filename := filepath.Base(zimURL)
	target := filepath.Join(folder, filename)

	ls.update(id, func(st *libraryBookState) { st.Phase = "Lade Prüfsumme"; st.Message = "Metalink wird abgefragt ..." })
	expectedLen, expectedHash, metaErr := fetchMeta4(ctx, zimURL+".meta4")
	if expectedLen <= 0 {
		expectedLen = catLen
	}

	ls.update(id, func(st *libraryBookState) {
		st.Phase = "Lade herunter"
		st.TotalBytes = expectedLen
		if metaErr != nil {
			st.Message = "Prüfsumme nicht verfügbar – Download läuft dennoch"
		} else {
			st.Message = "Download läuft ..."
		}
	})
	progress := func(done, total int64) {
		ls.update(id, func(st *libraryBookState) {
			st.DoneBytes = done
			if total > 0 {
				st.TotalBytes = total
				st.Percent = float64(done) / float64(total) * 100
			}
		})
	}
	if err = downloadResumable(ctx, zimURL, target, expectedLen, progress); err != nil {
		finalErr = err
		return
	}

	if expectedHash != "" {
		ls.update(id, func(st *libraryBookState) {
			st.Phase = "Prüfe Integrität"
			st.Message = "SHA-256 wird verglichen ..."
			st.Percent = 100
		})
		got, hashErr := sha256File(ctx, target)
		if hashErr != nil {
			finalErr = fmt.Errorf("Integritätsprüfung fehlgeschlagen: %w", hashErr)
			return
		}
		if !strings.EqualFold(got, expectedHash) {
			_ = os.Remove(target)
			finalErr = fmt.Errorf("Prüfsumme stimmt nicht überein – Datei verworfen")
			return
		}
	}

	size := expectedLen
	if st, e := os.Stat(target); e == nil {
		size = st.Size()
	}
	ls.update(id, func(st *libraryBookState) {
		st.Installed = true
		st.File = target
		st.Bytes = size
	})
	ls.wiki.setLibraryZIMs(ls.installedPaths())
}

// --- Kiwix-OPDS-Katalog -----------------------------------------------------

type opdsLink struct {
	Rel    string `xml:"rel,attr"`
	Href   string `xml:"href,attr"`
	Length int64  `xml:"length,attr"`
}
type opdsEntry struct {
	Flavour string     `xml:"flavour"`
	Links   []opdsLink `xml:"link"`
}
type opdsFeed struct {
	Entries []opdsEntry `xml:"entry"`
}

// fetchCatalogZIMURL fragt den offiziellen Kiwix-Katalog nach dem jeweils
// aktuellsten deutschen Archiv einer Kategorie/Variante und liefert die
// direkte .zim-URL (nicht die .meta4-Beschreibung) zurueck.
func fetchCatalogZIMURL(ctx context.Context, category, flavour string) (zimURL string, length int64, err error) {
	q := url.Values{}
	q.Set("lang", "deu")
	q.Set("tag", "_category:"+category)
	q.Set("count", "10")
	catalogURL := "https://library.kiwix.org/catalog/v2/entries?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, catalogURL, nil)
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("User-Agent", "ARK-Library/1.4")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", 0, fmt.Errorf("HTTP %d vom Kiwix-Katalog", resp.StatusCode)
	}
	var feed opdsFeed
	if err = xml.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&feed); err != nil {
		return "", 0, err
	}
	var fallback *opdsEntry
	for i := range feed.Entries {
		e := &feed.Entries[i]
		if flavour == "" || e.Flavour == flavour {
			for _, l := range e.Links {
				if l.Rel == "http://opds-spec.org/acquisition/open-access" && strings.HasSuffix(l.Href, ".zim.meta4") {
					return strings.TrimSuffix(l.Href, ".meta4"), l.Length, nil
				}
			}
		}
		if fallback == nil {
			fallback = e
		}
	}
	if fallback != nil {
		for _, l := range fallback.Links {
			if l.Rel == "http://opds-spec.org/acquisition/open-access" && strings.HasSuffix(l.Href, ".zim.meta4") {
				return strings.TrimSuffix(l.Href, ".meta4"), l.Length, nil
			}
		}
	}
	return "", 0, errors.New("kein passendes Archiv im Katalog gefunden")
}

// --- Metalink (.zim.meta4) --------------------------------------------------

type metalinkHash struct {
	Type  string `xml:"type,attr"`
	Value string `xml:",chardata"`
}
type metalinkFile struct {
	Size   int64          `xml:"size"`
	Hashes []metalinkHash `xml:"hash"`
}
type metalinkDoc struct {
	Files []metalinkFile `xml:"file"`
}

// fetchMeta4 is best-effort: a failure here must not block the download, it
// only means the integrity check falls back to a plain size comparison.
func fetchMeta4(ctx context.Context, metaURL string) (size int64, sha256Hex string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, metaURL, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", "ARK-Library/1.4")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, "", fmt.Errorf("HTTP %d beim Metalink", resp.StatusCode)
	}
	var doc metalinkDoc
	if err = xml.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&doc); err != nil {
		return 0, "", err
	}
	if len(doc.Files) == 0 {
		return 0, "", errors.New("Metalink ohne Dateieintrag")
	}
	f := doc.Files[0]
	for _, h := range f.Hashes {
		if strings.EqualFold(h.Type, "sha-256") {
			return f.Size, strings.TrimSpace(h.Value), nil
		}
	}
	return f.Size, "", nil
}

// --- Resumable Download ------------------------------------------------------

// downloadResumable lädt groß Dateien per HTTP-Range fortsetzbar herunter:
// ein Abbruch/Neustart setzt an der bereits geschriebenen *.part-Datei an,
// statt von vorne zu beginnen.
func downloadResumable(ctx context.Context, rawURL, target string, expectedLen int64, onProgress func(done, total int64)) error {
	part := target + ".part"
	var offset int64
	if st, err := os.Stat(part); err == nil {
		offset = st.Size()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "ARK-Library/1.4")
	if offset > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", offset))
	}
	client := &http.Client{} // kein Gesamt-Timeout: mehrere GB brauchen Zeit, der Kontext steuert den Abbruch
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var f *os.File
	switch resp.StatusCode {
	case http.StatusPartialContent:
		f, err = os.OpenFile(part, os.O_WRONLY|os.O_APPEND, 0644)
	case http.StatusOK:
		offset = 0 // Server ignoriert Range oder Datei existierte noch nicht
		f, err = os.OpenFile(part, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	default:
		return fmt.Errorf("HTTP %d beim Download", resp.StatusCode)
	}
	if err != nil {
		return err
	}
	total := expectedLen
	if resp.ContentLength > 0 {
		if resp.StatusCode == http.StatusPartialContent {
			total = offset + resp.ContentLength
		} else {
			total = resp.ContentLength
		}
	}
	written := offset
	buf := make([]byte, 1<<20)
	last := time.Now()
	for {
		if ctx.Err() != nil {
			_ = f.Close()
			return ctx.Err()
		}
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				_ = f.Close()
				return werr
			}
			written += int64(n)
			if time.Since(last) > 400*time.Millisecond {
				onProgress(written, total)
				last = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			_ = f.Close()
			return rerr
		}
	}
	onProgress(written, total)
	if err = f.Close(); err != nil {
		return err
	}
	if expectedLen > 0 && written != expectedLen {
		return fmt.Errorf("Dateigröße stimmt nicht überein: %d von %d Bytes", written, expectedLen)
	}
	return os.Rename(part, target)
}

func sha256File(ctx context.Context, path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	buf := make([]byte, 4<<20)
	for {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		n, rerr := f.Read(buf)
		if n > 0 {
			h.Write(buf[:n])
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return "", rerr
		}
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// --- HTTP-API -----------------------------------------------------------------

func (ls *libraryService) register(mux *http.ServeMux, address string) {
	mux.HandleFunc("/api/library/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET only", 405)
			return
		}
		writeJSON(w, map[string]any{"books": ls.snapshot()})
	})
	mux.HandleFunc("/api/library/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(r, address) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var payload struct {
			ID string `json:"id"`
		}
		if e := json.NewDecoder(io.LimitReader(r.Body, 512)).Decode(&payload); e != nil {
			http.Error(w, "Ungültige Anfrage", 400)
			return
		}
		if e := ls.start(payload.ID); e != nil {
			http.Error(w, e.Error(), http.StatusConflict)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		writeJSON(w, map[string]any{"books": ls.snapshot()})
	})
	mux.HandleFunc("/api/library/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(r, address) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var payload struct {
			ID string `json:"id"`
		}
		if e := json.NewDecoder(io.LimitReader(r.Body, 512)).Decode(&payload); e != nil {
			http.Error(w, "Ungültige Anfrage", 400)
			return
		}
		ls.cancel(payload.ID)
		writeJSON(w, map[string]bool{"ok": true})
	})
}
