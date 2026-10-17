import {validateCSSState} from '../custom-css/model.mjs';
import {validBadgeColor,validBadgeAppearance} from '../badges/appearance.mjs';
import {fail} from '../../core/errors.mjs';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const assetPath=p=>typeof p==='string'&&/^media\/[0-9a-f]{64}\.(png|jpg|webp|gif)$/.test(p);
export function validImage(v){
 if(!record(v)||Object.keys(v).some(k=>!['src','alt','visibility'].includes(k))||typeof v.alt!=='string'||v.alt.length>2000||!['public','private',undefined].includes(v.visibility))return false;
 if(assetPath(v.src))return true;
 try{const u=new URL(v.src);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
export function validLocaleMetadata(catalog){
 if(catalog.display_name!==undefined&&(typeof catalog.display_name!=='string'||!catalog.display_name.trim()||catalog.display_name.length>100))return false;
 const flag=catalog.flag;if(flag===undefined)return true;
 return record(flag)&&Object.keys(flag).every(k=>['kind','value'].includes(k))&&(flag.kind==='emoji'?typeof flag.value==='string'&&!!flag.value.trim()&&flag.value.length<=32:flag.kind==='image'&&validImage(flag.value)&&flag.value.visibility!=='private');
}
export function visibility(v){if(v?.visibility!==undefined&&!['public','private'].includes(v.visibility))fail('invalid','visibility');return v?.visibility||'public';}
export function validateProtection(s){
 for(const list of [s.objects,s.sources,s.relationships,s.notes,s.definitions.fields])for(const x of list)visibility(x);
 for(const o of s.objects){for(const f of o.fields){visibility(f);if(f.presentation!==undefined&&!['normal','hidden','masked'].includes(f.presentation))fail('invalid','field.presentation');if(f.label_key!==undefined&&(!/^field\.[a-z][a-z0-9_.]*$/.test(f.label_key)||typeof s.languages['en-US'].messages[f.label_key]!=='string'))fail('invalid','field.label_key');}
 if(o.cover_field_id!==undefined&&!o.fields.some(f=>f.id===o.cover_field_id&&['image','gallery'].includes(f.value_type)))fail('invalid','cover_field_id');}
}
export function validateFeatures(s){
 const e=s.extensions;const known=new Set(Array.isArray(e?.badges)?e.badges.map(b=>b?.id):[]);for(const o of s.objects)if(o.badge_ids!==undefined&&(!Array.isArray(o.badge_ids)||new Set(o.badge_ids).size!==o.badge_ids.length||o.badge_ids.some(id=>typeof id!=='string'||!known.has(id))))fail('reference','object.badge_ids');if(e===undefined){for(const o of s.objects)if(o.category_ids!==undefined&&(!Array.isArray(o.category_ids)||o.category_ids.length))fail('reference','object.category_ids');return;}
 if(!record(e)||e.format_version!=='1.0.0'||Object.keys(e).some(k=>!['format_version','badges','settings','categories','custom_css'].includes(k)))fail('invalid','extensions');
 if(e.settings!==undefined){if(!record(e.settings))fail('invalid','extensions.settings');for(const [id,v]of Object.entries(e.settings)){const allowed={'watchers.media':['showCaptions'],'watchers.badges':['showCatalog','showDetail'],'watchers.objects':['cardDesign'],'watchers.categories':['showCatalog','showDetail']}[id];if(!allowed||!record(v)||Object.entries(v).some(([k,x])=>!allowed.includes(k)||(id==='watchers.objects'?!['classic','frosted'].includes(x):typeof x!=='boolean')))fail('invalid','extensions.settings');}}
 const categories=e.categories||[];if(!Array.isArray(categories))fail('invalid','categories');const categoryIds=new Set(),categoryNames=new Set();
 for(const category of categories){const normalized=typeof category.name==='string'?category.name.normalize('NFKC').trim().toLowerCase():'';if(!record(category)||Object.keys(category).some(k=>!['id','name','description','visibility'].includes(k))||typeof category.id!=='string'||!category.id||categoryIds.has(category.id)||!normalized||category.name.length>80||categoryNames.has(normalized)||category.description!==undefined&&(typeof category.description!=='string'||category.description.length>2000))fail('invalid','category');categoryIds.add(category.id);categoryNames.add(normalized);visibility(category);}
 for(const entry of s.objects)if(entry.category_ids!==undefined&&(!Array.isArray(entry.category_ids)||new Set(entry.category_ids).size!==entry.category_ids.length||entry.category_ids.some(id=>!categoryIds.has(id))))fail('reference','object.category_ids');
 if(e.custom_css!==undefined){try{validateCSSState(e.custom_css);}catch{fail('invalid','custom_css');}if(!e.custom_css.assets.every(asset=>validImage(asset)&&asset.visibility!=='private'))fail('invalid','custom_css.assets');}
 if(e.badges!==undefined){if(!Array.isArray(e.badges))fail('invalid','badges');const ids=new Set();for(const b of e.badges){if(!record(b)||Object.keys(b).some(k=>!['id','name','kind','value','type_ids','visibility','color','appearance'].includes(k))||typeof b.id!=='string'||ids.has(b.id)||typeof b.name!=='string'||!b.name.trim()||!Array.isArray(b.type_ids)||!b.type_ids.every(id=>s.types.types.some(t=>t.id===id))||!['label','emoji','image'].includes(b.kind)||(b.kind==='label'?b.value!=='':b.kind==='emoji'?(typeof b.value!=='string'||!b.value.trim()||b.value.length>32):!validImage(b.value)))fail('invalid','badge');if(b.color!==undefined&&!validBadgeColor(b.color))fail('invalid','badge.color');if(b.appearance!==undefined&&!validBadgeAppearance(b.appearance))fail('invalid','badge.appearance');ids.add(b.id);visibility(b);}}
}
export const images=s=>[...s.objects.flatMap(o=>o.fields.flatMap(f=>f.value_type==='image'?(f.value?[f.value]:[]):f.value_type==='gallery'?f.value:[])),...(s.extensions?.badges||[]).filter(b=>b.kind==='image').map(b=>b.value),...Object.values(s.languages||{}).filter(l=>l.flag?.kind==='image').map(l=>l.flag.value),...(s.extensions?.custom_css?.assets||[])];
export const referencedAssets=s=>[...new Set(images(s).map(v=>v.src).filter(assetPath))];
// Shared by browser export, GitHub and CLI build; never depends on an enabled UI plugin.
export function publicSnapshot(input){
 validateProtection(input);validateFeatures(input);
 const protect=[...input.objects,...input.sources,...input.notes,...input.relationships,...input.definitions.fields,...(input.extensions?.badges||[]),...(input.extensions?.categories||[]),...input.objects.flatMap(o=>o.fields),...images(input)].some(x=>visibility(x)==='private');
 const s=structuredClone(input),privateKeys=new Set(),allSourceRefs=new Set([...s.objects,...s.notes,...s.relationships].flatMap(x=>x.source_ids||[]));
 const privateDefs=new Set(s.definitions.fields.filter(d=>visibility(d)==='private').map(d=>d.id));
 const omitField=f=>{if(f.label_key)privateKeys.add(f.label_key);};
 s.objects=s.objects.filter(o=>{if(visibility(o)==='private'){o.fields.forEach(omitField);return false;}return true;});
 const objectIds=new Set(s.objects.map(o=>o.id));
 for(const o of s.objects){
  o.fields=o.fields.filter(f=>{const ok=visibility(f)==='public'&&!privateDefs.has(f.definition_id);if(!ok)omitField(f);return ok;}).filter(f=>f.value_type!=='reference'||objectIds.has(f.value));
  for(const f of o.fields){if(f.value_type==='reference-list')f.value=f.value.filter(id=>objectIds.has(id));if(f.value_type==='gallery')f.value=f.value.filter(v=>visibility(v)==='public');}
  o.fields=o.fields.filter(f=>f.value_type!=='image'||!f.value||visibility(f.value)==='public');
  for(const k of ['display_field_id','cover_field_id'])if(o[k]&&!o.fields.some(f=>f.id===o[k]))delete o[k];
  if(protect)delete o.legacy;
 }
 s.relationships=s.relationships.filter(r=>visibility(r)==='public'&&objectIds.has(r.from_id)&&objectIds.has(r.to_id));
 s.notes=s.notes.filter(n=>visibility(n)==='public'&&objectIds.has(n.entity_id));
 const refs=new Set([...s.objects,...s.notes,...s.relationships].flatMap(x=>x.source_ids||[]));
 s.sources=s.sources.filter(x=>visibility(x)==='public'&&(!allSourceRefs.has(x.id)||refs.has(x.id)));
 const sourceIds=new Set(s.sources.map(x=>x.id));for(const x of [...s.objects,...s.notes,...s.relationships])if(x.source_ids)x.source_ids=x.source_ids.filter(id=>sourceIds.has(id));
 const used=new Set(s.objects.flatMap(o=>o.fields.map(f=>f.definition_id))),originalUsed=new Set(input.objects.flatMap(o=>o.fields.map(f=>f.definition_id)));
 s.definitions.fields=s.definitions.fields.filter(d=>{if(privateDefs.has(d.id)||originalUsed.has(d.id)&&!used.has(d.id)){privateKeys.add(d.label_key);return false;}return true;});
 const defIds=new Set(s.definitions.fields.map(d=>d.id));for(const t of s.types.types)t.suggested_fields=t.suggested_fields.filter(id=>defIds.has(id));
 const publicKeys=new Set([...s.definitions.fields.map(d=>d.label_key),...s.objects.flatMap(o=>o.fields.map(f=>f.label_key))]);
 for(const lang of Object.values(s.languages))for(const key of privateKeys)if(!publicKeys.has(key))delete lang.messages[key];
 if(s.extensions){
 const previouslyAssigned=new Set(input.objects.flatMap(o=>o.badge_ids||[])),publicAssigned=new Set(s.objects.flatMap(o=>o.badge_ids||[]));
 s.extensions.badges=(s.extensions.badges||[]).filter(b=>visibility(b)==='public'&&(b.kind!=='image'||visibility(b.value)==='public')&&(!previouslyAssigned.has(b.id)||publicAssigned.has(b.id)||b.type_ids.length));
 const privateAssigned=new Set(input.objects.flatMap(o=>o.category_ids||[])),publicCategories=new Set(s.objects.flatMap(o=>o.category_ids||[]));if(s.extensions.categories)s.extensions.categories=s.extensions.categories.filter(category=>visibility(category)==='public'&&(!privateAssigned.has(category.id)||publicCategories.has(category.id)));const allowedCategories=new Set((s.extensions.categories||[]).map(x=>x.id));for(const o of s.objects)if(o.category_ids)o.category_ids=o.category_ids.filter(id=>allowedCategories.has(id));
 const allowed=new Set(s.extensions.badges.map(b=>b.id));for(const o of s.objects)if(o.badge_ids)o.badge_ids=o.badge_ids.filter(id=>allowed.has(id));
 }
 if(protect)delete s.legacy;return s;
}
export function containsPrivate(s){return JSON.stringify(publicSnapshot(s))!==JSON.stringify(s)&&([...s.objects,...s.sources,...s.notes,...s.relationships,...s.definitions.fields,...(s.extensions?.badges||[]),...(s.extensions?.categories||[])].some(x=>visibility(x)==='private')||s.objects.some(o=>o.fields.some(f=>visibility(f)==='private'))||images(s).some(v=>visibility(v)==='private'));}
export function versionFeatures(s){const n=structuredClone(s);if(n.extensions||[...n.sources,...n.notes,...n.relationships,...n.definitions.fields].some(x=>x.visibility||x.display_format)||n.objects.some(o=>o.visibility||o.cover_field_id||o.badge_ids||o.category_ids||o.fields.some(f=>f.visibility||f.presentation||f.label_key||f.display_format||['image','gallery'].includes(f.value_type))))n.format_version='1.1.0';for(const o of n.objects)if(o.visibility||o.cover_field_id||o.badge_ids||o.category_ids||o.fields.some(f=>f.visibility||f.presentation||f.label_key||f.display_format||['image','gallery'].includes(f.value_type)))o.format_version='1.1.0';return n;}
