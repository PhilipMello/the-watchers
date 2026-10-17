import {docsPage} from './docs.mjs';
import {Kernel,CORE_VERSION,validateManifest,localPath} from './kernel.mjs';
import {validateSettings,withEnabled} from './config.mjs';
import {checkUpdates} from './updates.mjs';
import {createI18n} from './i18n.mjs';
const root=new URL('../',import.meta.url),app=document.querySelector('#app');
const el=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(v!==false&&v!==undefined)n.setAttribute(k,String(v));}for(const c of children.flat(Infinity))if(c!=null)n.append(c instanceof Node?c:document.createTextNode(String(c)));return n;};
const fetchJSON=async path=>{const response=await fetch(new URL(path,root),{cache:'no-store'});if(!response.ok)throw Error(path+': HTTP '+response.status);return response.json();};
const button=(text,fn)=>el('button',{type:'button',onclick:()=>Promise.resolve().then(fn).catch(report)},text);
let config,manifests,settings,kernel,collection,storage=null,saveError=false,catalog,t=(k,p={})=>collection?collection.translation(k,p):(catalog?.messages[k]||k).replace(/\{(\w+)\}/g,(m,k)=>p[k]??m);
const storageKey='watchers.kernel:'+root.pathname;
const report=error=>{const panel=document.querySelector('#kernel-status');panel.textContent=String(error.message||error);panel.hidden=false;panel.focus();};
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=el('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function save(next){if(saveError)throw Error(t('kernel.recovery'));next=validateSettings(next,manifests);if(!storage)throw Error(t('kernel.storageUnavailable'));const raw=storage.getItem(storageKey);if(raw!==savedRaw)throw Error(t('kernel.storageConflict'));const encoded=JSON.stringify(next);storage.setItem(storageKey,encoded);savedRaw=encoded;settings=next;}
let savedRaw=null;
async function selectTheme(id){
 const theme=manifests.find(m=>m.id===id&&m.type==='theme'),links=[];
 try{if(theme)for(const style of theme.styles){const link=el('link',{rel:'stylesheet',href:new URL(theme.directory+'/'+style+new URL(import.meta.url).search,root).href,'data-extension-theme':id});let timeout;const ready=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error(t('kernel.themeFailure')));timeout=setTimeout(()=>reject(Error(t('kernel.themeFailure'))),10000);}).finally(()=>clearTimeout(timeout));document.head.append(link);links.push(link);await ready;}}
 catch(error){links.forEach(x=>x.remove());throw error;}
 kernel.selectedTheme=theme||null;
 document.querySelectorAll('link[data-extension-theme]').forEach(link=>{if(!links.includes(link))link.remove();});
}
function chrome(){
 const bar=el('nav',{class:'kernel-bar','aria-label':t('kernel.navigation')},el('strong',{},'The Watchers'),el('span',{class:'badge'},'Core '+CORE_VERSION),el('a',{href:'#catalog'},t('kernel.collection')),el('a',{href:'#extensions'},t('kernel.plugins')),el('a',{href:'#themes'},t('kernel.themes')),el('a',{href:'#docs'},'Docs'));
 document.body.prepend(bar,el('div',{id:'kernel-status',class:'notice error',role:'alert',tabindex:'-1',hidden:true}));
}
function diagnostics(main){const failures=[...kernel.states].filter(([,s])=>['failed','blocked'].includes(s.status));if(failures.length)main.append(el('section',{class:'panel error'},el('h2',{},t('kernel.diagnostics')),failures.map(([id,s])=>el('p',{},id+': '+s.error))));}
async function render(){
 const route=location.hash.slice(1).split('/')[0];
 if(route!=='extensions'&&route!=='themes'&&route!=='docs'&&collection){app.hidden=false;document.querySelector('#boot-error').hidden=true;await collection.render();return;}
 const main=el('main',{id:'main',tabindex:'-1',class:'stack'});app.hidden=false;app.replaceChildren(main);document.querySelector('#boot-error').hidden=true;
 if(route==='docs'){main.append(docsPage(el));return;}
 if(route==='themes'){
  main.append(el('h1',{},t('kernel.themes')),el('p',{class:'muted'},t('kernel.themeHelp')));
  const options=[{id:null,name:t('kernel.builtinTheme'),description:t('kernel.builtinHelp')},...manifests.filter(m=>m.type==='theme')];
  for(const m of options)main.append(el('article',{class:'panel'},el('h2',{},m.name),el('p',{},m.description||''),button(settings.theme===m.id?t('kernel.selected'):t('kernel.useTheme'),async()=>{save({...settings,theme:m.id});await selectTheme(m.id);await render();})));
  return;
 }
 main.append(el('div',{class:'toolbar'},el('div',{},el('p',{class:'eyebrow'},'Extension Kernel'),el('h1',{},t('kernel.plugins'))),el('p',{class:'intro'},t('kernel.pluginHelp'))));
 diagnostics(main);
 const reload=()=>location.reload();
 const commitSettings=next=>{save(next);reload();};
 main.append(el('div',{class:'row'},button(t('kernel.disableAll'),()=>{if(confirm(t('kernel.disableAllConfirm')))commitSettings({...settings,enabled:[]});}),button(t('kernel.restoreBundle'),()=>commitSettings({...settings,enabled:config.extensions.filter(x=>x.enabled).map(x=>manifests.find(m=>m.manifest_path===x.manifest)?.id).filter(Boolean)})),button(t('kernel.exportConfig'),()=>download({...config,theme:settings.theme,updates:settings.updates,extensions:config.extensions.map(x=>({...x,enabled:settings.enabled.includes(manifests.find(m=>m.manifest_path===x.manifest)?.id)}))},'extensions.json'))));
 const grid=el('div',{class:'workspace-grid'});
 for(const m of manifests.filter(m=>m.type==='plugin')){
  const active=settings.enabled.includes(m.id),state=kernel.states.get(m.id);
  grid.append(el('article',{class:'panel stack'},el('div',{class:'toolbar'},el('h2',{},m.name),el('span',{class:'badge'},m.version)),el('p',{},m.description||''),el('p',{class:'muted'},t('kernel.state')+': '+t('kernel.'+(state?.status||'disabled'))),el('details',{},el('summary',{},t('kernel.details')),el('p',{},m.id),el('p',{},t('kernel.requires')+': '+(Object.keys(m.dependencies).join(', ')||t('kernel.none'))),el('p',{},t('kernel.permissions')+': '+(m.permissions.join(', ')||t('kernel.none')))),kernel.get('plugin.settings',m.id)&&collection?button(t('kernel.settings'),()=>collection.openPluginSettings(m.id)):null,button(t(active?'kernel.disable':'kernel.enable'),()=>commitSettings(withEnabled(settings,m.id,!active,manifests)))));
 }
 main.append(grid);
 for(const panel of kernel.values('shell.panels')){try{main.append(panel({document}));}catch(error){report(error);}}
 const form=el('form',{class:'panel stack'}),inputs={};form.append(el('h2',{},t('kernel.updates')),el('p',{class:'muted'},t('kernel.updateHelp')));
 for(const key of ['core_registry_url','plugin_registry_url','theme_registry_url']){inputs[key]=el('input',{type:'url',value:settings.updates[key],placeholder:'https://example.com/registry.json'});form.append(el('label',{},t('kernel.'+key),inputs[key]));}
 const overrides=el('details',{},el('summary',{},t('kernel.perExtension'))),overrideInputs={};
 for(const m of manifests){overrideInputs[m.id]=el('input',{type:'url',value:settings.updates.overrides[m.id]||m.update_url||'',placeholder:'https://example.com/registry.json'});overrides.append(el('label',{},m.name,overrideInputs[m.id]));}form.append(overrides,el('button',{type:'submit',class:'primary'},t('kernel.saveURLs')));
 const collect=()=>({...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value.trim()])),overrides:Object.fromEntries(Object.entries(overrideInputs).filter(([,v])=>v.value.trim()).map(([k,v])=>[k,v.value.trim()]))});
 form.addEventListener('submit',e=>{e.preventDefault();try{save({...settings,updates:collect()});report(t('kernel.saved'));}catch(error){report(error);}});
 const results=el('div',{role:'status','aria-live':'polite',class:'stack'});
 form.append(button(t('kernel.checkUpdates'),async()=>{
  const updates=collect();validateSettings({...settings,updates},manifests);
  results.replaceChildren(el('p',{},t('kernel.checking')));
  const installed=[{id:'watchers.core',type:'core',version:CORE_VERSION},...manifests];
  const sources=new Map();const add=(url,targets)=>{if(url)sources.set(url,[...(sources.get(url)||[]),...targets]);};
  add(updates.core_registry_url,installed.filter(m=>m.type==='core'));
  for(const type of ['plugin','theme'])add(updates[type+'_registry_url'],installed.filter(m=>m.type===type&&!updates.overrides[m.id]&&!m.update_url));
  for(const m of manifests)add(updates.overrides[m.id]||m.update_url,[m]);
  if(!sources.size){results.replaceChildren(el('p',{},t('kernel.noURL')));return;}
  results.replaceChildren();for(const [url,targets]of sources){try{const found=await checkUpdates(url,targets);results.append(el('p',{},url+' — '+t(found.length?'kernel.available':'kernel.current')));for(const item of found)results.append(el('section',{class:'panel'},el('strong',{},item.id+' '+item.version),el('p',{},t(item.compatible?'kernel.compatible':'kernel.incompatible')),el('p',{},'SHA-256: '+item.sha256),el('a',{href:item.package_url,target:'_blank',rel:'noopener noreferrer'},t('kernel.download'))));}catch(error){results.append(el('p',{class:'error'},url+': '+error.message));}}
 }));main.append(form,results);
 main.append(el('details',{class:'panel'},el('summary',{},t('kernel.install')),el('p',{},t('kernel.installHelp')),el('code',{},'npm run extensions -- install ./path/to/plugin-folder'),el('p',{},t('kernel.trustHelp'))));
}
try{
 catalog=await fetchJSON('core/lang/en-US.json');
 config=await fetchJSON('config/extensions.json');
 if(config.format_version!=='1.0.0'||config.api_version!=='1.0.0'||!Array.isArray(config.extensions))throw Error('Unsupported extension configuration');
 manifests=[];for(const entry of config.extensions){if(!localPath(entry.manifest)||typeof entry.enabled!=='boolean')throw Error('Invalid manifest path');const m=validateManifest(await fetchJSON(entry.manifest));manifests.push({...m,manifest_path:entry.manifest,directory:entry.manifest.slice(0,entry.manifest.lastIndexOf('/'))});}
 const defaults={format_version:'1.0.0',enabled:config.extensions.filter(x=>x.enabled).map(x=>manifests.find(m=>m.manifest_path===x.manifest).id),theme:config.theme,updates:config.updates};
 settings=validateSettings(defaults,manifests);
 try{storage=localStorage;savedRaw=storage.getItem(storageKey);if(savedRaw)settings=validateSettings(JSON.parse(savedRaw),manifests);}catch(error){saveError=error;}
 kernel=new Kernel({storage,prefix:storageKey+':'});await kernel.boot(manifests,settings.enabled,root.href);
 chrome();if(saveError){report(t('kernel.recovery')+' '+saveError.message);const status=document.querySelector('#kernel-status');status.append(button(t('kernel.exportRecovery'),()=>download({raw:savedRaw},'extensions-recovery.json')),button(t('kernel.resetPreferences'),()=>{if(confirm(t('kernel.resetConfirm'))){storage.removeItem(storageKey);location.reload();}}));}
 try{await selectTheme(settings.theme);}catch(error){report(error);}
 const start=kernel.get('applications','collection');if(start){try{collection=await start(kernel);}catch(error){report(error);}}
 window.addEventListener('watchers-locale',()=>{document.querySelector('.kernel-bar')?.remove();document.querySelector('#kernel-status')?.remove();chrome();});
 await render();window.addEventListener('hashchange',()=>render().catch(report));
}catch(error){console.error(error);app.hidden=false;app.replaceChildren(el('main',{id:'main'},el('h1',{},'The Watchers'),el('p',{role:'alert'},String(error.message||error)),el('p',{},'Serve the dist directory over localhost or HTTPS.')));}

finally{document.querySelector('#boot-loading')?.remove();document.body.setAttribute('aria-busy','false');window.dispatchEvent(new Event('watchers-ready'));}
