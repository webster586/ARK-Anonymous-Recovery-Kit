// ARK-01 Raziel V0.3.2: fixed visible details & unique totals. Read-only.
const rzEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rzFmt=n=>Number(n||0).toLocaleString('de-DE');
const rzBytes=n=>Number.isFinite(Number(n))&&Number(n)>=0?(Number(n)/1073741824).toLocaleString('de-DE',{maximumFractionDigits:2})+' GiB':'unbekannt';
const rzSize=n=>Number.isFinite(Number(n))&&Number(n)>=0?(Number(n)>=1073741824?rzBytes(n):(Number(n)/1048576).toLocaleString('de-DE',{maximumFractionDigits:1})+' MiB'):'unbekannt';
function rzCard(t,body){return '<section style="background:#10262a;border:1px solid #2b5952;border-radius:10px;padding:15px;margin-bottom:12px;min-width:0"><h3 style="margin:0 0 12px;color:#a6f0d9">'+rzEsc(t)+'</h3>'+body+'</section>'}
function rzLine(k,v){return '<div style="padding:8px 0;border-bottom:1px solid #29423e;overflow-wrap:anywhere"><strong>'+rzEsc(k)+'</strong><div style="color:#b5d1ca">'+rzEsc(v)+'</div></div>'}
let rzPoll=null;
async function rzFetch(url,opt){let r=await fetch(url,{cache:'no-store',...opt});if(!r.ok)throw Error('HTTP '+r.status+' '+url);return r.json()}
function rzVisibleGroups(title,groups,max){
 const data=Array.isArray(groups)?groups:[];
 const shown=data.slice(0,max);
 const note=data.length>max?' · '+rzFmt(data.length-max)+' weitere Gruppen nicht angezeigt':'';
 const rows=shown.map(g=>'<tr><td style="padding:5px 6px;overflow-wrap:anywhere;border-bottom:1px solid #28453f">'+rzEsc(g.name)+(g.module?' <span style="color:#7bc7bc;font-size:11px">['+rzEsc(g.module)+']</span>':'')+'</td><td style="padding:5px 6px;text-align:right;white-space:nowrap;border-bottom:1px solid #28453f">'+rzSize(g.bytes)+'</td><td style="padding:5px 6px;text-align:right;white-space:nowrap;border-bottom:1px solid #28453f">'+rzFmt(g.files)+' </td></tr>').join('');
 return '<div style="margin-top:14px"><div style="font-weight:700;color:#a6f0d9;margin-bottom:6px">'+rzEsc(title)+' <span style="font-weight:400;color:#b5d1ca">('+rzFmt(data.length)+note+')</span></div>'+(shown.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;color:#d7f0e8"><thead><tr><th style="text-align:left;padding:5px 6px">Name</th><th style="text-align:right;padding:5px 6px">Groesse</th><th style="text-align:right;padding:5px 6px">Dateien</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div style="color:#b5d1ca;padding:4px 0">Keine Eintraege fuer diesen Bereich.</div>')+'</div>';
}
function rzLocDetails(x){
 const partial=x.complete?'Vollstaendig gelesen':'Noch nicht vollstaendig gelesen';
 const note=x.overlaps?'<p style="color:#f2c782;margin:8px 0">Teilmenge von '+rzEsc(x.overlaps)+' – wird nicht erneut zur eindeutigen Datensumme addiert.</p>':'';
 return '<section style="border:1px solid #31534e;border-radius:9px;margin:10px 0;padding:12px;min-width:0;background:#0d2123">'
  +'<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline"><strong style="color:#a6f0d9">'+rzEsc(x.kind)+'</strong><strong>'+rzSize(x.bytes)+'</strong></div>'
  +'<div style="overflow-wrap:anywhere;color:#b5d1ca;font-size:12px;margin:4px 0">'+rzEsc(x.path)+'</div>'
  +'<div style="margin:8px 0">'+rzEsc(x.module)+' · Laufwerk '+rzEsc(x.drive)+' · '+rzFmt(x.files)+' Dateien · '+rzFmt(x.directories)+' Ordner · '+rzFmt(x.errors)+' Lesefehler · '+rzEsc(partial)+'</div>'
  +note+rzVisibleGroups('Unterordner / direkte Dateien',x.groups,16)+rzVisibleGroups('Dateitypen',x.extensions,12)+'</section>';
}
function rzUnique(d){
 const drives=new Map();let unique=0,files=0,raw=0,rawFiles=0;
 for(const x of d.locations||[]){
  const bytes=Number(x.bytes)||0,n=Number(x.files)||0;
  raw+=bytes;rawFiles+=n;
  const entry=drives.get(x.drive)||{count:0,bytes:0,files:0};entry.count++;
  if(!x.overlaps){entry.bytes+=bytes;entry.files+=n;unique+=bytes;files+=n}
  drives.set(x.drive,entry);
 }
 return {drives,unique,files,raw,rawFiles};
}
function rzRenderScan(d){
 const target=document.getElementById('rz03scan'),status=document.getElementById('rz03status');if(!target||!status)return;
 const stateNames={idle:'Noch kein Tiefenscan',running:'Scan laeuft',complete:'Scan abgeschlossen',partial:'Scan teilweise abgeschlossen',cancelled:'Scan abgebrochen'};
 const s=rzUnique(d);
 const detail=(d.locations||[]).length?' · '+rzSize(s.raw)+' brutto inkl. mehrfach erfasster Teilordner':'';
 status.textContent=(stateNames[d.state]||d.state)+' · '+rzFmt(s.files)+' eindeutige Dateien · '+rzSize(s.unique)+' eindeutige ARK-Daten'+detail+(d.current_path?' · '+d.current_path:'')+(d.message?' · '+d.message:'');
 const running=d.state==='running';document.getElementById('rz03start').disabled=running;document.getElementById('rz03cancel').disabled=!running;
 const driveLine=[...s.drives].map(([drive,v])=>rzLine(drive,v.count+' Fundorte · '+rzSize(v.bytes)+' eindeutige ARK-Daten · '+rzFmt(v.files)+' Dateien')).join('');
 target.innerHTML=rzCard('EINDEUTIG ERFASSTE ARK-DATEN',
 '<div style="font-size:21px;font-weight:700;color:#a6f0d9">'+rzSize(s.unique)+'</div><div style="color:#b5d1ca">'+rzFmt(s.files)+' Dateien · nur bekannte ARK-Fundorte · kein Gesamtplattenverbrauch</div>'
 +'<div style="margin-top:8px;font-size:12px;color:#b5d1ca">Technische Rohsumme: '+rzSize(s.raw)+' / '+rzFmt(s.rawFiles)+' Dateitreffer; darin sind separat untersuchte Unterordner mehrfach enthalten.</div>'
 +((d.state==='cancelled'||d.state==='partial')?'<div style="color:#f2c782;margin-top:8px">Unvollstaendiger Scan: Summen sind vorlaeufig.</div>':''))
 +rzCard('DATENMENGEN NACH LAUFWERK',driveLine||'<p>Tiefenscan noch nicht gestartet.</p>')
 +rzCard('FUNDORTE MIT SICHTBAREN DETAILS',(d.locations||[]).map(rzLocDetails).join('')||'<p>Nach Klick auf „Tiefenscan starten“ werden Dateigroessen ermittelt.</p>');
}
async function rzPollScan(){try{const d=await rzFetch('/api/raziel/v3/scan/status');rzRenderScan(d);if(d.state==='running')rzPoll=setTimeout(rzPollScan,1500)}catch(e){const s=document.getElementById('rz03status');if(s)s.textContent='Scanstatus: '+e.message}}
async function rzStart(){try{await rzFetch('/api/raziel/v3/scan/start',{method:'POST'});clearTimeout(rzPoll);rzPollScan()}catch(e){document.getElementById('rz03status').textContent='Scanstart fehlgeschlagen: '+e.message}}
async function rzCancel(){try{await rzFetch('/api/raziel/v3/scan/cancel',{method:'POST'});clearTimeout(rzPoll);rzPollScan()}catch(e){document.getElementById('rz03status').textContent='Abbruch fehlgeschlagen: '+e.message}}
function rzScanUi(){let host=document.getElementById('rz03host');if(host)return;const out=document.getElementById('razielDetails');if(!out)return;
 host=document.createElement('div');host.id='rz03host';host.innerHTML='<h3>DATENTRAEGER- & INHALTSANALYSE V0.3.2</h3><p>Rekursiver Nur-Lesen-Scan bekannter ARK-Fundorte. Nur erkannte Bereiche, nicht gesamte Laufwerke. Angaben bei laufendem Scan vorlaeufig.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="rz03start">Tiefenscan starten</button><button type="button" id="rz03cancel" disabled>Scan abbrechen</button></div><p id="rz03status" aria-live="polite">Noch kein Tiefenscan</p><div id="rz03scan"></div>';
 out.parentNode.insertBefore(host,out.nextSibling);
 document.getElementById('rz03start').addEventListener('click',rzStart);document.getElementById('rz03cancel').addEventListener('click',rzCancel);
}
async function razielRefresh(){const status=document.getElementById('razielStatus'),out=document.getElementById('razielDetails');if(!status||!out)return;
 status.textContent='Raziel V0.3.2 ermittelt Hardware und ARK-Fundorte (lesend) ...';rzScanUi();
 try{const d=await rzFetch('/api/raziel/v2/inventory');if(d.read_only!==true)throw Error('Inventar ist nicht nur-lesend');const i=d.inventory||{},h=d.hardware||{};
 const machine=[rzLine('CPU',h.cpu||i.machine?.prozessor||'unbekannt'),rzLine('CPU-Kerne',i.machine?.cpu_kerne||'?'),rzLine('RAM',rzBytes(h.ram_bytes)),rzLine('GPU',(h.gpu||[]).join(', ')||'unbekannt'),rzLine('Computer',i.machine?.computer||'?'),rzLine('Hardwarequelle',h.note||'')];
 const disks=(h.disks||[]).map(x=>{const size=Number(x.capacity_bytes||0),free=Number(x.free_bytes||0);return rzLine((x.device||'')+' '+(x.label||''),rzBytes(size)+' gesamt · '+rzBytes(free)+' frei · '+rzBytes(Math.max(0,size-free))+' belegt · Volume-ID: '+(x.serial||'unbekannt'))});
 const found=(i.found||[]).map(x=>rzLine(x.kind,x.path+' · '+x.note));const services=Object.entries(i.services||{}).map(([k,v])=>rzLine(k,v));
 out.innerHTML=rzCard('HARDWAREINVENTAR',machine.join(''))+rzCard('DATENTRAEGER & KAPAZITAET',disks.join(''))+rzCard('ARK-FUNDORTE (VORSCHAU)',found.join(''))+rzCard('DIENSTE (PORTTEST)',services.join(''));
 status.textContent='Raziel V0.3.2: '+(h.disks||[]).length+' Laufwerke · '+(i.found||[]).length+' Fundorte · keine Dateiaenderungen';
 clearTimeout(rzPoll);await rzPollScan();
 }catch(e){status.textContent='Raziel-Inventar fehlgeschlagen: '+e.message}
}
document.getElementById('razielScan')?.addEventListener('click',razielRefresh);
