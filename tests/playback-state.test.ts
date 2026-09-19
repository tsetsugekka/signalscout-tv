import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildHostHealth,evaluateSource,evaluateChannel,evidenceLabel,rankSourceStates,sourceStateVisible,channelInPlaybackView,channelPlaybackPriority,RECENT_SUCCESS,sourceHost,type EvaluationContext} from '../lib/playback-state';
import {defaults,readSourceFilter,recordSuccess,recordFailure,localSourceCheck,pruneLocalSources} from '../lib/local-state';
import {orderedSources} from '../lib/player';
import {channelHasSharedSuccess,deviceSourceVisible} from '../lib/shared-health';
import {ChannelSignal} from '../components/channel-signal';
import {SourceList} from '../components/source-list';
import type {Channel,Source} from '../lib/catalog';

const now=10*RECENT_SUCCESS;
const source=(url:string,number?:number):Source=>({id:url,url,number});
const channel=(sources:Source[]):Channel=>({id:'test',name:'test',title:'',group:'其他',sources});
function context(overrides:Partial<EvaluationContext>={}):EvaluationContext{return {device:'pc',local:{},devices:{},checks:{},hosts:new Map(),now,...overrides};}
function withHosts(sources:Source[],ctx:EvaluationContext){return {...ctx,hosts:buildHostHealth(new Map(sources.map(s=>[s.id,s])),ctx.local,ctx.devices,ctx.device,ctx.checks,ctx.now)};}
const success=(at=now-1)=>({okAt:at,verifiedLive:true,failures:0,until:0});

test('the 24-hour boundary downgrades labels and priority without expiring local or shared success',()=>{
 const old=source('https://old.example/live'),fresh=source('https://fresh.example/live');
 const ctx=context({local:{[old.id]:success(now-RECENT_SUCCESS)},devices:{[fresh.id]:{pc:{okAt:now-RECENT_SUCCESS+1,failedAt:0}}}});
 assert.equal(evidenceLabel(evaluateSource(old,ctx).current),'本机可播');
 assert.equal(evidenceLabel(evaluateSource(fresh,ctx).current),'他人近期可播');
 const states=new Map([old,fresh].map(s=>[s.id,evaluateSource(s,ctx)]));
 assert.deepEqual(rankSourceStates([old,fresh],states).map(s=>s.id),[fresh.id,old.id]);
 assert.equal(evaluateChannel(channel([fresh]),{...ctx,now:now+1}).label,'他人可播');
 assert.equal(channelHasSharedSuccess(channel([fresh]),ctx.devices),true);
 assert.equal(localSourceCheck({status:'waiting'},ctx.local[old.id])?.okAt,now-RECENT_SUCCESS);
});

test('host inference groups subdomains by registrable domain, while retaining public suffix and IP boundaries',()=>{
 assert.equal(sourceHost('http://TV.Example:80/a'),'tv.example');
 assert.equal(sourceHost('https://tv.example:9000/b'),'tv.example');
 assert.equal(sourceHost('http://42.94.210.135:7788/a'),sourceHost('https://42.94.210.135:9999/b'));
 assert.equal(sourceHost('http://[2001:db8::1]:80/a'),sourceHost('https://[2001:db8::1]:9000/b'));
 assert.notEqual(sourceHost('https://a.example/x'),sourceHost('https://b.example/x'));
 assert.equal(sourceHost('https://23.xxx.com/a'),'xxx.com');
 assert.equal(sourceHost('https://TV.xxx.com.:9000/b'),'xxx.com');
 assert.equal(sourceHost('http://a.tv.example.co.jp/live'),'example.co.jp');
 assert.notEqual(sourceHost('https://a.example.com.cn/a'),sourceHost('https://a.other.com.cn/b'));
 assert.notEqual(sourceHost('https://one.github.io/a'),sourceHost('https://two.github.io/b'));
 assert.equal(sourceHost('https://a.one.github.io/a'),'one.github.io');
 assert.notEqual(sourceHost('https://[2001:db8::1]/a'),sourceHost('https://[2001:db8::2]/b'));
 const good=source('http://42.94.210.135:7788/live'),hint=source('https://42.94.210.135:8888/other'),unknown=source('https://42.94.210.136/other');
 const ctx=withHosts([good,hint,unknown],context({local:{[good.id]:success()}}));
 assert.equal(evaluateSource(hint,ctx).current.status,'possible');
 assert.equal(evaluateSource(unknown,ctx).current.status,'unknown');
 assert.equal(channelHasSharedSuccess(channel([hint]),ctx.devices),false);
 assert.equal(localSourceCheck(undefined,ctx.local[hint.id]),undefined);
});

test('subdomain hints enter both playable views without crossing domains or fabricating success',()=>{
 const good=source('https://23.example.com/a'),hint=source('http://tv.example.com:8000/b'),other=source('https://tv.other.com/a');
 const ctx=withHosts([good,hint,other],context({local:{[good.id]:success()}}));
 assert.equal(evaluateSource(hint,ctx).current.status,'possible');assert.equal(evaluateSource(other,ctx).current.status,'unknown');
 for(const view of ['local','shared'] as const)assert.equal(channelInPlaybackView(channel([hint]),ctx,view),true);
 assert.equal(ctx.local[hint.id],undefined);assert.equal(ctx.devices[hint.id],undefined);
});

test('three display modes preserve legacy hiding and promote applicable success tiers ahead of existing order',()=>{
 assert.equal(defaults().sourceFilter,'all');assert.equal(readSourceFilter({hideFailed:true}),'hide-failed');assert.equal(readSourceFilter({hideFailed:false}),'all');assert.equal(readSourceFilter({sourceFilter:'priority',hideFailed:true}),'priority');
 const names=['unknown','possible','older','reference','recent','failed'];
 const sources=names.map(name=>source(`https://${name}.example/live`));
 const [unknown,hint,old,reference,fresh,bad]=sources;
 const ctx=context({local:{[fresh.id]:success(),[old.id]:success(now-RECENT_SUCCESS),[bad.id]:{...success(),failedAt:now}},devices:{[reference.id]:{mobile:{okAt:now,failedAt:0}}},hosts:new Map([[sourceHost(hint.url)!,{pc:now}]])});
 const channels=sources.map((s,i)=>({...channel([s]),id:names[i]}));
 const ranked=[...channels].sort((a,b)=>channelPlaybackPriority(a,ctx)-channelPlaybackPriority(b,ctx));
 assert.deepEqual(ranked.map(c=>c.id),['reference','recent','older','possible','unknown','failed']);
 assert.deepEqual(channels.map(c=>c.id),names);
 assert.equal(sourceStateVisible(evaluateSource(unknown,ctx),'pc',true),true);assert.equal(sourceStateVisible(evaluateSource(bad,ctx),'pc',true),false);
 assert.equal(sourceStateVisible(evaluateSource(bad,ctx),'pc',false),true);
});

test('host hints never overwrite actual failure, unsupported formats, or another-device proof',()=>{
 const good=source('https://example.com/good'),bad=source('https://example.com/bad'),unsupported=source('https://example.com/vod.mp4'),pcOnly=source('https://example.com/pc');
 const ctx=withHosts([good,bad,unsupported,pcOnly],context({device:'mobile',local:{[good.id]:success(),[bad.id]:{...success(),failedAt:now}},devices:{[pcOnly.id]:{pc:{okAt:now,failedAt:0}}}}));
 assert.equal(evaluateSource(bad,ctx).current.status,'unstable');
 assert.equal(evaluateSource(unsupported,ctx).display.status,'unsupported');
 assert.equal(evaluateSource(pcOnly,ctx).current.status,'recent');
 assert.equal(evaluateSource(pcOnly,ctx).devices.mobile.status,'possible');
 assert.equal(evaluateSource(pcOnly,ctx).reference,'pc');
 assert.deepEqual(evaluateChannel(channel([pcOnly]),ctx),{signal:'recent',label:'PC近期可播 · 手机待验证'});
});

test('host hints disappear when their last real evidence fails or is removed from the catalog',()=>{
 const good=source('https://example.com/a'),hint=source('https://example.com/b');const state=defaults();recordSuccess(state,good.id,now);
 let ctx=withHosts([good,hint],context({local:state.health}));assert.equal(evaluateSource(hint,ctx).current.status,'possible');
 recordFailure(state,good.id,now+1);ctx=withHosts([good,hint],context({local:state.health}));assert.equal(ctx.hosts.size,0);assert.equal(evaluateSource(hint,ctx).current.status,'unknown');
 recordSuccess(state,good.id,now+2);pruneLocalSources(state,{channels:[channel([hint])],syncedAt:now,version:'v'});
 ctx=withHosts([hint],context({local:state.health,devices:{[good.id]:{pc:{okAt:now,failedAt:0}}}}));
 assert.equal(ctx.hosts.size,0);assert.equal(evaluateSource(hint,ctx).current.status,'unknown');
});

test('both playable views include possible channels without recording inferred verification',()=>{
 const good=source('https://example.com/a'),hint=source('http://example.com:8000/b'),unknown=source('https://unknown.example/a');
 const ctx=withHosts([good,hint,unknown],context({devices:{[good.id]:{pc:{okAt:now,failedAt:0}}}}));
 for(const view of ['local','shared'] as const){assert.equal(channelInPlaybackView(channel([hint]),ctx,view),true);assert.equal(channelInPlaybackView(channel([unknown]),ctx,view),false);}
 assert.equal(evaluateChannel(channel([hint]),ctx).signal,'possible');assert.deepEqual(ctx.local,{});assert.equal(ctx.devices[hint.id],undefined);
 ctx.local[hint.id]={...success(),failedAt:now};for(const view of ['local','shared'] as const)assert.equal(channelInPlaybackView(channel([hint]),ctx,view),false);
});

test('local failure wins over same-device shared success, while opposite-device success still promotes display',()=>{
 const s=source('https://example.com/live');const ctx=context({device:'mobile',local:{[s.id]:{...success(),failedAt:now}},devices:{[s.id]:{pc:{okAt:now,failedAt:0},mobile:{okAt:now,failedAt:0}}}});
 const result=evaluateSource(s,ctx);assert.equal(result.current.status,'unstable');assert.equal(result.display.status,'recent');
 assert.equal(evaluateChannel(channel([s]),ctx).signal,'unavailable');
 assert.equal(deviceSourceVisible(localSourceCheck(undefined,ctx.local[s.id]),ctx.devices[s.id],'mobile',true,now),false);
 assert.equal(evaluateSource(s,{...ctx,device:'pc',local:{}}).current.status,'recent');
});

test('a local success overrides the same device shared failure and mobile failure never paints PC orange',()=>{
 const s=source('https://example.com/live');const ctx=context({local:{[s.id]:success()},devices:{[s.id]:{pc:{okAt:0,failedAt:now},mobile:{okAt:0,failedAt:now}}}});
 assert.equal(evaluateChannel(channel([s]),ctx).signal,'recent');
 assert.equal(evaluateChannel(channel([s]),context({devices:{[s.id]:{mobile:{okAt:0,failedAt:now}}}})).signal,'pending');
});

test('rechecking does not erase persistent local instability for hide-failed; a real success restores visibility',()=>{
 const s=source('https://example.com/live');const ctx=context({device:'mobile',local:{[s.id]:{...success(),failedAt:now}},checks:{[s.id]:{status:'checking'}},devices:{[s.id]:{mobile:{okAt:now,failedAt:0}}}});
 assert.equal(sourceStateVisible(evaluateSource(s,ctx),'mobile',true),false);
 assert.equal(sourceStateVisible(evaluateSource(s,ctx),'pc',true),true);
 assert.equal(sourceStateVisible(evaluateSource(s,ctx),'mobile',false),true);
 ctx.checks[s.id]={status:'available',okAt:now+1};assert.equal(sourceStateVisible(evaluateSource(s,ctx),'mobile',true),true);
 ctx.devices[s.id].pc={okAt:0,failedAt:now};assert.equal(sourceStateVisible(evaluateSource(s,ctx),'mobile',true),false);
});

test('channel signals distinguish unresolved candidates from all failed and from unsupported-only',()=>{
 const bad=source('https://bad.example/a'),unknown=source('https://new.example/b'),good=source('https://good.example/c'),unsupported=source('https://old.example/file.mp4');
 const ctx=context({local:{[bad.id]:{...success(),failedAt:now},[good.id]:success()}});
 assert.equal(evaluateChannel(channel([bad,unknown,unsupported]),ctx).signal,'pending');
 assert.deepEqual(evaluateChannel(channel([bad,unsupported]),ctx),{signal:'unavailable',label:'不稳定'});
 assert.equal(evaluateChannel(channel([unsupported]),ctx).signal,'restricted');
 assert.equal(evaluateChannel(channel([bad,good]),ctx).signal,'recent');
});

test('background checks cannot replace successful channel signal; foreground connection and offline can',()=>{
 const good=source('https://good.example/a'),probe=source('https://probe.example/b');const ctx=context({local:{[good.id]:success()},checks:{[probe.id]:{status:'checking'}}});const c=channel([good,probe]);
 assert.equal(evaluateChannel(c,ctx,{status:'playing',streamType:'live',source:good.id}).signal,'recent');
 assert.equal(evaluateChannel(c,ctx,{status:'paused',streamType:'live',source:good.id}).signal,'recent');
 assert.equal(evaluateChannel(c,ctx,{status:'connecting'}).signal,'checking');
 assert.equal(evaluateChannel(c,ctx,{status:'offline'}).signal,'offline');
});

test('display tiers preserve stable source numbers through age, unknown, instability and unsupported sorting',()=>{
 const urls=['https://x.example/old','https://x.example/unknown','https://z.example/failed','https://q.example/new','https://z.example/movie.mp4','https://h.example/untested'];
 const sources=urls.map((u,i)=>source(u,20-i));const ctx=context({local:{[urls[0]]:success(now-RECENT_SUCCESS),[urls[2]]:{...success(),failedAt:now},[urls[3]]:success()},hosts:new Map([['x.example',{pc:now}]])});
 const states=new Map(sources.map(s=>[s.id,evaluateSource(s,ctx)]));const ordered=rankSourceStates(sources,states);
 assert.deepEqual(ordered.map(s=>s.number),[17,20,19,15,18,16]);
 assert.deepEqual(sources.map(s=>s.number),[20,19,18,17,16,15]);
});

test('automatic selection keeps a good last-watched preference, defers persistent failure, then uses freshness and host hints',()=>{
 const old=source('https://old.example/live'),fresh=source('https://fresh.example/live'),possible=source('https://hint.example/live'),unknown=source('https://unknown.example/live');const c=channel([unknown,possible,old,fresh]);const state=defaults(),time=Date.now();
 recordSuccess(state,old.id,time-2*RECENT_SUCCESS);const shared={[fresh.id]:{okAt:time-1,failedAt:0}};const hosts=new Map([['hint.example',{pc:time}]]);
 assert.equal(orderedSources(c,state,new Set(),shared,hosts,'pc')[0].id,fresh.id);
 state.lastPlayedSources[c.id]=old.id;assert.equal(orderedSources(c,state,new Set(),shared,hosts,'pc')[0].id,old.id);
 recordFailure(state,old.id,time);state.health[old.id].until=0;
 assert.deepEqual(orderedSources(c,state,new Set(),shared,hosts,'pc').map(s=>s.id),[fresh.id,possible.id,unknown.id,old.id]);
});

test('rendered cards retain device conflicts, original numbers and host hint labels; signal markup exposes accessible state',()=>{
 const good=source('https://example.com/live',15),hint=source('https://example.com:9000/other',28);const ctx=withHosts([good,hint],context({device:'mobile',local:{[good.id]:{...success(),failedAt:now}},devices:{[good.id]:{pc:{okAt:now,failedAt:0},mobile:{okAt:now,failedAt:0}}}}));
 const html=renderToStaticMarkup(createElement(SourceList,{channel:channel([good,hint]),evaluation:ctx,checks:{[good.id]:{status:'failed',connectMs:123}},hideFailed:false,onSelect:()=>{},onRecheck:()=>{}}));
 assert.match(html,/线路 15/);assert.match(html,/线路 28/);assert.match(html,/PC：他人近期可播/);assert.match(html,/手机：本机不稳定/);assert.match(html,/device-recent[^>]*> · 他人近期可播/);assert.match(html,/可能可播/);assert.match(html,/aria-label="连接耗时 123 毫秒"/);assert.match(html,/123 ms/);assert.match(html,/source-endpoint[^>]*title="example.com"[^>]*>example.com/);assert.doesNotMatch(html.replace(/<[^>]*>/g,""),/https:\/\/example.com|example.com:9000|\/other/);assert.doesNotMatch(html,/复制地址|打开原始地址|<code|href=/);
 for(const signal of ['recent','available','possible','pending','checking','unavailable','restricted','offline'] as const){const icon=renderToStaticMarkup(createElement(ChannelSignal,{state:{signal,label:'测试'}}));assert.match(icon,new RegExp('signal-'+signal));assert.match(icon,/aria-label="测试"/);if(signal==='pending')assert.match(icon,/<circle/);if(['restricted','offline'].includes(signal))assert.match(icon,/M3 3l18 18/);if(signal==='unavailable')assert.doesNotMatch(icon,/M3 3l18 18/);}
});

test('an unknown device borrows the other device success tier for signals and ranking without overwriting facts',()=>{
 const s=source('https://example.com/live');
 for(const device of ['pc','mobile'] as const){const other=device==='pc'?'mobile':'pc';for(const age of [1,RECENT_SUCCESS]){
  const ctx=context({device,devices:{[s.id]:{[other]:{okAt:now-age,failedAt:0}}}});const expected=age===1?'recent':'available';
  const result=evaluateSource(s,ctx);assert.equal(result.current.status,expected);assert.equal(result.display.status,expected);assert.equal(result.devices[device].status,'possible');assert.equal(result.reference,other);assert.equal(evaluateChannel(channel([s]),ctx).signal,expected);
  ctx.devices[s.id][device]={okAt:0,failedAt:now};assert.equal(evaluateSource(s,ctx).current.status,'unstable');assert.equal(evaluateChannel(channel([s]),ctx).signal,'unavailable');
 }}
});

test('a mobile success retains the unknown PC possible hint without fabricating PC verification',()=>{
 const s=source('https://example.com/live');
 const before=withHosts([s],context({device:'mobile'}));before.hosts.set('example.com',{pc:now-100});
 assert.equal(evaluateSource(s,before).devices.pc.status,'possible');
 before.checks[s.id]={status:'available',okAt:now};
 const after=evaluateSource(s,before);
 assert.equal(after.devices.pc.status,'possible');assert.equal(after.devices.pc.okAt,undefined);assert.equal(after.devices.mobile.status,'recent');
 before.devices[s.id]={pc:{okAt:0,failedAt:now}};
 assert.equal(evaluateSource(s,before).devices.pc.status,'unstable');
});

test('locally failed lines rank same-platform shared success before cross-platform success and no support',()=>{
 for(const device of ['pc','mobile'] as const){
  const other=device==='pc'?'mobile':'pc';
  const good=source('https://good.example/live',2),sameOld=source('https://same-old.example/live',13),sameFresh=source('https://same-fresh.example/live',18),cross=source('https://cross.example/live',3),failed=source('https://failed.example/live',14),possible=source('https://hint.example/live',15),unsupported=source('https://bad.example/vod.mp4',19);
  const sources=[failed,cross,sameOld,possible,sameFresh,unsupported,good];
  const ctx=context({device,local:Object.fromEntries([sameOld,sameFresh,cross,failed].map(s=>[s.id,{...success(),failedAt:now}])),devices:{[sameOld.id]:{[device]:{okAt:now-2*RECENT_SUCCESS,failedAt:0}},[sameFresh.id]:{[device]:{okAt:now-1,failedAt:0}},[cross.id]:{[other]:{okAt:now,failedAt:0}},[good.id]:{[device]:{okAt:now-3*RECENT_SUCCESS,failedAt:0}}},hosts:new Map([['hint.example',{[device]:now}]])});
  const states=new Map(sources.map(s=>[s.id,evaluateSource(s,ctx)]));
  const expected=[2,18,13,3,15,14,19];
  for(let i=0;i<sources.length;i++)assert.deepEqual(rankSourceStates([...sources.slice(i),...sources.slice(0,i)],states).map(s=>s.number),expected);
  for(const s of [sameOld,sameFresh,cross]){assert.equal(states.get(s.id)!.current.status,'unstable');assert.equal(sourceStateVisible(states.get(s.id)!,device,true),false);}
  assert.equal(evaluateChannel(channel([sameOld]),ctx).signal,'unavailable');
  assert.equal(states.get(sameOld.id)!.display.status,'unstable');
  assert.equal(states.get(possible.id)!.communitySupport,undefined);
 }
});

test('hide-failed removes restricted sources even with successful reports, but keeps unknowns',()=>{
 for(const device of ['pc','mobile'] as const){
  const file=source('https://a.example/file.mp4',1),restricted=source('https://b.example/live',2),unknown=source('https://c.example/live',3);
  const ctx=context({device,checks:{[restricted.id]:{status:'unsupported'}},devices:{[restricted.id]:{pc:{okAt:now,failedAt:0},mobile:{okAt:now,failedAt:0}}}});
  for(const s of [file,restricted]){const state=evaluateSource(s,ctx);assert.equal(sourceStateVisible(state,device,true),false);assert.equal(sourceStateVisible(state,device,false),true);}
  assert.equal(sourceStateVisible(evaluateSource(unknown,ctx),device,true),true);
  const props={channel:channel([file,restricted,unknown]),evaluation:ctx,checks:ctx.checks,onSelect:()=>{},onRecheck:()=>{}};
  const hidden=renderToStaticMarkup(createElement(SourceList,{...props,hideFailed:true}));
  assert.doesNotMatch(hidden,/线路 [12]</);assert.match(hidden,/线路 3</);assert.match(hidden,/已隐藏 2 条失败、不稳定或网页直连受限线路/);
  const all=renderToStaticMarkup(createElement(SourceList,{...props,hideFailed:false}));assert.match(all,/线路 1</);assert.match(all,/线路 2</);
 }
});

test('line cards render catalog quality tags as compact plain labels',()=>{
 const s={...source('https://example.com/live',1),qualities:['1080p','VGA','720p']};
 const html=renderToStaticMarkup(createElement(SourceList,{channel:channel([s]),evaluation:context(),checks:{},hideFailed:false,onSelect:()=>{},onRecheck:()=>{}}));
 for(const q of s.qualities)assert.ok(html.includes(`class="source-quality" title="目录标注画质">${q}</span>`));
 assert.doesNotMatch(html,/\[1080p\]|\(720p\)/);assert.match(html,/线路 1/);
});

test('source cards retain BD quality and US country labels after cleaning channel names',async()=>{
 const {parseTxt}=await import('../lib/catalog');
 for(const [name,label,title] of [['[BD]bloomberg tv','BD','目录标注画质'],['「US」 Bloomberg TV+2','US','目录标注地区'],['[BD]经济科教','BD','目录标注画质']]){
  const c=parseTxt(`${name},https://example.com/live`)[0];
  const html=renderToStaticMarkup(createElement(SourceList,{channel:c,evaluation:context(),checks:{},hideFailed:false,onSelect:()=>{},onRecheck:()=>{}}));
  assert.ok(html.includes(`title="${title}">${label}</span>`));if(label!=="US")assert.doesNotMatch(c.name,/^[\[「]/);
 }
});
