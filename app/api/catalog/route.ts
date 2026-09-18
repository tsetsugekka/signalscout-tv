import {numberSources} from "@/lib/source-numbers";
import {pruneSharedHealth} from "@/lib/shared-health-store";
import {invalidateCatalogSources} from "@/lib/relay-state";
import {loadCatalogFeeds} from "@/lib/catalog-loader";
import {catalogDb} from "@/db/catalog";
import {catalogFromChannels,CATALOG_CACHE_KEY,TVAPP_README,type Catalog} from "@/lib/catalog";
import {readCachedPayload,writeCachedPayload} from "@/lib/catalog-cache";
const ONE_HOUR=60*60*1000;
const CACHE_KEY=CATALOG_CACHE_KEY;
type Row={payload:string;synced_at:number;checked_at:number};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
 try{
  const db=catalogDb();const now=Date.now();const params=new URL(request.url).searchParams;const force=params.get("refresh")==="1";
  let row=await db.prepare("SELECT payload, synced_at, checked_at FROM catalog_cache WHERE key = ?").bind(CACHE_KEY).first<Row>();
  if(params.get("status")==="1")return json({syncedAt:row?.synced_at||0});
  const cached=row?.synced_at?await readCachedPayload<Catalog>(row.payload):null;
  if(!force&&cached)return json({...cached,origin:"cache",refreshNeeded:!cached.inputs?.includes(TVAPP_README)||now-cached.syncedAt>=ONE_HOUR});
  const baseOnly=!cached;
  const leaseKey=baseOnly?"catalog-base-load":"catalog-full-refresh";
  await db.prepare("INSERT OR IGNORE INTO catalog_cache (key,payload,synced_at,checked_at) VALUES (?, ?, 0, 0)").bind(leaseKey,"").run();
  const lease=await db.prepare("UPDATE catalog_cache SET checked_at = ? WHERE key = ? AND checked_at < ?").bind(now,leaseKey,now-60*1000).run();
  if(lease.meta.changes){
   try{
    const feeds=await loadCatalogFeeds(!cached?.inputs?.includes(TVAPP_README),baseOnly);
    const catalog:Catalog={...await catalogFromChannels(feeds.channels,Date.now(),feeds.inputs),failedInputs:feeds.failedInputs,stale:feeds.failedInputs.length>0};
    const previous=cached;
    if(!feeds.baseComplete)throw new Error("Base catalog unavailable; retaining last good copy");
    if(catalog.channels.length<10||(previous&&catalog.channels.length<previous.channels.length/2))throw new Error("Incomplete catalog; retaining last good copy");
    catalog.channels=numberSources(catalog.channels,cached?.channels);
    await writeCachedPayload(CACHE_KEY,catalog,catalog.syncedAt);
    invalidateCatalogSources();
    await pruneSharedHealth(catalog).catch(()=>console.warn("Obsolete shared status cleanup deferred"));
    return json({...catalog,origin:"github",refreshNeeded:baseOnly});
   }catch(error){console.error("Catalog refresh failed",error instanceof Error?error.message:"unknown");}
  }
  row=await db.prepare("SELECT payload, synced_at, checked_at FROM catalog_cache WHERE key = ?").bind(CACHE_KEY).first<Row>();
  if(row?.synced_at){const latest=await readCachedPayload<Catalog>(row.payload);return json({...latest,stale:!!latest.stale||!!lease.meta.changes||now-row.synced_at>=ONE_HOUR,origin:lease.meta.changes?"stale":"cooldown",refreshNeeded:!latest.inputs?.includes(TVAPP_README)||now-row.synced_at>=ONE_HOUR});}
  return json({error:"GitHub 频道目录暂时无法更新，请稍后再试。"},503);
 }catch(error){console.error("Catalog storage unavailable",error instanceof Error?error.message:"unknown");return json({error:"频道目录暂时无法加载。"},503);}
}
