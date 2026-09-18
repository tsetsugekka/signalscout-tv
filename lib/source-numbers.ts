import type {Channel} from './catalog';
// Numbers belong to (channel, URL), never a health ranking or a page position.
export function numberSources(channels:Channel[],previous:Channel[]=channels):Channel[]{
 const oldChannels=new Map(previous.map(c=>[c.id,c]));
 return channels.map(channel=>{
  const old=oldChannels.get(channel.id);const oldNumbers=new Map(old?.sources.map((s,i)=>[s.url,s.number||i+1]));
  const used=new Set<number>();const numbers=new Map<string,number>();
  for(const s of channel.sources){const n=oldNumbers.get(s.url);if(n&&!used.has(n)){numbers.set(s.url,n);used.add(n);}}
  let next=1;
  return {...channel,sources:channel.sources.map(source=>{let number=numbers.get(source.url);if(!number){while(used.has(next))next++;number=next;used.add(number);}return {...source,number};})};
 });
}
