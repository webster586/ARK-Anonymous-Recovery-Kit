ARK V1.2 | NATURAL EARTH WORLD ATLAS – WINDOWS-TESTVERSION
=========================================================

ZIEL
----
Verwendet deine vorhandene Datei direkt und ausschließlich lesend:
I:\Media\Geodaten\Natural Earth\packages\natural_earth_vector.gpkg

KEIN Herunterladen nötig. Keine Installation von Python oder QGIS nötig.
Die GPKG wird NICHT kopiert, verändert oder indiziert.
Windows 10/11, 64 Bit benötigt (systemeigene winsqlite3.dll).

START
-----
1. Bestehende funktionierende ARK-Version separat sichern.
2. Diesen ZIP-Ordner separat entpacken.
3. Bereits installierte Whisper-Dateien/Modelle und Kiwix-Tools aus
   bestehendem ARK ggf. ergänzen, wenn Sprachsuche/Wikipedia mitgenutzt wird.
4. START_ARK.bat doppelklicken.
5. ARK-02 > WORLD ATLAS auswählen (eigenes Modul in der Übersicht).
6. ARK sucht die GPKG automatisch bei I:\Media\Geodaten\Natural Earth\packages\
   sowie neben bzw. über dem ARK-Ordner (auch im alten Pfad I:\Natural Earth\).
7. Falls sie nicht gefunden wird, im eingeblendeten Formular den originalen
   vollständigen Dateipfad eintragen und bestätigen.

BEDIENUNG
---------
Ziehen / Touch = Karte verschieben
Mausrad / +/- = vergrößern bzw. verkleinern
WELT / DETAIL = 1:110m und 1:50m-Datensätze, wenn vorhanden
Suche = Namen aus den aktuell geladenen Länder-, Orts- und See-Layern
Kartenebenen = Länder, Gewässer, Flüsse, Städte ein-/ausschalten
Stream Deck = Pfeile für Pan, Linktasten für Zoom, OK für Orts-Suchfeld
Zurück (ARK-Steuerung) = Modulübersicht

WICHTIG
-------
Diese Version ist ein weltweiter geografischer Vektoratlas. Natural Earth
liefert KEIN flächendeckendes hochauflösendes Straßennetz, keine detaillierte
Hausnummernsuche und kein digitales Höhenmodell. Topografisches echtes Relief
und weltweite Straßenkarten erfordern ergänzende Offline-Datensätze.

TECHNIK UND TESTS
-----------------
- Go Windows-x64 EXE ohne zusätzliche DB-Treiber-Installation.
- Verwendet Windows SQLite-C-API (winsqlite3.dll) READONLY.
- Liest Metadaten und bei Bedarf einzelne Natural-Earth-Ebenen direkt aus GPKG.
- Keine Internetanfragen; sämtliche Assets sind eingebettet.
- Geometrie: GeoPackage-Binary + WKB; Polygon, Linie, Punkt und Multi-Geometrien.
- Browser-Test mit simulierten Geometrien bei 1280x800, 1920x1200, 800x1280,
  inklusive Welt/Detail, Suche, Zoom und Drag: bestanden.
- Windows-EXE Cross-Build und WKB-Parser-Unit-Tests: bestanden.
- Echtes GeoPackage auf deinem PC sowie echte Stream-Deck-Hardware mit V1.2:
  NOCH NICHT GETESTET. Bitte Rückmeldung liefern.

Fehlerbehebung: GPKG muss eine gültige SQLite-Datei sein. Bei Bedarf den
Fehlertext im Atlas-Quellpfad-Dialog und die Konsole kopieren.

Die funktionsfähige bisherige ARK-Version bitte NICHT überschreiben!
