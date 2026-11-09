'use strict';
// Diorama-STL-Export: Portierung der bewaehrten Druckgeometrie aus dem
// eigenstaendigen Sechtem-3D-Prototyp (Sechtem_3D V1.4.4, "2-mm-Schnittrand-
// Test") auf ARK NRW-3D. Arbeitet direkt in absoluten UTM32-Metern
// (x=Rechtswert/Ostung, z=Hochwert/Nordung, y=Hoehe) und laedt bei Bedarf
// zusaetzliche DGM1-/LoD2-/OSM-Kacheln ueber den gewaehlten Ausschnitt nach,
// unabhaengig vom Live-Stream-Limit von maximal 25 aktiven Kacheln.
(function(){
if(!$('dioramaExport'))return;

// ---------- Mittelpunktauswahl: Klick-Picking auf der Karte ----------
// "MITTELPUNKT SETZEN" bewaffnet den naechsten (Einzel-)Klick auf die 3D-
// Ansicht (ueber scene.js' armCenterPick(), siehe dort fuer die Ebenen-
// Projektion Bildschirmpunkt -> UTM32-Weltkoordinate). Der Klick setzt
// gleichzeitig den Diorama-Mittelpunkt UND den ARK-Standort (Kamera springt
// wie bei der PLZ-/Strassensuche per jumpToEN() an die Klickposition) - der
// Modus bleibt danach bewaffnet, bis der Button erneut gedrueckt oder Esc
// gedrueckt wird, sodass mehrere Klicks hintereinander den Mittelpunkt immer
// wieder neu setzen koennen.
let center=null; // {e,n,label}
// Spiegelt den aktuellen Mittelpunkt + die gewaehlte Kantenlaenge (dioramaSize)
// als gelb gestrichelte Umrandung in die 3D-Vorschau (scene.js), rein visuell,
// kein Einfluss auf den eigentlichen STL-Export.
function updateOutline(){
 if(!center){if(typeof clearDioramaOutline==='function')clearDioramaOutline();return;}
 const half=(parseFloat($('dioramaSize').value)||600)/2;
 if(typeof setDioramaOutline==='function')setDioramaOutline({x0:center.e-half,x1:center.e+half,z0:center.n-half,z1:center.n+half});
}
function updateCenterInfo(){
 updateOutline();
 const info=$('dioramaCenterInfo');
 if(!center){info.textContent=I18N().nrw3d_center_none;$('dioramaExport').disabled=true;if($('dioramaExportRing'))$('dioramaExportRing').disabled=true;return;}
 info.textContent=I18Nf('nrw3d_center_set_label',{e:center.e.toFixed(0),n:center.n.toFixed(0),label:center.label?' · '+center.label:''});
 $('dioramaExport').disabled=false;
 if($('dioramaExportRing'))$('dioramaExportRing').disabled=false;
}
const centerBtn=$('dioramaUseView');
let pickingCenter=false;
function setPicking(on){
 pickingCenter=on;
 centerBtn.classList.toggle('active',on);
 centerBtn.textContent=on?I18N().nrw3d_center_btn_active:I18N().nrw3d_center_btn;
 $('dioramaStatus').textContent=on?I18N().nrw3d_picking_status:I18N().nrw3d_picking_stopped;
}
centerBtn.onclick=()=>{
 if(!streamEnabled){$('dioramaStatus').textContent=I18N().nrw3d_need_stream_first;return;}
 if(pickingCenter){disarmCenterPick();setPicking(false);return;}
 setPicking(true);
 armCenterPick((e,n,labelText)=>{
  center={e,n,label:labelText};
  updateCenterInfo();
  jumpToEN(e,n,labelText);
  $('dioramaStatus').textContent=I18Nf('nrw3d_center_set_status',{label:labelText});
 });
};
// Wird von scene.js aufgerufen, wenn der Bewaffnungsmodus per Esc abgebrochen wird.
window.onCenterPickCancelled=()=>{if(pickingCenter)setPicking(false);};
updateCenterInfo();
$('dioramaSize').addEventListener('change',updateOutline);
function updateModeWarn(){$('dioramaModeWarn').style.display=$('dioramaBuildingMode').value==='raster'?'none':'block';}
$('dioramaBuildingMode').addEventListener('change',updateModeWarn);updateModeWarn();
$('dioramaSmoothing').addEventListener('input',()=>{$('dioramaSmoothingValue').textContent=$('dioramaSmoothing').value+'%';});

// ---------- Geometrie-Grundfunktionen (1:1 portiert aus Sechtem_3D V1.4.4) ----------
function v3(x,y,z){return {x,y,z};}
function addTri(tris,a,b,c){const ax=b.x-a.x,ay=b.y-a.y,az=b.z-a.z,bx=c.x-a.x,by=c.y-a.y,bz=c.z-a.z;const cx=ay*bz-az*by,cy=az*bx-ax*bz,cz=ax*by-ay*bx;if(cx*cx+cy*cy+cz*cz<1e-16)return;tris.push([a,b,c]);}
function addQuad(tris,a,b,c,d){addTri(tris,a,b,c);addTri(tris,a,c,d);}
function clipPoly(poly,axis,limit,keepGreater){const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],av=a[axis]-limit,bv=b[axis]-limit;
  const ia=keepGreater?av>=-1e-5:av<=1e-5,ib=keepGreater?bv>=-1e-5:bv<=1e-5;
  if(ia)out.push(a);
  if(ia!==ib){const t=av/(av-bv);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
 }return out;}
function clipTriangle(a,b,c,bb){let poly=[a,b,c];for(const [ax,lim,greater] of [['x',bb.x0,true],['x',bb.x1,false],['z',bb.z0,true],['z',bb.z1,false]]){poly=clipPoly(poly,ax,lim,greater);if(poly.length<3)return [];}const out=[];for(let i=1;i<poly.length-1;i++)out.push([poly[0],poly[i],poly[i+1]]);return out;}
function pointInTriXZ(px,pz,a,b,c){
 const v0x=c.x-a.x,v0z=c.z-a.z,v1x=b.x-a.x,v1z=b.z-a.z,v2x=px-a.x,v2z=pz-a.z;
 const den=v0x*v1z-v1x*v0z;if(Math.abs(den)<1e-12)return false;
 const u=(v2x*v1z-v1x*v2z)/den,v=(v0x*v2z-v2x*v0z)/den;
 return u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6;
}
function removeTerrainSpikes(heights,nx,nz,threshold){
 const original=heights.slice(),width=nx+1;let fixes=0;
 for(let j=1;j<nz;j++)for(let i=1;i<nx;i++){
  const id=j*width+i,neighbors=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)neighbors.push(original[id+dy*width+dx]);
  neighbors.sort((a,b)=>a-b);
  const median=(neighbors[3]+neighbors[4])/2;
  if(Math.abs(original[id]-median)>threshold&&neighbors.filter(v=>Math.abs(v-median)<threshold/2).length>=7){heights[id]=median;fixes++;}
 }
 return fixes;
}
function cleanRoadMask(mask,nx,nz){
 const original=mask.slice();let removed=0,filled=0;
 for(let j=1;j<nz-1;j++)for(let i=1;i<nx-1;i++){
  const id=j*nx+i;let count=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)count+=original[id+dy*nx+dx];
  if(original[id]&&count===0){mask[id]=0;removed++;}
  else if(!original[id]&&count>=7){mask[id]=1;filled++;}
 }
 return {removed,filled};
}
// Strassen-/Gewaesserlinien rasterisieren: Abstand Zellmitte->Liniensegment
// statt Dreiecks-Traversierung (ARK haelt Strassen/Gewaesser als per Kachel
// vorverarbeitete Segmentlisten {a,b,width} in absoluten UTM32-Metern, nicht
// als Mesh wie im Sechtem-Original).
function buildSegmentMask(bb,nx,nz,segments,inflateCells){
 const mask=new Uint8Array(nx*nz),dx=(bb.x1-bb.x0)/nx,dz=(bb.z1-bb.z0)/nz;
 for(const seg of segments){
  const ax=seg.a[0],az=seg.a[1],bx=seg.b[0],bz=seg.b[1],half=seg.width/2;
  const minx=Math.min(ax,bx)-half,maxx=Math.max(ax,bx)+half,minz=Math.min(az,bz)-half,maxz=Math.max(az,bz)+half;
  if(maxx<bb.x0||minx>bb.x1||maxz<bb.z0||minz>bb.z1)continue;
  const i0=Math.max(0,Math.floor((minx-bb.x0)/dx)),i1=Math.min(nx-1,Math.ceil((maxx-bb.x0)/dx));
  const j0=Math.max(0,Math.floor((minz-bb.z0)/dz)),j1=Math.min(nz-1,Math.ceil((maxz-bb.z0)/dz));
  const dxs=bx-ax,dzs=bz-az,len2=dxs*dxs+dzs*dzs||1e-9;
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const x=bb.x0+(i+.5)*dx,z=bb.z0+(j+.5)*dz;
   let t=((x-ax)*dxs+(z-az)*dzs)/len2;t=Math.max(0,Math.min(1,t));
   const px=ax+dxs*t,pz=az+dzs*t,d=Math.hypot(x-px,z-pz);
   if(d<=half)mask[j*nx+i]=1;
  }
 }
 if(inflateCells>0){
  const dil=new Uint8Array(mask);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)if(mask[j*nx+i])
   for(let oy=-inflateCells;oy<=inflateCells;oy++)for(let ox=-inflateCells;ox<=inflateCells;ox++){
    if(ox*ox+oy*oy>inflateCells*inflateCells)continue;
    const x=i+ox,y=j+oy;if(x<0||x>=nx||y<0||y>=nz)continue;dil[y*nx+x]=1;
   }
  return dil;
 }
 return mask;
}
// Wasserflaechen (Seen/Teiche als Polygone) rasterisieren: Zellmitte-in-Dreieck-Test.
function buildWaterPolyMask(bb,nx,nz,polyTris){
 const mask=new Uint8Array(nx*nz),dx=(bb.x1-bb.x0)/nx,dz=(bb.z1-bb.z0)/nz;
 for(const tri of polyTris){
  const [a,b,c]=tri;
  const minx=Math.min(a[0],b[0],c[0]),maxx=Math.max(a[0],b[0],c[0]);
  const minz=Math.min(a[1],b[1],c[1]),maxz=Math.max(a[1],b[1],c[1]);
  if(maxx<bb.x0||minx>bb.x1||maxz<bb.z0||minz>bb.z1)continue;
  const i0=Math.max(0,Math.floor((minx-bb.x0)/dx)),i1=Math.min(nx-1,Math.ceil((maxx-bb.x0)/dx));
  const j0=Math.max(0,Math.floor((minz-bb.z0)/dz)),j1=Math.min(nz-1,Math.ceil((maxz-bb.z0)/dz));
  const pa={x:a[0],z:a[1]},pb={x:b[0],z:b[1]},pc={x:c[0],z:c[1]};
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const x=bb.x0+(i+.5)*dx,z=bb.z0+(j+.5)*dz;
   if(pointInTriXZ(x,z,pa,pb,pc))mask[j*nx+i]=1;
  }
 }
 return mask;
}
function carveMask(heights,mask,nx,nz,depth){
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  let count=0;
  for(let oy=-1;oy<=0;oy++)for(let ox=-1;ox<=0;ox++){
   const x=i+ox,y=j+oy;
   if(x>=0&&x<nx&&y>=0&&y<nz&&mask[y*nx+x])count++;
  }
  // Mehrheitsklassifikation: weniger ausfransende Einzelpunkte an der Kante.
  if(count>=3)heights[j*(nx+1)+i]-=depth;
 }
}

// ---------- Mehrkachel-Hoehensampler ----------
// heightTiles: Map<"tx:ty",{n,heights,tileX,tileY}> aus /api/nrw3d/terrain.
// Fehlende Kacheln (keine lokale DGM1-Datei) fallen auf den Durchschnitt
// bereits geladener Nachbarkacheln zurueck (wachsender Ring), sonst auf den
// Gesamtdurchschnitt aller geladenen Kacheln, sonst 0 — nie eine Luecke/NaN.
function buildSampler(heightTiles){
 const avg=new Map();
 for(const [key,g] of heightTiles){let s=0,c=0;for(const v of g.heights){if(Number.isFinite(v)&&v!==0){s+=v;c++;}}if(c)avg.set(key,s/c);}
 let gs=0,gc=0;for(const v of avg.values()){gs+=v;gc++;}
 const globalAvg=gc?gs/gc:0;
 function fallback(tx,ty){
  for(let r=1;r<=3;r++)
   for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
    const v=avg.get((tx+dx)+':'+(ty+dy));if(v!=null)return v;
   }
  return globalAvg;
 }
 return function sampleTerrain(e,n){
  const tx=Math.floor(e/1000),ty=Math.floor(n/1000),key=tx+':'+ty;
  const g=heightTiles.get(key);
  if(g&&g.heights&&g.heights.length){
   const N=g.n,H=g.heights;
   // Gleiche Formel wie scene.js roadHeight(): row 0 = Suedkante, col 0 = Westkante.
   const fx=Math.max(0,Math.min(N-1,(e-tx*1000)*(N-1)/1000)),fy=Math.max(0,Math.min(N-1,(n-ty*1000)*(N-1)/1000));
   const x=Math.min(N-2,Math.floor(fx)),y=Math.min(N-2,Math.floor(fy)),u=fx-x,v=fy-y;
   return (1-v)*((1-u)*H[y*N+x]+u*H[y*N+x+1])+v*((1-u)*H[(y+1)*N+x]+u*H[(y+1)*N+x+1]);
  }
  return fallback(tx,ty);
 };
}

// ---------- Datenbeschaffung fuer den Export-Ausschnitt ----------
// Unabhaengig vom Live-Stream (max. 25 aktive Kacheln): holt DGM1/LoD2 direkt
// ueber die bestehenden Backend-Endpunkte fuer jede benoetigte 1-km-Kachel im
// Ausschnitt, und mergt OSM-Kacheln ueber die bereits vorhandene globale
// mergeOSMTile()-Funktion (gleicher Cache wie beim normalen Kachel-Streaming,
// Mehrfach-Import derselben Kachel wird dort bereits dedupliziert).
async function fetchJSON(url){const r=await fetch(url);if(!r.ok)throw Error((await r.text()).slice(0,160));return r.json();}
async function gatherData(bb,statusCb,opts){
 const needGML=!opts||opts.gml!==false, needOSM=!opts||opts.osm!==false;
 const tx0=Math.floor(bb.x0/1000)-1,tx1=Math.floor(bb.x1/1000)+1;
 const tz0=Math.floor(bb.z0/1000)-1,tz1=Math.floor(bb.z1/1000)+1;
 const keys=[];
 for(let ty=tz0;ty<=tz1;ty++)for(let tx=tx0;tx<=tx1;tx++)keys.push([tx,ty]);
 const heightTiles=new Map();
 const roofTris=[],wallTris=[],groundTris=[];
 let dgmCount=0,gmlCount=0,osmCount=0,done=0;
 const tileKeys=[];
 for(const [tx,ty] of keys){
  const key=tileKey(tx,ty);tileKeys.push(key);
  const jobs=[];
  if(dgmIndex.has(key))jobs.push(fetchJSON('/api/nrw3d/terrain?x='+tx+'&y='+ty).then(h=>{heightTiles.set(key,{n:h.n,heights:h.heights,tileX:tx,tileY:ty});dgmCount++;}).catch(()=>{}));
  if(needGML&&indexedTiles.has(key))jobs.push(fetchJSON('/api/nrw3d/tile?x='+tx+'&y='+ty).then(g=>{
   // Kachel-lokale Koordinaten (siehe nrw3d.go readNRWGML) in absolute
   // UTM32-Meter umrechnen: x_abs=x_rel+tx*1000+500, z_abs=-z_rel+ty*1000+500,
   // y bleibt die bereits absolute Hoehe.
   const conv=(arr,out)=>{if(!arr)return;for(let i=0;i+8<arr.length;i+=9){
    const v=[];for(let k=0;k<3;k++){const b=i+k*3;v.push({x:arr[b]+tx*1000+500,y:arr[b+1],z:-arr[b+2]+ty*1000+500});}
    out.push(v);
   }};
   conv(g.roof,roofTris);conv(g.wall,wallTris);conv(g.ground,groundTris);gmlCount++;
  }).catch(()=>{}));
  if(needOSM&&osmTileIndex.has(key)&&!osmMergedTiles.has(key))jobs.push(fetchJSON('/api/nrw3d/osm/tile?x='+tx+'&y='+ty).then(oj=>{mergeOSMTile(oj);osmMergedTiles.add(key);osmCount++;}).catch(()=>{}));
  await Promise.all(jobs);
  done++;statusCb(done,keys.length,dgmCount,gmlCount,osmCount);
 }
 return {heightTiles,roofTris,wallTris,groundTris,tileKeys};
}
function collectSegments(map,keys){const out=[];for(const k of keys){const list=map.get(k);if(list)for(const s of list)out.push(s);}return out;}
function collectWaterTris(keys){const out=[];for(const k of keys){const polys=waterPolygonsByTile.get(k);if(polys)for(const poly of polys)for(const tri of poly)out.push(tri);}return out;}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}

// Rahmenprofil-Geometrie: Gesamtsockel bleibt in jedem Fall bei "sizeM"
// Metern -> totalMm (Bilderrahmen: 200mm / Standard: 200mm). Beim
// Bilderrahmenprofil zieht ein zusaetzlicher, einstellbarer Einzug
// ("Verschmaelerung", Default 3mm je Seite) die eigentliche Modellflaeche
// weiter nach innen, waehrend der aeussere Sockel (200mm) UNVERAENDERT
// bleibt - der verbindliche 3-mm-Rand aus der Spezifikation bleibt dabei
// ebenfalls erhalten, der Einzug kommt zusaetzlich oben drauf. Betrifft nur
// das Bilderrahmenprofil (dort gibt es einen Falz, der eingehalten werden
// muss); das Profil ohne Rahmenauflage ist von der Verschmaelerung nicht
// betroffen.
function profileGeometry(profile,marginMm){
 if(profile==='frame200'){
  const rand=3,margin=Math.max(0,marginMm||0);
  return {innerMm:194-2*margin,flangeMm:rand+margin};
 }
 return {innerMm:200,flangeMm:0};
}

// ---------- Bilderrahmen-Testdruck: nur der aeussere Rand ----------
// Druckt lediglich einen schmalen, geschlossenen Ring (Default 20mm breit,
// gemessen von der tatsaechlichen Aussenkante nach innen) mit demselben
// Sockel-/Falzprofil wie das vollstaendige Diorama, samt echtem DGM1-
// Gelaendeverlauf an der Kante - spart Material/Zeit, um die Passung in
// den physischen Bilderrahmen zu pruefen, ohne das komplette Diorama zu
// drucken. Gebaeude werden einbezogen (sofern im Hauptpanel aktiviert),
// da gerade Randgebaeude an der Schnittkante die eigentliche Risikoquelle
// fuer die Rahmenpassung sind - ein reiner Gelaendetest wuerde genau das
// nicht pruefen. Strassen/Wasser bleiben weiterhin aussen vor (fuer die
// Rahmenpassung irrelevant).
//
// Gebaeude werden hier IMMER ueber das bewaehrte Rasterverfahren (Dach
// ueberschreibt Gelaendehoehe, siehe getSolidPrintModel) eingerechnet,
// unabhaengig vom im Hauptpanel gewaehlten Gebaeudemodus - die
// experimentellen LoD2-Polygonmodi (V1.4.3/.4.4) muessten fuer eine
// beliebig geformte Ringkontur komplett neu portiert werden und sind
// zudem ausdruecklich nicht als wasserdicht geprueft (siehe BEKANNTE
// GRENZEN); fuer einen Passungstest ist das bewaehrte, stets geschlossene
// Rasterverfahren die robustere Wahl.
//
// Baut (wie getSolidPrintModel) ein vollstaendiges, geglaettetes
// Hoehenraster mit eingerechneten Dachhoehen und liefert zusaetzlich eine
// bilinear interpolierende Abfragefunktion sampleAt(x,z). Wird von
// buildFrameTestRingFromSolid() fuer das `heights`-Array (Pro-Zelle-
// Knotenhoehen) wiederverwendet. Historischer Hinweis: zwei frühere
// Ring-Ansaetze (Einzelpunkt-Dreiecksabfrage direkt im schmalen
// Ringstreifen, danach eine eigene Mehrreihen-Kurvenabtastung auf Basis
// dieses Rasters) haben beide weiterhin verzerrte "Picasso"-Gebaeude
// erzeugt, weil sie Gebaeudehoehen unabhaengig vom bewaehrten Vollexport-
// Raster NEU abgetastet haben. Die aktuelle Loesung verwendet dieses
// Raster gar nicht mehr fuer eine eigene Ring-Kurve, sondern baut die
// Ring-Oberflaeche aus denselben Pro-Zelle-Quads wie der Vollexport und
// laesst nur die Zellen im Zentrum weg ("Loch stanzen") - siehe
// buildFrameTestRingFromSolid().
function buildGroundHeightGrid(bb,nx,nz,sampleTerrain,roofTris,smoothingPct){
 const dx=(bb.x1-bb.x0)/nx,dz=(bb.z1-bb.z0)/nz;
 const N=(nx+1)*(nz+1),heights=new Float32Array(N);
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)heights[j*(nx+1)+i]=sampleTerrain(bb.x0+i*dx,bb.z0+j*dz);
 const smoothStrength=(smoothingPct||0)/100;
 let src=heights,dst=new Float32Array(N);
 for(let pass=0;pass<2;pass++){
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const id=j*(nx+1)+i;
   if(i===0||j===0||i===nx||j===nz){dst[id]=src[id];continue;}
   const n0=src[(j-1)*(nx+1)+i-1],n1=src[(j-1)*(nx+1)+i],n2=src[(j-1)*(nx+1)+i+1];
   const n3=src[j*(nx+1)+i-1],n4=src[j*(nx+1)+i],n5=src[j*(nx+1)+i+1];
   const n6=src[(j+1)*(nx+1)+i-1],n7=src[(j+1)*(nx+1)+i],n8=src[(j+1)*(nx+1)+i+1];
   const average=(n0+2*n1+n2+2*n3+4*n4+2*n5+n6+2*n7+n8)/16;
   dst[id]=n4*(1-smoothStrength)+average*smoothStrength;
  }
  const tmp=src;src=dst;dst=tmp;
 }
 if(src!==heights)heights.set(src);
 if(roofTris&&roofTris.length){
  for(const tri of roofTris){
   const [a,b,c]=tri;
   const xmin=Math.min(a.x,b.x,c.x),xmax=Math.max(a.x,b.x,c.x);
   const zmin=Math.min(a.z,b.z,c.z),zmax=Math.max(a.z,b.z,c.z);
   if(xmax<bb.x0||xmin>bb.x1||zmax<bb.z0||zmin>bb.z1)continue;
   const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
   if(Math.abs(den)<1e-9)continue;
   const i0=Math.max(0,Math.floor((xmin-bb.x0)/dx)),i1=Math.min(nx,Math.ceil((xmax-bb.x0)/dx));
   const j0=Math.max(0,Math.floor((zmin-bb.z0)/dz)),j1=Math.min(nz,Math.ceil((zmax-bb.z0)/dz));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const x=bb.x0+i*dx,z=bb.z0+j*dz;
    const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den;
    const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;
    const w=1-u-v;
    if(u<-.00001||v<-.00001||w<-.00001)continue;
    const y=u*a.y+v*b.y+w*c.y;
    const id=j*(nx+1)+i;
    if(y>heights[id])heights[id]=y;
   }
  }
 }
 function sampleAt(x,z){
  let fi=(x-bb.x0)/dx,fj=(z-bb.z0)/dz;
  if(fi<0)fi=0;else if(fi>nx)fi=nx;
  if(fj<0)fj=0;else if(fj>nz)fj=nz;
  const i0=Math.max(0,Math.min(nx-1,Math.floor(fi))),j0=Math.max(0,Math.min(nz-1,Math.floor(fj)));
  const i1=Math.min(nx,i0+1),j1=Math.min(nz,j0+1);
  const tx=fi-i0,tz=fj-j0;
  const h00=heights[j0*(nx+1)+i0],h10=heights[j0*(nx+1)+i1];
  const h01=heights[j1*(nx+1)+i0],h11=heights[j1*(nx+1)+i1];
  const h0=h00+(h10-h00)*tx,h1=h01+(h11-h01)*tx;
  return h0+(h1-h0)*tz;
 }
 return {heights,sampleAt};
}
// ---------- Bilderrahmentestring als "Loch in den Vollkoerper" ----------
// Nutzer-Feedback zu V1.4.5.26/.27: eine EIGENE Ring-Geometrie (Abtastung
// entlang eigens konstruierter Innen-/Aussenkurven, egal ob mit 2 oder N
// Zwischenreihen) hat wiederholt verzerrte "Picasso"-Gebaeude erzeugt,
// weil Gebaeudehoehen unabhaengig vom bereits als korrekt bestaetigten
// Vollexport-Raster abgetastet wurden. Nutzer-Vorschlag, direkt umgesetzt:
// "Nimm den Bildausschnitt und stanz da einfach ein eckiges Loch rein."
// Lösung: GENAU dasselbe feine Pro-Zelle-Raster wie im Vollexport
// (getSolidPrintModel) aufbauen - exakt dieselbe Abtastung, Glaettung und
// Dachrasterung, keine eigene Formel mehr - aber die Rasterzellen im
// Zentrum (das spaeter nicht gedruckt werden soll) werden beim Aufbau der
// Oberflaeche einfach uebersprungen ("Loch stanzen"), statt sie hinterher
// per Kurven-Interpolation herauszuschneiden. Dadurch sehen Gebaeude am
// Rand exakt so aus wie im Vollexport (laut Nutzer dort bereits korrekt) -
// es gibt keine separate, fehleranfaellige Ring-Abtastlogik mehr.
function buildFrameTestRingFromSolid(bb,ringInsetWorld,flangeWorld,baseDepth,sampleTerrain,roofTris,smoothingPct,scale){
 const span=bb.x1-bb.x0,spanZ=bb.z1-bb.z0;
 const step=Math.max(.15,span/1250); // identischer Zielwert wie getSolidPrintModel
 const nx=Math.ceil(span/step),nz=Math.ceil(spanZ/step);
 const dx=span/nx,dz=spanZ/nz;
 const grid=buildGroundHeightGrid(bb,nx,nz,sampleTerrain,roofTris,smoothingPct);
 const heights=grid.heights;
 // Innenschnitt auf ganze Gitterzellen einrasten - dadurch quert KEINE
 // Rasterzelle die Schnittkante (jede Zelle liegt eindeutig komplett im
 // gedruckten Rahmenband oder komplett im Loch), es ist also keinerlei
 // nachtraegliches Clipping/Interpolieren an der Schnittkante noetig.
 const iInset=Math.max(1,Math.min(Math.floor(nx/2)-1,Math.round(ringInsetWorld/dx)));
 const jInset=Math.max(1,Math.min(Math.floor(nz/2)-1,Math.round(ringInsetWorld/dz)));
 const inHole=(i,j)=>i>=iInset&&i<nx-iInset&&j>=jInset&&j<nz-jInset;
 const node=(i,j)=>v3(bb.x0+i*dx,heights[j*(nx+1)+i],bb.z0+j*dz);
 const nodeBottom=(i,j,y)=>v3(bb.x0+i*dx,y,bb.z0+j*dz);
 let lowest=Infinity;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)if(!inHole(Math.min(i,nx-1),Math.min(j,nz-1))||i===0||j===0||i===nx||j===nz)lowest=Math.min(lowest,heights[j*(nx+1)+i]);
 const bottom=lowest-baseDepth;
 const tris=[];
 // Oberflaeche: identisch zu getSolidPrintModel, aber Loch-Zellen im
 // Zentrum werden uebersprungen statt erzeugt.
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  if(inHole(i,j))continue;
  const a=node(i,j),b=node(i+1,j),c=node(i+1,j+1),d=node(i,j+1);
  addQuad(tris,a,d,c,b);
 }
 // Boden: flaches Pro-Zelle-Raster im selben Rahmenband (statt eines
 // einzelnen Zentrums-Faechers wie im Vollexport - der wuerde den Boden
 // unter dem Loch wieder zuschliessen). Dieselbe Zellauswahl wie oben,
 // garantiert nahtlosen Anschluss ohne jede Interpolation.
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  if(inHole(i,j))continue;
  const a=nodeBottom(i,j,bottom),b=nodeBottom(i+1,j,bottom),c=nodeBottom(i+1,j+1,bottom),d=nodeBottom(i,j+1,bottom);
  addQuad(tris,a,b,c,d); // nach unten weisende Normale (umgekehrte Wicklung ggue. Oberflaeche)
 }
 // Innenwand am Loch: eigene, nach dem Vorbild der Aussenkontur gebaute
 // Perimeterschleife, aber mit UMGEKEHRTER Wicklung (Material liegt hier
 // aussen statt innen, die Normalen muessen daher ins Loch hinein zeigen).
 const hole=[];
 for(let i=iInset;i<=nx-iInset;i++)hole.push([i,jInset]);
 for(let j=jInset+1;j<=nz-jInset;j++)hole.push([nx-iInset,j]);
 for(let i=nx-iInset-1;i>=iInset;i--)hole.push([i,nz-jInset]);
 for(let j=nz-jInset-1;j>=jInset+1;j--)hole.push([iInset,j]);
 for(let k=0;k<hole.length;k++){
  const [i,j]=hole[k],[ni,nj]=hole[(k+1)%hole.length];
  const p=node(i,j),q=node(ni,nj);
  const pBot=v3(p.x,bottom,p.z),qBot=v3(q.x,bottom,q.z);
  addQuad(tris,q,p,pBot,qBot); // vertauscht ggue. Aussenwand-Muster -> Normale zeigt ins Loch
 }
 // Aussenkontur (Falzauflage/Rand): unveraendert aus getSolidPrintModel
 // uebernommen - der Loch-Schnitt betrifft nur das Zentrum, die bewaehrte
 // Randbehandlung bleibt unangetastet.
 const perimeter=[];
 for(let i=0;i<=nx;i++)perimeter.push([i,0]);
 for(let j=1;j<=nz;j++)perimeter.push([nx,j]);
 for(let i=nx-1;i>=0;i--)perimeter.push([i,nz]);
 for(let j=nz-1;j>=1;j--)perimeter.push([0,j]);
 if(flangeWorld>0){
  // 0.05 mm Druckabstand statt eines world-epsilon von 0.00001 m: nach der
  // Massstabsskalierung (scale, mm pro Weltmeter) war 0.00001 m oft kleiner
  // als die Float32-Aufloesung im STL und erzeugte dadurch eine faktisch
  // nulldicke Stufe -> "Voronoi cell source index is out of range" im Slicer.
  const shelfY=lowest-0.05/scale;
  function outer(i,j,y){
   return v3(bb.x0+i*dx+(i===0?-flangeWorld:i===nx?flangeWorld:0),y,
             bb.z0+j*dz+(j===0?-flangeWorld:j===nz?flangeWorld:0));
  }
  for(let k=0;k<perimeter.length;k++){
   const [i,j]=perimeter[k],[ni,nj]=perimeter[(k+1)%perimeter.length];
   const a=node(i,j),b=node(ni,nj);
   const sa=v3(a.x,shelfY,a.z),sb=v3(b.x,shelfY,b.z);
   const oa=outer(i,j,shelfY),ob=outer(ni,nj,shelfY);
   const bia=v3(a.x,bottom,a.z),bib=v3(b.x,bottom,b.z);
   const boa=outer(i,j,bottom),bob=outer(ni,nj,bottom);
   addQuad(tris,a,b,sb,sa);
   addQuad(tris,sa,sb,ob,oa);
   addQuad(tris,oa,ob,bob,boa);
   addQuad(tris,bia,boa,bob,bib);
  }
 }else{
  for(let k=0;k<perimeter.length;k++){
   const [i,j]=perimeter[k],[ni,nj]=perimeter[(k+1)%perimeter.length];
   const a=node(i,j),b=node(ni,nj);
   const la=v3(a.x,bottom,a.z),lb=v3(b.x,bottom,b.z);
   addQuad(tris,a,b,lb,la);
  }
 }
 return {tris,bottom};
}



// ---------- EIN geschlossener Hoehenkoerper fuer den STL-Druck ----------
// Portiert aus Sechtem_3D.html getSolidPrintModel(): Dachhoehen werden in
// das Gelaende integriert, Strassen/Gewaesser als Furchen eingearbeitet,
// Rand optional als echte 3-mm-Auflage (flangeWorld) statt als reiner
// Hoehenbuckel. Gebaeude werden nicht aus der Karte entfernt/verschoben.
function getSolidPrintModel(bb,baseDepth,roadDepth,waterDepth,includeBuildings,optim,printMm,flangeWorld,sampleTerrain,roofTris,roadSegs,waterSegs,waterTris){
 const span=bb.x1-bb.x0, ratio=span*1000/printMm, scale=printMm/span;
 // Zielwert ca. 0,15-0,16 mm im Ausdruck; bei sehr kleinen Ausschnitten mindestens 15 cm real.
 const step=Math.max(.15, span/1250);
 const nx=Math.ceil(span/step),nz=Math.ceil((bb.z1-bb.z0)/step);
 const dx=span/nx,dz=(bb.z1-bb.z0)/nz;
 const N=(nx+1)*(nz+1), heights=new Float32Array(N);
 let lowest=Infinity;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const y=sampleTerrain(bb.x0+i*dx,bb.z0+j*dz);
   heights[j*(nx+1)+i]=y;lowest=Math.min(lowest,y);
 }
 // Gelaende beruhigen (DGM-Mikrorelief glaetten); Gebaeude/Daecher werden erst danach integriert.
 const smoothPasses=2, smoothStrength=optim.smoothing/100;
 const fragmentFixes=optim.fragments?removeTerrainSpikes(heights,nx,nz,Math.max(.35,span/3500)):0;
 let src=heights, dst=new Float32Array(N);
 for(let pass=0;pass<smoothPasses;pass++){
   for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
     const id=j*(nx+1)+i;
     if(i===0||j===0||i===nx||j===nz){dst[id]=src[id];continue;}
     const n0=src[(j-1)*(nx+1)+i-1],n1=src[(j-1)*(nx+1)+i],n2=src[(j-1)*(nx+1)+i+1];
     const n3=src[j*(nx+1)+i-1],n4=src[j*(nx+1)+i],n5=src[j*(nx+1)+i+1];
     const n6=src[(j+1)*(nx+1)+i-1],n7=src[(j+1)*(nx+1)+i],n8=src[(j+1)*(nx+1)+i+1];
     const average=(n0+2*n1+n2+2*n3+4*n4+2*n5+n6+2*n7+n8)/16;
     dst[id]=n4*(1-smoothStrength)+average*smoothStrength;
   }
   const tmp=src;src=dst;dst=tmp;
 }
 if(src!==heights)heights.set(src);
 let roadFixes={removed:0,filled:0};
 if(roadDepth>0&&roadSegs.length){
  const roadMask=buildSegmentMask(bb,nx,nz,roadSegs,Math.max(0,Math.ceil((ratio*.7/1000-dx)/(2*dx))));
  if(optim.roads)roadFixes=cleanRoadMask(roadMask,nx,nz);
  carveMask(heights,roadMask,nx,nz,roadDepth);
 }
 let waterFixes={removed:0,filled:0};
 if(waterDepth>0&&(waterSegs.length||waterTris.length)){
  const waterMask=buildSegmentMask(bb,nx,nz,waterSegs,0);
  const polyMask=buildWaterPolyMask(bb,nx,nz,waterTris);
  for(let k=0;k<waterMask.length;k++)if(polyMask[k])waterMask[k]=1;
  if(optim.roads)waterFixes=cleanRoadMask(waterMask,nx,nz);
  carveMask(heights,waterMask,nx,nz,waterDepth);
 }
 let roofNodes=0;
 if(includeBuildings){
  for(const tri of roofTris){
   const [a,b,c]=tri;
   const xmin=Math.min(a.x,b.x,c.x),xmax=Math.max(a.x,b.x,c.x);
   const zmin=Math.min(a.z,b.z,c.z),zmax=Math.max(a.z,b.z,c.z);
   if(xmax<bb.x0||xmin>bb.x1||zmax<bb.z0||zmin>bb.z1)continue;
   const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
   if(Math.abs(den)<1e-9)continue;
   const i0=Math.max(0,Math.floor((xmin-bb.x0)/dx)),i1=Math.min(nx,Math.ceil((xmax-bb.x0)/dx));
   const j0=Math.max(0,Math.floor((zmin-bb.z0)/dz)),j1=Math.min(nz,Math.ceil((zmax-bb.z0)/dz));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const x=bb.x0+i*dx,z=bb.z0+j*dz;
    const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den;
    const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;
    const w=1-u-v;
    if(u<-.00001||v<-.00001||w<-.00001)continue;
    const y=u*a.y+v*b.y+w*c.y;
    const id=j*(nx+1)+i;
    if(y>heights[id]){heights[id]=y;roofNodes++;}
   }
  }
 }
 if(!optim.protect&&includeBuildings){
  // Optionaler Kantenweichzeichner: standardmaessig AUS, nur wenn der Kantenschutz abgewaehlt wird.
  const roofOrig=heights.slice(),strength=Math.min(.10,optim.smoothing/100*.2);
  for(let j=1;j<nz;j++)for(let i=1;i<nx;i++){
   const id=j*(nx+1)+i,v=roofOrig[id];
   const neighbors=[roofOrig[id-1],roofOrig[id+1],roofOrig[id-(nx+1)],roofOrig[id+(nx+1)]];
   heights[id]=v*(1-strength)+strength*(neighbors[0]+neighbors[1]+neighbors[2]+neighbors[3])/4;
  }
 }
 // Umlaufender Rahmen folgt der aeusseren Kontur (nur wenn keine echte Auflage gebaut wird).
 if(!flangeWorld){
  const rim=Math.max(1,Math.round(nx/200)),rimH=1/(1000/ratio);
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)
   if(i<rim||j<rim||i>nx-rim||j>nz-rim)heights[j*(nx+1)+i]+=rimH;
 }
 const bottom=lowest-baseDepth;
 const tris=[];
 const node=(i,j)=>v3(bb.x0+i*dx,heights[j*(nx+1)+i],bb.z0+j*dz);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const a=node(i,j),b=node(i+1,j),c=node(i+1,j+1),d=node(i,j+1);
  addQuad(tris,a,d,c,b);
 }
 // Unterseite MUSS mit denselben geteilten Randstuetzpunkten trianguliert werden.
 const bottomCenter=v3((bb.x0+bb.x1)/2,bottom,(bb.z0+bb.z1)/2);
 if(flangeWorld>0){
  // Echte 3-mm-Randauflage: Hauptmodell plus umlaufend flacher massiver Kragen.
  // 0.05 mm Druckabstand statt world-epsilon 0.00001 m (siehe Begruendung in
  // buildFrameTestRingFromSolid): verhindert eine nach der Skalierung faktisch
  // nulldicke Stufe, die Slicer mit "Voronoi cell source index out of range" quittieren.
  const shelfY=lowest-Math.max(roadDepth,waterDepth,0)-0.05/scale;
  const perimeter=[];
  for(let i=0;i<=nx;i++)perimeter.push([i,0]);
  for(let j=1;j<=nz;j++)perimeter.push([nx,j]);
  for(let i=nx-1;i>=0;i--)perimeter.push([i,nz]);
  for(let j=nz-1;j>=1;j--)perimeter.push([0,j]);
  function outer(i,j,y){
   return v3(bb.x0+i*dx+(i===0?-flangeWorld:i===nx?flangeWorld:0),y,
             bb.z0+j*dz+(j===0?-flangeWorld:j===nz?flangeWorld:0));
  }
  for(let k=0;k<perimeter.length;k++){
   const [i,j]=perimeter[k],[ni,nj]=perimeter[(k+1)%perimeter.length];
   const a=node(i,j),b=node(ni,nj);
   const sa=v3(a.x,shelfY,a.z),sb=v3(b.x,shelfY,b.z);
   const oa=outer(i,j,shelfY),ob=outer(ni,nj,shelfY);
   const bia=v3(a.x,bottom,a.z),bib=v3(b.x,bottom,b.z);
   const boa=outer(i,j,bottom),bob=outer(ni,nj,bottom);
   addQuad(tris,a,b,sb,sa);
   addQuad(tris,sa,sb,ob,oa);
   addQuad(tris,oa,ob,bob,boa);
   addQuad(tris,bia,boa,bob,bib);
   addTri(tris,bottomCenter,bia,bib);
  }
 }else{
  function side(a,b){
   const la=v3(a.x,bottom,a.z),lb=v3(b.x,bottom,b.z);
   addQuad(tris,a,b,lb,la);
   addTri(tris,bottomCenter,la,lb);
  }
  for(let i=0;i<nx;i++){side(node(i,0),node(i+1,0));side(node(i+1,nz),node(i,nz));}
  for(let j=0;j<nz;j++){side(node(0,j+1),node(0,j));side(node(nx,j),node(nx,j+1));}
 }
 return {tris,bottom,roofNodes,nx,nz,fragmentFixes,roadFixes,waterFixes};
}

// ---------- EXPERIMENT: native LoD2-Quellpolygone (V1.4.3/V1.4.4) ----------
// Beibehalten als separater, klar als experimentell gekennzeichneter Modus.
// Wichtig: diese Stuecke sind KEINE gepruefte Volumenvereinigung und koennen
// sich mit dem durchgehenden Gelaendekoerper ueberschneiden.
function appendOriginalLoD2(tris,bb,roofTris,wallTris){
 // Ground-Polygone bleiben wie im Original aussen vor (am Terrainniveau
 // bereits durch das Rasterverfahren abgedeckt, keine zusaetzlichen Flaechen).
 let added={roof:0,wall:0,ground:0,wallStart:-1,wallEnd:-1};
 for(const t of roofTris)for(const clipped of clipTriangle(t[0],t[1],t[2],bb)){addTri(tris,clipped[0],clipped[1],clipped[2]);added.roof++;}
 added.wallStart=tris.length;
 for(const t of wallTris)for(const clipped of clipTriangle(t[0],t[1],t[2],bb)){addTri(tris,clipped[0],clipped[1],clipped[2]);added.wall++;}
 added.wallEnd=tris.length;
 return added;
}
// Geschnittene LoD2-Randreparatur: an jeder Schnittebene offene Kanten bis
// zum durchgehenden Gelaende herunterziehen. Bestehende, nicht geschnittene
// LoD2-Polygone bleiben unveraendert. Adressiert die fehlende Fassade an den
// vier Schnittkanten, KEINE echte CSG-Vereinigung.
function appendOriginalLoD2BoundaryCaps(tris,polygonStart,bb,scale,sampleTerrain){
 const tol=Math.max(0.00002,0.015/scale);
 const planes=[['x',bb.x0],['x',bb.x1],['z',bb.z0],['z',bb.z1]];
 const q=v=>Math.round(v/tol);
 const key=p=>q(p.x)+','+q(p.y)+','+q(p.z);
 const count=new Map();
 for(let i=polygonStart;i<tris.length;i++){
  const t=tris[i];
  for(let k=0;k<3;k++){
   const a=t[k],b=t[(k+1)%3];
   if(!planes.some(([ax,value])=>Math.abs(a[ax]-value)<tol&&Math.abs(b[ax]-value)<tol))continue;
   const ka=key(a),kb=key(b);if(ka===kb)continue;
   const edge=ka<kb?ka+'|'+kb:kb+'|'+ka;
   const old=count.get(edge);
   if(old)old.n++;else count.set(edge,{a,b,n:1});
  }
 }
 let closed=0;
 for(const edge of count.values()){
  if(edge.n!==1)continue;
  const {a,b}=edge;
  const gyA=sampleTerrain(a.x,a.z)-0.12;
  const gyB=sampleTerrain(b.x,b.z)-0.12;
  if(a.y<=gyA&&b.y<=gyB)continue;
  const aa=v3(a.x,Math.min(a.y,gyA),a.z),bb2=v3(b.x,Math.min(b.y,gyB),b.z);
  addQuad(tris,a,b,bb2,aa);closed++;
 }
 return {closed,openCutEdges:[...count.values()].filter(e=>e.n===1).length};
}
// Zusaetzliche Fassade-zu-Gelaende-Anbindung im LoD2-Testmodus. Nur Kanten
// von WAND-Dreiecken sind kandidaten; Dachkanten bleiben unberuehrt.
function appendLoD2WallFootings(tris,wallStart,wallEnd,bb,scale,sampleTerrain){
 const tol=Math.max(0.000001,0.008/scale),quant=v=>Math.round(v/tol);
 const key=p=>[quant(p.x),quant(p.y),quant(p.z)].join(':');
 const edges=new Map();
 for(let i=wallStart;i<wallEnd;i++){
  const t=tris[i];
  for(let j=0;j<3;j++){
   const a=t[j],b=t[(j+1)%3],ka=key(a),kb=key(b);
   if(ka===kb)continue;
   const id=ka<kb?ka+'|'+kb:kb+'|'+ka;
   const old=edges.get(id);
   if(old)old.count++;else edges.set(id,{a,b,count:1});
  }
 }
 let added=0;
 for(const e of edges.values()){
  if(e.count!==1)continue;
  const {a,b}=e;
  if(Math.abs(a.y-b.y)>Math.max(0.12,0.2/scale))continue;
  if(Math.abs(a.x-b.x)+Math.abs(a.z-b.z)<tol*2)continue;
  const midY=(a.y+b.y)/2;
  const g1=sampleTerrain(a.x,a.z),g2=sampleTerrain(b.x,b.z);
  if(midY>Math.min(g1,g2)+Math.max(2.5,3/scale))continue;
  const ya=Math.min(a.y,g1-0.15),yb=Math.min(b.y,g2-0.15);
  if(Math.abs(ya-a.y)<tol&&Math.abs(yb-b.y)<tol)continue;
  addQuad(tris,a,b,v3(b.x,yb,b.z),v3(a.x,ya,a.z));added++;
 }
 return {added,candidateEdges:edges.size};
}
// V1.4.4-Experiment: niedriger, physischer Schnittkanten-Ring, 2 mm hoeher
// als das lokale Gelaende an jedem Randpunkt. Pruefhilfe, KEINE Volumenvereinigung.
function appendTwoMillimeterCropRing(tris,bb,scale,sampleTerrain){
 const side=bb.x1-bb.x0,height=2/scale,width=0.65/scale;
 const samples=Math.max(8,Math.min(400,Math.ceil(side/(1.4/scale))));
 const points=[];
 for(let i=0;i<samples;i++)points.push([bb.x0+side*i/samples,bb.z0,0,1]);
 for(let i=0;i<samples;i++)points.push([bb.x1,bb.z0+side*i/samples,-1,0]);
 for(let i=0;i<samples;i++)points.push([bb.x1-side*i/samples,bb.z1,0,-1]);
 for(let i=0;i<samples;i++)points.push([bb.x0,bb.z1-side*i/samples,1,0]);
 const terrain=(x,z)=>sampleTerrain(x,z);
 const p=points.map(([x,z,ix,iz])=>{
  const ox=x,oz=z,insideX=x+ix*width,insideZ=z+iz*width;
  const low=Math.min(terrain(ox,oz),terrain(insideX,insideZ))-0.35/scale;
  const top=Math.max(terrain(ox,oz),terrain(insideX,insideZ))+height;
  return {ob:v3(ox,low,oz),ib:v3(insideX,low,insideZ),ot:v3(ox,top,oz),it:v3(insideX,top,insideZ)};
 });
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length];
  addQuad(tris,a.ot,b.ot,b.it,a.it);
  addQuad(tris,a.ob,a.ot,b.ot,b.ob);
  addQuad(tris,b.ib,b.it,a.it,a.ib);
  addQuad(tris,b.ob,a.ob,a.ib,b.ib);
 }
 return {segments:p.length,heightMm:2,widthMm:0.65};
}
// Binaerer STL-Writer (kein THREE.js in ARK: Kreuzprodukt/Normalisierung
// manuell statt ueber THREE.Vector3). Koordinatentransformation: Y-up (Hoehe,
// Weltraum) -> Z-up STL. v.z ist die absolute Nordung (siehe gatherData()
// conv(): z_abs = Nordung, unverfaelscht). Die Y-STL-Achse muss daher MIT
// steigender Nordung steigen (v.z-bb.z0), nicht dagegen (fruehere Formel
// bb.z1-v.z) - sonst wird die Nord-Sued-Achse gegenueber Ost-West gespiegelt
// und jede nord-sued-asymmetrische Dachform (Grat/First nicht mittig,
// Gauben, Anbauten) landet beim Druck/Import auf der falschen Hausseite
// (reported V1.4.5.x: Daecher seitenverkehrt trotz korrekt uebernommenem
// Markierungsbereich). Weil diese Korrektur die Determinante der
// Koordinatentransformation von +1 auf -1 dreht (reine Rotation -> Spiegelung
// in 3D, noetig um die vorige, falsche 2D-Draufsicht-Spiegelung zu entfernen),
// muss die Flaechennormale zusaetzlich negiert werden, sonst zeigen alle
// Dreiecksnormalen nach innen statt nach aussen (inside-out STL).
function saveBinarySTL(tris,scale,bb,minY){
 const buffer=new ArrayBuffer(84+tris.length*50),dv=new DataView(buffer);
 const header='ARK NRW-3D Diorama | Z-up STL | DGM1 + LoD2 + OSM';
 for(let i=0;i<Math.min(80,header.length);i++)dv.setUint8(i,header.charCodeAt(i));
 dv.setUint32(80,tris.length,true);
 let at=84;
 for(const tri of tris){
  const a=tri[0],b=tri[1],c=tri[2];
  const abx=b.x-a.x,aby=b.y-a.y,abz=b.z-a.z,acx=c.x-a.x,acy=c.y-a.y,acz=c.z-a.z;
  let nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
  const nd=Math.hypot(nx,ny,nz)||1;nx/=nd;ny/=nd;nz/=nd;
  const vals=[-nx,-nz,-ny];
  for(const v of tri)vals.push((v.x-bb.x0)*scale,(v.z-bb.z0)*scale,(v.y-minY)*scale);
  for(const val of vals){dv.setFloat32(at,val,true);at+=4;}
  dv.setUint16(at,0,true);at+=2;
 }
 return new Blob([buffer],{type:'model/stl'});
}

// ---------- Export-Orchestrierung ----------
function fmtFix(labelKey,f){return f&&(f.removed||f.filled)?' · '+I18Nf('nrw3d_fix_cleaned',{label:I18N()[labelKey],removed:f.removed,filled:f.filled}):'';}

// Gemeinsam genutzte Lese-/Ableitungslogik beider Export-Buttons (voller
// Export und Bilderrahmen-Testring), damit Groesse/Profil/Massstab fuer
// beide identisch berechnet werden (= was tatsaechlich gedruckt wuerde).
function readExportParams(){
 const sizeM=parseFloat($('dioramaSize').value)||600;
 const profile=$('dioramaProfile').value;
 const marginMm=parseFloat($('dioramaMargin').value)||0;
 const {innerMm,flangeMm}=profileGeometry(profile,marginMm);
 const scale=innerMm/sizeM; // mm pro Meter
 const flangeWorld=flangeMm>0?flangeMm/scale:0;
 const baseDepth=(parseFloat($('dioramaBase').value)||3)/scale;
 const half=sizeM/2;
 const bb={x0:center.e-half,x1:center.e+half,z0:center.n-half,z1:center.n+half};
 return {sizeM,profile,marginMm,innerMm,flangeMm,scale,flangeWorld,baseDepth,bb};
}

$('dioramaExport').onclick=async()=>{
 if(!center){$('dioramaStatus').textContent=I18N().nrw3d_need_center_first;return;}
 const btn=$('dioramaExport');btn.disabled=true;
 try{
  const {sizeM,innerMm,scale,flangeWorld,baseDepth,bb}=readExportParams();
  const roadDepthMm=parseFloat($('dioramaRoadDepth').value)||0;
  const waterDepthMm=parseFloat($('dioramaWaterDepth').value)||0;
  const roadDepth=roadDepthMm/scale, waterDepth=waterDepthMm/scale;
  const buildingMode=$('dioramaBuildingMode').value;
  const includeBuildings=$('dioramaBuildings').checked;
  const polygonMode=includeBuildings&&buildingMode!=='raster';
  const cropRimMode=buildingMode==='polygons_rim';
  const optim={smoothing:parseFloat($('dioramaSmoothing').value)||0,fragments:$('dioramaFragments').checked,roads:$('dioramaRoadClean').checked,protect:$('dioramaProtect').checked};
  $('dioramaStatus').textContent=I18N().nrw3d_loading_export_data;
  const data=await gatherData(bb,(done,total,dgm,gml,osm)=>{
   $('dioramaStatus').textContent=I18Nf('nrw3d_loading_tiles_full',{done,total,dgm,gml,osm});
  });
  const sampleTerrain=buildSampler(data.heightTiles);
  const roadSegs=collectSegments(roadSegmentsByTile,data.tileKeys);
  const waterSegs=collectSegments(waterSegmentsByTile,data.tileKeys);
  const waterTris=collectWaterTris(data.tileKeys);
  $('dioramaStatus').textContent=I18N().nrw3d_computing_geometry;
  const model=getSolidPrintModel(bb,baseDepth,roadDepth,waterDepth,includeBuildings&&buildingMode==='raster',optim,innerMm,flangeWorld,sampleTerrain,data.roofTris,roadSegs,waterSegs,waterTris);
  let capsInfo=null,footingInfo=null,ringInfo=null,polyInfo=null;
  if(polygonMode){
   polyInfo=appendOriginalLoD2(model.tris,bb,data.roofTris,data.wallTris);
   capsInfo=appendOriginalLoD2BoundaryCaps(model.tris,polyInfo.wallStart-polyInfo.roof,bb,scale,sampleTerrain);
   footingInfo=appendLoD2WallFootings(model.tris,polyInfo.wallStart,polyInfo.wallEnd,bb,scale,sampleTerrain);
   if(cropRimMode)ringInfo=appendTwoMillimeterCropRing(model.tris,bb,scale,sampleTerrain);
  }
  const exportBb=flangeWorld>0?{x0:bb.x0-flangeWorld,x1:bb.x1+flangeWorld,z0:bb.z0-flangeWorld,z1:bb.z1+flangeWorld}:bb;
  let minY=model.bottom;
  for(const t of model.tris)for(const v of t)if(v.y<minY)minY=v.y;
  const blob=saveBinarySTL(model.tris,scale,exportBb,minY);
  const stamp=new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
  const safeLabel=(center.label||'Diorama').replace(/[^a-z0-9_-]+/gi,'_').slice(0,40);
  downloadBlob(blob,`ARK_Diorama_${safeLabel}_${sizeM}m_${buildingMode}_${stamp}.stl`);
  let msg=I18Nf('nrw3d_export_done',{tris:model.tris.length,sizeM,innerMm,scale:Math.round(sizeM*1000/innerMm)});
  if(model.fragmentFixes)msg+=I18Nf('nrw3d_terrain_spikes_cleaned',{n:model.fragmentFixes});
  msg+=fmtFix('nrw3d_fix_label_roads',model.roadFixes)+fmtFix('nrw3d_fix_label_water',model.waterFixes);
  if(includeBuildings&&buildingMode==='raster')msg+=I18Nf('nrw3d_roof_nodes_integrated',{n:model.roofNodes});
  if(polygonMode){
   msg+=I18Nf('nrw3d_experimental_summary',{mode:buildingMode,roof:polyInfo.roof,wall:polyInfo.wall,closed:capsInfo.closed,open:capsInfo.openCutEdges,footing:footingInfo.added});
   if(ringInfo)msg+=I18Nf('nrw3d_cut_rim_segments',{n:ringInfo.segments});
   msg+=I18N().nrw3d_experimental_warning;
  }else{
   msg+=I18N().nrw3d_closed_body_raster;
  }
  $('dioramaStatus').textContent=msg;
 }catch(e){
  $('dioramaStatus').textContent=I18Nf('nrw3d_export_failed',{err:e&&e.message?e.message:e});
 }finally{
  btn.disabled=!center;
 }
};

// Leichtgewichtiger Testdruck: nur ein schmaler Ring am Aussenrand (Default
// 20 mm), um die Passung in den physischen Bilderrahmen zu pruefen, ohne
// das komplette Diorama zu drucken. Laedt DGM1-Gelaendekacheln immer; LoD2-
// Gebaeudekacheln nur, wenn "Gebaeude einbeziehen" im Hauptpanel aktiviert
// ist (dieselbe Einstellung gilt fuer Voll- und Ringexport) - Randgebaeude
// an der Schnittkante sind gerade der kritische Fall fuer die Rahmenpassung
// und duerfen in einem Passungstest nicht fehlen. OSM (Strassen/Wasser)
// bleibt immer aussen vor (fuer die Rahmenpassung irrelevant).
if($('dioramaExportRing'))$('dioramaExportRing').onclick=async()=>{
 if(!center){$('dioramaStatus').textContent=I18N().nrw3d_need_center_first;return;}
 const btn=$('dioramaExportRing');btn.disabled=true;
 try{
  const {sizeM,innerMm,flangeMm,scale,flangeWorld,baseDepth,bb}=readExportParams();
  const ringMm=parseFloat($('dioramaRingWidth').value)||20;
  if(ringMm<=flangeMm){$('dioramaStatus').textContent=I18Nf('nrw3d_ring_width_too_small',{ring:ringMm,flange:flangeMm.toFixed(1)});return;}
  const ringInsetWorld=(ringMm-flangeMm)/scale;
  const span=bb.x1-bb.x0, spanZ=bb.z1-bb.z0;
  if(ringInsetWorld>=Math.min(span,spanZ)/2){$('dioramaStatus').textContent=I18N().nrw3d_ring_width_too_large;return;}
  const includeBuildings=$('dioramaBuildings').checked;
  $('dioramaStatus').textContent=includeBuildings?I18N().nrw3d_loading_ring_with_buildings:I18N().nrw3d_loading_ring_terrain_only;
  const data=await gatherData(bb,(done,total,dgm,gml)=>{
   $('dioramaStatus').textContent=includeBuildings?I18Nf('nrw3d_loading_tiles_ring_with_buildings',{done,total,dgm,gml}):I18Nf('nrw3d_loading_tiles_ring_terrain_only',{done,total,dgm});
  },{gml:includeBuildings,osm:false});
  const sampleTerrain=buildSampler(data.heightTiles);
  $('dioramaStatus').textContent=I18N().nrw3d_computing_ring_geometry;
  const roofTriCount=includeBuildings?data.roofTris.length:0;
  const smoothingPct=parseFloat($('dioramaSmoothing').value)||0;
  // "Loch stanzen" statt eigener Ring-Kurven-Mathematik (siehe Kommentar
  // bei buildFrameTestRingFromSolid): nutzt dasselbe Pro-Zelle-Raster wie
  // der Vollexport, Gebaeude sehen dadurch identisch aus wie dort.
  const ring=buildFrameTestRingFromSolid(bb,ringInsetWorld,flangeWorld,baseDepth,sampleTerrain,includeBuildings?data.roofTris:[],smoothingPct,scale);
  const exportBb=flangeWorld>0?{x0:bb.x0-flangeWorld,x1:bb.x1+flangeWorld,z0:bb.z0-flangeWorld,z1:bb.z1+flangeWorld}:bb;
  let minY=ring.bottom;
  for(const t of ring.tris)for(const v of t)if(v.y<minY)minY=v.y;
  const blob=saveBinarySTL(ring.tris,scale,exportBb,minY);
  const stamp=new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
  const safeLabel=(center.label||'Diorama').replace(/[^a-z0-9_-]+/gi,'_').slice(0,40);
  downloadBlob(blob,`ARK_Diorama_${safeLabel}_Rahmentest_${ringMm}mm_${stamp}.stl`);
  const buildingNote=includeBuildings?I18Nf('nrw3d_ring_buildings_included',{n:roofTriCount}):I18N().nrw3d_ring_terrain_only;
  $('dioramaStatus').textContent=I18Nf('nrw3d_ring_done',{tris:ring.tris.length,ring:ringMm,scale:Math.round(sizeM*1000/innerMm),note:buildingNote});
 }catch(e){
  $('dioramaStatus').textContent=I18Nf('nrw3d_ring_failed',{err:e&&e.message?e.message:e});
 }finally{
  btn.disabled=!center;
 }
};
})();

// ---------- ARK-Systemsprache anwenden ----------
// Muss nach der obigen IIFE und damit zwingend nach scene.js' setupNRWMenus()
// laufen: dessen <aside>->#nrwBar-Gruppierung matcht die <h2>-Ueberschriften
// noch gegen den urspruenglichen deutschen Text (siehe Kommentar dort). Diese
// Uebersetzung aendert nur sichtbaren Text/Attribute, nicht die Gruppierung,
// die zu diesem Zeitpunkt bereits abgeschlossen ist.
applyNrw3dTranslations();
window.addEventListener('storage',e=>{if(e.key==='ark.lang')applyNrw3dTranslations();});

