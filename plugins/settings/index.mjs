import {createUI} from './ui.mjs';
import {createSettingsUI} from './plugin-settings.mjs';
export function activate(api){api.register('collection.ui','settings',c=>({...createUI(c),...createSettingsUI(c)}));}
