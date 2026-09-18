import assert from "node:assert/strict";
import {test} from "node:test";
import {parsePlaylist,makeCatalog,browserSources} from "../lib/catalog";
import {defaults,recordFailure,recordSuccess} from "../lib/local-state";
const m3u=(rows:string[][])=>'#EXTM3U\n'+rows.map(([n,u])=>`#EXTINF:-1 group-title="央视频道",${n}\n${u}`).join('\n');
test('CCTV5 and CCTV5+ remain separate; exact URLs deduplicate',()=>{const c=parsePlaylist(m3u([['CCTV-5','https://example.com/a.m3u8'],['CCTV 5 PLUS','https://example.com/b.m3u8'],['CCTV5+','https://example.com/b.m3u8']]));assert.equal(c.length,2);assert.equal(c.find(c=>c.id==='CCTV5+')?.sources.length,1);});
test('source order changes preserve catalog identity',async()=>{const a=[['CCTV5+','https://example.com/a.m3u8'],['CCTV5+','https://example.com/b.m3u8']];assert.equal((await makeCatalog(m3u(a))).version,(await makeCatalog(m3u(a.reverse()))).version);});
test('invalid or empty catalogs reject; browser accepts HTTP relay candidates and excludes recordings/Flash',()=>{assert.throws(()=>parsePlaylist('<html>Error</html>'));assert.throws(()=>parsePlaylist('#EXTM3U'));const c=parsePlaylist(m3u([['A','http://example.com/a.m3u8'],['A','https://example.com/a.swf'],['A','https://example.com/good.m3u8'],['A','https://example.com/recording.mp4']]));assert.equal(browserSources(c[0]).length,2);});
test('failure cooldown escalates and successful playback resets it',()=>{const p=defaults();[10,30,120,120].forEach(min=>{recordFailure(p,'source',1000);assert.equal(p.health.source.until,1000+min*60_000);});recordSuccess(p,'source',9000);assert.equal(p.health.source.failures,0);assert.equal(p.health.source.until,0);assert.equal(p.health.source.okAt,9000);});
test('TXT groups and URLs with commas parse; merging is deduplicated',async()=>{const {parseTxt,mergeChannels}=await import('../lib/catalog');const txt='白名单,#genre#\nCCTV5+,https://example.com/a.m3u8\n广东卫视,https://example.com/a,b.m3u8\n坏数据,not-a-url';const c=parseTxt(txt);assert.equal(c.length,2);assert.equal(c.find(c=>c.id==='广东卫视')?.sources[0].url,'https://example.com/a,b.m3u8');const merged=mergeChannels([parsePlaylist(m3u([['CCTV5+','https://example.com/a.m3u8']])),c]);assert.equal(merged.find(c=>c.id==='CCTV5+')?.sources.length,1);assert.throws(()=>parseTxt('<html>blocked</html>'));});
test('catalog compression roundtrips UTF-8 content',async()=>{const {encodeCatalog,decodeCatalog}=await import('../lib/catalog-codec');const data={channels:[{name:'CCTV5+ 体育赛事',url:'https://example.com/中文'}]};assert.deepEqual(await decodeCatalog(await encodeCatalog(data)),data);});

test('categories distinguish local terrestrial, satellite, regions and uncertain names',async()=>{const {classifyChannel}=await import('../lib/channel-category');for(const [name,group] of [['CCTV5+','央视'],['CGTN英语','央视'],['湖南卫视','卫视'],['广东珠江频道','地方'],['成都新闻综合','地方'],['香港卫视','港澳台'],['TVB翡翠台','港澳台'],['NHK World','海外'],['CNN International','海外'],['未知影视频道','其他']])assert.equal(classifyChannel(name),group);});

test('standard CCTV channels sort first numerically with CCTV5+ immediately after CCTV5',async()=>{const {compareChannelNames,standardCctvOrder}=await import('../lib/channel-category');const names=['CGTN','CCTV+1','CCTV4Europe','CCTV5+','CCTV17','CCTV10','CCTV6','CCTV5','CCTV2','CCTV1','CCTV4K'];const sorted=names.sort(compareChannelNames);assert.deepEqual(sorted.slice(0,7),['CCTV1','CCTV2','CCTV5','CCTV5+','CCTV6','CCTV10','CCTV17']);assert.equal(standardCctvOrder('CCTV4K'),Infinity);assert.equal(standardCctvOrder('CCTV+1'),Infinity);});

test('standard CCTV name aliases share one source group and a combined display name',async()=>{const {mergeChannels,parseTxt,channelDisplayName,normalizeName}=await import('../lib/catalog');const merged=mergeChannels([parsePlaylist(m3u([['CCTV11','http://a.example/live'],['CCTV11戏曲','http://b.example/live']])),parseTxt('CCTV11戏曲,http://a.example/live\nCCTV5,http://a.example/sport\nCCTV5+体育赛事,http://b.example/sport')]);const c=merged.find(c=>c.id==='CCTV11')!;assert.equal(c.sources.length,2);assert.equal(channelDisplayName(c),'CCTV11戏曲');assert.equal(merged.length,3);assert.equal(normalizeName('CCTV9(576i)'),'CCTV9');assert.equal(normalizeName('CCTV4Europe'),'CCTV4Europe');assert.equal(normalizeName('CCTV6影院代'),'CCTV6影院代');assert.equal(normalizeName('吉林-卫视'),'吉林卫视');assert.equal(normalizeName('吉林卫视-NPTV'),'吉林卫视');assert.equal(normalizeName('吉林延边卫视'),'吉林延边卫视');});

test('merging title aliases never mixes CCTV5 and CCTV5+ source groups',async()=>{const {parseTxt,mergeChannels,channelDisplayName}=await import('../lib/catalog');const c=mergeChannels([parseTxt('CCTV5,http://a.example/five\nCCTV5体育,http://b.example/five\nCCTV5+,http://a.example/plus\nCCTV5+体育赛事,http://b.example/plus')]);assert.equal(c.length,2);const five=c.find(c=>c.id==='CCTV5')!,plus=c.find(c=>c.id==='CCTV5+')!;assert.equal(channelDisplayName(five),'CCTV5体育');assert.equal(channelDisplayName(plus),'CCTV5+体育赛事');assert.ok(five.sources.every(s=>s.url.endsWith('/five')));assert.ok(plus.sources.every(s=>s.url.endsWith('/plus')));assert.equal(five.sources.length,2);assert.equal(plus.sources.length,2);});

test('TVAPP discovers all live-directory blocks, deduplicates URLs, and excludes app/config sections',async()=>{const {parseTVAPPFeeds,parseCatalog,mergeChannels}=await import('../lib/catalog');const readme='## 接口源\nhttps://example.com/config.json\n## 直播源 🌟\n```\n推荐：\n https://example.com/live.txt # TXT\n海外 IPv6：\n https://example.com/world.m3u # M3U\n https://example.com/live.txt # repeated\n```\n## 免责声明\nhttps://example.com/not-a-feed';assert.deepEqual(parseTVAPPFeeds(readme),['https://example.com/live.txt','https://example.com/world.m3u']);const channels=mergeChannels([parseCatalog('CCTV5体育,http://example.com/a\nCCTV5+体育赛事,http://[240e::1]/plus'),parseCatalog(m3u([['CCTV5','http://example.com/a'],['CCTV5+','http://[240e::1]/plus']]))]);assert.equal(channels.length,2);assert.ok(channels.every(c=>c.sources.length===1));});

test('large directory cache splits below D1 row limit and reconstructs the exact catalog',async()=>{const {encodeCatalog,decodeCatalog,splitCachedPayload}=await import('../lib/catalog-codec');const data=new Uint8Array(1_100_000);for(let i=0;i<data.length;i+=65536)crypto.getRandomValues(data.subarray(i,i+65536));const original={text:Buffer.from(data).toString('base64')};const encoded=await encodeCatalog(original,Infinity),split=splitCachedPayload('catalog',encoded,'fixture');assert.ok(split.parts.length>1);assert.ok(split.parts.every(p=>p.payload.length<=1_000_000));const keys=JSON.parse(split.payload).chunks;assert.deepEqual(keys,split.parts.map(p=>p.key));assert.deepEqual(await decodeCatalog(split.parts.map(p=>p.payload).join('')),original);assert.equal(splitCachedPayload('catalog','small','fixture').payload,'small');});

test('Phoenix Legend is not a Phoenix TV regional channel, including old cached groups',async()=>{const {classifyChannel}=await import('../lib/channel-category');assert.equal(classifyChannel('凤凰传奇'),'其他');assert.equal(classifyChannel('凤凰传奇','港澳台'),'其他');for(const name of ['凤凰中文','凤凰资讯台','凤凰香港'])assert.equal(classifyChannel(name),'港澳台');const {mergeChannels}=await import('../lib/catalog');assert.equal(mergeChannels([[{id:'凤凰传奇',name:'凤凰传奇',title:'',group:'港澳台',sources:[{id:'http://example.com/live',url:'http://example.com/live'}]}]])[0].group,'其他');});

test('category pinning uses requested order without moving Phoenix Legend out of other',async()=>{const {compareCategoryNames}=await import('../lib/channel-category');const sorted=(names:string[],category:string)=>names.sort((a,b)=>compareCategoryNames(a,b,category));assert.deepEqual(sorted(['安徽卫视','浙江卫视','湖南卫视','东方卫视','北京卫视'],'卫视'),['北京卫视','东方卫视','湖南卫视','浙江卫视','安徽卫视']);assert.equal(sorted(['翡翠台','凤凰中文'],'港澳台')[0],'凤凰中文');assert.equal(sorted(['上海新闻','北京文艺'],'地方')[0],'北京文艺');assert.deepEqual(sorted(['FOX NEWS','BBC World','CNN','CNBC','Bloomberg','NHK World'],'海外'),['Bloomberg','CNBC','CNN','BBC World','NHK World','FOX NEWS']);assert.equal(sorted(['【US】News','【JP】News'],'海外')[0],'【JP】News');assert.deepEqual(sorted(['其他频道','日语新闻','BBC日本'],'海外'),['BBC日本','日语新闻','其他频道']);assert.deepEqual(sorted(['CCTV6','CCTV5+','CCTV5'],'央视'),['CCTV5','CCTV5+','CCTV6']);});


test('default channel list requires three sources except Phoenix and prioritized overseas news',async()=>{
 const {isPrimaryChannel}=await import('../lib/channel-list');
 const channel=(name:string,group:string,count:number)=>({id:name,name,title:'',group,sources:Array.from({length:count},(_,i)=>({id:String(i),url:`https://example.com/${i}`}))});
 for(const [name,group] of [['CCTV5','央视'],['CCTV5+','央视'],['北京卫视','卫视'],['北京新闻','地方'],['NHK','海外'],['日本电视','海外'],['普通频道','其他']]){
  assert.equal(isPrimaryChannel(channel(name,group,2)),false,name);assert.equal(isPrimaryChannel(channel(name,group,3)),true,name);
 }
 for(const [name,group] of [['凤凰中文','港澳台'],['Bloomberg','海外'],['彭博','海外'],['CNBC','海外'],['CNN','海外'],['BBC','海外']])assert.equal(isPrimaryChannel(channel(name,group,1)),true,name);
 assert.equal(isPrimaryChannel(channel('凤凰传奇','其他',1)),false);
 for(const prefix of ['.','"',"'",'。','“','★','【'])assert.equal(isPrimaryChannel(channel(prefix+'CNN','海外',5)),false,prefix);
 assert.equal(isPrimaryChannel(channel('  .CNN','海外',5)),false);
 assert.equal(isPrimaryChannel(channel('[US] CNN','海外',1)),true);
 assert.equal(isPrimaryChannel(channel('[JP] NHK','海外',2)),false);
 assert.equal(isPrimaryChannel(channel('[JP] NHK','海外',3)),true);
});
test('more and search reveal deferred channels without changing order inside each group',async()=>{
 const {channelListPage}=await import('../lib/channel-list');
 const channels=['.CNN','BBC','NHK','CCTV5'].map((name,i)=>({id:name,name,title:'',group:i<3?'海外':'央视',sources:Array.from({length:i===3?3:1},(_,n)=>({id:String(n),url:`https://example.com/${n}`}))}));
 const ids=(page:ReturnType<typeof channelListPage>)=>page.visible.map(c=>c.id);
 assert.deepEqual(ids(channelListPage(channels,false,false,80)),['BBC','CCTV5']);
 assert.equal(channelListPage(channels,false,false,80).remaining,2);
 assert.deepEqual(ids(channelListPage(channels,false,true,80)),['BBC','CCTV5','.CNN','NHK']);
 assert.deepEqual(ids(channelListPage(channels,true,false,80)),channels.map(c=>c.id));
 const deferred=channels.filter(c=>['.CNN','NHK'].includes(c.id));
 assert.equal(channelListPage(deferred,false,false,80).remaining,2);
 assert.deepEqual(ids(channelListPage(deferred,false,true,1)),['.CNN']);
 assert.equal(channelListPage(deferred,false,true,1).remaining,1);
});


test('all-category ordering uses distinct catalog source counts, then existing name order',async()=>{
 const {compareChannelSourceCounts,channelListPage}=await import('../lib/channel-list');
 const {parseTxt,mergeChannels}=await import('../lib/catalog');
 const channels=mergeChannels([parseTxt('CCTV5,https://example.com/a\nCCTV5,https://example.com/a\nCCTV5+,https://example.com/b\n普通台,https://example.com/c\n普通台,https://example.com/d\n普通台,https://example.com/e\n.CNN,https://example.com/f\n.CNN,https://example.com/g\n.CNN,https://example.com/h\n.CNN,https://example.com/i')]);
 const ordered=channels.sort(compareChannelSourceCounts);
 assert.deepEqual(ordered.map(c=>c.name),['.CNN','普通台','CCTV5','CCTV5+']);
 assert.deepEqual(channelListPage(ordered,false,false,80).visible.map(c=>c.name),['普通台']);
 assert.deepEqual(channelListPage(ordered,false,true,80).visible.map(c=>c.name),['普通台','.CNN','CCTV5','CCTV5+']);
});

test('local-playable ordering uses actual foreground history, with legacy recent fallback',async()=>{
 const {compareLastPlayed}=await import('../lib/channel-list');
 const c=(id:string)=>({id,name:id,title:'',group:'其他',sources:[]});
 const channels=['CCTV1','older','legacy-old','newer','legacy-new'].map(c);
 assert.deepEqual(channels.sort((a,b)=>compareLastPlayed(a,b,{older:100,newer:200},['legacy-new','legacy-old'])).map(c=>c.id),['newer','older','legacy-new','legacy-old','CCTV1']);
});
