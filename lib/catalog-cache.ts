import {catalogDb} from '@/db/catalog';
import {encodeCatalog,decodeCatalog,splitCachedPayload} from './catalog-codec';
export async function readCachedPayload<T>(payload:string):Promise<T>{
 if(!payload.startsWith('{'))return decodeCatalog<T>(payload);
 const manifest=JSON.parse(payload) as {chunks:string[]};
 const db=catalogDb();const parts:string[]=[];
 for(const key of manifest.chunks){const row=await db.prepare('SELECT payload FROM catalog_cache WHERE key = ?').bind(key).first<{payload:string}>();if(!row)throw new Error('Catalog chunk unavailable');parts.push(row.payload);}
 return decodeCatalog<T>(parts.join(''));
}
export async function writeCachedPayload(key:string,value:unknown,time:number){
 const db=catalogDb(),encoded=await encodeCatalog(value,Infinity),queries=[];
 const {payload,parts}=splitCachedPayload(key,encoded,crypto.randomUUID());
 for(const part of parts)queries.push(db.prepare('INSERT INTO catalog_cache (key,payload,synced_at,checked_at) VALUES (?, ?, ?, ?)').bind(part.key,part.payload,time,time));
 queries.push(db.prepare('INSERT INTO catalog_cache (key,payload,synced_at,checked_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,synced_at=excluded.synced_at').bind(key,payload,time,time));
 // Keep old chunks for a day so readers holding the previous manifest can finish.
 const prefix=key+':chunk:';queries.push(db.prepare('DELETE FROM catalog_cache WHERE key >= ? AND key < ? AND synced_at < ?').bind(prefix,prefix+'\uffff',time-86400_000));
 await db.batch(queries);
}
