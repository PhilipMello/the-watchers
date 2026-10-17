import {badgeStyle} from './appearance.mjs';
import {effectiveBadges,selectOrCreateBadge,badgeKey} from './model.mjs';
export function badgePicker(c,getSnapshot,entry,changed){
 const {el,t}=c,created=new Set();entry.badge_ids??=effectiveBadges(getSnapshot(),entry).map(b=>b.id);
 const id='badges-'+crypto.randomUUID(),root=el('fieldset',{class:'badge-picker stack'}),selected=el('div',{class:'chips'}),suggestions=el('div',{class:'badge-suggestions',id:id+'-suggestions'}),status=el('p',{class:'muted small',role:'status','aria-live':'polite'}),input=el('input',{type:'text',id,autocomplete:'off',maxlength:80,placeholder:t('badges.placeholder'),'aria-describedby':id+'-help'});
 const choose=name=>{try{const s=getSnapshot(),before=new Set((s.extensions?.badges||[]).map(b=>b.id)),badge=selectOrCreateBadge(s,entry,name);if(!before.has(badge.id))created.add(badge.id);changed();input.value='';status.textContent=t('badges.selected',{name:badge.name});paint();input.focus();}catch(e){status.textContent=e.message;}};
 const paint=()=>{const s=getSnapshot();selected.replaceChildren(...effectiveBadges(s,entry).map(b=>el('span',{class:'selected-badge'},el('span',{class:'badge',style:badgeStyle(b)},b.kind==='emoji'?b.value+' '+b.name:b.name),el('button',{type:'button',class:'icon-button','aria-label':t('badges.remove',{name:b.name}),onclick:()=>{entry.badge_ids=entry.badge_ids.filter(id=>id!==b.id);if(created.has(b.id)){s.extensions.badges=s.extensions.badges.filter(x=>x.id!==b.id);created.delete(b.id);}changed();status.textContent=t('badges.removed',{name:b.name});paint();input.focus();}},'×'))));
 const q=badgeKey(input.value);suggestions.replaceChildren();if(!q)return;
 const matches=(s.extensions?.badges||[]).filter(b=>!entry.badge_ids.includes(b.id)&&badgeKey(b.name).includes(q)).slice(0,10);
 suggestions.append(...matches.map(b=>el('button',{type:'button',style:badgeStyle(b),onclick:()=>choose(b.name)},b.kind==='emoji'?b.value+' '+b.name:b.name)));
 if(!(s.extensions?.badges||[]).some(b=>badgeKey(b.name)===q))suggestions.append(el('button',{type:'button',class:'badge-create',onclick:()=>choose(input.value)},t('badges.createTag',{name:input.value.trim()})));
 };
 input.addEventListener('input',paint);input.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();e.stopPropagation?.();if(input.value.trim())choose(input.value);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation?.();input.value='';paint();}});
 root.append(el('legend',{},t('badges.title')),el('label',{for:id,class:'sr-only'},t('badges.title')),selected,input,el('p',{id:id+'-help',class:'muted small'},t('badges.pickerHelp')),suggestions,status);paint();return root;
}
