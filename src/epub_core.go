package main

// EPUB 2/3 read-only reader. Standard-library parsing, no installed codecs or
// remote services. XHTML is rendered via a restrictive allow-list; original
// EPUBs and their book assets are NEVER extracted to disk.
import (
	"archive/zip"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"net/url"
	"path"
	"strconv"
	"strings"
)

const maxEpubZipEntries = 6000
const maxEpubPackage = 2 << 20
const maxEpubChapter = 8 << 20
const maxEpubImage = 16 << 20

type epubItem struct {
	ID         string `xml:"id,attr"`
	Href       string `xml:"href,attr"`
	MediaType  string `xml:"media-type,attr"`
	Properties string `xml:"properties,attr"`
}
type epubRef struct {
	IDRef  string `xml:"idref,attr"`
	Linear string `xml:"linear,attr"`
}
type epubPackage struct {
	Title   string     `xml:"metadata>title"`
	Creator string     `xml:"metadata>creator"`
	Items   []epubItem `xml:"manifest>item"`
	Spine   []epubRef  `xml:"spine>itemref"`
}
type epubContainer struct {
	Rootfiles []struct {
		FullPath string `xml:"full-path,attr"`
	} `xml:"rootfiles>rootfile"`
}
type epubChapter struct {
	File  string `json:"-"`
	Title string `json:"title"`
}
type epubBook struct {
	Title    string        `json:"title"`
	Author   string        `json:"author"`
	Chapters []epubChapter `json:"chapters"`
	archive  map[string]*zip.File
}

func epubSafeEntry(raw string) (string, error) {
	if raw == "" || strings.HasPrefix(raw, "/") || strings.Contains(raw, "\\") || strings.ContainsRune(raw, 0) {
		return "", errors.New("Ungültiger EPUB-Pfad")
	}
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "" || u.Host != "" || u.RawQuery != "" {
		return "", errors.New("Externe EPUB-Adresse gesperrt")
	}
	p, e := url.PathUnescape(u.EscapedPath())
	if e != nil || strings.Contains(p, "\\") {
		return "", errors.New("Ungültige EPUB-Kodierung")
	}
	if p == ".." || strings.HasPrefix(p, "../") || strings.Contains(p, "/../") || strings.HasPrefix(p, "/") {
		return "", errors.New("EPUB-Pfad außerhalb des Buches")
	}
	clean := path.Clean(p)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", errors.New("Ungültiger EPUB-Inhalt")
	}
	return clean, nil
}
func epubResolve(base, href string) (string, error) {
	if strings.HasPrefix(href, "#") || strings.HasPrefix(href, "/") || strings.Contains(href, "\\") || strings.ContainsRune(href, 0) {
		return "", errors.New("Ungültiger EPUB-Link")
	}
	u, e := url.Parse(href)
	if e != nil || u.Scheme != "" || u.Host != "" || u.RawQuery != "" {
		return "", errors.New("Externer EPUB-Link")
	}
	rel, e := url.PathUnescape(u.EscapedPath())
	if e != nil || rel == "" || strings.HasPrefix(rel, "/") || strings.Contains(rel, "\\") {
		return "", errors.New("Ungültiger EPUB-Linkpfad")
	}
	target := path.Clean(path.Join(path.Dir(base), rel))
	if target == ".." || strings.HasPrefix(target, "../") || strings.HasPrefix(target, "/") {
		return "", errors.New("Pfad außerhalb des EPUB")
	}
	return target, nil
}
func epubRead(f *zip.File, limit uint64) ([]byte, error) {
	if f == nil || f.UncompressedSize64 > limit {
		return nil, errors.New("EPUB-Ressource zu groß oder fehlt")
	}
	reader, e := f.Open()
	if e != nil {
		return nil, e
	}
	defer reader.Close()
	raw, e := io.ReadAll(io.LimitReader(reader, int64(limit)+1))
	if e != nil || uint64(len(raw)) > limit {
		return nil, errors.New("EPUB-Ressource über Größenlimit")
	}
	return raw, nil
}
func epubLoad(files []*zip.File) (*epubBook, error) {
	if len(files) > maxEpubZipEntries {
		return nil, errors.New("EPUB enthält zu viele Dateien")
	}
	entries := make(map[string]*zip.File, len(files))
	for _, f := range files {
		if f.FileInfo().IsDir() {
			continue
		}
		key, e := epubSafeEntry(f.Name)
		if e != nil {
			continue
		}
		if _, exists := entries[key]; exists {
			return nil, errors.New("Doppelte EPUB-Dateipfade")
		}
		entries[key] = f
	}
	containerBytes, e := epubRead(entries["META-INF/container.xml"], maxEpubPackage)
	if e != nil {
		return nil, fmt.Errorf("EPUB container.xml: %w", e)
	}
	var container epubContainer
	if e = xml.Unmarshal(containerBytes, &container); e != nil || len(container.Rootfiles) == 0 {
		return nil, errors.New("EPUB container.xml ungültig")
	}
	opf, e := epubSafeEntry(container.Rootfiles[0].FullPath)
	if e != nil {
		return nil, e
	}
	opfBytes, e := epubRead(entries[opf], maxEpubPackage)
	if e != nil {
		return nil, fmt.Errorf("EPUB Paket: %w", e)
	}
	var pkg epubPackage
	if e = xml.Unmarshal(opfBytes, &pkg); e != nil {
		return nil, fmt.Errorf("EPUB OPF: %w", e)
	}
	m := make(map[string]epubItem, len(pkg.Items))
	for _, item := range pkg.Items {
		if item.ID != "" {
			m[item.ID] = item
		}
	}
	result := &epubBook{Title: strings.TrimSpace(pkg.Title), Author: strings.TrimSpace(pkg.Creator), archive: entries}
	for _, sp := range pkg.Spine {
		item, ok := m[sp.IDRef]
		if !ok || strings.EqualFold(sp.Linear, "no") {
			continue
		}
		typ := strings.ToLower(item.MediaType)
		if typ != "application/xhtml+xml" && typ != "text/html" {
			continue
		}
		filename, e := epubResolve(opf, item.Href)
		if e != nil || entries[filename] == nil {
			continue
		}
		// Title defaults to sequential position; an XHTML heading is used if present.
		title := "Kapitel " + strconv.Itoa(len(result.Chapters)+1)
		result.Chapters = append(result.Chapters, epubChapter{filename, title})
		if len(result.Chapters) >= 2000 {
			return nil, errors.New("Zu viele EPUB-Kapitel")
		}
	}
	if len(result.Chapters) == 0 {
		return nil, errors.New("EPUB enthält keine lesbaren XHTML-Kapitel")
	}
	if result.Title == "" {
		result.Title = "EPUB-Buch"
	}
	for i := range result.Chapters {
		raw, e := epubRead(entries[result.Chapters[i].File], maxEpubChapter)
		if e != nil {
			continue
		}
		title := epubFirstHeading(raw)
		if title != "" {
			r := []rune(strings.TrimSpace(title))
			if len(r) > 100 {
				r = r[:100]
			}
			result.Chapters[i].Title = string(r)
		}
	}
	return result, nil
}
func epubFirstHeading(source []byte) string {
	d := xml.NewDecoder(strings.NewReader(string(source)))
	d.Strict = false
	d.Entity = xml.HTMLEntity
	inside := false
	var out strings.Builder
	for {
		t, e := d.Token()
		if e != nil {
			break
		}
		switch x := t.(type) {
		case xml.StartElement:
			name := strings.ToLower(x.Name.Local)
			if name == "h1" || name == "h2" || name == "h3" {
				inside = true
			}
		case xml.EndElement:
			name := strings.ToLower(x.Name.Local)
			if inside && (name == "h1" || name == "h2" || name == "h3") {
				return strings.Join(strings.Fields(out.String()), " ")
			}
		case xml.CharData:
			if inside {
				out.Write(x)
				if out.Len() > 200 {
					return strings.Join(strings.Fields(out.String()), " ")
				}
			}
		}
	}
	return ""
}

var epubAllowed = map[string]bool{
	"p": true, "div": true, "span": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"strong": true, "b": true, "em": true, "i": true, "u": true, "s": true, "del": true, "small": true, "sup": true, "sub": true,
	"br": true, "hr": true, "blockquote": true, "pre": true, "code": true, "ul": true, "ol": true, "li": true,
	"table": true, "thead": true, "tbody": true, "tr": true, "th": true, "td": true, "figure": true, "figcaption": true, "img": true,
	"section": true, "article": true, "aside": true, "dl": true, "dt": true, "dd": true, "a": true,
}
var epubDropped = map[string]bool{"head": true, "script": true, "style": true, "iframe": true, "object": true, "embed": true, "svg": true, "math": true, "form": true, "input": true, "textarea": true, "audio": true, "video": true, "noscript": true}

func (b *epubBook) renderChapter(index int, bookPath string) (string, error) {
	if index < 0 || index >= len(b.Chapters) {
		return "", errors.New("Kapitel außerhalb des Buches")
	}
	page := b.Chapters[index].File
	raw, e := epubRead(b.archive[page], maxEpubChapter)
	if e != nil {
		return "", e
	}
	d := xml.NewDecoder(strings.NewReader(string(raw)))
	d.Strict = false
	d.Entity = xml.HTMLEntity
	var out strings.Builder
	out.Grow(len(raw))
	out.WriteString(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:dark;--book-size:19px}*{box-sizing:border-box}html{background:#0b1717;color:#e1e7db;font-family:Georgia,'Times New Roman',serif;font-size:var(--book-size)}body{max-width:900px;margin:0 auto;padding:28px 34px 20vh;line-height:1.82;overflow-wrap:anywhere}h1,h2,h3{color:#efd4a1;line-height:1.3;margin-top:1.7em}p{text-align:justify;margin:.75em 0}img{display:block;max-width:100%;height:auto;margin:1.1em auto}blockquote{border-left:3px solid #719983;padding-left:1.5em;color:#d2d4c5}table{max-width:100%;border-collapse:collapse}td,th{border:1px solid #4c6761;padding:7px}pre{white-space:pre-wrap}a{color:#a6e6c7;text-decoration:underline}hr{border:0;border-top:1px solid #45655b}@media(max-width:600px){body{padding:16px 19px 20vh}p{text-align:left}}
</style></head><body><main class="ark-book-text">`)
	depth := 0
	stack := []string{}
	skip := 0
	for {
		t, e := d.Token()
		if e == io.EOF {
			break
		}
		if e != nil {
			return "", fmt.Errorf("Ungültiges XHTML: %w", e)
		}
		switch x := t.(type) {
		case xml.StartElement:
			tag := strings.ToLower(x.Name.Local)
			if skip > 0 {
				skip++
				continue
			}
			if epubDropped[tag] {
				skip = 1
				continue
			}
			if !epubAllowed[tag] {
				stack = append(stack, "")
				depth++
				continue
			}
			if tag == "img" {
				src := ""
				for _, a := range x.Attr {
					if strings.ToLower(a.Name.Local) == "src" {
						src = a.Value
					}
				}
				filename, e := epubResolve(page, src)
				if e == nil && b.archive[filename] != nil && isEpubImage(filename) {
					u := "/api/media/epub/image?path=" + url.QueryEscape(bookPath) + "&entry=" + url.QueryEscape(filename)
					out.WriteString(`<img alt="Illustration" loading="lazy" src="` + html.EscapeString(u) + `">`)
				}
				stack = append(stack, "")
				depth++
				continue
			}
			if tag == "br" || tag == "hr" {
				out.WriteString("<" + tag + ">")
				stack = append(stack, "")
				depth++
				continue
			}
			// Links keep their appearance, but never execute active EPUB content.
			if tag == "a" {
				out.WriteString("<span class=\"book-link\">")
				stack = append(stack, "span")
			} else {
				out.WriteString("<" + tag + ">")
				stack = append(stack, tag)
			}
			depth++
		case xml.EndElement:
			if skip > 0 {
				skip--
				continue
			}
			if depth > 0 {
				depth--
				end := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				if end != "" {
					out.WriteString("</" + end + ">")
				}
			}
		case xml.CharData:
			if skip == 0 {
				out.WriteString(html.EscapeString(string(x)))
			}
		}
		if out.Len() > int(maxEpubChapter)*5 {
			return "", errors.New("EPUB-Kapitel zu umfangreich")
		}
	}
	for i := len(stack) - 1; i >= 0; i-- {
		if stack[i] != "" {
			out.WriteString("</" + stack[i] + ">")
		}
	}
	out.WriteString(`</main></body></html>`)
	return out.String(), nil
}
func isEpubImage(filename string) bool {
	ext := strings.ToLower(path.Ext(filename))
	return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".gif" || ext == ".webp"
}
