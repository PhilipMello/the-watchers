import {normalized} from '../custom-fields/creatable-picker.mjs';
export function selectCategory(snapshot,entry,name){
 name=name.normalize('NFKC').trim().replace(/\s+/g,' ');if(!name||name.length>80)throw Error('Category name must contain 1–80 characters.');
 snapshot.extensions??={format_version:'1.0.0'};snapshot.extensions.categories??=[];let category=snapshot.extensions.categories.find(x=>normalized(x.name)===normalized(name));
 if(!category){category={id:crypto.randomUUID(),name,description:'',visibility:'public'};snapshot.extensions.categories.push(category);}
 entry.category_ids??=[];if(!entry.category_ids.includes(category.id))entry.category_ids.push(category.id);return category;
}
export function removeCategory(snapshot,id){const next=structuredClone(snapshot);if(next.extensions?.categories)next.extensions.categories=next.extensions.categories.filter(x=>x.id!==id);for(const entry of next.objects)if(entry.category_ids)entry.category_ids=entry.category_ids.filter(x=>x!==id);return next;}
