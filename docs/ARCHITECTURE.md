# ARK UI – Architektur nach Modularizer V0.2

## Aufteilung
Die sechs JS-Dateien sind **geordnete klassische Skripte**, keine unabhängigen ES-Module.
Sie teilen weiterhin globale Variablen/Funktionen und müssen in der unten angegebenen Reihenfolge geladen werden.
Die ursprünglichen JS-Anweisungen sind byte-/zeichengetreu erhalten, abgesehen von einer
zusaetzlichen `use strict`-Direktive pro nachfolgender Datei.

| Datei | Inhalt (Orientierung) |
|---|---|
| 00-core-and-media.js | ARK-Modulregister, Medienbibliothek, Navigation der App-Kacheln |
| 10-gabriel-seraph.js | Seraph/David und die Wiedergabe, weitere Medienaktionen |
| 20-uriel-and-navigation.js | Wikipedia, Mikrofoneinstellungen und zentrale Navigation |
| 30-input-and-control.js | T9, Stream Deck, ARK VOICE, Browser-Lebenszyklus, Bibel |
| 40-michael-tools.js | Rechner, Stoppuhr, ZIP, Argos und Werkzeuge |
| 50-michael-ollama.js | Ollama-Chat und Modellstatus |
| 60-noah-lan.js | QR-Code-Anzeige und Ein/Aus-Schalter für den LAN-Fernzugriff vom Handy |

## Backend (Go) – LAN-Fernzugriff & Ordnerauswahl
| Datei | Inhalt |
|---|---|
| `lan_access.go` | Zweiter Listener auf der echten LAN-IP, Token-Pairing (bleibt über Neustarts stabil), fester Portbereich 8765–8775. Wird aus `main.go`'s `rootHandler` autorisiert. |
| `folder_browse_windows.go` | Rein lesender, generischer Ordner-Browser (`/api/folder/browse`) für die webbasierte Ordnerauswahl – ersetzt den nativen `FolderBrowserDialog` (PowerShell), der von einem Handy aus nicht bedienbar wäre. |

**Wichtige Falle (Windows-Firewall):** Windows legt beim ersten Start automatisch Firewall-Regeln pro EXE an und kann dabei einen **Block** fürs „Öffentliche" Netzwerkprofil setzen, während „Privat" auf Allow steht. Das wirkt rein zufällig/intermittierend, da Block immer Allow schlägt. Bei Verbindungsproblemen zuerst das aktive Netzwerkprofil und etwaige Block-Regeln für die ARK-EXE prüfen.

## Mobile UI (ARK Mobile, `/mobile/`)
Eigenständige Touch-Oberfläche für den bestehenden LAN/QR-Fernzugriff – kein Ersatz
der Desktop-UI, sondern eine zusätzliche Ansicht unter `/mobile/`, erreichbar über
denselben token-authentifizierten LAN-Listener wie die Desktop-UI.

| Datei/Ordner | Inhalt |
|---|---|
| `ui/mobile/index.html` | Mobile Shell: Kopfzeile, Inhaltsbereich, Fußzeile mit 3-Kachel-Karussell + Pfeil-Buttons |
| `ui/mobile/css/mobile.css` | Visuelle Basis |
| `ui/mobile/js/mobile-core.js` | Gemeinsamer Kern: Navigation, Toast, Modal. Navigation ausschließlich per Antippen (Pfeile + Karussell) – **kein** Wischen, da Wisch-Gesten mit Modulinhalten (Karte, Reader) kollidieren könnten. |
| `ui/mobile/js/mobile-downloader.js` | Mediendownloader mit client-seitiger Warteschlange; expliziter „Download starten"-Button löst die Verarbeitung aus. |
| `ui/mobile/js/mobile-player.js` | ARK Player: Audio/Video, Visualizer, Vollbild, läuft beim App-Wechsel weiter. |
| `ui/mobile/js/mobile-maps.js` | OSM-Karten über die bestehende Atlas-/Basemap-Infrastruktur, Adresssuche, Kompass/Zoom. |
| `ui/mobile/js/mobile-reader.js` | ARK Reader: Bibel, Dokumente, Wikipedia (bestehender Kiwix-Proxy). |
| `ui/mobile/js/mobile-tools.js` | Native Tools: Programm-/Spiele-Kacheln, erster Klick markiert, zweiter startet. |
| `ui/mobile/js/mobile-app.js` | Bootstrap, registriert die Module und startet die Navigation. |

## Prozess-Aufräumung beim Beenden (Windows Job Object)
`proc_cleanup_windows.go` erstellt einmalig ein Windows Job Object mit
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Jeder damit verknüpfte Kindprozess wird vom
Betriebssystem selbst sofort beendet, sobald der ARK-Prozess verschwindet – egal wie
(normales Beenden, Absturz, Task-Manager, `taskkill /F`). Aufruf direkt nach jedem
relevanten `cmd.Start()`: `attachToCleanupJob(cmd)`.

Angehängt: Kiwix-Server, ARK VOICE (PowerShell-Spracherkennung), Mikrofon-Identify-Probe,
Downloader-Jobs (yt-dlp/FFmpeg).

**Bewusst NICHT angehängt** (muss ARK überleben): Ollama (läuft wie ein normaler
lokaler Dienst weiter), der Origin-Autoswitch-Worker (bewusst `DETACHED_PROCESS`,
muss einen Versionswechsel nach ARKs Ende noch fertigstellen können), vom Nutzer
gestartete Native-Tools-Programme/Spiele, der Standardbrowser-Opener.

## ARK 0 – Installations-/Ressourcen-Dashboard (Pfadsuche + manuelle Zuweisung)
Sidebar-Tab „ARK 0" zeigt neben der Origin-Versionsverwaltung ein Dashboard für eine
feste Liste externer Komponenten (Python-Laufzeit, FFmpeg, Argos-Übersetzungsmodelle,
Whisper-Modell, Kiwix-Server, Wikipedia-ZIM, Geodaten, yt-dlp u. a.): Status
(„gefunden"/„fehlt"), eine optionale begrenzte und zeitlich limitierte Laufwerkssuche,
und eine manuelle Zuweisung über einen eigenen, rein lesenden In-App-Datei-/Ordnerbrowser
(keine nativen Windows-Dialoge, die aus einem Hintergrundprozess ohne Vordergrundfenster
hängen können).

| Datei | Inhalt |
|---|---|
| `install_resolver_windows.go` | `installSelected`/`installSelectOr` – liefert bevorzugt den nutzerbestätigten Pfad aus `ARK_STATE/install_bindings.json`, sonst den bestehenden Standard-Fallback. Lehnt sicherheitsrelevante Pfadsegmente ab, prüft Datei- vs. Ordnertyp. |
| `install_dashboard_windows.go` | `/api/install/components` (Manifest + Status), `/api/install/explore` (In-App-Browser), `/api/install/search` (begrenzte Laufwerkssuche), `/api/install/bind` (persistiert die Zuordnung atomar). |
| `install_explore_security_test.go` | Sicherheitstests für den In-App-Browser (Origin-/Methodenprüfung). |

Angebunden: Wikipedia/Kiwix, NRW-3D-Daten, Whisper-Modell, Argos-Übersetzung,
Downloader-Werkzeuge (yt-dlp/FFmpeg) – jeweils mit bestehendem Standard-Fallback,
solange keine manuelle Bindung gesetzt ist. Dieses Feature wurde zunächst in einer
isolierten Lab-Iteration entwickelt und nach Validierung in den Hauptbuild übernommen –
ein typisches Beispiel für die in [`AI_PROCESS.md`](AI_PROCESS.md) beschriebene
"freeze a working version before the next big change"-Arbeitsweise.

## Regeln fuer KI-Codeassistenten
1. Dieses Dokument lesen; dann nur die betroffene Datei und erforderliche Schnittstellen.
2. Keine Aenderung an der Ladereihenfolge und keine Umbenennung globaler Funktionen ohne Abhaengigkeitsanalyse.
3. Kein automatisches Mischen von Code-Patches ohne Konfliktpruefung.
4. Nach jeder Aenderung JS-Syntax, `go test ./...` und Windows-LAB-Funktionen pruefen.
5. Kiwix, Seraph/David, Ollama, ARK VOICE, Navigation und Josua als Regressionstests.

## Status
V0.2 trennt Dateien, aber isoliert noch keine Zustandsabhaengigkeiten.
Weitere feinere Trennungen erst nach echtem Windows-Laufzeittest.
