import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {versionAssets,versionImports} from '../scripts/build-assets.mjs';
import {validateManifest,CORE_VERSION} from '../core/kernel.mjs';
const source=await readFile(new URL('../core/kernel.mjs',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../plugins/objects/plugin.json',import.meta.url),'utf8'));
test('Genesis rejects old-era manifests and newer incompatible cores',async()=>{
 assert.equal(CORE_VERSION,'0.0.0');assert.equal(validateManifest(manifest).id,'watchers.objects');
 assert.throws(()=>validateManifest({...manifest,core:'>=0.4.5 <0.5.0'}),/Loaded core 0\.0\.0/);
 const incompatible=await import('data:text/javascript,'+encodeURIComponent(source.replace("CORE_VERSION='0.0.0'","CORE_VERSION='0.1.0'")));
 assert.throws(()=>incompatible.validateManifest(manifest),/Loaded core 0\.1\.0/);
});
test('build versions transitive imports, re-exports and literal dynamic imports',()=>{
 const code=`import {x} from './x.mjs'; export * from '../shared/y.mjs'; const z=import('./z.mjs'); const data='./data.json';`;
 const revised=versionImports(code,'abc123');for(const path of ['./x.mjs','../shared/y.mjs','./z.mjs'])assert(revised.includes(path+'?v=abc123'));assert(revised.includes("'./data.json'"));
});
test('asset revisions are deterministic and change when transitive code changes',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'watchers-assets-'));
 try{const build=async(name,text)=>{const out=join(temp,name);await mkdir(join(out,'data'),{recursive:true});await mkdir(join(out,'core'));await writeFile(join(out,'core/boot.mjs'),"import './kernel.mjs';\n");await writeFile(join(out,'core/kernel.mjs'),text);const revision=await versionAssets(out);assert((await readFile(join(out,'core/boot.mjs'),'utf8')).includes('kernel.mjs?v='+revision));return revision;};const a=await build('a','export const v=1;');assert.equal(a,await build('b','export const v=1;'));assert.notEqual(a,await build('c','export const v=2;'));}finally{await rm(temp,{recursive:true,force:true});}
});
test('dynamic plugin entry URLs inherit the kernel build revision',async()=>{
 for(const revision of ['oldbuild','newbuild']){const {Kernel}=await import(new URL('../core/kernel.mjs?v='+revision,import.meta.url));const seen=[];const k=new Kernel({importer:async url=>{seen.push(url);return {activate(){}};}});await k.boot([{...manifest,dependencies:{},directory:'plugins/objects'}],['watchers.objects'],'https://example.com/subfolder/');assert.deepEqual(seen,['https://example.com/subfolder/plugins/objects/index.mjs?v='+revision]);}
});
