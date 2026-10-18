import {initialProject} from './initial-project.mjs';
import {versionAssets} from './build-assets.mjs';
import {entryPresentation} from '../plugins/objects/presentation.mjs';
import {publicSnapshot,referencedAssets} from '../plugins/collection-snapshot/protection.mjs';
import {sourceJSON,gitHash} from '../plugins/collection-snapshot/publication.mjs';
import {packImage} from '../plugins/media/assets.mjs';
import {validateExtensionProject} from './extension-project.mjs';
import {readFile,writeFile,cp,mkdir,rm,mkdtemp,rename} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {preferences,languageDraft} from '../assets/js/workspace.mjs';
import {root,readSource,readJSON,writeJSON,files} from './io.mjs';
import {APP_VERSION,CONTRACT,validateSnapshot,displayName,objectPath,fail} from '../assets/js/domain.mjs';
const source=await readSource(),s=validateSnapshot(publicSnapshot(source)),app=await readJSON(resolve(root,'config/app.json'));
if(app.format_version!==CONTRACT||app.app_version!==APP_VERSION||app.default_locale!=='en-US'||!app.locales.includes('en-US')||app.locales.some(l=>!s.languages[l])||Object.values(app.contracts).some(v=>v!==CONTRACT))fail('version','app');
if(!/^[a-z][a-z0-9-]*$/.test(app.theme))fail('invalid','theme');
const theme=await readJSON(resolve(root,`themes/${app.theme}/theme.json`));
if(theme.format_version!==CONTRACT||theme.ui_contract!==CONTRACT||theme.id!==app.theme||JSON.stringify(theme.styles)!==JSON.stringify(['tokens.css','components.css']))fail('version','theme');
const workspace=await readJSON(resolve(root,'config/workspace.json'));
preferences(workspace.defaults);
if(workspace.format_version!=='1.0.0'||!Array.isArray(workspace.sections))fail('invalid','workspace');
const routes=['architecture','sources','relationships','settings/languages'];
for(const section of workspace.sections)if(!/^[a-z][a-z0-9_-]*$/.test(section.id)||!routes.includes(section.route)||typeof s.languages['en-US'].messages[section.label_key]!=='string'||typeof s.languages['en-US'].messages[section.description_key]!=='string')fail('invalid','workspace.sections');
if(new Set(workspace.sections.map(x=>x.id)).size!==workspace.sections.length)fail('duplicate','workspace.sections');
for(const catalog of Object.values(s.languages)){const check=languageDraft(catalog,s.languages['en-US']);if(check.missing.length||check.invalid.length)fail('translation','language',{count:check.missing.length+check.invalid.length});}
if(JSON.stringify([...app.locales].sort())!==JSON.stringify(Object.keys(s.languages).sort()))fail('invalid','app.locales');
await validateExtensionProject(root);
const out=await mkdtemp(resolve(root,'.build-'));
try {
for(const name of ['assets','core','plugins','themes'])await cp(resolve(root,name),resolve(out,name),{recursive:true});
await mkdir(resolve(out,'data'));
// Keep the exact repository-source hash separate from the public build hash.
// Formatting and public projection may change the bytes without any user edit.
const publicFiles=sourceJSON(s,app),sourceHashes={};
for(const [path,text]of Object.entries(publicFiles)){await mkdir(resolve(out,path,'..'),{recursive:true});await writeFile(resolve(out,path),text);sourceHashes[path]={sha:await gitHash(new Uint8Array(await readFile(resolve(root,path)))),published_sha:await gitHash(new TextEncoder().encode(text))};}
// Only fixed non-data configuration files may be copied into the public build.
for(const path of ['config/extensions.json','config/workspace.json'])await cp(resolve(root,path),resolve(out,path));
await mkdir(resolve(out,'objects'),{recursive:true});
for(const path of referencedAssets(s)){const bytes=new Uint8Array(await readFile(resolve(root,path)));const packed=await packImage(bytes);if(packed.path!==path)throw Error('Image integrity failed: '+path);await mkdir(resolve(out,'media'),{recursive:true});await writeFile(resolve(out,path),bytes);sourceHashes[path]=await gitHash(bytes);}
await writeJSON(resolve(out,'data/source-hashes.json'),sourceHashes);
await writeJSON(resolve(out,'data/initial-project.json'),await initialProject(root,source,app));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rows=[];
for(const o of s.objects) {
  const path=objectPath(o),text=o.fields.filter(f=>!f.value_type.startsWith('reference')&&!['hidden','masked'].includes(f.presentation)&&!['image','gallery'].includes(f.value_type)).map(f=>Array.isArray(f.value)?f.value.join(' '):String(f.value)).join(' ');
  rows.push({...entryPresentation(o,s.relationships),id:o.id,type:o.type,name:displayName(o),field_count:o.fields.length,search:text.toLocaleLowerCase('en-US'),path,sha256:hash(await readFile(resolve(out,path)))});
}
await writeJSON(resolve(out,'data/index.json'),{format_version:CONTRACT,objects:rows});
const assetRevision=await versionAssets(out);
const messages=s.languages['en-US'].messages;
const esc=x=>x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bootMessages=JSON.stringify(Object.fromEntries(Object.entries(messages).filter(([key])=>key.startsWith('error.')))).replaceAll('<','\\u003c');
const html=`<!doctype html>
<html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(messages['app.title'])}</title><meta name="description" content="${esc(messages['app.tagline'])}"><link rel="icon" href="assets/favicon.svg"><link rel="stylesheet" href="assets/css/core.css?v=${assetRevision}"><link rel="stylesheet" href="core/shell.css?v=${assetRevision}"></head>
<body aria-busy="true"><div id="boot-loading" class="boot-loading" role="status" aria-live="polite"><div class="loading-eye" aria-hidden="true"><svg viewBox="0 0 120 80" fill="none"><path d="M8 40C30 6 90 6 112 40C90 74 30 74 8 40Z" stroke="#d5f7ff" stroke-width="2"/><circle cx="60" cy="40" r="22" stroke="#2bddff" stroke-width="5"/><circle cx="60" cy="40" r="10" fill="#090b19"/><circle cx="66" cy="33" r="4" fill="white"/></svg></div><div class="loading-brand"><strong>THE WATCHERS</strong><p>Loading your collection…</p></div></div><a class="skip" href="#main">${esc(messages['nav.skip'])}</a><div id="app"><main id="main" tabindex="-1"><h1>${esc(messages['app.title'])}</h1><p>${esc(messages['status.loading'])}</p></main></div><section id="boot-error" role="alert" tabindex="-1" class="panel error" hidden><h1>${esc(messages['app.title'])}</h1><p>${esc(messages['status.failure'])}</p><pre id="boot-details"></pre></section><noscript><style>#boot-loading{display:none}</style>${esc(messages['status.noscript'])}</noscript><script src="assets/js/loading.js?v=${assetRevision}"></script><script id="boot-messages" type="application/json">${bootMessages}</script><script type="module" src="core/boot.mjs?v=${assetRevision}"></script></body></html>\n`;
await writeFile(resolve(out,'index.html'),html);
await writeFile(resolve(root,'index.html'),`<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(messages['app.title'])}</title></head><body><main><h1>${esc(messages['app.title'])}</h1><p>${esc(messages['status.sourceRoot'])}</p><a href="./dist/">${esc(messages['action.openBuild'])}</a></main></body></html>\n`);
await writeFile(resolve(out,'.nojekyll'),'\n');
const entries={};for(const path of await files(out))entries[relative(out,path).replaceAll('\\','/')]=hash(await readFile(path));
const revision=hash(JSON.stringify(entries));await writeJSON(resolve(out,'data/manifest.json'),{format_version:CONTRACT,app_version:APP_VERSION,revision,files:entries});
await rm(resolve(root,'dist'),{recursive:true,force:true});await rename(out,resolve(root,'dist'));
console.log(`Built Genesis ${APP_VERSION}: ${rows.length} objects, ${Object.keys(entries).length} files, revision ${revision.slice(0,12)}.`);

} finally {await rm(out,{recursive:true,force:true});}
