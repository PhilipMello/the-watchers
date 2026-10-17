import {readFile,lstat,readdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {validateManifest,activationOrder,localPath} from '../core/kernel.mjs';
import {validateSettings} from '../core/config.mjs';
export async function noLinks(path){const stat=await lstat(path);if(stat.isSymbolicLink())throw Error('Symlinks are not supported: '+path);if(stat.isDirectory())for(const name of await readdir(path))await noLinks(resolve(path,name));else if(!stat.isFile())throw Error('Unsupported filesystem entry');}
export async function validateExtensionProject(root){
 const config=JSON.parse(await readFile(resolve(root,'config/extensions.json'),'utf8'));
 if(config.format_version!=='1.0.0'||config.api_version!=='1.0.0'||!Array.isArray(config.extensions))throw Error('Invalid extension config');
 const manifests=[];
 for(const item of config.extensions){if(!localPath(item.manifest)||! /^(plugins|themes)\//.test(item.manifest)||typeof item.enabled!=='boolean')throw Error('Invalid extension manifest path');const path=resolve(root,item.manifest),directory=dirname(path);await noLinks(directory);const m=validateManifest(JSON.parse(await readFile(path,'utf8')));if(m.type==='theme'&&item.enabled)throw Error('Theme selection uses config.theme, not enabled');for(const entry of m.type==='plugin'?[m.entry]:m.styles){const file=resolve(directory,entry);if(!(await lstat(file)).isFile())throw Error('Missing extension entry');}manifests.push({...m,directory:relative(root,directory).replaceAll('\\','/'),manifest_path:item.manifest});}
 const settings={format_version:'1.0.0',enabled:config.extensions.filter(x=>x.enabled).map(x=>manifests.find(m=>m.manifest_path===x.manifest).id),theme:config.theme,updates:config.updates};validateSettings(settings,manifests);activationOrder(manifests,settings.enabled);return {config,manifests,settings};
}
