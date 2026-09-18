export type DeviceClass='pc'|'mobile';
export function deviceClass(nav:{userAgent?:string;platform?:string;maxTouchPoints?:number;userAgentData?:{mobile?:boolean}}=typeof navigator==='undefined'?{}:navigator):DeviceClass{
 return nav.userAgentData?.mobile||/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent||'')||(/Mac/i.test(nav.platform||'')&&(nav.maxTouchPoints||0)>1)?'mobile':'pc';
}
export const deviceLabel=(device:DeviceClass)=>device==='mobile'?'手机':'PC';
export const supportsBackgroundProbe=(device:DeviceClass)=>device==='pc';
