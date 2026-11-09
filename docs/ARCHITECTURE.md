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

## Regeln fuer KI-Codeassistenten
1. Dieses Dokument lesen; dann nur die betroffene Datei und erforderliche Schnittstellen.
2. Keine Aenderung an der Ladereihenfolge und keine Umbenennung globaler Funktionen ohne Abhaengigkeitsanalyse.
3. Kein automatisches Mischen von Code-Patches ohne Konfliktpruefung.
4. Nach jeder Aenderung JS-Syntax, `go test ./...` und Windows-LAB-Funktionen pruefen.
5. Kiwix, Seraph/David, Ollama, ARK VOICE, Navigation und Josua als Regressionstests.

## Status
V0.2 trennt Dateien, aber isoliert noch keine Zustandsabhaengigkeiten.
Weitere feinere Trennungen erst nach echtem Windows-Laufzeittest.
