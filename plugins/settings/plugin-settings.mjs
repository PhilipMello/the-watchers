export function registerSettings(api,{name,scope='local',fields=[],action,actionLabel}){
 const defaults=Object.fromEntries(fields.map(f=>[f.key,f.default]));
 const validate=value=>{const result={};for(const f of fields){const v=value[f.key]??f.default;if(f.type==='boolean'){if(typeof v!=='boolean')throw Error('Invalid setting: '+f.label);}else if(f.type==='number'){if(!Number.isFinite(v)||v<(f.min??0)||v>(f.max??100000))throw Error('Invalid setting: '+f.label);}else if(f.type==='select'){if(!f.options?.some(o=>o.value===v))throw Error('Invalid setting: '+f.label);}else if(typeof v!=='string'||v.length>2000)throw Error('Invalid setting: '+f.label);result[f.key]=v;}return result;};
 api.register('plugin.settings',api.id,{id:api.id,name,scope,fields,defaults,action,actionLabel,validate,read:()=>({...defaults,...(scope==='local'?api.storage.read('settings')||{}:{})}),write:v=>api.storage.write('settings',validate(v))});
}
export function createSettingsUI(c){
 const {el,button,t,field,modal,ensureSnapshot,commit,render}=c;
 async function pluginSettings(main,id){
 const descriptors=c.kernel.values('plugin.settings');main.append(el('h2',{},t('settings.plugins')));
 if(!id){main.append(el('div',{class:'workspace-grid'},descriptors.map(d=>el('section',{class:'panel'},el('h3',{},d.name),el('p',{class:'muted'},d.scope==='project'?t('settings.projectScope'):t('settings.localScope')),el('a',{class:'button',href:'#settings/plugin/'+d.id},t('kernel.settings'))))));return;}
 const d=descriptors.find(d=>d.id===id);if(!d){main.append(el('p',{},t('extension.unavailable')));return;}
 const s=await ensureSnapshot(),current={...d.defaults,...(d.scope==='project'?s.extensions?.settings?.[id]||{}:d.read())},inputs={};
 const form=el('form',{class:'panel stack'}),notice=el('p',{role:'status'});form.append(el('h3',{},d.name),el('p',{class:'muted'},t(d.scope==='project'?'settings.projectScope':'settings.localScope')));
 for(const f of d.fields){const input=f.type==='select'?el('select',{},f.options.map(o=>el('option',{value:o.value},o.label))):el('input',{type:f.type==='boolean'?'checkbox':f.type==='number'?'number':'text',min:f.min,max:f.max});if(f.type==='boolean')input.checked=current[f.key];else input.value=current[f.key];inputs[f.key]=input;form.append(el('label',{class:f.type==='boolean'?'check-row':undefined},el('span',{},f.label),input));}
 if(d.fields.length)form.append(el('button',{type:'submit',class:'primary'},t('action.save')));
 form.addEventListener('submit',e=>{e.preventDefault();c.run(async()=>{try{const value=d.validate(Object.fromEntries(d.fields.map(f=>[f.key,f.type==='boolean'?inputs[f.key].checked:f.type==='number'?Number(inputs[f.key].value):inputs[f.key].value.trim()])));if(d.scope==='project'){const next=structuredClone(await ensureSnapshot());next.extensions??={format_version:'1.0.0'};next.extensions.settings??={};next.extensions.settings[id]=value;await commit(next);}else d.write(value);notice.textContent=t('workspace.saved');}catch(e){notice.textContent=e.message;}});});
 if(d.action&&c.actions[d.action])form.append(button(d.actionLabel||(d.action==='submitGitHub'?'github.submit':d.action==='vaultPanel'?'vault.title':'badges.manage'),c.actions[d.action]));
 form.append(notice);main.append(form);
 }
 return {pluginSettings};
}
