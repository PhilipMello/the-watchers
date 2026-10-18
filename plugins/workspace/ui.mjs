import {APP_VERSION,CONTRACT,VALUE_TYPES,displayName,localized,withObject,validateSnapshot,fail,safeURL} from '../collection-snapshot/domain.mjs';
import {WORKSPACE_VERSION,preferences,languageDraft,enableLanguage,newDefinition,sourceUsage,removeSource,upgradeCatalogs} from '../collection-snapshot/workspace.mjs';
import {helpers} from '../objects/ui-helpers.mjs';
export function createUI(c){
  const {el,button,field,modal,t,run,errors,render,announce,download,ensureSnapshot,commit}=c;
  const {textField,finish,readFile,disclosure,definitionLabel,labelFor,pickMany,listInput,valueControl,emptyValue}=helpers(c);
  async function customize(){
    const s=await ensureSnapshot(),m=modal('workspace.customize'),prefs=structuredClone(c.preferences()),search=el('input',{type:'search',placeholder:t('action.search'),'aria-label':t('action.search')}),list=el('div',{class:'stack'});
    const saveNotice=el('p',{role:'status',class:'muted small'});
    const groups=[['workspace.sections',c.config().sections.map(x=>({key:'section:'+x.id,label:t(x.label_key)}))],['workspace.types',s.types.types.map(x=>({key:'type:'+x.id,label:t(x.label_key)}))],['workspace.entries',s.objects.map(x=>({key:'entry:'+x.id,label:displayName(x)}))]];
    const paint=()=>list.replaceChildren(...groups.map(([heading,items])=>el('section',{class:'stack'},el('h3',{},t(heading)),items.filter(x=>x.label.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())).map(x=>{
      const visible=prefs.visible.includes(x.key),toggle=el('button',{type:'button',class:'visibility-toggle','aria-pressed':String(visible),'aria-label':x.label+' — '+t('workspace.visibility'),onclick:()=>{prefs.visible=visible?prefs.visible.filter(k=>k!==x.key):[...prefs.visible,x.key];saveNotice.textContent=c.setPreferences(prefs)===false?t('workspace.storageFailed'):'';toggle.setAttribute('aria-pressed',String(!visible));paint();list.querySelectorAll('button').forEach(b=>{if(b.getAttribute('aria-label')===toggle.getAttribute('aria-label'))b.focus();});}},t(visible?'workspace.show':'workspace.hide'));
      return el('div',{class:'toggle-row'},el('span',{},x.label),toggle);
    }))));
    m.body.append(el('p',{class:'muted'},t('workspace.visibilityHelp')),saveNotice,search,list,button('workspace.hideAll',()=>{prefs.visible=[];saveNotice.textContent=c.setPreferences(prefs)===false?t('workspace.storageFailed'):'';paint();}),button('action.done',async()=>{m.finish();await render();}));search.addEventListener('input',paint);m.dialog.addEventListener('close',()=>run(render));paint();
  }
  async function workspace(main){
    const s=await ensureSnapshot(),visible=c.preferences().visible;
    main.append(el('p',{class:'eyebrow'},t('workspace.eyebrow')),el('div',{class:'toolbar'},el('h1',{},t('workspace.title')),el('div',{class:'row'},c.actions.editObject?button('action.new',()=>c.actions.editObject(),true):null,button('workspace.customize',customize),c.actions.submitGitHub?button('github.submit',c.actions.submitGitHub):null,c.actions.vaultPanel?button('vault.title',c.actions.vaultPanel):null,c.actions.settings?el('a',{class:'button',href:'#settings'},t('nav.settings')):null)),el('p',{class:'intro workspace-intro'},t('workspace.intro')));
    const panels=el('div',{class:'workspace-grid'});
    for(const section of c.config().sections)if(visible.includes('section:'+section.id))panels.append(el('section',{class:'panel stack'},el('h2',{},t(section.label_key)),el('p',{class:'muted'},t(section.description_key)),el('a',{class:'button',href:'#'+section.route},t('action.open'))));
    for(const type of s.types.types)if(visible.includes('type:'+type.id)){const entries=s.objects.filter(x=>x.type===type.id);panels.append(el('section',{class:'panel stack'},el('div',{class:'toolbar'},el('h2',{},t(type.label_key)),el('span',{class:'badge'},String(entries.length))),el('ul',{class:'clean'},entries.map(x=>el('li',{},el('a',{href:'#object/'+x.id},displayName(x))))),type.enabled&&c.actions.editObject?button('action.new',()=>c.actions.editObject(null,type.id)):null));}
    for(const o of s.objects)if(visible.includes('entry:'+o.id))panels.append(el('section',{class:'panel stack'},el('p',{class:'eyebrow'},t(s.types.types.find(x=>x.id===o.type).label_key)),el('h2',{},displayName(o)),el('a',{class:'button',href:'#object/'+o.id},t('action.open'))));
    if(!panels.children.length)panels.append(el('section',{class:'empty-state'},el('h2',{},t('workspace.emptyTitle')),el('p',{},t('workspace.emptyHelp')),button('workspace.customize',customize)));
    main.append(panels);
  }
return {customize,workspace};
}
