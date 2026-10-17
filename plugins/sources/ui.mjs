import {APP_VERSION,CONTRACT,VALUE_TYPES,displayName,localized,withObject,validateSnapshot,fail,safeURL} from '../collection-snapshot/domain.mjs';
import {WORKSPACE_VERSION,preferences,languageDraft,enableLanguage,newDefinition,sourceUsage,removeSource,upgradeCatalogs} from '../collection-snapshot/workspace.mjs';
import {helpers} from '../objects/ui-helpers.mjs';
export function createUI(c){
  const {el,button,field,modal,t,run,errors,render,announce,download,ensureSnapshot,commit}=c;
  const {textField,finish,readFile,disclosure,definitionLabel,labelFor,pickMany,listInput,valueControl,emptyValue}=helpers(c);
  async function editSource(original){
    const s=await ensureSnapshot(),m=modal(original?'source.edit':'source.new'),form=el('form',{class:'stack'}),source=structuredClone(original||{id:crypto.randomUUID(),title:''}),inputs={};
    for(const [key,type]of [['title','text'],['publisher','text'],['url','url'],['accessed_on','date'],['description','text']]){const item=textField('source.'+key,source[key]||'',type);inputs[key]=item.input;if(key==='title')item.input.required=true;form.append(item.node);}
    form.append(el('button',{type:'submit',class:'primary'},t('source.save')));form.addEventListener('input',()=>m.markDirty());
    form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{try{for(const [key,input]of Object.entries(inputs)){if(input.value.trim())source[key]=input.value.trim();else delete source[key];}const next=structuredClone(s),index=next.sources.findIndex(x=>x.id===source.id);if(index<0)next.sources.push(source);else next.sources[index]=source;await commit(next);await finish(m);}catch(error){errors(error,m.error);}});});m.body.append(form);
  }
  async function deleteSource(source){
    const s=await ensureSnapshot(),usage=sourceUsage(s,source.id),m=modal('source.delete'),select=el('select',{},el('option',{value:''},t('source.chooseReplacement')),...s.sources.filter(x=>x.id!==source.id).map(x=>el('option',{value:x.id},x.title))),unlink=el('input',{type:'checkbox'});
    m.body.append(el('p',{},t('source.deleteConfirm',{title:source.title})),el('p',{},t('source.usage',{count:usage.length})),el('ul',{},usage.map(x=>el('li',{},x.label))));
    if(usage.length)m.body.append(field('source.replace',select),el('label',{class:'check-row'},unlink,t('source.unlink')));
    m.body.append(button('source.delete',async()=>{try{await commit(removeSource(s,source.id,{replacement:select.value,unlink:unlink.checked}));await finish(m);}catch(error){errors(error,m.error);}}));
  }
  async function sourcePage(main){
    const s=await ensureSnapshot(),list=el('div',{class:'stack'}),search=el('input',{type:'search',placeholder:t('action.search'),'aria-label':t('nav.sources')});
    const paint=()=>{list.replaceChildren(...s.sources.filter(x=>(x.title+' '+(x.description||'')).toLocaleLowerCase().includes(search.value.toLocaleLowerCase())).map(source=>{
      const used=sourceUsage(s,source.id);
      return el('article',{class:'panel source-card'},el('div',{},el('h2',{},source.title),el('p',{class:'muted'},source.publisher||''),el('p',{},source.description||''),source.url?el('a',{href:safeURL(source.url),target:'_blank',rel:'noopener noreferrer'},source.url):null,source.accessed_on?el('p',{class:'small'},t('source.accessed',{date:c.date(source.accessed_on)})):null,disclosure('source.usedBy',used.length?el('ul',{},used.map(x=>el('li',{},x.collection==='objects'?el('a',{href:'#object/'+x.id},x.label):x.label))):el('p',{},t('detail.empty')))),el('div',{class:'row'},button('source.edit',()=>editSource(source)),button('source.delete',()=>deleteSource(source))));
    }));if(!list.children.length)list.append(el('p',{class:'empty-state'},t('detail.empty')));};
    main.append(el('div',{class:'toolbar'},el('h1',{},t('nav.sources')),button('source.new',()=>editSource(),true)),search,list);search.addEventListener('input',paint);paint();
  }

return {sourcePage};
}
