import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readSource,writeSource,root} from '../scripts/io.mjs';
import {validateExtensionProject} from '../scripts/extension-project.mjs';
test('Genesis resets release versions without resetting API or data contracts',async()=>{
 const app=JSON.parse(await readFile(join(root,'config/app.json'),'utf8')),{manifests}=await validateExtensionProject(root);
 assert.equal(app.app_version,'0.0.0');assert.equal(app.format_version,'1.0.0');
 for(const m of manifests){assert.equal(m.version,'0.0.0');assert.equal(m.core,'>=0.0.0 <0.1.0');assert.equal(m.api,'>=1.0.0 <2.0.0');}
});
test('empty source imports and builds without optional ZIP documentation or examples',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'watchers-clean-'));
 try{const s=await readSource();s.objects=[];s.relationships=[];s.sources=[];s.notes=[];s.dataset_mode='public';delete s.extensions;delete s.legacy;
 const input=join(temp,'empty.json');await writeFile(input,JSON.stringify(s));const minimal=join(temp,'minimal');await cp(root,minimal,{recursive:true});
 for(const name of ['docs','examples','schemas','CHANGELOG.md','.nojekyll','archive'])await rm(join(minimal,name),{recursive:true,force:true});
 const project=join(temp,'imported');execFileSync(process.execPath,['scripts/import.mjs',input,project],{cwd:minimal});assert.deepEqual(await readdir(join(project,'objects')),['.gitkeep']);assert.equal((await readSource(project)).objects.length,0);
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:project});const index=JSON.parse(await readFile(join(project,'dist/data/index.json'),'utf8'));assert.deepEqual(index.objects,[]);assert.deepEqual(await readdir(join(project,'dist/objects')),[]);
 const meta=JSON.parse(await readFile(join(project,'dist/data/meta.json'),'utf8'));assert.deepEqual(meta.relationships,[]);assert.deepEqual(meta.sources,[]);assert.deepEqual(meta.notes,[]);assert.equal(meta.legacy,undefined);
 const bundle=JSON.parse(await readFile(join(project,'dist/data/initial-project.json'),'utf8'));assert.equal(bundle.available,true);
 assert(!Object.keys(bundle.files).some(p=>/^(dist|docs|archive|examples|schemas|media)\//.test(p)));assert.deepEqual(Object.keys(bundle.files).filter(p=>p.startsWith('objects/')),['objects/.gitkeep']);
 const installed=join(temp,'installed');
 for(const [path,file]of Object.entries(bundle.files)){await mkdir(dirname(join(installed,path)),{recursive:true});await writeFile(join(installed,path),Buffer.from(file.data,'base64'));}
 await writeFile(join(installed,'LICENSE'),'Existing repository license');
 execFileSync(process.execPath,['scripts/validate.mjs'],{cwd:installed});execFileSync(process.execPath,['scripts/build.mjs'],{cwd:installed});
 assert.equal((await readSource(installed)).objects.length,0);assert.equal(await readFile(join(installed,'LICENSE'),'utf8'),'Existing repository license');
 assert.deepEqual(JSON.parse(await readFile(join(installed,'dist/data/index.json'),'utf8')).objects,[]);

 }finally{await rm(temp,{recursive:true,force:true});}
});
