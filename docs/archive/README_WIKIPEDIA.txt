ARK V0.4 – Wikipedia lokal einbinden
====================================

Ausgangspunkt: funktionierende V0.3 WHISPER separat aufbewahren.
ARK-0-HDD wird NICHT beschrieben oder umbenannt. Laufender GML-Download bleibt unberührt.

EINMALIG (mit Internet)
1. ZIP in NEUEN Ordner entpacken.
2. WIKI_SETUP.bat ausführen. Das holt offiziellen Windows-x64-Kiwix-Server 3.8.1.
   Es installiert keine Elgato-Software, verwendet keine Cloud und verändert ARK 0 nicht.
3. WICHTIG: Bereits funktionierende Whisper-Dateien aus V0.3 weiterverwenden:
   WHISPER_AUS_V03_IMPORTIEREN.bat starten und den V0.3-Ordner angeben.
   Alternativ VOICE_SETUP.bat erneut ausfuehren, falls keine Dateien mehr vorhanden sind.
4. START_ARK.bat starten. Stream Deck + Whisper funktionieren wie in V0.3.
5. "Knowledge & Maps" oder "WIKIPEDIA" anklicken.
6. ARK findet die .zim-Datei automatisch in Media\Wikipedia, neben der
   ARK-EXE oder im Laufwerksstamm. Bei anderer Lage: Pfad zur .zim-Datei
   eintragen, z. B. I:\Media\Wikipedia\wikipedia_de_all_maxi_2026-10.zim
   Den TATSÄCHLICHEN Pfad über Explorer prüfen (Buchstabe kann wechseln).
   Datei mit Shift + Rechtsklick -> "Als Pfad kopieren" einfügen.
7. ZIM VERBINDEN anklicken. Status "Wikipedia bereit – offline" abwarten.
8. Suchbegriff sprechen, im Hauptsuchfeld eintippen und WIKIPEDIA wählen.

Technik
- ARK startet kiwix-serve.exe als Unterprozess auf 127.0.0.1:8791,
  nur lokal erreichbar. ARK vermittelt /wiki/ an diesen Prozess.
- Wikipedia erscheint im ARK-Fenster. Bei Schließen von ARK stoppt auch Kiwix.
- Die ZIM-Datei wird ausschließlich gelesen, kein Kopieren, keine Indizierung.
- wikipedia.json enthält allein den ZIM-Dateipfad und liegt neben der ARK-EXE.
  Leer lassen, damit ARK automatisch in Media\Wikipedia sucht.
- Falls ZIM-Datei umgezogen wird: Pfad in ARK neu setzen.
- Artikelinhalte sind nicht automatisch mit dem ARK-LLM verbunden.
- Kiwix Search verwendet die im ZIM vorhandene Volltextsuche.
- Browserübergreifende Links im ZIM sind durch --blockexternal unterbunden.

Einschränkung / Teststatus
- Die bestehende EXE und Stream-Deck-/Whisper-Funktion basieren auf hardwaregetesteter V0.3.
- Neue Wikipedia-Integration kompiliert und mit synthetischen HTTP-Tests geprüft.
- Kiwix-Windows-Binary und die sehr große echte Wikipedia-ZIM-Datei konnten hier
  mangels direktem Netzwerk-/Dateizugriff nicht live getestet werden.
- Offizieller Windows-Server muss einmalig geladen werden; danach vollständig offline.
- Ein Windows-USB/Whisper-Retest ist am Nutzergerät erforderlich.
