ARK V1.4.5.6 - DGM1 LZW Reparaturtest

BASIS: V1.4.5.5 mit Start-Icon.
NEU: TIFF-kompatibler LZW-Dekoder (Early Change) statt Go-Standard-LZW.
Geprueft: Windows Cross-Compile; synthetisches Float32 GeoTIFF, Kompression LZW, 512x512 -> korrekt dekodiert; ZIP-Integritaet.
Nicht geprueft: echte NRW-DGM1-Kachel des Nutzers, Windows UI Laufzeit, FPS oder OSM-Strassen.

TEST: In neuem Ordner entpacken, START_ARK.bat starten, Datenordner I:\Media\Geodaten\NRW Datagrabber bestaetigen (alter Pfad I:\NRW Datagrabber nur Kompatibilitaets-Fallback), Bonn/Koeln laden und Fehlerfeld kontrollieren.
Bei Fehlern eine tatsaechliche DGM1-TIFF-Kachel fuer den naechsten Live-Dekodertest bereitstellen.

Nur Geländedekodierung wurde angepasst; OSM-Strassen sind weiterhin nicht angebunden.
Die alten Versionen werden NICHT ueberschrieben.
Go-Quellcode liegt unter Entwicklung/src/ und ist fuer weitere gezielte Reparaturen enthalten.
