import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildHostHealth,evaluateSource,evaluateChannel,evidenceLabel,rankSourceStates,sourceStateVisible,RECENT_SUCCESS,sourceHost,type EvaluationContext} from '../lib/playback-state';
import {defaults,recordSuccess,recordFailure,localSourceCheck,pruneLocalSources} from '../lib/local-state';
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

test('host inference ignores ports and schemes, supports IP literals, and never groups different hostnames',()=>{
 assert.equal(sourceHost('http://TV.Example:80/a'),'tv.example');
 assert.equal(sourceHost('https://tv.example:9000/b'),'tv.example');
 assert.equal(sourceHost('http://42.94.210.135:7788/a'),sourceHost('https://42.94.210.135:9999/b'));
 assert.equal(sourceHost('http://[2001:db8::1]:80/a'),sourceHost('https://[2001:db8::1]:9000/b'));
 assert.notEqual(sourceHost('https://a.example/x'),sourceHost('https://b.example/x'));
 const good=source('http://42.94.210.135:7788/live'),hint=source('https://42.94.210.135:8888/other'),unknown=source('https://42.94.210.136/other');
 const ctx=withHosts([good,hint,unknown],context({local:{[good.id]:success()}}));
 assert.equal(evaluateSource(hint,ctx).current.status,'possible');
 assert.equal(evaluateSource(unknown,ctx).current.status,'unknown');
 assert.equal(channelHasSharedSuccess(channel([hint]),ctx.devices),false);
 assert.equal(localSourceCheck(undefined,ctx.local[hint.id]),undefined);
});

test('host hints never overwrite actual failure, unsupported formats, or another-device proof',()=>{
 const good=source('https://example.com/good'),bad=source('https://example.com/bad'),unsupported=source('https://example.com/vod.mp4'),pcOnly=source('https://example.com/pc');
 const ctx=withHosts([good,bad,unsupported,pcOnly],context({device:'mobile',local:{[good.id]:success(),[bad.id]:{...success(),failedAt:now}},devices:{[pcOnly.id]:{pc:{okAt:now,failedAt:0}}}}));
 assert.equal(evaluateSource(bad,ctx).current.status,'unstable');
 assert.equal(evaluateSource(unsupported,ctx).display.status,'unsupported');
 assert.equal(evaluateSource(pcOnly,ctx).current.status,'unknown');
 assert.equal(evaluateSource(pcOnly,ctx).reference,'pc');
 assert.deepEqual(evaluateChannel(channel([pcOnly]),ctx),{signal:'pending',label:'PC近期可播 · 手机待验证'});
});

test('host hints disappear when their last real evidence fails or is removed from the catalog',()=>{
 const good=source('https://example.com/a'),hint=source('https://example.com/b');const state=defaults();recordSuccess(state,good.id,now);
 let ctx=withHosts([good,hint],context({local:state.health}));assert.equal(evaluateSource(hint,ctx).current.status,'possible');
 recordFailure(state,good.id,now+1);ctx=withHosts([good,hint],context({local:state.health}));assert.equal(ctx.hosts.size,0);assert.equal(evaluateSource(hint,ctx).current.status,'unknown');
 recordSuccess(state,good.id,now+2);pruneLocalSources(state,{channels:[channel([hint])],syncedAt:now,version:'v'});
 ctx=withHosts([hint],context({local:state.health,devices:{[good.id]:{pc:{okAt:now,failedAt:0}}}}));
 assert.equal(ctx.hosts.size,0);assert.equal(evaluateSource(hint,ctx).current.status,'unknown');
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
 assert.equal(evaluateChannel(channel([bad,unsupported]),ctx).signal,'unavailable');
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
 const html=renderToStaticMarkup(createElement(SourceList,{channel:channel([good,hint]),evaluation:ctx,checks:{[good.id]:{status:'failed'}},hideFailed:false,onSelect:()=>{},onRecheck:()=>{}}));
 assert.match(html,/线路 15/);assert.match(html,/线路 28/);assert.match(html,/PC：他人近期可播/);assert.match(html,/手机：本机不稳定/);assert.match(html,/device-recent[^>]*> · 他人近期可播/);assert.match(html,/可能可播/);
 for(const signal of ['recent','available','possible','pending','checking','unavailable','restricted','offline'] as const){const icon=renderToStaticMarkup(createElement(ChannelSignal,{state:{signal,label:'测试'}}));assert.match(icon,new RegExp('signal-'+signal));assert.match(icon,/aria-label="测试"/);if(signal==='pending')assert.match(icon,/<circle/);if(['unavailable','restricted','offline'].includes(signal))assert.match(icon,/M3 3l18 18/);}
});
