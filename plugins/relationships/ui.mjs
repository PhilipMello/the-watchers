export function createUI(c){
const {el,t,link,name,types,ensureSnapshot}=c;
function connectionList(list){return list.length?el('ul',{class:'clean'},list.map(r=>el('li',{},link(name(r.from_id),'#object/'+r.from_id),' → ',t(types().relationships.find(x=>x.id===r.relation_type).label_key),' → ',link(name(r.to_id),'#object/'+r.to_id),r.note?el('p',{class:'muted small'},r.note):null))):el('p',{class:'muted'},t('detail.empty'));}

async function relationshipPage(main){const snapshot=await ensureSnapshot();main.append(el('h1',{},t('nav.relationships')),el('section',{class:'panel'},connectionList(snapshot.relationships)));}
return {connectionList,relationshipPage};
}
