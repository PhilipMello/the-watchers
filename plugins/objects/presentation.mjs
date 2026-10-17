// Shared by the static index and the in-memory workspace.
export function entryPresentation(entry,relationships=[]){
 const visible=entry.fields.filter(f=>!['hidden','masked'].includes(f.presentation));
 const text=visible.filter(f=>f.value_type==='text'&&f.id!==entry.display_field_id&&typeof f.value==='string');
 const summary=text.find(f=>/(?:^|[._\s])(summary|bio|description|resumo|descrição)$/i.test([f.id,f.label_key,f.definition_id,f.label?.['en-US']].filter(Boolean).join(' ')));
 const coverField=visible.find(f=>f.id===entry.cover_field_id);
 const cover=coverField?.value_type==='image'?coverField.value:coverField?.value_type==='gallery'?coverField.value[0]:null;
 return {...(entry.category_ids!==undefined?{category_ids:[...entry.category_ids]}:{}),description:summary?.value.trim().slice(0,320)||'',connection_count:relationships.filter(r=>r.from_id===entry.id||r.to_id===entry.id).length,...(cover?{cover}:{}),...(entry.badge_ids!==undefined?{badge_ids:[...entry.badge_ids]}:{})};
}
