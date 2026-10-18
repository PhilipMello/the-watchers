import {CONTRACT,validateSnapshot} from '../assets/js/domain.mjs';
// The only module that knows the historical v0.0.0 collections and country keys.
export function migrateLegacy(old,registries) {
  const originalSnapshot=old.schema_version==='0.0.0'&&Array.isArray(old.entities)?structuredClone(old):null;
  if(originalSnapshot) {
    const {entities,relationships,sources,notes,...manifest}=old;
    old={manifest,relationships:{records:relationships},sources:{records:sources},notes:{records:notes},vocabulary:null};
    for(const [collection,type]of Object.entries({persons:'person',companies:'company',countries:'country',groups:'group'}))old[collection]={records:entities.filter(o=>o.type===type)};
    if(entities.some(o=>!['person','company','country','group'].includes(o.type)))throw Error('Unknown legacy entity type');
  }
  if(old.manifest?.schema_version!=='0.0.0')throw Error('Unsupported migration source');
  const refs=new Set(['nationality_country_ids','residence_country_id','registration_country_id','headquarters_country_id','operating_country_ids','base_country_id']);
  const objects=[];
  for(const collection of ['persons','companies','countries','groups'])for(const entity of old[collection].records) {
    const fields=[];
    for(const [k,v] of Object.entries(entity)) {
      if(['id','type','created_at','updated_at','attributes','source_ids'].includes(k))continue;
      if(typeof v==='string'||typeof v==='number'||typeof v==='boolean'||(Array.isArray(v)&&v.every(x=>typeof x==='string')))
        fields.push(field('legacy_'+k,k,v));
    }
    for(const [k,v]of Object.entries(entity.attributes||{})) {
      if(typeof v==='string'||typeof v==='number'||typeof v==='boolean'||(Array.isArray(v)&&v.every(x=>typeof x==='string'))) {
        const f=field('attribute_'+k,k,v);
        if(refs.has(k)){f.value_type=Array.isArray(v)?'reference-list':'reference';f.rules={target_types:['country']};}
        fields.push(f);
      }
    }
    objects.push({format_version:CONTRACT,id:entity.id,type:entity.type,created_at:entity.created_at,updated_at:entity.updated_at,display_field_id:'legacy_name',fields,source_ids:entity.source_ids||[],legacy:{source_version:'0.0.0',record:structuredClone(entity)}});
  }
  return validateSnapshot({format_version:CONTRACT,dataset_mode:old.manifest.dataset_mode,...structuredClone(registries),objects,relationships:structuredClone(old.relationships.records),sources:structuredClone(old.sources.records),notes:structuredClone(old.notes.records),legacy:{manifest:old.manifest,vocabulary:old.vocabulary,...(originalSnapshot?{snapshot:originalSnapshot}:{})}});
}
function field(id,key,value) {
  const value_type=Array.isArray(value)?'text-list':typeof value==='boolean'?'boolean':typeof value==='number'?(Number.isInteger(value)?'integer':'decimal'):'text';
  return {id,label:{'en-US':key.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())},value_type,value:structuredClone(value)};
}
