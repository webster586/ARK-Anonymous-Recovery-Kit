/* ARK-0 V0.4.1: explicit discover, assign and persist; actual module health tests remain separate. */
(function(){'use strict';
 const $=id=>document.getElementById(id);
 let running=false, known={}, scanRunning=false, scanResults={};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const msg=s=>{if($('installMessage'))$('installMessage').textContent=s};
 async function api(url,body){let r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error((await r.text()).trim()||`HTTP ${r.status}`);return r.json()}
 async function refresh(){if(running)return;running=true;try{
  const r=await fetch('/api/install/components',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
  const items=(await r.json()).components||[];known=Object.fromEntries(items.map(x=>[x.id,x]));let found=0;
  const old=JSON.parse(localStorage.getItem('ark-install-check-v041')||'{}'), next={};let changes=0;
  $('installRows').innerHTML=items.map(c=>{if(c.status==='Datei erkannt')found++;next[c.id]=c.path+'|'+c.status;if(old[c.id]&&old[c.id]!==next[c.id])changes++;
    const marked=c.status==='Datei erkannt';
    const buttons=`<button type="button" data-pick="${esc(c.id)}">${c.picker==='folder'?'ORDNER':'DATEI'} WAEHLEN</button>`+
      (c.setup_endpoint&&!marked?` <button type="button" data-setup="${esc(c.id)}" data-endpoint="${esc(c.setup_endpoint)}">HERUNTERLADEN</button>`:'');
    const online=(c.download==='official-python.org'||c.download==='gyan.dev')?'<span class="install-hint">Automatischer Download beim ARK-Start</span>':
      '<span class="install-hint">'+esc(c.download==='approval-required'?'Onlinepaket nur nach Freigabe':c.download==='external-only'?'Extern verwaltet':'Keine verifizierte Downloadquelle')+'</span>';
    const found=!marked&&(scanResults[c.id]||[]).length?(scanResults[c.id].slice(0,3).map(p=>`<div class="install-suggestion">Tiefensuche-Fund: <code>${esc(p)}</code> <button type="button" data-apply="${esc(c.id)}" data-path="${esc(p)}">UEBERNEHMEN</button></div>`).join('')):'';
    return `<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.kind)}</small></td><td>${esc(c.dependency)}</td><td class="install-path" title="${esc(c.path)}">${esc(c.path)}</td><td><span class="install-status ${marked?'yes':'no'}">${esc(c.status)}</span></td><td>${buttons} ${online}${found}</td></tr>`;
   }).join('');
  $('installSummary').textContent=`${items.length} Komponenten · ${found} Dateien/Ordner erkannt · ${Object.keys(old).length?changes+' Änderungen':'Erstprüfung'}`;
  localStorage.setItem('ark-install-check-v041',JSON.stringify(next));msg('Prüfung: '+new Date().toLocaleTimeString('de-DE')+' · Gefunden bedeutet nicht funktionsgeprüft.');
 }catch(e){msg('Prüfung fehlgeschlagen: '+e.message)}finally{running=false}}

 // ARK-owned explorer: no hidden PowerShell process and no browser access to absolute local paths.
 let explorerState=null;
 function ensureExplorer(){
   let modal=$('arkFileExplorer');if(modal)return modal;
   modal=document.createElement('div');modal.id='arkFileExplorer';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
   modal.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.84);display:flex;align-items:center;justify-content:center;padding:20px';
   modal.innerHTML=`<section style="background:#061d1c;color:#c9f6ed;border:1px solid #16a085;border-radius:12px;padding:18px;width:min(850px,95vw);max-height:85vh;display:flex;flex-direction:column;gap:12px;font:14px sans-serif">
    <header style="display:flex;justify-content:space-between;align-items:center"><strong id="arkExplorerTitle">ARK DATEI-/ORDNERAUSWAHL</strong><button type="button" id="arkExplorerClose">SCHLIESSEN</button></header>
    <div id="arkExplorerPath" style="overflow-wrap:anywhere;color:#85c6bb"></div>
    <div style="display:flex;gap:10px"><button type="button" id="arkExplorerDrives">LAUFWERKE</button><button type="button" id="arkExplorerUp">ZURUECK</button><button type="button" id="arkExplorerSelectFolder">DIESEN ORDNER AUSWAEHLEN</button></div>
    <div id="arkExplorerStatus" role="status" style="color:#efca94"></div>
    <div id="arkExplorerEntries" style="overflow-y:auto;min-height:150px;max-height:52vh;border:1px solid #235c55;padding:6px"></div>
    </section>`;
   document.body.appendChild(modal);
   return modal;
 }
 async function explore(path){
   const modal=ensureExplorer(),box=modal.querySelector('#arkExplorerEntries'),status=modal.querySelector('#arkExplorerStatus');
   status.textContent='Verzeichnis lesen ...';box.replaceChildren();
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
   try{
     const r=await fetch('/api/install/explore'+(path?'?path='+encodeURIComponent(path):''),{cache:'no-store',signal:controller.signal});
     if(!r.ok)throw Error((await r.text()).trim()||`HTTP ${r.status}`);
     const data=await r.json();explorerState.path=data.path||'';explorerState.parent=data.parent||'';
     modal.querySelector('#arkExplorerPath').textContent=data.path||'Dieser PC / verfügbare Laufwerke';
     modal.querySelector('#arkExplorerSelectFolder').hidden=explorerState.picker!=='folder'||!data.path;
     modal.querySelector('#arkExplorerUp').disabled=!data.path;
     const fragment=document.createDocumentFragment();
     for(const ent of data.entries||[]){
       const line=document.createElement('button');line.type='button';line.style.cssText='display:block;width:100%;text-align:left;margin:3px 0;padding:9px;background:#082b29;color:#c9f6ed;border:1px solid #215e55;border-radius:5px;cursor:pointer';
       line.textContent=(ent.is_dir?'[ORDNER] ':'[DATEI] ')+ent.name;
       line.addEventListener('click',()=>{if(ent.is_dir)explore(ent.path);else if(explorerState.picker==='file')finishExplorer(ent.path)});
       if(!ent.is_dir && explorerState.picker==='folder'){line.disabled=true;line.style.opacity='.4'}
       fragment.appendChild(line);
     }
     box.appendChild(fragment);
     status.textContent=(data.entries||[]).length+' Einträge'+(data.truncated?' (Anzeige auf 1200 begrenzt)':'')+' · Keine Dateien werden verschoben';
   }catch(e){status.textContent='Auswahlfehler: '+e.message}finally{clearTimeout(timeout)}
 }
 function finishExplorer(path){const st=explorerState;explorerState=null;$('arkFileExplorer')?.remove();st?.resolve(path)}
 function chooseInArk(picker){
   return new Promise(resolve=>{
     if(explorerState){resolve('');return}
     explorerState={picker,resolve,path:'',parent:''};const modal=ensureExplorer();
     modal.querySelector('#arkExplorerTitle').textContent=picker==='file'?'ARK // DATEI WAEHLEN':'ARK // ORDNER WAEHLEN';
     modal.querySelector('#arkExplorerClose').onclick=()=>finishExplorer('');
     modal.querySelector('#arkExplorerDrives').onclick=()=>explore('');
     modal.querySelector('#arkExplorerUp').onclick=()=>explore(explorerState.parent||'');
     modal.querySelector('#arkExplorerSelectFolder').onclick=()=>finishExplorer(explorerState.path);
     explore('');
   });
 }

 async function pollSetup(endpoint){
   const statusUrl=endpoint+'/status';
   for(;;){
     await new Promise(r=>setTimeout(r,2000));
     let s;try{s=await (await fetch(statusUrl,{cache:'no-store'})).json()}catch(e){continue}
     msg(s.message||'Einrichtung läuft …');
     if(!s.busy)return s;
   }
 }

 // Replaces the former per-component "SUCHEN" buttons: one systemwide deep
 // search covers every still-missing, bindable component at once, reusing
 // the same safe read-only walk the per-component search used to run alone.
 async function runDeepScan(){
   if(scanRunning)return;scanRunning=true;
   try{
    const start=await fetch('/api/install/scan/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!start.ok&&start.status!==409)throw Error((await start.text()).trim()||'HTTP '+start.status);
    for(;;){
     await new Promise(r=>setTimeout(r,1200));
     let s;try{s=await (await fetch('/api/install/scan/status',{cache:'no-store'})).json()}catch(e){continue}
     if(s.state==='running'){msg('Tiefensuche läuft … '+(s.inspected||0)+' Einträge geprüft'+(s.current_path?(' · zuletzt: '+s.current_path):''));continue}
     scanResults=s.results||{};
     msg(s.message||'Tiefensuche abgeschlossen.');
     await refresh();
     return;
    }
   }catch(err){msg('Tiefensuche fehlgeschlagen: '+err.message)}finally{scanRunning=false}
 }

 document.addEventListener('DOMContentLoaded',()=>{
  $('installRefresh')?.addEventListener('click',async()=>{
   const btn=$('installRefresh');if(btn)btn.disabled=true;
   try{await refresh();await runDeepScan()}finally{if(btn)btn.disabled=false}
  });
  $('installRows')?.addEventListener('click',async e=>{
   const setupBtn=e.target.closest('button[data-setup]');
   if(setupBtn){
    const id=setupBtn.dataset.setup,endpoint=setupBtn.dataset.endpoint,c=known[id];if(!c)return;
    if(!confirm('"'+c.name+'" jetzt aus dem Internet herunterladen? Dies kann je nach Komponente mehrere hundert MB bis wenige GB benötigen und erfordert eine Internetverbindung.'))return;
    setupBtn.disabled=true;
    try{
     const start=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-ARK-Launch':'1'},body:'{}'});
     if(!start.ok)throw Error((await start.text()).trim()||'HTTP '+start.status);
     msg('Download gestartet …');
     const final=await pollSetup(endpoint);
     msg(final.message||'Einrichtung abgeschlossen.');
     await refresh();
    }catch(err){msg('Herunterladen fehlgeschlagen: '+err.message)}finally{setupBtn.disabled=false}
    return;
   }
   const applyBtn=e.target.closest('button[data-apply]');
   if(applyBtn){
    const id=applyBtn.dataset.apply,path=applyBtn.dataset.path;if(!id||!path)return;applyBtn.disabled=true;
    try{await api('/api/install/bind',{id,path});await refresh();msg('Dauerhafte Bindung gespeichert: '+path+' (ohne Kopieren; Funktionsprüfung steht aus)')}
    catch(err){msg('Komponentenzuordnung: '+err.message)}finally{applyBtn.disabled=false}
    return;
   }
   const b=e.target.closest('button[data-pick]');if(!b)return;
   const id=b.dataset.pick,c=known[id];if(!c)return;b.disabled=true;
   try{
    msg('ARK-Dateibrowser öffnen...');const path=await chooseInArk(c.picker);if(!path){msg('Auswahl abgebrochen');return}
    await api('/api/install/bind',{id,path});await refresh();msg('Dauerhafte Bindung gespeichert: '+path+' (ohne Kopieren; Funktionsprüfung steht aus)');
   }catch(err){msg('Komponentenzuordnung: '+err.message)}finally{b.disabled=false}
  });refresh();
 });
 window.installRefresh=refresh;
})();
