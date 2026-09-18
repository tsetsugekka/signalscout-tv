import {catalogDb} from '@/db/catalog';
import {browserSources,type Catalog} from './catalog';
// Only run after a valid catalog replaces the previous one, never on a failed refresh.
export async function pruneSharedHealth(catalog:Catalog){
 const current=new Set(catalog.channels.flatMap(c=>browserSources(c).map(s=>s.url)));
 const db=catalogDb();const rows=await db.prepare('SELECT source FROM source_health').all<{source:string}>();
 const removed=rows.results.filter(row=>!current.has(row.source)).map(row=>row.source);
 for(let i=0;i<removed.length;i+=80){const batch=removed.slice(i,i+80);await db.prepare(`DELETE FROM source_health WHERE source IN (${batch.map(()=>'?').join(',')})`).bind(...batch).run();}
}
