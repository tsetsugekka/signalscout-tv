import type {DeviceClass} from './device-class';
import type {DeviceHealth,SharedHealthEntry} from './shared-health';
export type SourceVote={source:string;device:DeviceClass;reporter:string;ok_at:number;failed_at:number;resolution?:number};
export const SUCCESS_FAILURE_QUORUM=10;
export const SUCCESS_PROTECTION=24*3600_000;
export function summarizeVotes(votes:SourceVote[],legacy:DeviceHealth={},viewerHashes:Record<string,string>={},now=Date.now()):DeviceHealth{
 const result:DeviceHealth={};
 for(const [source,devices] of Object.entries(legacy))for(const device of ['pc','mobile'] as const){const okAt=devices[device]?.okAt||0;if(okAt)(result[source]??={})[device]={okAt,failedAt:0};}
 const groups=new Map<string,SourceVote[]>();
 for(const vote of votes){const key=JSON.stringify([vote.source,vote.device]);const group=groups.get(key)||[];group.push(vote);groups.set(key,group);}
 for(const group of groups.values()){
  const {source,device}=group[0];const latest=group.reduce((a,b)=>b.ok_at>a.ok_at?b:a);const okAt=Math.max(latest.ok_at,result[source]?.[device]?.okAt||0);
  const failures=new Map<string,number>();
  for(const v of group)if(v.failed_at>Math.max(okAt,v.ok_at)&&v.reporter!==viewerHashes[source])failures.set(v.reporter,Math.max(v.failed_at,failures.get(v.reporter)||0));
  const times=[...failures.values()].sort((a,b)=>b-a);
  const quorum=okAt?SUCCESS_FAILURE_QUORUM:2;
  const entry:SharedHealthEntry={okAt,failedAt:times.length>=quorum&&(!okAt||now>=okAt+SUCCESS_PROTECTION)?times[quorum-1]:0};
  const resolution=Math.max(...group.map(v=>v.resolution||0));if(resolution)entry.resolution=resolution;
  (result[source]??={})[device]=entry;
 }
 return result;
}
export function validObserver(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);}
export async function observerHash(source:string,observer:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source+'\n'+observer));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}

export function validResolution(value:unknown):value is number{return typeof value==='number'&&Number.isInteger(value)&&value>0&&value<=16384;}
export const SOURCE_VOTE_UPSERT=`INSERT INTO source_votes (source,device,reporter,ok_at,failed_at,resolution) VALUES (?,?,?,?,?,?) ON CONFLICT(source,device,reporter) DO UPDATE SET ok_at=MAX(source_votes.ok_at,excluded.ok_at),failed_at=MAX(source_votes.failed_at,excluded.failed_at),resolution=MAX(source_votes.resolution,excluded.resolution)`;
