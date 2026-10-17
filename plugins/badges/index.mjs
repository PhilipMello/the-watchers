import {createUI} from './ui.mjs';
import {registerSettings} from '../settings/plugin-settings.mjs';
export function activate(api){api.register('collection.ui','badges',createUI);registerSettings(api,{name:'Badges',scope:'project',action:'manageBadges',fields:[{key:'showCatalog',label:'Show on catalog cards',type:'boolean',default:true},{key:'showDetail',label:'Show on entry details',type:'boolean',default:true}]});}
