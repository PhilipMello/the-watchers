import {GitHub,branchName,validateBranch} from './client.mjs';
import {publication} from '../collection-snapshot/publication.mjs';
export function createUI(c){
 const {el,t,button,field,modal,errors}=c;let client=null,identity=null;
 async function submitGitHub(){
  const descriptor=c.kernel.get('plugin.settings','watchers.github'),settings=descriptor.read(),m=modal('github.submit');
  const token=el('input',{type:'password',autocomplete:'off','aria-label':t('github.token')}),state=el('p',{role:'status','aria-live':'polite'}),body=el('div',{class:'stack'});
  let plan=null,submission=c.kernel.get('github.progress','current').read()||{},busy=false;
  const mode=el('select',{},el('option',{value:'collection'},'Collection changes'),el('option',{value:'initial'},'Install clean Genesis'));mode.value=submission.commit&&!submission.pr?submission.mode||'collection':'collection';
  const modeHelp=el('p',{class:'muted'});
  const showMode=()=>{modeHelp.textContent=mode.value==='initial'?'Install the complete clean project into an existing branch containing only LICENSE or unrelated files. Browser drafts are excluded. Requires Contents, Pull requests, and Workflows write permissions. Existing files with different contents will block installation.':'Publish public collection changes against this build’s source baseline.';};
  mode.addEventListener('change',()=>{if(busy)return;plan=null;body.replaceChildren();clearError();showMode();state.textContent=t('github.ready');});showMode();
  const report=error=>{
   state.textContent=t('github.failed');errors(error,m.error);
   if(error.conflicts?.length&&client){
    const detail=el('details',{},el('summary',{},t('github.conflictDetails')),el('p',{},t('github.conflictHelp')));
    for(const item of error.conflicts){
     const href='https://github.com/'+encodeURIComponent(client.owner)+'/'+encodeURIComponent(client.repo)+'/blob/'+encodeURIComponent(error.base)+'/'+item.path.split('/').map(encodeURIComponent).join('/');
     detail.append(el('div',{class:'panel stack'},el('strong',{},item.path),el('p',{},t('github.baseHash')+': '+(item.expected||'—')),el('p',{},t('github.remoteHash')+': '+(item.remote||'—')),el('p',{},t('github.localHash')+': '+(item.proposed||'—')),el('a',{href,target:'_blank',rel:'noopener noreferrer'},t('github.inspectRemote'))));
    }
    m.error.append(detail);
   }
   m.error.scrollIntoView?.({block:'nearest'});
  };
  const clearError=()=>{m.error.textContent='';m.error.className='';};
  const setBusy=value=>{busy=value;connect.disabled=value;disconnect.disabled=value;token.disabled=value;mode.disabled=value||Boolean(submission.commit&&!submission.pr);value?m.markDirty():m.markClean();};
  m.body.append(el('p',{class:'muted'},t('github.help')),el('a',{href:'#settings/plugin/watchers.github',onclick:event=>{if(busy)event.preventDefault();else m.finish();}},t('kernel.settings')),field('github.mode',mode),modeHelp,field('github.token',token),state);
  const connect=button('github.connect',async()=>{
   if(busy)return;setBusy(true);clearError();body.replaceChildren();plan=null;state.textContent=t('github.connecting');
   try{
    if(submission.pr){submission={};c.kernel.get('github.progress','current').write(null);}
    if(client&&(client.owner!==settings.owner||client.repo!==settings.repo)){client=null;identity=null;}
    if(token.value.trim()){
     const candidate=new GitHub({token:token.value.trim(),owner:settings.owner.trim(),repo:settings.repo.trim()});token.value='';client=null;identity=null;
     const authenticated=await candidate.identity();client=candidate;identity=authenticated;
     client.onProgress=progress=>c.kernel.get('github.progress','current').write(progress);
    }
    if(!client||!identity)throw Error(t('github.tokenRequired'));
    state.textContent=t('github.preparing');
    if(mode.value==='initial')plan=await client.prepareInitial(settings.base.trim(),await c.initialProject());
    else{const pkg=await publication(await c.ensureSnapshot(),c.appConfig(),c.assets());plan=await client.prepare(settings.base.trim(),await c.baseline(),pkg.files);}
    if(!plan.changes.length){state.textContent=t('github.noChanges');return;}
    state.textContent=t('github.review');review();
   }catch(error){report(error);}finally{setBusy(false);}
  });
  const disconnect=button('github.disconnect',()=>{if(busy)return;client=null;identity=null;token.value='';plan=null;body.replaceChildren();clearError();state.textContent=t('github.disconnected');});
  m.body.append(el('div',{class:'row'},connect,disconnect),body);
  mode.disabled=Boolean(submission.commit&&!submission.pr);state.textContent=t('github.ready');
  function review(){
   const branch=el('input',{value:submission.options?.branch||(mode.value==='initial'?'genesis':settings.prefix+'new-entries')}),title=el('input',{value:submission.options?.title||(mode.value==='initial'?'Initialize clean Genesis v0.0.0':'Update collection: '+plan.changes.length+' files')}),author=el('input',{value:settings.authorName||identity.name});
   const email=el('select',{},[...new Set([settings.authorEmail,...identity.emails].filter(Boolean))].map(v=>el('option',{value:v},v))),draft=el('input',{type:'checkbox',checked:settings.draft}),description=el('textarea',{rows:12}),preview=el('p',{class:'badge'}),confirmation=el('div',{class:'panel stack',hidden:true}),result=el('div',{role:'status'});
   const inputs=[branch,title,author,email,draft,description];let approved=null;
   description.value='## Changes\n\n'+plan.changes.map(x=>'- '+x.action+': `'+x.path+'`').join('\n')+'\n\n## Publication\n\nPublic collection export from The Watchers v0.0.0. Private data and vault backups are excluded.\n\n## Validation\n\nSnapshot and media integrity validated locally. Repository CI must pass before merge.\n'+(settings.bodyTemplate?'\n'+settings.bodyTemplate:'');
   if(mode.value==='initial')description.value='## Initial installation\n\nInstall The Watchers Genesis v0.0.0 with an empty collection. Browser drafts are excluded. Preserve the existing LICENSE and unrelated repository files.\n\n## Files\n\n'+plan.changes.map(x=>'- '+x.action+': `'+x.path+'`').join('\n')+'\n\n## After merge\n\nSet Settings → Pages → Source to GitHub Actions. Wait for the main deployment and reload. Merge remains manual.\n';
   branch.addEventListener('blur',()=>{if(!branch.readOnly)branch.value=branchName(branch.value);preview.textContent=branch.value+' → '+plan.base;});
   preview.textContent=branch.value+' → '+plan.base;
   if(submission.options){description.value=submission.options.body;author.value=submission.options.author.name;email.value=submission.options.author.email;branch.readOnly=true;}
   function unlock(){if(busy)return;for(const input of inputs)input.disabled=false;send.disabled=false;confirmation.hidden=true;approved=null;}
   const send=button('github.confirm',()=>{
    if(busy)return;clearError();
    try{
     branch.value=branchName(branch.value);validateBranch(branch.value);
     if(branch.value===plan.base)throw Error('Choose a new branch, different from the destination.');
     if(!title.value.trim()||!author.value.trim()||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))throw Error('Enter a title, author name and valid email.');
     approved={branch:branch.value,title:title.value.trim(),body:description.value,author:{name:author.value.trim(),email:email.value},draft:draft.checked};
     for(const input of inputs)input.disabled=true;send.disabled=true;
     confirmation.replaceChildren(el('p',{},t('github.confirmPrompt',{branch:approved.branch,base:plan.base})),confirmSend,button('github.back',unlock));confirmation.hidden=false;
     state.textContent=t('github.awaitingConfirmation');confirmation.scrollIntoView?.({block:'nearest'});confirmSend.focus();
    }catch(error){report(error);}
   },true);
   const confirmSend=button('github.confirmSend',async()=>{
    if(busy||!approved)return;setBusy(true);confirmSend.disabled=true;clearError();state.textContent=t('github.sending');
    // Reserve a tab within the click event; always retain a clickable result link.
    let tab=null;try{tab=window.open('about:blank','_blank');if(tab){tab.opener=null;tab.document.title='The Watchers — GitHub';tab.document.body.textContent=t('github.sending');}}catch{try{tab?.close();}catch{}tab=null;}
    try{
     client.onUploadProgress=({completed,total,path})=>{state.textContent='Uploading file '+(completed+1)+' of '+total+': '+path;};
     const pr=await client.submit(plan,approved,submission),url=new URL(pr.html_url);
     if(url.origin!=='https://github.com')throw Error('Unexpected PR URL.');
     result.replaceChildren(el('a',{href:url.href,target:'_blank',rel:'noopener noreferrer'},t('github.openPR')));
     confirmation.hidden=true;state.textContent=t('github.sent');
     if(tab){try{tab.location.replace(url.href);}catch{try{tab.close();}catch{}}}
     result.scrollIntoView?.({block:'nearest'});
    }catch(error){try{tab?.close();}catch{}setBusy(false);unlock();if(submission.options){branch.value=submission.options.branch;branch.readOnly=true;}report(error);}
    finally{client.onUploadProgress=null;setBusy(false);confirmSend.disabled=false;}
   },true);
   body.replaceChildren(el('ul',{class:'change-list'},plan.changes.map(x=>el('li',{},x.action+' · '+x.path))),field('github.branch',branch),preview,field('github.author',author),field('github.email',email),field('github.title',title),field('github.description',description),el('label',{class:'check-row'},draft,t('github.draft')),send,confirmation,result);
  }
 }
 return {submitGitHub};
}
