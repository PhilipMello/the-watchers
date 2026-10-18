import {createUI} from './ui.mjs';
import {registerSettings} from '../settings/plugin-settings.mjs';
export function activate(api){api.register('collection.ui','categories',createUI);registerSettings(api,{name:'Categories',scope:'project',action:'manageCategories',actionLabel:'categories.manage',fields:[{key:'showCatalog',label:'Show categories on cards',type:'boolean',default:true},{key:'showDetail',label:'Show categories on profiles',type:'boolean',default:true}]});}
