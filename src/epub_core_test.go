package main

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func mockEPUB(t *testing.T, malicious bool) []*zip.File {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	add := func(name, content string) {
		f, e := w.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = f.Write([]byte(content)); e != nil {
			t.Fatal(e)
		}
	}
	add("META-INF/container.xml", `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
	add("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Das Testbuch</dc:title><dc:creator>Testautor</dc:creator></metadata><manifest><item id="one" href="chapters/first.xhtml" media-type="application/xhtml+xml"/><item id="two" href="chapters/second.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>`)
	body := `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Beispiel</title></head><body><h1>Erstes Kapitel</h1><p>Grüße &amp; Freude</p><img src="../img/cover.png" />`
	if malicious {
		body += `<script>alert(7)</script><iframe src="https://bad.example/"></iframe><img src="https://bad.example/track"/><p onclick="x()">Sicher</p>`
	}
	add("OEBPS/chapters/first.xhtml", body+`</body></html>`)
	add("OEBPS/chapters/second.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body><h2>Zweites Kapitel</h2><p>Mehr Text hier</p></body></html>`)
	add("OEBPS/img/cover.png", "imagebytes")
	if e := w.Close(); e != nil {
		t.Fatal(e)
	}
	r, e := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if e != nil {
		t.Fatal(e)
	}
	return r.File
}
func TestEPUBLoadReadingOrder(t *testing.T) {
	b, e := epubLoad(mockEPUB(t, false))
	if e != nil {
		t.Fatal(e)
	}
	if b.Title != "Das Testbuch" || b.Author != "Testautor" || len(b.Chapters) != 2 || b.Chapters[0].Title != "Erstes Kapitel" || b.Chapters[1].Title != "Zweites Kapitel" {
		t.Fatalf("unexpected metadata: %+v", b)
	}
	page, e := b.renderChapter(0, "Bücher/Test.epub")
	if e != nil {
		t.Fatal(e)
	}
	for _, s := range []string{`Grüße &amp; Freude`, `<h1>Erstes Kapitel</h1>`, `/api/media/epub/image?`, `B%C3%BCcher%2FTest.epub`} {
		if !strings.Contains(page, s) {
			t.Errorf("not found: %s", s)
		}
	}
	if _, e = b.renderChapter(3, "Bücher/Test.epub"); e == nil {
		t.Fatal("invalid chapter accepted")
	}
}
func TestEPUBSanitizer(t *testing.T) {
	b, e := epubLoad(mockEPUB(t, true))
	if e != nil {
		t.Fatal(e)
	}
	page, e := b.renderChapter(0, "Bücher/Test.epub")
	if e != nil {
		t.Fatal(e)
	}
	for _, s := range []string{`<script>`, `alert(7)`, `bad.example`, `<iframe`, `onclick=`} {
		if strings.Contains(page, s) {
			t.Errorf("unsafe content leaked: %s", s)
		}
	}
	if !strings.Contains(page, "Sicher") {
		t.Error("ordinary content lost")
	}
}
func TestEPUBPathProtection(t *testing.T) {
	for _, n := range []string{"../escape", "../../escape", "/absolute", "a/../../evil", `bad\\name`, "https://domain.example/file"} {
		if _, e := epubSafeEntry(n); e == nil {
			t.Errorf("path accepted %s", n)
		}
	}
	if _, e := epubResolve("OEBPS/first.xhtml", "../../bad.xhtml"); e == nil {
		t.Error("upwards path accepted")
	}
	if _, e := epubResolve("OEBPS/chaps/one.xhtml", "../images/a.png"); e != nil {
		t.Error(e)
	}
}
