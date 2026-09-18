import Hls from "hls.js";
import {sourceRank,type SharedHealth} from "./shared-health";
import type {SourceCheck} from "./source-checks";
import type { Channel, Source } from "./catalog";
import { browserSources,playbackUrl } from "./catalog";
import { recordFailure,recordSuccess,type LocalState } from "./local-state";
export type PlaybackStatus="idle"|"connecting"|"playing"|"paused"|"blocked"|"recovering"|"unavailable"|"offline"|"stopped";
export type PlayerState={status:PlaybackStatus;reason?:string;attemptSource?:string;source?:string;resolution?:string;streamType?:"live"|"unknown"};
type Connection={stop:()=>void;resume:()=>void};
type Callbacks={verified:()=>void;failure:(reason?:string)=>void;reachable?:(ms:number)=>void;blocked:()=>void;pause?:()=>void;playing?:()=>void;recovering?:()=>void;streamType?:(type:"live"|"unknown")=>void};
export function playlistType(text:string):"live"|"vod"|"master"|"unknown"{
 if(!text.trimStart().startsWith("#EXTM3U"))return "unknown";
 if(/#EXT-X-ENDLIST|#EXT-X-PLAYLIST-TYPE:VOD/.test(text))return "vod";
 if(/#EXT-X-STREAM-INF:/.test(text))return "master";
 return /#EXTINF:/.test(text)?"live":"unknown";
}
export function livePlaylistAdvanced(before:string,after:string){
 if(playlistType(before)!=="live"||playlistType(after)!=="live")return false;
 const sequence=(text:string)=>Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]||0);
 const segments=(text:string)=>text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith("#"));
 const original=(line:string)=>{try{const u=new URL(line,"https://relay.invalid");return u.pathname==="/api/stream"?u.searchParams.get("u")||line:line;}catch{return line;}};
 const old=segments(before).map(original),next=segments(after).map(original);
 return sequence(after)>sequence(before)||(!!next.length&&next[next.length-1]!==old[old.length-1]);
}
async function inspectNative(url:string,signal:AbortSignal,depth=0,initial?:Response):Promise<boolean>{
 const r=initial??await fetch(url,{signal,cache:"no-store"});if(!r.ok)return false;
 if(/video\/(mp4|webm)|audio\//i.test(r.headers.get("Content-Type")||"")||/\.(mp4|m4v|mov|webm)(?:[?#]|$)/i.test(r.url))return false;
 const text=await r.text();const kind=playlistType(text);
 if(kind==="master"&&depth===0){const lines=text.split(/\r?\n/);const index=lines.findIndex(l=>l.startsWith("#EXT-X-STREAM-INF:"));const child=lines.slice(index+1).find(l=>l.trim()&&!l.startsWith("#"));return child?inspectNative(new URL(child.trim(),r.url||url).href,signal,1):false;}
 if(kind!=="live")return false;
 const seconds=Number(text.match(/#EXT-X-TARGETDURATION:([\d.]+)/)?.[1]||6);
 await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));};const timer=setTimeout(()=>{signal.removeEventListener("abort",cancel);resolve();},Math.min(12000,Math.max(1000,seconds*1000+500)));if(signal.aborted)cancel();else signal.addEventListener("abort",cancel,{once:true});});
 const second=await fetch(r.url||url,{signal,cache:"no-store"});return second.ok&&livePlaylistAdvanced(text,await second.text());
}
// Verification requires advancing video frames, never just a successful manifest request.
export function connectMedia(video:HTMLVideoElement,url:string,callbacks:Callbacks,probe=false):Connection{
 const relayed=url.startsWith("http:"),connectTimeout=relayed?45000:6000,verificationBudget=relayed?90000:30000;
 url=playbackUrl(url);
 let disposed=false,verified=false,permissionBlocked=false,userPaused=false,recovered=false,baseline=-1,frames=0,frameId:number|undefined,lastProgress=performance.now(),lastTime=-1,activeMs=0,lastTick=performance.now();
 let hls:Hls|undefined;let inspected=false;const inspection=new AbortController();const inspectionTimeout=setTimeout(()=>inspection.abort(),verificationBudget-1000);
 const fail=(reason?:string)=>{if(!disposed&&!permissionBlocked&&!userPaused&&navigator.onLine&&document.visibilityState==="visible")callbacks.failure(reason);};
 const attemptPlay=()=>{permissionBlocked=false;userPaused=false;lastProgress=performance.now();void video.play().catch((e:DOMException)=>{if(disposed||e.name==="AbortError")return;if(e.name==="NotAllowedError"){permissionBlocked=true;callbacks.blocked();}else fail();});};
 const sample=()=>{
  if(disposed||video.paused||!navigator.onLine||document.visibilityState!=="visible")return;
  if(video.currentTime>lastTime+.04){lastProgress=performance.now();lastTime=video.currentTime;}
  if(video.videoWidth>0&&video.readyState>=2){
   if(baseline<0)baseline=video.currentTime;
   const hasFrames=!("requestVideoFrameCallback" in video)||frames>=2;
   if(!verified&&inspected&&hasFrames&&video.currentTime-baseline>=2){verified=true;callbacks.verified();}
  }
 };
 const onFrame=()=>{frames++;sample();if(!disposed)frameId=video.requestVideoFrameCallback(onFrame);};
 const onPause=()=>{if(!disposed&&verified&&!video.ended){userPaused=true;callbacks.pause?.();}};
 const onPlaying=()=>{userPaused=false;permissionBlocked=false;lastProgress=performance.now();if(verified)callbacks.playing?.();};
 const onError=()=>fail();
 video.addEventListener("timeupdate",sample);video.addEventListener("pause",onPause);video.addEventListener("playing",onPlaying);video.addEventListener("error",onError);video.addEventListener("ended",onError);
 if("requestVideoFrameCallback" in video)frameId=video.requestVideoFrameCallback(onFrame);
 if(probe)video.muted=true;
 const start=async()=>{
  const ping=new AbortController();const abortPing=()=>ping.abort();inspection.signal.addEventListener("abort",abortPing,{once:true});const pingTimeout=setTimeout(()=>ping.abort(),connectTimeout);const pingStart=performance.now();let response:Response;
  try{response=await fetch(url,{signal:ping.signal,cache:"no-store"});if(disposed)return;if(!response.ok){let reason=`连接返回 HTTP ${response.status}`;if(url.startsWith("/api/stream")){try{const error=await response.json() as {error?:string};if(error.error)reason=error.error;}catch{}}else void response.body?.cancel();fail(reason);return;}callbacks.reachable?.(performance.now()-pingStart);}
  catch{if(!disposed)fail(ping.signal.aborted?`连接超时（${connectTimeout/1000} 秒）`:"网络或跨域限制，无法确认连通性");return;}
  finally{clearTimeout(pingTimeout);}
 if(video.canPlayType("application/vnd.apple.mpegurl")){
  void inspectNative(url,inspection.signal,0,response).then(live=>{if(disposed)return;if(!live){fail();return;}inspected=true;callbacks.streamType?.("live");video.src=url;attemptPlay();}).catch(()=>{if(!disposed)fail();}).finally(()=>clearTimeout(inspectionTimeout));
 }
 else if(Hls.isSupported()){
  void response.body?.cancel();
  hls=new Hls({maxBufferLength:probe?4:20,maxMaxBufferLength:probe?6:40,backBufferLength:10,manifestLoadPolicy:{default:{maxTimeToFirstByteMs:connectTimeout,maxLoadTimeMs:connectTimeout+5000,timeoutRetry:{maxNumRetry:0,retryDelayMs:0,maxRetryDelayMs:0},errorRetry:{maxNumRetry:0,retryDelayMs:0,maxRetryDelayMs:0}}}});
  const playlistWindows=new Map<number,{start:number;end:number}>();
  hls.on(Hls.Events.LEVEL_LOADED,(_event,data)=>{if(disposed)return;if(!data.details.live){fail();return;}const old=playlistWindows.get(data.level);const next={start:data.details.startSN,end:data.details.endSN};playlistWindows.set(data.level,next);if(!inspected&&old&&(next.start>old.start||next.end>old.end)){inspected=true;callbacks.streamType?.("live");attemptPlay();}});
  hls.on(Hls.Events.ERROR,(_event,data)=>{if(!data.fatal||disposed)return;if(!navigator.onLine||document.visibilityState!=="visible")return;if(verified&&!recovered&&!probe&&!video.paused){recovered=true;callbacks.recovering?.();lastProgress=performance.now();if(data.type===Hls.ErrorTypes.MEDIA_ERROR)hls?.recoverMediaError();else hls?.startLoad();}else fail();});
  hls.loadSource(url);hls.attachMedia(video);
 }else{void response.body?.cancel();queueMicrotask(()=>fail("此浏览器不支持直播播放"));}
 };void start();
 const timer=setInterval(()=>{
  const now=performance.now(),dt=now-lastTick;lastTick=now;
  if(disposed||permissionBlocked||userPaused||!navigator.onLine||document.visibilityState!=="visible"){lastProgress=now;return;}
  sample();if(!verified){activeMs+=dt;if(activeMs>verificationBudget)fail();}
  else if(now-lastProgress>12_000){if(!recovered&&!probe){recovered=true;lastProgress=now;callbacks.recovering?.();hls?.startLoad();if(!hls){video.load();attemptPlay();}}else fail();}
 },750);
 return {resume:attemptPlay,stop:()=>{if(disposed)return;disposed=true;inspection.abort();clearTimeout(inspectionTimeout);clearInterval(timer);if(frameId!==undefined)video.cancelVideoFrameCallback(frameId);video.removeEventListener("timeupdate",sample);video.removeEventListener("pause",onPause);video.removeEventListener("playing",onPlaying);video.removeEventListener("error",onError);video.removeEventListener("ended",onError);hls?.destroy();video.pause();video.removeAttribute("src");video.load();}};
}
export function fingerprint(channel:Channel){return channel.sources.map(s=>s.id).sort().join("\n");}
export function orderedSources(channel:Channel,state:LocalState,attempted=new Set<string>(),shared:SharedHealth={}){
 const now=Date.now(),preferred=state.lastPlayedSources[channel.id];return browserSources(channel).filter(s=>!attempted.has(s.id)&&(s.id===preferred||!(state.health[s.id]?.until>now))).sort((a,b)=>{
  if(a.id===preferred)return -1;if(b.id===preferred)return 1;
  const score=(s:Source)=>{const t=state.health[s.id]?.verifiedLive?state.health[s.id].okAt||0:0;return now-t<24*3600_000?t:0;};return score(b)-score(a)||sourceRank(undefined,shared[a.id],now)-sourceRank(undefined,shared[b.id],now);
 });
}
export class PlayerEngine{
 sharedHealth:SharedHealth={};loadShared?:(channel:Channel)=>Promise<SharedHealth>;
 preferredSourceId?:string;connection?:Connection;channel?:Channel;source?:Source;attempted=new Set<string>();generation=0;auto=true;disposed=false;current:PlayerState={status:"idle"};
 constructor(public video:HTMLVideoElement,public local:LocalState,public update:(state:PlayerState)=>void,public persist:()=>void,public suspendProbe:()=>void,public sourceCheck:(id:string,result:SourceCheck)=>void=()=>{}){}
 emit(next:PlayerState){this.current=next;this.update(next);}
 play(channel:Channel,force=false,preferredSourceId?:string){if(this.source&&["connecting","recovering"].includes(this.current.status))this.sourceCheck(this.source.id,{status:"waiting"});this.preferredSourceId=preferredSourceId;this.suspendProbe();this.generation++;this.connection?.stop();this.channel=channel;this.source=undefined;this.attempted.clear();if(force){for(const s of channel.sources){if(this.local.health[s.id])this.local.health[s.id].until=0;}delete this.local.unavailable[channel.id];this.persist();}if(this.loadShared&&!preferredSourceId){const gen=this.generation;this.emit({status:"connecting"});void this.loadShared(channel).catch(()=>this.sharedHealth).then(health=>{if(this.disposed||gen!==this.generation)return;this.sharedHealth=health;this.next(false);});}else this.next(false);}
 next(recovering:boolean){
  this.connection?.stop();this.connection=undefined;this.suspendProbe();
  const channel=this.channel;if(!channel||this.disposed)return;
  if(!navigator.onLine){this.emit({status:"offline"});return;}
  const candidates=orderedSources(channel,this.local,this.attempted,this.sharedHealth);const source=browserSources(channel).find(s=>s.id===this.preferredSourceId&&!this.attempted.has(s.id))||candidates[0];
  if(!source){const compatible=browserSources(channel);const until=compatible.length?Math.min(...compatible.map(s=>this.local.health[s.id]?.until||Date.now()+10*60_000)):Date.now()+6*3600_000;
   this.local.unavailable[channel.id]={fingerprint:fingerprint(channel),until};this.persist();
   this.emit({status:"unavailable",reason:compatible.length?"当前网络暂无可播放线路，稍后会自动复查。":"这些线路不是受支持的直播格式，可在下方查看源地址。"});return;
  }
  this.source=source;this.attempted.add(source.id);const gen=this.generation;const started=performance.now();let connectMs:number|undefined;let streamType:"live"|"unknown"="unknown";
  this.emit({status:recovering?"recovering":"connecting",attemptSource:source.id});this.sourceCheck(source.id,{status:"pinging"});
  this.connection=connectMedia(this.video,source.url,{
   reachable:(ms)=>{if(gen!==this.generation)return;connectMs=ms;this.sourceCheck(source.id,{status:"checking",connectMs:ms});},
   streamType:(type)=>{streamType=type;if(gen===this.generation&&this.current.source)this.emit({...this.current,streamType:type});},
   verified:()=>{if(gen!==this.generation||this.disposed)return;recordSuccess(this.local,source.id);this.sourceCheck(source.id,{status:"available",elapsedMs:performance.now()-started,connectMs});delete this.local.unavailable[channel.id];this.local.lastChannel=channel.id;this.local.lastPlayedSources[channel.id]=source.id;this.local.recent=[channel.id,...this.local.recent.filter(id=>id!==channel.id)].slice(0,20);this.persist();this.emit({status:"playing",source:source.id,resolution:`${this.video.videoHeight}p`,streamType});},
   failure:(reason)=>{if(gen!==this.generation||this.disposed)return;const hadPlayed=!!this.current.source;recordFailure(this.local,source.id);this.sourceCheck(source.id,{status:"failed",connectMs,reason:reason||"连通但未能确认直播画面"});this.persist();this.connection?.stop();if(hadPlayed&&!this.auto){this.emit({status:"stopped",reason:"播放已中断，点击重新连接继续。"});return;}this.next(hadPlayed||recovering);},
   blocked:()=>{if(gen===this.generation){this.sourceCheck(source.id,{status:"blocked",reason:"浏览器要求点击播放后验证"});this.emit({status:"blocked",attemptSource:source.id});}},
   pause:()=>{if(gen===this.generation)this.emit({...this.current,status:"paused"});},
   playing:()=>{if(gen===this.generation)this.emit({...this.current,status:"playing"});},
   recovering:()=>{if(gen===this.generation)this.emit({...this.current,status:"recovering"});}
  });
 }
 resume(){this.connection?.resume();}
 pause(){this.video.pause();}
 dispose(){this.disposed=true;this.generation++;this.connection?.stop();}
}
