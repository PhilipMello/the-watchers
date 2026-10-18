import {activationOrder,secureURL} from './kernel.mjs';
export function validateSettings(value,manifests){
 if(value?.format_version!=='1.0.0'||!Array.isArray(value.enabled)||new Set(value.enabled).size!==value.enabled.length||!value.updates||typeof value.updates!=='object')throw Error('Invalid extension preferences');
 activationOrder(manifests,value.enabled);
 if(value.theme!==null&&!manifests.some(m=>m.type==='theme'&&m.id===value.theme))throw Error('Theme not installed');
 for(const key of ['core_registry_url','plugin_registry_url','theme_registry_url']){if(typeof value.updates[key]!=='string')throw Error('Missing update setting');if(value.updates[key])secureURL(value.updates[key]);}
 if(!value.updates.overrides||typeof value.updates.overrides!=='object'||Array.isArray(value.updates.overrides))throw Error('Invalid update overrides');
 for(const [id,url]of Object.entries(value.updates.overrides)){if(!manifests.some(m=>m.id===id))throw Error('Unknown extension override');if(url)secureURL(url);}
 return structuredClone(value);
}
export function withEnabled(settings,id,enabled,manifests){
 const next=structuredClone(settings),selected=new Set(next.enabled),byId=new Map(manifests.map(m=>[m.id,m]));
 const add=(id,seen=new Set())=>{if(seen.has(id))throw Error('Dependency cycle');seen.add(id);const m=byId.get(id);if(!m||m.type!=='plugin')throw Error('Unknown plugin');for(const dep of Object.keys(m.dependencies))add(dep,new Set(seen));selected.add(id);};
 if(enabled)add(id);else {const dependent=manifests.filter(m=>selected.has(m.id)&&Object.hasOwn(m.dependencies,id));if(dependent.length)throw Error('Disable these plugins first: '+dependent.map(m=>m.name).join(', '));selected.delete(id);}
 next.enabled=[...selected];return validateSettings(next,manifests);
}
