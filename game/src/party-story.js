export const PARTY_VERSION = 2;
export const STORY_REVISION = 2;
export const PARTY_PLAYTEST_BUILD = 'PT-03';
export const VEHICLE = {seats:7,plate:"0719",label:"七座车"};
export const ids = ['lan','lin','zhou','wei','rui','yi'];
export const cast = {
 lan:{name:'老潘',avatar:'lan',note:'常替大家张罗',habit:'冷静，短句，偶尔习惯替别人决定。',signature:'相机里还有去年夏天。'},
 lin:{name:'春哥',avatar:'lin',note:'总发语音的朋友',habit:'随意，话说一半就开始行动，有点贫。',signature:'今天也没说服猫。'},
 zhou:{name:'老金',avatar:'zhou',note:'接应司机',habit:'说话简短，习惯问清几个人。',signature:'歌单还停在 2012。'},
 wei:{name:'小卫',avatar:'illustrated',note:'今晚的寿星',habit:'在乎每个人，着急时反复点人数。',signature:'蛋糕要留到第二天吃。'},
 rui:{name:'席瑞',avatar:'sea',note:'爱拍照的朋友',habit:'观察细，会纠正时间细节，偶尔嘴硬。',signature:'原图总要多存一份。'},
 yi:{name:'正义',avatar:'walk',note:'熟悉商场周边',habit:'行动快，解释慢，爱说“等我一下”。',signature:'走小路也算散步。'}
};
export const exits = {east:'东门',south:'后院门',west:'西门',north:'正门'};
export const partyRooms = Object.fromEntries([
 ['old',{name:'生日散场群',members:['me',...ids]}],
 ['me',{name:'我的场馆记录',members:['me']}],
 ...ids.map(id=>[id,{name:cast[id].name,members:['me',id]}])
]);
const scenarios = [
 {danger:'lin',type:'voice',lead:'lan',source:'rui',driver:'zhou'},
 {danger:'lan',type:'plan',lead:'lin',source:'wei',driver:'zhou'},
 {danger:'zhou',type:'pickup',lead:'lan',source:'rui',driver:'yi'},
 {danger:'wei',type:'voice',lead:'yi',source:'rui',driver:'zhou'},
 {danger:'rui',type:'plan',lead:'lan',source:'wei',driver:'zhou'},
 {danger:'yi',type:'pickup',lead:'wei',source:'rui',driver:'zhou'}
];
const subjects = {
 lin:'回去找外套时，春哥把手机搁在西梯座椅上。', lan:'老潘下楼看卷帘时，把手机忘在窗台。',
 zhou:'老金双手抱着蛋糕盒去车边，手机留在西侧长椅。', wei:'小卫把手机留在西梯口的礼物袋旁，空手返回。',
 rui:'席瑞换拍立得相纸时，把手机搁在西梯窗边。', yi:'正义回去拿雨伞，把手机忘在西梯的长椅。'
};
export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
export function makeCase(seed,revision=STORY_REVISION){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Seed 必须是 0–4294967295 的整数');
 const base = scenarios[seed % scenarios.length];
 const band=revision>=2?Math.floor(seed/scenarios.length)%3:0;
 const structures=['voice','plan','pickup'];
 const type=structures[(structures.indexOf(base.type)+band)%structures.length];
 const alternateLead={lin:'yi',lan:'yi',zhou:'lin',wei:'lan',rui:'yi',yi:'lan'};
 const lead=band===2?alternateLead[base.danger]:base.lead;
 const candidates=['rui','wei','yi','lan','lin'].filter(id=>![base.danger,lead,base.driver].includes(id));
 const source=band===0?base.source:candidates.find(id=>id!==base.source);
 const chosen={...base,lead,source,type};
 const variant = Math.imul((seed ^ (seed >>> 16)) + 1, 0x9e3779b1) >>> 0;
 const {danger,driver}=chosen;
 const outdoor = danger==='zhou'?['zhou','yi']:['zhou'];
 const indoors = ids.filter(id=>!outdoor.includes(id));
 const people = Object.fromEntries(ids.map(id=>[id,{
  place:outdoor.includes(id)?'街边车位':id===danger?'二层洗手台':id===source?'包间 208':'二层茶水间',
  companions:outdoor.includes(id)?outdoor.filter(x=>x!==id):[],
  device:id===danger?null:id
 }]));
 const accounts=Object.fromEntries(ids.map(id=>[id,{controller:id===danger?'intruder':id,device:id}]));
 const devices=Object.fromEntries(ids.map(id=>[id,{owner:id,holder:accounts[id].controller,place:id===danger?'西侧楼梯':people[id].place}]));
 return {
  version:PARTY_VERSION,revision,seed,...chosen,investigation:['direct','request','field'][band],vehicle:VEHICLE,people,accounts,devices,outdoor,indoors,evacuees:[...ids,'me'],
  shelter:{room:'B03',code:String(1000+(variant%9000)),knownBy:['me'],partyRoom:'208'},
  routes:{
   east:{path:'后场通道 → 东门',requirement:'确认侧楼梯防火门可推开',parking:'便利店外临停区'},
   south:{path:'侧楼梯 → 后院门',requirement:'司机从外侧拉开插销',parking:'后巷临停区'},
   west:{path:'西侧电梯 → 西门',obstacle:'电梯夜间停运，西门封闭'},
   north:{path:'大厅 → 正门',obstacle:'夜间卷帘已落'}
  },
  evidence:{
   lead:{owner:lead,requires:'两份资料已对照后，询问现场本人',content:danger==='zhou'?'我在楼上没见到老金，只找到车载线。正义跟我说他在车边，得请他当面核对。':`我见到${cast[danger].name}本人了，和我在一起。对方没拿手机，接下来借我这台说话。`},
   record:{owner:source,requires:'查看原始记录，或请持有人补发',content:revision===1?subjects[danger]:subjects[danger].replace(/把手机.{2,18}。$/, '在西侧停留过。记录只拍到当时的位置。').replace(/手机留在西侧长椅。$/, '之后没有再入镜。')},
   outside:{owner:driver,requires:'出门后询问现场接应',content:danger==='zhou'?'老金人就在车边，手机不见了。现在借我手机确认接应。':'我在街边车位。刚刚群里那条改口消息不是现场确认。'}
  },
  challengeItem:['蜡烛','蛋糕刀','星星灯'][variant%3],
  challenge:['生日蜡烛倒着插了一根','蛋糕刀卡在盒盖的夹层里','最后一盏星星灯是拿发夹固定的'][variant%3],
  vehicleSignal:['短闪两下，再亮一下','先开双闪，再关灯','先闪一下，再短闪两下'][(variant>>>12)%3],
  events:[variant%2?'share':'lowBattery',...(type==='pickup'?['spoofPickup']:type==='plan'?['oldNotice']:[])],
  misunderstanding:{person:source,claim:'我刚才一直在包间。',explanation:'其实折回过一次，去取藏在座位底下的生日礼物。'},
  threat:{place:'西侧楼梯',knows:['包间 208'],can:['模仿已收到的内容','试探位置','沿已知地点移动']}
 };
}
export function validateCase(c){
 const {danger,lead,source,driver,indoors,outdoor}=c;
 return ids.includes(danger)&&new Set([danger,lead,source,driver]).size===4&&
  indoors.includes(lead)&&indoors.includes(source)&&outdoor.includes(driver)&&outdoor.includes('zhou')&&
  [...indoors,...outdoor].sort().join()===ids.slice().sort().join()&&
  ids.filter(id=>c.accounts[id].controller==='intruder').join()===danger&&
  c.people[danger].device===null&&c.devices[danger].holder==='intruder'&&!c.shelter.knownBy.includes(danger)&&
  !!c.routes.east.parking&&!!c.routes.south.parking&&c.evidence.record.owner!==c.evidence.lead.owner;
}
export function caseFiles(c){
 const spoof=c.events.includes('oldNotice')?'引用场馆旧告示：周五 15:00–18:00，西门临时开放。转发者称今晚也有效。\n':'';
 return {
  map:{name:'旧商业楼出口图.svg',version:'场馆平面图',source:'场馆订房资料',text:'聚会包间 208 在二层，访客休息室另设。\n东门经后场通道；后院门经侧楼梯。\n西门经西侧电梯。正门在一层大厅。\n原图只记录建筑关系。'},
  handoff:{name:'B03 智能门锁说明.txt',version:'内侧面板 · 当前访客码',source:'玩家在 B03 室内取得',text:`B 楼二层 B03 临时休息室。\n访客码 ${c.shelter.code}。内侧可以作废，反锁可阻止无有效访客码的人进入。\n只要发送全文，对方就会收到房号和访客码。`},
  repair:{name:'今晚的闭馆告示.txt',version:'周六 23:30 · 原始记录',source:`${cast[c.source].name}确认的一层告示`,text:'正门卷帘已落，西侧电梯停运、西门封闭。\n东门走后场通道，先核实防火门。后院门走侧梯，需外侧接应拉插销。'},
  false:{name:(c.revision??1)>=2?'临时安排.txt':c.type==='pickup'?'临时接车通知.txt':'散场近路.txt',version:'23:45 · 临时转发',source:cast[c.danger].name+'账号',text:spoof+(c.type==='pickup'?'西门现在可以接车，出来之后走到西门集合。':'西侧电梯还开着，去西门快点。把你躲的房间和访客码发我。')},
  record:{name:c.investigation==='field'?'现场复查记录.txt':c.investigation==='request'?'补发的原始记录.txt':'原始拍摄记录.txt',version:'原始记录 · 23:39–23:44',source:cast[c.source].name,text:`散场时的原始记录和拍摄时间。\n${c.evidence.record.content}\n附：西侧屏幕一直显示夜间停运。`}
 };
}
export const oldVoice = '这盒先别收，我待会回来拿。[两短一长敲击，随后是椅脚划地声]';
export const doorVoice = '[楼道脚步停下，门把手转了两下] 是我，开一下门。';

export const partyVoices = {
 'party-original':{file:'party-repeat.wav',seconds:5,text:oldVoice},
 'party-copy':{file:'party-repeat.wav',seconds:5,text:oldVoice},
 'party-door':{file:'party-door.wav',seconds:4,text:doorVoice}
};
