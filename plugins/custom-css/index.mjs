import {createUI} from './ui.mjs';
import {registerSettings} from '../settings/plugin-settings.mjs';
export function activate(api){api.register('collection.ui','custom-css',createUI);registerSettings(api,{name:'Custom CSS',action:'manageCSS',actionLabel:'css.manage',fields:[]});}
