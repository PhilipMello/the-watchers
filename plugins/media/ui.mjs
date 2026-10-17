import {packImage} from './assets.mjs';
import {validImage} from '../collection-snapshot/protection.mjs';
export function imageNode(c,value,{cover=false}={}){if(!value||!validImage(value))return c.el('span',{},'');const img=c.el('img',{src:c.mediaSrc(value.src),alt:value.alt,loading:'lazy',referrerpolicy:'no-referrer',class:cover?'cover-image':'entry-image'});img.addEventListener('error',()=>{if(cover)img.remove();else img.replaceWith?.(c.el('span',{class:'muted'},c.t('media.unavailable')));});return img;}
export function imageEditor(c,f,onChange){
 const {el,button,t}=c;let values=f.value_type==='gallery'?[...(f.value||[])]:f.value?[f.value]:[];
 const wrap=el('div',{class:'stack media-editor'}),list=el('div',{class:'media-list'}),url=el('input',{type:'url',placeholder:'https://…','aria-label':t('media.url')}),upload=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp,image/gif',multiple:f.value_type==='gallery','aria-label':t('media.upload')}),error=el('p',{role:'alert'});
 const change=()=>{onChange(f.value_type==='gallery'?[...values]:values[0]||null);paint();};
 const add=value=>{if(f.value_type==='gallery')values.push(value);else values=[value];change();};
 const paint=()=>list.replaceChildren(...values.map((v,i)=>{const alt=el('input',{value:v.alt,'aria-label':t('media.alt')});alt.addEventListener('input',()=>{v.alt=alt.value;onChange(f.value_type==='gallery'?[...values]:values[0]);});return el('div',{class:'media-item'},imageNode(c,v),alt,el('div',{class:'row'},i?button('media.first',()=>{values.splice(i,1);values.unshift(v);change();}):el('span',{class:'badge'},t('media.primary')),button('action.remove',()=>{values.splice(i,1);change();})));}));
 const addURL=button('media.addURL',()=>{error.textContent='';const value={src:url.value.trim(),alt:''};if(!validImage(value)){error.textContent=t('media.https');return;}add(value);url.value='';});
 upload.addEventListener('change',()=>c.run(async()=>{upload.disabled=true;error.textContent='';try{for(const file of upload.files||[]){const {path,asset}=await packImage(new Uint8Array(await file.arrayBuffer()));await c.addAsset(path,asset);add({src:path,alt:file.name.replace(/\.[^.]+$/,'')});}}catch(e){error.textContent=e.message;}finally{upload.disabled=false;upload.value='';}}));
 wrap.append(list,el('div',{class:'row'},url,addURL),c.field('media.upload',upload),el('p',{class:'muted small'},t('media.uploadHelp')),error);paint();return wrap;
}
export function imageRender(c,f){const values=f.value_type==='gallery'?f.value:f.value?[f.value]:[],s=c.projectSettings?.('watchers.media')||{};return c.el('div',{class:'image-gallery'},values.map(v=>c.el('figure',{},imageNode(c,v),s.showCaptions!==false&&v.alt?c.el('figcaption',{},v.alt):null)));}
export function createUI(c){return {coverNode:v=>imageNode(c,v,{cover:true})};}
