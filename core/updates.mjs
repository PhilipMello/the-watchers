import {secureURL,compareVersions,satisfies,CORE_VERSION,EXTENSION_API} from './kernel.mjs';
export function validateFeed(feed){
 if(feed?.registry_version!=='1.0.0'||!Array.isArray(feed.extensions)||feed.extensions.length>500)throw Error('Invalid update registry');
 const seen=new Set();for(const item of feed.extensions){if(typeof item.id!=='string'||seen.has(item.id)||!['core','plugin','theme'].includes(item.type))throw Error('Invalid or duplicate update');seen.add(item.id);compareVersions(item.version,item.version);secureURL(item.package_url);if(!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Invalid package SHA-256');if(item.type!=='core'){satisfies(CORE_VERSION,item.core);satisfies(EXTENSION_API,item.api);}}
 return feed;
}
export async function checkUpdates(url,installed,{fetcher=(...args)=>globalThis.fetch(...args)}={}){
 secureURL(url);const response=await fetcher(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Update HTTP '+response.status);
 const reader=response.body?.getReader();let text='';
 if(reader){const decoder=new TextDecoder();let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024){await reader.cancel();throw Error('Registry exceeds 1 MiB');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
 else {text=await response.text();if(text.length>1024*1024)throw Error('Registry exceeds 1 MiB');}
 const feed=validateFeed(JSON.parse(text));return feed.extensions.filter(item=>installed.some(m=>m.id===item.id&&m.type===item.type&&compareVersions(item.version,m.version)>0)).map(item=>({...item,compatible:item.type==='core'||satisfies(CORE_VERSION,item.core)&&satisfies(EXTENSION_API,item.api)}));
}
