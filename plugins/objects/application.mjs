import {searchCatalog} from './search.mjs';
import {filterPanel} from './search-ui.mjs';
import {flagNode} from '../language-editor/metadata.mjs';
import {formatNumber} from '../custom-fields/format.mjs';
import {entryPresentation} from './presentation.mjs';
import {publicSnapshot,containsPrivate,versionFeatures} from '../collection-snapshot/protection.mjs';
import {validateAssets,collectAssets} from '../media/assets.mjs';
import {exportPackage} from '../collection-snapshot/publication.mjs';
import {unbase64} from '../privacy-vault/crypto.mjs';
import {Repository} from '../collection-snapshot/repository.mjs';
import {showBootFailure} from '../../assets/js/boot.mjs';

import {LocalWorkspace,preferences,upgradeCatalogs} from '../collection-snapshot/workspace.mjs';
import {createI18n} from '../../core/i18n.mjs';
import {DomainError,fail,localized,displayName,validateSnapshot,withObject,safeURL} from '../collection-snapshot/domain.mjs';
export async function startCollection(kernel){
const unsavedForms=new Set();
const catalogState={query:"",type:"",category:"",filters:[]};
const app=document.querySelector('#app');
let context;let repo,i18n,ui,snapshot=null,dirty=false,renderToken=0,workspaceConfig,themeConfig;
const vault=kernel.get('services','vault');let mediaAssets={},blobURLs=new Map();
let local,prefs=preferences(),languageDrafts={},storageFailed=false,recovery=null,initialStorageError=false,persistAttempted=false;
function safeLanguageDrafts(){if(!snapshot)return languageDrafts;const allowed=publicSnapshot(snapshot).languages['en-US'].messages;return Object.fromEntries(Object.entries(languageDrafts).map(([locale,lang])=>[locale,{...lang,messages:Object.fromEntries(Object.entries(lang.messages).filter(([key])=>Object.hasOwn(allowed,key)))}]));}
async function persist(){
  persistAttempted=true;
  try{if(recovery||initialStorageError)throw Error('Resolve the existing local draft first.');if(vault?.unlocked)await vault.save({snapshot:snapshot||await repo.snapshot(),assets:mediaAssets,languageDrafts,baseRevision:repo.manifest.revision});
    local.save({baseRevision:repo.manifest.revision,snapshot:dirty?publicSnapshot(snapshot):null,preferences:prefs,languageDrafts:safeLanguageDrafts(),locale:i18n.locale});storageFailed=false;return true;}
  catch(error){storageFailed=true;console.error(error);return false;}
}
function recoveryPanel(main){
  if(!recovery&&!initialStorageError)return;
  main.append(el('section',{class:'panel stack'},el('h2',{},t('workspace.recovery')),el('p',{},t('workspace.recoveryHelp')),button('workspace.downloadRecovery',()=>download(recovery||{raw:local?.last},'watchers-local-recovery.json')),recovery?.snapshot?button('workspace.restoreRecovery',async()=>{const restored=upgradeCatalogs(recovery.snapshot,repo.languages['en-US']);if(!confirm(t('workspace.restoreConfirm')))return;prefs=preferences(recovery.preferences);languageDrafts=recovery.languageDrafts;recovery=null;initialStorageError=false;await commit(restored);await render();}):null,button('workspace.clearRecovery',async()=>{if(!confirm(t('workspace.clearConfirm')))return;try{local.clear();recovery=null;initialStorageError=false;persist();await render();}catch(error){errors(error);}})));
}
const t=(k,p)=>i18n.t(k,p);
const el=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k==='class')n.className=v;else if(v!==undefined&&v!==false)n.setAttribute(k,v===true?'':String(v));}for(const c of children.flat(Infinity))if(c!==null&&c!==undefined)n.append(c instanceof Node?c:document.createTextNode(String(c)));return n;};
const button=(key,fn,primary=false)=>el('button',{type:'button',class:primary?'primary':'',onclick:()=>run(fn)},t(key));
const link=(text,href)=>el('a',{href},text);
const field=(key,node)=>el('label',{},el('span',{},t(key)),node);
const types=()=>snapshot?.types||repo.types;
const typeName=id=>{const def=types().types.find(x=>x.id===id);return def?t(def.label_key):id;};
const rows=()=>snapshot?snapshot.objects.map(o=>({id:o.id,type:o.type,visibility:o.visibility||'public',name:displayName(o),field_count:o.fields.length,search:o.fields.filter(f=>!['hidden','masked'].includes(f.presentation)).map(f=>JSON.stringify(f.value)).join(' ').toLocaleLowerCase('en-US'),...entryPresentation(o,snapshot.relationships)})):repo.index.objects;
const name=id=>rows().find(x=>x.id===id)?.name||id;
const getObject=id=>snapshot?snapshot.objects.find(o=>o.id===id):repo.object(id);
async function ensureSnapshot(){if(!snapshot)snapshot=structuredClone(await repo.snapshot());return snapshot;}
function errors(error,target=document.querySelector('#status')) {
  if(!target)throw error;
  if(!(error instanceof DomainError)&&!(error instanceof SyntaxError)){target.className='notice error';target.textContent=String(error.message||error);target.focus();return;}
  const issues=error instanceof DomainError?error.issues:[{code:error instanceof SyntaxError?'json':'unknown',path:''}];
  target.className='notice error';target.replaceChildren(el('strong',{},t('status.error')),el('ul',{},issues.slice(0,12).map(e=>el('li',{},t('error.'+e.code,{path:e.path,...e.params})))));target.focus();
}
async function run(fn){try{await fn();}catch(e){errors(e);}}
function announce(key){const status=document.querySelector('#status');status.className='notice';status.textContent=t(key);}
async function commit(next){
 if(vault?.envelope&&!vault.unlocked)throw Error('Unlock your vault before editing this workspace.');
 if(vault?.unlocked)vault.onActivity?.();
 const candidate=validateSnapshot(versionFeatures(kernel.filterSync('collection.beforeValidate',structuredClone(next))));
 if(containsPrivate(candidate)&&!vault?.unlocked)throw Error('Create or unlock the vault in Plugins → Privacy & Vault before saving private data. You can also explicitly mark the entry and its fields Public.');
 snapshot=candidate;dirty=true;i18n=createI18n(snapshot.languages,i18n.locale);document.documentElement.lang=i18n.locale;
 if(!await persist())throw Error('The changes remain in memory, but local saving failed. Keep this tab open and export a backup.');
 await kernel.emit('collection.afterSave',structuredClone(snapshot));
}
function mediaSrc(src){if(!mediaAssets[src])return src;if(!blobURLs.has(src)){const a=mediaAssets[src];blobURLs.set(src,URL.createObjectURL(new Blob([unbase64(a.data)],{type:a.type})));}return blobURLs.get(src);}
async function lockVault(){
 if(!vault?.unlocked)return;
 if(unsavedForms.size)throw Error('Save or close open editors before locking the vault.');
 await vault.queue;if(storageFailed)throw Error('Save or back up the current changes before locking.');for(const dialog of document.querySelectorAll('dialog'))dialog.close();vault.lock();mediaAssets={};for(const url of blobURLs.values())URL.revokeObjectURL(url);blobURLs.clear();
 languageDrafts=safeLanguageDrafts();if(snapshot)snapshot=publicSnapshot(snapshot);const [route,id]=location.hash.slice(1).split('/');if(route==='object'&&!snapshot?.objects.some(o=>o.id===id))location.hash='#catalog';await render();
}

function download(value,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=el('a',{href:url,download:filename});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function modal(title){
  const previous=document.activeElement,dialog=el('dialog',{class:'modal'}),body=el('div',{class:'stack'}),error=el('div',{role:'alert',tabindex:'-1'});
  let edited=false;const titleId='dialog-'+crypto.randomUUID();dialog.setAttribute('aria-labelledby',titleId);
  const close=()=>{if(!edited||confirm(t('editor.discard')))dialog.close();};
  dialog.append(el('div',{class:'toolbar'},el('h2',{id:titleId},t(title)),button('action.cancel',close)),error,body);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{unsavedForms.delete(dialog);dialog.remove();previous?.focus();});document.body.append(dialog);dialog.showModal();
  return {dialog,body,error,close,markDirty:()=>{edited=true;unsavedForms.add(dialog);},markClean:()=>{edited=false;unsavedForms.delete(dialog);},finish:()=>{edited=false;unsavedForms.delete(dialog);dialog.close();}};
}
function jsonEditor(title,description,value,onSave){
  const m=modal(title),area=el('textarea',{class:'code',spellcheck:'false','aria-label':t(title)});area.value=JSON.stringify(value,null,2);area.addEventListener('input',()=>m.markDirty());
  m.body.append(el('p',{class:'muted'},t(description)),area,el('div',{class:'modal-actions row'},button('action.apply',async()=>{try{await onSave(JSON.parse(area.value));m.finish();await render();announce('workspace.saved');}catch(e){errors(e,m.error);}},true)));
}
async function render(){
  ui?.applyCustomCSS?.();
  const token=++renderToken,[route,id]=location.hash.slice(1).split('/');
  const main=el('main',{id:'main',tabindex:'-1'}),status=el('div',{id:'status',class:'status',role:'status','aria-live':'polite',tabindex:'-1'});
  const nav=el('nav',{class:'nav','aria-label':t('nav.catalog')},['catalog',...(kernel.active('watchers.workspace')?['workspace']:[])].map(key=>el('a',{href:'#'+key,'aria-current':(route||'catalog')===key?'page':undefined},t('nav.'+key))));
  const localeSelect=el('select',{'aria-label':t('language.select')},Object.keys(snapshot?.languages||repo.languages).map(locale=>el('option',{value:locale},(snapshot?.languages||repo.languages)[locale].display_name||locale)));localeSelect.value=i18n.locale;
  localeSelect.addEventListener('change',()=>run(async()=>{i18n=createI18n(snapshot?.languages||repo.languages,localeSelect.value);document.documentElement.lang=i18n.locale;persist();await render();window.dispatchEvent(new Event('watchers-locale'));}));
  const catalogs=snapshot?.languages||repo.languages,languageMenu=el('details',{class:'language-menu'},el('summary',{class:'row','aria-label':t('language.select')},flagNode(context,catalogs[i18n.locale]),catalogs[i18n.locale].display_name||i18n.locale),el('div',{class:'language-options'},Object.entries(catalogs).map(([locale,catalog])=>el('button',{type:'button',class:'row',onclick:()=>run(async()=>{i18n=createI18n(catalogs,locale);document.documentElement.lang=locale;await persist();await render();window.dispatchEvent(new Event('watchers-locale'));})},flagNode(context,catalog),catalog.display_name||locale))));
  app.replaceChildren(...[el('header' ,{class:'header'},el('a',{class:'brand',href:'#catalog'},el('span',{class:'brand-mark','aria-hidden':'true'},'W'),t('app.title')),el('span',{class:'badge'},t('app.release')),nav,languageMenu),status,vault?.envelope?el('aside',{class:'save-state row'},el('span',{},t(vault.unlocked?'vault.unlocked':'vault.locked')),ui.vaultPanel?button(vault.unlocked?'vault.title':'vault.unlock',ui.vaultPanel):null):null,(storageFailed||recovery||initialStorageError)?el('aside',{class:'notice error',role:'status'},t(recovery||initialStorageError?'workspace.recoveryNotice':'workspace.storageFailed'),el('a',{href:'#settings'},t('nav.settings'))):dirty?el('aside',{class:'save-state',role:'status'},savedNotice()):null,main,el('footer',{class:'footer'},el('span',{},t('footer.note')),el('span',{},t('footer.version')))].filter(x=>x!=null));
  if(route==='object') {const o=await getObject(id);if(token!==renderToken)return;if(!o)fail('notFound');await detail(main,o);}
  else if(route==='workspace'&&ui.workspace)await ui.workspace(main);
  else if(route==='settings'&&ui.settings)await ui.settings(main);
  else if(route==='architecture'&&ui.architecture)ui.architecture(main);
  else if(route==='sources'&&ui.sourcePage)await ui.sourcePage(main);
  else if(route==='relationships'&&ui.relationshipPage)await ui.relationshipPage(main);
  else if(route&&route!=='catalog'){main.append(el('h1',{},t('extension.unavailable')));}else await catalog(main,token);
}
function catalogDesign(){return (snapshot||repo.meta)?.extensions?.settings?.['watchers.objects']?.cardDesign||'frosted';}
function savedNotice(){
 const text=t('workspace.deviceSaved'),parts=text.split(/\bPR\b/),progress=kernel.get('github.progress','current')?.read();
 const url=progress?.pr?.html_url,valid=typeof url==='string'&&/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(url);
 const a=el('a',{href:valid?url:ui.submitGitHub?'#settings/plugin/watchers.github':'#docs',...(valid?{target:'_blank',rel:'noopener noreferrer'}:{}),title:valid?'Open the last created PR. New edits may not be included.':'Review local changes and create a PR','aria-label':valid?'Open pull request on GitHub':'Review and submit a pull request'},'PR');
 if(!valid&&ui.submitGitHub)a.addEventListener('click',event=>{event.preventDefault();run(ui.submitGitHub);});
 return el('span',{},parts[0],a,parts.slice(1).join('PR'));
}
async function catalog(main,token){
 const source=await ensureSnapshot();if(token!==renderToken)return;
 const engine=searchCatalog(source),entries=new Map(source.objects.map(o=>[o.id,o]));
 const search=el('input',{type:'search',class:'search',placeholder:'Search names, badges, categories, locations, or field values…','aria-label':t('catalog.search')}),filter=el('select',{'aria-label':t('editor.type')},el('option',{value:''},t('catalog.all')),types().types.map(x=>el('option',{value:x.id},t(x.label_key))));
 search.value=catalogState.query;filter.value=catalogState.type;
  const design=catalogDesign(),designSelect=el('select',{'aria-label':t('catalog.cardDesign')},el('option',{value:'classic'},t('catalog.classic')),el('option',{value:'frosted'},t('catalog.frosted')));designSelect.value=design;
  designSelect.addEventListener('change',()=>run(async()=>{designSelect.disabled=true;try{const next=structuredClone(await ensureSnapshot());next.extensions??={format_version:'1.0.0'};next.extensions.settings??={};next.extensions.settings['watchers.objects']={...next.extensions.settings['watchers.objects'],cardDesign:designSelect.value};await commit(next);await render();}catch(error){designSelect.value=catalogDesign();throw error;}finally{designSelect.disabled=false;}}));
  const categoryFilter=ui.categoryFilter?.(()=>{catalogState.category=categoryFilter.node.value;paint();});
  if(categoryFilter)categoryFilter.node.value=catalogState.category;
  const advanced=filterPanel(context,engine,catalogState,()=>paint());
  const cards=el('div',{class:'cards','data-card-design':design}),count=el('span',{class:'muted small'}),profiles=el('div',{class:'profile-rail'});
  const initials=r=>r.name.split(/\s/).slice(0,2).map(s=>s[0]).join('');
  const portrait=r=>[ui.coverNode&&r.cover?ui.coverNode(r.cover):null,el('span',{class:'monogram'},initials(r))];
  const paint=()=>{
    const q=search.value,list=rows().filter(r=>(!filter.value||r.type===filter.value)&&(!categoryFilter||categoryFilter.matches(r))&&engine.search(entries.get(r.id),q)&&engine.matches(entries.get(r.id),catalogState.filters)).sort((a,b)=>i18n.compare(a.name,b.name));
    count.textContent=i18n.count('catalog.count',list.length);
    cards.replaceChildren(...list.map(r=>el('a',{class:'card',href:'#object/'+r.id,'aria-label':r.name},
      el('div',{class:'card-art','aria-hidden':'true'},portrait(r)),el('div',{class:'card-frost','aria-hidden':'true'}),r.visibility==='private'?el('span',{class:'badge card-private'},'Private'):null,
      el('div',{class:'card-body'},
        el('span',{class:'sr-only'},typeName(r.type)),
        el('div',{class:'card-title'},el('h3',{},r.name),ui.badgesFor?ui.badgesFor(r,'catalog'):null),
        el('p',{class:'card-description'},r.description||t('catalog.noDescription')),ui.categoriesFor?.(r,'catalog'),
        el('div',{class:'card-foot'},el('span',{class:'card-stat',title:t('catalog.connections',{count:r.connection_count||0}),'aria-label':t('catalog.connections',{count:r.connection_count||0})},el('span',{class:'stat-icon stat-person','aria-hidden':'true'}),String(r.connection_count||0)),el('span',{class:'card-stat',title:i18n.count('catalog.fieldCount',r.field_count),'aria-label':i18n.count('catalog.fieldCount',r.field_count)},el('span',{class:'stat-icon stat-fields','aria-hidden':'true'}),String(r.field_count)),el('span',{class:'card-open'},t('catalog.openProfile'),el('span',{'aria-hidden':'true'},'+')))))));
    profiles.replaceChildren(...list.map(r=>el('a',{class:'profile-chip',href:'#object/'+r.id},el('span',{class:'circle','aria-hidden':'true'},portrait(r)),el('span',{},r.name))));
    if(!list.length)cards.append(el('p',{class:'notice'},t(source.objects.length?'catalog.empty':'catalog.startEmpty')));
  };
  search.addEventListener('input',()=>{catalogState.query=search.value;paint();});filter.addEventListener('change',()=>{catalogState.type=filter.value;paint();});
  main.append(el('section',{class:'hero'},el('p',{class:'eyebrow'},t('catalog.eyebrow')),el('h1',{},t('app.tagline')),el('p',{class:'intro'},t('app.intro')),el('div',{class:'search-bar'},search,advanced.node),advanced.chips,el('span',{class:'badge dot'},t((snapshot||repo.meta)?.dataset_mode==='public'?'status.public':'status.demo'))),el('div',{class:'toolbar'},el('div',{class:'row'},filter,categoryFilter?field('categories.title',categoryFilter.node):el('a',{href:'#extensions'},'Enable Categories in Plugins'),count),el('div',{class:'row'},field('catalog.cardDesign',designSelect),ui.editObject?button('action.new',()=>editObject(),true):null)),cards,el('div',{class:'section-title'},el('h2',{},t('catalog.profiles'))),profiles);paint();
}
function valueNode(f){
  if(f.presentation==='masked')return '••••••';
  const widget=kernel.get('field.widgets',f.value_type);if(widget)return widget.render(context,f);
  if(['image','gallery'].includes(f.value_type))return t('extension.unavailable');
  if(f.value_type==='reference')return link(name(f.value),'#object/'+f.value);
  if(f.value_type==='reference-list')return el('div',{class:'stack'},f.value.map(id=>link(name(id),'#object/'+id)));
  if(f.value_type==='boolean')return t('boolean.'+f.value);
  if(f.value_type==='date')return i18n.date(f.value);
  if(typeof f.value==='number')return formatNumber(f,i18n.locale,(snapshot?.definitions||repo.definitions).fields.find(d=>d.id===f.definition_id));
  return Array.isArray(f.value)?f.value.join(', '):f.value;
}
async function detail(main,o){
  main.append(link(t('nav.home'),'#catalog'),el('div',{class:'toolbar'},el('div',{},el('p',{class:'eyebrow'},typeName(o.type)),el('h1',{},displayName(o)),o.visibility==='private'?el('span',{class:'badge'},'Private'):null),el('div',{class:'row'},ui.editObject?button('action.edit',()=>editObject(o)):null,button('action.download',async()=>{const safe=publicSnapshot(await ensureSnapshot()).objects.find(x=>x.id===o.id);if(!safe)throw Error('This entry is private. Use an encrypted vault backup.');download(safe,o.id+'.json');},true))),el('p',{class:'muted small'},t('detail.updated')+' '+i18n.date(o.updated_at)+' · '+t('detail.id')+' '+o.id),el('h2',{},t('detail.fields')),
    o.fields.filter(f=>f.presentation!=='hidden').length?el('dl',{class:'field-grid'},o.fields.filter(f=>f.presentation!=='hidden').map(f=>el('div',{class:'field-value'},el('dt',{},localized(f.label,i18n.locale)),el('dd',{},valueNode(f),f.observed_on?el('p',{class:'muted small'},t('detail.observed',{date:i18n.date(f.observed_on)})):null)))):el('p',{class:'muted'},t('detail.empty')));
  if(ui.badgesFor)main.append(ui.badgesFor(o,'detail'));
  if(ui.categoriesFor)main.append(ui.categoriesFor(o,'detail'));
  const meta=snapshot||await repo.metadata();
  const relatedRows=meta.relationships.filter(r=>r.from_id===o.id||r.to_id===o.id),notes=meta.notes.filter(n=>n.entity_id===o.id);
  main.append(...[ui.connectionList?el('section',{class:'panel'},el('h2',{},t('detail.connections')),ui.connectionList(relatedRows)):null,el('section',{class:'panel'},el('h2',{},t('detail.notes')),notes.length?notes.map(n=>el('article',{},el('h3',{},n.title),el('p',{},n.content),sourceList(meta.sources.filter(s=>(n.source_ids||[]).includes(s.id))))):el('p',{class:'muted'},t('detail.empty'))),kernel.active('watchers.sources')?el('section',{class:'panel'},el('h2',{},t('detail.sources')),sourceList(meta.sources.filter(s=>(o.source_ids||[]).includes(s.id)))):null].filter(x=>x!=null));
  if(kernel.active('watchers.collection-snapshot'))main.append(el('details',{},el('summary',{},t('settings.advanced')),button('action.advanced',async()=>{const s=await ensureSnapshot();jsonEditor('action.advanced','editor.metadataHelp',o,async v=>{if(v.id!==o.id||v.created_at!==o.created_at)fail('invalid','object.identity');await commit(withObject(s,{...v,updated_at:new Date().toISOString()}));});})));
  if(o.legacy)main.append(el('p',{class:'muted small'},t('detail.legacy')));
}
function sourceList(list){return list.length?el('ul',{class:'clean'},list.map(s=>el('li',{},s.url&&safeURL(s.url)?el('a',{href:safeURL(s.url),target:'_blank',rel:'noopener noreferrer'},s.title):el('strong',{},s.title),el('p',{class:'muted'},s.description||'')))):el('p',{class:'muted'},t('detail.empty'));}
const editObject=(...args)=>ui.editObject(...args);
const onHash=()=>{if(!location.hash.startsWith('#extensions')&&!location.hash.startsWith('#themes')&&!location.hash.startsWith('#docs'))run(render);};
window.addEventListener('beforeunload',event=>{if((storageFailed&&persistAttempted)||unsavedForms.size){event.preventDefault();event.returnValue='';}});
try {
  repo=await new Repository().open();await repo.metadata();
  workspaceConfig=await repo.json('config/workspace.json');
  prefs=preferences(workspaceConfig.defaults);let savedLocale='en-US';
  try{
    local=new LocalWorkspace(localStorage,'watchers.workspace:'+new URL('.',location.href).pathname);const saved=local.load();
    if(saved){savedLocale=saved.locale||savedLocale;prefs=preferences(saved.preferences);languageDrafts=saved.languageDrafts;
      if(saved.snapshot&&saved.baseRevision!==repo.manifest.revision)recovery=saved;
      else if(saved.snapshot){snapshot=upgradeCatalogs(saved.snapshot,repo.languages['en-US']);dirty=true;}
    }
  }catch(error){console.error(error);initialStorageError=!!local?.last;storageFailed=true;}
  if(vault){try{await vault.load();}catch(e){console.warn('Vault unavailable:',e.message);}}
  i18n=createI18n(snapshot?.languages||repo.languages,savedLocale);document.documentElement.lang=i18n.locale;
  const actions={};context={actions,kernel,link,name,types,el,button,field,modal,t,run,errors,render,announce,download,ensureSnapshot,commit,jsonEditor,
    locale:()=>i18n.locale,date:value=>i18n.date(value),config:()=>({...workspaceConfig,sections:workspaceConfig.sections.filter(section=>kernel.active({'architecture':'watchers.architecture-viewer','sources':'watchers.sources','relationships':'watchers.relationships','languages':'watchers.language-editor'}[section.id]||'watchers.workspace'))}),theme:()=>kernel.selectedTheme||{version:'0.0.0'},appConfig:()=>repo.app,
    publicCatalog:catalog=>{const allowed=publicSnapshot(snapshot||{...repo.meta,objects:[],types:repo.types,definitions:repo.definitions,languages:repo.languages}).languages['en-US'].messages;return {...catalog,messages:Object.fromEntries(Object.entries(catalog.messages).filter(([key])=>Object.hasOwn(allowed,key)))};},baseCatalog:()=>repo.languages['en-US'],preferences:()=>prefs,setPreferences:value=>{prefs=preferences(value);return persist();},
    languageDrafts:()=>languageDrafts,saveLanguageDraft:(locale,value)=>{languageDrafts={...languageDrafts,[locale]:structuredClone(value)};return persist();},
    resetSnapshot:async()=>{if(vault?.envelope&&!vault.unlocked)throw Error('Unlock the vault first.');snapshot=null;dirty=false;i18n=createI18n(repo.languages,i18n.locale);document.documentElement.lang=i18n.locale;await persist();},recoveryPanel,
    vault,mediaSrc,currentSnapshot:()=>snapshot||repo.meta,projectSettings:id=>({...kernel.get('plugin.settings',id)?.defaults,...(snapshot||repo.meta)?.extensions?.settings?.[id]}),assets:()=>mediaAssets,baseRevision:()=>repo.manifest.revision,baseline:()=>repo.json('data/source-hashes.json'),initialProject:()=>repo.json('data/initial-project.json'),
    addAsset:async(path,asset)=>{if(!vault?.unlocked)throw Error('Create or unlock the vault before uploading images.');const next={...mediaAssets,[path]:asset};await validateAssets(next);await vault.save({snapshot:await ensureSnapshot(),assets:next,languageDrafts,baseRevision:repo.manifest.revision});mediaAssets=next;},
    unlockVault:async(password)=>{const p=await vault.unlock(password);try{validateSnapshot(p.snapshot);await validateAssets(p.assets||{});if(p.baseRevision!==repo.manifest.revision&&!confirm('This vault belongs to an older build. Restore it over the current collection?')){vault.lock();return false;}snapshot=upgradeCatalogs(p.snapshot,repo.languages['en-US']);mediaAssets=p.assets||{};languageDrafts=p.languageDrafts||languageDrafts;recovery=null;initialStorageError=false;dirty=true;i18n=createI18n(snapshot.languages,i18n.locale);if(!await persist())throw Error('Vault unlocked, but saving the workspace failed. Keep this tab open.');vault.onActivity?.();await render();return true;}catch(e){vault.lock();throw e;}},
    lockVault,exportPublic:async()=>download(await exportPackage(await ensureSnapshot(),repo.app,mediaAssets),'the-watchers-public-v0.0.0.json'),
    importPublic:async(value)=>{if(value.format!=='watchers-public-package'||value.version!==1)throw Error('Unsupported package.');const assets=await validateAssets(value.assets||{});if(Object.keys(assets).length&&!vault?.unlocked)throw Error('Unlock the vault before importing an image package.');validateSnapshot(value.snapshot);const old=mediaAssets;mediaAssets={...old,...assets};try{await collectAssets(value.snapshot,mediaAssets);await commit(upgradeCatalogs(value.snapshot,repo.languages['en-US']));}catch(e){mediaAssets=old;throw e;}}
  };
  for(const factory of kernel.values('collection.ui'))Object.assign(actions,factory(context));
  ui=actions;
  if(vault){let timer;const schedule=()=>{clearTimeout(timer);const minutes=kernel.get('plugin.settings','watchers.privacy-vault')?.read?.().autoLockMinutes||15;if(vault.unlocked){timer=setTimeout(()=>{lockVault().catch(()=>{schedule();});},minutes*60000);timer.unref?.();}};for(const event of ['pointerdown','keydown'])window.addEventListener(event,schedule);vault.onActivity=schedule;schedule();}
  if(!location.hash.startsWith('#extensions')&&!location.hash.startsWith('#themes')&&!location.hash.startsWith('#docs'))await render();
  return {render,openPluginSettings:id=>{location.hash='settings/plugin/'+id;},translation:(key,params)=>i18n.t(key,params),stop(){window.removeEventListener('hashchange',onHash);}};
}catch(error){console.error(error);showBootFailure(error);throw error;}
}
