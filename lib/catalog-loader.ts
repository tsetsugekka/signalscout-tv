import {fetchRedirects,readPlaylist} from './stream-relay';
import {checkPublicHost} from './relay-state';
import {catalogDb} from '@/db/catalog';
import {readCachedPayload,writeCachedPayload} from './catalog-cache';
import {INPUTS,TVAPP_README,parseTVAPPFeeds,parseCatalog,channelMerger} from './catalog';
type SavedFeed={text:string};
// Directory downloads only. Three workers, serialized requests per host, no retry storm.
export async function loadCatalogFeeds(resumeImport=false,baseOnly=false){
 const db=catalogDb(),failed:string[]=[],blocked=new Set<string>(),counts=new Map<string,number>(),chains=new Map<string,Promise<unknown>>();
 async function cachedText<T>(url:string,parse:(text:string)=>T){
  const key='feed:'+url,host=new URL(url).hostname;
  if(resumeImport){const saved=await db.prepare('SELECT payload FROM catalog_cache WHERE key = ? AND synced_at > ?').bind(key,Date.now()-3600_000).first<{payload:string}>();if(saved)return parse((await readCachedPayload<SavedFeed>(saved.payload)).text);}

  const previous=chains.get(host)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   try{
    if(blocked.has(host))throw new Error('Host refresh stopped after failure');
    const count=counts.get(host)||0;if(count>=3)await new Promise(r=>setTimeout(r,700+Math.random()*600));counts.set(host,count+1);
    let response:Response;
    try{({response}=await fetchRedirects(url,new Request(url,{signal:AbortSignal.timeout(12000)}),checkPublicHost));}catch(error){blocked.add(host);throw error;}
    if(!response.ok){await response.body?.cancel();if([403,429].includes(response.status)||response.status>=500)blocked.add(host);throw new Error(`HTTP ${response.status}`);}
    const text=await readPlaylist(response,8_000_000);const parsed=parse(text);
    await writeCachedPayload(key,{text},Date.now());return parsed;
   }catch(error){
    failed.push(url);console.warn('Directory refresh failed',url,error instanceof Error?error.message:'unknown');
    const row=await db.prepare('SELECT payload FROM catalog_cache WHERE key = ?').bind(key).first<{payload:string}>();
    if(row){const saved=await readCachedPayload<SavedFeed>(row.payload);return parse(saved.text);}return null;
   }
  });chains.set(host,task.then(()=>undefined));return task;
 }
 const registry=baseOnly?null:await cachedText(TVAPP_README,text=>{const urls=parseTVAPPFeeds(text);if(!urls.length)throw new Error('No TVAPP live catalogs');return urls;});
 const urls=[...new Set([...INPUTS.map(i=>i.url),...(registry||[])])];
 const merged=channelMerger(),loaded:string[]=[],baseLoaded=new Set<string>();let index=0;
 await Promise.all(Array.from({length:3},async()=>{while(index<urls.length){const i=index++;const channels=await cachedText(urls[i],parseCatalog);if(channels){merged.add(channels);loaded.push(urls[i]);if(i<INPUTS.length)baseLoaded.add(urls[i]);}}}));
 return {channels:merged.values(),baseComplete:baseLoaded.size===INPUTS.length,inputs:baseOnly?loaded:[TVAPP_README,...loaded],failedInputs:failed};
}
