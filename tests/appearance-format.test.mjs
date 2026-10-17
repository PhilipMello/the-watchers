import test from 'node:test';
import assert from 'node:assert/strict';
import {readSource,readJSON,root} from '../scripts/io.mjs';
import {validateSnapshot} from '../plugins/collection-snapshot/domain.mjs';
import {versionFeatures,publicSnapshot} from '../plugins/collection-snapshot/protection.mjs';
import {exportPackage} from '../plugins/collection-snapshot/publication.mjs';
import {selectOrCreateBadge} from '../plugins/badges/model.mjs';
import {validBadgeColor,badgeInk,badgeStyle} from '../plugins/badges/appearance.mjs';
import {fieldFormat,formatNumber} from '../plugins/custom-fields/format.mjs';

test('badge colors validate, survive public export and preserve older colorless definitions',async()=>{
 const s=await readSource(),b=selectOrCreateBadge(s,s.objects[0],'Research');validateSnapshot(s);assert(badgeStyle(b));b.color='#123456';validateSnapshot(s);const pkg=await exportPackage(versionFeatures(s),await readJSON(root+'config/app.json'));assert.equal(pkg.snapshot.extensions.badges[0].color,'#123456');assert.equal(publicSnapshot(s).extensions.badges[0].color,'#123456');
 for(const value of ['red','#abc','url(x)',null,'#123456;display:none']){b.color=value;assert.throws(()=>validateSnapshot(s));assert.throws(()=>publicSnapshot(s));assert.equal(validBadgeColor(value),false);}
});
test('badge text chooses the higher-contrast black or white across light and dark backgrounds',()=>{
 assert.equal(badgeInk('#ffffff'),'#000000');assert.equal(badgeInk('#000000'),'#ffffff');assert.equal(badgeInk('#003366'),'#ffffff');assert.equal(badgeInk('#ffff00'),'#000000');assert.throws(()=>badgeInk('red'));
 for(let n=0;n<256;n++){const color='#'+n.toString(16).padStart(2,'0').repeat(3);const c=n/255,L=c<=.04045?c/12.92:((c+.055)/1.055)**2.4;const contrast=badgeInk(color)==='#ffffff'?1.05/(L+.05):(L+.05)/.05;assert(contrast>=4.5);}
});
test('year format preserves integers, supports locales and never guesses from a translated label',()=>{
 const f={id:'custom',value_type:'integer',value:1988,display_format:'year'};for(const locale of ['en-US','pt-PT'])assert.equal(formatNumber(f,locale),'1988');assert.equal(f.value,1988);
 delete f.display_format;assert.equal(formatNumber(f,'en-US'),'1,988');f.label={'en-US':'Birth Year'};assert.equal(fieldFormat(f),'number');assert.equal(formatNumber(f,'en-US',{display_format:'year'}),'1988');f.id='attribute_birth_year';assert.equal(formatNumber(f,'en-US'),'1988');f.display_format='number';assert.equal(formatNumber(f,'en-US'),'1,988');
});
test('number formats are validated and retained in exports with additive format versioning',async()=>{
 const s=await readSource(),o=s.objects.find(o=>o.fields.some(f=>f.id==='attribute_birth_year')),f=o.fields.find(f=>f.id==='attribute_birth_year');f.display_format='year';const n=versionFeatures(s);assert.equal(n.format_version,'1.1.0');assert.equal(n.objects.find(x=>x.id===o.id).format_version,'1.1.0');validateSnapshot(n);assert.equal(publicSnapshot(n).objects.find(x=>x.id===o.id).fields.find(x=>x.id===f.id).display_format,'year');
 f.display_format='currency';assert.throws(()=>validateSnapshot(s));f.display_format='year';f.value_type='text';f.value='1988';assert.throws(()=>validateSnapshot(s));
});

test('badge dimensions and borders validate and survive publication',async()=>{
 const {validBadgeAppearance}=await import('../plugins/badges/appearance.mjs');const s=await readSource(),b=selectOrCreateBadge(s,s.objects[0],'Styled');b.color='#eeeeee';b.appearance={width:120,height:40,font_size:15,icon_size:24,padding_x:10,padding_y:6,border_width:2,border_radius:8,border_style:'dashed',border_color:'#123456'};
 validateSnapshot(s);assert(validBadgeAppearance(b.appearance));assert.match(badgeStyle(b),/width:120px/);assert.match(badgeStyle(b),/min-height:40px/);assert.match(badgeStyle(b),/border-style:dashed/);const pkg=await exportPackage(versionFeatures(s),await readJSON(root+'config/app.json'));assert.deepEqual(pkg.snapshot.extensions.badges[0].appearance,b.appearance);
 for(const invalid of [{width:241},{height:-1},{font_size:9},{border_width:1.5},{border_color:'red'},{border_style:'groove'},{position:'fixed'},null]){b.appearance=invalid;assert(!validBadgeAppearance(invalid));assert.throws(()=>validateSnapshot(s));}
});
test('card design is a validated project setting retained in public exports',async()=>{
 const s=await readSource();s.extensions={format_version:'1.0.0',settings:{'watchers.objects':{cardDesign:'classic'}}};validateSnapshot(s);assert.equal(publicSnapshot(s).extensions.settings['watchers.objects'].cardDesign,'classic');s.extensions.settings['watchers.objects'].cardDesign='frosted';validateSnapshot(s);s.extensions.settings['watchers.objects'].cardDesign='invalid';assert.throws(()=>publicSnapshot(s));
});
