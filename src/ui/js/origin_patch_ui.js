// ARK-00 Origin V0.2.3: UI for verified LAB patches, no automatic production actions.
'use strict';
(function () {
 const $ = id => document.getElementById(id);
 const panel = $('originPatchPanel');
 if (!panel) return;
 const base=$('originPatchBase'), target=$('originPatchTarget'), patch=$('originPatchFile');
 const start=$('originPatchCreate'),restore=$('originPatchRestore'),cancel=$('originPatchCancel'),status=$('originPatchStatus'),result=$('originPatchResult');
 let interval=null;
 const populate=(node,names)=>{ const old=node.value;node.replaceChildren();for(const name of names){const o=document.createElement('option');o.textContent=name;o.value=name;node.append(o)}if(names.includes(old))node.value=old;};
 async function load(){try{const r=await fetch('/api/origin/patch/list',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);populate(base,j.archives||[]);populate(target,j.archives||[]);populate(patch,j.patches||[]);status.textContent='Archivbasis: '+j.root;}catch(e){status.textContent='Fehler: '+e.message;}}
 async function refresh(){
  try {const r=await fetch('/api/origin/patch/status',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error('HTTP '+r.status);
   const running=j.state==='running';start.disabled=running;restore.disabled=running;cancel.disabled=!running;
   status.textContent=running?'Patch-Aufgabe läuft: '+j.action:j.state==='complete'?'Abgeschlossen und geprüft':j.state==='error'?'Fehler: '+j.error:j.state==='cancelled'?'Abgebrochen':'Bereit';
   if(j.result){result.textContent=JSON.stringify(j.result,null,2)}
   if(j.state==='error')result.textContent=j.error;
   if(!running){if(interval){clearInterval(interval);interval=null};await load();}
  }catch(e){status.textContent='Fehler: '+e.message;}
 }
 async function run(action){
   try {if(action==='create'&&base.value===target.value){status.textContent='Bitte zwei verschiedene Archive wählen.';return;}
    if(!base.value||(action==='create'&&!target.value)||(action==='restore'&&!patch.value)){status.textContent='Archiv/Patch auswählen.';return;}
    const body=JSON.stringify({action,base:base.value,target:target.value,patch:patch.value});
    const r=await fetch('/api/origin/patch/start',{method:'POST',headers:{'Content-Type':'application/json','X-ARK-Origin':'patch'},body});
    const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);
    result.textContent='';await refresh();if(interval)clearInterval(interval);interval=setInterval(refresh,1500);
   }catch(e){status.textContent='Fehler: '+e.message;}
 }
 start.addEventListener('click',()=>run('create'));
 restore.addEventListener('click',()=>run('restore'));
 cancel.addEventListener('click',async()=>{await fetch('/api/origin/patch/cancel',{method:'POST',headers:{'X-ARK-Origin':'patch'}});await refresh();});
 window.originPatchRefresh=()=>{load().then(refresh)};
 load().then(refresh);
})();
