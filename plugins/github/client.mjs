import {unbase64} from '../privacy-vault/crypto.mjs';
import {diffFiles,gitHash} from '../collection-snapshot/publication.mjs';
export function branchName(label){return label.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9/-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);}
export function validateBranch(name){if(typeof name!=='string'||!name||name.startsWith('-')||name==='HEAD'||name.length>200||/[\s~^:?*\[\\\x00-\x1f\x7f]/.test(name)||name.includes('..')||name.includes('@{')||name==='@'||name.endsWith('.')||name.split('/').some(x=>!x||x.startsWith('.')||x.endsWith('.lock')))throw Error('Invalid Git branch name.');return name;}
export class GitHub {
 constructor({token,owner,repo,fetcher=(...args)=>fetch(...args),timeoutMs=30000}){if(!/^[\w.-]+$/.test(owner)||! /^[\w.-]+$/.test(repo))throw Error('Set repository owner and name.');this.token=token;this.owner=owner;this.repo=repo;this.fetcher=fetcher;this.timeoutMs=timeoutMs;this.path='/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo);}
 async request(path,{method='GET',body,missing=false}={}){
 const controller=new AbortController();let timer;
 const clean=value=>String(value).split(this.token).join('[redacted]').slice(0,500);
 const operation=(async()=>{
  let r;try{r=await this.fetcher('https://api.github.com'+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store',redirect:'error'});}catch(error){throw Error('GitHub network request failed ('+method+' '+path.split('?')[0]+'). '+clean(error.message||error)+' Check your connection and whether the browser blocks api.github.com. Retry to check any unfinished submission.');}
  if(missing&&r.status===404)return null;
  if(!r.ok){let detail='';try{detail=clean((await r.json()).message||'');}catch{}
   const hints={401:'Token invalid or expired. Enter a valid token and reconnect.',403:'Check Contents and Pull requests write permissions, organization approval and rate limits. Initial installation also requires Workflows write permission.',404:'Check repository owner, repository name, destination branch and token repository access.',422:'Check the branch, commit author and pull request fields.'};
   const e=Error('GitHub HTTP '+r.status+' ('+method+' '+path.split('?')[0]+'). '+(detail?detail+' ':'')+(hints[r.status]||'Review the repository rules and retry.')+' Your local work is unchanged.');e.status=r.status;throw e;
  }
  return r.status===204?null:await r.json();
 })();
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('GitHub request timed out after '+this.timeoutMs/1000+' seconds ('+method+' '+path.split('?')[0]+'). Your local work is unchanged. Retry to check any unfinished submission.'));controller.abort();},this.timeoutMs);});
 try{return await Promise.race([operation,timeout]);}finally{clearTimeout(timer);}
 }
 async identity(){const user=await this.request('/user');let emails=[];try{emails=await this.request('/user/emails');}catch{}return {name:user.name||user.login,emails:[...new Set([user.email,...emails.filter(e=>e.verified).map(e=>e.email),user.id+'+'+user.login+'@users.noreply.github.com'].filter(Boolean))]};}
 async prepareInitial(base,pkg){
 if(pkg?.format!=='watchers-initial-project'||pkg.version!==1||!pkg.available||!pkg.files)throw Error('Initial installation requires a clean Genesis build. Extract the clean package and serve its dist folder. Your browser drafts are not included.');
 const files=pkg.files;
 for(const required of ['package.json','scripts/build.mjs','.github/workflows/pages.yml','data/meta.json','objects/.gitkeep'])if(!files[required])throw Error('Incomplete initial project: '+required);
 for(const [path,file]of Object.entries(files)){
  if(path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..')||/^(LICENSE(?:\..*)?|COPYING|dist|docs|archive|media)(\/|$)/.test(path)||path.startsWith('objects/')&&path!=='objects/.gitkeep')throw Error('Unexpected initial project path: '+path);
  if(await gitHash(unbase64(file.data))!==file.sha)throw Error('Initial project integrity failed: '+path);
 }
 const meta=JSON.parse(new TextDecoder().decode(unbase64(files['data/meta.json'].data)));
 if(meta.relationships?.length||meta.sources?.length||meta.notes?.length||meta.extensions||meta.legacy)throw Error('Initial project is not clean.');
 const plan=await this.prepare(base,{},files);
 if(plan.remotePaths.some(path=>path.startsWith('objects/')&&path!=='objects/.gitkeep'||path.startsWith('media/')))throw Error('The destination already contains collection records or media. Use a new repository for clean installation. No files were overwritten.');
 return {...plan,mode:'initial'};
 }
 async prepare(base,baseline,files){validateBranch(base);const ref=await this.request(this.path+'/git/ref/heads/'+encodeURIComponent(base));const commit=await this.request(this.path+'/git/commits/'+ref.object.sha);const tree=await this.request(this.path+'/git/trees/'+commit.tree.sha+'?recursive=1');if(tree.truncated)throw Error('Repository tree is too large for safe publication.');const collisions=Object.keys(files).filter(path=>tree.tree.some(entry=>(entry.path===path&&entry.type!=='blob')||(entry.type!=='tree'&&path.startsWith(entry.path+'/'))));if(collisions.length)throw Error('Repository path conflicts: '+collisions.join(', ')+'. No files were overwritten.');const remote=Object.fromEntries(tree.tree.filter(x=>x.type==='blob').map(x=>[x.path,x.sha]));const changes=diffFiles(baseline,files).filter(c=>(remote[c.path]||null)!==c.after);
 const conflicts=changes.filter(c=>(remote[c.path]||null)!==c.before);if(conflicts.length){
  const error=Error('Remote changes conflict with this workspace: '+conflicts.map(c=>c.path).join(', ')+'. The repository does not match the source base of this build. No files were overwritten. Export your local changes before updating the deployed project and reviewing the differences.');
  error.conflicts=conflicts.map(c=>({path:c.path,expected:c.before,remote:remote[c.path]||null,proposed:c.after}));error.base=base;throw error;
 }
 return {base,head:ref.object.sha,tree:commit.tree.sha,changes,files,remotePaths:tree.tree.filter(x=>x.type!=='tree').map(x=>x.path)};}
 async submit(plan,{branch,title,body,author,draft=false},state={}){
 validateBranch(branch);if(branch===plan.base)throw Error('Choose a new branch, different from the destination.');if(!title.trim()||!author.name.trim()||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author.email))throw Error('Enter a title, author name and valid email.');if(!plan.changes.length)throw Error('No changes to submit.');
 const key=JSON.stringify([this.owner,this.repo,plan.head,branch,plan.changes]);if(state.commit&&state.key&&state.key!==key)throw Error('An unfinished submission exists. Resume it before changing the request.');state.key=key;
 if(state.pr)return state.pr;
 const latest=await this.request(this.path+'/git/ref/heads/'+encodeURIComponent(plan.base));if(latest.object.sha!==plan.head&&!state.commit)throw Error('Destination branch changed. Review changes again.');
 let existing=await this.request(this.path+'/git/ref/heads/'+encodeURIComponent(branch),{missing:true});
 if(existing&&existing.object.sha!==state.commit)throw Error('This branch already exists. Choose another name.');
 if(!state.commit){const tree=[];for(const change of plan.changes){await this.onUploadProgress?.({completed:tree.length,total:plan.changes.length,path:change.path});let sha=null;if(change.after){const blob=await this.request(this.path+'/git/blobs',{method:'POST',body:{content:plan.files[change.path].data,encoding:'base64'}});sha=blob.sha;}tree.push({path:change.path,mode:'100644',type:'blob',sha});}
 const newTree=await this.request(this.path+'/git/trees',{method:'POST',body:{base_tree:plan.tree,tree}});const commit=await this.request(this.path+'/git/commits',{method:'POST',body:{message:title,tree:newTree.sha,parents:[plan.head],author}});state.commit=commit.sha;state.branch=branch;state.options={branch,title,body,author,draft};state.mode=plan.mode||'collection';await this.onProgress?.(state);
 }
 if(!existing){try{await this.request(this.path+'/git/refs',{method:'POST',body:{ref:'refs/heads/'+branch,sha:state.commit}});}catch(e){existing=await this.request(this.path+'/git/ref/heads/'+encodeURIComponent(branch),{missing:true});if(existing?.object.sha!==state.commit)throw e;}}
 const prs=await this.request(this.path+'/pulls?state=all&head='+encodeURIComponent(this.owner+':'+branch)+'&base='+encodeURIComponent(plan.base));
 if(prs.length){if(prs[0].head?.sha!==state.commit)throw Error('Existing PR does not match this submission.');state.pr=prs[0];await this.onProgress?.(state);return state.pr;}
 state.pr=await this.request(this.path+'/pulls',{method:'POST',body:{head:branch,base:plan.base,title,body,draft}});await this.onProgress?.(state);return state.pr;
 }
}
