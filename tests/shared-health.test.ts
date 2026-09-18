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
