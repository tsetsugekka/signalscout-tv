"use client";
import {useState} from "react";
import {RadioGroup,RadioGroupItem} from "@/components/ui/radio-group";
import {Progress} from "@/components/ui/progress";
import {CheckCircle2,LoaderCircle,RefreshCw,Clock3,XCircle} from "lucide-react";
import type {Channel} from "@/lib/catalog";
import {sourceVisible,type SourceCheck} from "@/lib/source-checks";
const labels={waiting:"等待检测",pinging:"检测连通性",checking:"验证直播",available:"直播可播",failed:"检测未通过",blocked:"待点击验证",unsupported:"网页直连受限"};
const PAGE_SIZE=20;
export function SourceList({channel,checks,hideFailed,activeSource,onSelect,onRecheck}:{channel:Channel;checks:Record<string,SourceCheck>;hideFailed:boolean;activeSource?:string;onSelect:(id:string)=>void;onRecheck:()=>void}){
 const [copied,setCopied]=useState("");const [copyError,setCopyError]=useState("");const [page,setPage]=useState(0);
 const copy=async(id:string,url:string)=>{try{await navigator.clipboard.writeText(url);setCopied(id);setCopyError("");}catch{setCopyError("复制失败，请选中地址手动复制。");}};
 const visible=channel.sources.map((source,index)=>({source,index})).filter(({source})=>sourceVisible(checks[source.id],hideFailed));
 const hidden=channel.sources.length-visible.length;const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));const currentPage=Math.min(page,pages-1);
 const activeIndex=visible.findIndex(({source})=>source.id===activeSource);const activePage=activeIndex<0?-1:Math.floor(activeIndex/PAGE_SIZE);
 const complete=channel.sources.filter(s=>checks[s.id]&&!["waiting","pinging","checking"].includes(checks[s.id].status)).length;
 return <section className="source-panel" aria-label="播放线路"><div className="source-heading"><h2>播放线路 <span>{channel.sources.length}</span></h2><button className="quiet-button" onClick={onRecheck}><RefreshCw/>重新检测</button></div><div className="source-progress"><Progress value={channel.sources.length?complete/channel.sources.length*100:0} aria-label="线路检测进度"/><span>已检测 {complete} / {channel.sources.length}</span></div><RadioGroup value={activeSource||""} onValueChange={onSelect} aria-label="选择播放线路" className="source-list">{visible.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map(({source:s,index:i})=>{
 const check=checks[s.id]||{status:"waiting" as const};const busy=check.status==="pinging"||check.status==="checking";
 return <div key={s.id} className={`source-row source-${check.status} ${activeSource===s.id?"source-active":""}`}><div className="source-choice"><RadioGroupItem value={s.id} id={`source-${i}`} disabled={check.status==="unsupported"}/><label htmlFor={`source-${i}`}><strong>线路 {i+1}{activeSource===s.id&&<small>当前</small>}<span className="source-mode">{s.url.startsWith("http:")?"HTTPS 转发":"直连"}</span></strong></label><span className="source-result">{busy?<LoaderCircle className="spin"/>:check.status==="available"?<CheckCircle2/>:["failed","unsupported"].includes(check.status)?<XCircle/>:<Clock3/>}{labels[check.status]}</span></div><div className="source-address"><code>{s.url}</code><div className="source-url-actions"><button onClick={()=>void copy(s.id,s.url)}>{copied===s.id?"已复制":"复制地址"}</button><a href={s.url} target="_blank" rel="noreferrer">打开原始地址 ↗</a>{check.connectMs!==undefined&&<span>{Math.round(check.connectMs)} ms</span>}</div></div>{check.reason&&<p className="source-meta">{check.reason}</p>}</div>;
 })}</RadioGroup>{pages>1&&<nav className="source-pagination" aria-label="播放线路分页"><button className="quiet-button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>上一页</button><span aria-live="polite">{currentPage+1} / {pages}</span><button className="quiet-button" disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}>下一页</button>{activePage>=0&&activePage!==currentPage&&<button className="source-locate" onClick={()=>setPage(activePage)}>定位当前线路</button>}</nav>}{hidden>0&&<p className="source-help">已隐藏 {hidden} 条失败线路；关闭“不显示失效源”可查看。</p>}{copyError&&<p role="status" className="source-help">{copyError}</p>}<p className="source-help source-explainer" title="先测 HTTP 连通性，再验证直播；跨域限制不代表源离线。切换频道取消旧检测，离线或后台时暂停。">自动检测本频道全部线路，翻页不影响检测。</p></section>;
}
