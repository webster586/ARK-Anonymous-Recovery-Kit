ARK V1.4.5.5 – DGM1 Streaming TEST

- Primaerer Datenpfad I:\Media\Geodaten\NRW Datagrabber; I:\NRW Datagrabber nur noch Kompatibilitaets-Fallback; zuletzt konfigurierte gueltige Pfade bleiben erhalten.
- Inventar erfasst DGM1-TIFF-Kacheln nach Dateinamen.
- 1-km-DGM-Kacheln werden bei bestehender LoD2-Kachel geladen.
- TIFF-Testdecoder: Strips, 16/32/64-bit, RAW/LZW/Deflate; Predictor und TIFF-Tiles noch nicht unterstuetzt.
- Auf ca. 130 x 130 Hoehenpunkte pro Kachel begrenztes Mesh, GPU-Freigabe beim Entladen.
- OSM noch nicht integriert.
- Die genauen DGM1-Dateinamen / TIFF-Kompressionsvarianten auf dem Nutzerrechner wurden noch nicht live getestet.
- Bestehende Dateien werden schreibgeschuetzt gelesen.
