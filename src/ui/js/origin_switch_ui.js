// ARK-00 Origin V0.3: isolated LAB deployment and version selector.
'use strict';
(function(){
 const $=id=>document.getElementById(id), panel=$('originSwitchPanel');if(!panel)return;
 const source=$('originSwitchSource'),versions=$('originSwitchVersion'),deploy=$('originSwitchDeploy'),select=$('originSwitchSelect');
 const status=$('originSwitchStatus'),output=$('originSwitchResult');let timer=null,selected=null,versionList=[];
 function fill(node,items){const old=node.value;node.replaceChildren();for(const item of items){let o=document.createElement('option');o.value=item.id||item;o.textContent=item.source_name ? (item.source_name+(item.runnable?' · startfaehig':' · Datenarchiv')):item;node.append(o)}if(items.some(x=>(x.id||x)===old))node.value=old;}
 async function load(){
  const [a,b]=await Promise.all([fetch('/api/origin/patch/list',{cache:'no-store'}),fetch('/api/origin/switch/list',{cache:'no-store'})]);
  const archives=await a.json(),data=await b.json();if(!a.ok||!b.ok)throw Error(archives.error||data.error||'Liste nicht erreichbar');
  fill(source,[...(archives.archives||[]),...(data.builds||[])]);
  versionList=data.versions||[];selected=data.selected;
  fill(versions,versionList);
  select.disabled=!versionList.some(v=>v.id===versions.value&&v.runnable);
  status.textContent='LAB OriginSwitch: '+versionList.length+' Kopien; ausgewählt: '+(selected||'keine')+'.';
 }
 async function refresh(){
  try {const r=await fetch('/api/origin/switch/status',{cache:'no-store'}),j=await r.json();if(!r.ok)throw Error('HTTP '+r.status);
   const running=j.state==='running';deploy.disabled=running;select.disabled=running||!versionList.some(v=>v.id===versions.value&&v.runnable);
   if(running){status.textContent='LAB-Aufgabe läuft: '+j.action;return}
   if(j.state==='error') {status.textContent='Fehler: '+j.error;output.textContent=j.error}
   if(j.state==='complete'&&j.result) {output.textContent=JSON.stringify(j.result,null,2)}
   if(timer){clearInterval(timer);timer=null}await load();
  }catch(e){status.textContent='Fehler: '+e.message}
 }
 async function submit(action){
  if(action==='select'&&!confirm('Diese LAB-Version für den nächsten manuellen Start auswählen? Die laufende ARK-Instanz wird nicht verändert.'))return;
  const body={action,source:source.value,id:versions.value};if(action==='deploy'&&!body.source)return;
  try{const r=await fetch('/api/origin/switch/start',{method:'POST',headers:{'Content-Type':'application/json','X-ARK-Origin':'switch'},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);
   if(timer)clearInterval(timer);timer=setInterval(refresh,1500);await refresh();
  }catch(e){status.textContent='Fehler: '+e.message}
 }
 deploy.addEventListener('click',()=>submit('deploy'));select.addEventListener('click',()=>submit('select'));
 versions.addEventListener('change',()=>{select.disabled=!versionList.some(v=>v.id===versions.value&&v.runnable)});
 $('originSwitchReload').addEventListener('click',()=>load().catch(e=>status.textContent=e.message));
 load().then(refresh).catch(e=>status.textContent='Fehler: '+e.message);
})();
