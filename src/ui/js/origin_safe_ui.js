// ARK-00 Origin V0.4 - read-only status and explicit integrity verification.
'use strict';
(function(){
 const panel=document.getElementById('originSafePanel');if(!panel)return;
 const status=document.getElementById('originSafeStatus');
 const versions=document.getElementById('originSafeVersions');
 const result=document.getElementById('originSafeResult');
 const check=document.getElementById('originSafeVerify');
 const reload=document.getElementById('originSafeReload');
 let busy=false;
 async function refresh(){
   try{
     const response=await fetch('/api/origin/safe/inspect',{cache:'no-store'});
     const data=await response.json();
     if(!response.ok||!data.ok)throw new Error(data.error||'HTTP '+response.status);
     status.textContent=data.status;
     versions.textContent=data.versions;
   }catch(e){status.textContent='FEHLER: '+e.message;}
 }
 async function verify(){
   if(busy||!window.confirm('Aktive SafeSwitch-Version vollstaendig per SHA-256 pruefen? Keine Umschaltung oder Startaktion.'))return;
   busy=true;check.disabled=true;result.textContent='Integritaetspruefung laeuft ...';
   try{
     const response=await fetch('/api/origin/safe/verify',{
       method:'POST',headers:{'Content-Type':'application/json','X-ARK-Origin':'safe-verify'},
       body:JSON.stringify({confirm:true})
     });
     const data=await response.json();
     if(!response.ok||!data.ok)throw new Error((data.error||'HTTP '+response.status)+'\n'+(data.detail||''));
     result.textContent='ERFOLGREICH: '+data.detail;
     await refresh();
   }catch(e){result.textContent='GESPERRT: '+e.message;}
   finally{busy=false;check.disabled=false;}
 }
 check.addEventListener('click',verify);
 reload.addEventListener('click',refresh);
 refresh();
})();
