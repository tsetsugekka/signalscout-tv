import {classifyChannel,compareChannelNames,countryCategory,isBdQualityName} from "./channel-category";
export type Source = { id: string; url: string; number?:number; qualities?:string[]; countries?:string[] };
export type Channel = { id: string; name: string; title: string; group: string; sources: Source[] };
export type Catalog = { version: string; syncedAt: number; channels: Channel[]; stale?: boolean; inputs?: string[]; failedInputs?: string[] };
export const UPSTREAM = "https://raw.githubusercontent.com/CCSH/IPTV/refs/heads/main/live_lite.m3u";
export const INPUTS=[{name:"live_lite.m3u",url:UPSTREAM},{name:"others.txt",url:"https://raw.githubusercontent.com/CCSH/IPTV/refs/heads/main/others.txt"}];
export const CATALOG_CACHE_KEY="merged-v4";
export const TVAPP_README="https://raw.githubusercontent.com/youhunwl/TVAPP/main/README.md";
export function parseTVAPPFeeds(readme:string){
 const section=readme.split(/^##\s+直播源[^\n]*$/m)[1]?.split(/^##\s/m)[0]||"";
 return [...new Set(section.split(/\r?\n/).map(line=>line.trim().match(/^https?:\/\/[^\s`<>]+/)?.[0]).filter((url):url is string=>!!url))];
}
export function parseCatalog(text:string){return text.replace(/^\uFEFF/,"").trimStart().startsWith("#EXTM3U")?parsePlaylist(text.replace(/^\uFEFF/,"")):parseTxt(text);}
const titles: Record<string,string> = {CCTV1:"综合",CCTV2:"财经",CCTV3:"综艺",CCTV4:"中文国际",CCTV5:"体育","CCTV5+":"体育赛事",CCTV6:"电影",CCTV7:"国防军事",CCTV8:"电视剧",CCTV9:"纪录",CCTV10:"科教",CCTV11:"戏曲",CCTV12:"社会与法",CCTV13:"新闻",CCTV14:"少儿",CCTV15:"音乐",CCTV16:"奥林匹克",CCTV17:"农业农村",CCTV4K:"超高清"};
export function channelQuality(name:string){
 const qualities:string[]=[],countries:string[]=[];const add=(tag:string)=>{const label=tag.toUpperCase().replace(/^(\d+)([IP])$/,(_,n,mode)=>n+mode.toLowerCase());if(!qualities.includes(label))qualities.push(label);};
 let value=name.trim().replace(/[\[【（(](HD|FHD|UHD|SD|VGA|[248]K|\d{3,4}[ip]|超高清|高清|超清|标清|蓝光)[\]】）)]/gi,(_,tag)=>{add(tag);return '';}).trim();
 // BD can mean Bangladesh; only remove it for an identifiable station name.
 if(/^\[BD\]/i.test(value)&&isBdQualityName(value.slice(4))){add('BD');value=value.slice(4).trim();}
 if(!/^CCTV[48]K(?:超高清)?$/i.test(value))value=value.replace(/(HD|FHD|UHD|SD|VGA|[248]K|\d{3,4}[ip]|超高清|高清|超清)$/i,(_,tag)=>{add(tag);return '';}).trim();
 const country=value.match(/^[「【\[]([A-Z]{2})[」】\]]\s*/i);
 if(country&&countryCategory(country[1])){countries.push(country[1].toUpperCase());value=value.slice(country[0].length).trim();}
 return {name:value||name.trim(),qualities,countries};
}
function withQuality(source:Source,qualities:string[],countries:string[]=[]):Source{const merged=[...new Set([...(source.qualities||[]),...qualities])],regions=[...new Set([...(source.countries||[]),...countries])];return {...source,...(merged.length?{qualities:merged}:{}),...(regions.length?{countries:regions}:{})};}
export function normalizeName(name:string){
 let value=channelQuality(name).name;
 value=value.replace(/^CCTV[-\s]*(\d+)\s*(PLUS|＋|\+)/i,"CCTV$1+").replace(/^CCTV[-\s]*(\d+)/i,"CCTV$1").trim();
 value=value.replace(/[-–—\s]+卫视/,"卫视").replace(/卫视[-–—]NPTV$/i,"卫视");
 if(/^CCTV/i.test(value))value=value.replace(/[（(](?:\d{3,4}[ip]|HD|FHD|高清|超清)[）)]$/i,"").trim();
 for(const [code,title] of Object.entries(titles))if(value===code||value===code+title||value===code+"-"+title||value===code+" "+title)return code;
 return value;
}
export function channelIdentity(name:string){return normalizeName(name).replace(/\s/g,"").replace(/[a-z]/g,letter=>letter.toUpperCase());}
function preferDisplayName(current:Channel,name:string){if(name===channelIdentity(name)&&current.name!==current.id){current.name=name;current.title=titles[name]||name;}}
export function channelDisplayName(channel:Channel){const title=titles[channel.name];return title?channel.name+title:channel.title===channel.name?channel.name:channel.name+channel.title;}

export function parsePlaylist(text:string): Channel[]{
 if(!text.trimStart().startsWith("#EXTM3U"))throw new Error("Invalid M3U header");
 const channels=new Map<string,Channel>(); let name="", group="",id="",qualities:string[]=[],countries:string[]=[];
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();
  if(line.startsWith("#EXTINF:")){const rawName=line.slice(line.lastIndexOf(",")+1);name=normalizeName(rawName);id=channelIdentity(rawName);({qualities,countries}=channelQuality(rawName));group=line.match(/group-title="([^"]*)"/)?.[1]||"其他";if(group!=="更新时间")group=classifyChannel(rawName,group);continue;}
  if(!line||line.startsWith("#")||!name)continue;
  if(group==="更新时间"){name="";continue;}
  try{const url=new URL(line);if(!["https:","http:"].includes(url.protocol)||url.username||url.password){name="";continue;}}catch{name="";continue;}
  const key=countries.join(",")+":"+id;const display=countries.length?`[${countries[0]}] ${name}`:name;const channel=channels.get(key)||{id,name:display,title:titles[display]||display,group:countryCategory(countries[0]||"")||classifyChannel(name,group),sources:[]};
  if(!countries.length)preferDisplayName(channel,name);
  const existing=channel.sources.find(s=>s.url===line);if(existing)Object.assign(existing,withQuality(existing,qualities,countries));else channel.sources.push(withQuality({id:line,url:line},qualities,countries));channels.set(key,channel);name="";
 }
 const result=[...channels.values()].sort((a,b)=>compareChannelNames(a.name,b.name));
 if(!result.length)throw new Error("Empty playlist");return mergeChannels([result]);
}
export function parseTxt(text:string):Channel[]{
 if(/^\s*</.test(text))throw new Error("Invalid TXT catalog");
 const entries:string[]=["#EXTM3U"];let group="其他频道";
 for(const raw of text.replace(/^\uFEFF/,"").split(/\r?\n/)){
  const line=raw.trim();if(!line||line.startsWith("#"))continue;const comma=line.indexOf(",");if(comma<1)continue;
  const name=line.slice(0,comma).trim();const value=line.slice(comma+1).trim();
  if(value==="#genre#"){group=name;continue;}
  if(!/^https?:\/\//.test(value))continue;
  const category=group.replaceAll('"','');
  entries.push(`#EXTINF:-1 group-title="${category}",${name}`,value);
 }
 return parsePlaylist(entries.join("\n"));
}
export function channelMerger(){
 const map=new Map<string,Channel>();const urls=new Map<string,Map<string,Source>>();
 const add=(list:Channel[])=>{for(const original of list){
  const cleanName=normalizeName(original.name),metadata=channelQuality(original.name);
  const name=metadata.countries.length?`[${metadata.countries[0]}] ${cleanName}`:cleanName;
  const channel={...original,id:channelIdentity(original.id||original.name),name,title:titles[name]||name,group:classifyChannel(original.name,original.group)};
  let entry=map.get(channel.id);if(!entry){entry={...channel,sources:[]};map.set(channel.id,entry);urls.set(channel.id,new Map());}
  if(channelQuality(entry.name).countries.join()!==metadata.countries.join()){
   entry.name=normalizeName(entry.name);entry.title=titles[entry.name]||entry.name;
  }
  if(!channelQuality(entry.name).countries.length)preferDisplayName(entry,cleanName);
  if(entry.group==="其他"&&channel.group!=="其他")entry.group=channel.group;
  const seen=urls.get(channel.id)!,{qualities,countries}=channelQuality(original.name);
  for(const source of channel.sources){const tagged=withQuality(source,qualities,countries),existing=seen.get(source.url);if(existing)Object.assign(existing,withQuality(existing,tagged.qualities||[],tagged.countries||[]));else{const copy={...tagged};entry.sources.push(copy);seen.set(source.url,copy);}}
 }
 };return {add,values:()=>[...map.values()].sort((a,b)=>compareChannelNames(a.name,b.name))};
}
export function mergeChannels(lists:Channel[][]):Channel[]{const merged=channelMerger();for(const list of lists)merged.add(list);return merged.values();}
export async function makeCatalog(text:string,now=Date.now(),extras:string[]=[]):Promise<Catalog>{
 const channels=mergeChannels([parsePlaylist(text),...extras.map(parseCatalog)]);
 return catalogFromChannels(channels,now,extras.length?INPUTS.map(i=>i.name):[INPUTS[0].name]);
}
export async function catalogFromChannels(channels:Channel[],now=Date.now(),inputs:string[]=[]) {
 const canonical=JSON.stringify(channels.map(c=>[c.id,c.group,c.sources.map(s=>s.url).sort()]));
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));
 return {channels,syncedAt:now,inputs,version:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")};
}
export function isBrowserSource(s:Source){return /^https?:/.test(s.url)&&!/\.(swf|mp4|m4v|mov|webm|mp3|m4a|aac)(?:[?#]|$)/i.test(s.url);}
export function browserSources(c:Channel){return c.sources.filter(isBrowserSource);}

export function playbackUrl(url:string){return url.startsWith("http:")?`/api/stream?source=${encodeURIComponent(url)}`:url;}
