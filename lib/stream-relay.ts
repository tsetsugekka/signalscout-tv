const encoder=new TextEncoder();
export const TICKET_LIFETIME=24*3600;
export type RelayKind="playlist"|"asset";
export function publicUrl(input:string):URL{
 const u=new URL(input);const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password||!h||h==="localhost"||/\.(localhost|local|internal|invalid|test)$/.test(h))throw new Error("Non-public target");
 if(h.includes(":")){if(!/^[23][0-9a-f]{0,3}:/.test(h)||h.startsWith("2001:db8:")||h.startsWith("2002:"))throw new Error("Non-public address");}
 else if(/^\d+\.\d+\.\d+\.\d+$/.test(h)){const [a,b,c]=h.split('.').map(Number);if(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113))throw new Error("Non-public address");}
 else if(!h.includes('.'))throw new Error("Non-public hostname");
 u.hash="";return u;
}
export async function signingKey(secret:string){return crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
const message=(url:string,expires:number,kind:RelayKind)=>encoder.encode(`${expires}\n${kind}\n${url}`);
export async function signedPath(url:string,expires:number,kind:RelayKind,key:CryptoKey){
 const target=publicUrl(url).href;const signature=await crypto.subtle.sign("HMAC",key,message(target,expires,kind));const hex=[...new Uint8Array(signature)].map(b=>b.toString(16).padStart(2,"0")).join("");
 return `/api/stream?u=${encodeURIComponent(target)}&e=${expires}&k=${kind}&s=${hex}`;
}
export async function verifyTicket(url:string,expires:number,kind:string,signature:string,key:CryptoKey,now=Math.floor(Date.now()/1000)){
 if(!Number.isSafeInteger(expires)||expires<now||expires>now+TICKET_LIFETIME||!["playlist","asset"].includes(kind)||!/^[a-f0-9]{64}$/.test(signature))return false;
 const bytes=Uint8Array.from(signature.match(/../g)!,v=>parseInt(v,16));
 return crypto.subtle.verify("HMAC",key,bytes,message(url,expires,kind as RelayKind));
}
export async function rewritePlaylist(text:string,base:string,expires:number,key:CryptoKey){
 if(!text.trimStart().startsWith("#EXTM3U"))throw new Error("Not an HLS playlist");
 const lines=text.split(/\r?\n/);const master=lines.some(l=>l.startsWith("#EXT-X-STREAM-INF:"));
 return (await Promise.all(lines.map(async line=>{
  const trimmed=line.trim();if(!trimmed)return line;
  if(!trimmed.startsWith("#"))return signedPath(new URL(trimmed,base).href,expires,master?"playlist":"asset",key);
  const matches=[...line.matchAll(/\bURI="([^"]+)"/g)];let next=line;
  const kind:RelayKind=/^#EXT-X-(MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/.test(line)?"playlist":"asset";
  for(const match of matches)next=next.replace(match[0],`URI="${await signedPath(new URL(match[1],base).href,expires,kind,key)}"`);
  return next;
 }))).join('\n');
}
export async function readPlaylist(response:Response,maxBytes=2_000_000){
 if(!response.body)throw new Error("Empty playlist");const reader=response.body.getReader(),decoder=new TextDecoder();let text="",size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error("Playlist too large");text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
}
// Workers fetch requires a hostname. This DNS-only alias resolves to the same public IPv4.
export function networkTarget(target:URL){
 const url=new URL(target);let expectedAddress:string|undefined;
 if(url.protocol==="http:"&&/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)){expectedAddress=url.hostname;url.hostname=expectedAddress.replaceAll('.', '-')+".sslip.io";}
 return {url,expectedAddress};
}
export function validateAddresses(addresses:string[],expectedAddress?:string){
 if(!addresses.length)throw new Error("DNS has no address");
 for(const address of addresses){publicUrl(`http://${address.includes(':')?'['+address+']':address}/`);if(expectedAddress&&address!==expectedAddress)throw new Error("DNS address mismatch");}
}
export class RelayConnectionError extends Error {}
export async function fetchRedirects(url:string,request:Request,checkHost:(u:URL,expectedAddress?:string)=>Promise<void>,fetcher:typeof fetch=fetch,forwardRange=true){
 let target=publicUrl(url);const deadline=AbortSignal.timeout(35000);const headers=new Headers({Accept:"*/*"});const range=request.headers.get("Range");if(range&&forwardRange){if(!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))throw new Error("Invalid byte range");headers.set("Range",range);}
 for(let hop=0;hop<=5;hop++){
  const network=networkTarget(target);
  try{await checkHost(network.url,network.expectedAddress);}catch{throw new RelayConnectionError(`转发域名解析失败（${target.hostname}）`);}
  let response:Response;try{response=await fetcher(network.url.href,{method:"GET",headers,redirect:"manual",signal:AbortSignal.any([request.signal,deadline,AbortSignal.timeout(20000)]),cache:"no-store"});}
  catch{throw new RelayConnectionError(`转发连接失败或超时（第 ${hop+1} 跳：${target.hostname}）`);}
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get("Location");await response.body?.cancel();if(!location)throw new Error("Redirect missing location");target=publicUrl(new URL(location,target).href);continue;}
  return {response,url:target.href};
 }
 throw new Error("Too many redirects");
}
export function assetHeaders(upstream:Headers,url=''){
 const headers=new Headers({"Cache-Control":"no-store","Content-Type":"application/octet-stream","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"});
 const type=(upstream.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
 const mediaTypes=new Set(['video/mp2t','video/mp4','audio/mp4','audio/aac','audio/aacp','audio/mpeg','audio/ac3','audio/eac3','text/vtt']);
 const extension=url?new URL(url).pathname.split('.').pop()?.toLowerCase():'';
 const byExtension:Record<string,string>={ts:'video/mp2t',m4s:'video/mp4',mp4:'video/mp4',aac:'audio/aac',mp3:'audio/mpeg',vtt:'text/vtt'};
 if(mediaTypes.has(type))headers.set('Content-Type',type);else if(extension&&byExtension[extension])headers.set('Content-Type',byExtension[extension]);
 for(const name of ["Content-Range","Accept-Ranges","Content-Encoding"])if(upstream.has(name))headers.set(name,upstream.get(name)!);
 return headers;
}
