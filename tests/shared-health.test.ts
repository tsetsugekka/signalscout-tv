import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rankedSources,sharedStatus,sharedSourceVisible} from '../lib/shared-health';
const now=10*7*24*3600_000;
const sources=['unknown','failed','good','other'].map(id=>({id,url:'https://example.com/'+id}));
test('another device success moves a source first and failure last without mutating source identity',()=>{
 const shared={good:{okAt:now-100,failedAt:0},failed:{okAt:now-1000,failedAt:now-100}};
 assert.deepEqual(rankedSources(sources,{},shared,now).map(s=>s.id),['good','unknown','other','failed']);
 assert.deepEqual(sources.map(s=>s.id),['unknown','failed','good','other']);
});
test('new success recovers unstable reports and old successful evidence remains valid',()=>{
 assert.equal(sharedStatus({okAt:now,failedAt:now-1},now),'available');
 assert.equal(sharedStatus({okAt:now-1,failedAt:now},now),'unstable');
 assert.equal(sharedStatus({okAt:now-7*24*3600_000,failedAt:0},now),'available');
});
test('hide failed also hides shared instability, but retains unknown and respects successful local verification',()=>{
 const unstable={okAt:0,failedAt:now};
 assert.equal(sharedSourceVisible(undefined,unstable,true,now),false);
 assert.equal(sharedSourceVisible({status:'waiting'},unstable,true,now),false);
 assert.equal(sharedSourceVisible({status:'failed'},undefined,true,now),false);
 assert.equal(sharedSourceVisible({status:'available'},unstable,true,now),true);
 assert.equal(sharedSourceVisible({status:'waiting'},undefined,true,now),true);
 assert.equal(sharedSourceVisible(undefined,unstable,false,now),true);
});


test('asymmetric device health: phone failures never demote PC; PC cannot override phone instability',async()=>{
 const {healthForDevice}=await import('../lib/shared-health');
 const records={source:{pc:{okAt:now,failedAt:0},mobile:{okAt:0,failedAt:now-1}}};
 assert.equal(sharedStatus(healthForDevice(records,'pc',now).source,now),'available');
 assert.equal(sharedStatus(healthForDevice(records,'mobile',now).source,now),'unstable');
 assert.equal(sharedSourceVisible(undefined,healthForDevice(records,'mobile',now).source,true,now),false);
 assert.equal(sharedSourceVisible(undefined,healthForDevice(records,'pc',now).source,true,now),true);
 const phoneOnly={source:{mobile:{okAt:now-2,failedAt:now}}};
 assert.equal(sharedStatus(healthForDevice(phoneOnly,'pc',now).source,now),'available');
 assert.equal(sharedStatus(healthForDevice(phoneOnly,'mobile',now).source,now),'unstable');
 const pcOnly={source:{pc:{okAt:now,failedAt:0}}};
 assert.equal(sharedStatus(healthForDevice(pcOnly,'mobile',now).source,now),'available');
 const pcFailure={source:{pc:{okAt:0,failedAt:now},mobile:{okAt:now-1,failedAt:0}}};
 assert.equal(sharedStatus(healthForDevice(pcFailure,'pc',now).source,now),'unstable');
 assert.equal(sharedStatus(healthForDevice(pcFailure,'mobile',now).source,now),'available');
 const expired={source:{pc:{okAt:now,failedAt:0},mobile:{okAt:0,failedAt:now-7*24*3600_000}}};
 assert.equal(sharedStatus(healthForDevice(expired,'mobile',now).source,now),'unstable');
});
test('device-health snapshots cannot overwrite a newer report and remove expired device entries separately',async()=>{
 const {mergeDeviceHealth}=await import('../lib/shared-health');
 const current={s:{pc:{okAt:now,failedAt:0},mobile:{okAt:0,failedAt:now-100}}};
 const next=mergeDeviceHealth(current,{s:{pc:{okAt:0,failedAt:now-200}}},['s'],now-50);
 assert.deepEqual(next,{s:{pc:{okAt:now,failedAt:0}}});assert.ok(current.s.mobile);
});

test('display promotes either playable device, while unsupported stays behind unstable',()=>{
 const devices={failed:{pc:{okAt:now,failedAt:0},mobile:{okAt:0,failedAt:now}}};
 const shared={failed:{okAt:0,failedAt:now},good:{okAt:0,failedAt:now}};
 const checks={failed:{status:'failed' as const},other:{status:'unsupported' as const}};
 assert.deepEqual(rankedSources(sources,checks,shared,now,devices,'mobile').map(s=>s.id),['failed','unknown','good','other']);
 assert.equal(sharedSourceVisible(checks.failed,shared.failed,true,now),false);
});
test('newer phone success does not override known PC instability for automatic attempts',async()=>{
 const {healthForDevice}=await import('../lib/shared-health');
 const records={source:{pc:{okAt:0,failedAt:now-1},mobile:{okAt:now,failedAt:0}}};
 assert.equal(sharedStatus(healthForDevice(records,'pc',now).source,now),'unstable');
 assert.equal(sharedStatus(healthForDevice(records,'mobile',now).source,now),'available');
});

test('hide-failed uses PC instability on desktop, and either device instability on mobile',async()=>{
 const {deviceSourceVisible:visible}=await import('../lib/shared-health');
 const pcBad={pc:{okAt:0,failedAt:now},mobile:{okAt:now,failedAt:0}};
 const phoneBad={pc:{okAt:now,failedAt:0},mobile:{okAt:0,failedAt:now}};
 assert.equal(visible(undefined,pcBad,'pc',true,now),false);
 assert.equal(visible(undefined,pcBad,'mobile',true,now),false);
 assert.equal(visible({status:'available'},pcBad,'mobile',true,now),false);
 assert.equal(visible(undefined,phoneBad,'pc',true,now),true);
 assert.equal(visible(undefined,phoneBad,'mobile',true,now),false);
 assert.equal(visible({status:'available'},phoneBad,'mobile',true,now),true);
 assert.equal(visible(undefined,pcBad,'mobile',false,now),true);
 assert.equal(visible(undefined,{},'mobile',true,now),true);
 assert.equal(visible(undefined,{pc:{okAt:0,failedAt:now-7*24*3600_000}},'mobile',true,now),false);
 assert.equal(visible({status:'failed'},undefined,'pc',true,now),false);
});

test('shared success persists until two distinct other browsers fail after the latest success',async()=>{
 const {summarizeVotes}=await import('../lib/source-votes');
 const success={source:'s',device:'pc' as const,reporter:'a',ok_at:1,failed_at:0};
 const fail=(reporter:string,failed_at:number)=>({...success,reporter,ok_at:0,failed_at});
 assert.equal(sharedStatus(summarizeVotes([success]).s.pc,now),'available');
 assert.equal(sharedStatus(summarizeVotes([success,fail('b',2),fail('b',3)]).s.pc,now),'available');
 assert.equal(sharedStatus(summarizeVotes([{...success,failed_at:2},fail('b',3)],{},{s:'a'}).s.pc,now),'available');
 assert.equal(sharedStatus(summarizeVotes([success,fail('b',2),fail('c',3)]).s.pc,now),'unstable');
 assert.equal(sharedStatus(summarizeVotes([{...success,ok_at:4},fail('b',2),fail('c',3)]).s.pc,now),'available');
 const mixed=summarizeVotes([success,fail('b',2),{...fail('c',3),device:'mobile'}]);
 assert.equal(sharedStatus(mixed.s.pc,now),'available');assert.equal(sharedStatus(mixed.s.mobile,now),'unknown');
});
test('legacy successes survive but unattributed failures cannot count as people',async()=>{
 const {summarizeVotes,observerHash}=await import('../lib/source-votes');
 assert.equal(sharedStatus(summarizeVotes([],{s:{pc:{okAt:1,failedAt:2}}}).s.pc,now),'available');
 assert.notEqual(await observerHash('s','one'),await observerHash('other','one'));
});

test('shared success protects 24 hours, then requires two other browser failures; self vote is excluded',async()=>{
 const {summarizeVotes,SUCCESS_PROTECTION}=await import('../lib/source-votes');const start=1000;
 const rows=[{source:'s',device:'pc' as const,reporter:'a',ok_at:start,failed_at:start+1},{source:'s',device:'pc' as const,reporter:'b',ok_at:0,failed_at:start+2}];
 const status=(viewer:string,time:number)=>sharedStatus(summarizeVotes(rows,{},{s:viewer},time).s.pc,time);
 assert.equal(status('c',start+SUCCESS_PROTECTION-1),'available');
 assert.equal(status('c',start+SUCCESS_PROTECTION),'unstable');
 assert.equal(status('a',start+SUCCESS_PROTECTION),'available');
 rows.push({source:'s',device:'pc',reporter:'c',ok_at:0,failed_at:start+3});
 assert.equal(status('a',start+SUCCESS_PROTECTION),'unstable');
 rows[0].ok_at=start+SUCCESS_PROTECTION+1;
 assert.equal(status('c',start+2*SUCCESS_PROTECTION),'available');
});

test('shared-playable channels need one successful source on either device',async()=>{
 const {channelHasSharedSuccess}=await import('../lib/shared-health');const channel={sources:[{id:'s',url:'s'}]};
 assert.equal(channelHasSharedSuccess(channel,{s:{mobile:{okAt:1,failedAt:0}}}),true);
 assert.equal(channelHasSharedSuccess(channel,{s:{pc:{okAt:1,failedAt:0},mobile:{okAt:0,failedAt:2}}}),true);
 assert.equal(channelHasSharedSuccess(channel,{s:{pc:{okAt:1,failedAt:2}}}),false);
 assert.equal(channelHasSharedSuccess(channel,{other:{pc:{okAt:1,failedAt:0}}}),false);
});
