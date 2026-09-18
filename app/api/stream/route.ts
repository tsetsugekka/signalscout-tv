import {catalogSource,relayKey,checkPublicHost} from "@/lib/relay-state";
import {RelayConnectionError,publicUrl,verifyTicket,rewritePlaylist,fetchRedirects,readPlaylist,assetHeaders,TICKET_LIFETIME,type RelayKind} from "@/lib/stream-relay";
const failure=(message:string,status:number)=>Response.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
 try{
  const params=new URL(request.url).searchParams;const root=params.get("source");const target=root||params.get("u");if(!target)return failure("缺少源地址",400);publicUrl(target);
  const key=await relayKey();let expires=Math.floor(Date.now()/1000)+TICKET_LIFETIME;let kind:RelayKind="playlist";
  if(root){if(!await catalogSource(root))return failure("此源不在当前频道目录中",403);}
  else{expires=Number(params.get("e"));const type=params.get("k")||"";if(!await verifyTicket(target,expires,type,params.get("s")||"",key))return failure("播放地址已过期，请重新连接",403);kind=type as RelayKind;}
  const {response,url}=await fetchRedirects(target,request,checkPublicHost);
  if(!response.ok){await response.body?.cancel();return failure(`上游返回 HTTP ${response.status}`,response.status>=400?response.status:502);}
  if(kind==="playlist"||/mpegurl/i.test(response.headers.get("Content-Type")||"")){
   const text=await readPlaylist(response);const rewritten=await rewritePlaylist(text,url,expires,key);
   return new Response(rewritten,{headers:{"Content-Type":"application/vnd.apple.mpegurl","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
  return new Response(response.body,{status:response.status,headers:assetHeaders(response.headers)});
 }catch(error){return failure(error instanceof RelayConnectionError?error.message:"转发连接失败、超时或源格式不受支持",502);}
}
