import {VALUE_TYPES} from '../collection-snapshot/domain.mjs';
import {newDefinition,availableFieldKey} from '../collection-snapshot/workspace.mjs';
import {fieldPicker} from './field-picker.mjs';
import {helpers} from '../objects/ui-helpers.mjs';
export function fieldLibrary(c){
 const {el,t,button,modal,field,ensureSnapshot,commit,render,errors}=c;
 async function manageFields(){
  let s=structuredClone(await ensureSnapshot());const m=modal('fieldPicker.library'),form=el('form',{class:'stack'}),list=el('div',{class:'stack'});
  const paint=()=>list.replaceChildren(...s.definitions.fields.map(d=>el('div',{class:'panel row'},el('strong',{},s.languages['en-US'].messages[d.label_key]),el('code',{},d.label_key),el('span',{},d.value_type),button('action.edit',()=>edit(d)))));
  const picker=fieldPicker(c,{getSnapshot:()=>s,setSnapshot:value=>{s=value;},selected:()=>s.definitions.fields.map(d=>d.id),onSelect:paint,changed:()=>m.markDirty()});
  function edit(original){
   const e=modal('fields.configure'),f=el('form',{class:'stack'}),name=el('input',{value:original?s.languages['en-US'].messages[original.label_key]:'',required:true,maxlength:100}),kind=el('select',{},VALUE_TYPES.map(value=>el('option',{value},t('valueType.'+value)))),mode=el('select',{},el('option',{value:'auto'},t('fieldKey.auto')),el('option',{value:'manual'},t('fieldKey.manual'))),key=el('input',{value:original?.label_key||'',placeholder:'field.passport'}),options=el('div'),format=el('select',{},el('option',{value:'number'},t('fieldFormat.number')),el('option',{value:'year'},t('fieldFormat.year')));
   kind.value=original?.value_type||'text';format.value=original?.display_format||'number';const used=original&&s.objects.some(o=>o.fields.some(f=>f.definition_id===original.id));kind.disabled=!!used;mode.disabled=!!original;
   let choices=[...(original?.rules?.options||[])],targets=[...(original?.rules?.target_types||[])];
   const min=el('input',{type:'number',value:original?.rules?.min??''}),max=el('input',{type:'number',value:original?.rules?.max??''}),pattern=el('input',{value:original?.rules?.pattern||''});
   const updateKey=()=>{key.readOnly=!!original||mode.value==='auto';if(!original&&mode.value==='auto')key.value=availableFieldKey(s,name.value||'custom');};mode.addEventListener('change',updateKey);name.addEventListener('input',updateKey);updateKey();
   const draw=()=>{options.replaceChildren();if(['single-select','multi-select'].includes(kind.value))options.append(field('editor.options',helpers(c).listInput(choices,value=>{choices=value;})));if(['reference','reference-list'].includes(kind.value))options.append(helpers(c).pickMany(t('fields.targetTypes'),s.types.types.map(x=>({id:x.id,label:s.languages['en-US'].messages[x.label_key]})),targets,value=>{targets=value;}));if(['integer','decimal'].includes(kind.value))options.append(field('fields.min',min),field('fields.max',max));if(kind.value==='integer')options.append(field('fieldFormat.label',format));if(kind.value==='text')options.append(field('editor.pattern',pattern));};kind.addEventListener('change',draw);draw();
   f.append(...[field('editor.label',name),field('editor.valueType',kind),field('fieldKey.mode',mode),field('fieldKey.key',key),used?el('p',{class:'muted'},t('fields.inUse')):null,options,el('button',{type:'submit',class:'primary'},t('editor.saveField'))].filter(x=>x!=null));f.addEventListener('input',()=>e.markDirty());
   f.addEventListener('submit',event=>{event.preventDefault();c.run(async()=>{try{
    if(!name.value.trim())throw Error(t('fields.nameRequired'));const rules={};if(['single-select','multi-select'].includes(kind.value)){if(!choices.length)throw Error(t('fields.optionsRequired'));rules.options=choices;}if(['reference','reference-list'].includes(kind.value)&&targets.length)rules.target_types=targets;if(['integer','decimal'].includes(kind.value)){if(min.value!=='')rules.min=Number(min.value);if(max.value!=='')rules.max=Number(max.value);}if(kind.value==='text'&&pattern.value.trim())rules.pattern=pattern.value.trim();
    const next=original?structuredClone(s):newDefinition(s,name.value.trim(),kind.value,rules,key.value.trim()).snapshot;const d=original?next.definitions.fields.find(x=>x.id===original.id):next.definitions.fields.at(-1);d.value_type=kind.value;d.rules=rules;if(kind.value==='integer')d.display_format=format.value;else delete d.display_format;next.languages['en-US'].messages[d.label_key]=name.value.trim();
    // Validate existing values against changed rules before staging the definition.
    const {validateSnapshot}=await import('../collection-snapshot/domain.mjs');validateSnapshot(next);s=next;m.markDirty();e.finish();picker.refresh();paint();
   }catch(error){errors(error,e.error);}});});e.body.append(f);
  }
  form.append(picker.node,button('fields.new',()=>edit()),list,el('button',{type:'submit',class:'primary'},t('action.save')));form.addEventListener('submit',event=>{event.preventDefault();c.run(async()=>{try{await commit(s);m.finish();await render();}catch(error){errors(error,m.error);}});});m.body.append(form);paint();
 }
 return {manageFields};
}
