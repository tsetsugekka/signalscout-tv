"use client";
import {deviceClass,supportsBackgroundProbe,type DeviceClass} from "./device-class";
import {readPlaybackLink,resolvePlaybackLink,playbackLinkSearch} from "./channel-links";
import {numberSources} from "./source-numbers";
import { useEffect,useMemo,useRef,useState } from "react";
import { browserSources,normalizeName,mergeChannels,type Catalog,type Channel } from "./catalog";
import { localSourceCheck,pruneLocalSources,defaults,readSourceFilter,readLocal,writeLocal,recordSuccess,recordFailure,type LocalState,type SourceFilter } from "./local-state";
import { PlayerEngine,connectMedia,fingerprint,type PlayerState } from "./player";
import {channelHasSharedSuccess,healthForDevice,mergeDeviceHealth,type DeviceHealth,type SharedHealth} from "./shared-health";
import {attemptEvidence,compareEvidence,buildHostHealth,evaluateSource,sourceStateVisible,type EvaluationContext} from "./playback-state";
import {initialSourceChecks,nextSourceToCheck,type SourceCheck} from "./source-checks";
export function useTV(){
 const [device,setDevice]=useState<DeviceClass>("pc");const [deviceHealth,setDeviceHealth]=useState<DeviceHealth>({});const deviceHealthRef=useRef<DeviceHealth>({});
 const [sharedHealth,setSharedHealth]=useState<SharedHealth>({});const sharedRef=useRef<SharedHealth>({});const reportRef=useRef<(id:string,status:"available"|"failed")=>void>(()=>{});
 const [sourceChecks,setSourceChecks]=useState<Record<string,SourceCheck>>({});const checksRef=useRef<Record<string,SourceCheck>>({});const [scanVersion,setScanVersion]=useState(0);
 const updateCheck=(id:string,result:SourceCheck)=>{if(!(id in checksRef.current))return;if(result.status==="available")result={...result,okAt:result.okAt||data.current.health[id]?.okAt||Date.now()};checksRef.current={...checksRef.current,[id]:result};setSourceChecks(checksRef.current);if(result.status==="available"||result.status==="failed")reportRef.current(id,result.status);};
 const beginChecks=(c:Channel)=>{checksRef.current=initialSourceChecks(c);setSourceChecks(checksRef.current);setScanVersion(v=>v+1);};
 const [probingId,setProbingId]=useState("");const [catalog,setCatalog]=useState<Catalog>({version:"",syncedAt:0,channels:[]});const [prefs,setPrefs]=useState<LocalState>(defaults);const [selectedId,setSelectedId]=useState("");const [playback,setPlayback]=useState<PlayerState>({status:"idle"});const [notice,setNotice]=useState("");const [linkNotice,setLinkNotice]=useState("");const [catalogLoading,setCatalogLoading]=useState(true);const [syncMessage,setSyncMessage]=useState("");const [ready,setReady]=useState(false);const [category,setCategory]=useState("央视");const [,setClock]=useState(0);
 const video=useRef<HTMLVideoElement>(null);const engine=useRef<PlayerEngine|undefined>(undefined);const data=useRef<LocalState>(defaults());const catalogRef=useRef<Catalog>(catalog);const probeStop=useRef<(()=>void)|undefined>(undefined);const refreshRef=useRef<((force?:boolean)=>Promise<void>)|undefined>(undefined);const selectedRef=useRef(selectedId);selectedRef.current=selectedId;
 const sourceIndex=useMemo(()=>new Map(catalog.channels.flatMap(c=>c.sources.map(s=>[s.id,s] as const))),[catalog]);
 const hosts=useMemo(()=>buildHostHealth(sourceIndex,prefs.health,deviceHealth,device,sourceChecks),[sourceIndex,prefs,deviceHealth,device,sourceChecks]);
 const evaluation:EvaluationContext={device,local:prefs.health,devices:deviceHealth,checks:sourceChecks,hosts,now:Date.now()};
 useEffect(()=>{if(engine.current)engine.current.hostHealth=hosts;},[hosts,ready]);
 const persistRef=useRef(()=>{});
 useEffect(()=>{
  let alive=true,saveTimer:ReturnType<typeof setTimeout>|undefined;const stopProbe=()=>{probeStop.current?.();probeStop.current=undefined;};
  const storageError=()=>{if(alive)setNotice("此浏览器暂时无法保存记录，本次仍可观看。");};
  const persist=()=>{if(!alive)return;setPrefs({...data.current,favorites:[...data.current.favorites],recent:[...data.current.recent]});clearTimeout(saveTimer);saveTimer=setTimeout(()=>void writeLocal("preferences",data.current).catch(storageError),100);};persistRef.current=persist;
  const initialLink=readPlaybackLink(window.location.search);
  const currentDevice=deviceClass();setDevice(currentDevice);
  const loadingShared=new Map<string,Promise<SharedHealth>>();const reported=new Map<string,{status:string;at:number}>();
  const publishShared=()=>{if(alive){sharedRef.current=healthForDevice(deviceHealthRef.current,currentDevice);setDeviceHealth({...deviceHealthRef.current});setSharedHealth({...sharedRef.current});if(engine.current){engine.current.sharedHealth=sharedRef.current;engine.current.hostHealth=buildHostHealth(new Map(catalogRef.current.channels.flatMap(c=>c.sources.map(s=>[s.id,s] as const))),data.current.health,deviceHealthRef.current,currentDevice,checksRef.current);}}};
  const fetchShared=(channel:Channel):Promise<SharedHealth>=>{
   const pending=loadingShared.get(channel.id);if(pending)return pending;
   const task=(async()=>{try{
    const response=await fetch(`/api/source-health?channel=${encodeURIComponent(channel.id)}`,{cache:"no-store",headers:{"X-Playback-Observer":data.current.observer||""},signal:AbortSignal.timeout(5000)});
    if(response.ok){const result=await response.json() as {devices?:DeviceHealth;asOf:number};if(alive&&result.devices){deviceHealthRef.current=mergeDeviceHealth(deviceHealthRef.current,result.devices,channel.sources.map(s=>s.id),result.asOf);publishShared();}}
   }catch{/* Shared hints must never prevent playback. */}return sharedRef.current;})().finally(()=>loadingShared.delete(channel.id));
   loadingShared.set(channel.id,task);return task;
  };
  let loadingSharedCatalog=false;
  const fetchSharedCatalog=async()=>{if(loadingSharedCatalog||!data.current.observer)return;loadingSharedCatalog=true;try{
   const response=await fetch('/api/source-health?scope=catalog',{cache:'no-store',headers:{'X-Playback-Observer':data.current.observer},signal:AbortSignal.timeout(10000)});
   if(response.ok){const result=await response.json() as {devices:DeviceHealth;asOf:number};if(alive){deviceHealthRef.current=mergeDeviceHealth(deviceHealthRef.current,result.devices,[...new Set([...Object.keys(deviceHealthRef.current),...Object.keys(result.devices)])],result.asOf);publishShared();}}
  }catch{/* Metadata failure must not block playback. */}finally{loadingSharedCatalog=false;}};
  reportRef.current=(source,status)=>{
   const last=reported.get(source),now=Date.now();if(last?.status===status&&now-last.at<60_000)return;reported.set(source,{status,at:now});
   void (async()=>{try{
    const response=await fetch("/api/source-health",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source,status,device:currentDevice,observer:data.current.observer}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)return;const result=await response.json() as {at:number;devices:DeviceHealth};if(!alive)return;
    deviceHealthRef.current=mergeDeviceHealth(deviceHealthRef.current,result.devices,[source],result.at);publishShared();
   }catch{/* A failed report does not change the local playback result. */}})();
  };
  const startInitial=(settled=false)=>{const e=engine.current;if(!e||e.channel||!catalogRef.current.channels.length)return;const linked=initialLink?resolvePlaybackLink(catalogRef.current.channels,initialLink,settled):undefined;if(linked?.pending)return;const c=linked?.channel||catalogRef.current.channels.find(c=>c.id===data.current.lastChannel)||catalogRef.current.channels.find(c=>c.id==="CCTV5+")||catalogRef.current.channels[0];if(linked?.notice)setLinkNotice(linked.notice);setSelectedId(c.id);selectedRef.current=c.id;if(initialLink)setCategory(c.group==="港澳台"?"港台":c.group);beginChecks(c);e.play(c,false,linked?.source);};
  const acceptCatalog=(next:Catalog)=>{if(!alive)return;next={...next,channels:numberSources(mergeChannels([next.channels]))};catalogRef.current=next;pruneLocalSources(data.current,next);persist();const currentUrls=new Set(next.channels.flatMap(c=>c.sources.map(s=>s.id)));for(const url of Object.keys(deviceHealthRef.current))if(!currentUrls.has(url))delete deviceHealthRef.current[url];publishShared();setCatalog(next);const e=engine.current;const updated=next.channels.find(c=>c.id===e?.channel?.id);if(e&&updated){const changed=e.channel&&fingerprint(e.channel)!==fingerprint(updated);e.channel=updated;if(changed){beginChecks(updated);if(e.current.source&&["playing","paused"].includes(e.current.status))updateCheck(e.current.source,{status:e.current.streamType==="live"?"available":"unconfirmed"});if(e.current.status==="unavailable")e.play(updated);}}startInitial();void fetchSharedCatalog();void writeLocal("catalog",next).catch(storageError);};
  let refreshing=false;
  const refresh=async(force=false)=>{
   if(refreshing)return;refreshing=true;if(alive)setCatalogLoading(true);
   const fetchCatalog=async(url:string)=>{
    const r=await fetch(url,{cache:"no-store"});const next=await r.json() as Catalog&{error?:string;origin?:string;refreshNeeded?:boolean};
    if(!r.ok||!Array.isArray(next.channels)||!next.channels.length)throw new Error(next.error||"目录暂时无法加载");
    acceptCatalog(next);return next;
   };
   try{
    let next=await fetchCatalog(force?"/api/catalog?refresh=1":"/api/catalog");
    if(alive&&next.refreshNeeded){
     setSyncMessage(next.inputs?.some(i=>i.includes("TVAPP"))?"正在后台更新目录…":"原有频道已加载，后台补充中…");
     next=await fetchCatalog("/api/catalog?refresh=1");
    }
    if(alive&&next.origin==="cooldown"&&next.refreshNeeded){
     setSyncMessage("现有频道可用，后台补充中…");
     // Another visitor owns the refresh. Poll metadata only; never restart upstream downloads.
     for(let attempt=0;attempt<8&&alive;attempt++){
      await new Promise(resolve=>setTimeout(resolve,15000));if(!alive)break;
      const response=await fetch("/api/catalog?status=1",{cache:"no-store"});if(!response.ok)break;
      const status=await response.json() as {syncedAt:number};
      if(status.syncedAt>next.syncedAt){next=await fetchCatalog("/api/catalog");break;}
     }
    }
    if(alive){setNotice(next.stale?"部分目录更新失败，已保留可用目录和上次成功的数据。":"");setSyncMessage(next.origin==="cooldown"?next.refreshNeeded?"尚未取得新目录，已保留现有频道":"目录刚刚检查过":"");}
   }catch{if(alive){setSyncMessage("");setNotice(catalogRef.current.channels.length?"目录暂时无法更新，已保留现有频道。":"尚未取得频道目录，请刷新页面重试。");}}
   finally{refreshing=false;if(alive)setCatalogLoading(false);}
  };refreshRef.current=refresh;
  void (async()=>{
   try{const [saved,cached]=await Promise.all([readLocal<LocalState>("preferences"),readLocal<Catalog>("catalog")]);if(!alive)return;if(saved)data.current={...defaults(),...saved,sourceFilter:readSourceFilter(saved),favorites:[...new Set(saved.favorites.map(normalizeName))],recent:[...new Set(saved.recent.map(normalizeName))],lastChannel:normalizeName(saved.lastChannel),lastPlayedAt:Object.fromEntries(Object.entries(saved.lastPlayedAt||{}).map(([id,at])=>[normalizeName(id),at])),lastPlayedSources:Object.fromEntries(Object.entries(saved.lastPlayedSources||{}).map(([id,url])=>[normalizeName(id),url]))};if((data.current.relayVersion||0)<3){data.current.unavailable={};for(const [url,health] of Object.entries(data.current.health))if(url.startsWith("http:")&&(health.failedAt||0)>(health.okAt||0)){if(health.verifiedLive&&health.okAt)data.current.health[url]={okAt:health.okAt,verifiedLive:true,failures:0,until:0};else delete data.current.health[url];}data.current.relayVersion=3;}if((data.current.playbackVersion||0)<1){data.current.unavailable={};for(const h of Object.values(data.current.health)){h.failures=0;h.until=0;delete h.failedAt;}data.current.playbackVersion=1;}if(cached?.channels?.length)acceptCatalog(cached);}catch{storageError();}
   if(!alive||!video.current)return;data.current.observer||=crypto.randomUUID();persist();setPrefs({...data.current});
   engine.current=new PlayerEngine(video.current,data.current,s=>{if(alive)setPlayback(s);},persist,stopProbe,(id,result)=>{if(alive)updateCheck(id,result);});engine.current.auto=data.current.autoSwitch;engine.current.loadShared=fetchShared;
   setReady(true);video.current.muted=true;void refresh().finally(()=>{if(alive)startInitial(true);});
  })();
  const onVisibility=()=>{stopProbe();if(document.visibilityState==="visible"&&navigator.onLine){const e=engine.current;if(e?.current.status==="offline"&&e.channel)e.play(e.channel);if(Date.now()-catalogRef.current.syncedAt>3600_000)void refresh();}};
  const onOffline=()=>{stopProbe();const e=engine.current;if(e&&!["paused","idle","unavailable"].includes(e.current.status))e.emit({...e.current,status:"offline"});};
  const onOnline=()=>{const e=engine.current;if(e?.current.status==="offline"&&e.channel)e.play(e.channel);};
  document.addEventListener("visibilitychange",onVisibility);window.addEventListener("offline",onOffline);window.addEventListener("online",onOnline);
  const sharedTimer=setInterval(()=>{const channel=engine.current?.channel;if(channel&&document.visibilityState==="visible"&&navigator.onLine)void fetchShared(channel);if(document.visibilityState==="visible"&&navigator.onLine)void fetchSharedCatalog();},currentDevice==="mobile"?300_000:60_000);
  const hourly=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},3600_000);
  const tick=setInterval(()=>{if(!alive||document.visibilityState!=="visible")return;setClock(t=>t+1);const e=engine.current;const c=e?.channel;const expired=c&&data.current.unavailable[c.id];if(e?.current.status==="unavailable"&&expired&&expired.until<=Date.now()&&navigator.onLine)e.play(c!);},30_000);
  return()=>{alive=false;reportRef.current=()=>{};clearInterval(sharedTimer);stopProbe();engine.current?.dispose();clearTimeout(saveTimer);void writeLocal("preferences",data.current).catch(()=>{});clearInterval(hourly);clearInterval(tick);document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("offline",onOffline);window.removeEventListener("online",onOnline);};
 },[]);
 useEffect(()=>{
  if(!ready||!selectedId)return;const channel=catalog.channels.find(c=>c.id===selectedId);if(!channel)return;
  const source=['playing','paused'].includes(playback.status)?playback.source:playback.attemptSource||playback.source;
  const url=new URL(window.location.href),params=new URLSearchParams(playbackLinkSearch(channel,source));url.searchParams.set('channel',params.get('channel')!);
  if(params.has('source'))url.searchParams.set('source',params.get('source')!);else url.searchParams.delete('source');
  window.history.replaceState(window.history.state,'',url);
 },[ready,selectedId,catalog,playback.source,playback.attemptSource,playback.status]);
 // A finite scan of every source of the selected channel; never scan other channels.
 useEffect(()=>{
  if(!ready||!selectedId||!supportsBackgroundProbe(device))return;const channel=catalogRef.current.channels.find(c=>c.id===selectedId);if(!channel)return;
  let alive=true,timer:ReturnType<typeof setTimeout>;
  const schedule=(ms=1200+Math.random()*800)=>{if(alive)timer=setTimeout(scan,ms);};
  const scan=()=>{
   if(!alive)return;const e=engine.current;if(!e)return;
   if(!navigator.onLine||document.visibilityState!=="visible"||["connecting","recovering","offline"].includes(e.current.status)){schedule();return;}
   const source=nextSourceToCheck({...channel,sources:[...channel.sources].sort((a,b)=>compareEvidence(attemptEvidence(a,data.current.health[a.id],sharedRef.current[a.id],e.hostHealth,device),attemptEvidence(b,data.current.health[b.id],sharedRef.current[b.id],e.hostHealth,device)))},checksRef.current,e.source?.id);if(!source)return;
   setProbingId(channel.id);updateCheck(source.id,{status:"pinging"});const started=performance.now();let connectMs:number|undefined;
   const element=document.createElement("video");element.muted=true;element.playsInline=true;element.setAttribute("aria-hidden","true");element.style.cssText="position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;bottom:0;left:0;";document.body.appendChild(element);
   let stopped=false,connection:ReturnType<typeof connectMedia>|undefined;
   const stop=()=>{if(stopped)return;stopped=true;connection?.stop();element.remove();if(probeStop.current===stop)probeStop.current=undefined;if(alive){setProbingId("");if(["pinging","checking"].includes(checksRef.current[source.id]?.status))updateCheck(source.id,{status:"waiting"});schedule();}};probeStop.current=stop;
   connection=connectMedia(element,source.url,{
    reachable:(ms)=>{if(!alive)return;connectMs=ms;updateCheck(source.id,{status:"checking",connectMs:ms});},
    unconfirmed:()=>{if(!alive)return;updateCheck(source.id,{status:"unconfirmed",reason:"画面可播，直播状态待确认"});stop();},
    verified:()=>{if(!alive)return;recordSuccess(data.current,source.id);delete data.current.unavailable[channel.id];updateCheck(source.id,{status:"available",elapsedMs:performance.now()-started,connectMs});persistRef.current();stop();if(e.current.status==="unavailable")e.play(channel,false,source.id);},
    failure:(reason)=>{if(!alive)return;recordFailure(data.current,source.id);updateCheck(source.id,{status:"failed",connectMs,reason:reason||"连通但未能确认直播画面"});persistRef.current();stop();},
    blocked:()=>{if(!alive)return;updateCheck(source.id,{status:"blocked",reason:"浏览器限制自动检测，选此线路后点击播放"});stop();}
   },true);
  };
  schedule(0);return()=>{alive=false;clearTimeout(timer);probeStop.current?.();setProbingId("");};
 },[ready,selectedId,scanVersion,device]);
 const selectChannel=(id:string)=>{const c=catalogRef.current.channels.find(c=>c.id===id);if(!c)return false;setLinkNotice("");setSelectedId(id);selectedRef.current=id;probeStop.current?.();beginChecks(c);engine.current?.play(c);return true;};
 const selectSource=(id:string)=>{const c=catalogRef.current.channels.find(c=>c.id===selectedRef.current);if(!c||!browserSources(c).some(s=>s.id===id))return;const active=engine.current?.source?.id;probeStop.current?.();if(active&&["pinging","checking"].includes(checksRef.current[active]?.status))updateCheck(active,{status:"waiting"});engine.current?.play(c,false,id);};
 const recheckSources=()=>{const c=catalogRef.current.channels.find(c=>c.id===selectedRef.current);if(!c)return;probeStop.current?.();beginChecks(c);engine.current?.play(c,true);};
 const toggleFavorite=()=>{const p=data.current;p.favorites=p.favorites.includes(selectedId)?p.favorites.filter(id=>id!==selectedId):[...p.favorites,selectedId];persistRef.current();};
 const setAuto=(value:boolean)=>{data.current.autoSwitch=value;if(engine.current)engine.current.auto=value;persistRef.current();};
 const setSourceFilter=(value:SourceFilter)=>{data.current.sourceFilter=value;persistRef.current();};
 const hasFailed=(c:Channel)=>{const candidates=browserSources(c);return candidates.length>0&&candidates.every(s=>!sourceStateVisible(evaluateSource(s,evaluation),device,true));};
 const selected=catalog.channels.find(c=>c.id===selectedId)||catalog.channels[0];
 const isUnavailable=(c:Channel)=>{const r=prefs.unavailable[c.id];return !!r&&r.until>Date.now()&&r.fingerprint===fingerprint(c);};
 const lastSuccess=(c:Channel)=>Math.max(0,...browserSources(c).filter(s=>prefs.health[s.id]?.verifiedLive&&(prefs.health[s.id]?.okAt||0)>(prefs.health[s.id]?.failedAt||0)).map(s=>prefs.health[s.id]?.okAt||0));
 const othersPlayable=(c:Channel)=>channelHasSharedSuccess(c,deviceHealth);
 const backupCount=(selected?browserSources(selected):[]).filter(s=>s.id!==engine.current?.source?.id&&prefs.health[s.id]?.verifiedLive&&Date.now()-(prefs.health[s.id]?.okAt||0)<10*60_000&&!(prefs.health[s.id]?.until>Date.now())).length;
 return {evaluation,device,deviceHealth,catalog,prefs,selected,playback,probingId,sourceChecks:Object.fromEntries(Object.entries(sourceChecks).map(([id,check])=>[id,localSourceCheck(check,prefs.health[id])!])),sharedHealth,selectSource,recheckSources,setSourceFilter,hasFailed,notice:linkNotice||notice,catalogLoading,syncMessage,ready,category,setCategory,video,selectChannel,toggleFavorite,setAuto,isUnavailable,lastSuccess,backupCount,othersPlayable,retry:recheckSources,resume:()=>engine.current?.resume(),unmute:()=>{if(video.current)video.current.muted=false;},refresh:()=>refreshRef.current?.(true)};
}
