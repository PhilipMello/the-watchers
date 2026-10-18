export function activate(api){api.register('shell.panels','hello',({document})=>{const p=document.createElement('p');p.textContent='Hello from an independent plugin.';return p;});}
