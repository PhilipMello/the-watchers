export const badgeName=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ');
export const badgeKey=name=>badgeName(name).toLocaleLowerCase('en-US');
export function effectiveBadges(snapshot,entry){
 const badges=snapshot.extensions?.badges||[];
 if(Array.isArray(entry.badge_ids))return entry.badge_ids.map(id=>badges.find(b=>b.id===id)).filter(Boolean);
 return badges.filter(b=>b.type_ids.includes(entry.type));
}
// Mutates only the editor's staged snapshot; Save Entry commits definitions and assignments together.
export function selectOrCreateBadge(snapshot,entry,name){
 const label=badgeName(name);if(!label||label.length>80)throw Error('Use a badge name between 1 and 80 characters.');
 snapshot.extensions??={format_version:'1.0.0'};snapshot.extensions.badges??=[];
 let badge=snapshot.extensions.badges.find(b=>badgeKey(b.name)===badgeKey(label));
 if(!badge){badge={id:crypto.randomUUID(),name:label,kind:'label',value:'',type_ids:[],visibility:'public'};snapshot.extensions.badges.push(badge);}
 entry.badge_ids??=effectiveBadges(snapshot,entry).map(b=>b.id);
 if(!entry.badge_ids.includes(badge.id))entry.badge_ids.push(badge.id);
 return badge;
}
export function removeBadge(snapshot,id){const next=structuredClone(snapshot);if(next.extensions?.badges)next.extensions.badges=next.extensions.badges.filter(b=>b.id!==id);for(const o of next.objects)if(o.badge_ids)o.badge_ids=o.badge_ids.filter(x=>x!==id);return next;}
