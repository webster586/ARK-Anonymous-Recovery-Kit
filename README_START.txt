ARK V0.3 WHISPER: Bitte zuerst README_WHISPER.txt lesen und einmal VOICE_SETUP.bat ausfuehren.
Die funktionierende V0.2.1 separat sichern.

ARK NATIVE CONTROLLER V0.2.1 + ARK VOICE
=======================================
Windows 10/11 x64 | Stream Deck 2019 (20GAA9902)

NEU: Push-to-Talk auf der unteren Tastenreihe, zweite Taste von links.
Das Mikrofon-Icon wird mit PTT beschriftet. Gedrueckt halten = sprechen,
loslassen = Spracherkennung beenden. Der erkannte Text wird in das lokale
Suchfeld der ARK-Tabletoberflaeche eingetragen.

SO STARTEN
1. Das funktionierende V0.1.1 als Backup aufbewahren.
2. ZIP vollstaendig in einen NEUEN Ordner entpacken.
3. Alte ARK-Controller-Fenster beenden (Strg+C).
4. Elgato-Software beenden (auch im Infobereich).
5. START_ARK.bat starten. Stream Deck anschliessen.
6. Warten, bis in der ARK-Oberflaeche "ARK VOICE // Bereit" steht.
7. PTT am Stream Deck gedrueckt halten, kurz sprechen, loslassen.

ALTERNATIVE EINGABE
F8 gedrueckt halten (Tastatur) oder den PTT-Knopf am Tablet gedrueckt halten.
Pfeiltasten / OK / Zurueck / Vor funktionieren wie bisher.

WICHTIGE TECHNISCHE VORAUSSETZUNG
Diese erste Windows-Voice-Version verwendet den bereits lokal installierten
.NET/System.Speech-Erkenner von Windows und das STANDARD-Mikrofon des PCs.
Sie verwendet KEINEN Clouddienst, KEINE Internetverbindung und zeichnet
keine Audiodateien auf der Festplatte auf.

Die Windows-Installation MUSS einen passenden lokalen deutschen
Spracherkenner (de-DE oder de-AT / de-CH) enthalten. Nicht alle Windows-PCs
haben einen solchen Erkenner bereits installiert. Das ist derzeit der
wesentliche Unterschied zu einer spaeteren ARK-Voice-Version mit eigenem
Whisper-Modell. Dieses Paket enthaelt KEIN Whisper-Modell.

Wenn ARK VOICE einen Fehler meldet, VOICE_DIAGNOSE.bat starten und die
Ausgabe mitteilen. Falls Windows keine deutsche Engine hat, ist das keine
Fehlfunktion der Stream-Deck-Ansteuerung. ARK bleibt per Tastatur und
Stream Deck ohne Voice weiter nutzbar.

WEITERE HINWEISE
- Nach der Ansage kurz Pause machen, dann PTT loslassen, damit der
  Windows-Erkenner den letzten Ausdruck abschliessen kann.
- Solange die Inhalte von ARK noch nicht verknuepft sind, durchsucht das
  Suchfeld NUR die derzeitigen UI-Modulbeschreibungen.
- Der 13-Zoll-Tablet-Entwurf bleibt im Quer- und Hochformat bedienbar.
- Die Steuerung von V0.1.1 wird mit minimalen Aenderungen weiterverwendet.
- Andere Stream-Deck-Modelle sind noch nicht hardwaregetestet.
- Keine Installationsrechte oder Elgato-Software fuer die USB-HID-Steuerung
  deines bestaetigten Modells notwendig.

DATEIEN
ARK_Controller_Windows_x64.exe  Hauptprogramm (Windows x64)
voice_windows.ps1              Lokaler Spracherkennungshelfer, muss neben EXE liegen
START_ARK.bat                  Programmstart
VOICE_DIAGNOSE.bat             Lokale Spracherkenner anzeigen
ARK_DIAGNOSE.bat               Stream-Deck-HID Diagnose
config.json                   Tastenbelegung / Icons (neu: voice)
icons/                        Eigene Icons
src/                          Quellcode und UI, inklusive neuer voice.go

TESTSTATUS
- Windows x64 Go-EXE kompiliert.
- UI im Chromium mit simulierten Voice-Events und Navigation geprueft.
- 1280x800, 1920x1200 und 800x1280 ohne horizontales Ueberlaufen.
- Windows-USB-HID + Mikrofonerkennung in dieser neuen Version NICHT live
  geprueft, da hier kein Windows-Rechner/Stream Deck/Mikrofon angebunden ist.
- V0.1.1 wurde vom Nutzer am Stream Deck bereits erfolgreich getestet.

BUILD
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ARK_Controller_Windows_x64.exe .


NEU IN V0.2.1 – STREAM DECK BEIM SCHLIESSEN FREIGEBEN
- ARK im Browser-Tab schliessen: bei der letzten offenen ARK-Seite wird der
  Controller nach ca. 5 Sekunden automatisch beendet. Seiten-Reload bleibt
  durch eine kurze Schonfrist moeglich.
- ARK BEENDEN in der oberen Leiste: kontrollierter Ausstieg.
- Strg+C oder Schliessen des Konsolenfensters: ebenfalls Beenden versuchen.
- Vor der HID-Freigabe wird das offizielle Stream-Deck-Startlogo angezeigt.
- Nach Beenden kann ein anderes Programm das Stream Deck nutzen.
- Bei Browser-Absturz ohne Schliessen-Signal: Notfall-Freigabe nach ca. 3 Min.
- Harte Prozessbeendigung kann die Logo-Ruecksetzung verhindern; Windows
  gibt den HID-Handle beim Prozessende trotzdem frei.
- Dieses Update aendert weder den PTT-Platz (unten, zweite Taste von links)
  noch die Navigation oder die Offline-Voice-Komponente.
