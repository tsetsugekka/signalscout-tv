"use client";
import {useState} from "react";
import {RadioGroup,RadioGroupItem} from "@/components/ui/radio-group";
import {Progress} from "@/components/ui/progress";
import {CheckCircle2,LoaderCircle,RefreshCw,Clock3,XCircle} from "lucide-react";
import type {Channel} from "@/lib/catalog";
import {type SourceCheck} from "@/lib/source-checks";
import {deviceLabel} from "@/lib/device-class";
import {evaluateSource,evidenceLabel,isSuccess,rankSourceStates,sharedEvidence,sourceStateVisible,type EvaluationContext} from '@/lib/playback-state';
const labels={waiting:"等待检测",pinging:"检测连通性",checking:"验证直播",available:"直播可播",failed:"不稳定",blocked:"待点击验证",unsupported:"网页直连受限",unconfirmed:"直播待确认"};
const PAGE_SIZE=20;
export function SourceList({evaluation,channel,checks,hideFailed,activeSource,onSelect,onRecheck}:{evaluation:EvaluationContext;channel:Channel;checks:Record<string,SourceCheck>;hideFailed:boolean;activeSource?:string;onSelect:(id:string)=>void;onRecheck:()=>void}){
 const [page,setPage]=useState(0);
 const {device,devices:deviceHealth}=evaluation;
 const states=new Map(channel.sources.map(s=>[s.id,evaluateSource(s,evaluation)]));
 const numbers=new Map(channel.sources.map((s,i)=>[s.id,s.number||i+1]));
 const visible=rankSourceStates(channel.sources,states).map(source=>({source,index:numbers.get(source.id)!-1})).filter(({source})=>sourceStateVisible(states.get(source.id)!,device,hideFailed));
 const hidden=channel.sources.length-visible.length;const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));const currentPage=Math.min(page,pages-1);
 const activeIndex=visible.findIndex(({source})=>source.id===activeSource);const activePage=activeIndex<0?-1:Math.floor(activeIndex/PAGE_SIZE);
 const complete=channel.sources.filter(s=>checks[s.id]&&!["waiting","pinging","checking"].includes(checks[s.id].status)).length;
 return <section className="source-panel" aria-label="播放线路"><div className="source-heading"><h2>播放线路 <span>{channel.sources.length}</span></h2><button className="quiet-button" onClick={onRecheck}><RefreshCw/>重新检测</button></div><div className="source-progress"><Progress value={channel.sources.length?complete/channel.sources.length*100:0} aria-label="线路检测进度"/><span>已检测 {complete} / {channel.sources.length}</span></div><RadioGroup value={activeSource||""} onValueChange={onSelect} aria-label="选择播放线路" className="source-list">{visible.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map(({source:s,index:i})=>{
 const check=checks[s.id]||{status:"waiting" as const};const busy=check.status==="pinging"||check.status==="checking";const result=states.get(s.id)!;
 const transient=["pinging","checking","blocked","unconfirmed"].includes(check.status);const displayStatus=transient?check.status:result.display.status;
 const label=transient?labels[check.status]:evidenceLabel(result.display);
 let host="";try{host=new URL(s.url).hostname;}catch{}
 const hint=result.current.status==='possible'?`同主域名或 IP 有${deviceLabel(result.current.hintDevice!)}成功记录，本线路仍待验证`:undefined;
 return <div key={s.id} className={`source-row source-${displayStatus} ${activeSource===s.id?"source-active":""}`}><div className="source-choice"><RadioGroupItem value={s.id} id={`source-${i}`} disabled={check.status==="unsupported"}/><label htmlFor={`source-${i}`}><strong>线路 {i+1}{s.qualities?.map(quality=><span className="source-quality" key={quality} title="目录标注画质">{quality}</span>)}{activeSource===s.id&&<small>当前</small>}{check.connectMs!==undefined&&<span className="source-mode source-latency" title={`${s.url.startsWith("http:")?"HTTPS 转发":"直连"} · 连接耗时`} aria-label={`连接耗时 ${Math.round(check.connectMs)} 毫秒`}>{Math.round(check.connectMs)} ms</span>}</strong></label><span className="source-result" title={hint}>{busy?<LoaderCircle className="spin"/>:isSuccess(result.display)?<CheckCircle2/>:["unstable","unsupported"].includes(displayStatus)?<XCircle/>:<Clock3/>}{label}</span></div><div className="source-device-status">{host&&<span className="source-endpoint" title={host}>{host}</span>}{(["pc","mobile"] as const).map(kind=>{const evidence=result.devices[kind],community=sharedEvidence(deviceHealth[s.id]?.[kind],evaluation.now);const conflict=evidence.origin==='local'&&community.status!=='unknown'&&isSuccess(evidence)!==isSuccess(community);return <span key={kind} className={`device-${evidence.status}`}>{deviceLabel(kind)}：{evidenceLabel(evidence)}{conflict&&<small className={`device-${community.status}`}> · {evidenceLabel(community)}</small>}</span>;})}</div>{check.reason&&<p className="source-meta">{check.reason}</p>}</div>;
 })}</RadioGroup>{pages>1&&<nav className="source-pagination" aria-label="播放线路分页"><button className="quiet-button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>上一页</button><span aria-live="polite">{currentPage+1} / {pages}</span><button className="quiet-button" disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}>下一页</button>{activePage>=0&&activePage!==currentPage&&<button className="source-locate" onClick={()=>setPage(activePage)}>定位当前线路</button>}</nav>}{hidden>0&&<p className="source-help">已隐藏 {hidden} 条失败、不稳定或网页直连受限线路；切换到“全部”可查看。</p>}<p className="source-help source-explainer" title="跨域检查失败不代表源离线。离线或后台时暂停检测。">选择线路后在当前设备验证播放。</p></section>;
}
