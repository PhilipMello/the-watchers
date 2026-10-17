export const DEFAULT_BADGE_COLOR='#16783a';
export const validBadgeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function badgeInk(color){
 if(!validBadgeColor(color))throw Error('Invalid badge color.');
 const channels=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
 return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
}
export function badgeStyle(badge){const color=badge.color||DEFAULT_BADGE_COLOR;if(!validBadgeColor(color))return '';const styles=[`background-color:${color}`,`border-color:${color}`,`color:${badgeInk(color)}`];
 const a=badge.appearance;if(a&&validBadgeAppearance(a)){const px={font_size:'font-size',padding_x:'padding-inline',padding_y:'padding-block',border_width:'border-width',border_radius:'border-radius',icon_size:'--badge-icon-size'};for(const [key,css]of Object.entries(px))if(a[key]!==undefined)styles.push(`${css}:${a[key]}px`);if(a.width)styles.push(`width:${a.width}px`);if(a.height)styles.push(`min-height:${a.height}px`);if(a.border_color)styles.push(`border-color:${a.border_color}`);if(a.border_style)styles.push(`border-style:${a.border_style}`);}
 return styles.join(';');}

export const BADGE_STYLE_DEFAULTS=Object.freeze({width:0,height:0,font_size:12,icon_size:20,padding_x:8,padding_y:4,border_width:1,border_radius:12,border_style:'solid',border_color:DEFAULT_BADGE_COLOR});
const styleRanges={width:[0,240],height:[0,120],font_size:[10,32],icon_size:[12,64],padding_x:[0,24],padding_y:[0,16],border_width:[0,8],border_radius:[0,60]};
export function validBadgeAppearance(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,v])=>key==='border_color'?validBadgeColor(v):key==='border_style'?['none','solid','dashed','dotted'].includes(v):Object.hasOwn(styleRanges,key)&&Number.isInteger(v)&&v>=styleRanges[key][0]&&v<=styleRanges[key][1]);}
