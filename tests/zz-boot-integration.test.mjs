// Executes the shipped boot and application modules against a small DOM adapter.
// This is integration verification, not a substitute for browser rendering QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {root} from '../scripts/io.mjs';
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
const dist=resolve(root,'dist'),base=pathToFileURL(dist+'/');
const assetRevision=JSON.parse(await readFile(resolve(dist,'data/build-info.json'),'utf8')).asset_revision;
class Element {
 constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.events={};this.value='';this.checked=false;this.hidden=false;this._text='';this.parent=null;}
 append(...children){for(const c of children.flat(Infinity)){const n=c instanceof Element?c:Object.assign(new Element('#text'),{_text:String(c)});n.parent=this;this.children.push(n);if(n.tag==='link')queueMicrotask(()=>n.onload?.());}if(this.tag==='select'&&!this.value)this.value=this.children.find(x=>x.tag==='option')?.attrs.value||'';}
 prepend(...children){const rest=[...this.children];this.children=[];this.append(...children,...rest);}
 replaceChildren(...children){this.children=[];this._text='';this.append(...children);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='hidden')this.hidden=true;if(k==='checked')this.checked=true;}
 getAttribute(k){return this.attrs[k]??null;}
 get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
 set textContent(v){this.children=[];this._text=String(v);}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
 removeEventListener(k,fn){this.events[k]=(this.events[k]||[]).filter(x=>x!==fn);}
 async fire(k,event={}){for(const fn of this.events[k]||[])await fn({preventDefault(){},stopPropagation(){},target:this,...event});}
 click(){return this.fire('click');}focus(){}showModal(){}close(){this.remove();return this.fire('close');}
 querySelectorAll(selector){return walk(this).slice(1).filter(n=>matches(n,selector));}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const walk=n=>[n,...n.children.flatMap(walk)];
function matches(n,s){if(s.startsWith('#'))return n.attrs.id===s.slice(1);if(s.startsWith('.'))return n.className.split(' ').includes(s.slice(1));const m=/^(\w+)?\[([^\]]+)\]$/.exec(s);if(m)return (!m[1]||m[1]===n.tag)&&Object.hasOwn(n.attrs,m[2]);return n.tag===s;}
const disk=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
let run=0;
async function load({hash='#catalog',storage=disk(),enabled,failResource}={}){
 const document=new Element('document');document.head=new Element('head');document.body=new Element('body');document.documentElement=new Element('html');document.append(document.head,document.body);document.createElement=tag=>new Element(tag);document.createTextNode=text=>Object.assign(new Element('#text'),{_text:String(text)});document.baseURI=base.href;document.activeElement=null;
 for(const id of ['app','boot-error','boot-details','boot-messages','boot-loading']){const n=new Element('div');n.setAttribute('id',id);document.body.append(n);}
 const config=JSON.parse(await readFile(resolve(dist,'config/extensions.json'),'utf8'));
 if(enabled)storage.setItem('watchers.kernel:'+base.pathname,JSON.stringify({format_version:'1.0.0',enabled,theme:config.theme,updates:config.updates}));
 let reloads=0;const location={href:base.href,_hash:hash,get hash(){return this._hash;},set hash(v){this._hash=v.startsWith('#')?v:'#'+v;},reload(){reloads++;}};const window=new Element('window');window.dispatchEvent=e=>window.fire(e.type);
 Object.assign(globalThis,{Node:Element,document,window,location,localStorage:storage,confirm:()=>true});
 globalThis.fetch=async input=>{const url=new URL(String(input),base);if(failResource&&url.pathname.endsWith(failResource))return new Response('',{status:503});try{return new Response(await readFile(fileURLToPath(url)));}catch{return new Response('',{status:404});}};
 await import(pathToFileURL(resolve(dist,'core/boot.mjs')).href+'?v='+assetRevision+'&run='+ ++run);
 return {document,storage,location,get reloads(){return reloads;},text:()=>document.querySelector('#app').textContent,async navigate(hash){location.hash=hash;await window.fire('hashchange');},button(label,container=document){const b=walk(container).find(n=>n.tag==='button'&&n.textContent===label);assert(b,'Missing '+label);return b;}};
}
test('shipped full boot renders catalog and every enabled route',async()=>{
 const h=await load();assert(h.text().includes('8 entries'));for(const route of ['#workspace','#settings','#settings/types','#settings/languages','#sources','#relationships','#architecture','#extensions','#themes']){await h.navigate(route);assert(!h.text().includes('ReferenceError'),route);assert(h.text().length>20,route);}assert.equal(h.document.querySelector('#kernel-status').textContent,'');
});
test('plugin screen persists toggles and disables features without losing the collection',async()=>{
 let h=await load({hash:'#extensions'});const article=walk(h.document).find(n=>n.tag==='article'&&n.textContent.startsWith('Custom Fields'));await h.button('Disable',article).click();assert.equal(h.reloads,1);
 h=await load({storage:h.storage});assert(h.text().includes('8 entries'));assert(!walk(h.document.querySelector('#app')).some(n=>n.tag==='button'&&n.textContent==='New Entry'));await h.navigate('#sources');assert(h.text().includes('Sources'));
});
test('bare shell boots with no entries capability and can re-enable the bundle',async()=>{
 const h=await load({enabled:[]});assert(h.text().includes('Plugins'));assert(!h.text().includes('8 entries'));await h.button('Enable bundled plugins').click();assert.equal(h.reloads,1);const next=await load({storage:h.storage});assert(next.text().includes('8 entries'));
});
test('theme switching loads styles, preserves data and survives reload',async()=>{
 const h=await load({hash:'#themes'});const clear=walk(h.document).find(n=>n.tag==='article'&&n.textContent.startsWith('Clear'));await h.button('Use this theme',clear).click();assert.equal(h.document.querySelectorAll('link[data-extension-theme]').length,2);assert(h.document.querySelectorAll('link[data-extension-theme]').every(n=>n.attrs['data-extension-theme']==='watchers.theme-clear'));await h.navigate('#catalog');assert(h.text().includes('8 entries'));
 const next=await load({storage:h.storage});assert(next.document.querySelectorAll('link[data-extension-theme]').every(n=>n.attrs['data-extension-theme']==='watchers.theme-clear'));
});

test('Relationships plugin owns its route and disabling it preserves entry records',async()=>{
 let h=await load({hash:'#extensions'});const article=walk(h.document).find(n=>n.tag==='article'&&n.textContent.startsWith('Relationships'));await h.button('Disable',article).click();h=await load({storage:h.storage});assert(h.text().includes('8 entries'));await h.navigate('#relationships');assert(h.text().includes('This feature is disabled'));assert.equal(h.document.querySelector('#kernel-status').textContent,'');
});

const labelled=(container,label)=>{const wrapper=walk(container).find(n=>n.tag==='label'&&n.children[0]?.textContent===label);assert(wrapper,'Missing label '+label);return wrapper.children[1];};
const settle=async()=>{await new Promise(r=>setTimeout(r,150));};
function memoryIndexedDB(){const databases=new Map();return {open(name){const request={};queueMicrotask(()=>{const fresh=!databases.has(name);if(fresh)databases.set(name,{value:null});const state=databases.get(name);request.result={createObjectStore(){},close(){},transaction(){const tx={aborted:false,abort(){tx.aborted=true;queueMicrotask(()=>tx.onabort?.());},objectStore(){return {get(){const r={};queueMicrotask(()=>{r.result=state.value;r.onsuccess?.();queueMicrotask(()=>{if(!tx.aborted)tx.oncomplete?.();});});return r;},put(value){state.value=structuredClone(value);}};}};return tx;}};if(fresh)request.onupgradeneeded?.();request.onsuccess?.();});return request;},databases};}

test('catalog, entry and disabled detail sections never render literal null nodes',async()=>{const h=await load();assert(!walk(h.document).some(n=>n.tag==='#text'&&n.textContent==='null'));const object=(JSON.parse(await readFile(resolve(dist,'data/index.json'),'utf8'))).objects[0];await h.navigate('#object/'+object.id);assert(!walk(h.document).some(n=>n.tag==='#text'&&n.textContent==='null'));});
test('every configurable plugin exposes working Settings and its feature action',async()=>{const h=await load({hash:'#extensions'});for(const id of ['watchers.media','watchers.badges','watchers.privacy-vault','watchers.github']){await h.navigate('#settings/plugin/'+id);assert(!h.text().includes('This feature is disabled'));assert(h.text().includes('Settings'));assert.equal(h.document.querySelector('#kernel-status').textContent,'');}await h.navigate('#settings/plugin/watchers.badges');await h.button('Manage badges').click();assert(h.document.querySelector('dialog'));await h.button('New badge').click();const dialog=h.document.querySelectorAll('dialog').at(-1);labelled(dialog,'Badge name').value='Verified';const color=labelled(dialog,'Background color');color.value='#003366';await color.fire('input');const width=labelled(dialog,'Width (px, 0 = auto)');width.value='84';await width.fire('input');const border=labelled(dialog,'Border width (px)');border.value='3';await border.fire('input');assert.match(dialog.querySelector('.badge-preview').querySelector('.type-badge').attrs.style,/width:84px/);assert.match(dialog.querySelector('.badge-preview').querySelector('.type-badge').attrs.style,/background-color:#003366/);const checkbox=walk(dialog).find(n=>n.tag==='input'&&n.attrs.type==='checkbox');checkbox.checked=true;await checkbox.fire('change');await dialog.querySelector('form').fire('submit');await settle();assert(!h.document.querySelector('#status').textContent.includes('error'));const raw=[...h.storage.values].find(([key])=>key.startsWith('watchers.workspace:'))[1];assert(JSON.parse(raw).snapshot.extensions.badges.some(b=>b.name==='Verified'));assert.equal(JSON.parse(raw).snapshot.extensions.badges.find(b=>b.name==='Verified').color,'#003366');const next=await load({storage:h.storage});const shown=walk(next.document.querySelector('.cards')).find(n=>n.attrs.title==='Verified');assert(shown);assert.match(shown.attrs.style,/background-color:#003366/);assert.match(shown.attrs.style,/border-width:3px/);assert.match(shown.attrs.style,/width:84px/);});
test('vault UI encrypts private edits, restores after reload and never stores private values in localStorage',async()=>{
 const idb=memoryIndexedDB();globalThis.indexedDB=idb;try{
 let h=await load({hash:'#workspace'});await h.button('Privacy & Vault').click();let d=h.document.querySelectorAll('dialog').at(-1);labelled(d,'Vault passphrase').value='private test passphrase';labelled(d,'Repeat new passphrase').value='private test passphrase';await h.button('Create encrypted vault',d).click();await h.navigate('#catalog');await h.button('New Entry').click();d=h.document.querySelectorAll('dialog').at(-1);const name=walk(d).find(n=>n.attrs['aria-label']==='Name');assert(name);name.value='SECRET-INTEGRATED-ENTRY';await name.fire('input');await d.querySelector('form').fire('submit');await settle();assert(h.text().includes('SECRET-INTEGRATED-ENTRY'),h.document.textContent);for(const raw of h.storage.values.values())assert(!raw.includes('SECRET-INTEGRATED-ENTRY'));const stored=[...idb.databases.values()][0].value;assert(stored.data);assert(!JSON.stringify(stored).includes('SECRET-INTEGRATED-ENTRY'));
 h=await load({storage:h.storage,hash:'#workspace'});assert(!h.text().includes('SECRET-INTEGRATED-ENTRY'));await h.button('Privacy & Vault').click();d=h.document.querySelectorAll('dialog').at(-1);labelled(d,'Vault passphrase').value='private test passphrase';await h.button('Unlock vault',d).click();await h.navigate('#catalog');assert(h.text().includes('SECRET-INTEGRATED-ENTRY'),h.document.textContent);
 await h.navigate('#workspace');await h.button('Privacy & Vault').click();await h.button('Lock vault',h.document.querySelectorAll('dialog').at(-1)).click();await h.navigate('#catalog');assert(!h.text().includes('SECRET-INTEGRATED-ENTRY'));
 }finally{delete globalThis.indexedDB;}
});

test('New Entry creates tags with Enter, persists per entity, reuses tags and discards cancelled changes',async()=>{
 let h=await load();await h.button('New Entry').click();let d=h.document.querySelectorAll('dialog').at(-1),picker=d.querySelector('.badge-picker');
 assert(picker);assert.equal(picker.querySelector('.chips').children.length,0);assert(!walk(d).some(n=>n.tag==='#text'&&n.textContent==='null'));
 let input=picker.querySelector('input');input.value='Removed before save';await input.fire('keydown',{key:'Enter'});await walk(picker).find(n=>n.attrs['aria-label']==='Remove badge Removed before save').click();assert.equal(picker.querySelector('.chips').children.length,0);input.value='Community Member';let prevented=false;await input.fire('keydown',{key:'Enter',preventDefault(){prevented=true;}});assert(prevented);assert.equal(h.document.querySelectorAll('dialog').length,1);assert.equal(picker.querySelector('.chips').children.length,1);
 const name=walk(d).find(n=>n.attrs['aria-label']==='Name');name.value='Individual badge test';await name.fire('input');const visibility=labelled(d,'Classification');visibility.value='public';await visibility.fire('change');await d.querySelector('form').fire('submit');await settle();
 const saved=()=>JSON.parse([...h.storage.values].find(([key])=>key.startsWith('watchers.workspace:'))?.[1]||'{}').snapshot;
 assert(!JSON.stringify(saved()).includes('Removed before save'));let snapshot=saved(),entry=snapshot.objects.find(o=>o.fields.some(f=>f.value==='Individual badge test'));assert(entry);assert.equal(entry.badge_ids.length,1);const badgeId=entry.badge_ids[0];assert(snapshot.objects.filter(o=>o.id!==entry.id).every(o=>!(o.badge_ids||[]).includes(badgeId)));
 h=await load({storage:h.storage});assert(h.document.querySelector('.cards').textContent.includes('Community Member'));
 await h.button('New Entry').click();d=h.document.querySelectorAll('dialog').at(-1);picker=d.querySelector('.badge-picker');assert.equal(picker.querySelector('.chips').children.length,0);input=picker.querySelector('input');input.value='community';await input.fire('input');await h.button('Community Member',picker).click();assert.equal(picker.querySelector('.chips').children.length,1);
 input.value='Cancelled badge';await input.fire('keydown',{key:'Enter'});await h.button('Cancel',d).click();assert(!JSON.stringify(saved()).includes('Cancelled badge'));assert.equal(saved().extensions.badges.filter(b=>b.name==='Community Member').length,1);
 await h.navigate('#object/'+entry.id);await h.button('Edit Entry').click();d=h.document.querySelectorAll('dialog').at(-1);picker=d.querySelector('.badge-picker');const remove=walk(picker).find(n=>n.attrs['aria-label']==='Remove badge Community Member');assert(remove);await remove.click();await d.querySelector('form').fire('submit');await settle();assert.deepEqual(saved().objects.find(o=>o.id===entry.id).badge_ids,[]);
 h=await load({storage:h.storage});assert(!h.document.querySelector('.cards').textContent.includes('Community Member'));
});

test('Birth year is ungrouped after boot and the field format is editable and persistent',async()=>{
 let h=await load();const index=JSON.parse(await readFile(resolve(dist,'data/index.json'),'utf8'));let original;
 for(const row of index.objects){const o=JSON.parse(await readFile(resolve(dist,row.path),'utf8'));if(o.fields.some(f=>f.id==='attribute_birth_year')){original=o;break;}}
 assert(original);await h.navigate('#object/'+original.id);let field=walk(h.document).find(n=>n.tag==='div'&&n.children.some(c=>c.tag==='dt'&&c.textContent==='Birth year'));assert.equal(field.children.find(n=>n.tag==='dd').textContent,'1988');
 await h.button('Edit Entry').click();let d=h.document.querySelectorAll('dialog').at(-1),section=walk(d).find(n=>n.tag==='section'&&n.textContent.startsWith('Birth year'));assert(section);const format=labelled(section,'Number format');assert.equal(format.value,'year');format.value='number';await format.fire('change');await d.querySelector('form').fire('submit');await settle();
 h=await load({storage:h.storage,hash:'#object/'+original.id});field=walk(h.document).find(n=>n.tag==='div'&&n.children.some(c=>c.tag==='dt'&&c.textContent==='Birth year'));assert.equal(field.children.find(n=>n.tag==='dd').textContent,'1,988');
 await h.button('Edit Entry').click();d=h.document.querySelectorAll('dialog').at(-1);section=walk(d).find(n=>n.tag==='section'&&n.textContent.startsWith('Birth year'));const year=labelled(section,'Number format');year.value='year';await year.fire('change');await d.querySelector('form').fire('submit');await settle();h=await load({storage:h.storage,hash:'#object/'+original.id});field=walk(h.document).find(n=>n.tag==='div'&&n.children.some(c=>c.tag==='dt'&&c.textContent==='Birth year'));assert.equal(field.children.find(n=>n.tag==='dd').textContent,'1988');
});

test('catalog card design switches, reloads and is configurable from Entries settings',async()=>{
 let h=await load();assert.equal(h.document.querySelector('.cards').attrs['data-card-design'],'frosted');const design=walk(h.document).find(n=>n.attrs['aria-label']==='Card design');design.value='classic';await design.fire('change');await settle();assert.equal(h.document.querySelector('.cards').attrs['data-card-design'],'classic');h=await load({storage:h.storage});assert.equal(h.document.querySelector('.cards').attrs['data-card-design'],'classic');
 await h.navigate('#settings/plugin/watchers.objects');const input=labelled(h.document.querySelector('form'),'Card design');input.value='frosted';await h.document.querySelector('form').fire('submit');await settle();h=await load({storage:h.storage});assert.equal(h.document.querySelector('.cards').attrs['data-card-design'],'frosted');
});
test('Entries creates fields with Enter, reuses names, removes unsaved definitions and commits values',async()=>{
 let h=await load();await h.button('New Entry').click();let d=h.document.querySelectorAll('dialog').at(-1),picker=d.querySelector('.field-picker'),input=picker.querySelector('input');
 input.value='Temporary field';let prevented=false;await input.fire('keydown',{key:'Enter',preventDefault(){prevented=true;}});assert(prevented);assert.equal(h.document.querySelectorAll('dialog').length,1);assert(walk(d).some(n=>n.attrs['aria-label']==='Temporary field'));
 await walk(picker).find(n=>n.attrs['aria-label']==='Remove field Temporary field').click();assert(!walk(d).some(n=>n.attrs['aria-label']==='Temporary field'));
 input.value='Passport note';await input.fire('keydown',{key:'Enter'});input.value=' passport NOTE ';await input.fire('keydown',{key:'Enter'});assert.equal(walk(d).filter(n=>n.attrs['aria-label']==='Passport note').length,1);
 const value=walk(d).find(n=>n.attrs['aria-label']==='Passport note');value.value='Sample note';await value.fire('input');const visibility=labelled(d,'Classification');visibility.value='public';await visibility.fire('change');await d.querySelector('form').fire('submit');await settle();
 const state=JSON.parse([...h.storage.values].find(([k])=>k.startsWith('watchers.workspace:'))[1]).snapshot;assert(!JSON.stringify(state).includes('Temporary field'));const def=state.definitions.fields.find(f=>state.languages['en-US'].messages[f.label_key]==='Passport note');assert(def);assert.equal(state.definitions.fields.filter(f=>f.id===def.id).length,1);assert(state.objects.some(o=>o.fields.some(f=>f.definition_id===def.id&&f.value==='Sample note')));
 h=await load({storage:h.storage});await h.button('New Entry').click();d=h.document.querySelectorAll('dialog').at(-1);input=d.querySelector('.field-picker').querySelector('input');input.value='Cancelled entry field';await input.fire('keydown',{key:'Enter'});await h.button('Cancel',d).click();assert(![...h.storage.values.values()].some(v=>v.includes('Cancelled entry field')));
});
test('Types and fields creates reusable fields with Enter in both the library and type editor',async()=>{
 const h=await load({hash:'#settings/types'});await h.button('Field library').click();let d=h.document.querySelectorAll('dialog').at(-1),input=d.querySelector('.field-picker').querySelector('input');input.value='Discard this field';await input.fire('keydown',{key:'Enter'});await h.button('Cancel',d).click();assert(![...h.storage.values.values()].some(v=>v.includes('Discard this field')));
 await h.button('Field library').click();d=h.document.querySelectorAll('dialog').at(-1);input=d.querySelector('.field-picker').querySelector('input');input.value='Research topic';await input.fire('keydown',{key:'Enter'});assert.equal(h.document.querySelectorAll('dialog').length,1);await d.querySelector('form').fire('submit');await settle();
 const typePanel=walk(h.document).find(n=>n.tag==='section'&&n.children.some(c=>c.tag==='h3'&&c.textContent==='Person'));assert(typePanel);await h.button('Configure type',typePanel).click();d=h.document.querySelectorAll('dialog').at(-1);input=d.querySelector('.field-picker').querySelector('input');input.value='research topic';await input.fire('keydown',{key:'Enter'});input.value='Area of work';await input.fire('keydown',{key:'Enter'});await d.querySelector('form').fire('submit');await settle();
 const state=JSON.parse([...h.storage.values].find(([k])=>k.startsWith('watchers.workspace:'))[1]).snapshot;const defs=state.definitions.fields.filter(f=>['Research topic','Area of work'].includes(state.languages['en-US'].messages[f.label_key]));assert.equal(defs.length,2);assert(defs.every(d=>state.types.types.find(t=>t.id==='person').suggested_fields.includes(d.id)));
 await h.navigate('#catalog');await h.button('New Entry').click();d=h.document.querySelectorAll('dialog').at(-1);assert(walk(d).some(n=>n.attrs['aria-label']==='Area of work'));assert(walk(d).some(n=>n.attrs['aria-label']==='Research topic'));
});

async function githubDialog(h){
 await h.navigate('#settings/plugin/watchers.github');const form=h.document.querySelector('form');
 labelled(form,'Repository owner').value='owner';labelled(form,'Repository name').value='repo';await form.fire('submit');await settle();
 await h.button('Submit changes to GitHub').click();return h.document.querySelectorAll('dialog').at(-1);
}
async function mockGithub(t){
 const {GitHub}=await import(pathToFileURL(resolve(dist,'plugins/github/client.mjs')).href+'?v='+assetRevision);
 const identity=t.mock.method(GitHub.prototype,'identity',async()=>({name:'Tester',emails:['tester@example.com']}));
 const prepare=t.mock.method(GitHub.prototype,'prepare',async()=>({base:'main',changes:[{action:'modified',path:'data/meta.json'}]}));
 const submit=t.mock.method(GitHub.prototype,'submit',async()=>({html_url:'https://github.com/owner/repo/pull/123'}));
 return {identity,prepare,submit};
}
test('GitHub shows connection progress, confirms inline and retains the PR link when popups are blocked',async t=>{
 const h=await load(),mock=await mockGithub(t),d=await githubDialog(h);globalThis.confirm=()=>{throw Error('Native confirmation must not be used');};
 let completeIdentity;mock.identity.mock.mockImplementation(()=>new Promise(resolve=>{completeIdentity=resolve;}));
 labelled(d,'Fine-grained personal access token (session only)').value='session-test-secret';
 const connecting=h.button('Connect and review changes',d).click();await settle();assert(d.textContent.includes('Connecting to GitHub'));assert(h.button('Connect and review changes',d).disabled);
 completeIdentity({name:'Tester',emails:['tester@example.com']});await connecting;assert.equal(mock.submit.mock.callCount(),0);
 await h.button('Create pull request',d).click();assert.equal(mock.submit.mock.callCount(),0);assert(d.textContent.includes('Submit the reviewed changes from new-entries to main?'));
 let opened=0;window.open=()=>{opened++;return null;};await h.button('Confirm submission',d).click();assert.equal(mock.submit.mock.callCount(),1);assert.equal(opened,1);
 assert(walk(d).some(n=>n.tag==='a'&&n.attrs.href==='https://github.com/owner/repo/pull/123'));assert(d.textContent.includes('Pull request created'));
 assert(![...h.storage.values.values()].some(v=>v.includes('session-test-secret')));
});
test('GitHub explains no changes and never offers submission in that state',async t=>{
 const h=await load(),mock=await mockGithub(t),d=await githubDialog(h);mock.prepare.mock.mockImplementation(async()=>({base:'main',changes:[]}));
 labelled(d,'Fine-grained personal access token (session only)').value='test';await h.button('Connect and review changes',d).click();
 assert(d.textContent.includes('No public changes'));assert(!walk(d).some(n=>n.tag==='button'&&n.textContent==='Create pull request'));assert.equal(mock.submit.mock.callCount(),0);
});
test('GitHub failed authentication is visible and cannot reuse an unauthenticated client',async t=>{
 const h=await load(),mock=await mockGithub(t),d=await githubDialog(h);mock.identity.mock.mockImplementation(async()=>{throw Error('GitHub HTTP 401: expired token');});
 labelled(d,'Fine-grained personal access token (session only)').value='expired';await h.button('Connect and review changes',d).click();assert(d.textContent.includes('GitHub HTTP 401'));assert(!h.button('Connect and review changes',d).disabled);
 await h.button('Connect and review changes',d).click();assert(d.textContent.includes('Enter a fine-grained token'));assert.equal(mock.prepare.mock.callCount(),0);
});
test('GitHub submission errors close the waiting tab and allow retry',async t=>{
 const h=await load(),mock=await mockGithub(t),d=await githubDialog(h);labelled(d,'Fine-grained personal access token (session only)').value='test';await h.button('Connect and review changes',d).click();
 let closed=0;window.open=()=>({opener:{},document:{body:{}},close(){closed++;}});mock.submit.mock.mockImplementation(async()=>{throw Error('GitHub HTTP 403: write permission required');});
 await h.button('Create pull request',d).click();await h.button('Confirm submission',d).click();assert.equal(closed,1);assert(d.textContent.includes('GitHub HTTP 403'));assert(!h.button('Create pull request',d).disabled);
 mock.submit.mock.mockImplementation(async()=>({html_url:'https://github.com/owner/repo/pull/123'}));let redirected='';window.open=()=>({document:{body:{}},location:{replace(url){redirected=url;}}});
 await h.button('Create pull request',d).click();await h.button('Confirm submission',d).click();assert.equal(redirected,'https://github.com/owner/repo/pull/123');
});
test('GitHub reports source conflict details with a link and never enables submission',async t=>{
 const h=await load(),mock=await mockGithub(t),d=await githubDialog(h);
 mock.prepare.mock.mockImplementation(async()=>{const error=Error('Remote changes conflict with this workspace');error.base='main';error.conflicts=[{path:'objects/person/entry.json',expected:'source-base',remote:'remote-edited',proposed:'local-edit'}];throw error;});
 labelled(d,'Fine-grained personal access token (session only)').value='test';await h.button('Connect and review changes',d).click();
 assert(d.textContent.includes('source-base'));assert(d.textContent.includes('remote-edited'));assert(walk(d).some(n=>n.attrs.href==='https://github.com/owner/repo/blob/main/objects/person/entry.json'));
 assert(!walk(d).some(n=>n.tag==='button'&&n.textContent==='Create pull request'));assert.equal(mock.submit.mock.callCount(),0);
});

const savedSnapshot=h=>JSON.parse([...h.storage.values].find(([key])=>key.startsWith('watchers.workspace:'))?.[1]||'{}').snapshot;
test('Docs follows Themes in the shell and remains available with every plugin disabled',async()=>{
 let h=await load();const links=walk(h.document.querySelector('.kernel-bar')).filter(n=>n.tag==='a');assert.equal(links.findIndex(n=>n.attrs.href==='#docs'),links.findIndex(n=>n.attrs.href==='#themes')+1);await h.navigate('#docs');assert(h.text().includes('session only'));assert(h.text().includes('Confirm submission'));assert(h.text().includes('LICENSE'));
 h=await load({enabled:[],hash:'#docs'});assert(h.text().includes('Token:'));assert(h.text().includes('Read and write'));
});
test('references only search on input, create countries on Enter, reuse existing and discard cancelled drafts',async()=>{
 const h=await load(),original=JSON.parse(await readFile(resolve(root,'tests/fixtures/v0.4.0-demo.json'),'utf8')).objects.find(o=>o.type==='person'&&o.fields.some(f=>f.value_type==='reference'));
 await h.navigate('#object/'+original.id);await h.button('Edit Entry').click();let d=h.document.querySelectorAll('dialog').at(-1),section=walk(d).find(n=>n.tag==='section'&&n.textContent.includes('Residence country id'));assert(section);
 let input=section.querySelector('.creatable-picker').querySelector('input');input.value='Testland';await input.fire('input');assert(!walk(section).some(n=>n.tag==='span'&&n.textContent==='Testland'));await input.fire('keydown',{key:'Enter'});assert(walk(section).some(n=>n.tag==='span'&&n.textContent==='Testland'));await d.querySelector('form').fire('submit');await settle();let s=savedSnapshot(h),country=s.objects.find(o=>o.fields.some(f=>f.value==='Testland'));assert(country);assert.equal(country.type,'country');assert(s.objects.find(o=>o.id===original.id).fields.some(f=>f.value===country.id));
 await h.button('Edit Entry').click();d=h.document.querySelectorAll('dialog').at(-1);section=walk(d).find(n=>n.tag==='section'&&n.textContent.includes('Residence country id'));input=section.querySelector('.creatable-picker').querySelector('input');input.value=' testland ';await input.fire('keydown',{key:'Enter'});input.value='Cancelled country';await input.fire('keydown',{key:'Enter'});await h.button('Cancel',d).click();assert(!JSON.stringify(savedSnapshot(h)).includes('Cancelled country'));assert.equal(savedSnapshot(h).objects.filter(o=>o.id===country.id).length,1);
});
test('Categories stage on Enter and persist assignments, catalog labels and filter',async()=>{
 const h=await load();await h.button('New Entry').click();const d=h.document.querySelectorAll('dialog').at(-1),picker=walk(d).find(n=>n.tag==='fieldset'&&n.children[0]?.textContent==='Categories'),input=picker.querySelector('input');input.value='Developer';await input.fire('input');assert(!walk(picker).some(n=>n.tag==='span'&&n.textContent==='Developer'));await input.fire('keydown',{key:'Enter'});input.value='developer';await input.fire('keydown',{key:'Enter'});const privacy=labelled(d,'Classification');privacy.value='public';await privacy.fire('change');await d.querySelector('form').fire('submit');await settle();const s=savedSnapshot(h);assert.equal(s.extensions.categories.length,1);assert(s.objects.some(o=>o.category_ids?.length===1));await h.navigate('#catalog');assert(h.text().includes('Developer'));const filter=walk(h.document).find(n=>n.attrs['aria-label']==='Filter by category');filter.value=s.extensions.categories[0].id;await filter.fire('change');assert.equal(h.document.querySelector('.cards').children.length,1);
});
test('Custom Fields Settings creates typed fields with manual keys and persists them',async()=>{
 const h=await load({hash:'#settings/plugin/watchers.custom-fields'});await h.button('Field library').click();let d=h.document.querySelectorAll('dialog').at(-1);await h.button('New configured field',d).click();const e=h.document.querySelectorAll('dialog').at(-1);labelled(e,'Field label').value='Passport code';const mode=labelled(e,'Field key creation');mode.value='manual';await mode.fire('change');labelled(e,'Field key').value='field.passport';await e.querySelector('form').fire('submit');await settle();assert(!h.document.querySelectorAll('dialog').includes(e));await d.querySelector('form').fire('submit');await settle();assert(savedSnapshot(h).definitions.fields.some(f=>f.label_key==='field.passport'&&f.value_type==='text'));
});
test('Language metadata persists emoji and URL flags and renders in the selector',async()=>{
 const h=await load({hash:'#settings/languages'});await h.button('Appearance & flag').click();let d=h.document.querySelectorAll('dialog').at(-1);labelled(d,'Language display name').value='English UK';const kind=labelled(d,'Flag source');kind.value='emoji';await kind.fire('change');labelled(d,'Flag emoji').value='🇬🇧';await labelled(d,'Flag emoji').fire('input');await d.querySelector('form').fire('submit');await settle();assert.equal(savedSnapshot(h).languages['en-US'].flag.value,'🇬🇧');assert(h.document.querySelector('.language-menu').textContent.includes('English UK'));
 await h.button('Appearance & flag').click();d=h.document.querySelectorAll('dialog').at(-1);const type=labelled(d,'Flag source');type.value='image';await type.fire('change');const url=walk(d).find(n=>n.attrs.type==='url');url.value='https://example.com/flag.png';await h.button('Add URL',d).click();await d.querySelector('form').fire('submit');await settle();assert.equal(savedSnapshot(h).languages['en-US'].flag.kind,'image');assert(walk(h.document.querySelector('.language-menu')).some(n=>n.tag==='img'&&n.attrs.src==='https://example.com/flag.png'));
});
test('Custom CSS persists, applies on catalog, is removed on admin routes and can reset',async()=>{
 const h=await load({hash:'#settings/plugin/watchers.custom-css'});await h.button('Customize CSS').click();let d=h.document.querySelectorAll('dialog').at(-1);labelled(d,'Custom CSS').value='.card { border: 5px solid red; }';labelled(d,'Base font size (px)').value='22';await d.querySelector('form').fire('submit');await settle();assert(savedSnapshot(h).extensions.custom_css.css.includes('5px'));assert(!h.document.querySelector('#watchers-custom-css'));await h.navigate('#catalog');assert(h.document.querySelector('#watchers-custom-css').textContent.includes('5px'));await h.navigate('#docs');assert(!h.document.querySelector('#watchers-custom-css'));
 await h.navigate('#settings/plugin/watchers.custom-css');await h.button('Customize CSS').click();d=h.document.querySelectorAll('dialog').at(-1);await h.button('Reset and disable',d).click();await d.querySelector('form').fire('submit');await settle();await h.navigate('#catalog');assert(!h.document.querySelector('#watchers-custom-css'));assert.equal(savedSnapshot(h).extensions.custom_css.enabled,false);
});
test('selection fields create options with Enter and require a type when creating unrestricted references',async t=>{
 const h=await load();const {helpers}=await import(pathToFileURL(resolve(dist,'plugins/objects/ui-helpers.mjs')).href+'?v='+assetRevision);const s=JSON.parse(await readFile(resolve(root,'tests/fixtures/v0.4.0-demo.json'),'utf8'));
 const el=(tag,attrs={},...children)=>{const node=new Element(tag);for(const [key,value]of Object.entries(attrs)){if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(value!==undefined&&value!==false)node.setAttribute(key,value);}node.append(...children.flat(Infinity).filter(x=>x!=null));return node;};const c={el,t:key=>key,locale:()=> 'en-US',field:(key,node)=>el('label',{},key,node),button:(key,fn)=>el('button',{onclick:fn},key)};
 const f={id:'status',label:{'en-US':'Status'},value_type:'single-select',rules:{options:['Active']},value:''},view=helpers(c).valueControl(s,f,value=>f.value=value),input=view.querySelector('input');input.value='Founder';await input.fire('input');assert.deepEqual(f.rules.options,['Active']);await input.fire('keydown',{key:'Enter'});assert.equal(f.value,'Founder');assert.deepEqual(f.rules.options,['Active','Founder']);input.value='founder';await input.fire('keydown',{key:'Enter'});assert.equal(f.rules.options.length,2);
 const tags={id:'tags',label:{'en-US':'Tags'},value_type:'text-list',value:['Existing']},tagView=helpers(c).valueControl(s,tags,value=>tags.value=value),tagInput=tagView.querySelector('input');tagInput.value='New tag';await tagInput.fire('input');assert.deepEqual(tags.value,['Existing']);await tagInput.fire('keydown',{key:'Enter'});assert.deepEqual(tags.value,['Existing','New tag']);tagInput.value='new TAG';await tagInput.fire('keydown',{key:'Enter'});assert.equal(tags.value.length,2);
 const ref={id:'any',label:{'en-US':'Any entry'},value_type:'reference',value:''},created=new Set(),reference=helpers(c).valueControl(s,ref,value=>ref.value=value,{createdReferences:created});const search=reference.querySelector('input');search.value='New company';await search.fire('keydown',{key:'Enter'});assert.equal(created.size,0);reference.querySelector('select').value='company';await search.fire('keydown',{key:'Enter'});assert.equal(created.size,1);assert.equal(s.objects.find(o=>o.id===ref.value).type,'company');
});
test('Custom CSS exports complete state and stages JSON or CSS imports until save',async t=>{
 const h=await load({hash:'#settings/plugin/watchers.custom-css'}),downloads=[];t.mock.method(URL,'createObjectURL',blob=>{downloads.push(blob);return 'blob:test';});await h.button('Customize CSS').click();let d=h.document.querySelectorAll('dialog').at(-1);labelled(d,'Custom CSS').value='.card { padding: 12px; }';await h.button('Export complete state',d).click();const pack=JSON.parse(await downloads.at(-1).text());assert.equal(pack.format,'watchers-css-package');assert.equal(pack.state.css,'.card { padding: 12px; }');assert.deepEqual(pack.assets,{});
 const upload=walk(d).find(n=>n.attrs['aria-label']==='Import CSS or state');pack.state.css='.card { padding: 24px; }';const text=JSON.stringify(pack);upload.files=[{name:'theme.json',size:text.length,text:async()=>text}];await upload.fire('change');assert.equal(labelled(d,'Custom CSS').value,pack.state.css);await h.button('Cancel',d).click();assert(!savedSnapshot(h)?.extensions?.custom_css);
 await h.button('Customize CSS').click();d=h.document.querySelectorAll('dialog').at(-1);const cssUpload=walk(d).find(n=>n.attrs['aria-label']==='Import CSS or state');cssUpload.files=[{name:'custom.css',size:29,text:async()=>'.card { padding: 32px; }'}];await cssUpload.fire('change');await d.querySelector('form').fire('submit');await settle();assert.equal(savedSnapshot(h).extensions.custom_css.css,'.card { padding: 32px; }');
});
test('language flag upload is saved through the vault and exported with image bytes',async t=>{
 globalThis.indexedDB=memoryIndexedDB();try{const h=await load({hash:'#workspace'});await h.button('Privacy & Vault').click();let d=h.document.querySelectorAll('dialog').at(-1);labelled(d,'Vault passphrase').value='private test passphrase';labelled(d,'Repeat new passphrase').value='private test passphrase';await h.button('Create encrypted vault',d).click();await settle();await h.navigate('#settings/languages');await h.button('Appearance & flag').click();d=h.document.querySelectorAll('dialog').at(-1);const kind=labelled(d,'Flag source');kind.value='image';await kind.fire('change');
 const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')),upload=walk(d).find(n=>n.attrs.type==='file');upload.files=[{name:'flag.png',arrayBuffer:async()=>bytes.buffer}];await upload.fire('change');await d.querySelector('form').fire('submit');await settle();assert(savedSnapshot(h).languages['en-US'].flag.value.src.startsWith('media/'));
 const downloads=[];t.mock.method(URL,'createObjectURL',blob=>{downloads.push(blob);return 'blob:test';});await h.button('Export language').click();const pack=JSON.parse(await downloads.at(-1).text());assert.equal(pack.format,'watchers-language-package');assert.equal(Object.keys(pack.assets).length,1);
 }finally{delete globalThis.indexedDB;}
});

test('existing categories are selectable without typing below Type and appear in the catalog filter',async()=>{
 let h=await load({hash:'#settings/plugin/watchers.categories'});await h.button('Manage categories').click();let d=h.document.querySelector('dialog'),input=walk(d).find(n=>n.attrs['aria-label']==='Categories');input.value='Actor';await input.fire('keydown',{key:'Enter'});await h.button('Save categories',d).click();await settle();await h.navigate('#catalog');let filter=walk(h.document).find(n=>n.attrs['aria-label']==='Filter by category');assert(filter.children.some(x=>x.textContent==='Actor'));filter.value=savedSnapshot(h).extensions.categories[0].id;await filter.fire('change');assert(h.document.querySelector('.cards').textContent.includes('No entries'));
 await h.button('New Entry').click();d=h.document.querySelector('dialog');const form=d.querySelector('form'),picker=walk(d).find(n=>n.tag==='fieldset'&&n.children[0]?.textContent==='Categories');assert.equal(form.children[1],picker);assert.equal(picker.querySelector('input').value,'');assert.equal(picker.querySelector('.chips').children.length,0);await h.button('Actor',picker).click();const privacy=labelled(d,'Classification');privacy.value='public';await privacy.fire('change');await form.fire('submit');await settle();await h.navigate('#catalog');assert.equal(h.document.querySelector('.cards').children.length,1);assert(h.document.querySelector('.cards').textContent.includes('Actor'));h=await load({storage:h.storage});await h.button('New Entry').click();d=h.document.querySelector('dialog');assert(walk(d).some(n=>n.tag==='button'&&n.textContent==='Actor'));assert.equal(savedSnapshot(h).extensions.categories.length,1);
});
test('field filters resolve locations and dates, persist navigation, and remove chips',async()=>{
 const h=await load(),data=JSON.parse(await readFile(resolve(root,'tests/fixtures/v0.4.0-demo.json'),'utf8')),person=data.objects.find(o=>o.type==='person'&&o.fields.some(f=>f.value_type==='reference')),reference=person.fields.find(f=>f.value_type==='reference'),country=data.objects.find(o=>o.id===reference.value),countryName=country.fields.find(f=>f.id===country.display_field_id).value;
 const search=walk(h.document).find(n=>n.attrs['aria-label']==='Search the collection');assert(search);search.value=countryName;await search.fire('input');assert(h.document.querySelector('.cards').textContent.includes(person.fields.find(f=>f.id===person.display_field_id).value));search.value='';await search.fire('input');
 let panel=h.document.querySelector('.search-filters'),field=walk(panel).find(n=>n.attrs['aria-label']==='Filter field');field.value=field.children.find(n=>n.textContent==='Field: '+reference.label['en-US']).attrs.value;await field.fire('change');let value=walk(panel).find(n=>n.attrs['aria-label']==='Filter value');value.value=countryName;await panel.querySelector('form').fire('submit');const count=h.document.querySelector('.cards').children.length;assert(count>0&&count<8);await h.navigate('#docs');await h.navigate('#catalog');assert.equal(h.document.querySelector('.cards').children.length,count);assert(h.document.querySelector('.filter-chips').textContent.includes(countryName));await h.document.querySelector('.filter-chips').querySelector('button').click();assert.equal(h.document.querySelector('.cards').children.length,8);
});
test('saved-workspace PR is an actionable link and Docs describes local setup in en-US',async()=>{
 const h=await load();await h.button('New Entry').click();const d=h.document.querySelector('dialog'),privacy=labelled(d,'Classification');privacy.value='public';await privacy.fire('change');await d.querySelector('form').fire('submit');await settle();let link=walk(h.document).find(n=>n.tag==='a'&&n.textContent==='PR');assert(link);await link.click();await settle();assert(h.document.querySelector('dialog').textContent.includes('Fine-grained personal access token (session only)'));await h.button('Cancel',h.document.querySelector('dialog')).click();await h.navigate('#docs');assert.equal(h.document.querySelector('.docs-page').attrs.lang,'en-US');assert(h.text().includes('python3 -m http.server'));assert(h.text().includes('npm run build'));assert(h.text().includes('Everyday use'));
});
test('disabled Categories is explained in both catalog and entry editor',async()=>{
 const h=await load({hash:'#extensions'}),article=walk(h.document).find(n=>n.tag==='article'&&n.textContent.startsWith('Categories'));await h.button('Disable',article).click();const next=await load({storage:h.storage});assert(next.text().includes('Enable Categories in Plugins'));await next.button('New Entry').click();assert(next.document.querySelector('dialog').textContent.includes('Categories is disabled'));
});

test('startup removes the loading overlay on success and failure',async()=>{let h=await load();assert.equal(h.document.querySelector('#boot-loading'),null);assert.equal(h.document.body.attrs['aria-busy'],'false');h=await load({failResource:'config/extensions.json'});assert.equal(h.document.querySelector('#boot-loading'),null);assert(h.text().includes('HTTP 503'));});

test('the built HTML and complete module graph share the same cache revision',async()=>{
 const html=await readFile(resolve(dist,'index.html'),'utf8');for(const path of ['core/boot.mjs','assets/js/loading.js','core/shell.css','assets/css/core.css'])assert(html.includes(path+'?v='+assetRevision));
 const {files}=await import('../scripts/io.mjs');for(const path of (await files(dist)).filter(p=>p.endsWith('.mjs'))){const source=await readFile(path,'utf8');for(const match of source.matchAll(/(['"])(\.{1,2}\/[^'"\s]+\.mjs)([^'"\s]*)\1/g))assert.equal(match[3],'?v='+assetRevision,path+': '+match[2]);}
});

test('a clean public build opens empty and can create its first entry',async()=>{
 const paths=['data/index.json','data/meta.json','data/manifest.json'],original=new Map(await Promise.all(paths.map(async p=>[p,await readFile(resolve(dist,p))])));
 try{const index={format_version:'1.0.0',objects:[]},meta={format_version:'1.0.0',dataset_mode:'public',relationships:[],sources:[],notes:[]},manifest=JSON.parse(original.get('data/manifest.json'));
 for(const [path,value]of [['data/index.json',index],['data/meta.json',meta]]){const bytes=Buffer.from(JSON.stringify(value));await writeFile(resolve(dist,path),bytes);manifest.files[path]=createHash('sha256').update(bytes).digest('hex');}
 await writeFile(resolve(dist,'data/manifest.json'),JSON.stringify(manifest));
 const h=await load();assert(h.text().includes('Your collection is empty'));assert(h.text().includes('0 entries'));assert(!h.document.querySelector('.cards').querySelector('a'));
 await h.button('New Entry').click();const d=h.document.querySelector('dialog'),name=walk(d).find(n=>n.attrs['aria-label']==='Name');name.value='First Genesis entry';await name.fire('input');const privacy=labelled(d,'Classification');privacy.value='public';await privacy.fire('change');await d.querySelector('form').fire('submit');await settle();assert.equal(savedSnapshot(h).objects.length,1);await h.navigate('#catalog');assert(h.document.querySelector('.cards').textContent.includes('First Genesis entry'));
 }finally{for(const [path,bytes]of original)await writeFile(resolve(dist,path),bytes);}
});

test('initial UI reviews a clean source bundle despite local entries and confirms genesis to main',async t=>{
 const {initialProject}=await import('../scripts/initial-project.mjs'),{readSource,readJSON}=await import('../scripts/io.mjs');
 const s=await readSource();s.objects=[];s.relationships=[];s.sources=[];s.notes=[];s.dataset_mode='public';delete s.extensions;delete s.legacy;
 const pkg=await initialProject(root,s,await readJSON(resolve(root,'config/app.json')));
 const paths=['data/initial-project.json','data/manifest.json'],original=new Map(await Promise.all(paths.map(async p=>[p,await readFile(resolve(dist,p))])));
 try{
  const bytes=Buffer.from(JSON.stringify(pkg)),manifest=JSON.parse(original.get('data/manifest.json'));manifest.files['data/initial-project.json']=createHash('sha256').update(bytes).digest('hex');
  await writeFile(resolve(dist,'data/initial-project.json'),bytes);await writeFile(resolve(dist,'data/manifest.json'),JSON.stringify(manifest));
  const h=await load(),mock=await mockGithub(t);assert(h.text().includes('8 entries'));
  await h.button('New Entry').click();const editor=h.document.querySelector('dialog');const privacy=labelled(editor,'Classification');privacy.value='public';await privacy.fire('change');await editor.querySelector('form').fire('submit');await settle();assert.equal(savedSnapshot(h).objects.length,9);
  const d=await githubDialog(h);
  mock.prepare.mock.mockImplementation(async(base,baseline,files)=>{assert.deepEqual(baseline,{});assert.deepEqual(Object.keys(files).filter(p=>p.startsWith('objects/')),['objects/.gitkeep']);return {base,remotePaths:['LICENSE'],changes:Object.keys(files).map(path=>({path,action:'added'}))};});
  const mode=labelled(d,'Publication mode');mode.value='initial';await mode.fire('change');assert(d.textContent.includes('Workflows'));
  labelled(d,'Fine-grained personal access token (session only)').value='initial-session-secret';await h.button('Connect and review changes',d).click();
  assert(d.textContent.includes('.github/workflows/pages.yml'));assert(d.textContent.includes('genesis → main'));assert.equal(mock.submit.mock.callCount(),0);
  await h.button('Create pull request',d).click();assert.equal(mock.submit.mock.callCount(),0);assert(d.textContent.includes('from genesis to main'));
  window.open=()=>null;await h.button('Confirm submission',d).click();assert.equal(mock.submit.mock.callCount(),1);assert.equal(mock.submit.mock.calls[0].arguments[1].branch,'genesis');
  assert(d.textContent.includes('Pull request created'));assert.equal(savedSnapshot(h).objects.length,9);assert(![...h.storage.values.values()].some(v=>v.includes('initial-session-secret')));
 }finally{for(const [path,bytes]of original)await writeFile(resolve(dist,path),bytes);}
});
