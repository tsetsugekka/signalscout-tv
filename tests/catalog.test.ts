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

test('category pinning uses requested order without moving Phoenix Legend out of other',async()=>{const {compareCategoryNames}=await import('../lib/channel-category');const sorted=(names:string[],category:string)=>names.sort((a,b)=>compareCategoryNames(a,b,category));assert.deepEqual(sorted(['安徽卫视','浙江卫视','湖南卫视','东方卫视','北京卫视'],'卫视'),['北京卫视','东方卫视','湖南卫视','浙江卫视','安徽卫视']);assert.equal(sorted(['翡翠台','凤凰中文'],'港澳台')[0],'凤凰中文');assert.equal(sorted(['上海新闻','北京文艺'],'地方')[0],'北京文艺');assert.deepEqual(sorted(['FOX NEWS','BBC World','CNN','CNBC','Bloomberg','NHK World'],'海外'),['Bloomberg','CNBC','CNN','BBC World','FOX NEWS','NHK World']);assert.equal(sorted(['【US】News','【JP】News'],'海外')[0],'【JP】News');assert.deepEqual(sorted(['其他频道','日语新闻','BBC日本'],'海外'),['BBC日本','其他频道','日语新闻']);assert.deepEqual(sorted(['CCTV6','CCTV5+','CCTV5'],'央视'),['CCTV5','CCTV5+','CCTV6']);});


test('default channel list requires three sources except Phoenix and prioritized overseas news',async()=>{
 const {isPrimaryChannel}=await import('../lib/channel-list');
 const channel=(name:string,group:string,count:number)=>({id:name,name,title:'',group,sources:Array.from({length:count},(_,i)=>({id:String(i),url:`https://example.com/${i}`}))});
 for(const [name,group] of [['CCTV5','央视'],['CCTV5+','央视'],['北京卫视','卫视'],['北京新闻','地方'],['普通频道','其他']]){
  assert.equal(isPrimaryChannel(channel(name,group,2)),false,name);assert.equal(isPrimaryChannel(channel(name,group,3)),true,name);
 }
 for(const [name,group] of [['凤凰中文','港澳台'],['Bloomberg','海外'],['彭博','海外'],['CNBC','海外'],['CNN','海外'],['BBC','海外']])assert.equal(isPrimaryChannel(channel(name,group,1)),true,name);
 assert.equal(isPrimaryChannel(channel('凤凰传奇','其他',1)),false);
 for(const prefix of ['.','"',"'",'。','“','★','【'])assert.equal(isPrimaryChannel(channel(prefix+'CNN','海外',5)),false,prefix);
 assert.equal(isPrimaryChannel(channel('  .CNN','海外',5)),false);
 assert.equal(isPrimaryChannel(channel('[US] CNN','海外',1)),true);
 assert.equal(isPrimaryChannel(channel('[JP] NHK','海外',2)),true);
 assert.equal(isPrimaryChannel(channel('[JP] NHK','海外',3)),true);
});
test('more and search reveal deferred channels without changing order inside each group',async()=>{
 const {channelListPage}=await import('../lib/channel-list');
 const channels=['.CNN','BBC','NHK','CCTV5'].map((name,i)=>({id:name,name,title:'',group:i<3?'海外':'央视',sources:Array.from({length:i===3?3:1},(_,n)=>({id:String(n),url:`https://example.com/${n}`}))}));
 const ids=(page:ReturnType<typeof channelListPage>)=>page.visible.map(c=>c.id);
 assert.deepEqual(ids(channelListPage(channels,false,false,80)),['BBC','NHK','CCTV5']);
 assert.equal(channelListPage(channels,false,false,80).remaining,1);
 assert.deepEqual(ids(channelListPage(channels,false,true,80)),['BBC','NHK','CCTV5','.CNN']);
 assert.deepEqual(ids(channelListPage(channels,true,false,80)),channels.map(c=>c.id));
 const deferred=channels.filter(c=>['.CNN','NHK'].includes(c.id));
 assert.equal(channelListPage(deferred,false,false,80).remaining,1);
 assert.deepEqual(ids(channelListPage(deferred,false,true,1)),['NHK']);
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


test('source numbers survive sorting, reordered imports, removals and hole reuse',async()=>{
 const {numberSources}=await import('../lib/source-numbers');const {rankedSources}=await import('../lib/shared-health');
 const make=(urls:string[])=>({id:'c',name:'c',title:'',group:'其他',sources:urls.map(url=>({id:url,url}))});
 const first=numberSources([make(['a','b','c'])]);
 const next=numberSources([make(['c','d','a'])],first);
 assert.deepEqual(next[0].sources.map(s=>[s.id,s.number]),[['c',3],['d',2],['a',1]]);
 const sorted=rankedSources(next[0].sources,{a:{status:'failed'}},{});
 assert.equal(sorted.at(-1)?.id,'a');assert.equal(sorted.at(-1)?.number,1);
 const gap=numberSources([make(['c','a'])],next);
 assert.deepEqual(gap[0].sources.map(s=>s.number),[3,1]);
 assert.deepEqual(numberSources([make(['a','e','c','f'])],gap)[0].sources.map(s=>s.number),[1,2,3,4]);
 assert.deepEqual(numberSources(next)[0].sources,next[0].sources);
});

test('removed catalog URLs lose local success and playback preference',async()=>{
 const {defaults,recordSuccess,recordFailure,pruneLocalSources}=await import('../lib/local-state');
 const s=defaults();recordSuccess(s,'gone',1);recordSuccess(s,'kept',1);s.lastPlayedSources.c='gone';recordFailure(s,'kept',2);
 assert.ok(s.health.kept.failedAt!>s.health.kept.okAt!);
 pruneLocalSources(s,{version:'x',syncedAt:1,channels:[{id:'c',name:'c',title:'c',group:'其他',sources:[{id:'kept',url:'kept'}]}]});
 assert.equal(s.health.gone,undefined);assert.equal(s.lastPlayedSources.c,undefined);assert.equal(s.health.kept.okAt,1);
});

test('one local failure cancels local availability even after cooldown; success restores it',async()=>{
 const {defaults,recordSuccess,recordFailure,localSourceCheck}=await import('../lib/local-state');const s=defaults();
 recordSuccess(s,'u',1);assert.equal(localSourceCheck({status:'waiting'},s.health.u)?.status,'available');
 recordFailure(s,'u',2);s.health.u.until=0;assert.equal(localSourceCheck({status:'waiting'},s.health.u)?.status,'failed');
 recordSuccess(s,'u',3);assert.equal(localSourceCheck(undefined,s.health.u)?.status,'available');
});

test('BD quality tags cannot override recognizable domestic station identity',async()=>{
 const {classifyChannel}=await import('../lib/channel-category');
 for(const name of ['[BD]安徽卫视','[BD]北京卫视','[BD]东方卫视'])assert.equal(classifyChannel(name,'海外'),'卫视');
 for(const name of ['[BD]揭阳综合','[BD]潮州综合','[BD]荆门新闻综合','[BD]江津新闻综合'])assert.equal(classifyChannel(name,'海外'),'地方');
 assert.equal(classifyChannel('[BD]Bangla TV'),'海外');
});
test('Japanese station classification matches its pinning while avoiding TBS Seoul and US call signs',async()=>{
 const {classifyChannel,categoryPriority,isJapaneseChannel}=await import('../lib/channel-category');
 for(const name of ['BS-TBS','NHK World Premium','TOKYOMXチャンネル','WOWOWシネマ','TBS NEWS','BS11']){assert.equal(classifyChannel(name,'其他'),'海外');assert.equal(categoryPriority(name,'海外'),4);}
 assert.equal(isJapaneseChannel('TBSSeoul'),false);assert.equal(isJapaneseChannel('KTBS-TV ABC3'),false);
});

test('Japanese channels are exempt from the three-source threshold',async()=>{const {isPrimaryChannel}=await import('../lib/channel-list');for(const name of ['NHK','BS-TBS','WOWOWシネマ'])assert.equal(isPrimaryChannel({id:name,name,title:'',group:'海外',sources:[{id:'u',url:'https://example.com/u'}]}),true);});

test('quality prefixes do not hide domestic station names, including stale imported groups',async()=>{
 const {classifyChannel}=await import('../lib/channel-category');
 const names=['东莞新闻综合','广东民生','广东少儿','广东新闻','广东移动','广东珠江','广州新闻','广州综合','湖南娱乐','江西少儿家庭'];
 for(const name of names)for(const group of ['其他','海外'])assert.equal(classifyChannel(`[HD]${name}`,group),'地方',name);
 for(const prefix of ['[SD]','[FHD]','【UHD】','（高清）','(1080p)','[4K][HD]'])assert.equal(classifyChannel(prefix+'广东新闻'),'地方',prefix);
});

test('quality metadata preserves satellite, national and foreign identities without erasing country tags',async()=>{
 const {classifyChannel,categoryPriority}=await import('../lib/channel-category');
 for(const [name,group] of [['[HD]湖南卫视','卫视'],['[HD]CCTV5+','央视'],['[HD]凤凰中文','港澳台'],['[HD][US]ABC News','海外'],['[HD]BS-TBS','海外'],['[HD]未知频道','其他'],['[HD]凤凰传奇','其他'],['[BD]Bangla TV','海外']])assert.equal(classifyChannel(name),group,name);
 assert.equal(categoryPriority('[HD]BS-TBS','海外'),4);
});

test('cached quality-tagged channels merge under clean names while retaining source quality and numbering',async()=>{
 const {mergeChannels}=await import('../lib/catalog');const source={id:'http://example.com/live',url:'http://example.com/live',number:15};
 const c=mergeChannels([[{id:'[HD]东莞新闻综合',name:'[HD]东莞新闻综合',title:'',group:'其他',sources:[source]}]])[0];
 assert.equal(c.group,'地方');assert.equal(c.id,'东莞新闻综合');assert.equal(c.name,'东莞新闻综合');assert.deepEqual(c.sources,[{...source,qualities:['HD']}]);
});

test('Japan has its own filter while remaining overseas without a Japan-only pin; Taiwan label includes Macau',async()=>{
 const {CATEGORIES,classifyChannel,channelInCategory,categoryPriority}=await import('../lib/channel-category');
 assert.deepEqual(CATEGORIES,['央视','卫视','地方','港台','日本','海外','其他','全部']);
 for(const name of ['NHK','BS-TBS','[JP]News','[HD]WOWOWシネマ']){const c={name,group:classifyChannel(name)};assert.equal(channelInCategory(c,'日本'),true);assert.equal(channelInCategory(c,'海外'),true);assert.equal(categoryPriority(name,'海外'),categoryPriority('FOX NEWS','海外'));}
 assert.equal(channelInCategory({name:'CNN',group:'海外'},'日本'),false);
 const macau={name:'澳门莲花',group:classifyChannel('澳门莲花')};assert.equal(channelInCategory(macau,'港台'),true);
 assert.equal(categoryPriority('凤凰中文','港台'),0);
 const {isPrimaryChannel}=await import('../lib/channel-list');const single=(name:string)=>({id:name,name,title:'',group:'海外',sources:[{id:'u',url:'http://example.com/u'}]});
 assert.equal(isPrimaryChannel(single('NHK')),true);assert.equal(isPrimaryChannel(single('FOX NEWS')),false);
});


test('channel deep links encode reserved, Unicode and HTML-like names as inert values',async()=>{
 const {readPlaybackLink,resolvePlaybackLink,playbackLinkSearch,channelLinkKey}=await import('../lib/channel-links');
 assert.notEqual(channelLinkKey('CCTV5'),channelLinkKey('CCTV5+'));assert.equal(channelLinkKey('CCTV5+'),'c43435456352b');
 const names=['CCTV5+','BBC','bbc','NHK 日本語 #1 & BS=2?','频道 / \"引用\" <img src=x onerror=alert(1)>','100% Channel'];
 for(const name of names){const c={id:name,name,title:name,group:'其他',sources:[{id:'https://example.com/live',url:'https://example.com/live',number:17}]};
  const query=playbackLinkSearch(c,c.sources[0].id);const url=new URL('https://example.com/?'+query);assert.equal(url.hash,'');assert.equal(url.searchParams.size,2);assert.equal(url.searchParams.get('channel'),channelLinkKey(name));assert.match(url.searchParams.get('channel')!,/^[a-z0-9]+$/);assert.equal(channelLinkKey(name),channelLinkKey(name));
  const link=readPlaybackLink(url.search)!;const resolved=resolvePlaybackLink([c],link,true);assert.equal(resolved.channel?.id,name);assert.equal(resolved.source,c.sources[0].id);
 }
});

test('deep links use stable source numbers and wait for expanded catalogs before falling back',async()=>{
 const {readPlaybackLink,resolvePlaybackLink}=await import('../lib/channel-links');
 const five=parsePlaylist(m3u([['CCTV5','https://example.com/five']]))[0];
 const plus={...parsePlaylist(m3u([['CCTV5+','https://example.com/plus'],['CCTV5+','https://example.com/other']]))[0],sources:[{id:'https://example.com/other',url:'https://example.com/other',number:17},{id:'https://example.com/plus',url:'https://example.com/plus',number:15}]};
 const link=readPlaybackLink('?channel=CCTV5%2B&source=15')!;assert.deepEqual(resolvePlaybackLink([five],link,false),{pending:true});
 assert.deepEqual(resolvePlaybackLink([plus],link,true),{pending:false,channel:plus,source:'https://example.com/plus'});
 assert.equal(resolvePlaybackLink([five],link,true).notice?.includes('未找到'),true);
 assert.equal(resolvePlaybackLink([plus],{channel:'CCTV5+',source:99},false).pending,true);
 assert.equal(resolvePlaybackLink([plus],{channel:'CCTV5+',source:99},true).source,undefined);
 assert.equal(resolvePlaybackLink([plus],readPlaybackLink('?channel=CCTV5%2B')!,false).channel,plus);
 for(const source of ['0','-1','1.5','1e3','NaN','99999999999999999','https://evil.example'])assert.equal(readPlaybackLink('?channel=CCTV5&source='+encodeURIComponent(source))?.invalidSource,true);
 assert.equal(readPlaybackLink('?source=15'),undefined);
});

 test('Japan prioritizes Latin and kana station names only inside its shortcut',async()=>{
 const {categoryPriority}=await import('../lib/channel-category');
 for(const name of ['NHK','TBS NEWS','テレビ東京','ひかりTV','[HD]WOWOW','[JP]NHK','ＮＨＫ','ﾃﾚﾋﾞ'])assert.equal(categoryPriority(name,'日本'),0,name);
 for(const name of ['日本映画','日本购物频道','[JP]日本映画','[HD]日本映画'])assert.equal(categoryPriority(name,'日本'),1,name);
 for(const name of ['NHK','テレビ東京','日本映画'])assert.equal(categoryPriority(name,'海外'),4,name);
 });

test('corner bracket prefixes are exempt like square brackets without exempting source counts',async()=>{
 const {isPrimaryChannel,channelListPage}=await import('../lib/channel-list');
 const {classifyChannel,compareCategoryNames}=await import('../lib/channel-category');
 const make=(name:string,count=1)=>({id:name,name,title:'',group:classifyChannel(name),sources:Array.from({length:count},(_,i)=>({id:`${name}${i}`,url:`https://example.com/${i}`}))});
 const target=make('「US」 Bloomberg TV+2');
 assert.equal(target.group,'海外');assert.equal(isPrimaryChannel(target),true);
 for(const prefix of ['[','「']){
  assert.equal(isPrimaryChannel(make(prefix+'任意名称',3)),true);
  assert.equal(isPrimaryChannel(make(prefix+'任意名称',2)),false);
  assert.equal(isPrimaryChannel(make('  '+prefix+'任意名称',3)),true);
 }
 for(const name of ['.Bloomberg','“Bloomberg','【US】Bloomberg'])assert.equal(isPrimaryChannel(make(name,3)),false,name);
 const sorted=[make('CNN'),target,make('CNBC'),make('BBC'),make('普通频道',3)].sort((a,b)=>compareCategoryNames(a.name,b.name,'海外'));
 assert.deepEqual(channelListPage(sorted,false,false,80).visible.map(c=>c.name),['「US」 Bloomberg TV+2','CNBC','CNN','BBC','普通频道']);
 assert.equal(target.name,'「US」 Bloomberg TV+2');
});

test('province and prefecture dictionary classifies quality-tagged local stations across China',async()=>{
 const {classifyChannel}=await import('../lib/channel-category');
 const provinces='北京 天津 河北 山西 内蒙古 辽宁 吉林 黑龙江 上海 江苏 浙江 安徽 福建 江西 山东 河南 湖北 湖南 广东 广西 海南 重庆 四川 贵州 云南 西藏 陕西 甘肃 青海 宁夏 新疆'.split(' ');
 for(const name of provinces)assert.equal(classifyChannel(`[VGA]${name}新闻`,'海外'),'地方',name);
 const places=['东莞','哈尔滨','衡阳','嘉兴','邢台','吕梁','巴彦淖尔','辽源','绥化','宿州','三明','吉安','聊城','信阳','随州','益阳','贺州','儋州','巴中','毕节','临沧','日喀则','汉中','陇南','海东','中卫','哈密','大兴安岭','锡林郭勒','阿拉善','阿坝','阿坝藏族羌族自治州','黔东南','西双版纳','海西','博尔塔拉','克孜勒苏','伊犁','济源','仙桃','石河子','睢宁','辉南'];
 for(const name of places)assert.equal(classifyChannel(`[VGA]${name}新闻综合`),'地方',name);
 for(const [name,expected] of [['[VGA]湖南卫视','卫视'],['[VGA]东方卫视','卫视'],['[VGA]CCTV5+','央视'],['[VGA]凤凰中文','港澳台'],['[VGA]海绵宝宝','其他'],['[VGA]凤凰传奇','其他'],['[VGA][US]ABC News','海外']])assert.equal(classifyChannel(name),expected,name);
});

test('quality, case and whitespace aliases merge while all URLs and quality labels survive',async()=>{
 const {parseTxt,mergeChannels,channelIdentity,channelQuality}=await import('../lib/catalog');
 const list=parseTxt('[BD]cnbc,https://example.com/a\nCNBC,https://example.com/b\nCNBC (720p),https://example.com/c\nCNBC (1080p),https://example.com/a\n[HD]北京卫视,https://example.com/d\n北京卫视4K,https://example.com/e\n9X Jalwa (1080p),https://example.com/f\n9XJalwa,https://example.com/g');
 assert.equal(list.length,3);const cnbc=list.find(c=>c.id==='CNBC')!;assert.equal(cnbc.name,'CNBC');assert.equal(cnbc.sources.length,3);assert.deepEqual(cnbc.sources[0].qualities,['BD','1080p']);assert.equal(cnbc.sources[1].qualities,undefined);assert.deepEqual(cnbc.sources[2].qualities,['720p']);
 assert.deepEqual(list.find(c=>c.id==='北京卫视')?.sources.map(s=>s.qualities),[['HD'],['4K']]);
 assert.equal(list.find(c=>c.id==='9XJALWA')?.sources.length,2);
 for(const name of ['[VGA]东莞综合','东莞综合 (1080p)','东莞综合720p'])assert.equal(channelIdentity(name),'东莞综合');
 assert.notEqual(channelIdentity('CCTV5'),channelIdentity('CCTV5+'));assert.notEqual(channelIdentity('Bloomberg TV+1'),channelIdentity('Bloomberg TV+2'));assert.equal(channelIdentity('CCTV4K'),'CCTV4K');assert.equal(channelIdentity('CCTV4K超高清'),'CCTV4K');assert.equal(channelIdentity('北京卫视超高清'),'北京卫视');assert.equal(channelIdentity('[BD]Bangla TV'),channelIdentity('Bangla TV'));assert.notEqual(channelIdentity('CNBC Asia'),channelIdentity('CNBC Europe'));
 assert.deepEqual(channelQuality('[hd]台 (1080P)'),{name:'台',qualities:['HD','1080p'],countries:[]});
 const cached=mergeChannels([[{id:'[HD]cnbc',name:'[HD]cnbc',title:'',group:'其他',sources:[{id:'https://example.com/a',url:'https://example.com/a',number:8}]}],list]);
 assert.deepEqual(cached.find(c=>c.id==='CNBC')?.sources[0].qualities,['HD','BD','1080p']);
 assert.deepEqual(mergeChannels([cached]),cached);
});

test('merged source groups keep canonical numbers, resolve collisions and survive future reordering',async()=>{
 const {mergeChannels}=await import('../lib/catalog');const {numberSources}=await import('../lib/source-numbers');
 const make=(name:string,url:string,number:number)=>({id:name,name,title:name,group:'其他',sources:[{id:url,url,number}]});
 const old=[make('[HD]cnbc','https://a.example/live',1),make('CNBC','https://b.example/live',1),make('CNBC (720p)','https://c.example/live',8)];
 const merged=numberSources(mergeChannels([old]),old);assert.equal(merged.length,1);
 assert.deepEqual(Object.fromEntries(merged[0].sources.map(s=>[s.url,s.number])),{'https://a.example/live':2,'https://b.example/live':1,'https://c.example/live':8});
 const reordered=numberSources([{...merged[0],sources:[...merged[0].sources].reverse()}],merged);
 assert.deepEqual(Object.fromEntries(reordered[0].sources.map(s=>[s.url,s.number])),Object.fromEntries(merged[0].sources.map(s=>[s.url,s.number])));
});

test('merged aliases preserve local viewing history and resolve old encoded channel links',async()=>{
 const {defaults,normalizeLocalChannels}=await import('../lib/local-state');const {parseTxt}=await import('../lib/catalog');const {channelLinkKey,resolvePlaybackLink}=await import('../lib/channel-links');
 const saved=defaults();saved.favorites=['[HD]cnbc','CNBC'];saved.recent=['CNBC (720p)','[HD]cnbc'];saved.lastChannel='CNBC (720p)';saved.lastPlayedAt={'[HD]cnbc':10,'CNBC (720p)':20};saved.lastPlayedSources={'[HD]cnbc':'old','CNBC (720p)':'new'};const next=normalizeLocalChannels(saved);
 assert.deepEqual(next.favorites,['CNBC']);assert.deepEqual(next.recent,['CNBC']);assert.deepEqual(next.lastPlayedAt,{CNBC:20});assert.deepEqual(next.lastPlayedSources,{CNBC:'new'});assert.equal(next.lastChannel,'CNBC');assert.equal(next.health,saved.health);
 const c=parseTxt('CNBC,https://example.com/live');assert.equal(resolvePlaybackLink(c,{channel:channelLinkKey('[BD]cnbc')},true).channel?.id,'CNBC');
});

test('Bloomberg and local BD markers plus country labels move from channel names to source metadata',async()=>{
 const {parseTxt,mergeChannels,channelIdentity}=await import('../lib/catalog');
 const {channelInCategory}=await import('../lib/channel-category');const {isPrimaryChannel}=await import('../lib/channel-list');
 const list=parseTxt('[BD]bloomberg tv,https://example.com/a\n「US」 Bloomberg TV+2,https://example.com/b\n「US」BloombergTV+,https://example.com/c\n[BD]经济科教,https://example.com/d\n「JP」News,https://example.com/e\n[JP]News,https://example.com/f\n「US」News,https://example.com/g');
 const bloomberg=list.find(c=>c.id==='BLOOMBERGTV')!;assert.equal(bloomberg.name,'bloomberg tv');assert.equal(bloomberg.group,'海外');assert.deepEqual(bloomberg.sources[0].qualities,['BD']);
 const plus2=list.find(c=>c.id===channelIdentity('「US」Bloomberg TV+2'))!;assert.equal(plus2.name,'[US] Bloomberg TV+2');assert.deepEqual(plus2.sources[0].countries,['US']);assert.equal(plus2.group,'海外');assert.ok(list.some(c=>c.name==='[US] BloombergTV+'));assert.notEqual(channelIdentity('「US」BloombergTV+'),plus2.id);
 const local=list.find(c=>c.name==='经济科教')!;assert.equal(local.group,'其他');assert.deepEqual(local.sources[0].qualities,['BD']);assert.equal(local.sources[0].countries,undefined);
 const japan=list.find(c=>c.id==='NEWS')!;assert.equal(japan.sources.length,3);assert.equal(japan.name,'News');assert.equal(channelInCategory(japan,'日本'),true);assert.equal(isPrimaryChannel(japan),true);assert.deepEqual(japan.sources.map(s=>s.countries),[['JP'],['JP'],['US']]);
 assert.deepEqual(mergeChannels([list]),list);
 const cached=mergeChannels([[{id:'[BD]经济科教',name:'[BD]经济科教',title:'',group:'海外',sources:[{id:'https://old.example/live',url:'https://old.example/live',number:7}]}]]);assert.equal(cached[0].name,'经济科教');assert.equal(cached[0].group,'其他');assert.deepEqual(cached[0].sources[0].qualities,['BD']);
});


test('country-tagged equivalents merge across feeds while unmatched labels and distinct suffixes survive',async()=>{
 const {parseTxt,mergeChannels,channelIdentity}=await import('../lib/catalog');
 const tagged=parseTxt('「US」 Bloomberg TV,https://example.com/a\n[JP]News,https://example.com/jp\n[US]Solo,https://example.com/s\n[US]BloombergTV+2,https://example.com/plus');
 assert.equal(tagged.find(c=>c.id==='SOLO')?.name,'[US] Solo');
 const plain=parseTxt('BloombergTV,https://example.com/b\nNEWS,https://example.com/n');
 for(const lists of [[tagged,plain],[plain,tagged]]){
  const merged=mergeChannels(lists),b=merged.find(c=>c.id==='BLOOMBERGTV')!;
  assert.equal(b.sources.length,2);assert.doesNotMatch(b.name,/US/);assert.equal(merged.find(c=>c.id==='SOLO')?.name,'[US] Solo');
  assert.equal(merged.find(c=>c.id==='NEWS')?.sources.length,2);assert.deepEqual(mergeChannels([merged]),merged);
  assert.ok(merged.some(c=>c.id==='BLOOMBERGTV+2'));
 }
 assert.equal(channelIdentity('「US」 Bloomberg TV'),'BLOOMBERGTV');
 assert.equal(parseTxt('地方频道,#genre#\n[BD]经济科教,https://example.com/e')[0].group,'地方');
 assert.equal(parseTxt('[BD]经济科教,https://example.com/e')[0].group,'其他');
});
