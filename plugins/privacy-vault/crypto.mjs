const enc=new TextEncoder(),dec=new TextDecoder();
export const base64=bytes=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
export const unbase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const iterations=600000,aad=enc.encode('watchers-vault:1');
async function derive(password,salt){if(typeof password!=='string'||password.length<12)throw Error('Use a vault passphrase of at least 12 characters.');const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function createKey(password){const salt=crypto.getRandomValues(new Uint8Array(16));return {key:await derive(password,salt),salt:base64(salt)};}
export function validateEnvelope(e){if(!e||e.format!=='watchers-vault'||e.version!==1||e.kdf!=='PBKDF2-SHA256'||e.iterations!==iterations||e.cipher!=='AES-256-GCM'||typeof e.data!=='string'||e.data.length>180*1024*1024||unbase64(e.salt).length!==16||unbase64(e.iv).length!==12)throw Error('Unsupported or damaged vault.');return e;}
export async function seal(value,session){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=enc.encode(JSON.stringify(value));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},session.key,bytes);return {format:'watchers-vault',version:1,kdf:'PBKDF2-SHA256',iterations,cipher:'AES-256-GCM',salt:session.salt,iv:base64(iv),data:base64(new Uint8Array(data))};}
export async function open(envelope,password){validateEnvelope(envelope);const session={key:await derive(password,unbase64(envelope.salt)),salt:envelope.salt};try{const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(envelope.iv),additionalData:aad},session.key,unbase64(envelope.data));return {session,value:JSON.parse(dec.decode(bytes))};}catch{throw Error('Incorrect passphrase or damaged vault.');}}
export class VaultStore {
 constructor(name='watchers-vault'){this.name=name;}
 async db(){if(!globalThis.indexedDB)throw Error('IndexedDB is required for the encrypted vault.');return new Promise((resolve,reject)=>{const r=indexedDB.open(this.name,1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async read(){const db=await this.db();try{return await new Promise((resolve,reject)=>{const r=db.transaction('vault').objectStore('vault').get('current');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
 async write(value,expected){const db=await this.db();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('vault','readwrite'),store=tx.objectStore('vault'),r=store.get('current');let conflict=false;r.onsuccess=()=>{if((r.result?.data||null)!==expected){conflict=true;tx.abort();return;}store.put(value,'current');};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(Error(conflict?'Vault changed in another tab. Reload before saving.':'Vault save failed.'));});}finally{db.close();}}
}
export class Vault {
 constructor(store){this.store=store;this.session=null;this.payload=null;this.envelope=null;this.loaded=false;this.queue=Promise.resolve();}
 async load(){if(!this.loaded){this.envelope=await this.store.read();this.loaded=true;}return this.envelope;}
 get unlocked(){return !!this.session;}
 async setup(password,payload){if(await this.load())throw Error('Unlock the existing vault first.');this.session=await createKey(password);this.payload=payload;try{await this.save(payload);}catch(e){this.lock();throw e;}}
 async unlock(password){const e=await this.load();if(!e)throw Error('Create a vault first.');const result=await open(e,password);this.session=result.session;this.payload=result.value;return this.payload;}
 save(payload){const run=async()=>{if(!this.session)throw Error('Unlock the vault first.');const e=await seal(payload,this.session);await this.store.write(e,this.envelope?.data||null);this.envelope=e;this.payload=structuredClone(payload);};const task=this.queue.then(run);this.queue=task.catch(()=>{});return task;}
 async changePassword(password){if(!this.unlocked)throw Error('Unlock the vault first.');const old=this.session;this.session=await createKey(password);try{await this.save(this.payload);}catch(e){this.session=old;throw e;}}
 lock(){this.session=null;this.payload=null;}
 async restore(envelope,password){const result=await open(envelope,password);await this.load();await this.store.write(envelope,this.envelope?.data||null);this.envelope=envelope;this.session=result.session;this.payload=result.value;return result.value;}
}
