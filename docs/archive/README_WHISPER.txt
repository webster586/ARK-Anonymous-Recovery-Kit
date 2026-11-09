ARK NATIVE CONTROLLER V0.3 – WHISPER OFFLINE
===========================================

WICHTIG
- Diese neue Version ist NICHT am echten Stream Deck oder mit echtem Mikrofon getestet.
- Die hardwaregetestete V0.2.1 bitte als Backup behalten.
- Das 32/64-Bit-Windows, die Elgato-Software, WLAN oder Microsoft-Konto sind zur
  Offline-Laufzeit nicht notwendig. Dieses Paket ist fuer Windows x64 gebaut.
- Fuer die erstmalige Einrichtung von Whisper ist EINMALIG Internet noetig,
  weil die offiziellen Whisper-Binaries und das Modell nicht im ZIP liegen.

INSTALLATION / TEST
1. ZIP vollstaendig in NEUEN Ordner entpacken. V0.2.1 nicht ueberschreiben.
2. VOICE_SETUP.bat ausfuehren (einmaliger Download, ca. 150 MB + Whisper Binaries).
3. Optional VOICE_SETUP_SMALL.bat ausfuehren (ca. 488 MB, genauer, langsamer).
4. Internet trennen, alte ARK Version komplett beenden, START_ARK.bat starten.
5. In der Konsole muss "ARK VOICE: lade Whisper.cpp" erscheinen.
6. Stream Deck: unten zweite Taste von links halten, Deutsch sprechen, loslassen.
7. ARK sollte Erkannten Text in die Modulsuche uebernehmen.

Whisper bevorzugt automatisch SMALL, wenn beide Modelle vorhanden sind.
Bei fehlendem Whisper-Binary oder Modell verwendet ARK weiter System.Speech.
Der alte Go-HID-Treiber, Icon-Code, Browser-Heartbeat und HID-Release sind
unveraendert. Eine erneute echte USB-Freigabepruefung ist trotzdem erforderlich.

INTERNET
Nach VOICE_SETUP sind keine Online-Dienste, Konten, Clouds oder APIs erforderlich.
Nur die einmalige Einrichtung laedt aus den offiziellen Quellen:
https://github.com/ggml-org/whisper.cpp/releases/tag/b5454
https://huggingface.co/ggerganov/whisper.cpp/tree/main
Quelle Binaries / SHA256: ScoopInstaller/Main whisper-cpp.json Version 1.9.5.

PRIVATSPHAERE
Die WAV-Datei liegt waehrend der Erkennung im TEMP-Ordner und wird danach
entfernt. Bei einem harten Absturz koennen TEMP-Dateien zurueckbleiben.

FEHLERSUCHE
- ARK Konsole zeigt "Windows-Fallback" -> Whisper Binaries oder Modell fehlen.
- waveInOpen Fehler -> Mikrofon und Windows Mikrofonfreigabe pruefen.
- Whisper Exit != 0 -> Screenshot der Konsole schicken und Modelle kontrollieren.
- PTT startet, aber kein Text -> Saetze fuer den ersten Test 2-5 Sekunden sprechen.
- Keine Laufwerksscans; ARK 0 und die Datenmigration bleiben unberuehrt.
