import {validLocaleMetadata} from './protection.mjs';
import {CONTRACT,fail,validateSnapshot,displayName} from './domain.mjs';
export const WORKSPACE_VERSION='1.0.0';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function preferences(value={format_version:WORKSPACE_VERSION,visible:[]}) {
  if(!validLocaleMetadata(value||{})||!record(value)||value.format_version!==WORKSPACE_VERSION||!Array.isArray(value.visible)||value.visible.some(k=>typeof k!=='string'||! /^(section|type|entry):[a-zA-Z0-9_-]+$/.test(k)))fail('invalid','workspace');
  return {format_version:WORKSPACE_VERSION,visible:[...new Set(value.visible)]};
}
export function placeholders(text){return [...text.matchAll(/\{([a-zA-Z_]+)\}/g)].map(m=>m[1]).sort();}
export function languageDraft(value,base){
  if(!validLocaleMetadata(value||{})||!record(value)||value.format_version!==CONTRACT||typeof value.locale!=='string'||! /^[a-z]{2}-[A-Z]{2}$/.test(value.locale)||!record(value.messages)||Object.values(value.messages).some(v=>typeof v!=='string'))fail('invalid','language');
  try{new Intl.NumberFormat(value.locale);}catch{fail('invalid','language.locale');}
  const missing=[],invalid=[];
  for(const [key,text]of Object.entries(base.messages)) {
    const translated=value.messages[key];
    if(!translated?.trim())missing.push(key);
    else if(JSON.stringify(placeholders(text))!==JSON.stringify(placeholders(translated)))invalid.push(key);
  }
  return {catalog:structuredClone(value),missing,invalid,total:Object.keys(base.messages).length};
}
export function enableLanguage(snapshot,catalog){
  const checked=languageDraft(catalog,snapshot.languages['en-US']);
  if(checked.missing.length||checked.invalid.length)fail('translation','language',{count:checked.missing.length+checked.invalid.length});
  const next=structuredClone(snapshot);next.languages[catalog.locale]=checked.catalog;return validateSnapshot(next);
}
// Extend older UI catalogs without modifying record identities or wire contracts.
export function upgradeCatalogs(snapshot,currentBase){
  const next=structuredClone(snapshot);
  const older=next.languages['en-US'].messages['app.release']!==currentBase.messages['app.release'];
  for(const [key,value]of Object.entries(currentBase.messages)) {
    if(older||next.languages['en-US'].messages[key]===undefined)next.languages['en-US'].messages[key]=value;
    for(const [locale,lang]of Object.entries(next.languages))if(locale!=='en-US'){
      if(!lang.messages[key]||JSON.stringify(placeholders(lang.messages[key]))!==JSON.stringify(placeholders(value)))lang.messages[key]=value;
    }
  }
  return validateSnapshot(next);
}
export function sourceUsage(snapshot,id){
  return ['objects','relationships','notes'].flatMap(collection=>snapshot[collection].filter(row=>row.source_ids?.includes(id)).map(row=>({collection,id:row.id,label:collection==='objects'?displayName(row):row.title||row.note||row.relation_type||row.id})));
}
export function removeSource(snapshot,id,{replacement,unlink=false}={}){
  const next=structuredClone(snapshot),used=sourceUsage(next,id);
  if(replacement&&(replacement===id||!next.sources.some(s=>s.id===replacement)))fail('reference','source.replacement');
  if(used.length&&!replacement&&!unlink)fail('sourceInUse','source',{count:used.length});
  for(const collection of ['objects','relationships','notes'])for(const row of next[collection])if(row.source_ids?.includes(id))row.source_ids=[...new Set(row.source_ids.flatMap(x=>x===id?(replacement?[replacement]:[]):[x]))];
  next.sources=next.sources.filter(s=>s.id!==id);return validateSnapshot(next);
}
export function fieldKey(label){const slug=label.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,55);return 'field.'+(/^[a-z]/.test(slug)?slug:'custom_'+slug);}
export function availableFieldKey(snapshot,label){const base=fieldKey(label);let key=base,i=2;while(Object.hasOwn(snapshot.languages['en-US'].messages,key))key=base+'_'+i++;return key;}
export function newDefinition(snapshot,label,valueType,rules={},manualKey){
  const next=structuredClone(snapshot),id='field_'+crypto.randomUUID().replaceAll('-',''),label_key=manualKey||availableFieldKey(snapshot,label);
  if(!/^field\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/.test(label_key)||label_key.length>128)fail('invalid','field.label_key');
  if(Object.hasOwn(next.languages['en-US'].messages,label_key))fail('duplicate','field.label_key');
  next.definitions.fields.push({id,version:['image','gallery'].includes(valueType)?'1.1.0':CONTRACT,label_key,value_type:valueType,rules});
  for(const lang of Object.values(next.languages))lang.messages[label_key]=label;
  return {snapshot:validateSnapshot(next),id};
}
export class LocalWorkspace {
  constructor(storage,key){this.storage=storage;this.key=key;this.last=null;}
  load(){const raw=this.storage.getItem(this.key);this.last=raw;if(!raw)return null;const value=JSON.parse(raw);if(value.format_version!==WORKSPACE_VERSION||!record(value.languageDrafts)||typeof value.baseRevision!=='string')fail('invalid','localDraft');preferences(value.preferences);if(value.snapshot)validateSnapshot(value.snapshot);for(const draft of Object.values(value.languageDrafts))languageDraft(draft,{messages:{}});return value;}
  save(value){
    if(this.storage.getItem(this.key)!==this.last)fail('storageConflict','localDraft');
    const raw=JSON.stringify({...value,format_version:WORKSPACE_VERSION});this.storage.setItem(this.key,raw);this.last=raw;
  }
  clear(){this.storage.removeItem(this.key);this.last=null;}
}
