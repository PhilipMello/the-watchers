import {APP_VERSION,CONTRACT,validateSnapshot,objectPath,fail} from './domain.mjs';
export class Repository {
  // Browser fetch requires the global receiver. Never invoke the native function
  // as a method of this repository; injected adapters remain supported.
  constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;this.cache=new Map();}
  async raw(path){
    let response;
    try {response=await this.fetcher(path,{cache:'no-store'});}
    catch(error){fail('network',path,{cause:String(error?.message||error)});}
    if(!response.ok)fail('http',path,{status:response.status});
    try{return new Uint8Array(await response.arrayBuffer());}
    catch(error){fail('network',path,{cause:String(error?.message||error)});}
  }
  async json(path){
    if(!this.manifest.files[path])fail('integrity',path);
    const bytes=await this.raw(path),digest=await crypto.subtle.digest('SHA-256',bytes),actual=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    if(actual!==this.manifest.files[path])fail('integrity',path);
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('json',path);}
  }
  async open(){
    try{this.manifest=JSON.parse(new TextDecoder().decode(await this.raw('data/manifest.json')));}catch(e){if(e.issues)throw e;fail('json','manifest');}
    if(this.manifest.format_version!==CONTRACT||this.manifest.app_version!==APP_VERSION)fail('version','manifest');
    const [app,index,types,definitions,base]=await Promise.all(['config/app.json','data/index.json','config/type.json','config/field.json','lang/en-US.json'].map(p=>this.json(p)));
    this.app=app;this.index=index;this.types=types;this.definitions=definitions;this.languages={'en-US':base};
    if(index.format_version!==CONTRACT||app.format_version!==CONTRACT)fail('version','index');
    for(const row of index.objects)if(row.path!==objectPath(row)||row.sha256!==this.manifest.files[row.path])fail('integrity','index');
    for(const locale of app.locales)if(locale!=='en-US')this.languages[locale]=await this.json(`lang/${locale}.json`);
    return this;
  }
  async object(id){
    if(this.cache.has(id))return this.cache.get(id);
    const row=this.index.objects.find(o=>o.id===id);if(!row)fail('notFound','object');
    const object=await this.json(row.path);if(object.id!==row.id||object.type!==row.type)fail('integrity',row.path);this.cache.set(id,object);return object;
  }
  async metadata(){return this.meta??=(await this.json('data/meta.json'));}
  async snapshot(){const meta=await this.metadata();const objects=await Promise.all(this.index.objects.map(o=>this.object(o.id)));return validateSnapshot({...meta,types:this.types,definitions:this.definitions,languages:this.languages,objects});}
}
