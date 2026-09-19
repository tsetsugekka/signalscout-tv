import {channelIdentity,type Channel} from './catalog';
// Preserve the canonical group's numbers first; merged variants fill remaining slots.
export function numberSources(channels:Channel[],previous:Channel[]=channels):Channel[]{
 const groups=new Map<string,Channel[]>();
 for(const old of previous){const id=channelIdentity(old.id);const list=groups.get(id)||[];list.push(old);groups.set(id,list);}
 return channels.map(channel=>{
  const oldGroups=[...(groups.get(channelIdentity(channel.id))||[])].sort((a,b)=>Number(b.id===channel.id)-Number(a.id===channel.id));
  const urls=new Set(channel.sources.map(s=>s.url)),used=new Set<number>(),numbers=new Map<string,number>();
  for(const old of oldGroups)old.sources.forEach((s,i)=>{const n=s.number||i+1;if(urls.has(s.url)&&!numbers.has(s.url)&&!used.has(n)){numbers.set(s.url,n);used.add(n);}});
  let next=1;
  return {...channel,sources:channel.sources.map(source=>{let number=numbers.get(source.url);if(!number){while(used.has(next))next++;number=next;used.add(number);}return {...source,number};})};
 });
}
