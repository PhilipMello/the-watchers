import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {root,readJSON} from './io.mjs';
import {migrateLegacy} from './migration.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: npm run migrate -- <v0.0.0 fixture.json> <new snapshot.json>');
const registries={types:await readJSON(resolve(root,'config/type.json')),definitions:await readJSON(resolve(root,'config/field.json')),languages:{'en-US':await readJSON(resolve(root,'lang/en-US.json'))}};
const result=migrateLegacy(await readJSON(resolve(input)),registries);
await writeFile(resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(`Migrated ${result.objects.length} objects; all original records preserved.`);
