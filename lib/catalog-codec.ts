// Expanded TXT lists can exceed D1's per-value limit. Store compressed text;
// this is catalog metadata only, never media data.
export async function encodeCatalog(value:unknown,maxEncodedLength=1_500_000){
 const compressed=await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
 const bytes=new Uint8Array(compressed);let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 const encoded=btoa(binary);if(encoded.length>maxEncodedLength)throw new Error("Catalog exceeds cache capacity");return encoded;
}
export async function decodeCatalog<T>(encoded:string):Promise<T>{
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();return JSON.parse(text) as T;
}

export function splitCachedPayload(key:string,encoded:string,revision:string){
 const size=1_000_000,parts:{key:string;payload:string}[]=[];
 if(encoded.length<=size)return {payload:encoded,parts};
 for(let i=0;i<encoded.length;i+=size)parts.push({key:`${key}:chunk:${revision}:${i}`,payload:encoded.slice(i,i+size)});
 return {payload:JSON.stringify({chunks:parts.map(p=>p.key)}),parts};
}
