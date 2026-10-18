import {validateAssets} from '../plugins/media/assets.mjs';
import {unbase64} from '../plugins/privacy-vault/crypto.mjs';
import {containsPrivate,referencedAssets} from '../plugins/collection-snapshot/protection.mjs';
import {resolve} from 'node:path';
import {writeFile,access,cp,mkdir,rename,rm} from 'node:fs/promises';
import {root,readJSON,readSource,writeSource} from './io.mjs';
import {upgradeCatalogs} from '../assets/js/workspace.mjs';
import {validateSnapshot} from '../assets/js/domain.mjs';
// Create a complete new source project; never overwrite the working project.
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: npm run import -- <snapshot.json> <new project directory>');
const destination=resolve(output),stage=destination+'.importing';
if(destination===resolve(root)||destination.startsWith(resolve(root)+'/'))throw Error('Choose an output directory outside the current project.');
for(const p of [destination,stage]){try{await access(p);}catch(e){if(e.code==='ENOENT')continue;throw e;}throw Error('Output already exists: '+p);}
const inputValue=await readJSON(resolve(input)),packed=inputValue.format==='watchers-public-package';
if(packed&&inputValue.version!==1)throw Error('Unsupported public package.');
const assets=await validateAssets(packed?inputValue.assets||{}:{});
const snapshot=upgradeCatalogs(validateSnapshot(packed?inputValue.snapshot:inputValue),await readJSON(resolve(root,'lang/en-US.json')));
if(containsPrivate(snapshot))throw Error('Private snapshots cannot be imported into a publishable source project. Use an encrypted vault backup.');
for(const path of referencedAssets(snapshot))if(!assets[path])throw Error('Missing image '+path+'. Export a complete public package.');
await mkdir(stage);
try {
  for(const name of ['assets','core','plugins','themes','scripts','tests','.github','README.md','package.json','.gitignore'])await cp(resolve(root,name),resolve(stage,name),{recursive:true});
  for(const name of ['examples','docs','schemas','CHANGELOG.md','.nojekyll']){try{await access(resolve(root,name));}catch(error){if(error.code==='ENOENT')continue;throw error;}await cp(resolve(root,name),resolve(stage,name),{recursive:true});}
  await mkdir(resolve(stage,'config'));await cp(resolve(root,'config/extensions.json'),resolve(stage,'config/extensions.json')); await cp(resolve(root,'config/workspace.json'),resolve(stage,'config/workspace.json'));
  const app=await readJSON(resolve(root,'config/app.json'));app.locales=Object.keys(snapshot.languages);
  await writeFile(resolve(stage,'config/app.json'),JSON.stringify(app,null,2)+'\n');
  for(const [path,a]of Object.entries(assets)){await mkdir(resolve(stage,'media'),{recursive:true});await writeFile(resolve(stage,path),unbase64(a.data));}
  await writeSource(snapshot,stage);await readSource(stage);await rename(stage,destination);
} catch(error){await rm(stage,{recursive:true,force:true});throw error;}
console.log('Validated source project created at '+destination+'. Run npm test and npm run build there, then review and commit.');
