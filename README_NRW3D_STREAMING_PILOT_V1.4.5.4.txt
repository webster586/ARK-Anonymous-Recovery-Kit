ARK V1.4.5.4 — NRW 3D OFFLINE STREAMING PILOT (KÖLN–BONN)

BASIS: ARK Windows V1.4.5.3 EPUB_READER.
- NRW 3D: neuer PLZ-/Ortswähler mit fünf lokal vorkonfigurierten Testorten:
  Köln Zentrum 50667, Brühl 50321, Bornheim 53332, Sechtem 53332,
  Bonn Zentrum 53111. Dies ist KEIN vollständiges PLZ-Verzeichnis.
- Nach 'ORDNER PRÜFEN' im NRW-DATAGRABBER den Ort wählen und 'ORT IN 3D LADEN'.
- 1-km-LoD2-GML-Kacheln werden von der bestehenden lokalen ARK-API
  automatisch im Umkreis der Kameraposition geladen. Max. 9 aktive
  GPU-Kacheln und max. 2 parallele Ladeanforderungen. Nicht benötigte
  GPU-Kacheln werden freigegeben, laufende Anfragen abgebrochen.
- Eine einfache Vorwärts-/Entfernungsprüfung überspringt weit hinter
  der Kamera liegende Kacheln. Das ist noch KEIN vollständiges Frustum-Culling.
- Kameraverschiebung per rechter Maustaste relativ zur Blickrichtung.
- Bestehende Sechtem-Demo und manueller Einzelkachel-Modus bleiben erhalten.
- Keine Cloud-/Kartenanbieteranfragen. Kein automatisches Nachladen aus dem Internet.

EINSCHRÄNKUNGEN / NICHT ALS FERTIG BEZEICHNEN
- Streaming betrifft vorerst LoD2-GML (Gebäude), noch NICHT DGM1-TIFF und
  OSM-Straßen. Kein vollständiges Köln–Bonn-Kartenpaket in der ZIP.
- NRW-Daten müssen im bereits bestehenden DataGrabber-Verzeichnis vorhanden sein.
- Vorhandener einfache GML-Fan-Triangulierer ist kein geprüfter LoD2-Mesh-Renderer;
  Geometriefehler sind möglich. Neues Sechtem V1.4.4 ist NICHT in ARK integriert.
- Keine vollständige PLZ-Datenbank, kein persistenter optimierter Kachelcache.
- Nicht verwendete Kacheln werden aus GPU-RAM entladen, GML-Parsing erfolgt aber
  bei erneutem Besuch wieder auf CPU. Keine Garantie für ein konkretes FPS-Ziel.
- Die bisherige Sechtem-Referenz-Szene ist nach wie vor V0.9.1.

PRÜFUNG
- JavaScript Syntax mit node --check erfolgreich.
- Windows x64 EXE mit Go aus dem mitgelieferten Quellcode neu gebaut.
- Zip-Integrität geprüft.
- Browserlaufzeittest war in der Laufzeitumgebung wegen gesperrter localhost-
  Verbindung nicht möglich. Keine echte Windows-/GPU-/GML-Livevalidierung.

TEST
1. In SEPARATEN Ordner entpacken; bisherige funktionierende Version aufbewahren.
2. START_ARK.bat starten, NRW 3D öffnen.
3. Bestehenden DataGrabber-Ordner verbinden und GML-Bestand prüfen.
4. PLZ 53332 eingeben, Sechtem wählen, ORT IN 3D LADEN.
5. Kamera verschieben und Streaming-Anzeige mit 0..9 aktiven Kacheln prüfen.
6. Bei leerem Bild prüfen, ob die benötigten GML-Kacheln im Ordner liegen.
