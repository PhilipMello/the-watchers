import {startCollection} from './application.mjs';
import {registerSettings} from '../settings/plugin-settings.mjs';
export function activate(api){api.register('applications','collection',startCollection);registerSettings(api,{name:'Entries',scope:'project',fields:[{key:'cardDesign',label:'Card design',type:'select',default:'frosted',options:[{value:'classic',label:'Classic — photo and white panel'},{value:'frosted',label:'Frosted — full portrait and blur'}]}]});}
