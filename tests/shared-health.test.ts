import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rankedSources,sharedStatus,sharedSourceVisible,SHARED_HEALTH_TTL} from '../lib/shared-health';
const now=10*SHARED_HEALTH_TTL;
const sources=['unknown','failed','good','other'].map(id=>({id,url:'https://example.com/'+id}));
test('another device success moves a source first and failure last without mutating source identity',()=>{
 const shared={good:{okAt:now-100,failedAt:0},failed:{okAt:now-1000,failedAt:now-100}};
 assert.deepEqual(rankedSources(sources,{},shared,now).map(s=>s.id),['good','unknown','other','failed']);
 assert.deepEqual(sources.map(s=>s.id),['unknown','failed','good','other']);
});
test('new success recovers unstable reports and seven-day-old evidence becomes unknown',()=>{
 assert.equal(sharedStatus({okAt:now,failedAt:now-1},now),'available');
 assert.equal(sharedStatus({okAt:now-1,failedAt:now},now),'unstable');
 assert.equal(sharedStatus({okAt:now-SHARED_HEALTH_TTL,failedAt:0},now),'unknown');
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
 const expired={source:{pc:{okAt:now,failedAt:0},mobile:{okAt:0,failedAt:now-SHARED_HEALTH_TTL}}};
 assert.equal(sharedStatus(healthForDevice(expired,'mobile',now).source,now),'available');
});
test('device-health snapshots cannot overwrite a newer report and remove expired device entries separately',async()=>{
 const {mergeDeviceHealth}=await import('../lib/shared-health');
 const current={s:{pc:{okAt:now,failedAt:0},mobile:{okAt:0,failedAt:now-100}}};
 const next=mergeDeviceHealth(current,{s:{pc:{okAt:0,failedAt:now-200}}},['s'],now-50);
 assert.deepEqual(next,{s:{pc:{okAt:now,failedAt:0}}});assert.ok(current.s.mobile);
});
