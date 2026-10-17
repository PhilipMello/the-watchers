// Fallback messages are generated from en-US by the build. They remain available
// even when the repository fails before the language catalog can be fetched.
export function showBootFailure(error,documentRef=document) {
  const catalog=JSON.parse(documentRef.querySelector('#boot-messages').textContent);
  const issues=error?.issues||[{code:'unknown',path:'',params:{cause:String(error?.message||error)}}];
  const details=issues.map(({code,path,params={}})=>{
    const template=catalog['error.'+code]||catalog['error.unknown'];
    const message=template.replace(/\{([a-zA-Z_]+)\}/g,(match,key)=>String(({path,...params})[key]??match));
    const url=path?new URL(path,documentRef.baseURI).href:documentRef.baseURI;
    return message+'\n'+url+(params.cause&&!template.includes('{cause}')?'\n'+params.cause:'');
  }).join('\n\n');
  documentRef.querySelector('#app').hidden=true;
  documentRef.querySelector('#boot-details').textContent=details;
  const panel=documentRef.querySelector('#boot-error');panel.hidden=false;panel.focus();
}
