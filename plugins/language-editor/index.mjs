import {createUI} from './ui.mjs';
export function activate(api){api.register('collection.ui', 'language-editor', createUI);}
