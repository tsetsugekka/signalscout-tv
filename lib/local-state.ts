import type {SourceCheck} from "./source-checks";
import {channelIdentity,type Catalog} from "./catalog";
export type Health={okAt?:number;verifiedLive?:boolean;failedAt?:number;failures:number;until:number};
export type Unavailable={fingerprint:string;until:number};
export type SourceFilter='all'|'priority'|'hide-failed';
export type LocalState={favorites:string[];recent:string[];lastChannel:string;lastPlayedSources:Record<string,string>;lastPlayedAt:Record<string,number>;autoSwitch:boolean;sourceFilter:SourceFilter;health:Record<string,Health>;unavailable:Record<string,Unavailable>;observer?:string;playbackVersion?:number;relayVersion?:number};
export const defaults=():LocalState=>({favorites:[],recent:[],lastChannel:"CCTV5+",lastPlayedSources:{},lastPlayedAt:{},autoSwitch:true,sourceFilter:'all',health:{},unavailable:{}});
export function readSourceFilter(saved:{sourceFilter?:SourceFilter;hideFailed?:boolean}):SourceFilter{return saved.sourceFilter??(saved.hideFailed?'hide-failed':'all');}
let dbPromise:Promise<IDBDatabase>|undefined;
function database(){return dbPromise??=(new Promise((resolve,reject)=>{const r=indexedDB.open("signalscout-tv-runtime",1);r.onupgradeneeded=()=>r.result.createObjectStore("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));}
export async function readLocal<T>(key:string):Promise<T|undefined>{const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction("state").objectStore("state").get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function writeLocal(key:string,value:LocalState|Catalog){const db=await database();return new Promise<void>((resolve,reject)=>{const tx=db.transaction("state","readwrite");tx.objectStore("state").put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export function recordFailure(state:LocalState,url:string,now=Date.now()) {const old=state.health[url];const failures=(old?.failures||0)+1;state.health[url]={...old,failedAt:now,failures,until:now+[10,30,120][Math.min(failures-1,2)]*60_000};}
export function recordSuccess(state:LocalState,url:string,now=Date.now()){state.health[url]={okAt:now,verifiedLive:true,failures:0,until:0};}

export function pruneLocalSources(state:LocalState,catalog:Catalog){const current=new Set(catalog.channels.flatMap(c=>c.sources.map(s=>s.id)));for(const url of Object.keys(state.health))if(!current.has(url))delete state.health[url];for(const [channel,url] of Object.entries(state.lastPlayedSources))if(!current.has(url))delete state.lastPlayedSources[channel];}

export function localSourceCheck(check:SourceCheck|undefined,health:Health|undefined):SourceCheck|undefined{if(check&&check.status!=="waiting")return check.status==="available"?{...check,okAt:check.okAt||health?.okAt}:check;if((health?.failedAt||0)>(health?.okAt||0))return {status:"failed"};if(health?.verifiedLive&&health.okAt)return {status:"available",okAt:health.okAt};return check;}

export function normalizeLocalChannels(saved:LocalState):LocalState{
 const lastPlayedAt:Record<string,number>={},lastPlayedSources:Record<string,string>={},owners:Record<string,string>={};
 for(const [id,at] of Object.entries(saved.lastPlayedAt||{})){const key=channelIdentity(id);lastPlayedAt[key]=Math.max(lastPlayedAt[key]||0,at);}
 const recentRank=(id:string)=>{const rank=saved.recent.indexOf(id);return rank<0?Infinity:rank;};
 for(const [id,url] of Object.entries(saved.lastPlayedSources||{})){const key=channelIdentity(id),old=owners[key];if(!old||(saved.lastPlayedAt?.[id]||0)>(saved.lastPlayedAt?.[old]||0)||((saved.lastPlayedAt?.[id]||0)===(saved.lastPlayedAt?.[old]||0)&&recentRank(id)<recentRank(old))){owners[key]=id;lastPlayedSources[key]=url;}}
 return {...saved,favorites:[...new Set(saved.favorites.map(channelIdentity))],recent:[...new Set(saved.recent.map(channelIdentity))],lastChannel:channelIdentity(saved.lastChannel),lastPlayedAt,lastPlayedSources};
}
