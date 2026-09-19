import {browserSources,isBrowserSource,type Channel,type Source} from './catalog';
import type {DeviceClass} from './device-class';
import {deviceLabel} from './device-class';
import type {Health} from './local-state';
import type {SourceCheck} from './source-checks';
import {sharedStatus,channelHasSharedSuccess,type DeviceHealth,type SharedHealthEntry} from './shared-health';
import {getDomain} from 'tldts';

export const RECENT_SUCCESS=24*3600_000;
export type Availability='recent'|'available'|'possible'|'unknown'|'unstable'|'unsupported';
export type Evidence={status:Availability;origin?:'local'|'shared';okAt?:number;hintDevice?:DeviceClass};
export type HostHealth=Map<string,Partial<Record<DeviceClass,number>>>;
export type EvaluationContext={device:DeviceClass;local:Record<string,Health>;devices:DeviceHealth;checks:Record<string,SourceCheck>;hosts:HostHealth;now:number};
export type SourceState={devices:Record<DeviceClass,Evidence>;current:Evidence;display:Evidence;reference?:DeviceClass};
const ranks:Record<Availability,number>={recent:0,available:1,possible:2,unknown:3,unstable:4,unsupported:5};
export const isSuccess=(e:Evidence)=>e.status==='recent'||e.status==='available';
export const successAge=(okAt:number,now=Date.now()):Availability=>now-okAt<RECENT_SUCCESS?'recent':'available';
export const evidenceRank=(e:Evidence)=>ranks[e.status];
export const compareEvidence=(a:Evidence,b:Evidence)=>evidenceRank(a)-evidenceRank(b)||(isSuccess(a)?(b.okAt||0)-(a.okAt||0):0);

export function localEvidence(health:Health|undefined,check?:SourceCheck,now=Date.now()):Evidence{
 if(check?.status==='failed')return {status:'unstable',origin:'local'};
 if(check?.status==='available'){const okAt=check.okAt||health?.okAt||now;return {status:successAge(okAt,now),origin:'local',okAt};}
 if((health?.failedAt||0)>(health?.okAt||0))return {status:'unstable',origin:'local'};
 if(health?.verifiedLive&&health.okAt)return {status:successAge(health.okAt,now),origin:'local',okAt:health.okAt};
 return {status:'unknown'};
}
export function sharedEvidence(entry:SharedHealthEntry|undefined,now=Date.now()):Evidence{
 const status=sharedStatus(entry,now);
 return status==='available'?{status:successAge(entry!.okAt,now),origin:'shared',okAt:entry!.okAt}:status==='unstable'?{status:'unstable',origin:'shared'}:{status:'unknown'};
}
function directEvidence(id:string,kind:DeviceClass,ctx:EvaluationContext):Evidence{
 if(kind===ctx.device){const local=localEvidence(ctx.local[id],ctx.checks[id],ctx.now);if(local.status!=='unknown')return local;}
 return sharedEvidence(ctx.devices[id]?.[kind],ctx.now);
}
// Group the original URL by registrable domain, or by its full IP; never by a relay/DNS alias.
export function sourceHost(url:string){try{const u=new URL(url);if(!/^https?:$/.test(u.protocol))return undefined;const host=u.hostname.toLowerCase().replace(/\.$/,'');return getDomain(host,{allowPrivateDomains:true})||host;}catch{return undefined;}}
export function buildHostHealth(sources:Map<string,Source>,local:Record<string,Health>,devices:DeviceHealth,device:DeviceClass,checks:Record<string,SourceCheck>={},now=Date.now()):HostHealth{
 const hosts:HostHealth=new Map();const ctx={local,devices,device,checks,hosts,now};
 for(const id of new Set([...Object.keys(local),...Object.keys(devices),...Object.keys(checks)])){
  const source=sources.get(id);if(!source||!isBrowserSource(source))continue;const host=sourceHost(source.url);if(!host)continue;
  for(const kind of ['pc','mobile'] as const){const e=directEvidence(id,kind,ctx);if(isSuccess(e)){const entry=hosts.get(host)||{};entry[kind]=Math.max(entry[kind]||0,e.okAt||0);hosts.set(host,entry);}}
 }
 return hosts;
}
function hostHint(source:Source,kind:DeviceClass,hosts:HostHealth):Evidence{
 if(!hosts.size)return {status:'unknown'};
 const host=sourceHost(source.url),entry=host?hosts.get(host):undefined,other=kind==='pc'?'mobile':'pc';
 return entry?.[kind]||entry?.[other]?{status:'possible',hintDevice:entry[kind]?kind:other}:{status:'unknown'};
}
export function evaluateSource(source:Source,ctx:EvaluationContext):SourceState{
 const devices={pc:directEvidence(source.id,'pc',ctx),mobile:directEvidence(source.id,'mobile',ctx)};
 if(!isBrowserSource(source)||ctx.checks[source.id]?.status==='unsupported')return {devices,current:{status:'unsupported'},display:{status:'unsupported'}};
 const original={...devices};
 for(const kind of ['pc','mobile'] as const){const other=kind==='pc'?'mobile':'pc';if(devices[kind].status==='unknown')devices[kind]=isSuccess(original[other])?{status:'possible',hintDevice:other}:hostHint(source,kind,ctx.hosts);}
 const own=devices[ctx.device],other=ctx.device==='pc'?'mobile':'pc';
 const reference=original[ctx.device].status==='unknown'&&isSuccess(original[other])?other:undefined;
 const current=reference?devices[reference]:own;
 const successes=Object.values(devices).filter(isSuccess).sort(compareEvidence);
 return {devices,current,display:successes[0]||current,reference};
}
export function evidenceLabel(e:Evidence){
 const owner=e.origin==='local'?'本机':e.origin==='shared'?'他人':'';
 return e.status==='recent'?`${owner}近期可播`:e.status==='available'?`${owner}可播`:e.status==='possible'?'可能可播':e.status==='unstable'?`${owner}不稳定`:e.status==='unsupported'?'网页直连受限':'待验证';
}
export function rankSourceStates(sources:Source[],states:Map<string,SourceState>){return [...sources].sort((a,b)=>compareEvidence(states.get(a.id)!.display,states.get(b.id)!.display));}
export function sourceStateVisible(state:SourceState,device:DeviceClass,hideFailed:boolean){return !hideFailed||state.devices.pc.status!=='unstable'&&(device==='pc'||state.devices.mobile.status!=='unstable');}
export function channelInPlaybackView(channel:Channel,ctx:EvaluationContext,view:'local'|'shared'){
 const sources=browserSources(channel);
 const verified=view==='local'?sources.some(s=>isSuccess(localEvidence(ctx.local[s.id],ctx.checks[s.id],ctx.now))):channelHasSharedSuccess(channel,ctx.devices);
 return verified||sources.some(s=>evaluateSource(s,ctx).current.status==='possible');
}

// Automatic attempts may use another device's success as a reference, never as current-device proof.
export function attemptEvidence(source:Source,health:Health|undefined,shared:SharedHealthEntry|undefined,hosts:HostHealth,device:DeviceClass,now=Date.now()):Evidence{
 const own=localEvidence(health,undefined,now);if(own.status!=='unknown')return own;
 const community=sharedEvidence(shared,now);return community.status!=='unknown'?community:hostHint(source,device,hosts);
}

export type SignalState='recent'|'available'|'possible'|'pending'|'unavailable'|'restricted'|'offline'|'checking';
export type ChannelState={signal:SignalState;label:string};
export function channelPlaybackPriority(channel:Channel,ctx:EvaluationContext){
 const state=evaluateChannel(channel,ctx).signal;
 return state==='recent'?0:state==='available'?1:state==='possible'?2:3;
}
type Foreground={status:string;source?:string;streamType?:'live'|'unknown'};
export function evaluateChannel(channel:Channel,ctx:EvaluationContext,foreground?:Foreground):ChannelState{
 const sources=browserSources(channel);if(!sources.length)return {signal:'restricted',label:'网页直连受限'};
 if(foreground?.status==='offline')return {signal:'offline',label:'网络已断开'};
 if(foreground&&['connecting','recovering'].includes(foreground.status))return {signal:'checking',label:'正在验证'};
 const states=sources.map(s=>evaluateSource(s,ctx));
 const best=states.sort((a,b)=>compareEvidence(a.current,b.current))[0];
 if(isSuccess(best.current))return {signal:best.current.status as 'recent'|'available',label:best.reference?`${deviceLabel(best.reference)}${best.current.status==='recent'?'近期可播':'可播'} · ${deviceLabel(ctx.device)}待验证`:evidenceLabel(best.current)};
 if(best.current.status==='possible')return {signal:'possible',label:'可能可播'};
 if(states.some(s=>s.current.status==='unknown')){
  return {signal:'pending',label:foreground?.status==='blocked'?'待点击验证':'待本机验证'};
 }
 return states.every(s=>s.current.status==='unsupported')?{signal:'restricted',label:'网页直连受限'}:{signal:'unavailable',label:'暂不可播'};
}
