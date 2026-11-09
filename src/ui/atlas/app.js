'use strict';
import {Map as OfflineMap, NavigationControl as OfflineNavigationControl} from './osm-fallback.js';
let maplibregl={Map:OfflineMap,NavigationControl:OfflineNavigationControl};
const el=id=>document.getElementById(id),can=el('map'),ctx=can.getContext('2d',{alpha:false});
const keys={countries:'coasts',lakes:'lakes',rivers:'rivers',places:'places'};
const state={longitude:4,latitude:10,zoom:0,detail:false,mode:'world',features:{},visible:{countries:true,lakes:true,rivers:true,places:true},available:new Set(),hover:'',total:0};
const dataset={world:{countries:'ne_110m_admin_0_countries',land:'ne_110m_land',lakes:'ne_110m_lakes',rivers:'ne_110m_rivers_lake_centerlines',places:'ne_110m_populated_places'},detail:{countries:'ne_50m_admin_0_countries',land:'ne_50m_land',lakes:'ne_50m_lakes',rivers:'ne_50m_rivers_lake_centerlines',places:'ne_50m_populated_places'}};
let width=1000,height=650,dragging=false,startX=0,startY=0,lastX=0,lastY=0,pointers=new Map(),pinchDist=0,renderPending=false;
function constrainLat(lat){return Math.max(-81,Math.min(81,lat))}
function coordX(lon){return (lon+180)/360}
function coordY(lat){const phi=constrainLat(lat)*Math.PI/180;return .5-Math.log(Math.tan(Math.PI/4+phi/2))/(2*Math.PI)}
function invLat(y){return Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI}
function worldScale(){return width/360*Math.pow(1.9,state.zoom)}
function project(lon,lat){let dx=lon-state.longitude;while(dx>180)dx-=360;while(dx< -180)dx+=360;return [width/2+dx*worldScale(),height/2+(coordY(lat)-coordY(state.latitude))*360*worldScale()]}
function unproject(x,y){let lng=state.longitude+(x-width/2)/worldScale();while(lng>180)lng-=360;while(lng< -180)lng+=360;let cy=coordY(state.latitude)+(y-height/2)/(360*worldScale());return [lng,invLat(cy)]}
function schedule(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;render()})}
function resize(){const dpr=Math.min(2,window.devicePixelRatio||1);width=can.clientWidth;height=can.clientHeight;can.width=Math.round(width*dpr);can.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);schedule()}
function fillOcean(){let gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,'#092934');gradient.addColorStop(1,'#04151e');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);ctx.strokeStyle='#1d465080';ctx.lineWidth=.7;ctx.beginPath();for(let lat=-60;lat<=80;lat+=20){for(let lon=-180;lon<=180;lon+=5){const [x,y]=project(lon,lat);if(lon===-180)ctx.moveTo(x,y);else ctx.lineTo(x,y)}}for(let lon=-180;lon<=180;lon+=20){for(let lat=-80;lat<=80;lat+=4){const[x,y]=project(lon,lat);if(lat===-80)ctx.moveTo(x,y);else ctx.lineTo(x,y)}}ctx.stroke()}
function coordsOf(g){if(!g)return[];switch(g.type){case'Polygon':return[g.coordinates];case'MultiPolygon':return g.coordinates;case'LineString':return[[g.coordinates]];case'MultiLineString':return g.coordinates.map(x=>[x]);default:return[]}}
function drawPoly(g,fill,stroke,lineWidth){const polygons=coordsOf(g);ctx.beginPath();let drew=false;for(const polygon of polygons){for(const ring of polygon){let prevX=null;let started=false;for(const pt of ring){const[x,y]=project(pt[0],pt[1]);if(!Number.isFinite(x)||!Number.isFinite(y)){prevX=null;continue}if(prevX!==null && Math.abs(x-prevX)>180*worldScale()){started=false;prevX=null}if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);prevX=x;drew=true;}if(g.type==='Polygon'||g.type==='MultiPolygon')ctx.closePath()}}if(!drew)return;if(fill){ctx.fillStyle=fill;ctx.fill('evenodd')}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke()}}
function drawLand(){const land=state.features.land||state.features.countries||[];land.forEach(f=>drawPoly(f.geometry,'#153a34','#3f8276',.65));if(state.visible.countries){(state.features.countries||[]).forEach(f=>drawPoly(f.geometry,null,'#71a897b5',.8))}}
function drawWater(){if(!state.visible.lakes)return;(state.features.lakes||[]).forEach(f=>drawPoly(f.geometry,'#184f68','#367f9d',.8))}
function drawRivers(){if(!state.visible.rivers)return;(state.features.rivers||[]).forEach(f=>drawPoly(f.geometry,null,'#3d84aa',.72))}
function drawPlaces(){if(!state.visible.places)return;ctx.font='11px Segoe UI, sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';let shown=0;const minGap=state.zoom<1?27:18;const labels=[];for(const f of (state.features.places||[])){if(f.geometry?.type!=='Point')continue;const xy=f.geometry.coordinates,[x,y]=project(xy[0],xy[1]);if(x<8||y<0||x>width-15||y>height)continue;const name=f.properties?.name;if(!name)continue;if(labels.some(p=>Math.abs(p[0]-x)<minGap*2 && Math.abs(p[1]-y)<minGap))continue;labels.push([x,y]);ctx.fillStyle='#f4c48e';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#032028';ctx.lineWidth=3;ctx.strokeText(name,x+5,y);ctx.fillStyle='#e3e9d7';ctx.fillText(name,x+5,y);if(++shown>130)break}}
function render(){fillOcean();drawLand();drawWater();drawRivers();drawPlaces();el('coordinate').textContent=`${Math.abs(state.latitude).toFixed(1)}° ${state.latitude>=0?'N':'S'} / ${Math.abs(state.longitude).toFixed(1)}° ${state.longitude>=0?'E':'W'} · ZOOM ${state.zoom.toFixed(1)}`}
function setZoom(z){state.zoom=Math.max(0,Math.min(7,z));schedule()}
function changeCenter(dx,dy){state.longitude-=dx/worldScale();while(state.longitude>180)state.longitude-=360;while(state.longitude< -180)state.longitude+=360;state.latitude=constrainLat(invLat(coordY(state.latitude)-dy/(360*worldScale())));schedule()}
can.addEventListener('pointerdown',e=>{can.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);dragging=true;lastX=e.clientX;lastY=e.clientY});can.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const p=[...pointers.values()];const dist=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(pinchDist) setZoom(state.zoom+Math.log(dist/pinchDist)/Math.log(1.9));pinchDist=dist}else if(dragging){changeCenter(e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY}});function endPointer(e){pointers.delete(e.pointerId);dragging=false;pinchDist=0};can.addEventListener('pointerup',endPointer);can.addEventListener('pointercancel',endPointer);can.addEventListener('wheel',e=>{e.preventDefault();setZoom(state.zoom+(e.deltaY<0?.32:-.32))},{passive:false});
el('plus').onclick=()=>setZoom(state.zoom+.6);el('minus').onclick=()=>setZoom(state.zoom-.6);el('reset').onclick=()=>{state.latitude=10;state.longitude=4;setZoom(0)};
for(const[k,id]of Object.entries(keys)){el(id).onchange=e=>{state.visible[k]=e.target.checked;schedule()}}
function progress(head,text,percent){el('loader').classList.add('show');el('loadHead').textContent=head;el('loadText').textContent=text;el('fill').style.width=percent+'%'}
function hideProgress(){el('loader').classList.remove('show')}
function askPath(error){progress(I18N().atlas_connect_source_heading,I18N().atlas_connect_source_text,0);el('setup').classList.add('show');el('error').textContent=error||''}
async function api(url,options){const res=await fetch(url,options);if(!res.ok)throw Error((await res.text()).slice(0,400));return res.json()}
async function setAtlasPath(){try{const p=el('filePath').value.trim();progress(I18N().atlas_gpkg_checking_heading,I18N().atlas_gpkg_checking_text,10);el('setup').classList.remove('show');const data=await api('/api/atlas/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p})});state.available=new Set((data.layers||[]).map(l=>l.name));await loadLayers()}catch(e){askPath(e.message)}}
el('savePath').onclick=setAtlasPath;
async function loadLayers(){const lvl=state.detail?'detail':'world',catalog=dataset[lvl];state.features={};const needed=['land','countries','lakes','rivers','places'].filter(k=>state.available.has(catalog[k]));if(!needed.length){askPath(I18N().atlas_layers_not_found);return}let done=0,skipped=0;progress(I18N().atlas_layers_loading_heading,I18Nf('atlas_layers_loading_text',{lvl:lvl.toUpperCase(),count:needed.length}),2);for(const k of needed){progress(I18Nf('atlas_layer_progress_heading',{lvl:lvl.toUpperCase()}),I18Nf('atlas_layer_progress_text',{done:done+1,total:needed.length,name:k}),Math.round(done/needed.length*100));try{const data=await api('/api/atlas/layer?name='+encodeURIComponent(catalog[k]));state.features[k]=data.features;skipped+=(data.skipped||0)}catch(e){console.warn(k,e.message)}done++;schedule()}el('loaded').textContent=I18Nf('atlas_loaded_summary',{lvl:lvl.toUpperCase(),done,skipped});hideProgress();schedule()}
el('world').onclick=()=>switchScale(false);el('detail').onclick=()=>switchScale(true);
function setActiveTab(){el('world').classList.toggle('active',state.mode==='world');el('detail').classList.toggle('active',state.mode==='detail');el('osm').classList.toggle('active',state.mode==='osm')}
function showCanvas(){el('map').style.display='block';el('maplibreMap').style.display='none';el('legend').style.display='';el('zoomBox').style.display='';el('statusBox').style.display='';el('osmLegend').style.display='none'}
async function switchScale(v){state.mode=v?'detail':'world';if(state.detail!==v){state.detail=v;await loadLayers()}showCanvas();setActiveTab()}
// PMTiles-Weltbasiskarte (OSM, via /api/atlas/basemap/tile) als eigener,
// unabhängig gerenderter Reiter neben den Natural-Earth-Ansichten. MapLibre
// übernimmt hier Projektion, Pan/Zoom und Vektorkachel-Rendering komplett
// selbst, statt den handgeschriebenen Canvas-Renderer oben zu verändern.
let maplibreMap=null,maplibreLoading=null;
// Gruppierung der MapLibre-Layer-IDs nach den Checkboxen im OSM-Ebenenpanel.
// "places" fasst die Punktmarker UND alle Namensbeschriftungen zusammen, da
// der Nutzer das als eine logische Ebene ("Orte & Städtenamen") begreift.
const osmLayerGroups={places:['places','place-country-label','place-region-label','place-city-label','place-town-label','place-neighbourhood-label'],roads:['roads-motorway', 'roads-primary', 'roads-secondary', 'roads-tertiary', 'roads-unclassified', 'roads-residential', 'roads-service', 'roads-path', 'roads-footway', 'roads-other'],buildings:['buildings'],water:['water'],landuse:['landcover','landuse'],boundaries:['boundaries'],pois:['pois']};
// Welche Layer tatsaechlich Namenstexte zeigen (fuer den Sprachumschalter) -
// "places" selbst ist nur die Punktmarker-Ebene (circle), daher ausgenommen.
const osmLabelLayers=['place-country-label','place-region-label','place-city-label','place-town-label','place-neighbourhood-label'];
// ARK-Systemsprache: wird im Haupt-Shell-Header (Button neben "HILFE") per
// localStorage.ark.lang gesetzt und hier (als Atlas-iframe, gleiche Origin)
// ueber das "storage"-Event live uebernommen. Default: Deutsch.
function arkLang(){return localStorage.getItem('ark.lang')==='en'?'en':'de'}
// ARK-Systemsprache-Wörterbuch fuer die Atlas-Oberflaeche (Chrome, nicht Kartendaten).
const ARK_ATLAS_I18N={
 de:{
  atlas_canvas_aria:'Interaktive offline Weltkarte',atlas_kicker:'ARK-02 // KARTEN',atlas_tab_world:'WELT',atlas_tab_osm:'OSM WELTWEIT',atlas_tab_osm_title:'Weltweite OSM-Vektorbasiskarte aus der lokalen PMTiles-Datei',
  atlas_search_placeholder:'Land oder Stadt finden ...',atlas_search_aria:'Ort suchen',atlas_search_btn:'SUCHEN',
  atlas_zoom_in_title:'Vergrößern',atlas_zoom_out_title:'Verkleinern',atlas_zoom_reset_title:'Zur Weltansicht',
  atlas_legend_heading:'// KARTENEBENEN',atlas_layer_countries:'Länder',atlas_layer_water:'Gewässer',atlas_layer_rivers:'Flüsse',atlas_layer_places:'Städte',atlas_legend_hint:'Ziehen: verschieben · Mausrad: Zoom · Touch: Pinch',atlas_legend_warning:'Geografische Grundkarte, noch kein Höhenrelief/Straßenatlas.',
  atlas_osm_legend_heading:'// OSM KARTENEBENEN',atlas_osm_layer_places:'Orte & Städtenamen',atlas_osm_layer_roads:'Straßen & Gleise',atlas_osm_layer_buildings:'Gebäude',atlas_osm_layer_water:'Gewässer',atlas_osm_layer_landuse:'Landnutzung',atlas_osm_layer_boundaries:'Grenzen',atlas_osm_layer_pois:'Sehenswürdigkeiten',atlas_osm_legend_hint:'Ziehen: verschieben · Mausrad/Pinch: Zoom · Rechtsklick ziehen: Drehen',atlas_osm_legend_warning:'Weltweite OSM-Vektorbasiskarte, lokal aus PMTiles gerendert.',
  atlas_status_checking:'DATEN WERDEN GEPRÜFT',atlas_loader_heading:'WORLD ATLAS INITIALISIERT',atlas_loader_text_default:'Prüfe Natural-Earth-GeoPackage ...',atlas_setup_label:'Dateipfad zur vorhandenen Natural-Earth-GPKG:',atlas_setup_save_btn:'GPKG SCHREIBGESCHÜTZT ÖFFNEN',
  atlas_connect_source_heading:'DATENQUELLE VERBINDEN',atlas_connect_source_text:'Natural Earth wird direkt von der SSD gelesen. Keine Datei wird verändert.',
  atlas_gpkg_checking_heading:'GEOPACKAGE WIRD GEPRÜFT',atlas_gpkg_checking_text:'Datei wird schreibgeschützt geöffnet ...',
  atlas_layers_loading_heading:'KARTENEBENEN WERDEN GELADEN',atlas_layers_loading_text:'Aufbereitung {lvl} – {count} Layer',
  atlas_layer_progress_heading:'NATURAL EARTH · {lvl}',atlas_layer_progress_text:'Ebene {done}/{total}: {name}',
  atlas_loaded_summary:'{lvl} · {done} EBENEN · {skipped} AUSGELASSEN',
  atlas_layers_not_found:'Die erwarteten Natural-Earth-Ebenen wurden in der GPKG nicht gefunden.',atlas_gpkg_not_found:'GeoPackage wird noch nicht gefunden.',
  atlas_no_results:'Kein Treffer in den geladenen Natural-Earth-Ebenen.',
  atlas_basemap_not_found:'PMTiles-Weltbasiskarte nicht gefunden: {err}',atlas_unknown_error:'unbekannter Fehler',atlas_osm_attribution:'© OpenStreetMap-Mitwirkende',
 },
 en:{
  atlas_canvas_aria:'Interactive offline world map',atlas_kicker:'ARK-02 // MAPS',atlas_tab_world:'WORLD',atlas_tab_osm:'OSM WORLDWIDE',atlas_tab_osm_title:'Worldwide OSM vector basemap from the local PMTiles file',
  atlas_search_placeholder:'Find country or city ...',atlas_search_aria:'Search place',atlas_search_btn:'SEARCH',
  atlas_zoom_in_title:'Zoom in',atlas_zoom_out_title:'Zoom out',atlas_zoom_reset_title:'Back to world view',
  atlas_legend_heading:'// MAP LAYERS',atlas_layer_countries:'Countries',atlas_layer_water:'Water bodies',atlas_layer_rivers:'Rivers',atlas_layer_places:'Cities',atlas_legend_hint:'Drag: pan · Mouse wheel: zoom · Touch: pinch',atlas_legend_warning:'Geographic base map, no elevation relief/road atlas yet.',
  atlas_osm_legend_heading:'// OSM MAP LAYERS',atlas_osm_layer_places:'Places & city names',atlas_osm_layer_roads:'Roads & tracks',atlas_osm_layer_buildings:'Buildings',atlas_osm_layer_water:'Water bodies',atlas_osm_layer_landuse:'Land use',atlas_osm_layer_boundaries:'Boundaries',atlas_osm_layer_pois:'Points of interest',atlas_osm_legend_hint:'Drag: pan · Mouse wheel/pinch: zoom · Right-click drag: rotate',atlas_osm_legend_warning:'Worldwide OSM vector basemap, rendered locally from PMTiles.',
  atlas_status_checking:'CHECKING DATA',atlas_loader_heading:'WORLD ATLAS INITIALIZING',atlas_loader_text_default:'Checking Natural Earth GeoPackage ...',atlas_setup_label:'File path to an existing Natural Earth GPKG:',atlas_setup_save_btn:'OPEN GPKG READ-ONLY',
  atlas_connect_source_heading:'CONNECTING DATA SOURCE',atlas_connect_source_text:'Natural Earth is read directly from the SSD. No file is modified.',
  atlas_gpkg_checking_heading:'CHECKING GEOPACKAGE',atlas_gpkg_checking_text:'Opening file read-only ...',
  atlas_layers_loading_heading:'LOADING MAP LAYERS',atlas_layers_loading_text:'Preparing {lvl} – {count} layers',
  atlas_layer_progress_heading:'NATURAL EARTH · {lvl}',atlas_layer_progress_text:'Layer {done}/{total}: {name}',
  atlas_loaded_summary:'{lvl} · {done} LAYERS · {skipped} SKIPPED',
  atlas_layers_not_found:'The expected Natural Earth layers were not found in the GPKG.',atlas_gpkg_not_found:'GeoPackage not found yet.',
  atlas_no_results:'No match in the loaded Natural Earth layers.',
  atlas_basemap_not_found:'PMTiles world basemap not found: {err}',atlas_unknown_error:'unknown error',atlas_osm_attribution:'© OpenStreetMap contributors',
 },
};
function I18N(){return ARK_ATLAS_I18N[arkLang()]||ARK_ATLAS_I18N.de}
function I18Nf(key,vars){let s=I18N()[key]||'';if(vars)for(const k in vars)s=s.split('{'+k+'}').join(vars[k]);return s}
function applyAtlasTranslations(){
 document.documentElement.lang=arkLang();
 const dict=I18N();
 document.querySelectorAll('[data-i18n]').forEach(el=>{const v=dict[el.dataset.i18n];if(v!==undefined)el.textContent=v;});
 document.querySelectorAll('[data-i18n-title]').forEach(el=>{const v=dict[el.dataset.i18nTitle];if(v!==undefined)el.title=v;});
 document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{const v=dict[el.dataset.i18nPlaceholder];if(v!==undefined)el.placeholder=v;});
 document.querySelectorAll('[data-i18n-aria]').forEach(el=>{const v=dict[el.dataset.i18nAria];if(v!==undefined)el.setAttribute('aria-label',v);});
}
applyAtlasTranslations();
// OSM/Protomaps liefert "name" (lokaler Name) sowie uebersetzte Varianten wie
// "name:de"/"name:en". Fallback auf den lokalen Namen, falls keine Uebersetzung vorhanden ist.
function nameField(){return arkLang()==='en'?['coalesce',['get','name:en'],['get','name']]:['coalesce',['get','name:de'],['get','name']]}
function applyLabelLanguage(){if(!maplibreMap)return;const field=nameField();for(const id of osmLabelLayers)if(maplibreMap.getLayer(id))maplibreMap.setLayoutProperty(id,'text-field',field)}
window.addEventListener('storage',e=>{if(e.key==='ark.lang'){applyLabelLanguage();applyAtlasTranslations()}});
state.osmVisible={places:true,roads:true,buildings:true,water:true,landuse:true,boundaries:true,pois:true};
function applyOsmLayerVisibility(){if(!maplibreMap)return;for(const[key,ids]of Object.entries(osmLayerGroups)){const vis=state.osmVisible[key]?'visible':'none';for(const id of ids)if(maplibreMap.getLayer(id))maplibreMap.setLayoutProperty(id,'visibility',vis)}}
function setOsmLayerVisible(key,visible){state.osmVisible[key]=visible;applyOsmLayerVisibility()}
for(const key of Object.keys(osmLayerGroups)){const node=el('osm-'+key);if(node)node.onchange=e=>setOsmLayerVisible(key,e.target.checked)}
function basemapStyle(status){
	const tiles=[location.origin+'/api/atlas/basemap/tile?z={z}&x={x}&y={y}'];
	// Schriftglyphen (SIL-OFL, vendored von protomaps/basemaps-assets) fuer
	// Orts-/Strassennamen; 0-255.pbf deckt Basic Latin + Latin-1 Supplement ab,
	// also auch deutsche Umlaute und ß.
	const glyphs=location.origin+'/atlas/vendor/glyphs/{fontstack}/{range}.pbf';
	// "min_zoom" ist ein von Protomaps mitgeliefertes Feld, das die sinnvolle
	// Anzeige-Zoomstufe je Ort vorschlaegt (kleine Orte erst bei hoher Zoomstufe) -
	// damit werden mit zunehmendem Zoom automatisch immer mehr Namen sichtbar.
	const atZoom=field=>['<=',['coalesce',['get',field],0],['zoom']];
	const importance=['-',0,['coalesce',['get','population_rank'],0]];
	const osmRoadKind=['coalesce',['get','kind_detail'],['get','kind'],'unknown'];
	const roadCategories=['motorway', 'motorway_link', 'trunk', 'trunk_link', 'highway', 'primary', 'primary_link', 'secondary', 'secondary_link', 'major_road', 'tertiary', 'tertiary_link', 'unclassified', 'minor_road', 'residential', 'living_street', 'street', 'road', 'service', 'pedestrian', 'track', 'path', 'cycleway', 'bridleway', 'footway', 'steps', 'sidewalk', 'corridor'];
	const roadLayers=[
		{id:'roads-motorway',type:'line',source:'basemap','source-layer':'roads',minzoom:5,filter:['in',osmRoadKind,['literal',['motorway', 'motorway_link', 'trunk', 'trunk_link', 'highway']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-primary',type:'line',source:'basemap','source-layer':'roads',minzoom:6,filter:['in',osmRoadKind,['literal',['primary', 'primary_link']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-secondary',type:'line',source:'basemap','source-layer':'roads',minzoom:7,filter:['in',osmRoadKind,['literal',['secondary', 'secondary_link', 'major_road']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-tertiary',type:'line',source:'basemap','source-layer':'roads',minzoom:9,filter:['in',osmRoadKind,['literal',['tertiary', 'tertiary_link']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-unclassified',type:'line',source:'basemap','source-layer':'roads',minzoom:11,filter:['in',osmRoadKind,['literal',['unclassified', 'minor_road']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-residential',type:'line',source:'basemap','source-layer':'roads',minzoom:12,filter:['in',osmRoadKind,['literal',['residential', 'living_street', 'street', 'road']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-service',type:'line',source:'basemap','source-layer':'roads',minzoom:13,filter:['in',osmRoadKind,['literal',['service', 'pedestrian']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-path',type:'line',source:'basemap','source-layer':'roads',minzoom:14,filter:['in',osmRoadKind,['literal',['track', 'path', 'cycleway', 'bridleway']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-footway',type:'line',source:'basemap','source-layer':'roads',minzoom:15,filter:['in',osmRoadKind,['literal',['footway', 'steps', 'sidewalk', 'corridor']]],paint:{'line-color':'#74e0bc','line-width':1}},
		{id:'roads-other',type:'line',source:'basemap','source-layer':'roads',minzoom:12,filter:['!', ['in',osmRoadKind,['literal',roadCategories]]],paint:{'line-color':'#74e0bc','line-width':1}}
	];
		return{version:8,glyphs,sources:{basemap:{type:'vector',tiles,minzoom:status.minZoom||0,maxzoom:status.maxZoom||15,attribution:status.attribution||I18N().atlas_osm_attribution}},layers:[
		{id:'bg',type:'background',paint:{'background-color':'#07171b'}},
		{id:'earth',type:'fill',source:'basemap','source-layer':'earth',paint:{'fill-color':'#15302c'}},
		{id:'landcover',type:'fill',source:'basemap','source-layer':'landcover',paint:{'fill-color':'#1c3b32','fill-opacity':.5}},
		{id:'landuse',type:'fill',source:'basemap','source-layer':'landuse',paint:{'fill-color':'#22463c','fill-opacity':.4}},
		{id:'water',type:'fill',source:'basemap','source-layer':'water',paint:{'fill-color':'#184f68'}},
		{id:'buildings',type:'fill',source:'basemap','source-layer':'buildings',minzoom:13,paint:{'fill-color':'#3a5a52','fill-opacity':.85}},
		...roadLayers,
		{id:'boundaries',type:'line',source:'basemap','source-layer':'boundaries',paint:{'line-color':'#f8ba70','line-width':1,'line-dasharray':[2,2]}},
		{id:'places',type:'circle',source:'basemap','source-layer':'places',minzoom:3,paint:{'circle-color':'#f4c48e','circle-radius':2.4}},
		{id:'pois',type:'circle',source:'basemap','source-layer':'pois',minzoom:15,paint:{'circle-color':'#e3e9d7','circle-radius':1.6}},
		{id:'place-country-label',type:'symbol',source:'basemap','source-layer':'places',filter:['all',['==',['get','kind'],'country'],['has','name']],layout:{'text-field':nameField(),'text-font':['Noto Sans Medium'],'text-transform':'uppercase','text-letter-spacing':.04,'text-size':['interpolate',['linear'],['zoom'],0,11,3,14,6,18],'text-max-width':8,'symbol-sort-key':importance},paint:{'text-color':'#fbe0b6','text-halo-color':'#06201c','text-halo-width':1.4}},
		{id:'place-region-label',type:'symbol',source:'basemap','source-layer':'places',filter:['all',['==',['get','kind'],'region'],['has','name'],atZoom('min_zoom')],layout:{'text-field':nameField(),'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],3,10,6,12,9,15],'text-max-width':8},paint:{'text-color':'#d9c197','text-halo-color':'#06201c','text-halo-width':1.2}},
		{id:'place-city-label',type:'symbol',source:'basemap','source-layer':'places',filter:['all',['==',['get','kind'],'locality'],['==',['get','kind_detail'],'city'],['has','name'],atZoom('min_zoom')],layout:{'text-field':nameField(),'text-font':['Noto Sans Medium'],'text-size':['interpolate',['linear'],['zoom'],2,11,6,13,10,16,14,20],'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':.55,'symbol-sort-key':importance},paint:{'text-color':'#fff3df','text-halo-color':'#06201c','text-halo-width':1.5}},
		{id:'place-town-label',type:'symbol',source:'basemap','source-layer':'places',filter:['all',['==',['get','kind'],'locality'],['!=',['get','kind_detail'],'city'],['has','name'],atZoom('min_zoom')],layout:{'text-field':nameField(),'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],5,10,9,12,13,15],'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':.5,'symbol-sort-key':importance},paint:{'text-color':'#f4e3c6','text-halo-color':'#06201c','text-halo-width':1.2}},
		{id:'place-neighbourhood-label',type:'symbol',source:'basemap','source-layer':'places',minzoom:12,filter:['all',['in',['get','kind'],['literal',['neighbourhood','macrohood']]],['has','name']],layout:{'text-field':nameField(),'text-font':['Noto Sans Italic'],'text-size':11},paint:{'text-color':'#b7cfc4','text-halo-color':'#06201c','text-halo-width':1}}
	]}
}
async function ensureMaplibre(){
	if(maplibreMap)return maplibreMap;
	if(maplibreLoading)return maplibreLoading;
	maplibreLoading=(async()=>{
		// MapLibre is optional: the V0.4.2 archive omitted its JavaScript binary.
		// Keep OSM genuinely offline with the bundled vector-tile Canvas renderer.
		try { const native=await import('./vendor/maplibre-gl/maplibre-gl.mjs'); if(native.Map) maplibregl=native; } catch(_) { /* offline fallback */ }
		let status;
		try{status=await api('/api/atlas/basemap/status')}catch(e){status={ready:false,error:e.message}}
		if(!status.ready){el('maplibreMap').textContent=I18Nf('atlas_basemap_not_found',{err:status.error||I18N().atlas_unknown_error});return null}
		maplibreMap=new maplibregl.Map({container:'maplibreMap',style:basemapStyle(status),center:[state.longitude,state.latitude],zoom:1});
		maplibreMap.addControl(new maplibregl.NavigationControl(),'top-right');
		maplibreMap.on('load',applyOsmLayerVisibility);
		return maplibreMap
	})();
	return maplibreLoading
}
async function showOsm(){state.mode='osm';el('map').style.display='none';el('maplibreMap').style.display='block';el('legend').style.display='none';el('zoomBox').style.display='none';el('statusBox').style.display='none';el('osmLegend').style.display='';setActiveTab();const m=await ensureMaplibre();if(m)requestAnimationFrame(()=>m.resize())}
el('osm').onclick=()=>{showOsm()};
function features(){return[...(state.features.countries||[]),...(state.features.places||[]),...(state.features.lakes||[])]}
function findCenter(f){const g=f.geometry;if(g.type==='Point')return g.coordinates;let sx=0,sy=0,n=0;const collect=c=>{if(Array.isArray(c)&&typeof c[0]==='number'){sx+=c[0];sy+=c[1];n++}else if(Array.isArray(c))c.forEach(collect)};collect(g.coordinates);return n?[sx/n,sy/n]:[0,0]}
function searchPlace(){const term=el('find').value.trim().toLowerCase();const matches=features().filter(f=>f.properties?.name?.toLowerCase().includes(term)).slice(0,25);const r=el('results');r.replaceChildren();if(!term){r.classList.remove('show');return}if(!matches.length){const p=document.createElement('p');p.textContent=I18N().atlas_no_results;p.style.padding='9px';r.appendChild(p)}for(const f of matches){const b=document.createElement('button');b.textContent=f.properties.name;b.onclick=()=>{const p=findCenter(f);state.longitude=p[0];state.latitude=constrainLat(p[1]);setZoom(Math.max(state.zoom,2.4));r.classList.remove('show')};r.appendChild(b)}r.classList.add('show')}
el('findBtn').onclick=searchPlace;el('find').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlace()});
window.addEventListener('message',e=>{if(e.origin!==location.origin||!e.data?.arkControl)return;const code=e.data.arkControl;if(code==='up')changeCenter(0,-100);else if(code==='down')changeCenter(0,100);else if(code==='left')changeCenter(-100,0);else if(code==='right')changeCenter(100,0);else if(code==='linkprev')setZoom(state.zoom-.6);else if(code==='linknext')setZoom(state.zoom+.6);else if(code==='ok')el('find').focus()});
async function start(){try{const data=await api('/api/atlas/status');if(data.path)el('filePath').value=data.path;if(!data.ready){askPath(data.error||I18N().atlas_gpkg_not_found);return}state.available=new Set((data.layers||[]).map(l=>l.name));await loadLayers()}catch(e){askPath(e.message)}}
window.addEventListener('resize',()=>{resize();if(maplibreMap)maplibreMap.resize()});
// Never leave the initialization overlay blocking controls indefinitely.
resize();start();
