// Safe bounded subset, compiled as Unicode whole-value regex. No groups,
// alternation, backreferences or lookarounds; at most one quantified atom.
export function compilePattern(pattern){
 if(typeof pattern!=='string'||pattern.length>160)throw Error('Unsupported pattern');
 let source=pattern;if(source.startsWith('^'))source=source.slice(1);if(source.endsWith('$')&&!source.endsWith('\\$'))source=source.slice(0,-1);
 let i=0,unbounded=0,tokens=0,quantifiers=0;
 while(i<source.length){
  const atom=/^(?:\\[dDsSwW]|\\[.\-+*?^$\[\]{}()|\\]|\[(?:\\.|[^\]\\])+\]|[^\\[\]().|*+?{}^$])/.exec(source.slice(i));if(!atom)throw Error('Unsupported pattern');i+=atom[0].length;tokens++;
  const quant=/^(?:[+*?]|\{\d+(?:,\d*)?\})/.exec(source.slice(i));if(quant){quantifiers++;const q=quant[0];i+=q.length;if(q==='+'||q==='*'||/,\}$/.test(q))unbounded++;for(const n of q.match(/\d+/g)||[])if(+n>256)throw Error('Pattern bound too large');}
 }
 if(unbounded>1||quantifiers>1||tokens>64)throw Error('Pattern complexity exceeds limit');
 return new RegExp('^(?:'+source+')$','u');
}
export function matchesPattern(value,pattern){if(typeof value!=='string'||value.length>512)return false;const m=compilePattern(pattern).exec(value);return !!m&&m[0].length===value.length;}
