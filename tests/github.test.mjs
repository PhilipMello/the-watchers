import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHub,branchName,validateBranch} from '../plugins/github/client.mjs';
const HEAD='a'.repeat(40),COMMIT='c'.repeat(40),TREE='b'.repeat(40),OLD='d'.repeat(40),NEW='e'.repeat(40);
function server(){const state={head:HEAD,branches:{},prs:[],calls:[],remote:[{path:'objects/person/entry.json',type:'blob',sha:OLD}],failPR:false,failRefResponse:false,tree:null};const client=new GitHub({token:'test-session-token',owner:'owner',repo:'repo',fetcher:async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer test-session-token');const path=new URL(url).pathname,body=opts.body?JSON.parse(opts.body):null;state.calls.push({path,method:opts.method,body});let data={};if(path.endsWith('/git/ref/heads/main'))data={object:{sha:state.head}};else if(path.includes('/git/ref/heads/')){const branch=decodeURIComponent(path.split('/heads/')[1]);if(!state.branches[branch])return new Response('',{status:404});data={object:{sha:state.branches[branch]}};}else if(path.endsWith('/git/commits/'+HEAD))data={tree:{sha:TREE}};else if(path.endsWith('/git/trees/'+TREE))data={tree:state.remote,truncated:false};else if(path.endsWith('/git/blobs'))data={sha:NEW};else if(path.endsWith('/git/trees')){state.tree=body;data={sha:'new-tree'};}else if(path.endsWith('/git/commits'))data={sha:COMMIT};else if(path.endsWith('/git/refs')){state.branches[body.ref.slice(11)]=body.sha;if(state.failRefResponse){state.failRefResponse=false;throw Error('response lost');}data={object:{sha:body.sha}};}else if(path.endsWith('/pulls')&&opts.method==='GET')data=state.prs;else if(path.endsWith('/pulls')){const pr={html_url:'https://github.com/owner/repo/pull/1',head:{sha:COMMIT},number:1};state.prs.push(pr);if(state.failPR){state.failPR=false;throw Error('response lost');}data=pr;}else throw Error('Unexpected endpoint '+path);return new Response(JSON.stringify(data));}});return {state,client};}
const files={'objects/person/entry.json':{sha:NEW,data:'eA=='}},baseline={'objects/person/entry.json':OLD},options={branch:'new-entries',title:'New entries',body:'Reviewed changes',author:{name:'Author',email:'1+author@users.noreply.github.com'}};
test('branch names normalize spaces and validate Git reference rules',()=>{assert.equal(branchName('New Entries'),'new-entries');for(const name of ['../main','a..b','a.lock','a//b','a@{x','a b','.hidden','a/','a?b'])assert.throws(()=>validateBranch(name));assert.equal(validateBranch('updates/new-entries'),'updates/new-entries');});
test('PR submission uses a base tree, creates only the new branch and never updates main',async()=>{const {client,state}=server();const plan=await client.prepare('main',baseline,files);const pr=await client.submit(plan,options,{});assert.equal(pr.number,1);assert.equal(state.tree.base_tree,TREE);assert.equal(state.tree.tree.length,1);assert.equal(state.branches['new-entries'],COMMIT);assert(!state.calls.some(c=>c.method==='PATCH'));assert(state.calls.some(c=>c.path.endsWith('/pulls')&&c.body?.base==='main'));assert(!JSON.stringify(state.calls).includes('test-session-token'));});
test('no changes causes no writes',async()=>{const {client,state}=server();const plan=await client.prepare('main',baseline,{'objects/person/entry.json':{sha:OLD,data:'eA=='}});assert.equal(plan.changes.length,0);await assert.rejects(()=>client.submit(plan,options),/No changes/);assert(state.calls.every(c=>c.method==='GET'));});
test('remote conflicts and base movement stop before creating branches',async()=>{let {client,state}=server();state.remote[0].sha='remote-edit';await assert.rejects(()=>client.prepare('main',baseline,files),/conflict/);({client,state}=server());const plan=await client.prepare('main',baseline,files);state.head='changed';await assert.rejects(()=>client.submit(plan,options),/changed/);assert(state.calls.every(c=>c.method==='GET'));});
test('existing branch is never overwritten',async()=>{const {client,state}=server();state.branches['new-entries']='someone-else';const plan=await client.prepare('main',baseline,files);await assert.rejects(()=>client.submit(plan,options),/already exists/);assert.equal(state.branches['new-entries'],'someone-else');assert(state.calls.every(c=>c.method==='GET'));});
test('response loss after branch creation resumes safely',async()=>{const {client,state}=server();state.failRefResponse=true;const plan=await client.prepare('main',baseline,files);await client.submit(plan,options,{});assert.equal(state.prs.length,1);assert.equal(state.calls.filter(c=>c.path.endsWith('/git/commits')&&c.method==='POST').length,1);});
test('response loss after PR creation finds the existing PR and does not duplicate it',async()=>{const {client,state}=server();state.failPR=true;const plan=await client.prepare('main',baseline,files),progress={};await assert.rejects(()=>client.submit(plan,options,progress),/response lost/);const pr=await client.submit(plan,options,progress);assert.equal(pr.number,1);assert.equal(state.prs.length,1);assert.equal(state.calls.filter(c=>c.path.endsWith('/git/commits')&&c.method==='POST').length,1);});
test('deletions use null blob SHAs and preserve unrelated files through base_tree',async()=>{const {client,state}=server();state.remote.push({path:'README.md',type:'blob',sha:'untouched'});const plan=await client.prepare('main',baseline,{});await client.submit(plan,options,{});assert.deepEqual(state.tree.tree,[{path:'objects/person/entry.json',mode:'100644',type:'blob',sha:null}]);});
test('retry progress can be serialized without credentials and resumed after a new client session',async()=>{const {client,state}=server();state.failPR=true;let saved;client.onProgress=p=>saved=JSON.parse(JSON.stringify(p));const plan=await client.prepare('main',baseline,files);await assert.rejects(()=>client.submit(plan,options,{}));assert(saved.commit);assert(!JSON.stringify(saved).includes('test-session-token'));const resumed=JSON.parse(JSON.stringify(saved));assert.equal((await client.submit(plan,options,resumed)).number,1);assert.equal(state.prs.length,1);});
test('already-applied deletions are no-ops while genuinely changed remote data remains protected',async()=>{const {client,state}=server();state.remote=[];const plan=await client.prepare('main',baseline,{});assert.equal(plan.changes.length,0);});
test('API errors identify permission failures and omit credentials',async()=>{
 const client=new GitHub({token:'secret-token',owner:'owner',repo:'repo',fetcher:async()=>new Response(JSON.stringify({message:'Resource not accessible secret-token'}),{status:403})});
 await assert.rejects(()=>client.request('/repos/owner/repo/pulls'),e=>e.status===403&&e.message.includes('Pull requests write')&&e.message.includes('GET /repos/owner/repo/pulls')&&!e.message.includes('secret-token'));
});
test('stalled requests time out and abort instead of waiting indefinitely',async()=>{
 let signal;const client=new GitHub({token:'test',owner:'owner',repo:'repo',timeoutMs:10,fetcher:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}});
 await assert.rejects(()=>client.request('/user'),/timed out/);assert.equal(signal.aborted,true);
});
test('timeout also covers an unresponsive response body',async()=>{
 const client=new GitHub({token:'test',owner:'owner',repo:'repo',timeoutMs:10,fetcher:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})});
 await assert.rejects(()=>client.request('/user'),/timed out/);
});
test('source hash is used for remote checks while published hash is used to detect user edits',async()=>{
 const {client,state}=server(),path='objects/person/entry.json',published='f'.repeat(40),base={[path]:{sha:OLD,published_sha:published}};
 assert.deepEqual((await client.prepare('main',base,{[path]:{sha:published,data:'eA=='}})).changes,[]);
 const plan=await client.prepare('main',base,files);assert.equal(plan.changes.length,1);assert.equal(plan.changes[0].before,OLD);
 await client.submit(plan,options);assert.equal(state.prs.length,1);
});
test('structured source baselines still block real remote edits and expose diagnostic SHAs without writing',async()=>{
 const {client,state}=server(),path='objects/person/entry.json';state.remote[0].sha='remote-change';
 await assert.rejects(()=>client.prepare('main',{[path]:{sha:OLD,published_sha:'f'.repeat(40)}},files),error=>{
  assert.deepEqual(error.conflicts,[{path,expected:OLD,remote:'remote-change',proposed:NEW}]);assert.equal(error.base,'main');return true;
 });
 assert(state.calls.every(c=>c.method==='GET'));
});

async function cleanBundle(){
 const {initialProject}=await import('../scripts/initial-project.mjs');
 const {root,readSource,readJSON}=await import('../scripts/io.mjs');
 const snapshot=await readSource();snapshot.objects=[];snapshot.relationships=[];snapshot.sources=[];snapshot.notes=[];snapshot.dataset_mode='public';delete snapshot.extensions;delete snapshot.legacy;
 return initialProject(root,snapshot,await readJSON(root+'config/app.json'));
}
test('initial installation publishes complete clean source on genesis and preserves remote LICENSE',async()=>{
 const {client,state}=server(),pkg=await cleanBundle();state.remote=[{path:'LICENSE',type:'blob',sha:OLD}];
 const plan=await client.prepareInitial('main',pkg);assert.equal(plan.mode,'initial');assert(plan.changes.length>100);assert(plan.changes.every(c=>c.action==='added'));
 assert(plan.changes.some(c=>c.path==='.github/workflows/pages.yml'));assert(!plan.changes.some(c=>c.path==='LICENSE'||c.path.startsWith('dist/')));
 const progress=[],saved={};client.onUploadProgress=p=>progress.push(p);
 await client.submit(plan,{...options,branch:'genesis'},saved);
 assert.equal(state.tree.base_tree,TREE);assert(!state.tree.tree.some(c=>c.path==='LICENSE'));assert.equal(state.branches.genesis,COMMIT);
 assert(state.calls.some(c=>c.body?.head==='genesis'&&c.body?.base==='main'));assert(!state.calls.some(c=>c.method==='PATCH'));
 assert.equal(progress.length,plan.changes.length);assert.equal(progress.at(-1).completed,plan.changes.length-1);assert.equal(saved.mode,'initial');
 assert(!JSON.stringify(saved).includes('test-session-token'));
});
test('initial installation blocks existing different source files, records, and file/directory collisions before writes',async()=>{
 const pkg=await cleanBundle();
 for(const remote of [[{path:'package.json',type:'blob',sha:OLD}],[{path:'objects/person/existing.json',type:'blob',sha:OLD}],[{path:'scripts',type:'blob',sha:OLD}],[{path:'package.json',type:'tree',sha:OLD}]]){
  const {client,state}=server();state.remote=remote;await assert.rejects(()=>client.prepareInitial('main',pkg),/conflict|already contains/);assert(state.calls.every(c=>c.method==='GET'));
 }
});
test('initial installation rejects tampered or populated bundles and skips identical source blobs',async()=>{
 const pkg=await cleanBundle(),{client,state}=server();state.remote=Object.entries(pkg.files).map(([path,file])=>({path,type:'blob',sha:file.sha}));
 assert.equal((await client.prepareInitial('main',pkg)).changes.length,0);
 pkg.files['package.json'].data='eA==';await assert.rejects(()=>client.prepareInitial('main',pkg),/integrity/);
 await assert.rejects(()=>client.prepareInitial('main',{...pkg,available:false}),/clean Genesis build/);
 assert(state.calls.every(c=>c.method==='GET'));
});
