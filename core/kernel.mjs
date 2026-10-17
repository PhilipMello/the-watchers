export const CORE_VERSION='0.0.0';
export const EXTENSION_API='1.0.0';
const idPattern=/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
export const localPath=p=>typeof p==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..');
export function versionParts(v){if(typeof v!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v))throw Error('Expected a stable x.y.z version: '+v);return v.split('.').map(Number);}
export function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
// Deliberately bounded range grammar. Unsupported npm syntax fails closed.
export function satisfies(v,range){versionParts(v);if(typeof range!=='string'||!range.trim())throw Error('Missing version range');return range.trim().split(/\s+/).map(term=>{const match=/^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(term);if(!match)throw Error('Unsupported version range: '+range);const c=compareVersions(v,match[2]);return {'>=':c>=0,'<=':c<=0,'>':c>0,'<':c<0,'=':c===0}[match[1]||'='];}).every(Boolean);}
export function validateManifest(m){
 if(!m||!idPattern.test(m.id)||!['plugin','theme'].includes(m.type)||typeof m.name!=='string'||!m.name.trim()||m.manifest_version!=='1.0.0')throw Error('Invalid extension manifest');
 versionParts(m.version);if(!satisfies(CORE_VERSION,m.core)||!satisfies(EXTENSION_API,m.api))throw Error('Incompatible extension: '+m.id+'. Loaded core '+CORE_VERSION+' (required '+m.core+'); API '+EXTENSION_API+' (required '+m.api+'). Rebuild and deploy the complete project, then hard-refresh this page. Keep browser data and vault backups intact.');
 if(!Array.isArray(m.permissions)||m.permissions.some(p=>!['registry.write','hooks.use','storage.local'].includes(p)))throw Error('Unknown API permission: '+m.id);
 if(!m.dependencies||Array.isArray(m.dependencies)||typeof m.dependencies!=='object')throw Error('Invalid dependencies: '+m.id);
 for(const [id,range]of Object.entries(m.dependencies)){if(!idPattern.test(id))throw Error('Invalid dependency ID');satisfies('1.0.0',range);}
 if(m.type==='plugin'&&!localPath(m.entry))throw Error('Invalid plugin entry: '+m.id);
 if(m.type==='theme'&&(!Array.isArray(m.styles)||!m.styles.length||m.styles.some(p=>!localPath(p)||!p.endsWith('.css'))))throw Error('Invalid theme styles');
 if(m.update_url)secureURL(m.update_url);
 return m;
}
export function secureURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('Use an HTTPS URL without credentials or fragment');return u.href;}
export function activationOrder(manifests,enabled){
 const map=new Map();for(const raw of manifests){const m=validateManifest(raw);if(map.has(m.id))throw Error('Duplicate extension: '+m.id);map.set(m.id,m);}
 const selected=new Set(enabled),visiting=new Set(),visited=new Set(),result=[];
 const visit=id=>{if(visited.has(id))return;if(visiting.has(id))throw Error('Dependency cycle: '+id);const m=map.get(id);if(!m||m.type!=='plugin')throw Error('Plugin not installed: '+id);visiting.add(id);
 for(const [dep,range]of Object.entries(m.dependencies)){if(!selected.has(dep))throw Error(id+' requires enabled '+dep);if(!map.has(dep)||!satisfies(map.get(dep).version,range))throw Error('Incompatible dependency: '+dep);visit(dep);}
 visiting.delete(id);visited.add(id);result.push(m);};for(const id of selected)visit(id);return result;
}
export class Kernel {
 constructor({storage=null,prefix='watchers.extensions:',importer=url=>import(url)}={}){this.storage=storage;this.prefix=prefix;this.importer=importer;this.registries=new Map();this.hooks=new Map();this.states=new Map();this.cleanups=new Map();this.modules=new Map();this.manifests=[];}
 active(id){return this.states.get(id)?.status==='active';}
 values(registry){return [...(this.registries.get(registry)?.values()||[])].map(x=>x.value);}
 get(registry,key){return this.registries.get(registry)?.get(key)?.value;}
 context(m){
 const own=(permission)=>{if(!m.permissions.includes(permission))throw Error(m.id+' lacks '+permission);};
 return Object.freeze({id:m.id,version:CORE_VERSION,apiVersion:EXTENSION_API,
  register:(registry,key,value)=>{own('registry.write');if(!/^[a-z][\w.-]*$/.test(registry)||typeof key!=='string')throw Error('Invalid registry key');let entries=this.registries.get(registry);if(!entries)this.registries.set(registry,entries=new Map());if(entries.has(key))throw Error('Duplicate registration: '+registry+'/'+key);entries.set(key,{owner:m.id,value});return ()=>{if(entries.get(key)?.owner===m.id)entries.delete(key);};},
  get:(registry,key)=>this.get(registry,key),active:id=>this.active(id),
  on:(event,callback,{filter=false,priority=0}={})=>{own('hooks.use');if(typeof callback!=='function'||!Number.isFinite(priority))throw Error('Invalid hook');const entry={owner:m.id,callback,filter,priority},list=this.hooks.get(event)||[];list.push(entry);this.hooks.set(event,list);return ()=>this.hooks.set(event,list.filter(x=>x!==entry));},
  emit:(event,value)=>this.emit(event,value),filter:(event,value)=>this.filter(event,value),
  storage:Object.freeze({read:key=>{own('storage.local');return JSON.parse(this.storage?.getItem(this.prefix+m.id+':'+key)||'null');},write:(key,value)=>{own('storage.local');if(!this.storage)throw Error('Local storage unavailable');this.storage.setItem(this.prefix+m.id+':'+key,JSON.stringify(value));}})
 });
 }
 async emit(event,value){for(const h of [...(this.hooks.get(event)||[])].filter(x=>!x.filter).sort((a,b)=>a.priority-b.priority))await h.callback(value);}
 filterSync(event,value){let next=value;for(const h of [...(this.hooks.get(event)||[])].filter(x=>x.filter).sort((a,b)=>a.priority-b.priority)){next=h.callback(next);if(next?.then)throw Error('Async filter used in a synchronous validation pipeline');}return next;}
 async filter(event,value){let next=value;for(const h of [...(this.hooks.get(event)||[])].filter(x=>x.filter).sort((a,b)=>a.priority-b.priority))next=await h.callback(next);return next;}
 cleanup(id){for(const entries of this.registries.values())for(const [key,v]of entries)if(v.owner===id)entries.delete(key);for(const [event,hooks]of this.hooks)this.hooks.set(event,hooks.filter(x=>x.owner!==id));}
 async boot(manifests,enabled,baseURL){
 this.manifests=manifests;const ordered=activationOrder(manifests,enabled);
 for(const m of manifests)this.states.set(m.id,{status:'disabled'});
 for(const m of ordered){
  if(Object.keys(m.dependencies).some(id=>!this.active(id))){this.states.set(m.id,{status:'blocked',error:'A dependency failed to activate'});continue;}
  try{if(!localPath(m.directory))throw Error('Invalid extension directory');const url=new URL(m.directory+'/'+m.entry,baseURL);if(url.origin!==new URL(baseURL).origin)throw Error('External entry blocked');const revision=new URL(import.meta.url).searchParams.get('v');if(revision)url.searchParams.set('v',revision);const module=await this.importer(url.href);if(typeof module.activate!=='function')throw Error('Missing activate()');const dispose=await module.activate(this.context(m));this.modules.set(m.id,module);if(typeof dispose==='function')this.cleanups.set(m.id,dispose);this.states.set(m.id,{status:'active'});}
  catch(error){this.cleanup(m.id);this.states.set(m.id,{status:'failed',error:String(error.message||error)});}
 }
 return this;
 }
 async deactivate(id){const dependents=this.manifests.filter(m=>this.active(m.id)&&Object.hasOwn(m.dependencies,id));if(dependents.length)throw Error('Disable dependents first: '+dependents.map(m=>m.name).join(', '));try{await this.cleanups.get(id)?.();await this.modules.get(id)?.deactivate?.();}finally{this.cleanup(id);this.states.set(id,{status:'disabled'});this.cleanups.delete(id);this.modules.delete(id);}}
}
