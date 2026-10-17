import {APP_VERSION,CONTRACT,VALUE_TYPES,displayName,localized,withObject,validateSnapshot,fail,safeURL} from '../collection-snapshot/domain.mjs';
import {WORKSPACE_VERSION,preferences,languageDraft,enableLanguage,newDefinition,sourceUsage,removeSource,upgradeCatalogs} from '../collection-snapshot/workspace.mjs';
import {helpers} from '../objects/ui-helpers.mjs';
export function createUI(c){
  const {el,button,field,modal,t,run,errors,render,announce,download,ensureSnapshot,commit}=c;
  const {textField,finish,readFile,disclosure,definitionLabel,labelFor,pickMany,listInput,valueControl,emptyValue}=helpers(c);
  function architecture(main){
    main.append(el('p',{class:'eyebrow'},t('architecture.eyebrow')),el('h1',{},t('nav.architecture')),el('p',{class:'intro workspace-intro'},t('architecture.intro')));
    if(c.kernel)main.append(el('div',{class:'workspace-grid'},c.kernel.manifests.map(m=>el('section',{class:'panel'},el('h2',{},m.name),el('p',{},m.id+' · '+m.version),el('p',{},c.kernel.states.get(m.id)?.status||m.type),el('code',{},m.directory)))));
    const layers=[['application',APP_VERSION],['theme',c.theme().version],...Object.entries(c.appConfig().contracts),['workspace',WORKSPACE_VERSION]];
    main.append(el('div',{class:'workspace-grid'},layers.map(([name,version])=>el('section',{class:'panel'},el('h2',{},t('layer.'+name)),el('span',{class:'badge'},version),el('p',{class:'muted'},t('layerHelp.'+name))))),el('p',{class:'notice'},t('architecture.note')));
  }

return {architecture};
}
