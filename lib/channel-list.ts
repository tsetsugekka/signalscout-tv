import type {Channel} from './catalog';
import {categoryPriority,compareChannelNames} from './channel-category';

export function isPrimaryChannel(channel:Channel){
 const name=channel.name.trimStart();
 if(name[0]!=="["&&/^[\p{P}\p{S}]/u.test(name))return false;
 const exempt=channel.group==="港澳台"&&categoryPriority(name,channel.group)===0
  ||channel.group==="海外"&&categoryPriority(name,channel.group)<4;
 return exempt||channel.sources.length>=3;
}

// Preserve the existing category/recent ordering within each visibility group.
export function channelListPage(channels:Channel[],searching:boolean,expanded:boolean,limit:number){
 if(searching)return {visible:channels.slice(0,limit),remaining:Math.max(0,channels.length-limit)};
 const primary:Channel[]=[],deferred:Channel[]=[];
 for(const channel of channels)(isPrimaryChannel(channel)?primary:deferred).push(channel);
 const visible=(expanded?[...primary,...deferred]:primary).slice(0,limit);
 return {visible,remaining:channels.length-visible.length};
}

export function compareChannelSourceCounts(a:Channel,b:Channel){
 return b.sources.length-a.sources.length||compareChannelNames(a.name,b.name);
}
