import {catalogDb} from "@/db/catalog";
import {readCachedPayload} from "./catalog-cache";
import {browserSources,mergeChannels,channelIdentity,CATALOG_CACHE_KEY,type Catalog,type Channel} from "./catalog";
import {publicUrl,signingKey,validateAddresses} from "./stream-relay";
let key:Promise<CryptoKey>|undefined;
export function relayKey(){return key??=(async()=>{const db=catalogDb();let row=await db.prepare("SELECT payload FROM catalog_cache WHERE key = ?").bind("relay-signing-v1").first<{payload:string}>();if(!row){const secret=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,"0")).join("");await db.prepare("INSERT OR IGNORE INTO catalog_cache (key,payload,synced_at,checked_at) VALUES (?, ?, 0, 0)").bind("relay-signing-v1",secret).run();row=await db.prepare("SELECT payload FROM catalog_cache WHERE key = ?").bind("relay-signing-v1").first<{payload:string}>();}if(!row)throw new Error("Relay key unavailable");return signingKey(row.payload);})().catch(e=>{key=undefined;throw e;});}
let catalog:{until:number;sources:Set<string>;channels:Map<string,Channel>}|undefined;
export function invalidateCatalogSources(){catalog=undefined;}
async function cachedCatalog(){if(!catalog||catalog.until<Date.now()){const row=await catalogDb().prepare("SELECT payload FROM catalog_cache WHERE key = ? AND synced_at > 0").bind(CATALOG_CACHE_KEY).first<{payload:string}>();if(!row)return undefined;const data=await readCachedPayload<Catalog>(row.payload);catalog={until:Date.now()+30_000,sources:new Set(data.channels.flatMap(c=>browserSources(c).map(s=>s.url))),channels:new Map(mergeChannels([data.channels]).map(c=>[c.id,c]))};}return catalog;}
export async function catalogSourceSet(){return (await cachedCatalog())?.sources??new Set<string>();}
export async function catalogSource(url:string){return (await cachedCatalog())?.sources.has(url)??false;}
export async function catalogChannel(id:string){return (await cachedCatalog())?.channels.get(channelIdentity(id));}
const hosts=new Map<string,{until:number;addresses:string[]}>();
// Resolve public names before fetching; no private network bindings or user headers are used.
export async function checkPublicHost(u:URL,expectedAddress?:string){publicUrl(u.href);const host=u.hostname;if(/^[\d.]+$/.test(host)||host.includes(':'))return;const cached=hosts.get(host);if(cached&&cached.until>Date.now()){validateAddresses(cached.addresses,expectedAddress);return;}
 const answers=await Promise.all(["A","AAAA"].map(async type=>{const r=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{Accept:"application/dns-json"},signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error("DNS lookup failed");const data=await r.json() as {Status:number;Answer?:{type:number;data:string}[]};if(data.Status!==0)throw new Error("DNS lookup failed");return (data.Answer||[]).filter(a=>a.type===1||a.type===28).map(a=>a.data);}));
 const addresses=answers.flat();validateAddresses(addresses,expectedAddress);if(hosts.size>=512)hosts.clear();hosts.set(host,{until:Date.now()+60_000,addresses});
}
