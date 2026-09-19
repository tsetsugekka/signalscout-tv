import {catalogDb} from '@/db/catalog';
import {catalogSourceSet,catalogChannel,catalogSource} from '@/lib/relay-state';
import {type DeviceHealth} from '@/lib/shared-health';
import {summarizeVotes,observerHash,validObserver,type SourceVote} from '@/lib/source-votes';
async function readHealth(sources:string[],observer?:string){
 const db=catalogDb(),legacy:DeviceHealth={},votes:SourceVote[]=[],hashes:Record<string,string>={};
 for(let i=0;i<sources.length;i+=80){const batch=sources.slice(i,i+80),marks=batch.map(()=>'?').join(',');
  const rows=await db.prepare(`SELECT source, device, ok_at FROM device_source_health WHERE source IN (${marks}) AND ok_at>0`).bind(...batch).all<{source:string;device:'pc'|'mobile';ok_at:number}>();
  for(const row of rows.results)(legacy[row.source]??={})[row.device]={okAt:row.ok_at,failedAt:0};
  const reports=await db.prepare(`SELECT source,device,reporter,ok_at,failed_at FROM source_votes WHERE source IN (${marks})`).bind(...batch).all<SourceVote>();votes.push(...reports.results);
 }
 if(observer)await Promise.all(sources.map(async source=>{hashes[source]=await observerHash(source,observer);}));
 return summarizeVotes(votes,legacy,hashes);
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 try{
  const asOf=Date.now();const params=new URL(request.url).searchParams;const observer=request.headers.get('X-Playback-Observer');let sources:string[];
  if(params.get('scope')==='catalog'){
   const current=await catalogSourceSet();const rows=await catalogDb().prepare('SELECT source FROM device_source_health WHERE ok_at>0 UNION SELECT source FROM source_votes').all<{source:string}>();
   sources=rows.results.map(row=>row.source).filter(source=>current.has(source));
  }else{
   const id=params.get('channel');if(!id||id.length>512)return json({error:'Invalid channel'},400);
   const channel=await catalogChannel(id);if(!channel)return json({error:'Unknown channel'},404);sources=channel.sources.map(s=>s.url);
  }
  const devices=await readHealth(sources,validObserver(observer)?observer:undefined);
  return json({devices,asOf});
 }catch{return json({error:'Shared status temporarily unavailable'},503);}
}
export async function POST(request:Request){
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Same-origin report required'},403);
 try{
  // Per-source pseudonymous browser votes; no IP, account or raw observer token is stored.
  const reader=request.body?.getReader();if(!reader)return json({error:'Missing report'},400);
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16_384){await reader.cancel();return json({error:'Report too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(typeof data.source!=='string'||data.source.length>8192||!['available','failed'].includes(data.status)||!['pc','mobile'].includes(data.device)||!validObserver(data.observer))return json({error:'Invalid report'},400);
  if(!await catalogSource(data.source))return json({error:'Unknown source'},404);
  const now=Date.now(),ok=data.status==='available';
  const reporter=await observerHash(data.source,data.observer);
  await catalogDb().prepare(`INSERT INTO source_votes (source,device,reporter,ok_at,failed_at) VALUES (?,?,?,?,?) ON CONFLICT(source,device,reporter) DO UPDATE SET ok_at=MAX(source_votes.ok_at,excluded.ok_at),failed_at=MAX(source_votes.failed_at,excluded.failed_at)`).bind(data.source,data.device,reporter,ok?now:0,ok?0:now).run();
  return json({accepted:true,at:now,devices:await readHealth([data.source],data.observer)});
 }catch{return json({error:'Report could not be saved'},503);}
}
