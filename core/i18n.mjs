const CONTRACT='1.0.0';
import {fail} from './errors.mjs';
export function createI18n(catalogs,locale='en-US') {
  const base=catalogs['en-US'];
  if(base?.format_version!==CONTRACT||base.locale!=='en-US')fail('version','language',{expected:CONTRACT});
  const selected=catalogs[locale]||base;
  return {
    locale:selected.locale,
    t(key,params={}) {
      const text=selected.messages[key]??base.messages[key];
      if(typeof text!=='string')fail('label',key);
      return text.replace(/\{([a-zA-Z_]+)\}/g,(all,k)=>Object.hasOwn(params,k)?String(params[k]):all);
    },
    number:v=>new Intl.NumberFormat(selected.locale).format(v),
    count(key,value){const variant=key+'.'+new Intl.PluralRules(selected.locale).select(value);return this.t(typeof selected.messages[variant]==='string'?variant:key+'.other',{count:this.number(value)});},
    date:v=>new Intl.DateTimeFormat(selected.locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v)),
    compare:(a,b)=>new Intl.Collator(selected.locale,{sensitivity:'base'}).compare(a,b)
  };
}
