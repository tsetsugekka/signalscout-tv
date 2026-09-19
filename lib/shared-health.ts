import type {DeviceClass} from './device-class';
import type {Source} from './catalog';
import type {SourceCheck} from './source-checks';
export type SharedHealthEntry={okAt:number;failedAt:number};
export type SharedHealth=Record<string,SharedHealthEntry>;
export type DeviceHealth=Record<string,Partial<Record<DeviceClass,SharedHealthEntry>>>;
export function healthForDevice(records:DeviceHealth,device:DeviceClass,now=Date.now()):SharedHealth{
 const result:SharedHealth={};
 for(const [url,entry] of Object.entries(records)){
  if(device==='mobile'){
   const own=sharedStatus(entry.mobile,now)!=='unknown'?entry.mobile:entry.pc;
   if(own)result[url]=own;
  }else{
   // A phone success is useful evidence for PC; phone failures never enter PC scoring.
   result[url]=sharedStatus(entry.pc,now)==='unstable'?entry.pc!:{okAt:Math.max(entry.pc?.okAt||0,entry.mobile?.okAt||0),failedAt:entry.pc?.failedAt||0};
  }
 }
 return result;
}
export function mergeDeviceHealth(current:DeviceHealth,incoming:DeviceHealth,urls:string[],asOf:number):DeviceHealth{
 const next={...current};
 for(const url of urls){const entry={...next[url]};for(const device of ["pc","mobile"] as const){const fresh=incoming[url]?.[device],old=entry[device];if(fresh&&(Math.max(fresh.okAt,fresh.failedAt)>=Math.max(old?.okAt||0,old?.failedAt||0)||Math.max(old?.okAt||0,old?.failedAt||0)<=asOf))entry[device]=fresh;else if(!fresh&&Math.max(old?.okAt||0,old?.failedAt||0)<=asOf)delete entry[device];}if(Object.keys(entry).length)next[url]=entry;else delete next[url];}
 return next;
}
export function sharedStatus(entry:SharedHealthEntry|undefined,now=Date.now()):'available'|'unstable'|'unknown'{
 if(!entry||Math.max(entry.okAt,entry.failedAt)<=0)return 'unknown';
 return entry.okAt>entry.failedAt?'available':'unstable';
}
export function sourceRank(check:SourceCheck|undefined,entry:SharedHealthEntry|undefined,now=Date.now()){
 if(check?.status==='unsupported')return 3;
 if(check?.status==='available')return 0;
 if(check?.status==='failed')return 2;
 const status=sharedStatus(entry,now);return status==='available'?0:status==='unstable'?2:1;
}
export function rankedSources(sources:Source[],checks:Record<string,SourceCheck>,shared:SharedHealth,now=Date.now(),devices?:DeviceHealth,device?:DeviceClass){
 const rank=(id:string)=>{
  const check=checks[id];
  if(check?.status==='unsupported')return 3;
  const anyAvailable=devices&&(['pc','mobile'] as const).some(kind=>kind===device&&check?.status==='failed'?false:kind===device&&check?.status==='available'||sharedStatus(devices[id]?.[kind],now)==='available');
  return anyAvailable?0:sourceRank(check,shared[id],now);
 };
 return [...sources].sort((a,b)=>rank(a.id)-rank(b.id)||((shared[b.id]?.okAt||0)-(shared[a.id]?.okAt||0))*(rank(a.id)===0?1:0));
}
export function sharedSourceVisible(check:SourceCheck|undefined,entry:SharedHealthEntry|undefined,hideFailed:boolean,now=Date.now()){
 return !hideFailed||sourceRank(check,entry,now)!==2;
}

export function deviceSourceVisible(check:SourceCheck|undefined,entry:DeviceHealth[string]|undefined,device:DeviceClass,hideFailed:boolean,now=Date.now()){
 if(!hideFailed)return true;
 const unstable=(kind:DeviceClass)=>kind===device&&check?.status==='failed'?true:kind===device&&check?.status==='available'?false:sharedStatus(entry?.[kind],now)==='unstable';
 return !unstable('pc')&&(device==='pc'||!unstable('mobile'));
}

export function channelHasSharedSuccess(channel:{sources:Source[]},devices:DeviceHealth){return channel.sources.some(s=>sharedStatus(devices[s.id]?.pc)==='available'||sharedStatus(devices[s.id]?.mobile)==='available');}
