import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../assets/js/loading.js',import.meta.url),'utf8');
function guard(){const events={},loading={removed:false,remove(){this.removed=true;}},panel={hidden:true,focus(){}},details={textContent:''},nodes={'#boot-loading':loading,'#boot-error':panel,'#boot-details':details};let timeout,cleared=false;runInNewContext(source,{document:{querySelector:q=>nodes[q],body:{setAttribute(){}}},window:{addEventListener:(name,fn)=>events[name]=fn},setTimeout:fn=>(timeout=fn,1),clearTimeout:()=>cleared=true});return {events,loading,panel,details,timeout,get cleared(){return cleared;}};}
test('loading guard clears animation and timeout after real readiness',()=>{const g=guard();g.events['watchers-ready']();assert(g.loading.removed);assert(g.cleared);g.events.error({error:Error('later unrelated error')});assert(g.panel.hidden);});
test('loading guard exposes guidance for missing modules or a stalled startup',()=>{for(const mode of ['error','timeout']){const g=guard();if(mode==='error')g.events.error({target:{tagName:'SCRIPT'}});else g.timeout();assert(g.loading.removed);assert(!g.panel.hidden);assert.match(g.details.textContent,/localhost or HTTPS/);}});
