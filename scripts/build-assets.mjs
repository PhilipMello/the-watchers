import {readFile,writeFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {files} from './io.mjs';
// Revision URLs cover the complete module graph, not just the entry script.
// Source files are untouched; this transformation only runs on the staged build.
export function versionImports(text,revision){
 return text.replace(/(['"])(\.{1,2}\/[^'"\s]+\.mjs)\1/g,(_match,quote,path)=>quote+path+'?v='+revision+quote);
}
export async function versionAssets(out){
 const paths=(await files(out)).filter(p=>['.mjs','.js','.css'].some(ext=>p.endsWith(ext))).sort();
 const hash=createHash('sha256');
 for(const path of paths){hash.update(relative(out,path).replaceAll('\\','/'));hash.update('\0');hash.update(await readFile(path));hash.update('\0');}
 const revision=hash.digest('hex').slice(0,24);
 for(const path of paths.filter(p=>p.endsWith('.mjs')))await writeFile(path,versionImports(await readFile(path,'utf8'),revision));
 await writeFile(resolve(out,'data/build-info.json'),JSON.stringify({asset_revision:revision,release:'0.0.0-genesis',codename:'Genesis'},null,2)+'\n');
 return revision;
}
