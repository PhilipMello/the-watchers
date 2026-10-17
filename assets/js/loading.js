// Independent fallback: still runs if a module cannot be downloaded or parsed.
(()=>{
 let finished=false;
 const hide=()=>{document.querySelector('#boot-loading')?.remove();document.body.setAttribute('aria-busy','false');};
 const fail=()=>{if(finished)return;finished=true;clearTimeout(timer);hide();const panel=document.querySelector('#boot-error');if(panel){panel.hidden=false;panel.focus();}const details=document.querySelector('#boot-details');if(details&&!details.textContent)details.textContent='The application could not finish loading. Check your connection, serve dist over localhost or HTTPS, and reload the page.';};
 const timer=setTimeout(fail,45000);
 window.addEventListener('error',event=>{if(event.target?.tagName==='SCRIPT'||event.error)fail();},true);
 window.addEventListener('unhandledrejection',fail);
 window.addEventListener('watchers-ready',()=>{finished=true;clearTimeout(timer);hide();});
})();
