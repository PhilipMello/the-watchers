import {Vault,VaultStore} from './crypto.mjs';
import {createUI} from './ui.mjs';
import {registerSettings} from '../settings/plugin-settings.mjs';
export function activate(api){const vault=new Vault(new VaultStore('watchers-vault:'+new URL('.',location.href).pathname));api.register('services','vault',vault);api.register('collection.ui','privacy-vault',createUI);registerSettings(api,{name:'Privacy & Vault',action:'vaultPanel',fields:[{key:'autoLockMinutes',label:'Lock after inactivity (minutes)',type:'number',min:1,max:120,default:15}]});return ()=>vault.lock();}
