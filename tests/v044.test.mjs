import test from 'node:test';
import assert from 'node:assert/strict';
import {readSource,readJSON,root,writeJSON} from '../scripts/io.mjs';
import {validateSnapshot,objectPath} from '../plugins/collection-snapshot/domain.mjs';
import {publicSnapshot} from '../plugins/collection-snapshot/protection.mjs';
import {exportPackage,diffFiles,publication} from '../plugins/collection-snapshot/publication.mjs';
import {packImage} from '../plugins/media/assets.mjs';
import {selectCategory,removeCategory} from '../plugins/categories/model.mjs';
import {defaults,stylesheet,validateCSSState} from '../plugins/custom-css/model.mjs';
import {languageDraft} from '../plugins/collection-snapshot/workspace.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
const app=await readJSON(root+'config/app.json');
test('categories reuse normalized names, support many per entry, remove assignments and validate identifiers',async()=>{
 const s=await readSource(),entry=s.objects[0],first=selectCategory(s,entry,'Developer');assert.equal(selectCategory(s,entry,' developer ').id,first.id);selectCategory(s,entry,'Founder');assert.equal(entry.category_ids.length,2);validateSnapshot(s);
 const next=removeCategory(s,first.id);assert.equal(next.objects[0].category_ids.length,1);validateSnapshot(next);next.objects[0].category_ids.push('missing');assert.throws(()=>validateSnapshot(next));
});
test('private-only categories and assignments are removed from public exports',async()=>{
 const s=await readSource();s.objects[0].visibility='private';const category=selectCategory(s,s.objects[0],'PRIVATE-CATEGORY');const safe=publicSnapshot(s);assert(!JSON.stringify(safe).includes(category.id));assert(!JSON.stringify(safe).includes('PRIVATE-CATEGORY'));
});
test('locale metadata validates emoji, HTTPS images, uploads and rejects malformed metadata',async()=>{
 const s=await readSource(),locale=s.languages['en-US'];locale.display_name='English';locale.flag={kind:'emoji',value:'🇬🇧'};validateSnapshot(s);languageDraft(locale,locale);
 locale.flag={kind:'image',value:{src:'https://example.com/flag.png',alt:'Flag'}};validateSnapshot(s);
 for(const flag of [{kind:'emoji',value:''},{kind:'image',value:{src:'javascript:bad',alt:''}},{kind:'image',value:{src:'https://example.com/a',alt:'',visibility:'private'}}]){locale.flag=flag;assert.throws(()=>validateSnapshot(s));assert.throws(()=>languageDraft(locale,locale));}
});
test('flags, categories and CSS images survive public package, CLI import and build with correct source hashes',async()=>{
 const s=await readSource(),{path,asset}=await packImage(png),category=selectCategory(s,s.objects[0],'Developer');
 s.languages['en-US'].display_name='English';s.languages['en-US'].flag={kind:'image',value:{src:path,alt:'Flag'}};
 s.extensions.custom_css={...defaults(),css:'.card { background-image: url("'+path+'"); }',assets:[{src:path,alt:'Texture'}]};
 const pkg=await exportPackage(s,app,{[path]:asset});assert.equal(Object.keys(pkg.assets).length,1);assert.equal(pkg.snapshot.objects[0].category_ids[0],category.id);
 const temp=await mkdtemp(join(tmpdir(),'watchers-v044-'));try{const input=join(temp,'package.json'),project=join(temp,'project');await writeJSON(input,pkg);execFileSync(process.execPath,['scripts/import.mjs',input,project],{cwd:root,stdio:'pipe'});execFileSync(process.execPath,['scripts/build.mjs'],{cwd:project,stdio:'pipe'});const loaded=await readSource(project);assert.deepEqual(loaded.languages['en-US'].flag,s.languages['en-US'].flag);assert.equal(loaded.extensions.custom_css.css,s.extensions.custom_css.css);assert.deepEqual(new Uint8Array(await readFile(join(project,'dist',path))),png);assert.deepEqual(diffFiles(await readJSON(join(project,'dist/data/source-hashes.json')),(await publication(loaded,app,{[path]:asset})).files),[]);}finally{await rm(temp,{recursive:true,force:true});}
});
test('CSS state is bounded and generates both visual variables and arbitrary CSS rules',()=>{
 const state=defaults();state.variables.fontSize=24;state.css='@media (min-width: 800px) { .card { width: 400px; } }';assert(stylesheet(state).includes('--watchers-font-size: 24px'));assert(stylesheet(state).includes('@media'));assert.throws(()=>validateCSSState({...state,variables:{...state.variables,fontSize:NaN}}));assert.throws(()=>validateCSSState({...state,enabled:'yes'}));
});
test('new metadata participates in GitHub publication while unchanged files remain untouched',async()=>{
 const s=await readSource(),base=(await publication(s,app)).files;selectCategory(s,s.objects[0],'Singer');s.languages['en-US'].flag={kind:'emoji',value:'🇺🇸'};s.extensions.custom_css=defaults();
 assert.deepEqual(diffFiles(base,(await publication(s,app)).files).map(x=>x.path).sort(),['data/meta.json','lang/en-US.json',objectPath(s.objects[0])].sort());
});
