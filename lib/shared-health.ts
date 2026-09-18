import type {Source} from './catalog';
import type {SourceCheck} from './source-checks';
export const SHARED_HEALTH_TTL=7*24*3600_000;
export type SharedHealthEntry={okAt:number;failedAt:number};
export type SharedHealth=Record<string,SharedHealthEntry>;
export function sharedStatus(entry:SharedHealthEntry|undefined,now=Date.now()):'available'|'unstable'|'unknown'{
 if(!entry||Math.max(entry.okAt,entry.failedAt)<=now-SHARED_HEALTH_TTL)return 'unknown';
 return entry.okAt>entry.failedAt?'available':'unstable';
}
export function sourceRank(check:SourceCheck|undefined,entry:SharedHealthEntry|undefined,now=Date.now()){
 if(check?.status==='available')return 0;
 if(check?.status==='failed')return 2;
 const status=sharedStatus(entry,now);return status==='available'?0:status==='unstable'?2:1;
}
export function rankedSources(sources:Source[],checks:Record<string,SourceCheck>,shared:SharedHealth,now=Date.now()){
 return [...sources].sort((a,b)=>sourceRank(checks[a.id],shared[a.id],now)-sourceRank(checks[b.id],shared[b.id],now)||((shared[b.id]?.okAt||0)-(shared[a.id]?.okAt||0))*(sourceRank(checks[a.id],shared[a.id],now)===0?1:0));
}
export function sharedSourceVisible(check:SourceCheck|undefined,entry:SharedHealthEntry|undefined,hideFailed:boolean,now=Date.now()){
 return !hideFailed||sourceRank(check,entry,now)!==2;
}
