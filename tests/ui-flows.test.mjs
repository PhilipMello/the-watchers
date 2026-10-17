// In-process DOM adapter: exercises UI event wiring and state, not browser layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceUI} from '../assets/js/workspace-ui.mjs';
import {createI18n} from '../assets/js/i18n.mjs';
import {validateSnapshot} from '../assets/js/domain.mjs';
import {preferences} from '../assets/js/workspace.mjs';
import {readSource,readJSON,root} from '../scripts/io.mjs';
class NodeAdapter {
  constructor(tag,attrs={}){this.tag=tag;this.attrs={...attrs};this.children=[];this.events={};this.value=attrs.value??'';this.checked=!!attrs.checked;this.text='';}
  append(...children){this.children.push(...children.flat(Infinity).filter(x=>x!==null&&x!==undefined));if(this.tag==='select'&&!this.value)this.value=this.children.find(x=>x.tag==='option')?.attrs.value||'';}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k];}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  fire(event){for(const fn of this.events[event]||[])fn({preventDefault(){},target:this});}
  click(){this.fire('click');}
  focus(){}
  querySelectorAll(tag){return descendants(this).filter(x=>x!==this&&x.tag===tag);}
  set textContent(v){this.text=v;this.children=[];}
  get textContent(){return this.text+this.children.map(x=>x instanceof NodeAdapter?x.textContent:String(x)).join('');}
}
const descendants=node=>[node,...node.children.flatMap(x=>x instanceof NodeAdapter?descendants(x):[])];
const find=(node,predicate)=>{const result=descendants(node).find(predicate);assert(result,'Expected control was not found');return result;};
const byText=(node,tag,text)=>find(node,x=>x.tag===tag&&x.textContent===text);
const labelled=(node,label)=>find(node,x=>x.attrs['aria-label']===label||x.tag==='label'&&x.children[0]?.textContent===label).tag==='label'?find(node,x=>x.tag==='label'&&x.children[0]?.textContent===label).children[1]:find(node,x=>x.attrs['aria-label']===label);
async function harness(){
  let snapshot=await readSource(),pref=preferences(),langDrafts={},locale='en-US',i18n=createI18n(snapshot.languages,locale);
  const tasks=[],dialogs=[],failures=[],downloads=[];
  const el=(tag,attrs={},...children)=>{const node=new NodeAdapter(tag,attrs);for(const [k,v]of Object.entries(attrs))if(k.startsWith('on'))node.addEventListener(k.slice(2),v);node.append(...children);return node;};
  const t=(key,params)=>i18n.t(key,params),run=fn=>{const p=Promise.resolve().then(fn).catch(e=>failures.push(e));tasks.push(p);return p;};
  const button=(key,fn)=>el('button',{type:'button',onclick:()=>run(fn)},t(key));
  const modal=key=>{const body=el('div'),dialog=el('dialog',{},body),m={key,body,dialog,error:el('div'),dirty:false,closed:false,markDirty(){this.dirty=true;},markClean(){this.dirty=false;},close(){this.closed=true;},finish(){this.closed=true;this.dirty=false;dialog.fire('close');}};dialogs.push(m);return m;};
  const config=await readJSON(root+'config/workspace.json'),app=await readJSON(root+'config/app.json'),theme=await readJSON(root+'themes/genesis/theme.json');
  const c={el,button,t,run,modal,field:(key,input)=>el('label',{},el('span',{},t(key)),input),errors:e=>failures.push(e),render:async()=>{},announce:()=>{},download:(value,filename)=>downloads.push({value,filename}),ensureSnapshot:async()=>snapshot,commit:next=>{snapshot=validateSnapshot(next);i18n=createI18n(snapshot.languages,locale);},locale:()=>locale,date:x=>x,config:()=>config,theme:()=>theme,appConfig:()=>app,baseCatalog:()=>snapshot.languages['en-US'],preferences:()=>pref,setPreferences:p=>pref=preferences(p),languageDrafts:()=>langDrafts,saveLanguageDraft:(k,v)=>langDrafts[k]=structuredClone(v),recoveryPanel:()=>{},jsonEditor:()=>{},resetSnapshot:async()=>{}};
  globalThis.location={hash:'#workspace'};globalThis.confirm=()=>true;
  const flush=async()=>{while(tasks.length)await tasks.shift();};
  return {ui:createWorkspaceUI(c),el,flush,dialogs,failures,downloads,t,get snapshot(){return snapshot;},get pref(){return pref;},get langDrafts(){return langDrafts;},setLocale:value=>{locale=value;i18n=createI18n(snapshot.languages,locale);}};
}
test('New Entry shows configured fields and commits values without editing field metadata',async()=>{
  const h=await harness(),before=h.snapshot.objects.length;await h.ui.editObject();const m=h.dialogs.at(-1);
  assert(!descendants(m.body).some(x=>x.tag==='select'&&x.children.some(y=>y.attrs?.value==='integer')));
  const name=labelled(m.body,'Name');name.value='New sample';name.fire('input');find(m.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);assert.equal(h.snapshot.objects.length,before+1);assert.equal(h.snapshot.objects.at(-1).fields[0].value,'New sample');assert(m.closed);
});
test('custom field configuration closes after save; reusable field and its entry commit together',async()=>{
  const h=await harness();await h.ui.editObject();const entry=h.dialogs.at(-1);byText(entry.body,'button',h.t('action.add')).click();await h.flush();byText(h.dialogs.at(-1).body,'button',h.t('editor.custom')).click();await h.flush();const custom=h.dialogs.at(-1),label=labelled(custom.body,h.t('editor.label'));label.value='Favorite color';find(custom.body,x=>x.tag==='input'&&x.attrs.type==='checkbox').checked=true;find(custom.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);assert(custom.closed);assert(!h.snapshot.definitions.fields.some(d=>h.snapshot.languages['en-US'].messages[d.label_key]==='Favorite color'));
  const value=labelled(entry.body,'Favorite color');value.value='Blue';value.fire('input');find(entry.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);const field=h.snapshot.objects.at(-1).fields.find(f=>f.label['en-US']==='Favorite color');assert.equal(field.value,'Blue');assert(h.snapshot.definitions.fields.some(d=>d.id===field.definition_id));
});
test('canceling entry creation does not leak reusable definitions into the collection',async()=>{const h=await harness(),before=JSON.stringify(h.snapshot);await h.ui.editObject();h.dialogs.at(-1).close();assert.equal(JSON.stringify(h.snapshot),before);});
test('untouched optional numeric fields do not block form submission or become zero',async()=>{const h=await harness();await h.ui.editObject();const m=h.dialogs.at(-1);byText(m.body,'button',h.t('action.add')).click();await h.flush();byText(h.dialogs.at(-1).body,'button','Age').click();await h.flush();const age=labelled(m.body,'Age');assert.notEqual(age.attrs.required,true);assert.equal(age.value,'');find(m.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);assert(!h.snapshot.objects.at(-1).fields.some(f=>f.definition_id==='age'));});
test('renaming a custom field preserves its numeric rules',async()=>{const h=await harness(),original=h.snapshot.objects[0],id=crypto.randomUUID();original.fields.push({id,label:{'en-US':'Bounded count'},value_type:'integer',value:12,rules:{min:10,max:20}});await h.ui.editObject(original);const entry=h.dialogs.at(-1),section=find(entry.body,x=>x.tag==='section'&&x.textContent.includes('Bounded count'));byText(section,'button',h.t('editor.editField')).click();await h.flush();const editor=h.dialogs.at(-1);labelled(editor.body,h.t('editor.label')).value='Observed count';find(editor.body,x=>x.tag==='form').fire('submit');await h.flush();find(entry.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);const saved=h.snapshot.objects.find(o=>o.id===original.id).fields.find(f=>f.id===id);assert.equal(saved.label['en-US'],'Observed count');assert.deepEqual(saved.rules,{min:10,max:20});});
test('editing values in a translated interface preserves English field labels',async()=>{
  const h=await harness();h.snapshot.languages['pt-PT']={...structuredClone(h.snapshot.languages['en-US']),locale:'pt-PT'};h.snapshot.languages['pt-PT'].messages['field.name']='Nome';h.setLocale('pt-PT');const original=h.snapshot.objects[0];original.fields[0].label['pt-PT']='Nome';const before=structuredClone(original.fields.map(f=>f.label));await h.ui.editObject(original);find(h.dialogs.at(-1).body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);assert.deepEqual(h.snapshot.objects.find(o=>o.id===original.id).fields.map(f=>f.label),before);
});
test('Sources has a working create and edit form',async()=>{
  const h=await harness(),main=h.el('main');await h.ui.sourcePage(main);byText(main,'button',h.t('source.new')).click();await h.flush();let m=h.dialogs.at(-1);labelled(m.body,h.t('source.title')).value='Public reference';labelled(m.body,h.t('source.url')).value='https://example.com/reference';find(m.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);assert(h.snapshot.sources.some(s=>s.title==='Public reference'));
  main.replaceChildren();await h.ui.sourcePage(main);const article=find(main,x=>x.tag==='article'&&x.textContent.includes('Public reference'));byText(article,'button',h.t('source.edit')).click();await h.flush();m=h.dialogs.at(-1);labelled(m.body,h.t('source.title')).value='Updated reference';find(m.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);assert(h.snapshot.sources.some(s=>s.title==='Updated reference'));
});
test('Workspace starts empty; toggles reveal selected sections and custom types without hiding public data',async()=>{
  const h=await harness(),main=h.el('main'),before=JSON.stringify(h.snapshot);await h.ui.workspace(main);assert(main.textContent.includes(h.t('workspace.emptyTitle')));await h.ui.customize();const m=h.dialogs.at(-1),toggle=find(m.body,x=>x.tag==='button'&&x.attrs['aria-label']?.startsWith('Architecture —'));toggle.click();await h.flush();assert(h.pref.visible.includes('section:architecture'));main.replaceChildren();await h.ui.workspace(main);assert(main.textContent.includes('Architecture'));assert.equal(JSON.stringify(h.snapshot),before);byText(m.body,'button',h.t('workspace.hideAll')).click();await h.flush();assert.deepEqual(h.pref.visible,[]);
});
test('Architecture and every Settings tab render with complete localized message keys',async()=>{const h=await harness();h.ui.architecture(h.el('main'));for(const tab of ['general','types','languages','advanced']){location.hash='#settings/'+tab;await h.ui.settings(h.el('main'));}assert.deepEqual(h.failures,[]);});
test('language creation, manual translation and activation are connected through the UI',async()=>{
  const h=await harness(),main=h.el('main');location.hash='#settings/languages';await h.ui.settings(main);byText(main,'button',h.t('language.create')).click();await h.flush();let m=h.dialogs.at(-1);labelled(m.body,h.t('language.code')).value='pt-PT';find(m.body,x=>x.tag==='form').fire('submit');await h.flush();m=h.dialogs.at(-1);assert.equal(m.key,'language.translate');
  const base=h.snapshot.languages['en-US'].messages;for(const input of descendants(m.body).filter(x=>x.tag==='textarea')){const key=input.attrs['aria-label'];input.value=key==='action.new'?'Nova entrada':base[key];input.fire('input');}
  byText(m.body,'button',h.t('language.enable')).click();await h.flush();assert.deepEqual(h.failures,[]);assert.equal(h.snapshot.languages['pt-PT'].messages['action.new'],'Nova entrada');assert(m.closed);
});

test('custom field pattern is configured in the form and rejects a nonmatching value',async()=>{
  const h=await harness();await h.ui.editObject();const entry=h.dialogs.at(-1);byText(entry.body,'button',h.t('action.add')).click();await h.flush();byText(h.dialogs.at(-1).body,'button',h.t('editor.custom')).click();await h.flush();const custom=h.dialogs.at(-1);labelled(custom.body,h.t('editor.label')).value='Numeric identifier';labelled(custom.body,h.t('editor.pattern')).value='[0-9]+';find(custom.body,x=>x.tag==='form').fire('submit');await h.flush();assert(custom.closed);const value=labelled(entry.body,'Numeric identifier');value.value='letters';value.fire('input');find(entry.body,x=>x.tag==='form').fire('submit');await h.flush();assert(h.failures.some(e=>e.issues?.some(x=>x.code==='pattern')));assert(!entry.closed);h.failures.length=0;value.value='00123';value.fire('input');find(entry.body,x=>x.tag==='form').fire('submit');await h.flush();assert.deepEqual(h.failures,[]);assert.equal(h.snapshot.objects.at(-1).fields.find(f=>f.label['en-US']==='Numeric identifier').value,'00123');
});
