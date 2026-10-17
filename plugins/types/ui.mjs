import {fieldPicker} from '../custom-fields/field-picker.mjs';
import {APP_VERSION,CONTRACT,VALUE_TYPES,displayName,localized,withObject,validateSnapshot,fail,safeURL} from '../collection-snapshot/domain.mjs';
import {WORKSPACE_VERSION,preferences,languageDraft,enableLanguage,newDefinition,sourceUsage,removeSource,upgradeCatalogs} from '../collection-snapshot/workspace.mjs';
import {helpers} from '../objects/ui-helpers.mjs';
export function createUI(c){
  const {el,button,field,modal,t,run,errors,render,announce,download,ensureSnapshot,commit}=c;
  const {textField,finish,readFile,disclosure,definitionLabel,labelFor,pickMany,listInput,valueControl,emptyValue}=helpers(c);
  async function manageType(original){
    let s=structuredClone(await ensureSnapshot());const m=modal(original?'type.edit':'action.newType'),form=el('form',{class:'stack'}),name=textField('editor.typeLabel',original?s.languages['en-US'].messages[original.label_key]:''),active=el('input',{type:'checkbox',checked:original?.enabled??true});name.input.required=true;
    let selected=[...(original?.suggested_fields||[])];
    const picker=fieldPicker(c,{getSnapshot:()=>s,setSnapshot:value=>{s=value;},selected:()=>selected,onSelect:id=>{if(!selected.includes(id))selected.push(id);},onRemove:id=>{selected=selected.filter(x=>x!==id);},changed:()=>m.markDirty()});
    form.append(name.node,el('p',{class:'muted small'},t('editor.englishLabel')),el('label',{class:'check-row'},active,t('type.active')),picker.node,el('p',{class:'muted small'},t('type.help')),el('button',{type:'submit',class:'primary'},t('action.apply')));form.addEventListener('input',()=>m.markDirty());
    form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{try{if(!name.input.value.trim())fail('label','type');const next=structuredClone(s),id=original?.id||'type_'+crypto.randomUUID().replaceAll('-',''),def=original?next.types.types.find(x=>x.id===id):{id,version:CONTRACT,label_key:'type.'+id,icon:'object',template:'standard'};def.enabled=active.checked;def.suggested_fields=selected;if(!original)next.types.types.push(def);for(const [locale,lang]of Object.entries(next.languages))if(locale==='en-US'||!original)lang.messages[def.label_key]=name.input.value.trim();await commit(next);await finish(m);}catch(error){errors(error,m.error);}});});m.body.append(form);
  }
return {manageType};
}
