ARK V0.7 SETTINGS – Folgeteststand siehe Dokumentation\Archiv\README_V0.8.txt (archiviert).

- Einstellungen direkt unter Bibel in der festen linken Seitenleiste.
- Ein einzelnes Optionenmodul mit Mikrofonquelle und Geräteaktualisierung.
- /api/audio/devices: liest die lokal verfügbaren WinMM-Eingänge (keine Aufnahme).
- /api/audio/select: schreibt audio.json im ARK-Programmordner, nur nach Nutzerklick.
- Whisper liest audio.json jeweils beim PTT-START, Mikrofonname wird bei geänderter Geräte-ID neu aufgelöst.
- Ohne Konfiguration bleibt Windows-Standardmikrofon.
- System.Speech als Fallback benutzt weiterhin den Windows-Standard.
- ARK/HID/Shutdown und Wikipedia/Bibel-Dateien bleiben unverändert.
- Tatsächlicher Windows-Audiotest steht noch aus.
