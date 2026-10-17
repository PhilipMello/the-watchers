import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSnapshot,objectPath,CONTRACT} from '../assets/js/domain.mjs';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
export async function writeJSON(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}
export async function files(dir) {const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.rsync-tmp')continue;const p=resolve(dir,e.name);if(e.isDirectory())out.push(...await files(p));else if(e.isFile())out.push(p);else throw Error('Unsupported filesystem entry: '+p);}return out.sort();}
export async function readSource(dir=root) {
  const meta=await readJSON(resolve(dir,'data/meta.json'));
  const s={...meta,types:await readJSON(resolve(dir,'config/type.json')),definitions:await readJSON(resolve(dir,'config/field.json')),languages:{},objects:[]};
  for(const path of await files(resolve(dir,'lang')))if(path.endsWith('.json')){const lang=await readJSON(path);s.languages[lang.locale]=lang;}
  for(const path of await files(resolve(dir,'objects'))) {
    if(path===resolve(dir,'objects/.gitkeep'))continue;
    if(!path.endsWith('.json'))throw Error('Unexpected object file: '+path);
    const o=await readJSON(path);if(path!==resolve(dir,objectPath(o)))throw Error('Noncanonical object path: '+path);s.objects.push(o);
  }
  return validateSnapshot(s);
}
// Write into a new directory only. The caller validates and performs the final swap.
export async function writeSource(s,dir) {
  validateSnapshot(s);await mkdir(resolve(dir,'objects'),{recursive:true});
  const {objects,types,definitions,languages,...meta}=s;
  if(!objects.length)await writeFile(resolve(dir,'objects/.gitkeep'),'');
  await writeJSON(resolve(dir,'data/meta.json'),meta);
  await writeJSON(resolve(dir,'config/type.json'),types);await writeJSON(resolve(dir,'config/field.json'),definitions);
  for(const [locale,lang]of Object.entries(languages))await writeJSON(resolve(dir,`lang/${locale}.json`),lang);
  for(const o of objects)await writeJSON(resolve(dir,objectPath(o)),o);
}
