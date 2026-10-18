import {readFile,writeFile,cp,access,mkdir,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateManifest} from '../core/kernel.mjs';
import {withEnabled} from '../core/config.mjs';
import {validateExtensionProject,noLinks} from './extension-project.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),file=resolve(root,'config/extensions.json');
const [command='list',arg]=process.argv.slice(2);
try{
 let {config,manifests,settings}=await validateExtensionProject(root);
 if(command==='list'){for(const m of manifests)console.log(`${m.id} ${m.version} ${settings.enabled.includes(m.id)?'enabled':m.type==='theme'&&settings.theme===m.id?'selected':'disabled'}`);}
 else if(['enable','disable','bare'].includes(command)){
  settings=command==='bare'?{...settings,enabled:[],theme:null}:withEnabled(settings,arg,command==='enable',manifests);
  for(const item of config.extensions)item.enabled=settings.enabled.includes(manifests.find(m=>m.manifest_path===item.manifest).id);config.theme=settings.theme;
  await writeFile(file,JSON.stringify(config,null,2)+'\n');console.log('Configuration saved. Run npm run build.');
 }else if(command==='install'){
  if(!arg)throw Error('Provide an extracted, trusted extension folder.');const source=resolve(arg);await noLinks(source);
  let filename='plugin.json';try{await access(resolve(source,filename));}catch{filename='extension.json';}
  const m=validateManifest(JSON.parse(await readFile(resolve(source,filename),'utf8')));if(manifests.some(x=>x.id===m.id))throw Error('Already installed. Back up and update the existing folder manually.');
  const target=resolve(root,m.type==='theme'?'themes':'plugins',m.id),path=(m.type==='theme'?'themes':'plugins')+'/'+m.id+'/'+filename;
  let exists=true;try{await access(target);}catch{exists=false;}if(exists)throw Error('Destination already exists');
  const previous=await readFile(file,'utf8');try{await mkdir(dirname(target),{recursive:true});await cp(source,target,{recursive:true,errorOnExist:true,force:false});config.extensions.push({manifest:path,enabled:false});await writeFile(file,JSON.stringify(config,null,2)+'\n');await validateExtensionProject(root);}catch(error){await writeFile(file,previous);await rm(target,{recursive:true,force:true});throw error;}
  console.log('Installed disabled: '+m.id+'. Review the code, enable it, then run npm run build.');
 }else throw Error('Usage: npm run extensions -- list | install FOLDER | enable ID | disable ID | bare');
}catch(error){console.error(error.message);process.exitCode=1;}
