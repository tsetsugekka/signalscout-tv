export const CATEGORIES=["央视","卫视","地方","港澳台","海外","其他","全部"] as const;
export function classifyChannel(name:string,originalGroup=""):string{
 const n=name.replace(/[\s·_-]/g,"");const g=originalGroup;
 if(/^凤凰传奇/.test(n))return "其他";
 const country=n.match(/^[「【\[]([A-Z]{2})[」】\]]/i)?.[1]?.toUpperCase();
 if(country&&["HK","MO","TW"].includes(country))return "港澳台";
 if(country&&["US","CA","GB","UK","JP","KR","FR","DE","RU","AU","NZ","SG","MY","TH","VN","PH","ID","IN","IT","ES","PT","BR","MX","AR","TR","AE","SA","QA","ZA","NL","BE","CH","AT","SE","NO","DK","FI","PL","UA","RO","GR","IL","IR","PK","BD"].includes(country))return "海外";
 if(/^(CCTV|CGTN|CETV)/i.test(n)||/央视|央视频道/.test(g))return "央视";
 if(/港澳台|香港|澳门|台湾/.test(g)||/^(香港|澳门|台湾|港台|凤凰(?:中文|资讯|香港|卫视|欧洲|美洲)|翡翠|明珠|无线|有线|台视|中视|民视|公视|华视|中天|三立|东森|纬来|八大|年代|非凡|壹电视|靖天|靖洋|龙华|龙祥|人间|大爱|好消息|耀才|澳视|莲花|澳亚|TVB|TVBS|ViuTV|HOY|RTHK|TTV|CTV|CTS|FTV)/i.test(n))return "港澳台";
 if(/^(CNN|BBC|NHK|KBS|SBS|MBC|TV5MONDE|FRANCE24|DW|ARIRANG|ALJAZEERA|NASA|CNBC|BLOOMBERG|FOXNEWS|SKYNEWS|EURONEWS|REUTERS|TRT|ABCNEWS|NBCNEWS|PBS)(?:\b|\d|[\u3400-\u9fff])/i.test(n)||/^(NHK|BBC|CNN|KBS|MBC|CNBC)/i.test(n)||/海外|国际频道|日本|韩国|朝鲜|美国|英国|法国|德国|俄罗斯|加拿大|澳大利亚|新加坡|马来西亚|泰国|越南|菲律宾|印尼|意大利|西班牙|葡萄牙|巴西|印度|阿联酋|土耳其|Japan|Korea|United States|United Kingdom|France|Germany|Russia|Canada|Australia/i.test(g)||/^(日本|韩国|朝鲜|美国|英国|法国|德国|俄罗斯|新加坡|马来西亚|泰国|越南|半岛|福克斯|彭博)/.test(n))return "海外";
 if(n.includes("卫视")||/卫视频道|卫视直播/.test(g))return "卫视";
 if(/地方|省级|市级|地面频道/.test(g)||/^(北京|BRTV|上海|东方电视|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|宁夏|新疆|西藏|兵团|深圳|广州|珠江|南方|杭州|宁波|温州|绍兴|金华|嘉兴|湖州|丽水|衢州|舟山|南京|苏州|无锡|常州|徐州|扬州|南通|镇江|泰州|盐城|连云港|淮安|宿迁|济南|青岛|烟台|潍坊|临沂|淄博|威海|东营|日照|济宁|泰安|德州|聊城|滨州|菏泽|郑州|洛阳|开封|武汉|长沙|株洲|湘潭|衡阳|岳阳|成都|绵阳|德阳|乐山|泸州|南充|自贡|贵阳|昆明|西安|咸阳|宝鸡|延安|兰州|西宁|银川|拉萨|乌鲁木齐|呼和浩特|包头|鄂尔多斯|石家庄|唐山|保定|邯郸|秦皇岛|廊坊|太原|大同|长治|运城|沈阳|大连|鞍山|抚顺|丹东|锦州|营口|长春|吉林市|延边|哈尔滨|大庆|牡丹江|佳木斯|齐齐哈尔|鹤岗|漠河|福州|厦门|泉州|漳州|莆田|龙岩|三明|南平|宁德|南昌|九江|赣州|吉安|上饶|抚州|宜春|萍乡|景德镇|鹰潭|合肥|芜湖|蚌埠|淮南|马鞍山|安庆|黄山|阜阳|亳州|宿州|六安|滁州|池州|宣城|铜陵|海口|三亚|南宁|桂林|柳州|梧州|北海|玉林|百色|佛山|东莞|珠海|中山|惠州|江门|肇庆|汕头|汕尾|湛江|茂名|揭阳|梅州|潮州|清远|韶关|河源|云浮)/i.test(n))return "地方";
 return "其他";
}

export function standardCctvOrder(name:string){
 if(name==="CCTV5+")return 5.5;
 const match=name.match(/^CCTV([1-9]\d*)$/);return match?Number(match[1]):Infinity;
}
const collator=new Intl.Collator("zh-CN",{numeric:true});
export function compareChannelNames(a:string,b:string){
 const first=standardCctvOrder(a),second=standardCctvOrder(b);
 if(first!==second)return first-second;
 return Number(b.startsWith("CCTV"))-Number(a.startsWith("CCTV"))||collator.compare(a,b);
}

export function categoryPriority(name:string,category:string){
 const n=name.replace(/[\s·_-]/g,"");
 if(category==="港澳台")return n.includes("凤凰")?0:1;
 if(category==="卫视"){
  const rank=[/北京/,/上海|东方/,/湖南/,/浙江/].findIndex(pattern=>pattern.test(n));return rank<0?4:rank;
 }
 if(category==="地方")return n.includes("北京")?0:1;
 if(category==="海外"){
  const rank=[/BLOOMBERG|彭博/i,/CNBC/i,/CNN/i,/BBC/i,/日本|日语|日テレ|NHK|^[「【\[]JP[」】\]]|[\u3040-\u30ff]|^(?:TOKYOMX|TVTOKYO|WOWOW|TBS|BS11|BS12)(?:$|\d)/i].findIndex(pattern=>pattern.test(n));return rank<0?5:rank;
 }
 return 0;
}
export function compareCategoryNames(a:string,b:string,category:string){
 return categoryPriority(a,category)-categoryPriority(b,category)||compareChannelNames(a,b);
}
