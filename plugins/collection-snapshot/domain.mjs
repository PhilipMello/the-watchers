import {validateProtection, validImage, validateFeatures, validLocaleMetadata} from './protection.mjs';
import {contractFor} from './contracts.mjs';
import {DomainError,fail} from '../../core/errors.mjs';
import {compilePattern,matchesPattern} from '../custom-fields/pattern.mjs';
export const APP_VERSION = '0.0.0';
export const CONTRACT = '1.0.0';
export const VALUE_TYPES = Object.freeze(['text','integer','decimal','boolean','date','single-select','multi-select','text-list','reference','reference-list','image','gallery']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const key = /^[a-z][a-z0-9_-]{0,63}$/;
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const strings = x => Array.isArray(x) && x.every(v=>typeof v==='string') && new Set(x).size===x.length;
export const validDate = x => typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x;
const timestamp = x => typeof x==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(x) && validDate(x.slice(0,10)) && Number.isFinite(Date.parse(x)) && +x.slice(11,13)<24 && +x.slice(14,16)<60 && +x.slice(17,19)<60;
export const safeURL = x => { try { const u=new URL(x); return ['https:','http:'].includes(u.protocol)?u.href:null; } catch { return null; } };
export {DomainError,fail} from '../../core/errors.mjs';
export function localized(map,locale='en-US') { return map?.[locale] ?? map?.['en-US'] ?? ''; }
export function displayName(object,locale='en-US') {
  const f=object.fields.find(f=>f.id===object.display_field_id);
  return f && !['hidden','masked'].includes(f.presentation) && typeof f.value==='string' && f.value.trim() ? f.value : `${object.type} · ${object.id.slice(0,8)}`;
}
export function objectPath(o) { if(!key.test(o.type)||!uuid.test(o.id)) fail('invalid','object.path'); return `objects/${o.type}/${o.id}.json`; }
export function validateSnapshot(s) {
  const issues=[];
  const check=(ok,code,path,params={})=>{if(!ok) issues.push({code,path,params});};
  const stop=()=>{if(issues.length)throw new DomainError(issues);};
  const shape=(o,keys,path)=>{check(record(o),'invalid',path); if(record(o))for(const k of Object.keys(o))check(keys.includes(k),'unsupported',`${path}.${k}`);};
  const version=(o,k,path)=>check(o?.[k]===contractFor(path)||(['snapshot','definitions'].includes(path)||path.startsWith('objects.')||path.startsWith('definitions.'))&&o?.[k]==='1.1.0','version',`${path}.${k}`,{expected:contractFor(path)});
  const label=(o,path)=>check(record(o)&&typeof o['en-US']==='string'&&!!o['en-US'].trim()&&Object.values(o).every(v=>typeof v==='string'),'label',path);
  shape(s,['format_version','dataset_mode','types','definitions','languages','objects','relationships','sources','notes','legacy','extensions'],'snapshot');stop();
  version(s,'format_version','snapshot');
  check(['demo','public'].includes(s?.dataset_mode),'invalid','dataset_mode');
  for(const collection of ['objects','relationships','sources','notes']) check(Array.isArray(s?.[collection]),'invalid',collection);
  shape(s?.types,['format_version','types','relationships'],'types'); version(s?.types,'format_version','types');
  shape(s?.definitions,['format_version','fields'],'definitions'); version(s?.definitions,'format_version','definitions');
  check(Array.isArray(s?.types?.types)&&Array.isArray(s?.types?.relationships)&&Array.isArray(s?.definitions?.fields),'invalid','registries');
  check(record(s?.languages)&&record(s.languages['en-US']),'invalid','languages'); stop();
  check(s.types.types.every(record)&&s.types.relationships.every(record)&&s.definitions.fields.every(record),'invalid','registries');stop();
  for(const [locale,catalog] of Object.entries(s.languages)) {
    check(record(catalog),'invalid',`languages.${locale}`);if(!record(catalog))continue;
    check(/^[a-z]{2}-[A-Z]{2}$/.test(locale),'invalid',`languages.${locale}`);
    check(validLocaleMetadata(catalog),'invalid',`languages.${locale}.metadata`);
    version(catalog,'format_version',`languages.${locale}`);
    check(catalog.locale===locale&&record(catalog.messages)&&Object.values(catalog.messages).every(v=>typeof v==='string'),'invalid',`languages.${locale}`);
    if(locale!=='en-US')for(const k of Object.keys(s.languages['en-US'].messages))check(typeof catalog.messages?.[k]==='string','label',`languages.${locale}.${k}`);
  }
  stop();
  const types=new Map(), defs=new Map(), rules=new Map();
  const register=(m,id,p)=>{check(typeof id==='string'&&key.test(id)&&!['constructor','prototype','__proto__'].includes(id),'invalid',p);check(!m.has(id),'duplicate',p);};
  const labelKey=(k,p)=>check(typeof k==='string'&&typeof s.languages['en-US'].messages[k]==='string','label',p);
  for(const t of s.types.types) {
    shape(t,['id','version','label_key','icon','enabled','template','suggested_fields'],'types');
    register(types,t.id,'types.id');version(t,'version',`types.${t.id}`);labelKey(t.label_key,`types.${t.id}.label_key`);
    check(t.template==='standard','unsupported',`types.${t.id}.template`);
    check(typeof t.enabled==='boolean'&&strings(t.suggested_fields),'invalid',`types.${t.id}`);types.set(t.id,t);
  }
  const rulesCheck=(r,p)=>{
    shape(r,['min','max','options','target_types','pattern'],p);if(!record(r))return;
    if(r.pattern!==undefined){try{compilePattern(r.pattern);}catch{check(false,'patternSyntax',p+'.pattern');}}
    if(r.min!==undefined) check(Number.isFinite(r.min),'invalid',p+'.min');
    if(r.max!==undefined) check(Number.isFinite(r.max)&&!(r.min>r.max),'invalid',p+'.max');
    if(r.options!==undefined)check(strings(r.options)&&r.options.length>0,'invalid',p+'.options');
    if(r.target_types!==undefined)check(strings(r.target_types)&&r.target_types.length>0&&r.target_types.every(t=>types.has(t)),'reference',p+'.target_types');
  };
  for(const d of s.definitions.fields) {
    shape(d,['id','version','label_key','value_type','rules','visibility','display_format'],'definitions'); register(defs,d.id,'definitions.id');version(d,'version',`definitions.${d.id}`);labelKey(d.label_key,`definitions.${d.id}.label_key`);
    if(d.display_format!==undefined)check(d.value_type==='integer'&&['number','year'].includes(d.display_format),'invalid','definitions.display_format');
    check(VALUE_TYPES.includes(d.value_type),'unsupported',`definitions.${d.id}.value_type`);rulesCheck(d.rules||{},`definitions.${d.id}.rules`); defs.set(d.id,d);
  }
  for(const t of types.values())check(t.suggested_fields?.every(id=>defs.has(id)),'reference',`types.${t.id}.suggested_fields`);
  for(const r of s.types.relationships) {
    shape(r,['id','label_key','from_types','to_types','allow_self'],'relationships.registry'); register(rules,r.id,'relationships.registry.id');labelKey(r.label_key,`relationships.${r.id}.label_key`);
    check(strings(r.from_types)&&strings(r.to_types)&&[...r.from_types,...r.to_types].every(t=>types.has(t))&&typeof r.allow_self==='boolean','invalid',`relationships.${r.id}`);rules.set(r.id,r);
  }
  stop();
  const allIds=new Set();
  for(const c of ['objects','sources','relationships','notes']) for(const r of s[c]) {
    check(record(r)&&uuid.test(r.id),'invalid',`${c}.id`); check(!allIds.has(r?.id),'duplicate',`${c}.${r?.id}`);allIds.add(r?.id);
  }
  stop();
  const objects=new Map(s.objects.map(o=>[o.id,o])), sources=new Set(s.sources.map(o=>o.id));
  const sourceRefs=(r,p)=>check(strings(r.source_ids||[])&&(r.source_ids||[]).every(id=>sources.has(id)),'reference',p+'.source_ids');
  const reference=(id,r,p)=>{const target=objects.get(id);check(!!target&&(!r.target_types||r.target_types.includes(target.type)),'reference',p);};
  for(const o of s.objects) {
    const p=`objects.${o.id}`;
    shape(o,['format_version','id','type','created_at','updated_at','display_field_id','fields','source_ids','legacy','visibility','cover_field_id','badge_ids','category_ids'],p);version(o,'format_version',p);
    check(types.has(o.type),'reference',p+'.type');check(timestamp(o.created_at)&&timestamp(o.updated_at)&&Date.parse(o.updated_at)>=Date.parse(o.created_at),'invalid',p+'.timestamps');
    check(Array.isArray(o.fields),'invalid',p+'.fields');sourceRefs(o,p);if(!Array.isArray(o.fields))continue;
    const ids=new Set();
    for(const f of o.fields) {
      const fp=p+'.fields.'+f?.id;
      shape(f,['id','label','definition_id','value_type','value','rules','observed_on','visibility','presentation','label_key','display_format'],fp);
      if(!record(f))continue;
      check(typeof f.id==='string'&&(key.test(f.id)||uuid.test(f.id))&&!ids.has(f.id),'duplicate',fp);ids.add(f.id);label(f.label,fp+'.label');
      if(f.display_format!==undefined)check(f.value_type==='integer'&&['number','year'].includes(f.display_format),'invalid',fp+'.display_format');
      check(VALUE_TYPES.includes(f.value_type),'unsupported',fp+'.value_type');
      const def=f.definition_id?defs.get(f.definition_id):null;
      if(f.definition_id)check(!!def&&def.value_type===f.value_type&&!f.rules,'invalid',fp+'.definition_id');
      rulesCheck(f.rules||{},fp+'.rules');const r=def?.rules||f.rules||{}, v=f.value;
      if(f.observed_on!==undefined)check(validDate(f.observed_on),'invalid',fp+'.observed_on');
      let valid=false;
      switch(f.value_type) {
        case 'image':valid=v===null||validImage(v);break;
        case 'gallery':valid=Array.isArray(v)&&v.length<=100&&v.every(validImage);break;
        case 'text':valid=typeof v==='string';break;
        case 'integer':valid=Number.isSafeInteger(v);break;
        case 'decimal':valid=typeof v==='number'&&Number.isFinite(v);break;
        case 'boolean':valid=typeof v==='boolean';break;
        case 'date':valid=validDate(v);break;
        case 'single-select':valid=typeof v==='string'&&Array.isArray(r.options)&&r.options.includes(v);break;
        case 'multi-select':valid=strings(v)&&Array.isArray(r.options)&&v.every(x=>r.options.includes(x));break;
        case 'text-list':valid=strings(v);break;
        case 'reference':valid=typeof v==='string';if(valid)reference(v,r,fp);break;
        case 'reference-list':valid=strings(v);if(valid)for(const id of v)reference(id,r,fp);break;
      }
      check(!!valid,'value',fp,{type:f.value_type});
      if(r.pattern!==undefined){try{check(matchesPattern(v,r.pattern),'pattern',fp);}catch{check(false,'patternSyntax',fp);}}
      if(typeof v==='number')check((r.min===undefined||v>=r.min)&&(r.max===undefined||v<=r.max),'range',fp);
    }
    if(o.display_field_id!==undefined)check(o.fields.some(f=>f?.id===o.display_field_id&&['text','single-select'].includes(f.value_type)),'reference',p+'.display_field_id');
  }
  for(const r of s.sources) {check(typeof r.title==='string'&&!!r.title.trim(),'invalid',`sources.${r.id}.title`);if(r.url)check(!!safeURL(r.url),'invalid',`sources.${r.id}.url`);if(r.accessed_on)check(validDate(r.accessed_on),'invalid',`sources.${r.id}.accessed_on`);}
  const edges=new Set();
  for(const r of s.relationships) {
    const p=`relationships.${r.id}`, rule=rules.get(r.relation_type), from=objects.get(r.from_id),to=objects.get(r.to_id);
    check(!!rule&&!!from&&!!to&&rule.from_types.includes(from.type)&&rule.to_types.includes(to.type)&&(rule.allow_self||from.id!==to.id),'reference',p);sourceRefs(r,p);
    for(const k of ['start_date','end_date'])if(r[k])check(validDate(r[k]),'invalid',p+'.'+k);
    check(!(r.start_date&&r.end_date&&r.start_date>r.end_date),'range',p);
    const edge=JSON.stringify([r.from_id,r.relation_type,r.to_id,r.start_date||'',r.end_date||'']);check(!edges.has(edge),'duplicate',p);edges.add(edge);
  }
  for(const n of s.notes){check(objects.has(n.entity_id)&&typeof n.title==='string'&&typeof n.content==='string'&&timestamp(n.created_at),'invalid',`notes.${n.id}`);sourceRefs(n,`notes.${n.id}`);if(n.observed_at)check(validDate(n.observed_at),'invalid',`notes.${n.id}.observed_at`);}
  validateProtection(s);validateFeatures(s);
  stop();return s;
}
export function withObject(snapshot,object,{isNew=false}={}) {
  if(isNew&&!snapshot.types.types.find(t=>t.id===object.type&&t.enabled))fail('disabled','type');
  const next=structuredClone(snapshot), i=next.objects.findIndex(o=>o.id===object.id);
  if(isNew&&i!==-1)fail('duplicate','object.id');
  if(i===-1)next.objects.push(object);else next.objects[i]=object;
  return validateSnapshot(next);
}
export function parseValue(type,input) {
  if(['text','date','single-select','reference'].includes(type)) return input;
  if(['text-list','multi-select','reference-list'].includes(type)) {const v=JSON.parse(input);if(!strings(v))fail('value','field',{type});return v;}
  if(type==='boolean') {if(!['true','false'].includes(input))fail('value','field',{type});return input==='true';}
  if(!input.trim()||!Number.isFinite(Number(input)))fail('value','field',{type});return Number(input);
}
