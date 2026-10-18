import {validateSnapshot,objectPath} from './domain.mjs';
import {publicSnapshot,referencedAssets} from './protection.mjs';
import {collectAssets} from '../media/assets.mjs';
import {unbase64,base64} from '../privacy-vault/crypto.mjs';
const enc=new TextEncoder();
export const json=value=>JSON.stringify(value,null,2)+'\n';
export async function gitHash(bytes){const head=enc.encode('blob '+bytes.length+'\0'),data=new Uint8Array(head.length+bytes.length);data.set(head);data.set(bytes,head.length);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',data)),x=>x.toString(16).padStart(2,'0')).join('');}
export function sourceJSON(snapshot,app){
 const s=validateSnapshot(publicSnapshot(validateSnapshot(snapshot))),{objects,types,definitions,languages,...meta}=s;
 return {'data/meta.json':json(meta),'config/type.json':json(types),'config/field.json':json(definitions),'config/app.json':json({...app,locales:Object.keys(languages)}),...Object.fromEntries(Object.entries(languages).map(([locale,v])=>['lang/'+locale+'.json',json(v)])),...Object.fromEntries(objects.map(o=>[objectPath(o),json(o)]))};
}
export async function publication(snapshot,app,localAssets={},fetcher){
 const safe=validateSnapshot(publicSnapshot(validateSnapshot(snapshot))),assets=await collectAssets(safe,localAssets,fetcher),files={};
 for(const [path,text]of Object.entries(sourceJSON(safe,app))){const bytes=enc.encode(text);files[path]={data:base64(bytes),sha:await gitHash(bytes)};}
 for(const [path,a]of Object.entries(assets))files[path]={data:a.data,sha:await gitHash(unbase64(a.data))};
 return {snapshot:safe,assets,files};
}
export function diffFiles(before,after){
 const changes=[];
 for(const path of [...new Set([...Object.keys(before),...Object.keys(after)])].sort()){
  const base=before[path],old=base?.sha||base||null,published=base?.published_sha??old,next=after[path]?.sha||after[path]||null;
  // Local editing is relative to the public build. Remote conflict checks use
  // the exact source blob that produced that build, including its formatting.
  if(published!==next)changes.push({path,before:old,after:next,action:!old?'added':!next?'deleted':'modified'});
 }
 return changes;
}
export async function exportPackage(snapshot,app,assets,fetcher){const p=await publication(snapshot,app,assets,fetcher);return {format:'watchers-public-package',version:1,snapshot:p.snapshot,assets:p.assets};}
