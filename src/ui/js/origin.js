// ARK-00 Origin V0.1. Scans only on user command. All API requests are local.
'use strict';
(function(){
 const el=id=>document.getElementById(id);
 const state=el('originState'),start=el('originStart'),cancel=el('originCancel'),items=el('originItems'),details=el('originDetails');
 if(!state||!start||!cancel||!items||!details)return;
 let timer=null;
 const nice=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n/1048576)+' MiB';
 function add(tag,content,parent){const x=document.createElement(tag);x.textContent=content;parent.appendChild(x);return x;}
 async function refresh(){
  try{
   const res=await fetch('/api/origin/status',{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);
   const s=await res.json();start.disabled=s.state==='running';cancel.disabled=s.state!=='running';
   state.textContent=(s.state==='running'?'Prüfung läuft':s.state==='complete'?'Scan abgeschlossen':s.state==='error'?'Fehler':s.state==='cancelled'?'Abgebrochen':'Bereit')+' · '+(s.root||'ARKVersionen noch nicht gefunden')+(s.state==='running'?` · ${s.processed}/${s.total} · ${s.current}`:'')+(s.error?' · '+s.error:'');
   if(s.summary){
    const r=s.summary;details.textContent=`${r.archive_count} Archive · ZIP-Daten ${nice(r.total_zip_bytes)} · unkomprimierte Duplikate ${nice(r.duplicate_uncompressed_bytes)} (keine garantierte ZIP-Ersparnis)`;
    items.replaceChildren();for(const a of r.archives||[]){const card=add('div',a.name+' — '+nice(a.size)+' · '+a.entries+' Dateien'+(a.compared_to?' · Vergleich '+a.compared_to+': +'+a.added+' / ~'+a.changed+' / -'+a.removed:'')+(a.error?' · FEHLER: '+a.error:''),items);card.className='origin-row';}
    if(s.report) add('small','Manifest: '+s.report,items);
   }
   if(s.state==='running'){timer=setTimeout(refresh,1500);}else{timer=null;}
  }catch(e){state.textContent='Origin: '+e.message;start.disabled=false;cancel.disabled=true;timer=null;}
 }
 async function action(endpoint){try{const r=await fetch(endpoint,{method:'POST',headers:{'X-ARK-Origin':'scan'}});if(!r.ok){const msg=await r.text();throw Error(msg)}await refresh()}catch(e){state.textContent='Origin: '+e.message}}
 start.addEventListener('click',()=>action('/api/origin/start'));
 cancel.addEventListener('click',()=>action('/api/origin/cancel'));
 window.originRefresh=()=>{if(timer)clearTimeout(timer);refresh()};
 refresh();
})();
