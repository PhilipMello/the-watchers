import {createUI,imageEditor,imageRender} from './ui.mjs';
import {registerSettings} from '../settings/plugin-settings.mjs';
export function activate(api){api.register('collection.ui','media',createUI);for(const type of ['image','gallery'])api.register('field.widgets',type,{editor:imageEditor,render:imageRender,empty:()=>type==='image'?null:[]});registerSettings(api,{name:'Media',scope:'project',fields:[{key:'showCaptions',label:'Show image captions',type:'boolean',default:true}]});}
