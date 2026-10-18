import {base64,unbase64} from '../privacy-vault/crypto.mjs';
import {referencedAssets,assetPath} from '../collection-snapshot/protection.mjs';
export const MAX_FILE=10*1024*1024,MAX_TOTAL=60*1024*1024;
export async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
export function imageKind(bytes){if(bytes[0]===137&&String.fromCharCode(...bytes.slice(1,4))==='PNG')return ['png','image/png'];if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['jpg','image/jpeg'];if(String.fromCharCode(...bytes.slice(0,3))==='GIF')return ['gif','image/gif'];if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return ['webp','image/webp'];throw Error('Use PNG, JPEG, WebP or GIF images.');}
export async function packImage(bytes){if(!bytes.length||bytes.length>MAX_FILE)throw Error('Image limit: 10 MiB.');const [ext,type]=imageKind(bytes);return {path:'media/'+await digest(bytes)+'.'+ext,asset:{type,data:base64(bytes)}};}
export async function validateAssets(assets){let total=0;for(const [path,a]of Object.entries(assets)){if(!assetPath(path)||!a||typeof a.data!=='string')throw Error('Invalid media package.');const bytes=unbase64(a.data);total+=bytes.length;const packed=await packImage(bytes);if(packed.path!==path||packed.asset.type!==a.type)throw Error('Image integrity check failed.');}if(total>MAX_TOTAL)throw Error('Media package limit: 60 MiB.');return assets;}
export async function collectAssets(snapshot,local={},fetcher=(...args)=>fetch(...args)){
 const assets={};for(const path of referencedAssets(snapshot)){if(local[path])assets[path]=local[path];else{const r=await fetcher(path);if(!r.ok)throw Error('Missing image: '+path);const bytes=new Uint8Array(await r.arrayBuffer());const packed=await packImage(bytes);if(packed.path!==path)throw Error('Image integrity check failed.');assets[path]=packed.asset;}}
 return validateAssets(assets);
}
export function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
