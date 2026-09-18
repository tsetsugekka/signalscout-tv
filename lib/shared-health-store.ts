import {catalogDb} from '@/db/catalog';
import {browserSources,type Catalog} from './catalog';
// Only run after a valid catalog replaces the previous one, never on a failed refresh.
export async function pruneSharedHealth(catalog:Catalog){
 const current=new Set(catalog.channels.flatMap(c=>browserSources(c).map(s=>s.url)));
 const db=catalogDb();const rows=await db.prepare('SELECT source FROM source_health UNION SELECT source FROM device_source_health').all<{source:string}>();
 const removed=rows.results.filter(row=>!current.has(row.source)).map(row=>row.source);
 for(let i=0;i<removed.length;i+=80){const batch=removed.slice(i,i+80);for(const table of ["source_health","device_source_health"])await db.prepare(`DELETE FROM ${table} WHERE source IN (${batch.map(()=>'?').join(',')})`).bind(...batch).run();}
}
