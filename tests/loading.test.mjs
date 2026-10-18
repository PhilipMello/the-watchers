import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository} from '../assets/js/repository.mjs';
import {showBootFailure} from '../assets/js/boot.mjs';
import {readJSON,root} from '../scripts/io.mjs';

test('default fetch preserves the global receiver required by browser Web APIs',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=function(path){
    if(this!==globalThis)throw new TypeError('Illegal invocation');
    assert.equal(path,'data/manifest.json');
    return Promise.resolve(new Response('{}'));
  };
  try {assert.equal(new TextDecoder().decode(await new Repository().raw('data/manifest.json')),'{}');}
  finally {globalThis.fetch=original;}
});

test('HTTP errors retain status and path instead of becoming network errors',async()=>{
  const repository=new Repository(async()=>new Response('',{status:404}));
  await assert.rejects(()=>repository.open(),e=>e.issues[0].code==='http'&&e.issues[0].path==='data/manifest.json'&&e.issues[0].params.status===404);
});

test('request exceptions and response stream errors retain their cause',async()=>{
  for(const fetcher of [async()=>{throw new TypeError('Request blocked');},async()=>({ok:true,arrayBuffer:async()=>{throw new Error('Stream interrupted');}})]){
    await assert.rejects(()=>new Repository(fetcher).raw('data/manifest.json'),e=>e.issues[0].code==='network'&&!!e.issues[0].params.cause);
  }
});

test('boot failure clears loading state and presents translated diagnostics as text',async()=>{
  const lang=await readJSON(root+'lang/en-US.json');
  const nodes={'#boot-messages':{textContent:JSON.stringify(lang.messages)},'#app':{hidden:false},'#boot-error':{hidden:true,focus(){this.focused=true;}},'#boot-details':{textContent:''}};
  const documentRef={baseURI:'http://localhost:8080/project/',querySelector:id=>nodes[id]};
  showBootFailure({issues:[{code:'http',path:'data/manifest.json',params:{status:404}}]},documentRef);
  assert.equal(nodes['#app'].hidden,true);assert.equal(nodes['#boot-error'].hidden,false);assert.equal(nodes['#boot-error'].focused,true);
  assert.match(nodes['#boot-details'].textContent,/404/);assert.match(nodes['#boot-details'].textContent,/http:\/\/localhost:8080\/project\/data\/manifest.json/);
});
