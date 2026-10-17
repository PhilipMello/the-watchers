import {readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {files} from './io.mjs';
import {sourceJSON,gitHash} from '../plugins/collection-snapshot/publication.mjs';

// Package source, not the rewritten modules in dist. Collection files are
// generated separately; arbitrary data, media, and local exports are excluded.
export async function initialProject(root,snapshot,app){
 const clean=!snapshot.objects.length&&!snapshot.relationships.length&&!snapshot.sources.length&&!snapshot.notes.length&&!snapshot.extensions&&!snapshot.legacy;
 if(!clean)return {format:'watchers-initial-project',version:1,available:false};
 const contents={},add=async(path,bytes)=>{contents[path]={data:Buffer.from(bytes).toString('base64'),sha:await gitHash(bytes)};};
 const paths=['.gitignore','README.md','package.json','config/extensions.json','config/workspace.json'];
 for(const dir of ['.github','assets','core','plugins','themes','scripts','tests'])for(const file of await files(resolve(root,dir))){
  const path=relative(root,file).replaceAll('\\','/');
  if(path.split('/').some(part=>['node_modules','__pycache__','.DS_Store'].includes(part))||/\.(tmp|log)$/.test(path))continue;
  paths.push(path);
 }
 for(const path of paths.sort())await add(path,new Uint8Array(await readFile(resolve(root,path))));
 for(const [path,text]of Object.entries(sourceJSON(snapshot,app)))await add(path,new TextEncoder().encode(text));
 await add('objects/.gitkeep',new Uint8Array());
 return {format:'watchers-initial-project',version:1,available:true,files:contents};
}
