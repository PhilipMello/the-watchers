import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readSource,readJSON,root} from './io.mjs';
import {exportPackage} from '../plugins/collection-snapshot/publication.mjs';
if(!process.argv[2])throw Error('Usage: npm run export -- <new public-package.json>');
const value=await exportPackage(await readSource(),await readJSON(resolve(root,'config/app.json')),{},async path=>new Response(await readFile(resolve(root,path))));
await writeFile(resolve(process.argv[2]),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
