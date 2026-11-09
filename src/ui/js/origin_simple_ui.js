// Origin V0.4.3.5: beta manager is the single version authority.
'use strict';
(function () {
  const panel=document.getElementById('originSimplePanel');
  if(!panel)return;
  const current=document.getElementById('originSimpleCurrent');
  const dropdown=document.getElementById('originSimpleVersions');
  const button=document.getElementById('originSimpleStart');
  const message=document.getElementById('originSimpleMessage');
  const fallback=document.getElementById('originSimpleFallback');
  const runningLine=document.getElementById('originSimpleRunning');
  const diagBtn=document.getElementById('originFrontendTest');
  const manager='http://127.0.0.1:8876';
  let available=[];
  const recent=new Map();
  function report(type,component,text){
    const key=type+'|'+component+'|'+text;
    if(Date.now()-(recent.get(key)||0)<30000)return;
    recent.set(key,Date.now());
    if(recent.size>100)recent.clear();
    fetch(manager+'/api/bridge/event', {method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,component,message:text.slice(0,300)}),keepalive:true}).catch(()=>{});
  }
  window.addEventListener('error',event=>{
    const source=String(event.filename||'').split('/').pop().split('\\').pop().slice(0,60);
    report('FRONTEND_ERROR','UI','JavaScript-Fehler '+source+':'+(event.lineno||0)+' ['+(event.error&&event.error.name||'Error')+']');
  });
  window.addEventListener('unhandledrejection',event=>{
    const name=event.reason&&event.reason.name||'PromiseRejection';
    report('FRONTEND_ERROR','UI','Unbehandelte Promise-Ablehnung ['+String(name).slice(0,40)+']');
  });
  function setOption(label,value){const o=document.createElement('option');o.textContent=label;o.value=value;dropdown.append(o)}
  async function refresh(){
    dropdown.disabled=true;button.disabled=true;
    message.textContent='Lese Versionen aus dem unabhängigen Origin-Manager ...';
    try{
      const response=await fetch(manager+'/api/bridge/status',{cache:'no-store',mode:'cors'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(data.state_source!=='origin-manager'||!Array.isArray(data.versions))throw new Error('Ungültige Manager-Antwort');
      available=data.versions;
      current.textContent=data.selected;
      if(runningLine)runningLine.textContent=data.running ? ('Tatsächlich laufend: '+data.running) : 'ARK ist derzeit nicht über Origin gestartet';
      fallback.textContent='Gesicherter Rückfallstand: '+data.fallback+' · '+data.fallback_files+' Dateien (Manifest, bei Wechsel erneut geprüft)';
      dropdown.replaceChildren();
      for(const v of available)setOption(v+(v===data.selected?' (ausgewählt)':''),v);
      dropdown.value=data.selected;
      dropdown.disabled=!available.length;
      button.disabled=!available.length;
      message.textContent='Origin Manager '+data.manager_version+' verbunden. Wechsel und Updates werden ausschließlich dort bestätigt.';
    }catch(err){
      current.textContent='Origin-Manager nicht erreichbar';
      if(runningLine)runningLine.textContent='Laufender Zustand unbekannt';
      fallback.textContent='Rückfallstatus nicht verfügbar';
      dropdown.replaceChildren();setOption('Origin-Manager auf Port 8876 starten','');
      message.textContent='Verbindung zum Origin-Manager fehlgeschlagen. Kein Versionswechsel möglich.';
      report('API_ERROR','ARK-00','Origin-Manager Status nicht erreichbar ['+String(err.name||'Error').slice(0,30)+']');
    }
  }
  button.addEventListener('click',()=>{
    const v=dropdown.value;
    if(!available.includes(v))return;
    // The embedded ARK page MUST NOT be able to bypass the manager's CSRF and user confirmation.
    window.open(manager+'/?version='+encodeURIComponent(v),'_blank','noopener');
    message.textContent='Origin-Manager geöffnet: Versionswechsel dort bestätigen.';
    report('UI_EVENT','ARK-00','Versionsmanager zur Auswahl geöffnet');
  });
  if(diagBtn)diagBtn.addEventListener('click',()=>{
    // Explicit opt-in, synthetic frontend error, no crash and no sensitive payload.
    const simulated=new ErrorEvent('error',{message:'Kontrollierter Origin-Frontend-Test',filename:'origin_simple_ui.js',lineno:1,error:{name:'OriginDiagnosticTest'}});
    window.dispatchEvent(simulated);
    message.textContent='Kontrollierter Frontend-Test ausgelöst. Diagnoseexport im Origin-Manager prüfen.';
  });
  refresh();
})();
