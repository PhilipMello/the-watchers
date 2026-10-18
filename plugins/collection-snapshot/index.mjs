import {validateSnapshot} from './domain.mjs';
export function activate(api){api.register('contracts','collection.snapshot',{version:'1.0.0',validate:validateSnapshot});}
