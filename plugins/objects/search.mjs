import {displayName} from '../collection-snapshot/domain.mjs';
import {effectiveBadges} from '../badges/model.mjs';
export const normalize=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
const visible=f=>!['hidden','masked'].includes(f.presentation);
const scalar=value=>Array.isArray(value)?value:[value];
export function searchCatalog(snapshot){
 const objects=new Map(snapshot.objects.map(o=>[o.id,o])),definitions=new Map(snapshot.definitions.fields.map(d=>[d.id,d]));
 const fields=new Map([
  ['name',{id:'name',label:'Name',kind:'text'}],['type',{id:'type',label:'Type',kind:'text'}],
  ['badges',{id:'badges',label:'Badges',kind:'text'}],['categories',{id:'categories',label:'Categories',kind:'text'}],
  ['created_at',{id:'created_at',label:'Created date',kind:'date'}],['updated_at',{id:'updated_at',label:'Updated date',kind:'date'}]
 ]);
 const key=f=>f.definition_id?'field:'+f.definition_id:f.label_key?'key:'+f.label_key:'local:'+normalize(f.label?.['en-US'])+':'+f.value_type;
 const descriptor=(f,d)=>({id:key(f),label:snapshot.languages['en-US'].messages[d?.label_key]||f.label?.['en-US']||d?.label_key||f.id,kind:f.value_type});
 for(const d of definitions.values())fields.set('field:'+d.id,descriptor({definition_id:d.id,value_type:d.value_type},d));
 for(const o of snapshot.objects)for(const f of o.fields.filter(visible))if(!fields.has(key(f)))fields.set(key(f),descriptor(f));
 function values(entry,id){
  if(id==='name')return [displayName(entry)];
  if(id==='type'){const type=snapshot.types.types.find(t=>t.id===entry.type);return [...new Set([entry.type,snapshot.languages['en-US'].messages[type?.label_key]].filter(Boolean))];}
  if(id==='badges')return effectiveBadges(snapshot,entry).map(x=>x.name);
  if(id==='categories')return (snapshot.extensions?.categories||[]).filter(x=>entry.category_ids?.includes(x.id)).map(x=>x.name);
  if(id==='created_at'||id==='updated_at')return entry[id]?[entry[id].slice(0,10)]:[];
  return entry.fields.filter(f=>visible(f)&&key(f)===id).flatMap(f=>{
   if(f.value_type==='image'||f.value_type==='gallery')return scalar(f.value).filter(Boolean).flatMap(x=>[x.src,x.alt,x.caption].filter(Boolean));
   if(f.value_type.startsWith('reference'))return scalar(f.value).filter(id=>objects.has(id)).map(id=>displayName(objects.get(id)));
   return scalar(f.value).filter(x=>x!==null&&x!==undefined&&x!=='');
  });
 }
 const compare=(a,b,kind)=>['integer','decimal'].includes(kind)?Number(a)-Number(b):normalize(a)<normalize(b)?-1:normalize(a)>normalize(b)?1:0;
 function matches(entry,filters){return filters.every(rule=>{
  const field=fields.get(rule.field);if(!field)return false;
  const list=values(entry,rule.field);if(rule.operator==='exists')return list.length>0;if(rule.operator==='missing')return list.length===0;
  if(!list.length)return false;
  const equal=v=>compare(v,rule.value,field.kind)===0;
  if(rule.operator==='not')return !list.some(equal);
  return list.some(v=>{const cmp=compare(v,rule.value,field.kind);switch(rule.operator){case 'contains':return normalize(v).includes(normalize(rule.value));case 'eq':return equal(v);case 'gte':return cmp>=0;case 'lte':return cmp<=0;case 'gt':return cmp>0;case 'lt':return cmp<0;default:return false;}});
 });}
 const text=new Map(snapshot.objects.map(entry=>[entry.id,[...fields.keys()].flatMap(id=>values(entry,id)).map(normalize).join(' ')]));
 return {fields:[...fields.values()],values,matches,search:(entry,query)=>normalize(query).split(/\s+/).filter(Boolean).every(term=>text.get(entry.id)?.includes(term)),suggestions:id=>[...new Set(snapshot.objects.flatMap(o=>values(o,id)).map(String))].sort((a,b)=>a.localeCompare(b,'en-US'))};
}
export function operators(kind){return ['integer','decimal','date'].includes(kind)?['eq','not','gte','lte','gt','lt','exists','missing']:kind==='boolean'?['eq','not','exists','missing']:['contains','eq','not','exists','missing'];}
export function validateFilter(catalog,rule){
 const field=catalog.fields.find(x=>x.id===rule.field);if(!field||!operators(field.kind).includes(rule.operator))throw Error('Choose a valid field and condition.');
 if(['exists','missing'].includes(rule.operator))return {...rule,value:''};
 const value=String(rule.value).trim();if(!value)throw Error('Enter a filter value.');
 if(['integer','decimal'].includes(field.kind)&&(!Number.isFinite(Number(value))||(field.kind==='integer'&&!Number.isInteger(Number(value)))))throw Error('Enter a valid '+(field.kind==='integer'?'whole number.':'number.'));
 if(field.kind==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('Enter a valid date.');
 if(field.kind==='boolean'&&!['true','false'].includes(value))throw Error('Choose true or false.');
 return {...rule,value};
}
