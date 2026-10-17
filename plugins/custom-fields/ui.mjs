import {fieldPicker} from './field-picker.mjs';
import {fieldFormat} from './format.mjs';
import {compilePattern} from './pattern.mjs';
import {APP_VERSION,CONTRACT,VALUE_TYPES,displayName,localized,withObject,validateSnapshot,fail,safeURL} from '../collection-snapshot/domain.mjs';
import {WORKSPACE_VERSION,preferences,languageDraft,enableLanguage,newDefinition,availableFieldKey,sourceUsage,removeSource,upgradeCatalogs} from '../collection-snapshot/workspace.mjs';
import {helpers} from '../objects/ui-helpers.mjs';
export function createUI(c){
  const {el,button,field,modal,t,run,errors,render,announce,download,ensureSnapshot,commit}=c;
  const {textField,finish,readFile,disclosure,definitionLabel,labelFor,pickMany,listInput,valueControl,emptyValue}=helpers(c);
  async function editObject(original,requestedType){
    let s=structuredClone(await ensureSnapshot());
    const active=s.types.types.filter(x=>x.enabled||x.id===original?.type);if(!active.length)fail('disabled','type');
    const now=new Date().toISOString(),object=structuredClone(original||{format_version:CONTRACT,id:crypto.randomUUID(),type:requestedType||active[0].id,created_at:now,updated_at:now,fields:[],source_ids:[],badge_ids:[],category_ids:[],visibility:'private'});
    const m=modal(original?'editor.editTitle':'action.new'),form=el('form',{class:'stack entry-form'}),type=el('select',{},active.map(x=>el('option',{value:x.id},t(x.label_key))));type.value=object.type;
    const fields=el('div',{class:'stack'}),display=el('select'),added=el('div',{role:'status','aria-live':'polite',class:'muted small'});
    const changed=()=>m.markDirty(),createdFieldIds=new Set(),createdReferences=new Set();let quickFields;
    const pickerOptions=()=>({getSnapshot:()=>s,setSnapshot:value=>{s=value;},selected:()=>object.fields.map(f=>f.definition_id||f.id),extraChoices:()=>object.fields.filter(f=>!f.definition_id).map(f=>({id:f.id,label:localized(f.label,c.locale()),english:f.label['en-US']})),onSelect:id=>{if(s.definitions.fields.some(d=>d.id===id))addDefinition(id);draw();},onRemove:id=>{object.fields=object.fields.filter(f=>(f.definition_id||f.id)!==id);draw();},changed,created:createdFieldIds});
    const visibility=el('select',{},el('option',{value:'private'},'Private'),el('option',{value:'public'},'Public'));visibility.value=object.visibility||'public';visibility.addEventListener('change',()=>{object.visibility=visibility.value;changed();});
    const cover=el('select');cover.addEventListener('change',()=>{if(cover.value)object.cover_field_id=cover.value;else delete object.cover_field_id;changed();});
    const addDefinition=id=>{if(object.fields.some(f=>f.definition_id===id))return;const d=s.definitions.fields.find(x=>x.id===id);object.fields.push({id:crypto.randomUUID(),definition_id:id,label:{'en-US':s.languages['en-US'].messages[d.label_key]},value_type:d.value_type,value:emptyValue(d.value_type)});};
    const updateDisplay=()=>{display.replaceChildren(el('option',{value:''},t('editor.none')),...object.fields.filter(f=>['text','single-select'].includes(f.value_type)).map(f=>el('option',{value:f.id},labelFor(s,f))));if(!object.fields.some(f=>f.id===object.display_field_id))object.display_field_id=object.fields.find(f=>['text','single-select'].includes(f.value_type))?.id;display.value=object.display_field_id||'';cover.replaceChildren(el('option',{value:''},t('editor.none')),...object.fields.filter(f=>['image','gallery'].includes(f.value_type)).map(f=>el('option',{value:f.id},labelFor(s,f))));if(object.cover_field_id&&!object.fields.some(f=>f.id===object.cover_field_id))delete object.cover_field_id;cover.value=object.cover_field_id||'';};
    display.addEventListener('change',()=>{object.display_field_id=display.value;changed();});
    const configureField=existing=>{
      const edit=modal(existing?'editor.editField':'editor.custom'),label=textField('editor.label',existing?localized(existing.label,'en-US'):''),kind=el('select',{},VALUE_TYPES.filter(v=>!['image','gallery'].includes(v)||!c.kernel||c.kernel.get('field.widgets',v)).map(v=>el('option',{value:v},t('valueType.'+v)))),options=el('div'),reusable=el('input',{type:'checkbox'}),fForm=el('form',{class:'stack'});
      const keyMode=el('select',{},el('option',{value:'auto'},t('fieldKey.auto')),el('option',{value:'manual'},t('fieldKey.manual'))),keyInput=el('input',{value:existing?.label_key||'',placeholder:'field.passport'});keyInput.readOnly=true;
      const updateKey=()=>{if(keyMode.value==='auto')keyInput.value=availableFieldKey(s,label.input.value||'custom');keyInput.readOnly=keyMode.value==='auto';};keyMode.addEventListener('change',updateKey);label.input.addEventListener('input',updateKey);if(!existing)updateKey();
      const pattern=textField('editor.pattern',existing?.rules?.pattern||'');
      label.input.required=true;kind.value=existing?.value_type||'text';kind.disabled=!!existing?.definition_id;
      let choices=[...(existing?.rules?.options||[])];
      const paintOptions=()=>{options.replaceChildren();if(['single-select','multi-select'].includes(kind.value)&&!existing?.definition_id)options.append(el('p',{},t('editor.options')),listInput(choices,v=>{choices=v;edit.markDirty();}));};
      kind.addEventListener('change',()=>{choices=[];paintOptions();});paintOptions();
      fForm.append(label.node,el('p',{class:'muted small'},t('editor.englishLabel')),field('editor.valueType',kind),options,disclosure('editor.pattern',pattern.node,el('p',{class:'muted small'},t('editor.patternHelp'))));
      if(!existing)fForm.append(field('fieldKey.mode',keyMode),field('fieldKey.key',keyInput),el('p',{class:'muted small'},t('fieldKey.help')),el('label',{class:'check-row'},reusable,el('span',{},t('editor.reusable'))));
      fForm.append(el('button',{type:'submit',class:'primary'},t('editor.saveField')));
      fForm.addEventListener('input',()=>edit.markDirty());
      fForm.addEventListener('submit',e=>{e.preventDefault();run(async()=>{try{
        const rules=existing?.value_type===kind.value?structuredClone(existing.rules||{}):{};
        if(['single-select','multi-select'].includes(kind.value))rules.options=choices;
        if(pattern.input.value.trim()){try{compilePattern(pattern.input.value.trim());}catch{fail('patternSyntax','field');}if(kind.value!=='text')fail('patternSyntax','field');rules.pattern=pattern.input.value.trim();}else delete rules.pattern;
        if(!existing?.definition_id&&rules.options&&!rules.options.length)fail('options','field');
        if(!label.input.value.trim())fail('label','field');
        const f=existing||{id:crypto.randomUUID(),value:emptyValue(kind.value)};
        if(existing&&kind.value!==existing.value_type&&!confirm(t('editor.changeKind')))return;
        if(existing&&kind.value!==existing.value_type)f.value=emptyValue(kind.value);
        f.label={...f.label,'en-US':label.input.value.trim()};f.value_type=kind.value;if(f.value_type!=='integer')delete f.display_format;if(!f.definition_id)f.rules=rules;
        if(!existing&&reusable.checked){const result=newDefinition(s,label.input.value.trim(),kind.value,rules,keyInput.value.trim());s=result.snapshot;f.definition_id=result.id;delete f.rules;}
        if(!existing&&!reusable.checked){const key=keyInput.value.trim();if(!/^field\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(key)||key.length>128)fail('invalid','field.label_key');if(Object.hasOwn(s.languages['en-US'].messages,key))fail('duplicate','field.label_key');f.label_key=key;for(const lang of Object.values(s.languages))lang.messages[key]=label.input.value.trim();}
        if(existing?.label_key)s.languages['en-US'].messages[existing.label_key]=f.label['en-US'];
        if(!existing)object.fields.push(f);changed();draw();edit.finish();added.textContent=t('editor.fieldAdded');
      }catch(error){errors(error,edit.error);}});});edit.body.append(fForm);
    };
    const chooseField=()=>{
      const choose=modal('action.add'),options=pickerOptions();
      const picker=fieldPicker(c,{...options,showSelected:false,onSelect:id=>{options.onSelect(id);choose.finish();added.textContent=t('editor.fieldAdded');}});
      choose.body.append(picker.node,button('editor.custom',()=>{choose.finish();configureField();}));
    };
    const draw=()=>{fields.replaceChildren(...object.fields.map(f=>{
      const privacy=el('select',{},el('option',{value:'inherit'},t('privacy.inherit')),el('option',{value:'private'},'Private'));privacy.value=f.visibility==='private'?'private':'inherit';privacy.addEventListener('change',()=>{if(privacy.value==='private')f.visibility='private';else delete f.visibility;changed();});
      const presentation=el('select',{},['normal','hidden','masked'].map(v=>el('option',{value:v},t('privacy.'+v))));presentation.value=f.presentation||'normal';presentation.addEventListener('change',()=>{f.presentation=presentation.value;changed();});
      const numberFormat=el('select',{},el('option',{value:'number'},t('fieldFormat.number')),el('option',{value:'year'},t('fieldFormat.year')));numberFormat.value=fieldFormat(f,s.definitions.fields.find(d=>d.id===f.definition_id));numberFormat.addEventListener('change',()=>{f.display_format=numberFormat.value;changed();});
      const observation=el('input',{type:'date',value:f.observed_on||''});observation.addEventListener('input',()=>{if(observation.value)f.observed_on=observation.value;else delete f.observed_on;changed();});
      return el('section',{class:'entry-field'},el('div',{class:'field-heading'},el('h3',{},labelFor(s,f)),el('details',{class:'field-actions'},el('summary',{},t('editor.fieldSettings')),el('div',{class:'stack'},!f.definition_id?button('editor.editField',()=>configureField(f)):el('p',{class:'muted small'},t('editor.sharedField')),f.value_type==='integer'?field('fieldFormat.label',numberFormat):null,field('privacy.classification',privacy),field('privacy.presentation',presentation),el('p',{class:'muted small'},t('privacy.visualHelp')),field('editor.observed',observation),button('action.remove',()=>{object.fields=object.fields.filter(x=>x.id!==f.id);changed();draw();})))),valueControl(s,f,v=>{f.value=v;changed();},{visibility:()=>object.visibility||'public',createdReferences}));
    }));if(!object.fields.length)fields.append(el('p',{class:'empty-state'},t('editor.noFields')));updateDisplay();quickFields?.refresh();};
    if(!original)for(const id of s.types.types.find(x=>x.id===object.type).suggested_fields)addDefinition(id);
    type.addEventListener('change',()=>{object.type=type.value;for(const id of s.types.types.find(x=>x.id===object.type).suggested_fields)addDefinition(id);changed();draw();});
    const selected=[...(object.source_ids||[])];quickFields=fieldPicker(c,pickerOptions());
    form.append(...[field('editor.type',type),c.actions.categoryPicker?c.actions.categoryPicker(()=>s,object,changed):el('p',{class:'notice'},'Categories is disabled. Save or cancel this entry, then ',el('a',{href:'#extensions',onclick:event=>{event.preventDefault();m.close();if(!document.querySelector('dialog'))location.hash='#extensions';}},'enable Categories in Plugins'),'.'),field('privacy.classification',visibility),c.actions.vaultPanel&&!c.vault?.unlocked?button('vault.title',c.actions.vaultPanel):null,el('p',{class:'muted small'},t('privacy.entryHelp')),field('media.cover',cover),quickFields.node,c.actions.badgePicker?c.actions.badgePicker(()=>s,object,changed):null,fields,button('action.add',chooseField),added,disclosure('editor.more',field('editor.display',display),(!c.kernel||c.kernel.active('watchers.sources'))?pickMany(t('detail.sources'),s.sources.map(x=>({id:x.id,label:x.title})),selected,v=>{object.source_ids=v;changed();}):null),el('div',{class:'modal-actions row'},el('button',{type:'submit',class:'primary'},t('action.save')),button('action.cancel',m.close))].filter(x=>x!=null));
    form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{try{
      const candidate=structuredClone(object);candidate.updated_at=new Date().toISOString();if(!candidate.display_field_id)delete candidate.display_field_id;
      // Untouched optional numeric/date/reference fields are omitted, never coerced to zero.
      candidate.fields=candidate.fields.filter(f=>!(['integer','decimal','boolean','date','single-select','reference'].includes(f.value_type)&&f.value===''));
      if(candidate.display_field_id&&!candidate.fields.some(f=>f.id===candidate.display_field_id))delete candidate.display_field_id;
      for(const related of s.objects)if(createdReferences.has(related.id))related.visibility=candidate.visibility||'public';
      const referenced=new Set([candidate,...s.objects.filter(o=>o.id!==candidate.id&&!createdReferences.has(o.id))].flatMap(o=>o.fields.flatMap(f=>f.value_type==='reference'?[f.value]:f.value_type==='reference-list'?f.value:[])));s.objects=s.objects.filter(o=>!createdReferences.has(o.id)||referenced.has(o.id));
      await commit(withObject(s,candidate,{isNew:!original}));m.finish();location.hash='object/'+candidate.id;await render();announce('workspace.saved');
    }catch(error){errors(error,m.error);}});});
    m.body.append(form);draw();
  }

return {editObject};
}
