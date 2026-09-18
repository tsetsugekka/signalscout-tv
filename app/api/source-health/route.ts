import {catalogDb} from '@/db/catalog';
import {catalogChannel,catalogSource} from '@/lib/relay-state';
import {SHARED_HEALTH_TTL,type SharedHealth} from '@/lib/shared-health';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 try{
  const id=new URL(request.url).searchParams.get('channel');if(!id||id.length>512)return json({error:'Invalid channel'},400);
  const channel=await catalogChannel(id);if(!channel)return json({error:'Unknown channel'},404);
  const asOf=Date.now(),result:SharedHealth={};const sources=channel.sources.map(s=>s.url),db=catalogDb(),cutoff=asOf-SHARED_HEALTH_TTL;
  for(let i=0;i<sources.length;i+=80){const batch=sources.slice(i,i+80);const rows=await db.prepare(`SELECT source, ok_at, failed_at FROM source_health WHERE source IN (${batch.map(()=>'?').join(',')}) AND (ok_at > ? OR failed_at > ?)`).bind(...batch,cutoff,cutoff).all<{source:string;ok_at:number;failed_at:number}>();for(const row of rows.results)result[row.source]={okAt:row.ok_at,failedAt:row.failed_at};}
  return json({health:result,asOf});
 }catch{return json({error:'Shared status temporarily unavailable'},503);}
}
export async function POST(request:Request){
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Same-origin report required'},403);
 try{
  // Public, anonymous advisory reports. No IP, user ID, raw error or viewing history is stored.
  const reader=request.body?.getReader();if(!reader)return json({error:'Missing report'},400);
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16_384){await reader.cancel();return json({error:'Report too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(typeof data.source!=='string'||data.source.length>8192||!['available','failed'].includes(data.status))return json({error:'Invalid report'},400);
  if(!await catalogSource(data.source))return json({error:'Unknown source'},404);
  const now=Date.now(),ok=data.status==='available';
  await catalogDb().prepare(`INSERT INTO source_health (source,ok_at,failed_at) VALUES (?,?,?) ON CONFLICT(source) DO UPDATE SET ok_at=CASE WHEN excluded.ok_at>0 THEN MAX(source_health.ok_at,excluded.ok_at) ELSE source_health.ok_at END, failed_at=CASE WHEN excluded.failed_at>0 THEN MAX(source_health.failed_at,excluded.failed_at) ELSE source_health.failed_at END`).bind(data.source,ok?now:0,ok?0:now).run();
  return json({accepted:true,at:now});
 }catch{return json({error:'Report could not be saved'},503);}
}
