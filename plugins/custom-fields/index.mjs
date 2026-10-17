import {createUI} from './ui.mjs';
import {fieldLibrary} from './library.mjs';
import {registerSettings} from '../settings/plugin-settings.mjs';
export function activate(api){api.register('collection.ui','custom-fields',c=>({...createUI(c),...fieldLibrary(c)}));registerSettings(api,{name:'Custom Fields',action:'manageFields',actionLabel:'fieldPicker.library',fields:[]});}
