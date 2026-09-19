import {normalizeName,isBrowserSource,type Channel} from './catalog';

// Reversible UTF-8 hex: deterministic and collision-free for distinct catalog names.
export function channelLinkKey(name:string){return 'c'+Array.from(new TextEncoder().encode(name),byte=>byte.toString(16).padStart(2,'0')).join('');}
function channelLinkName(value:string){
 if(!/^c(?:[0-9a-f]{2})+$/.test(value))return value;
 try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(value.slice(1).match(/../g)!,hex=>parseInt(hex,16)));}catch{return value;}
}
export type PlaybackLink={channel:string;source?:number;invalidSource?:boolean};
export function readPlaybackLink(search:string):PlaybackLink|undefined{
 const params=new URLSearchParams(search),channel=params.get('channel')?.trim();if(!channel)return;
 const raw=params.get('source');if(!raw)return {channel};
 const source=Number(raw);return /^[1-9]\d*$/.test(raw)&&Number.isSafeInteger(source)?{channel,source}:{channel,invalidSource:true};
}
export function resolvePlaybackLink(channels:Channel[],link:PlaybackLink,settled:boolean):{pending:boolean;channel?:Channel;source?:string;notice?:string}{
 const name=normalizeName(channelLinkName(link.channel));
 const channel=channels.find(c=>c.id===name);
 if(!channel)return settled?{pending:false,notice:'未找到链接中的频道，已使用默认频道。'}:{pending:true};
 if(link.invalidSource)return {pending:false,channel,notice:'链接中的线路编号无效，已自动选源。'};
 if(link.source){
  const source=channel.sources.find((s,i)=>(s.number||i+1)===link.source);
  if(!source&&!settled)return {pending:true};
  if(!source||!isBrowserSource(source))return {pending:false,channel,notice:'链接中的线路已移除或不支持网页播放，已自动选源。'};
  return {pending:false,channel,source:source.id};
 }
 return {pending:false,channel};
}
export function playbackLinkSearch(channel:Channel,sourceId?:string){
 const params=new URLSearchParams({channel:channelLinkKey(channel.id)});
 const source=channel.sources.find(s=>s.id===sourceId);if(source?.number)params.set('source',String(source.number));
 return params.toString();
}
