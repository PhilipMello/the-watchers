import {creatablePicker} from '../custom-fields/creatable-picker.mjs';
import {APP_VERSION,CONTRACT,VALUE_TYPES,displayName,localized,withObject,validateSnapshot,fail,safeURL} from '../collection-snapshot/domain.mjs';
import {WORKSPACE_VERSION,preferences,languageDraft,enableLanguage,newDefinition,sourceUsage,removeSource,upgradeCatalogs} from '../collection-snapshot/workspace.mjs';

export function helpers(c){
  const {el,button,field,modal,t,run,errors,render,announce,download,ensureSnapshot,commit}=c;
  const textField=(key,value='',type='text')=>{const input=el('input',{type,value});return {input,node:field(key,input)};};
  const finish=async(m,key='workspace.saved')=>{m.finish();await render();announce(key);};
  const readFile=async input=>{const file=input.files[0];if(!file)return null;if(file.size>20*1024*1024)fail('size');return JSON.parse(await file.text());};
  const disclosure=(key,...children)=>el('details',{},el('summary',{},t(key)),el('div',{class:'stack disclosure-body'},...children));
  const definitionLabel=(s,d)=>s.languages[c.locale()]?.messages[d.label_key]||s.languages['en-US'].messages[d.label_key];
  const labelFor=(s,f)=>f.definition_id?definitionLabel(s,s.definitions.fields.find(d=>d.id===f.definition_id)):localized(f.label,c.locale());
  function pickMany(label,choices,selected,onChange){
    const wrap=el('fieldset',{class:'picker stack'},el('legend',{},label));
    const search=el('input',{type:'search',placeholder:t('action.search'),'aria-label':label+' — '+t('action.search')}),list=el('div',{class:'picker-list'});
    const paint=()=>{list.replaceChildren(...choices.filter(x=>x.label.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())).map(x=>{
      const input=el('input',{type:'checkbox',checked:selected.includes(x.id)});
      input.addEventListener('change',()=>{if(input.checked&&!selected.includes(x.id))selected.push(x.id);else if(!input.checked)selected.splice(selected.indexOf(x.id),1);onChange([...selected]);});
      return el('label',{class:'check-row'},input,el('span',{},x.label));
    }));if(!list.children.length)list.append(el('p',{class:'muted'},t('catalog.empty')));};
    search.addEventListener('input',paint);wrap.append(search,list);paint();return wrap;
  }
  function listInput(values,onChange){
    const list=[...values],wrap=el('div',{class:'stack'}),items=el('div',{class:'chips'}),input=el('input',{type:'text','aria-label':t('editor.listItem')}),add=button('action.addItem',()=>{
      const value=input.value.trim();if(value&&!list.includes(value)){list.push(value);onChange([...list]);input.value='';paint();}input.focus();
    });
    const paint=()=>items.replaceChildren(...list.map(value=>el('span',{class:'badge'},el('span',{},value),el('button',{type:'button',class:'icon-button','aria-label':t('action.removeItem',{value}),onclick:()=>{list.splice(list.indexOf(value),1);onChange([...list]);paint();}},'×'))));
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation?.();add.click();}});wrap.append(items,el('div',{class:'row'},input,add));paint();return wrap;
  }
  function valueControl(s,f,onChange,{visibility=()=>'public',createdReferences=new Set()}={}){
    const widget=c.kernel?.get('field.widgets',f.value_type);if(widget)return widget.editor(c,f,onChange);
    if(['image','gallery'].includes(f.value_type))return el('p',{},t('extension.unavailable'));
    const rules=f.definition_id?s.definitions.fields.find(d=>d.id===f.definition_id).rules||{}:f.rules||{};
    if(f.value_type==='text-list'){
      let selected=[...f.value];const known=new Set([...selected,...s.objects.flatMap(o=>o.fields.filter(x=>x.value_type==='text-list'&&(f.definition_id?x.definition_id===f.definition_id:x.id===f.id)).flatMap(x=>x.value))]);
      return creatablePicker(c,{label:labelFor(s,f),choices:()=>[...known].map(value=>({id:value,label:value})),values:()=>selected,change:values=>{selected=values;onChange(values);},create:name=>{known.add(name);return name;}}).node;
    }
    if(['single-select','multi-select'].includes(f.value_type)){
      const multiple=f.value_type==='multi-select';let selected=multiple?[...f.value]:f.value?[f.value]:[];
      return creatablePicker(c,{label:labelFor(s,f),multiple,choices:()=> (rules.options||[]).map(value=>({id:value,label:value})),values:()=>selected,change:values=>{selected=values;onChange(multiple?values:values[0]||'');},create:name=>{rules.options??=[];rules.options.push(name);if(!f.definition_id)f.rules=rules;return name;}}).node;
    }
    if(['reference','reference-list'].includes(f.value_type)){
      const multiple=f.value_type==='reference-list';let selected=multiple?[...f.value]:f.value?[f.value]:[];
      const allowed=s.types.types.filter(type=>type.enabled&&(!rules.target_types||rules.target_types.includes(type.id))),type=el('select',{'aria-label':t('picker.createType')},el('option',{value:''},t('editor.choose')),allowed.map(type=>el('option',{value:type.id},s.languages[c.locale()]?.messages[type.label_key]||s.languages['en-US'].messages[type.label_key])));if(allowed.length===1)type.value=allowed[0].id;
      return creatablePicker(c,{label:labelFor(s,f),multiple,extra:allowed.length>1?field('picker.createType',type):null,choices:()=>s.objects.filter(o=>!rules.target_types||rules.target_types.includes(o.type)).map(o=>({id:o.id,label:displayName(o,c.locale())})),values:()=>selected,change:values=>{selected=values;onChange(multiple?values:values[0]||'');},create:name=>{
        if(!allowed.some(x=>x.id===type.value))throw Error(t('picker.chooseType'));
        const id=crypto.randomUUID(),now=new Date().toISOString();s.objects.push({format_version:'1.1.0',id,type:type.value,created_at:now,updated_at:now,visibility:visibility(),display_field_id:'name',fields:[{id:'name',label:{'en-US':'Name'},value_type:'text',value:name}],source_ids:[],badge_ids:[],category_ids:[]});createdReferences.add(id);return id;
      }}).node;
    }
    let input;
    if(f.value_type==='boolean'){input=el('select',{},el('option',{value:''},t('editor.choose')),el('option',{value:'false'},t('boolean.false')),el('option',{value:'true'},t('boolean.true')));input.value=String(f.value);input.addEventListener('change',()=>onChange(input.value===''?'':input.value==='true'));}
    else if(f.value_type==='single-select'){input=el('select',{},el('option',{value:''},t('editor.choose')),...(rules.options||[]).map(v=>el('option',{value:v},v)));input.value=f.value;input.addEventListener('change',()=>onChange(input.value));}
    else {
      const numeric=['integer','decimal'].includes(f.value_type);
      input=f.value_type==='text'?el('textarea',{rows:'2'}):el('input',{type:numeric?'number':'date',step:numeric?(f.value_type==='integer'?'1':'any'):undefined,min:numeric?rules.min:undefined,max:numeric?rules.max:undefined});
      input.value=f.value;input.addEventListener('input',()=>onChange(numeric?(input.value===''?'':Number(input.value)):input.value));
    }
    input.setAttribute('aria-label',labelFor(s,f));return input;
  }
  const emptyValue=kind=>c.kernel?.get('field.widgets',kind)?.empty?.()??(kind==='image'?null:['text-list','multi-select','reference-list','gallery'].includes(kind)?[]:'');


return {textField,finish,readFile,disclosure,definitionLabel,labelFor,pickMany,listInput,valueControl,emptyValue};
}
