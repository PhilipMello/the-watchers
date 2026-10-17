// Application regression tests use an immutable demo fixture, not the user's edited collection.
// Validate the real source first, then test in an isolated checkout so CI accepts new entries.
import {cp,mkdtemp,rm,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,readSource,readJSON,writeSource} from './io.mjs';
import {upgradeCatalogs} from '../plugins/collection-snapshot/workspace.mjs';
await readSource();
const temp=await mkdtemp(join(tmpdir(),'watchers-test-')),project=join(temp,'project');
try {
 await cp(root,project,{recursive:true,filter:path=>!relative(root,path).split(/[\\/]/).some(x=>['.git','.openai','.rsync-tmp','dist','node_modules'].includes(x)||x.startsWith('.build-'))});
 for(const folder of ['objects','data','lang'])await rm(join(project,folder),{recursive:true,force:true});
 const fixture=upgradeCatalogs(await readJSON(join(root,'tests/fixtures/v0.4.0-demo.json')),await readJSON(join(root,'lang/en-US.json')));
 await writeSource(fixture,project);
 const app=await readJSON(join(project,'config/app.json'));app.locales=Object.keys(fixture.languages);
 const {writeJSON}=await import('./io.mjs');await writeJSON(join(project,'config/app.json'),app);
 const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...(await readdir(join(project,'tests'))).filter(p=>p.endsWith('.test.mjs')).map(p=>'tests/'+p)],{cwd:project,stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status??1;
} finally {await rm(temp,{recursive:true,force:true});}
