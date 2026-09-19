import {browserSources,type Channel} from "./catalog";
export type SourceCheck={status:"waiting"|"pinging"|"checking"|"available"|"failed"|"blocked"|"unsupported"|"unconfirmed";suspect?:boolean;resolution?:number;okAt?:number;elapsedMs?:number;connectMs?:number;reason?:string};
export function initialSourceChecks(channel:Channel):Record<string,SourceCheck>{
 const compatible=new Set(browserSources(channel).map(s=>s.id));
 return Object.fromEntries(channel.sources.map(s=>[s.id,compatible.has(s.id)?{status:"waiting"}:{status:"unsupported",reason:"非直播视频或网页不支持的格式"}]));
}
export function nextSourceToCheck(channel:Channel,checks:Record<string,SourceCheck>,activeSource?:string){return channel.sources.find(s=>s.id!==activeSource&&checks[s.id]?.status==="waiting");}

export function sourceVisible(check:SourceCheck|undefined,hideFailed:boolean){return !hideFailed||check?.status!=="failed";}
