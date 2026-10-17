import test from 'node:test';
import assert from 'node:assert/strict';
import {readSource} from '../scripts/io.mjs';
import {effectiveBadges,selectOrCreateBadge,removeBadge} from '../plugins/badges/model.mjs';
import {publicSnapshot,versionFeatures} from '../plugins/collection-snapshot/protection.mjs';
import {validateSnapshot} from '../plugins/collection-snapshot/domain.mjs';
import {entryPresentation} from '../plugins/objects/presentation.mjs';

test('legacy type badges remain visible but an explicit empty individual selection overrides them',async()=>{
 const s=await readSource(),o=s.objects[0];s.extensions={format_version:'1.0.0',badges:[{id:'legacy',name:'Legacy',kind:'emoji',value:'⭐',type_ids:[o.type]}]};
 assert.deepEqual(effectiveBadges(s,o).map(b=>b.id),['legacy']);o.badge_ids=[];assert.deepEqual(effectiveBadges(s,o),[]);validateSnapshot(versionFeatures(s));
});
test('individual badges reuse normalized names, avoid duplicates and do not affect peers',async()=>{
 const s=await readSource(),o=s.objects[0];o.badge_ids=[];const b=selectOrCreateBadge(s,o,'  Community   Member ');
 assert.equal(b.name,'Community Member');assert.equal(b.kind,'label');assert.equal(selectOrCreateBadge(s,o,'community member').id,b.id);assert.equal(o.badge_ids.length,1);assert.equal(s.extensions.badges.length,1);assert.equal(effectiveBadges(s,{type:o.type,badge_ids:[]}).length,0);validateSnapshot(versionFeatures(s));
});
test('global badge deletion unlinks all entities without changing the input snapshot',async()=>{
 const s=await readSource(),b=selectOrCreateBadge(s,s.objects[0],'Research');s.objects[1].badge_ids=[b.id];const next=removeBadge(s,b.id);assert(s.objects[0].badge_ids.includes(b.id));assert.deepEqual(next.objects[0].badge_ids,[]);assert.deepEqual(next.objects[1].badge_ids,[]);validateSnapshot(versionFeatures(next));
});
test('unknown and duplicate badge references are rejected',async()=>{
 const s=await readSource(),b=selectOrCreateBadge(s,s.objects[0],'Research');s.objects[0].badge_ids.push(b.id);assert.throws(()=>validateSnapshot(s));s.objects[0].badge_ids=['missing'];assert.throws(()=>publicSnapshot(s));
});
test('public projection excludes badges assigned only to private entries and keeps shared badges',async()=>{
 const s=await readSource(),o=s.objects[0];o.visibility='private';const secret=selectOrCreateBadge(s,o,'PRIVATE-BADGE-NAME'),shared=selectOrCreateBadge(s,o,'Shared');s.objects[1].badge_ids=[shared.id];const safe=publicSnapshot(versionFeatures(s));assert(!JSON.stringify(safe).includes(secret.name));assert(safe.extensions.badges.some(b=>b.id===shared.id));validateSnapshot(safe);
});
test('private image badge and its assignment never appear in a public projection',async()=>{
 const s=await readSource(),b=selectOrCreateBadge(s,s.objects[0],'PRIVATE-IMAGE');b.kind='image';b.value={src:'https://example.com/secret-badge.png',alt:'Secret',visibility:'private'};const safe=publicSnapshot(s);assert(!JSON.stringify(safe).includes('secret-badge.png'));assert.deepEqual(safe.objects[0].badge_ids,[]);validateSnapshot(safe);
});
test('card presentation uses real summary and relationships, omitting hidden or masked content',()=>{
 const o={id:'one',badge_ids:[],fields:[{id:'summary',label:{'en-US':'Summary'},value_type:'text',value:'Public summary'},{id:'photo',value_type:'image',value:{src:'https://example.com/p.jpg',alt:''}}],cover_field_id:'photo'};
 const p=entryPresentation(o,[{from_id:'one',to_id:'two'},{from_id:'two',to_id:'three'}]);assert.equal(p.description,'Public summary');assert.equal(p.connection_count,1);assert.equal(p.cover.src,'https://example.com/p.jpg');assert.deepEqual(p.badge_ids,[]);
 o.fields[0].presentation='masked';o.fields[1].presentation='hidden';assert.equal(entryPresentation(o).description,'');assert(!entryPresentation(o).cover);
});
