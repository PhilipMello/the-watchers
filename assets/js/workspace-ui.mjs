import {createUI as custom_fields} from '../../plugins/custom-fields/ui.mjs';
import {createUI as sources} from '../../plugins/sources/ui.mjs';
import {createUI as types} from '../../plugins/types/ui.mjs';
import {createUI as workspace} from '../../plugins/workspace/ui.mjs';
import {createUI as architecture_viewer} from '../../plugins/architecture-viewer/ui.mjs';
import {createUI as language_editor} from '../../plugins/language-editor/ui.mjs';
import {createUI as settings} from '../../plugins/settings/ui.mjs';
export function createWorkspaceUI(c){const actions={};c={...c,actions};
Object.assign(actions,custom_fields(c));
Object.assign(actions,sources(c));
Object.assign(actions,types(c));
Object.assign(actions,workspace(c));
Object.assign(actions,architecture_viewer(c));
Object.assign(actions,language_editor(c));
Object.assign(actions,settings(c));
return actions;}
