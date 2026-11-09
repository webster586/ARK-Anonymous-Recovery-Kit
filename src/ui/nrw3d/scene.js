'use strict';
// Offline-native WebGL geometry preview. No CDN, no remote resources.
const $=id=>document.getElementById(id);const canvas=$('view'),err=$('error'),stat=$('stat'),label=$('sceneLabel');
// ARK-Systemsprache: wird im Haupt-Shell-Header (Button neben "HILFE") per
// localStorage.ark.lang gesetzt und hier (als NRW-3D-iframe, gleiche Origin)
// ueber das "storage"-Event live uebernommen. Default: Deutsch.
function arkLang(){return localStorage.getItem('ark.lang')==='en'?'en':'de'}
// ARK-Systemsprache-Woerterbuch fuer die NRW-3D-Oberflaeche (Chrome, nicht Geodaten).
const ARK_NRW3D_I18N={
 de:{
  nrw3d_h2_camera:'3D-KAMERA',nrw3d_btn_top:'DRAUFSICHT',nrw3d_btn_angle:'PERSPEKTIVE',nrw3d_btn_reset:'ZENTRIEREN',nrw3d_btn_rotate_off:'FLUG: AUS',nrw3d_btn_rotate_on:'FLUG: AN',
  nrw3d_h2_layers:'EBENEN',nrw3d_layer_roof:'Dachflächen',nrw3d_layer_wall:'Gebäudewände',nrw3d_layer_ground:'Gebäudeflächen',nrw3d_layer_terrain:'DGM1-Gelände',nrw3d_layer_roads:'Straßen und Wege',nrw3d_layer_waterways:'Flüsse und Bäche',nrw3d_layer_waters:'Seen und Gewässer',nrw3d_layer_roadnames:'Straßennamen',nrw3d_layer_placenames:'Ortsnamen',
  nrw3d_h2_osm:'OSM STRASSEN · LOKAL',nrw3d_osm_hint:'Automatisch: vorverarbeitete OSM-Kacheln (Straßen, Bahn, Flüsse, Bäche, Gewässer, Straßennamen, Ortsnamen) werden für ganz NRW zusammen mit den LoD2/DGM1-Kacheln gestreamt, sobald ein "osm_tiles"-Ordner neben dem Datenordner gefunden wird. Straßennamen und Ortsnamen lassen sich oben unter EBENEN getrennt ein-/ausblenden. Manueller Import unten ist nur für einzelne Zusatzgebiete nötig (GeoJSON, WGS84, max. 128 MB).',nrw3d_osmstatus_default:'Noch keine OSM-Daten manuell importiert.',
  nrw3d_h2_place:'PLZ / ORT · OFFLINE STREAMING',nrw3d_place_hint:'Lädt lokale LoD2-GML- und DGM1-Kacheln sowie OSM-Straßen/Gewässer-Kacheln je nach Kameraposition, maximal 25 gleichzeitig im GPU-Speicher.',nrw3d_place_placeholder:'PLZ eingeben, z. B. 53332',nrw3d_place_select_aria:'Ort wählen',nrw3d_place_go_btn:'ORT IN 3D LADEN',nrw3d_place_hint2:'PLZ-Register für ganz NRW inkl. Ortsteile, lokal aus OSM-Adressdaten erzeugt (kein Live-Internetzugriff). Vorschläge erscheinen sofort beim Tippen; Auswahl springt direkt zum Ort. Kamera frei bewegen, um weitere Kacheln in ganz NRW zu streamen.',
  nrw3d_street_placeholder:'Straßenname, z. B. Römerstraße',nrw3d_street_select_aria:'Straße wählen',nrw3d_street_go_btn:'STRASSE IN 3D LADEN',nrw3d_street_hint:'Straßenregister für ganz NRW (Straße + Ort + PLZ), ebenfalls lokal aus OSM-Adressdaten erzeugt. Treffer egal an welcher Stelle im Namen; Auswahl springt direkt dorthin.',
  nrw3d_h2_data:'NRW DATAGRABBER',nrw3d_data_hint:'Bestehenden Ordner auswählen, Originaldateien werden nur gelesen.',nrw3d_connect_btn:'ORDNER PRÜFEN',nrw3d_inventory_default:'Nicht eingebunden',nrw3d_tiles_aria:'LoD2-Kachel',nrw3d_tiles_default_option:'Keine Kachel geladen',nrw3d_loadtile_btn:'GML-KACHEL ANZEIGEN',nrw3d_loadtile_hint:'GML-Vorschau aus lokalen NRW-LoD2-Daten.',
  nrw3d_more_modules_hint:'Weitere Module wie Offline-Routing folgen separat.',
  nrw3d_size_tile1:'200 m (1 Kachel)',
  nrw3d_h2_diorama:'DIORAMA-EXPORT · STL',nrw3d_diorama_intro:'Druckbares 3D-Diorama (DGM1-Gelände, LoD2-Gebäude, OSM-Straßen/Gleise/Gewässer) als geschlossenes STL. Erst per PLZ-/Straßensuche grob navigieren, dann Mittelpunkt per Klick präzise setzen.',
  nrw3d_center_none:'Noch kein Mittelpunkt gewählt.',nrw3d_center_btn:'MITTELPUNKT SETZEN',nrw3d_center_btn_active:'MITTELPUNKT SETZEN · KLICKE AUF DIE KARTE',nrw3d_center_hint:'Setzt beim nächsten Klick auf die Karte gleichzeitig den Diorama-Mittelpunkt und den ARK-Standort. Bleibt aktiv, bis erneut geklickt oder Esc gedrückt wird.',
  nrw3d_size_label:'Kantenlänge (10 Maßstabsstufen)',nrw3d_profile_label:'Rahmenprofil',nrw3d_profile_frame200:'Bilderrahmen: 200×200 mm, 194×194 mm Diorama, 3 mm Rand, 5×5 mm Auflage',nrw3d_profile_plain200:'Standard: 200×200 mm ohne Rahmenauflage',
  nrw3d_margin_label:'Verschmälerung je Seite (mm)',nrw3d_margin_note:'– nur Bilderrahmenprofil, Sockel bleibt 200×200 mm',nrw3d_base_label:'Grundplatte (mm)',nrw3d_roaddepth_label:'Straßenfurche (mm)',
  nrw3d_waterdepth_label:'Gewässertiefe (mm)',nrw3d_waterdepth_note:'– ARK-Ergänzung, im Sechtem-Original nicht spezifiziert',nrw3d_buildings_check:'Gebäude in den Druck einbeziehen',nrw3d_buildingmode_label:'Gebäudemodus',
  nrw3d_mode_raster:'Bewährt – geschlossener Rasterdruck (V1.3.7)',nrw3d_mode_polygons:'Test – LoD2 + Wandanschluss (V1.4.3)',nrw3d_mode_polygons_rim:'Test – LoD2 + 2-mm-Schnittrand (V1.4.4)',
  nrw3d_mode_warn:'EXPERIMENTELL: original LoD2-Polygone sind keine geprüfte Volumenvereinigung und können Netzfehler/Mehrkörper-STL erzeugen – im Slicer prüfen.',
  nrw3d_smoothing_label:'Geländeglättung:',nrw3d_fragments_check:'Gelände-Ausreißer entfernen',nrw3d_roadclean_check:'Straßenartefakte bereinigen',nrw3d_protect_check:'Dachkanten vor Glättung schützen',
  nrw3d_export_btn:'STL EXPORTIEREN',nrw3d_ringwidth_label:'Ringbreite Bilderrahmentestdruck (mm)',nrw3d_exportring_btn:'BILDERRAHMENTESTDRUCK · NUR AUSSENRING',
  nrw3d_ring_hint:'Druckt nur den äußeren Ring (Terrain + Rahmenauflage) zur Passprobe – inkl. Gebäude, falls oben aktiviert, ohne Straßen/Wasser, dadurch deutlich schneller.',
  nrw3d_status_pick_mode:'Mittelpunkt wählen, um den Export freizuschalten.',
  nrw3d_nav_aria:'NRW 3D Optionen',nrw3d_canvas_aria:'3D Ansicht NRW',nrw3d_stat_none:'KEINE DATEN GELADEN',nrw3d_instructions:'ZIEHEN: DREHEN · RECHTE MAUSTASTE: VERSCHIEBEN · RAD: ZOOM',
  nrw3d_compass_aria:'Kompass, Klick richtet die Ansicht nach Norden aus',nrw3d_compass_title:'Nach Norden ausrichten',
  nrw3d_group_place:'Standort',nrw3d_group_camera:'Kamera',nrw3d_group_layers:'Ebenen',nrw3d_group_osm:'OSM & Wasser',nrw3d_group_diorama:'Diorama',nrw3d_group_data:'Daten',
  nrw3d_webgl_unavailable:'WebGL ist auf dieser Hardware nicht verfügbar. ARK selbst bleibt weiterhin nutzbar.',nrw3d_webgl_init_error:'WebGL-Initialisierung: {err}',
  nrw3d_center_pick_failed:'Mittelpunkt konnte bei diesem Blickwinkel nicht bestimmt werden - bitte Kamera etwas neigen und erneut klicken.',nrw3d_center_pick_label:'Mittelpunkt (Klick) · E {e} / N {n}',
  nrw3d_service_unavailable:'ARK NRW-Dienst nicht verfügbar',nrw3d_inventory_summary:'GML-Dateien: {gml}\nDGM-Dateien: {dgm}\nBenannte LoD2-Kacheln: {tiles}\nDGM-Kacheln: {dgmTiles}\nOSM-Straßen/Wasser-Kacheln: {osmTiles}{osmSource}',
  nrw3d_tile_select_default:'Kachel auswählen',nrw3d_folder_error:'Ordner: {err}',nrw3d_gml_reading:'GML-KACHEL WIRD GELESEN',nrw3d_gml_stat:'GML {x}/{y} · {count} DREIECKE · OHNE DGM',
  nrw3d_gml_preview_note:'GML-Vorschau: einfache Polygonzerlegung; Dachform und Lücken prüfen.',nrw3d_gml_not_loaded:'GML NICHT GELADEN',nrw3d_gml_error:'GML: {err}',
  nrw3d_plz_register_error:'PLZ-Register nicht geladen ({err}); nur Fallback-Ort verfügbar.',nrw3d_street_register_error:'Straßenregister nicht geladen ({err}).',nrw3d_street_select_prompt:'Bitte eine Straße auswählen.',
  nrw3d_need_place_first:'Bitte zuerst den lokalen NRW-DataGrabber-Ordner einbinden.',nrw3d_osm_available:'OSM-Daten lokal verfügbar.',nrw3d_osm_need_import:'OSM-GeoJSON für Straßen und Gewässer importieren.',
  nrw3d_place_select_prompt:'Bitte PLZ und Ort auswählen.',nrw3d_stream_status:'STREAM {active} KACHELN ({osm} MIT OSM) · {pending} LADEN · MAX 25 · OFFLINE',
  nrw3d_dgm_error:'DGM {key}: {err}',nrw3d_tile_error:'Kachel {key}: {err}',nrw3d_geojson_required:'GeoJSON FeatureCollection benötigt',nrw3d_osmstatus_summary:'{roads} Straßen/Gleise · {water} Gewässer · {tiles} Kacheln',
  nrw3d_osm_loaded:'Lokale OSM-Ebenen geladen: Straßen, Flüsse und Wasserflächen.',nrw3d_osm_none_found:'Keine OSM-Straßen oder Gewässer in der Datei gefunden.',nrw3d_indexeddb_unavailable:'IndexedDB nicht verfügbar',
  nrw3d_osm_restored_suffix:' · automatisch wiederhergestellt',nrw3d_geojson_too_large:'GeoJSON größer als 128 MB. Bitte Region teilen.',nrw3d_osm_not_persisted:'OSM sichtbar, aber nicht dauerhaft gespeichert: {err}',nrw3d_osm_import_error:'OSM-Import: {err}',
  nrw3d_discover_searching:'Lokale Kandidaten werden gesucht …',nrw3d_discover_none_found:'Kein bekannter Datenordner gefunden. Pfad manuell eintragen.',nrw3d_discover_adopt_btn:'DIESEN ORDNER ÜBERNEHMEN',
  nrw3d_discover_confirm:'Datenordner prüfen und dauerhaft übernehmen?\n{path}',nrw3d_discover_failed:'Suche fehlgeschlagen: {err}',nrw3d_discover_search_btn:'DATEN AUTOMATISCH SUCHEN',
  nrw3d_osm_discover_searching:'Lokale GeoJSON-Dateien werden gesucht …',nrw3d_osm_discover_none:'Keine GeoJSON-FeatureCollection gefunden. Datei manuell importieren.',nrw3d_osm_adopt_btn:'DIESE DATEI ÜBERNEHMEN',
  nrw3d_osm_confirm:'OSM-GeoJSON importieren und im Browser dauerhaft speichern?\n{file}',nrw3d_osm_loading_btn:'WIRD GELADEN …',nrw3d_osm_adopt_error:'OSM-Übernahme: {err}',
  nrw3d_osm_truncated_hint:'Suche begrenzt beendet (Zeit-/Mengenlimit). Nicht gelistete Dateien manuell importieren.',nrw3d_osm_discover_search_btn:'OSM-DATEN AUTOMATISCH SUCHEN',
  nrw3d_center_set_label:'Mittelpunkt: E {e} / N {n}{label}',nrw3d_picking_status:'Klicke auf die Karte: setzt Diorama-Mittelpunkt und Standort. Erneut klicken oder Esc zum Beenden.',nrw3d_picking_stopped:'Mittelpunkt-Modus beendet.',
  nrw3d_need_stream_first:'Bitte zuerst per PLZ/Strasse einen ungefaehren Ort in 3D laden, dann hier klicken.',nrw3d_center_set_status:'Mittelpunkt gesetzt: {label}. Massstab waehlen und STL exportieren, oder erneut klicken fuer einen anderen Punkt.',
  nrw3d_need_center_first:'Bitte zuerst einen Mittelpunkt uebernehmen.',nrw3d_loading_export_data:'Lade Gelaende-, Gebaeude- und OSM-Daten fuer den Ausschnitt...',nrw3d_loading_tiles_full:'Lade Kacheln {done}/{total} (DGM1 {dgm}, LoD2 {gml}, OSM {osm})...',
  nrw3d_computing_geometry:'Berechne Druckgeometrie...',nrw3d_export_failed:'Fehler beim Export: {err}',
  nrw3d_export_done:'Fertig: {tris} Dreiecke, {sizeM} m -> {innerMm} mm (1:{scale}).',nrw3d_terrain_spikes_cleaned:' · {n} Gelaendespitzen bereinigt',nrw3d_roof_nodes_integrated:' · {n} Dachstuetzpunkte integriert',
  nrw3d_experimental_summary:' · EXPERIMENTELL ({mode}): {roof} Dach-/{wall} Wanddreiecke, {closed} Randkanten geschlossen ({open} offen), {footing} Wandfuss-Anbindungen',
  nrw3d_cut_rim_segments:', 2-mm-Schnittrand mit {n} Segmenten',nrw3d_experimental_warning:' · Keine geprueft wasserdichte Volumenvereinigung, STL vor dem Druck in einem Reparatur-/Slicer-Tool pruefen!',nrw3d_closed_body_raster:' · Geschlossener, druckbarer Koerper (Rasterverfahren).',
  nrw3d_fix_label_roads:'Straßen',nrw3d_fix_label_water:'Wasser',nrw3d_fix_cleaned:'{label}-Maske bereinigt: -{removed}/+{filled}',
  nrw3d_ring_width_too_small:'Ringbreite ({ring} mm) muss groesser als die Falztiefe ({flange} mm) sein.',nrw3d_ring_width_too_large:'Ringbreite ist groesser als der halbe Kartenausschnitt - bitte Ringbreite verringern oder Massstab aendern.',
  nrw3d_loading_ring_with_buildings:'Lade Gelaende- (DGM1) und Gebaeudekacheln (LoD2) fuer den Rahmentestring...',nrw3d_loading_ring_terrain_only:'Lade Gelaendekacheln (DGM1) fuer den Rahmentestring...',
  nrw3d_loading_tiles_ring_with_buildings:'Lade Kacheln {done}/{total} (DGM1 {dgm}, LoD2 {gml})...',nrw3d_loading_tiles_ring_terrain_only:'Lade Gelaendekacheln {done}/{total} (DGM1 {dgm})...',
  nrw3d_computing_ring_geometry:'Berechne Ringgeometrie...',nrw3d_ring_failed:'Fehler beim Rahmentestring-Export: {err}',
  nrw3d_ring_done:'Rahmentestring fertig: {tris} Dreiecke, {ring} mm Ringbreite, 1:{scale}{note} · Geschlossener, druckbarer Koerper.',
  nrw3d_ring_buildings_included:' · Gebaeude einbezogen ({n} Dachdreiecke, identisches Raster wie Vollexport)',nrw3d_ring_terrain_only:' · Nur Gelaende (Gebaeude deaktiviert)',
 },
 en:{
  nrw3d_h2_camera:'3D CAMERA',nrw3d_btn_top:'TOP VIEW',nrw3d_btn_angle:'PERSPECTIVE',nrw3d_btn_reset:'CENTER',nrw3d_btn_rotate_off:'FLIGHT: OFF',nrw3d_btn_rotate_on:'FLIGHT: ON',
  nrw3d_h2_layers:'LAYERS',nrw3d_layer_roof:'Roof surfaces',nrw3d_layer_wall:'Building walls',nrw3d_layer_ground:'Building footprints',nrw3d_layer_terrain:'DGM1 terrain',nrw3d_layer_roads:'Roads and paths',nrw3d_layer_waterways:'Rivers and streams',nrw3d_layer_waters:'Lakes and water bodies',nrw3d_layer_roadnames:'Street names',nrw3d_layer_placenames:'Place names',
  nrw3d_h2_osm:'OSM ROADS · LOCAL',nrw3d_osm_hint:'Automatic: preprocessed OSM tiles (roads, rail, rivers, streams, water, street names, place names) are streamed for all of NRW together with the LoD2/DGM1 tiles as soon as an "osm_tiles" folder is found next to the data folder. Street names and place names can be toggled separately above under LAYERS. Manual import below is only needed for individual extra areas (GeoJSON, WGS84, max. 128 MB).',nrw3d_osmstatus_default:'No OSM data manually imported yet.',
  nrw3d_h2_place:'ZIP / PLACE · OFFLINE STREAMING',nrw3d_place_hint:'Loads local LoD2 GML and DGM1 tiles as well as OSM road/water tiles depending on camera position, up to 25 simultaneously in GPU memory.',nrw3d_place_placeholder:'Enter ZIP code, e.g. 53332',nrw3d_place_select_aria:'Select place',nrw3d_place_go_btn:'LOAD PLACE IN 3D',nrw3d_place_hint2:'ZIP/district register for all of NRW incl. districts, generated locally from OSM address data (no live internet access). Suggestions appear instantly while typing; selecting one jumps straight to the place. Move the camera freely to stream further tiles across all of NRW.',
  nrw3d_street_placeholder:'Street name, e.g. Römerstraße',nrw3d_street_select_aria:'Select street',nrw3d_street_go_btn:'LOAD STREET IN 3D',nrw3d_street_hint:'Street register for all of NRW (street + place + ZIP), also generated locally from OSM address data. Matches anywhere in the name; selecting one jumps straight there.',
  nrw3d_h2_data:'NRW DATAGRABBER',nrw3d_data_hint:'Select an existing folder; original files are only read.',nrw3d_connect_btn:'CHECK FOLDER',nrw3d_inventory_default:'Not connected',nrw3d_tiles_aria:'LoD2 tile',nrw3d_tiles_default_option:'No tile loaded',nrw3d_loadtile_btn:'SHOW GML TILE',nrw3d_loadtile_hint:'GML preview from local NRW LoD2 data.',
  nrw3d_more_modules_hint:'Further modules such as offline routing follow separately.',
  nrw3d_size_tile1:'200 m (1 tile)',
  nrw3d_h2_diorama:'DIORAMA EXPORT · STL',nrw3d_diorama_intro:'Printable 3D diorama (DGM1 terrain, LoD2 buildings, OSM roads/rail/water) as a closed STL. First navigate roughly via ZIP/street search, then set the center point precisely by clicking.',
  nrw3d_center_none:'No center point selected yet.',nrw3d_center_btn:'SET CENTER POINT',nrw3d_center_btn_active:'SET CENTER POINT · CLICK ON THE MAP',nrw3d_center_hint:'Sets both the diorama center point and the ARK location on the next click on the map. Stays active until clicked again or Esc is pressed.',
  nrw3d_size_label:'Edge length (10 scale steps)',nrw3d_profile_label:'Frame profile',nrw3d_profile_frame200:'Picture frame: 200×200 mm, 194×194 mm diorama, 3 mm border, 5×5 mm seat',nrw3d_profile_plain200:'Standard: 200×200 mm without frame seat',
  nrw3d_margin_label:'Narrowing per side (mm)',nrw3d_margin_note:'– frame profile only, base stays 200×200 mm',nrw3d_base_label:'Base plate (mm)',nrw3d_roaddepth_label:'Road groove (mm)',
  nrw3d_waterdepth_label:'Water depth (mm)',nrw3d_waterdepth_note:'– ARK addition, not specified in the Sechtem original',nrw3d_buildings_check:'Include buildings in the print',nrw3d_buildingmode_label:'Building mode',
  nrw3d_mode_raster:'Proven – closed raster print (V1.3.7)',nrw3d_mode_polygons:'Test – LoD2 + wall joint (V1.4.3)',nrw3d_mode_polygons_rim:'Test – LoD2 + 2 mm crop rim (V1.4.4)',
  nrw3d_mode_warn:'EXPERIMENTAL: original LoD2 polygons are not a verified volume union and may produce mesh errors/multi-body STL – check in the slicer.',
  nrw3d_smoothing_label:'Terrain smoothing:',nrw3d_fragments_check:'Remove terrain outliers',nrw3d_roadclean_check:'Clean up road artifacts',nrw3d_protect_check:'Protect roof edges before smoothing',
  nrw3d_export_btn:'EXPORT STL',nrw3d_ringwidth_label:'Ring width frame test print (mm)',nrw3d_exportring_btn:'FRAME TEST PRINT · OUTER RING ONLY',
  nrw3d_ring_hint:'Prints only the outer ring (terrain + frame seat) as a fit test – includes buildings if enabled above, no roads/water, so it is much faster.',
  nrw3d_status_pick_mode:'Select a center point to enable export.',
  nrw3d_nav_aria:'NRW 3D options',nrw3d_canvas_aria:'NRW 3D view',nrw3d_stat_none:'NO DATA LOADED',nrw3d_instructions:'DRAG: ROTATE · RIGHT MOUSE BUTTON: PAN · WHEEL: ZOOM',
  nrw3d_compass_aria:'Compass, click aligns the view to north',nrw3d_compass_title:'Align to north',
  nrw3d_group_place:'Location',nrw3d_group_camera:'Camera',nrw3d_group_layers:'Layers',nrw3d_group_osm:'OSM & Water',nrw3d_group_diorama:'Diorama',nrw3d_group_data:'Data',
  nrw3d_webgl_unavailable:'WebGL is not available on this hardware. ARK itself remains usable.',nrw3d_webgl_init_error:'WebGL initialization: {err}',
  nrw3d_center_pick_failed:'Center point could not be determined at this viewing angle - please tilt the camera slightly and click again.',nrw3d_center_pick_label:'Center point (click) · E {e} / N {n}',
  nrw3d_service_unavailable:'ARK NRW service unavailable',nrw3d_inventory_summary:'GML files: {gml}\nDGM files: {dgm}\nNamed LoD2 tiles: {tiles}\nDGM tiles: {dgmTiles}\nOSM road/water tiles: {osmTiles}{osmSource}',
  nrw3d_tile_select_default:'Select tile',nrw3d_folder_error:'Folder: {err}',nrw3d_gml_reading:'READING GML TILE',nrw3d_gml_stat:'GML {x}/{y} · {count} TRIANGLES · NO DGM',
  nrw3d_gml_preview_note:'GML preview: simple polygon decomposition; check roof shape and gaps.',nrw3d_gml_not_loaded:'GML NOT LOADED',nrw3d_gml_error:'GML: {err}',
  nrw3d_plz_register_error:'ZIP register not loaded ({err}); only fallback place available.',nrw3d_street_register_error:'Street register not loaded ({err}).',nrw3d_street_select_prompt:'Please select a street.',
  nrw3d_need_place_first:'Please connect the local NRW DataGrabber folder first.',nrw3d_osm_available:'OSM data available locally.',nrw3d_osm_need_import:'Import OSM GeoJSON for roads and water.',
  nrw3d_place_select_prompt:'Please select ZIP code and place.',nrw3d_stream_status:'STREAM {active} TILES ({osm} WITH OSM) · {pending} LOADING · MAX 25 · OFFLINE',
  nrw3d_dgm_error:'DGM {key}: {err}',nrw3d_tile_error:'Tile {key}: {err}',nrw3d_geojson_required:'GeoJSON FeatureCollection required',nrw3d_osmstatus_summary:'{roads} roads/tracks · {water} water bodies · {tiles} tiles',
  nrw3d_osm_loaded:'Local OSM layers loaded: roads, rivers and water areas.',nrw3d_osm_none_found:'No OSM roads or water found in the file.',nrw3d_indexeddb_unavailable:'IndexedDB not available',
  nrw3d_osm_restored_suffix:' · automatically restored',nrw3d_geojson_too_large:'GeoJSON larger than 128 MB. Please split the region.',nrw3d_osm_not_persisted:'OSM visible, but not stored permanently: {err}',nrw3d_osm_import_error:'OSM import: {err}',
  nrw3d_discover_searching:'Searching for local candidates …',nrw3d_discover_none_found:'No known data folder found. Enter path manually.',nrw3d_discover_adopt_btn:'ADOPT THIS FOLDER',
  nrw3d_discover_confirm:'Check and permanently adopt this data folder?\n{path}',nrw3d_discover_failed:'Search failed: {err}',nrw3d_discover_search_btn:'SEARCH DATA AUTOMATICALLY',
  nrw3d_osm_discover_searching:'Searching for local GeoJSON files …',nrw3d_osm_discover_none:'No GeoJSON FeatureCollection found. Import file manually.',nrw3d_osm_adopt_btn:'ADOPT THIS FILE',
  nrw3d_osm_confirm:'Import OSM GeoJSON and store it permanently in the browser?\n{file}',nrw3d_osm_loading_btn:'LOADING …',nrw3d_osm_adopt_error:'OSM adoption: {err}',
  nrw3d_osm_truncated_hint:'Search stopped due to a limit (time/amount). Import unlisted files manually.',nrw3d_osm_discover_search_btn:'SEARCH OSM DATA AUTOMATICALLY',
  nrw3d_center_set_label:'Center point: E {e} / N {n}{label}',nrw3d_picking_status:'Click on the map: sets the diorama center point and location. Click again or press Esc to stop.',nrw3d_picking_stopped:'Center point mode stopped.',
  nrw3d_need_stream_first:'Please first load an approximate place in 3D via ZIP/street, then click here.',nrw3d_center_set_status:'Center point set: {label}. Choose a scale and export STL, or click again for a different point.',
  nrw3d_need_center_first:'Please set a center point first.',nrw3d_loading_export_data:'Loading terrain, building and OSM data for the selection...',nrw3d_loading_tiles_full:'Loading tiles {done}/{total} (DGM1 {dgm}, LoD2 {gml}, OSM {osm})...',
  nrw3d_computing_geometry:'Computing print geometry...',nrw3d_export_failed:'Export failed: {err}',
  nrw3d_export_done:'Done: {tris} triangles, {sizeM} m -> {innerMm} mm (1:{scale}).',nrw3d_terrain_spikes_cleaned:' · {n} terrain spikes cleaned',nrw3d_roof_nodes_integrated:' · {n} roof support points integrated',
  nrw3d_experimental_summary:' · EXPERIMENTAL ({mode}): {roof} roof/{wall} wall triangles, {closed} edge seams closed ({open} open), {footing} wall-foot connections',
  nrw3d_cut_rim_segments:', 2 mm crop rim with {n} segments',nrw3d_experimental_warning:' · Not a verified watertight volume union, check the STL in a repair/slicer tool before printing!',nrw3d_closed_body_raster:' · Closed, printable body (raster method).',
  nrw3d_fix_label_roads:'Roads',nrw3d_fix_label_water:'Water',nrw3d_fix_cleaned:'{label} mask cleaned: -{removed}/+{filled}',
  nrw3d_ring_width_too_small:'Ring width ({ring} mm) must be greater than the flange depth ({flange} mm).',nrw3d_ring_width_too_large:'Ring width is larger than half the map selection - please reduce the ring width or change the scale.',
  nrw3d_loading_ring_with_buildings:'Loading terrain (DGM1) and building tiles (LoD2) for the frame test ring...',nrw3d_loading_ring_terrain_only:'Loading terrain tiles (DGM1) for the frame test ring...',
  nrw3d_loading_tiles_ring_with_buildings:'Loading tiles {done}/{total} (DGM1 {dgm}, LoD2 {gml})...',nrw3d_loading_tiles_ring_terrain_only:'Loading terrain tiles {done}/{total} (DGM1 {dgm})...',
  nrw3d_computing_ring_geometry:'Computing ring geometry...',nrw3d_ring_failed:'Frame test ring export failed: {err}',
  nrw3d_ring_done:'Frame test ring done: {tris} triangles, {ring} mm ring width, 1:{scale}{note} · Closed, printable body.',
  nrw3d_ring_buildings_included:' · Buildings included ({n} roof triangles, identical raster to the full export)',nrw3d_ring_terrain_only:' · Terrain only (buildings disabled)',
 },
};
function I18N(){return ARK_NRW3D_I18N[arkLang()]||ARK_NRW3D_I18N.de}
function I18Nf(key,vars){let s=I18N()[key]||'';if(vars)for(const k in vars)s=s.split('{'+k+'}').join(vars[k]);return s}
function applyNrw3dTranslations(){
 document.documentElement.lang=arkLang();
 const dict=I18N();
 document.querySelectorAll('[data-i18n]').forEach(el=>{const v=dict[el.dataset.i18n];if(v!==undefined)el.textContent=v;});
 document.querySelectorAll('[data-i18n-title]').forEach(el=>{const v=dict[el.dataset.i18nTitle];if(v!==undefined)el.title=v;});
 document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{const v=dict[el.dataset.i18nPlaceholder];if(v!==undefined)el.placeholder=v;});
 document.querySelectorAll('[data-i18n-aria]').forEach(el=>{const v=dict[el.dataset.i18nAria];if(v!==undefined)el.setAttribute('aria-label',v);});
 // Dynamische Statustexte, die nicht ueber data-i18n laufen, folgen separat
 // in applyNrw3dDynamicTranslations() (siehe Ende von diorama.js), da sie
 // vom jeweils zuletzt eingetretenen Zustand abhaengen.
}
const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});
if(!gl){err.textContent=I18N().nrw3d_webgl_unavailable;}
const models={roof:null,wall:null,ground:null,terrain:null,roads:null,waterways:null,waters:null};const colors={roof:[.59,.34,.24],wall:[.76,.73,.66],ground:[.46,.54,.45],terrain:[.23,.39,.29],roads:[.36,.36,.37],waterways:[.12,.48,.78],waters:[.10,.38,.66]};
let fly=false, dist=1800,yaw=.72,pitch=.85,target=[0,72,0],heightData=null,mode='sample';const ref={centerE:356057.341615436,centerN:5629059.235919102};
function compileShader(type,code){const sh=gl.createShader(type);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
let program=null,posLoc,normalLoc,projLoc,viewLoc,colorLoc,offsetLoc;
if(gl){try{program=gl.createProgram();gl.attachShader(program,compileShader(gl.VERTEX_SHADER,`attribute vec3 pos;attribute vec3 norm;uniform mat4 projection;uniform mat4 view;uniform vec3 offset;varying vec3 vnorm;varying float vdepth;void main(){vec4 p=view*vec4(pos+offset,1.);gl_Position=projection*p;vnorm=norm;vdepth=-p.z;}`));gl.attachShader(program,compileShader(gl.FRAGMENT_SHADER,`precision mediump float;uniform vec3 tint;varying vec3 vnorm;varying float vdepth;void main(){vec3 n=normalize(vnorm);float light=.50+.50*abs(dot(n,normalize(vec3(.32,.76,.39))));float fog=clamp((vdepth-2000.)/8000.,0.,.65);gl_FragColor=vec4(mix(tint*light,vec3(.046,.097,.102),fog),1.);}`));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);posLoc=gl.getAttribLocation(program,'pos');normalLoc=gl.getAttribLocation(program,'norm');projLoc=gl.getUniformLocation(program,'projection');viewLoc=gl.getUniformLocation(program,'view');colorLoc=gl.getUniformLocation(program,'tint');offsetLoc=gl.getUniformLocation(program,'offset');gl.enable(gl.DEPTH_TEST);gl.clearColor(.025,.064,.073,1);}catch(e){err.textContent=I18Nf('nrw3d_webgl_init_error',{err:e.message});}}
function meshData(name,data,lines=false){if(!gl)return;const old=models[name];if(old){gl.deleteBuffer(old.v);gl.deleteBuffer(old.n);}const arr=data instanceof Float32Array?data:new Float32Array(data);if(arr.length<6)return;const normals=new Float32Array(arr.length);if(lines){for(let i=1;i<arr.length;i+=3)normals[i]=1;}else{for(let i=0;i+8<arr.length;i+=9){let ax=arr[i+3]-arr[i],ay=arr[i+4]-arr[i+1],az=arr[i+5]-arr[i+2],bx=arr[i+6]-arr[i],by=arr[i+7]-arr[i+1],bz=arr[i+8]-arr[i+2],nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;const d=Math.hypot(nx,ny,nz)||1;nx/=d;ny/=d;nz/=d;for(let j=0;j<9;j+=3){normals[i+j]=nx;normals[i+j+1]=ny;normals[i+j+2]=nz;}}}
const vb=gl.createBuffer(),nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,normals,gl.STATIC_DRAW);models[name]={v:vb,n:nb,count:arr.length/3,lines};}
function perspective(fov,asp,n,f){let a=1/Math.tan(fov/2);return new Float32Array([a/asp,0,0,0,0,a,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0]);}
function lookAt(eye,center,up){let z=eye.map((v,i)=>v-center[i]);let zn=Math.hypot(...z)||1;z=z.map(v=>v/zn);let x=[up[1]*z[2]-up[2]*z[1],up[2]*z[0]-up[0]*z[2],up[0]*z[1]-up[1]*z[0]];let xn=Math.hypot(...x)||1;x=x.map(v=>v/xn);let y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);}
// CPU-side world-to-screen projection for the HTML-overlay street/place-name
// labels: there is no WebGL text/font pipeline here, so labels are plain DOM
// nodes positioned every frame using the same column-major matrices already
// sent to the GPU as uniforms.
function mulMat4Vec(m,v){const o=[0,0,0,0];for(let i=0;i<4;i++){let s=0;for(let j=0;j<4;j++)s+=m[j*4+i]*v[j];o[i]=s;}return o;}
function projectToScreen(proj,view,x,y,z,w,h){const c=mulMat4Vec(proj,mulMat4Vec(view,[x,y,z,1]));if(c[3]<=.05)return null;const nx=c[0]/c[3],ny=c[1]/c[3];if(nx<-1.2||nx>1.2||ny<-1.2||ny>1.2)return null;return {x:(nx+1)/2*w,y:(1-ny)/2*h};}
const labelsRoot=$('labels'),labelPool={road:[],place:[]};
function labelEl(kind,i){const pool=labelPool[kind];let el=pool[i];if(!el){el=document.createElement('div');el.className='lbl lbl-'+kind;labelsRoot.appendChild(el);pool[i]=el;}return el;}
function hideLabelsFrom(kind,from){const pool=labelPool[kind];for(let i=from;i<pool.length;i++)if(pool[i])pool[i].style.display='none';}
// A long street is usually made of many separate OSM ways (one per block/
// intersection), each contributing its own label candidate at its own
// midpoint. Without de-duplication the same street name is shown many
// times right next to itself ("Heumarkt", "Heumarkt", "Heumarkt", …),
// crowding out genuinely different nearby streets. ROAD_LABEL_MIN_SPACING
// merges same-name candidates that are this close together (metres) into
// a single label (the one nearest the camera); two streets that merely
// share a name but are far apart (common names recur across many NRW
// towns) still both get their own label.
const ROAD_LABEL_MIN_SPACING=180;
const ROAD_LABEL_CAP=150;
function dedupeRoadLabels(sortedCandidates){
 const byName=new Map();
 for(const c of sortedCandidates){let arr=byName.get(c.name);if(!arr){arr=[];byName.set(c.name,arr);}arr.push(c);}
 const kept=[];
 for(const arr of byName.values()){
  const accepted=[];
  for(const c of arr){
   let dup=false;
   for(const a of accepted){if(Math.hypot(c.wx-a.wx,c.wz-a.wz)<ROAD_LABEL_MIN_SPACING){dup=true;break;}}
   if(!dup){accepted.push(c);kept.push(c);}
  }
 }
 kept.sort((a,b)=>a.d-b.d);
 return kept;
}
function updateLabels(proj,view,w,h){
 const showRoad=$('roadNames').checked,showPlace=$('placeNames').checked;
 if(!streamEnabled||(!showRoad&&!showPlace)){hideLabelsFrom('road',0);hideLabelsFrom('place',0);return;}
 const eye=[target[0]+dist*Math.sin(pitch)*Math.sin(yaw),target[1]+dist*Math.cos(pitch),target[2]+dist*Math.sin(pitch)*Math.cos(yaw)];
 const roadCand=[],placeCand=[];
 for(const [key,t] of activeTiles){
  if(showRoad){const list=roadLabelsByTile.get(key);if(list)for(const l of list){const wx=l.e-(anchorX*1000+500),wz=-(l.n-(anchorY*1000+500));roadCand.push({wx,wy:roadHeight(t,l.e,l.n)+3,wz,name:l.name,d:Math.hypot(wx-eye[0],wz-eye[2])});}}
  if(showPlace){const list=placeLabelsByTile.get(key);if(list)for(const l of list){const wx=l.e-(anchorX*1000+500),wz=-(l.n-(anchorY*1000+500));placeCand.push({wx,wy:roadHeight(t,l.e,l.n)+11,wz,name:l.name,d:Math.hypot(wx-eye[0],wz-eye[2])});}}
 }
 roadCand.sort((a,b)=>a.d-b.d);placeCand.sort((a,b)=>a.d-b.d);
 // Street names only once reasonably zoomed in (avoids clutter across all of NRW); place names stay visible further out for orientation.
 const roadMax=showRoad&&dist<2600?ROAD_LABEL_CAP:0,placeMax=showPlace?24:0;
 const roadDeduped=roadMax?dedupeRoadLabels(roadCand):[];
 let ri=0;for(const c of roadDeduped.slice(0,roadMax)){const p=projectToScreen(proj,view,c.wx,c.wy,c.wz,w,h);if(!p)continue;const el=labelEl('road',ri++);el.textContent=c.name;el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.display='';}
 hideLabelsFrom('road',ri);
 let pi=0;for(const c of placeCand.slice(0,placeMax)){const p=projectToScreen(proj,view,c.wx,c.wy,c.wz,w,h);if(!p)continue;const el=labelEl('place',pi++);el.textContent=c.name;el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.display='';}
 hideLabelsFrom('place',pi);
}
// Compass rose: with eye=target+dist*(sin(pitch)*sin(yaw), cos(pitch),
// sin(pitch)*cos(yaw)) and world axes +x=east, +z=south (see jumpToEN:
// wz=-(n-cy), northing grows north so +z is south), the camera's forward
// (view) direction has compass bearing = -yaw. A CSS/SVG "rotate(deg)" is
// clockwise for positive deg, and rotating the N-pointer by +yaw degrees
// is exactly the inverse of that bearing, so it keeps pointing at true
// north on screen as the camera orbits - no separate sign flip needed.
const compassRose=$('compassRose');
function updateCompass(){if(!compassRose)return;const deg=yaw*180/Math.PI;compassRose.setAttribute('transform','rotate('+deg+' 50 50)');}
const compassEl=$('compass');
if(compassEl){const faceNorth=()=>{yaw=0;};compassEl.addEventListener('click',faceNorth);compassEl.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();faceNorth();}});}
let last=0;function draw(t){requestAnimationFrame(draw);if(!gl||!program){updateCompass();return;}if(fly)yaw+=(t-last)*.00018;last=t;updateCompass();const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);const ratio=Math.min(1.75,devicePixelRatio||1);if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);gl.viewport(0,0,canvas.width,canvas.height);}gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);const projM=perspective(Math.PI/3,w/h,1,16000);gl.uniformMatrix4fv(projLoc,false,projM);const eye=[target[0]+dist*Math.sin(pitch)*Math.sin(yaw),target[1]+dist*Math.cos(pitch),target[2]+dist*Math.sin(pitch)*Math.cos(yaw)];const viewM=lookAt(eye,target,[0,1,0]);gl.uniformMatrix4fv(viewLoc,false,viewM);for(const name of ['terrain','ground','wall','roof','waters','waterways','roads']){const m=streamEnabled?null:models[name];if(!m||!$(name).checked)continue;gl.uniform3fv(colorLoc,colors[name]);gl.uniform3fv(offsetLoc,[0,0,0]);gl.bindBuffer(gl.ARRAY_BUFFER,m.v);gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(posLoc);gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.vertexAttribPointer(normalLoc,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(normalLoc);gl.drawArrays(m.lines?gl.LINES:gl.TRIANGLES,0,m.count);}
if(streamEnabled){const ex=eye[0],ez=eye[2];const forward=[target[0]-ex,target[2]-ez];const fl=Math.hypot(...forward)||1;
for(const t of activeTiles.values()){const dx=t.offset[0]-ex,dz=t.offset[2]-ez;const range=Math.hypot(dx,dz);const front=(dx*forward[0]+dz*forward[1])/fl; if(range>1900&&front < -850)continue;
for(const kind of ['terrain','wall','roof','ground','waters','waterways','roads']){if(!$(kind).checked)continue;const m=t[kind];if(!m)continue;gl.uniform3fv(colorLoc,colors[kind]);gl.uniform3fv(offsetLoc,t.offset);gl.bindBuffer(gl.ARRAY_BUFFER,m.v);gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(posLoc);gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.vertexAttribPointer(normalLoc,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(normalLoc);gl.drawArrays(gl.TRIANGLES,0,m.count);}}
} drawDioramaOutline(); updateLabels(projM,viewM,w,h); }
requestAnimationFrame(draw);
const touch=new Map();let move=false,right=false,xprev=0,yprev=0,downBtn=-1,moved=0;canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);touch.set(e.pointerId,[e.clientX,e.clientY]);move=true;right=e.button===2;xprev=e.clientX;yprev=e.clientY;downBtn=e.button;moved=0;});canvas.addEventListener('pointerup',e=>{touch.delete(e.pointerId);move=touch.size>0;if(pickArmed&&downBtn===0&&moved<6)handleCenterPick(e.clientX,e.clientY);});canvas.addEventListener('pointercancel',e=>{touch.delete(e.pointerId);move=false});canvas.addEventListener('pointermove',e=>{if(!move||!touch.has(e.pointerId))return;let dx=e.clientX-xprev,dy=e.clientY-yprev;xprev=e.clientX;yprev=e.clientY;moved+=Math.hypot(dx,dy);if(right||e.shiftKey){target[0]-=(Math.cos(yaw)*dx+Math.sin(yaw)*dy)*dist*.001;target[2]+=(Math.sin(yaw)*dx-Math.cos(yaw)*dy)*dist*.001}else{yaw+=dx*.005;pitch=Math.max(.04,Math.min(1.52,pitch-dy*.005));}});canvas.addEventListener('wheel',e=>{e.preventDefault();dist=Math.max(55,Math.min(9000,dist*Math.exp(e.deltaY*.001)))},{passive:false});canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch=Math.max(.04,pitch-.1);if(e.key==='ArrowDown')pitch=Math.min(1.5,pitch+.1);if(e.key==='+')dist*=.83;if(e.key==='-')dist*=1.2;}});

// ---------- Klick-Picking: Bildschirmpunkt -> Weltkoordinate (UTM32) ----------
// ARK nutzt hier bewusst keinen 3D-Mesh-Raycaster (kein three.js, schlanker
// eigener WebGL-Renderer ohne CPU-seitige Gelaende-Geometrie zur Laufzeit).
// Stattdessen wird derselbe Kamerastrahl, den auch das Rechte-Maustaste-
// Verschieben bereits naeherungsweise nutzt, analytisch mit einer
// horizontalen Ebene auf Hoehe des aktuellen Kamera-Zielpunkts (target[1])
// geschnitten - schnell, robust und fuer die Standort-/Mittelpunktwahl in
// der Praxis praezise genug.
let pickArmed=false,pickCallback=null;
function armCenterPick(cb){pickArmed=true;pickCallback=cb;canvas.style.cursor='crosshair';}
function disarmCenterPick(){pickArmed=false;pickCallback=null;canvas.style.cursor='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pickArmed){disarmCenterPick();if(typeof onCenterPickCancelled==='function')onCenterPickCancelled();}});
function pickGroundPoint(mx,my,w,h){
 const ndcX=(mx/w)*2-1,ndcY=-((my/h)*2-1);
 const eye=[target[0]+dist*Math.sin(pitch)*Math.sin(yaw),target[1]+dist*Math.cos(pitch),target[2]+dist*Math.sin(pitch)*Math.cos(yaw)];
 let z=eye.map((v,i)=>v-target[i]);const zn=Math.hypot(...z)||1;z=z.map(v=>v/zn);
 const up=[0,1,0];let rightV=[up[1]*z[2]-up[2]*z[1],up[2]*z[0]-up[0]*z[2],up[0]*z[1]-up[1]*z[0]];const rn=Math.hypot(...rightV)||1;rightV=rightV.map(v=>v/rn);
 const upV=[z[1]*rightV[2]-z[2]*rightV[1],z[2]*rightV[0]-z[0]*rightV[2],z[0]*rightV[1]-z[1]*rightV[0]];
 const halfH=Math.tan((Math.PI/3)/2),halfW=halfH*(w/h);
 const dir=[0,1,2].map(i=>-z[i]+rightV[i]*ndcX*halfW+upV[i]*ndcY*halfH);
 const dn=Math.hypot(...dir)||1;const rd=dir.map(v=>v/dn);
 const planeY=target[1];
 if(Math.abs(rd[1])<1e-6)return null;
 const t=(planeY-eye[1])/rd[1];
 if(t<=0)return null;
 return [eye[0]+rd[0]*t,planeY,eye[2]+rd[2]*t];
}
function findNearestKnownName(e,n){
 let bestName=null,bestD=Infinity;
 for(const p of localPlaces){const d=Math.hypot(p.e-e,p.n-n);if(d<bestD){bestD=d;bestName=p.plz+' '+p.name;}}
 for(const s of localStreets){const d=Math.hypot(s.e-e,s.n-n);if(d<bestD){bestD=d;bestName=s.street+', '+s.city;}}
 if(bestName&&bestD<=4000)return bestName;
 return I18Nf('nrw3d_center_pick_label',{e:Math.round(e),n:Math.round(n)});
}
function handleCenterPick(clientX,clientY){
 const rect=canvas.getBoundingClientRect();
 const hit=pickGroundPoint(clientX-rect.left,clientY-rect.top,rect.width,rect.height);
 if(!hit){err.textContent=I18N().nrw3d_center_pick_failed;return;}
 const e=hit[0]+anchorX*1000+500,n=anchorY*1000+500-hit[2];
 const labelText=findNearestKnownName(e,n);
 const cb=pickCallback;
 if(cb)cb(e,n,labelText);
}

// ---------- Diorama-Fussabdruck: gelbe gestrichelte Umrandung ----------
// Sobald diorama.js per setDioramaOutline() einen Mittelpunkt/Ausschnitt
// meldet, wird hier eine gelb gestrichelte Linie entlang der vier Kanten des
// gewaehlten Quadrats gezeichnet, die dem geladenen DGM1-Gelaende folgt
// (dieselbe Hoehenabtastung wie roadHeight() fuer Strassen/Gewaesser), damit
// sie nicht ueber dem Gelaende zu schweben scheint. Rein ein visueller
// Indikator in der Live-Vorschau, hat keinerlei Einfluss auf den STL-Export.
let dioramaOutlineBB=null,dioramaOutlineDirty=false,dioramaOutlineBuf=null,dioramaOutlineCount=0;
function setDioramaOutline(bb){dioramaOutlineBB=bb;dioramaOutlineDirty=true;}
function clearDioramaOutline(){dioramaOutlineBB=null;dioramaOutlineDirty=false;if(dioramaOutlineBuf&&gl){gl.deleteBuffer(dioramaOutlineBuf.v);gl.deleteBuffer(dioramaOutlineBuf.n);}dioramaOutlineBuf=null;dioramaOutlineCount=0;}
function groundHeightAt(e,n){const t=activeTiles.get(tileKey(Math.floor(e/1000),Math.floor(n/1000)));if(t)return roadHeight(t,e,n);return lastKnownTerrainHeight;}
const DASH_LEN=6,DASH_GAP=4;
function addDashedEdge(verts,e0,n0,e1,n1){
 const len=Math.hypot(e1-e0,n1-n0);if(len<.01)return;
 const ux=(e1-e0)/len,uy=(n1-n0)/len;
 let pos=0,on=true;
 while(pos<len){
  const seg=Math.min(on?DASH_LEN:DASH_GAP,len-pos);
  if(seg<=1e-6)break;
  if(on){
   const ae=e0+ux*pos,an=n0+uy*pos,be=e0+ux*(pos+seg),bn=n0+uy*(pos+seg);
   const ah=groundHeightAt(ae,an)+1.2,bh=groundHeightAt(be,bn)+1.2;
   verts.push(ae-(anchorX*1000+500),ah,-(an-(anchorY*1000+500)),be-(anchorX*1000+500),bh,-(bn-(anchorY*1000+500)));
  }
  pos+=seg;on=!on;
 }
}
function rebuildDioramaOutline(){
 dioramaOutlineDirty=false;
 if(!gl||!dioramaOutlineBB)return;
 const bb=dioramaOutlineBB,verts=[];
 addDashedEdge(verts,bb.x0,bb.z0,bb.x1,bb.z0);
 addDashedEdge(verts,bb.x1,bb.z0,bb.x1,bb.z1);
 addDashedEdge(verts,bb.x1,bb.z1,bb.x0,bb.z1);
 addDashedEdge(verts,bb.x0,bb.z1,bb.x0,bb.z0);
 if(!dioramaOutlineBuf){dioramaOutlineBuf={v:gl.createBuffer(),n:gl.createBuffer()};}
 const data=new Float32Array(verts),normals=new Float32Array(data.length);
 for(let i=1;i<normals.length;i+=3)normals[i]=1;
 gl.bindBuffer(gl.ARRAY_BUFFER,dioramaOutlineBuf.v);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
 gl.bindBuffer(gl.ARRAY_BUFFER,dioramaOutlineBuf.n);gl.bufferData(gl.ARRAY_BUFFER,normals,gl.DYNAMIC_DRAW);
 dioramaOutlineCount=data.length/3;
}
function drawDioramaOutline(){
 if(!streamEnabled||!dioramaOutlineBB)return;
 if(dioramaOutlineDirty)rebuildDioramaOutline();
 if(!dioramaOutlineBuf||!dioramaOutlineCount)return;
 gl.uniform3fv(colorLoc,[1,1,0]);gl.uniform3fv(offsetLoc,[0,0,0]);
 gl.bindBuffer(gl.ARRAY_BUFFER,dioramaOutlineBuf.v);gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(posLoc);
 gl.bindBuffer(gl.ARRAY_BUFFER,dioramaOutlineBuf.n);gl.vertexAttribPointer(normalLoc,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(normalLoc);
 gl.drawArrays(gl.LINES,0,dioramaOutlineCount);
}

$('top').onclick=()=>{pitch=.045;dist=1700};$('angle').onclick=()=>{pitch=.85;dist=1800};$('reset').onclick=()=>{if(streamEnabled){target=[startTarget[0],startTarget[1],startTarget[2]];}else{target=[0,70,0];}pitch=.85;yaw=.72;dist=1800};$('rotate').onclick=()=>{fly=!fly;$('rotate').textContent=fly?I18N().nrw3d_btn_rotate_on:I18N().nrw3d_btn_rotate_off};
function absTerrain(x,z){if(!heightData)return 0;const e=ref.centerE+x*1.002608967305-z*.027632704994;const n=ref.centerN-x*.027707017027-z*.999916492030;let u=Math.max(0,Math.min(398.999,(e-354000)/10-.5)),v=Math.max(0,Math.min(398.999,(5631000-n)/10-.5));const i=Math.floor(u),j=Math.floor(v);u-=i;v-=j;const a=heightData[j*400+i],b=heightData[j*400+i+1],c=heightData[(j+1)*400+i],d=heightData[(j+1)*400+i+1];return (((a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v)/10);}
function makeTerrain(){if(!heightData)return;const out=[];const size=4000,n=120;function vertex(i,j){const x=-2000+size*i/n,z=-2000+size*j/n;return [x,absTerrain(x,z)-.65,z];}for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i,j+1),d=vertex(i+1,j+1);out.push(...a,...c,...b,...b,...c,...d);}meshData('terrain',new Float32Array(out));}
async function loadBinary(name){const r=await fetch(name,{cache:'force-cache'});if(!r.ok)throw Error(name+': '+r.status);return r.arrayBuffer();}
$('zoomIn').onclick=()=>dist=Math.max(55,dist*.77);$('zoomOut').onclick=()=>dist=Math.min(9000,dist*1.3);
let dgmIndex=new Set();let tileIndex=[];let osmTileIndex=new Set();async function catalog(){try{const r=await fetch('/api/nrw3d/status');if(!r.ok)throw Error(I18N().nrw3d_service_unavailable);const d=await r.json();$('path').value=d.root||'';tileIndex=d.tiles||[];dgmIndex=new Set((d.dgm_tiles||[]).map(t=>t.x+':'+t.y));osmTileIndex=new Set((d.osm_tiles||[]).map(t=>t.x+':'+t.y));syncIndex();$('inventory').textContent=I18Nf('nrw3d_inventory_summary',{gml:d.gml_count,dgm:d.dgm_count,tiles:tileIndex.length,dgmTiles:dgmIndex.size,osmTiles:osmTileIndex.size,osmSource:d.osm_tile_source?' ('+d.osm_tile_source+')':''});const sel=$('tiles');sel.replaceChildren();const initial=document.createElement('option');initial.textContent=I18N().nrw3d_tile_select_default;initial.value='';sel.append(initial);for(const t of tileIndex.slice(0,5000)){const el=document.createElement('option');el.value=`${t.x}:${t.y}`;el.textContent=`${t.x} / ${t.y} (${(t.bytes/1e6).toFixed(1)} MB)`;sel.append(el);}if(tileIndex.length&&!streamEnabled)restoreLastNRWPlace();}catch(e){err.textContent=e.message;}}
$('connect').onclick=async()=>{try{const r=await fetch('/api/nrw3d/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({root:$('path').value})});if(!r.ok)throw Error((await r.text()).trim());await catalog();err.textContent='';}catch(e){err.textContent=I18Nf('nrw3d_folder_error',{err:e.message});}};
$('loadtile').onclick=async()=>{const val=$('tiles').value;if(!val)return;try{const [x,y]=val.split(':');stat.textContent=I18N().nrw3d_gml_reading;err.textContent='';const r=await fetch(`/api/nrw3d/tile?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`);if(!r.ok)throw Error((await r.text()).trim());const j=await r.json();streamEnabled=false;clearStream();heightData=null;for(const k of ['terrain','roads']){if(models[k]){gl.deleteBuffer(models[k].v);gl.deleteBuffer(models[k].n);models[k]=null}};let all=[...j.roof,...j.wall,...j.ground];let min=Infinity,max=-Infinity;for(let i=1;i<all.length;i+=3){min=Math.min(min,all[i]);max=Math.max(max,all[i]);}if(!isFinite(min))min=0;for(const k of ['roof','wall','ground']){const arr=new Float32Array(j[k]);for(let i=1;i<arr.length;i+=3)arr[i]-=min;meshData(k,arr);}target=[0,(max-min)/2,0];dist=1200;mode='tile';stat.textContent=I18Nf('nrw3d_gml_stat',{x,y,count:all.length/9|0});label.textContent=`· LoD2 ${x}/${y}`;err.textContent=I18N().nrw3d_gml_preview_note;}catch(e){stat.textContent=I18N().nrw3d_gml_not_loaded;err.textContent=I18Nf('nrw3d_gml_error',{err:e.message});}};
// Offline regional tile streaming pilot. Coordinates are EPSG:25832 (UTM32), metres.
// localPlaces is populated from the bundled, pre-generated PLZ/Ortsteil
// register (ganz NRW, incl. Ortsteile), see loadPlzRegister() below. It is
// never fetched from the network at runtime — plz_register.json is a
// static asset embedded in the ARK Controller binary, built offline from
// local OSM data by src/tools/plzregister.
let localPlaces=[];
async function loadPlzRegister(){
 try{const r=await fetch('/nrw3d/plz_register.json',{cache:'force-cache'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();
  localPlaces=(d.entries||[]).map(p=>({plz:p.plz,name:p.name,e:p.e,n:p.n}));
 }catch(e){
  // Minimal offline fallback if the bundled register could not be read.
  localPlaces=[{plz:'53332',name:'Bornheim-Sechtem',e:355656,n:5628482}];
  err.textContent=I18Nf('nrw3d_plz_register_error',{err:e.message});
 }
 updatePlaceOptions();
}
const plzRegisterReady=loadPlzRegister();
// localStreets: bundled, pre-generated street+Ort register (ganz NRW),
// built offline from local OSM data by src/tools/streetregister. Same
// embedding/never-network-fetched model as the PLZ register above.
let localStreets=[];
async function loadStreetRegister(){
 try{const r=await fetch('/nrw3d/street_register.json',{cache:'force-cache'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();
  localStreets=(d.entries||[]).map(s=>({street:s.street,city:s.city,plz:s.plz,e:s.e,n:s.n}));
 }catch(e){
  localStreets=[];
  err.textContent=I18Nf('nrw3d_street_register_error',{err:e.message});
 }
 updateStreetOptions();
}
const streetRegisterReady=loadStreetRegister();
// Live suggestions on every keystroke: substring match ("enthält") anywhere
// in the street name, case-insensitive, across all of NRW. Capped like the
// PLZ list so a short/empty query does not force a huge <option> rebuild.
const STREET_OPTIONS_CAP=500;
function updateStreetOptions(){const qRaw=$('nrwstreet').value.trim();const q=qRaw.toLocaleLowerCase('de');const sel=$('nrwstreetlist');sel.replaceChildren();let shown=0;
 for(let i=0;i<localStreets.length&&shown<STREET_OPTIONS_CAP;i++){const s=localStreets[i];if(q&&!s.street.toLocaleLowerCase('de').includes(q))continue;const o=document.createElement('option');o.value=i;o.textContent=s.street+', '+s.city+' ('+s.plz+')';sel.append(o);shown++;}
}
$('nrwstreet').addEventListener('input',updateStreetOptions);updateStreetOptions();
$('nrwstreetlist').addEventListener('change',()=>{if($('nrwstreetlist').value)$('nrwstreetgo').click();});
$('nrwstreetgo').onclick=()=>{const s=localStreets[Number($('nrwstreetlist').value)];if(!s){err.textContent=I18N().nrw3d_street_select_prompt;return;}jumpToEN(s.e,s.n,s.street+', '+s.city);};
let startTarget=[0,70,0];let streamEnabled=false,anchorX=0,anchorY=0,activeTiles=new Map(),pendingTiles=new Map(),missingTiles=new Set(),lastStreamUpdate=0;
const freeTile=t=>{if(!gl)return;for(const k of ['terrain','roof','wall','ground','waters','waterways','roads'])if(t[k]){gl.deleteBuffer(t[k].v);gl.deleteBuffer(t[k].n);}};
function clearStream(){for(const t of activeTiles.values())freeTile(t);activeTiles.clear();missingTiles.clear();for(const ctl of pendingTiles.values())ctl.abort();pendingTiles.clear();}
function tileBuffers(a,lines=false){if(!gl||!a||a.length<(lines?6:9))return null;const data=new Float32Array(a),normals=new Float32Array(data.length);for(let i=0;i+8<data.length;i+=9){const ax=data[i+3]-data[i],ay=data[i+4]-data[i+1],az=data[i+5]-data[i+2],bx=data[i+6]-data[i],by=data[i+7]-data[i+1],bz=data[i+8]-data[i+2];let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,d=Math.hypot(nx,ny,nz)||1;for(let q=0;q<9;q+=3){normals[i+q]=nx/d;normals[i+q+1]=ny/d;normals[i+q+2]=nz/d;}}
if(lines)for(let i=0;i<normals.length;i+=3){normals[i]=0;normals[i+1]=1;normals[i+2]=0;}const v=gl.createBuffer(),n=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,n);gl.bufferData(gl.ARRAY_BUFFER,normals,gl.STATIC_DRAW);return {v,n,count:data.length/3};}
const tileKey=(x,y)=>x+':'+y;
const indexedTiles=new Set();
function syncIndex(){indexedTiles.clear();for(const t of tileIndex)indexedTiles.add(tileKey(t.x,t.y));}
// Live suggestions on every keystroke: PLZ-prefix match across all of NRW,
// including every known Ortsteil (district) under the matching PLZ, not
// just the municipality-level entry. Capped so an empty/very short prefix
// does not force thousands of <option> rebuilds on each keystroke.
const PLACE_OPTIONS_CAP=500;
function updatePlaceOptions(){const plz=$('nrwplz').value.trim();const sel=$('nrwplace');sel.replaceChildren();let shown=0;
 for(let i=0;i<localPlaces.length&&shown<PLACE_OPTIONS_CAP;i++){const p=localPlaces[i];if(plz&&!p.plz.startsWith(plz))continue;const o=document.createElement('option');o.value=i;o.textContent=p.plz+' '+p.name;sel.append(o);shown++;}
}
$('nrwplz').addEventListener('input',updatePlaceOptions);updatePlaceOptions();
// Selecting a suggestion jumps straight to it (no extra click needed); the
// button stays for keyboard-only / re-trigger use.
$('nrwplace').addEventListener('change',()=>{if($('nrwplace').value)$('nrwgo').click();});
// jumpToEN() is the shared camera-jump used by both the PLZ/Ortsteil
// register and the street register below; both bundles are just
// {e,n} centroids in the same UTM32 grid.
function jumpToEN(e,n,labelText){if(!tileIndex.length){err.textContent=I18N().nrw3d_need_place_first;return false;}
clearStream();streamEnabled=true;mode='stream';anchorX=Math.floor(e/1000);anchorY=Math.floor(n/1000);const cx=anchorX*1000+500,cy=anchorY*1000+500;target=[e-cx,70,-(n-cy)];startTarget=target.slice();dist=1250;pitch=.85;yaw=.72;label.textContent='· '+labelText.toUpperCase()+' / OFFLINE';err.textContent=roadFeatureCount+waterFeatureCount?I18N().nrw3d_osm_available:I18N().nrw3d_osm_need_import;updateStreaming(true);return true;}
$('nrwgo').onclick=()=>{const p=localPlaces[Number($('nrwplace').value)];if(!p){err.textContent=I18N().nrw3d_place_select_prompt;return;}jumpToEN(p.e,p.n,p.name);};
async function loadStreamTile(x,y){const key=tileKey(x,y);if(activeTiles.has(key)||pendingTiles.has(key)||missingTiles.has(key))return;const hasGML=indexedTiles.has(key),hasOSM=osmTileIndex.has(key);if(!hasGML&&!hasOSM)return;const ctl=new AbortController();pendingTiles.set(key,ctl);
const t={offset:[(x-anchorX)*1000,0,-(y-anchorY)*1000]};
try{
 let gml=null;
 if(hasGML){const resp=await fetch('/api/nrw3d/tile?x='+x+'&y='+y,{signal:ctl.signal});if(!resp.ok){missingTiles.add(key);return;}gml=await resp.json();if(!streamEnabled||ctl.signal.aborted)return;for(const k of ['roof','wall','ground'])t[k]=tileBuffers(gml[k]);}
 // Always give the tile SOME terrain immediately, never leaving t.terrain
 // undefined (previously a visible void where surrounding terrain is not
 // flat/at height 0). The LoD2 GroundSurface of this tile's own buildings
 // (same survey/elevation datum as the DGM1) is a far more precise local
 // estimate than guessing from distant neighbor tiles, so it takes priority
 // whenever buildings are present; only tiles without any ground-surface
 // data fall back to averaging already-loaded neighbors.
 const buildingHeight=gml?buildingGroundHeight(gml.ground):null;
 if(buildingHeight!=null){t.fallbackHeight=buildingHeight;t.fallbackSource='building';}
 else{t.fallbackHeight=estimateFallbackHeight(x,y);t.fallbackSource='neighbor';}
 t.terrain=tileBuffers(flatTerrainMesh(t.fallbackHeight));
 activeTiles.set(key,t);
 if(dioramaOutlineBB)dioramaOutlineDirty=true;
 if(hasOSM&&!osmMergedTiles.has(key)){try{const or=await fetch('/api/nrw3d/osm/tile?x='+x+'&y='+y,{signal:ctl.signal});if(or.ok){const oj=await or.json();if(streamEnabled&&!ctl.signal.aborted){mergeOSMTile(oj);osmMergedTiles.add(key);}}}catch(oe){/* OSM-Überlagerung ist optional: Fehler hier verhindern nicht die Kachelanzeige. */}}
 updateRoadTile(x,y,t);
 if(dgmIndex.has(key)){try{const tr=await fetch('/api/nrw3d/terrain?x='+x+'&y='+y,{signal:ctl.signal});if(!tr.ok)throw Error((await tr.text()).slice(0,140));const heights=await tr.json();if(!ctl.signal.aborted&&activeTiles.get(key)===t){lastKnownTerrainHeight=tileAverageHeight(heights);setTerrainMesh(t,terrainTriangles(heights));t.heightGrid=heights;delete t.fallbackHeight;delete t.fallbackSource;updateRoadTile(x,y,t);refreshNeighborFallbackTerrain(x,y);if(dioramaOutlineBB)dioramaOutlineDirty=true;}}catch(te){if(te.name!=='AbortError')err.textContent=I18Nf('nrw3d_dgm_error',{key,err:te.message});}}
}catch(e){if(e.name!=='AbortError'){missingTiles.add(key);err.textContent=I18Nf('nrw3d_tile_error',{key,err:e.message});}}finally{pendingTiles.delete(key);}}
function terrainTriangles(tile){
 const n=tile.n,h=tile.heights;if(!Number.isInteger(n)||n<2||h.length!==n*n)return [];
 // Mild inner-only height smoothing; border samples stay exact so adjacent DGM tiles align.
 const heights=new Float32Array(h);
 for(let iy=1;iy<n-1;iy++)for(let ix=1;ix<n-1;ix++){
   const k=iy*n+ix,c=h[k];if(!Number.isFinite(c)||c===0)continue;
   const peers=[h[k-1],h[k+1],h[k-n],h[k+n]];
   if(peers.some(v=>!Number.isFinite(v)||v===0||Math.abs(v-c)>3))continue;
   heights[k]=c*.7+(peers[0]+peers[1]+peers[2]+peers[3])*.075;
 }
 const out=[];const at=(ix,iy)=>[-500+ix*1000/(n-1),heights[iy*n+ix]-.65,500-iy*1000/(n-1)];
 for(let iy=0;iy<n-1;iy++)for(let ix=0;ix<n-1;ix++){
  const a=at(ix,iy),b=at(ix+1,iy),c=at(ix,iy+1),d=at(ix+1,iy+1);
  out.push(...a,...c,...b,...b,...c,...d);
 }return out;
}
// Tiles without a local DGM1 file (not in dgmIndex) previously got NO terrain
// mesh at all, leaving a visible void through to the background exactly where
// surrounding tiles rise or already have real elevation. Every active tile now
// always gets SOME flat terrain immediately (2x2 grid = one quad), estimated
// from already-loaded neighboring tiles' average height when possible, so
// there is never a hole even before/without real DGM1 data for that tile.
let lastKnownTerrainHeight=0;
function tileAverageHeight(g){let s=0,c=0;for(const v of g.heights){if(Number.isFinite(v)&&v!==0){s+=v;c++;}}return c?s/c:0;}
// The GML GroundSurface array is the triangulated footprint of each building
// AT GROUND LEVEL, surveyed in the same official elevation datum as the DGM1
// raster — i.e. real local ground truth, not a guess. Triples are
// [x_rel, height, z_rel] (see nrw3d.go:readNRWGML), so every 3rd value
// starting at index 1 is an absolute elevation in metres.
function buildingGroundHeight(ground){
 if(!ground||ground.length<3)return null;
 let s=0,c=0;for(let i=1;i<ground.length;i+=3){s+=ground[i];c++;}
 return c?s/c:null;
}
// Neighbor estimate: prefer a neighbor's real DGM1 average when available,
// otherwise its own best-known fallback (which may itself be a precise
// building-ground estimate) — a chain of "best available" rather than only
// ever looking at fully-loaded real terrain.
function estimateFallbackHeight(x,y){
 const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
 let sum=0,count=0;
 for(const [dx,dy] of dirs){
  const nt=activeTiles.get(tileKey(x+dx,y+dy));if(!nt)continue;
  if(nt.heightGrid){sum+=tileAverageHeight(nt.heightGrid);count++;}
  else if(Number.isFinite(nt.fallbackHeight)){sum+=nt.fallbackHeight;count++;}
 }
 return count?sum/count:lastKnownTerrainHeight;
}
function flatTerrainMesh(h){return terrainTriangles({n:2,heights:[h,h,h,h]});}
function setTerrainMesh(t,triangles){if(gl&&t.terrain){gl.deleteBuffer(t.terrain.v);gl.deleteBuffer(t.terrain.n);}t.terrain=tileBuffers(triangles);}
// Neighbors that are still showing a flat fallback benefit from a better
// estimate once real DGM1 data arrives nearby; refresh them opportunistically.
// Tiles whose fallback already comes from their OWN building ground-surfaces
// are left untouched — that local ground truth is more trustworthy than a
// generic neighbor-DGM1 average.
function refreshNeighborFallbackTerrain(x,y){
 const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
 for(const [dx,dy] of dirs){
  const key=tileKey(x+dx,y+dy),nt=activeTiles.get(key);
  if(!nt||nt.heightGrid||nt.fallbackSource==='building')continue;
  nt.fallbackHeight=estimateFallbackHeight(x+dx,y+dy);nt.fallbackSource='neighbor';
  setTerrainMesh(nt,flatTerrainMesh(nt.fallbackHeight));
  updateRoadTile(x+dx,y+dy,nt);
 }
}
function updateStreaming(force=false){if(!streamEnabled)return;const now=performance.now();if(!force&&now-lastStreamUpdate<600)return;lastStreamUpdate=now;
const cx=anchorX+Math.floor((target[0]+500)/1000),cy=anchorY+Math.floor((-target[2]+500)/1000);const radius=dist>2300?2:1;const candidates=[];
for(let x=cx-radius;x<=cx+radius;x++)for(let y=cy-radius;y<=cy+radius;y++){const k=tileKey(x,y);if(!indexedTiles.has(k)&&!osmTileIndex.has(k))continue;const d=Math.hypot(x-cx,y-cy);candidates.push({x,y,d});}candidates.sort((a,b)=>a.d-b.d);const keep=new Set(candidates.slice(0,25).map(t=>tileKey(t.x,t.y)));
for(const [key,t] of activeTiles)if(!keep.has(key)){freeTile(t);activeTiles.delete(key);}for(const [key,ctl] of pendingTiles)if(!keep.has(key))ctl.abort();let room=Math.max(0,2-pendingTiles.size);for(const c of candidates.slice(0,25)){if(room<=0)break;const key=tileKey(c.x,c.y);if(!activeTiles.has(key)&&!pendingTiles.has(key)&&!missingTiles.has(key)){loadStreamTile(c.x,c.y);room--;}}
stat.textContent=I18Nf('nrw3d_stream_status',{active:activeTiles.size,osm:osmMergedTiles.size,pending:pendingTiles.size});}
setInterval(()=>updateStreaming(),650);

// Offline OSM GeoJSON: roads, flowing water, and polygonal water bodies.
let roadSegmentsByTile=new Map(),waterSegmentsByTile=new Map(),waterPolygonsByTile=new Map(),roadFeatureCount=0,waterFeatureCount=0;
// Street-name and place-name labels, independently toggleable via #roadNames/#placeNames.
let roadLabelsByTile=new Map(),placeLabelsByTile=new Map();
function utm32(lon,lat){
 const a=6378137,f=1/298.257223563,e2=f*(2-f),ep2=e2/(1-e2),k=.9996;
 const phi=lat*Math.PI/180,lambda=lon*Math.PI/180,lambda0=9*Math.PI/180;
 const N=a/Math.sqrt(1-e2*Math.sin(phi)**2),T=Math.tan(phi)**2,C=ep2*Math.cos(phi)**2,A=Math.cos(phi)*(lambda-lambda0);
 const M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*phi)-(35*e2**3/3072)*Math.sin(6*phi));
 return [500000+k*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120),k*(M+N*Math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720))];
}
function osmPoint(pt){if(!Array.isArray(pt)||pt.length<2)return null;const lon=Number(pt[0]),lat=Number(pt[1]);return Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=5&&lon<=10&&lat>=49&&lat<=53?utm32(lon,lat):null;}
function addSegment(map,a,b,width){const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(d<.01||d>200000)return;
 // Clip segments at 1km tile boundaries: no disappearing cross-border roads.
 const cuts=[0,1];for(let axis=0;axis<2;axis++){const lo=Math.floor(Math.min(a[axis],b[axis])/1000)+1,hi=Math.floor(Math.max(a[axis],b[axis])/1000);for(let i=lo;i<=hi;i++){const t=(i*1000-a[axis])/(b[axis]-a[axis]);if(t>0&&t<1)cuts.push(t);}}
 cuts.sort((x,y)=>x-y);for(let i=1;i<cuts.length;i++){let t0=cuts[i-1],t1=cuts[i];if(t1-t0<1e-10)continue;const mid=(t0+t1)/2,key=tileKey(Math.floor((a[0]+(b[0]-a[0])*mid)/1000),Math.floor((a[1]+(b[1]-a[1])*mid)/1000));if(!map.has(key))map.set(key,[]);map.get(key).push({a:[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0],b:[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1],width});}
}
function roadHeight(tile,e,n){if(!tile?.heightGrid)return tile?.fallbackHeight||0;const g=tile.heightGrid,N=g.n,H=g.heights;
 // heights[] row 0 = SOUTH edge, row N-1 = NORTH edge (see nrw_terrain_windows.go
 // and terrainTriangles() above) — fy must therefore INCREASE with northing n,
 // matching the mesh. (Previously inverted, a leftover from before the DGM1
 // north/south row-flip fix: roads/water sampled the mirrored row, floating
 // above or sinking into the terrain mesh wherever a tile's elevation
 // actually changes from south to north.)
 const fx=Math.max(0,Math.min(N-1,(e-tile.tileX*1000)*(N-1)/1000)),fy=Math.max(0,Math.min(N-1,(n-tile.tileY*1000)*(N-1)/1000));const x=Math.min(N-2,Math.floor(fx)),y=Math.min(N-2,Math.floor(fy)),u=fx-x,v=fy-y;
 return (1-v)*((1-u)*H[y*N+x]+u*H[y*N+x+1])+v*((1-u)*H[(y+1)*N+x]+u*H[(y+1)*N+x+1]);}
function ribbonTriangles(list,t,offset){const out=[];for(const seg of list||[]){const a=seg.a,b=seg.b,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<.01)continue;const w=seg.width/2,nx=-dy/len*w,ny=dx/len*w;
 const point=(p,sign)=>[p[0]+nx*sign-(t.tileX*1000+500),roadHeight(t,p[0]+nx*sign,p[1]+ny*sign)+offset,-p[1]-ny*sign+(t.tileY*1000+500)];
 const a1=point(a,1),a2=point(a,-1),b1=point(b,1),b2=point(b,-1);out.push(...a1,...a2,...b1,...b1,...a2,...b2);}return out;}
function updateRoadTile(x,y,t){t.tileX=x;t.tileY=y;for(const kind of ['roads','waterways','waters']){if(t[kind]){gl.deleteBuffer(t[kind].v);gl.deleteBuffer(t[kind].n);t[kind]=null;}}
 // No early return on missing heightGrid: tiles without local DGM1 data still
 // render roads/water flat at the tile's estimated fallback height (see
 // roadHeight/t.fallbackHeight), matching the flat fallback terrain mesh.
 t.roads=tileBuffers(ribbonTriangles(roadSegmentsByTile.get(tileKey(x,y)),t,.30));
 t.waterways=tileBuffers(ribbonTriangles(waterSegmentsByTile.get(tileKey(x,y)),t,.42));
 const out=[];for(const poly of waterPolygonsByTile.get(tileKey(x,y))||[]){for(const tri of poly){for(const q of tri){out.push(q[0]-(x*1000+500),roadHeight(t,q[0],q[1])+.45,-q[1]+(y*1000+500));}}}t.waters=tileBuffers(out);
}
function lineToMap(line,map,width){let old=null;for(const pt of line||[]){const p=osmPoint(pt);if(p&&old)addSegment(map,old,p,width);old=p;}}
const placeLabelKinds=new Set(['city','town','village','hamlet','suburb','isolated_dwelling','quarter']);
function bucketLabel(map,e,n,entry){const key=tileKey(Math.floor(e/1000),Math.floor(n/1000));const list=map.get(key)||[];list.push(entry);map.set(key,list);}
// Ear clipping for simple water rings (holes not filled; multipolygons handled per outer ring).
function triangulateRing(ring){let pts=ring.map(osmPoint).filter(Boolean);if(pts.length>1&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<.01)pts.pop();if(pts.length<3||pts.length>10000)return [];
 const area=pts.reduce((s,p,i)=>s+p[0]*pts[(i+1)%pts.length][1]-pts[(i+1)%pts.length][0]*p[1],0);if(area<0)pts.reverse();const idx=pts.map((_,i)=>i),out=[];
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);let guard=0;
 while(idx.length>3&&guard++<pts.length*3){let cut=false;for(let k=0;k<idx.length;k++){const ia=idx[(k+idx.length-1)%idx.length],ib=idx[k],ic=idx[(k+1)%idx.length],a=pts[ia],b=pts[ib],c=pts[ic];if(cross(a,b,c)<=1e-8)continue;let inside=false;for(const j of idx){if(j===ia||j===ib||j===ic)continue;const p=pts[j];if(cross(a,b,p)>=0&&cross(b,c,p)>=0&&cross(c,a,p)>=0){inside=true;break;}}if(inside)continue;out.push([a,b,c]);idx.splice(k,1);cut=true;break;}if(!cut)break;}if(idx.length===3)out.push(idx.map(i=>pts[i]));return out;}
function addWaterPolygon(ring){const tris=triangulateRing(ring);for(const tri of tris){
 const minX=Math.floor(Math.min(...tri.map(p=>p[0]))/1000),maxX=Math.floor(Math.max(...tri.map(p=>p[0]))/1000),minY=Math.floor(Math.min(...tri.map(p=>p[1]))/1000),maxY=Math.floor(Math.max(...tri.map(p=>p[1]))/1000);
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
  let poly=tri;
  const planes=[[0,x*1000,1],[0,(x+1)*1000,-1],[1,y*1000,1],[1,(y+1)*1000,-1]];
  for(const [axis,bound,sign] of planes){const clipped=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-bound)*sign,db=(b[axis]-bound)*sign;
    if(da>=0)clipped.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
   poly=clipped;if(poly.length<3)break;}
  if(poly.length<3)continue;const key=tileKey(x,y);if(!waterPolygonsByTile.has(key))waterPolygonsByTile.set(key,[]);
  for(let i=1;i<poly.length-1;i++)waterPolygonsByTile.get(key).push([[poly[0],poly[i],poly[i+1]]]);
 }
}}
// Whole-NRW tile streaming overlay: merges one preprocessed OSM tile (already
// projected to UTM32 and pre-clipped to this 1km tile by tools/osmtiles) into
// the same segment/ring maps the manual GeoJSON import uses. Roads/waterways
// are clipped per-tile already, so pushed directly; water rings can span
// several tiles and are deduped by OSM way id before triangulation.
const osmMergedTiles=new Set(),osmWaterRingSeen=new Set();
function mergeOSMTile(j){
 const key=tileKey(j.x,j.y);
 if(j.roads?.length){const list=roadSegmentsByTile.get(key)||[];for(const s of j.roads)list.push({a:s.a,b:s.b,width:s.width});roadSegmentsByTile.set(key,list);}
 if(j.waterways?.length){const list=waterSegmentsByTile.get(key)||[];for(const s of j.waterways)list.push({a:s.a,b:s.b,width:s.width});waterSegmentsByTile.set(key,list);}
 if(j.waterRings?.length)for(const wr of j.waterRings){if(osmWaterRingSeen.has(wr.id))continue;osmWaterRingSeen.add(wr.id);addWaterPolygon(wr.ring);}
 if(j.roadLabels?.length){const list=roadLabelsByTile.get(key)||[];for(const l of j.roadLabels)list.push({e:l.p[0],n:l.p[1],name:l.name});roadLabelsByTile.set(key,list);}
 if(j.placeLabels?.length){const list=placeLabelsByTile.get(key)||[];for(const l of j.placeLabels)list.push({e:l.p[0],n:l.p[1],name:l.name,place:l.place});placeLabelsByTile.set(key,list);}
}
async function importOSMData(data){if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error(I18N().nrw3d_geojson_required);roadSegmentsByTile=new Map();waterSegmentsByTile=new Map();waterPolygonsByTile=new Map();roadLabelsByTile=new Map();placeLabelsByTile=new Map();roadFeatureCount=0;waterFeatureCount=0;
 for(const f of data.features){const g=f.geometry||{},p=f.properties||{},typ=g.type;const lines=typ==='LineString'?[g.coordinates]:typ==='MultiLineString'?g.coordinates:[];
 if(p.highway||p.railway){const width=p.railway?3:p.highway==='motorway'?13:p.highway==='primary'?9:p.highway==='residential'?5:3;for(const line of lines)lineToMap(line,roadSegmentsByTile,width);roadFeatureCount++;
  if(p.name&&lines[0]?.length){const mid=osmPoint(lines[0][Math.floor(lines[0].length/2)]);if(mid)bucketLabel(roadLabelsByTile,mid[0],mid[1],{e:mid[0],n:mid[1],name:p.name});}}
 if(p.waterway){const width=Number(p.width)||(['river','canal'].includes(p.waterway)?12:4);for(const line of lines)lineToMap(line,waterSegmentsByTile,Math.max(1,Math.min(width,150)));waterFeatureCount++;}
 if(p.natural==='water'||p.water||p.landuse==='reservoir'||p.waterway==='riverbank'){const polys=typ==='Polygon'?[g.coordinates]:typ==='MultiPolygon'?g.coordinates:[];for(const rings of polys)if(rings?.[0])addWaterPolygon(rings[0]);waterFeatureCount++;}
 if(typ==='Point'&&p.name&&placeLabelKinds.has(p.place)){const pt=osmPoint(g.coordinates);if(pt)bucketLabel(placeLabelsByTile,pt[0],pt[1],{e:pt[0],n:pt[1],name:p.name,place:p.place});}
 }
 for(const [key,t] of activeTiles){const [x,y]=key.split(':').map(Number);updateRoadTile(x,y,t);}
 $('osmstatus').textContent=I18Nf('nrw3d_osmstatus_summary',{roads:roadFeatureCount,water:waterFeatureCount,tiles:new Set([...roadSegmentsByTile.keys(),...waterSegmentsByTile.keys(),...waterPolygonsByTile.keys()]).size});
 err.textContent=roadFeatureCount+waterFeatureCount?I18N().nrw3d_osm_loaded:I18N().nrw3d_osm_none_found;
}
// Imported OSM file is kept only in the local browser profile for automatic restoration.
function osmDatabase(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){reject(Error(I18N().nrw3d_indexeddb_unavailable));return;}const req=indexedDB.open('ARK_NRW3D_LOCAL_OSM',1);req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function cacheOSM(text){const db=await osmDatabase();try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(text,'lastGeoJSON');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function restoreOSM(){try{const db=await osmDatabase();const json=await new Promise((resolve,reject)=>{const r=db.transaction('files','readonly').objectStore('files').get('lastGeoJSON');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();if(json){await importOSMData(JSON.parse(json));$('osmstatus').textContent+=I18N().nrw3d_osm_restored_suffix;}}catch(e){console.warn('OSM-Wiederherstellung:',e);}}
$('osmfile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>128*1024*1024){err.textContent=I18N().nrw3d_geojson_too_large;return;}try{const txt=await f.text();await importOSMData(JSON.parse(txt));try{await cacheOSM(txt);}catch(e){err.textContent=I18Nf('nrw3d_osm_not_persisted',{err:e.message});}}catch(ex){err.textContent=I18Nf('nrw3d_osm_import_error',{err:ex.message});}});
restoreOSM();

const oldCatalog=catalog;
catalog();

let selectedControl=-1;const focusable=()=>[...document.querySelectorAll('aside button, aside input, aside select')].filter(el=>el.offsetParent!==null);function stepControl(delta){const els=focusable();if(!els.length)return;selectedControl=(selectedControl+delta+els.length)%els.length;els[selectedControl].focus({preventScroll:true});els[selectedControl].scrollIntoView({block:'nearest'});}
window.addEventListener('message',e=>{if(e.origin!==location.origin||!e.data||!e.data.arkControl)return;
 switch(e.data.arkControl){case 'left':yaw-=.12;break;case 'right':yaw+=.12;break;case 'up':pitch=Math.max(.04,pitch-.09);break;case 'down':pitch=Math.min(1.5,pitch+.09);break;case 'linknext':stepControl(1);break;case 'linkprev':stepControl(-1);break;case 'ok':{const els=focusable();if(selectedControl<0){stepControl(1);break;}const el=els[selectedControl];if(el?.type==='checkbox'){el.checked=!el.checked;el.dispatchEvent(new Event('change'));}else if(el?.tagName==='BUTTON'){el.click();}break;}}
});


// NRW 3D controls: flyout menus overlay canvas, never resize the rendering stage.
(function setupNRWMenus(){
 const source=document.querySelector('#layout aside'),bar=$('nrwBar');
 const groups=[['Standort','PLZ / ORT','nrw3d_group_place'],['Kamera','3D-KAMERA','nrw3d_group_camera'],['Ebenen','EBENEN','nrw3d_group_layers'],['OSM & Wasser','OSM STRASSEN','nrw3d_group_osm'],['Diorama','DIORAMA-EXPORT','nrw3d_group_diorama'],['Daten','NRW DATAGRABBER','nrw3d_group_data']];
 const children=[...source.children];
 for(const [title,heading,i18nKey] of groups){
  const h=children.find(e=>e.tagName==='H2'&&e.textContent.includes(heading));if(!h)continue;
  const detail=document.createElement('details'),summary=document.createElement('summary'),panel=document.createElement('div');
  summary.dataset.i18n=i18nKey;summary.textContent=I18N()[i18nKey]||title;panel.className='drop';detail.append(summary,panel);
  const start=children.indexOf(h);let end=children.length;
  for(let i=start+1;i<children.length;i++)if(children[i].tagName==='H2'){end=i;break;}
  for(const node of children.slice(start,end))panel.append(node);
  bar.append(detail);
 }
 // Error output remains accessible in the data flyout.
 const errNode=$('error');if(errNode){const data=bar.lastElementChild?.querySelector('.drop');data?.append(errNode);}
 bar.addEventListener('toggle',e=>{if(e.target?.tagName==='DETAILS'&&e.target.open)for(const d of bar.querySelectorAll('details'))if(d!==e.target)d.open=false},true);
})();
const nrwLastPlaceKey='ark.nrw3d.lastPlace.v2';
// Stored as 'plz|name' rather than an array index: the PLZ register is
// regenerated per build (src/tools/plzregister) and entry order can shift,
// so an index would risk restoring the wrong place after an update.
function saveLastNRWPlace(p){try{localStorage.setItem(nrwLastPlaceKey,p.plz+'|'+p.name)}catch(e){}}
async function restoreLastNRWPlace(){try{
 await plzRegisterReady;
 const key=localStorage.getItem(nrwLastPlaceKey);if(!key)return;
 const n=localPlaces.findIndex(p=>p.plz+'|'+p.name===key);if(n<0)return;
 const p=localPlaces[n];$('nrwplz').value=p.plz;updatePlaceOptions();$('nrwplace').value=String(n);
 if(tileIndex.length){$('nrwgo').click();}
}catch(e){}}
const nrwGoOriginal=$('nrwgo').onclick;
$('nrwgo').onclick=function(){const idx=Number($('nrwplace').value);if(tileIndex.length&&localPlaces[idx])saveLastNRWPlace(localPlaces[idx]);return nrwGoOriginal.call(this)};
// Discovery is opt-in. No filesystem paths are added before the user confirms.
async function discoverNRWData(){
 const button=$('discoverData');const list=$('discoverResults');button.disabled=true;list.textContent=I18N().nrw3d_discover_searching;
 try{const r=await fetch('/api/nrw3d/discover');if(!r.ok)throw Error(await r.text());const data=await r.json();list.replaceChildren();
  if(!data.candidates?.length){list.textContent=I18N().nrw3d_discover_none_found;return;}
  for(const candidate of data.candidates){const row=document.createElement('div');row.style='margin:8px 0;border-bottom:1px solid #355;padding-bottom:8px';const line=document.createElement('div');line.textContent=candidate;line.style='overflow-wrap:anywhere;font-size:11px';const b=document.createElement('button');b.textContent=I18N().nrw3d_discover_adopt_btn;b.onclick=async()=>{if(!confirm(I18Nf('nrw3d_discover_confirm',{path:candidate})))return;$('path').value=candidate;$('connect').click();};row.append(line,b);list.append(row);}
 }catch(e){list.textContent=I18Nf('nrw3d_discover_failed',{err:e.message});}finally{button.disabled=false;}
}
(function(){const data=$('path').parentElement;const b=document.createElement('button');b.id='discoverData';b.textContent=I18N().nrw3d_discover_search_btn;b.style='width:100%;margin-top:8px';const d=document.createElement('div');d.id='discoverResults';d.className='hint';$('connect').after(b,d);b.onclick=discoverNRWData;})();

// Automatic OSM GeoJSON discovery: bounded backend drive scan, user confirms before import.
async function discoverOSMData(){
 const button=$('osmDiscover'),list=$('osmDiscoverResults');button.disabled=true;list.textContent=I18N().nrw3d_osm_discover_searching;
 try{const r=await fetch('/api/nrw3d/osm/discover');if(!r.ok)throw Error(await r.text());const data=await r.json();list.replaceChildren();
  if(!data.candidates?.length){list.textContent=I18N().nrw3d_osm_discover_none;return;}
  for(const c of data.candidates){const row=document.createElement('div');row.style='margin:8px 0;border-bottom:1px solid #355;padding-bottom:8px';
   const line=document.createElement('div');line.textContent=`${c.file} · ${(c.bytes/1048576).toFixed(1)} MB`;line.style='overflow-wrap:anywhere;font-size:11px';
   const b=document.createElement('button');b.textContent=I18N().nrw3d_osm_adopt_btn;
   b.onclick=async()=>{if(!confirm(I18Nf('nrw3d_osm_confirm',{file:c.file})))return;
    b.disabled=true;b.textContent=I18N().nrw3d_osm_loading_btn;
    try{const fr=await fetch('/api/nrw3d/osm/file?file='+encodeURIComponent(c.file));if(!fr.ok)throw Error(await fr.text());const txt=await fr.text();
     await importOSMData(JSON.parse(txt));
     try{await cacheOSM(txt);}catch(e){err.textContent=I18Nf('nrw3d_osm_not_persisted',{err:e.message});}
    }catch(ex){err.textContent=I18Nf('nrw3d_osm_adopt_error',{err:ex.message});}
    finally{b.disabled=false;b.textContent=I18N().nrw3d_osm_adopt_btn;}};
   row.append(line,b);list.append(row);}
  if(data.truncated){const hint=document.createElement('div');hint.className='hint';hint.textContent=I18N().nrw3d_osm_truncated_hint;list.append(hint);}
 }catch(e){list.textContent=I18Nf('nrw3d_discover_failed',{err:e.message});}finally{button.disabled=false;}
}
(function(){const b=document.createElement('button');b.id='osmDiscover';b.textContent=I18N().nrw3d_osm_discover_search_btn;b.style='width:100%;margin-top:8px';const d=document.createElement('div');d.id='osmDiscoverResults';d.className='hint';$('osmstatus').after(b,d);b.onclick=discoverOSMData;})();
