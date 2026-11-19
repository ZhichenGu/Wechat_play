import {PARTY_VERSION,STORY_REVISION,VEHICLE,ids,cast,exits,partyRooms,randomSeed,makeCase,validateCase,caseFiles,oldVoice,doorVoice} from './party-story.js';

import {classify,routeOf,disclosedRoute} from './party-intents.js';
import {roomCluesFor,roomReceipt} from './party-location.js';

const copy = structuredClone;
const name = id=>cast[id]?.name;
export const members = (s,room)=>partyRooms[room]?.members??s.groups[room]?.members??[];
export const getGroups = s=>['old',...Object.keys(s.groups)];

const usable = route=>route==='east'||route==='south';
const dangerous = s=>s.case.danger;
const indoor = s=>s.case.lead;
const driver = s=>s.case.driver;
function placePerson(s,id,place){
 const person=s.people[id];
 person.place=place;
 if(person.device&&s.devices[person.device]?.holder===id)s.devices[person.device].place=place;
}
function placeThreat(s,place){
 s.positions.threat=place;
 s.devices[s.accounts[dangerous(s)].device].place=place;
}
const speaker = (s,room,text='')=>members(s,room).find(id=>id!=='me'&&text.startsWith('@'+name(id)))??
 (members(s,room).includes(indoor(s))?indoor(s):members(s,room).find(id=>id!=='me'));

function publish(s,room,from,text,type='text',value=null,extra={},sources={}){
 const deliveredTo=members(s,room).filter(id=>id!=='me');
 extra=Object.fromEntries(Object.entries(extra).filter(([,value])=>value!==undefined));
 const m={id:`${s.runId}:${++s.seq}`,room,from,text,type,value,tick:s.clock,deliveredTo,...extra};
 const clues=roomCluesFor(m,sources);
 if(clues.length)m.roomClues=clues;
 s.messages.push(m);
 for(const id of deliveredTo){
  const own=s.knowledge[id];
  own.receipts.push(m.id);
  for(const clue of clues){
   const first=!own.roomClues.some(item=>item.kind===clue.kind);
   own.roomClues.push(roomReceipt(m,clue));
   if(clue.kind==='confirmed')own.facts.room='B03';
   if(first&&id===dangerous(s)){
    const text={confirmed:'被冒用账号收到了确认 B03 的信息。',candidate:'被冒用账号收到 B03 作为候选地点，位置尚未确认。',reported:'被冒用账号收到关于 B03 的转述，位置尚未确认。'}[clue.kind];
    s.nodes.push({kind:'roomClue',clue:clue.kind,message:m.id,source:clue.source,text});
   }
  }
  const content=[m.text,m.type==='file'?caseFiles(s.case)[m.value]?.text:'',m.quotedContent].join('\n');
  if(new RegExp(`(?<!\\d)${s.case.shelter.code}(?!\\d)`).test(content)&&!own.facts.code){
   own.facts.code=true;
   if(id===dangerous(s))s.nodes.push({message:m.id,text:'临时访客码已送达被冒用账号。'});
  }
 }
 return m;
}
function messageContent(s,message){
 if(message.type==='file')return caseFiles(s.case)[message.value]?.text??message.text;
 if(message.type==='location')return message.lastLocation??message.text;
 if(message.type==='capture')return message.text;
 return [message.quote,message.text].filter(Boolean).join('\n');
}
const tell=(s,who,text,extra)=>publish(s,who,who,text,'text',null,extra);
const note=(s,room,text)=>publish(s,room,'system',text);
const labels=list=>list.map(name).join('、');
const meetPlace='隔门会合点';
const seenBefore=(s,who)=>s.messages.some(m=>m.from===who&&m.kind==='witness');
const hasAll=(list,expected)=>expected.every(id=>list.includes(id));
const makeRoster=()=>({recovered:[],assembled:[],atExit:[],outside:[],boarded:[],pickup:null});
const checkpoint=(s,label)=>{
 const {checkpoints,...rest}=s;
 checkpoints.push({label,snapshot:copy(rest)});
 if(checkpoints.length>2)checkpoints.shift();
};
export function freshParty(seed=randomSeed(),revision=STORY_REVISION){
 const generated=makeCase(seed,revision);
 const config=validateCase(generated)?generated:{...makeCase(seed%ids.length,revision),seed};
 if(!validateCase(config))throw new Error('没有可用的散场配置');
 const s={version:PARTY_VERSION,runId:crypto.randomUUID(),seed,case:config,seq:0,clock:0,chapter:0,flags:{},
  groups:{},messages:[],events:[],nodes:[],processed:[],checkpoints:[],viewed:[],evidence:[],positions:{me:'B03',threat:config.threat.place},
  people:copy(config.people),accounts:copy(config.accounts),devices:copy(config.devices),knowledge:Object.fromEntries(ids.map(id=>[id,{facts:{},receipts:[],roomClues:[]}])) ,
  shared:{old:false},sharedSelf:{},shares:{},threatStep:0,codeValid:true,blocked:{},pending:null,call:null,
  friendsRoute:null,driverRoute:null,friendsStep:0,roster:makeRoster(),exited:false,ending:null,reason:'',missing:[]};
 note(s,'old','周六 23:42 · 聚会刚散场');
 note(s,'old','合照拍完了。有人下楼找车，有人回包间拿东西。');
 publish(s,'old','wei','蛋糕在桌上。谁拿了我那根充电线？');
 publish(s,'old','lin','我拿的是黑的。有人跟老金一车吗？');
 publish(s,'old','yi','我先到楼下看一眼，刚才伞好像落下了。');
 publish(s,'old','rui','合照我明天发。刚才随手拍的东西先别删。');
 publish(s,'old','zhou','开的是七座车，司机算一个，七个人正好。先别分头打车。');
 publish(s,'old','lan','订房资料里有楼层图，大家别走散。','file','map');
 if(revision===1&&config.type==='voice')publish(s,'old',config.danger,oldVoice,'voice','party-original',{historical:true});
 note(s,'me','你回楼上取充电器。楼梯口有人反复喊你的名字。你退进休息室，反锁了门。');
 publish(s,'me','me','内侧门锁记录','file','handoff');
 return s;
}
function ensureRoster(s){
 for(const person of Object.values(s.people))if(person.place==='B03外的隔门会合点')person.place=meetPlace;
 for(const device of Object.values(s.devices??{}))if(device.place==='B03外的隔门会合点')device.place=meetPlace;
 if(s.roster)return;
 const c=s.case;
 s.roster=makeRoster();
 if(s.flags.identity&&c.danger!=='zhou'||s.flags.curb||s.flags.curbEarly)s.roster.recovered.push(c.danger);
 if(s.friendsStep>=1)s.roster.assembled=c.indoors.filter(id=>s.people[id].companions?.length>=c.indoors.length-1);
 if(s.exited)s.roster.atExit=s.roster.assembled.filter(id=>s.people[id].place===exits[s.friendsRoute]);
 if(s.driverRoute){
  const parking=c.routes[s.driverRoute].parking;
  s.roster.outside=c.outdoor.filter(id=>s.people[id].place===parking);
  if(hasAll(s.roster.outside,c.outdoor))s.roster.pickup=s.driverRoute;
 }
}
function restoreRoomReceipts(s){
 const byId=new Map(s.messages.map(m=>[m.id,m]));
 const oldRoomNode=s.nodes.find(node=>node.text==='B03 房号已送达被冒用账号。');
 for(const [id,own] of Object.entries(s.knowledge)){
  if(own.roomClues)continue;
  const delivered=own.receipts.map(key=>byId.get(key)).filter(Boolean);
  own.roomClues=delivered.flatMap(m=>roomCluesFor(m,{quoted:byId.get(m.quoteSource),original:byId.get(m.origin?.id)}).map(clue=>roomReceipt(m,clue)));
  if(own.facts.room&&!own.roomClues.some(item=>item.kind==='confirmed')){
   // Keep a previously settled run intact, with the actual receipt that led to it.
   const original=own.roomClues[0];
   const prior=id===dangerous(s)?oldRoomNode?.message:null;
   const attributed=prior&&own.receipts.includes(prior);
   if(attributed||original){
    const receipt=attributed?prior:original.message;
    own.roomClues.push({kind:'confirmed',message:receipt,source:own.roomClues.find(c=>c.message===receipt)?.source??receipt,historical:true});
   }
  }
 }
}
export function recoverParty(s){
 ensureRoster(s);
 restoreRoomReceipts(s);
 const p=s.replyInFlight;
 if(p){delete s.replyInFlight;if(!s.messages.some(m=>m.id===p.token))s.messages.splice(p.index,0,p.message);}
 return s;
}
export function retryParty(s,index=s.checkpoints.length-1){
 const cp=s.checkpoints[index];if(!cp)return freshParty(s.seed,s.case.revision??1);
 const next=recoverParty(copy(cp.snapshot));
 return {...next,runId:crypto.randomUUID(),checkpoints:copy(s.checkpoints.slice(0,index+1)),pending:null,call:null};
}
function finish(s,ending,reason,missing=[]){
 Object.assign(s,{ending,reason,missing,pending:null,call:null});
 if(ending==='A'){
  publish(s,'old',dangerous(s),'刚刚怎么一下子都不说话了？');
 }
}
function releaseRecord(s){
 if(s.flags.recordSent)return;
 const c=s.case;
 s.flags.recordSent=true;
 publish(s,c.source,c.source,'','file','record');
 if(c.type==='voice')publish(s,c.source,c.source,'','file','repair');
}
function anomaly(s){
 const c=s.case;
 s.chapter=1;
 tell(s,c.source,c.investigation==='field'?'合照还在我这儿。刚才我一直在包间……也可能记岔了，你先核对时间。':'合照我这边有一份。我刚才说在包间，时间可能记岔了。');
 const bystander=c.indoors.find(id=>![c.danger,c.source,c.lead].includes(id));
 if(bystander)tell(s,bystander,'先前说要下楼，等下，我又折回去拿东西。拼车还是给我留个位。');
 if(c.type==='voice'){
  if(!s.messages.some(m=>m.value==='party-original'))publish(s,'old',c.danger,oldVoice,'voice','party-original',{historical:true});
  publish(s,c.danger,c.danger,oldVoice,'voice','party-copy');
  tell(s,c.danger,'刚才断了。你在哪间？我上来接你。');
 }else{
  tell(s,c.danger,c.type==='plan'?'我来安排。把你手边那份说明发我看看。':'我在帮忙看车位。先看看这份安排。');
  publish(s,c.danger,c.danger,'','file','false');
 }
 if(c.type!=='voice')publish(s,c.source,c.source,'','file','repair');
 if(c.investigation==='request')tell(s,c.source,'我手上还有散场那会儿的原始记录。你要对时间的话，我单独补发给你。');
 else if(c.investigation==='field')tell(s,c.source,`我原来只顾着找礼物，没留意走廊。请${name(c.lead)}先到西梯核实，我再拿原记录对时间。`);
 else releaseRecord(s);
 const leadCue=c.investigation==='field'?'我在楼里。你对照一下新消息和原始的语音或告示，再来问我现场情况。'
  :c.type==='voice'?'群里那条语音和新收到的声音可以对一对。要核实本人就问我。'
   :'临时安排和那张闭馆告示对一下。别只看落款，要核实现场就问我。';
 tell(s,c.lead,leadCue);
}
function startInvestigation(s){
 if(s.chapter!==0||!s.flags.normal||!s.viewed.includes('map'))return;
 anomaly(s);
}
function primaries(s){
 return s.case.type==='voice'?s.flags.original&&s.flags.copy:s.viewed.includes('repair')&&s.viewed.includes('false');
}
function evidencePrompt(s){
 const c=s.case;
 if(!primaries(s))return c.type==='voice'?'先对照群里的旧语音和新收到的语音，字幕也能看背景声。':'先对照那份临时安排和今晚的闭馆告示。';
 if(c.investigation==='field'&&!s.flags.firstWitness)return '两份消息对上以后，可以问刚联系你的楼内同伴「能核实一下现场吗？」';
 if(!s.viewed.includes('record'))return c.investigation==='request'?`向${name(c.source)}要原始记录，再核对时间。`:`打开${name(c.source)}的独立记录，再来核验。`;
 return '请楼内同伴核验本人，确认消息究竟从哪台手机发出。';
}
function witness(s){
 const c=s.case;
 if(s.chapter!==1||!primaries(s))return false;
 if(c.investigation==='field'&&!s.flags.firstWitness){
  s.flags.firstWitness=true;
  tell(s,c.lead,`我从西梯看过了，夜间停运牌确实挂着。通知了${name(c.source)}帮我对照当时的记录。`);
  publish(s,c.source,c.lead,'我刚从西梯回来。麻烦把当时的记录发出来，比一下时间。');
  releaseRecord(s);
  return true;
 }
 if(!s.viewed.includes('record'))return false;
 s.chapter=2;
 s.flags.identity=true;
 if(c.danger!=='zhou'){
  placePerson(s,c.danger,s.people[c.lead].place);
  s.people[c.danger].borrowedDevice=c.lead;
  s.people[c.danger].companions=[c.lead];
  s.people[c.lead].companions=[c.danger];
  s.roster.recovered.push(c.danger);
 }
 tell(s,c.lead,c.evidence.lead.content,{kind:'witness'});
 if(c.danger!=='zhou')tell(s,c.lead,'我是本人，手机不在我手上。先别把房间发给那个账号。',{actualSpeaker:c.danger});
 else tell(s,c.lead,'先按现场能走的路会合。出门后找正义到车边，核验老金本人。');
 tell(s,c.source,'刚才说我没离开过包间不对。我折回去取藏在座位底下的礼物了，怕被寿星看见才没说。');
 if(c.events.includes('share')){
  s.shared.old=true;
  const place=s.people[c.lead].place;
  const m=publish(s,'old',c.lead,'[共享位置] '+place,'location','public',{lastLocation:place});
  s.crewShare={owner:c.lead,messageId:m.id};
 }else tell(s,c.source,'我手机只剩一格电。等会儿我就跟着同行的人走，不单独回消息了。');
 checkpoint(s,'已确认异常');
 return true;
}
function moveThreat(s){
 const k=s.knowledge[dangerous(s)].facts;
 if(!k.room||s.exited||s.flags.decoy||s.threatStep>=3)return;
 s.threatStep++;
 placeThreat(s,['','二层侧梯','B03门外','B03门外'][s.threatStep]);
 if(s.threatStep===1)note(s,dangerous(s),'[脚步踩上二层侧梯，停了一下。]');
 if(s.threatStep===2){
  publish(s,dangerous(s),dangerous(s),doorVoice,'voice','party-door');
  if(k.code&&s.codeValid)note(s,dangerous(s),'[门外响了一声按键音。门内面板仍可作废访客码。]');
  if(!s.blocked[dangerous(s)]&&!s.call)s.call={who:dangerous(s),status:'incoming',voice:'party-door',transcript:doorVoice};
 }
 if(s.threatStep===3&&k.code&&s.codeValid)finish(s,'C','被冒用账号收到房号和有效访客码，沿西侧楼梯抵达 B03 后进入。');
}
function leakRoute(s,route,message){
 if(s.flags.decoy||!usable(route))return;
 s.flags.leakedRoutes??={};
 if(s.flags.leakedRoutes[route])return;
 s.flags.leakedRoutes[route]=message;
 s.nodes.push({message,text:`${exits[route]}路线已送达被冒用账号。`});
 if(s.friendsRoute===route){
  s.flags.intercepted=true;
  const sent=s.messages.find(m=>m.id===message);
  if(sent?.room==='old')tell(s,indoor(s),'旧群能看到这个方向。我先带大家停一下，换个地方再走。');
  else note(s,'me','[当前集合点已传给了可疑账号。先别让大家继续沿这条路线走。]');
 }
}
function advance(s,room=s.case.lead){
 const c=s.case,route=s.friendsRoute;
 if(s.chapter<3||s.exited||!route||s.flags.intercepted||s.friendsStep>=2){
  if(s.friendsStep===2&&!s.exited)publish(s,room,c.lead,'我们已经在约好的会合点，原地等你确认。');
  else if(s.flags.intercepted)publish(s,room,c.lead,'先停着。要换出口，请告诉我明确的新安排。');
  return;
 }
 const found=c.indoors.filter(id=>id!==c.danger||s.roster.recovered.includes(id));
 if(!hasAll(found,c.indoors)){
  tell(s,c.lead,'我还没找到所有人。先不要出门。');return;
 }
 s.clock++;
 moveThreat(s);
 if(s.ending)return;
 s.friendsStep++;
 const place=s.friendsStep===1?(route==='east'?'后场通道':'后院侧梯'):meetPlace;
 for(const id of found){
  placePerson(s,id,place);
  s.people[id].companions=found.filter(x=>x!==id);
 }
 s.roster.assembled=found;
 if(s.friendsStep===1){
  tell(s,c.lead,`我点过人了。我带着${labels(found.filter(id=>id!==c.lead))}到了${place}，楼里这边一共${found.length}人。`);
  if(found.includes('wei'))tell(s,c.lead,'小卫还抱着蛋糕盒。刚才问充电线的是他，现在先拿蛋糕盒帮大家腾出手。');
 }else{
  tell(s,c.lead,`刚才点过名的${found.length}个人都在，到了约好的隔门会合点。`);
  if(c.challengeItem)note(s,c.lead,`[你从猫眼看见隔门那边有人举起了${c.challengeItem}。]`);
  tell(s,c.lead,c.challengeItem?`他们拿了样聚会上的东西，你能从猫眼看到。你也可以问我刚刚举的是什么。`:'问一件刚刚在现场发生的小事，再出来。');
 }
 if(s.shared.old&&s.friendsStep===1){
  const m=s.messages.find(m=>m.id===s.crewShare?.messageId);
  if(m)m.lastLocation=place;
  const update=publish(s,'old',c.lead,`[共享位置更新] ${place}`,'location',route);
  leakRoute(s,route,update.id);
 }
 if(s.friendsStep===2){s.chapter=4;s.flags.meet=false;checkpoint(s,'最终会合前');}
}
function park(s,route){
 const c=s.case;
 const parking=c.routes[route].parking;
 if(c.danger==='zhou'&&!s.roster.recovered.includes('zhou'))return false;
 for(const id of c.outdoor)placePerson(s,id,parking);
 s.roster.outside=c.outdoor.filter(id=>s.people[id].place===parking);
 s.roster.pickup=route;
 return hasAll(s.roster.outside,c.outdoor);
}
function setRoute(s,room,route,m,decoy=false){
 const c=s.case,receivers=m.deliveredTo;
 for(const id of receivers)(s.knowledge[id].arrangements??={})[route]=m.id;
 if(receivers.includes(c.danger)){
  if(usable(route))leakRoute(s,route,m.id);
  else if(decoy&&s.chapter>=2&&(s.threatStep>0||s.flags.leakedRoutes?.east&&s.flags.leakedRoutes?.south)&&!s.flags.decoy&&room===c.danger){
   const heardApproach=s.threatStep>0;
   s.flags.decoy=true;s.threatStep=0;s.flags.intercepted=false;placeThreat(s,route==='west'?'西侧电梯厅':'一层大厅');
   tell(s,c.danger,'好，你说在那里，我下去看看。');
   note(s,room,heardApproach?'[脚步声转向楼梯，逐渐远去。]':'[假集合点已送达。]');
   s.nodes.push({message:m.id,text:'单独发送的假集合点引开了门外的人。'});
  }
 }
 if(!usable(route)){
  if(receivers.includes(c.lead))tell(s,c.lead,'那个口夜间封闭，选东门或后院门。');
  return;
 }
 if(s.chapter<2)return;
 if(receivers.includes(c.driver)){
  s.driverRoute=route;
  const ready=park(s,route);
  publish(s,room,c.driver,ready?`楼外这边是${labels(s.roster.outside)}。七座车到${c.routes[route].parking}了，从${exits[route]}接。`:`记下了：${exits[route]}。我得先和老金当面核对，还不能确认车位。`);
 }
 if(receivers.includes(c.lead)){
  if(!s.flags.inspected){tell(s,c.lead,'现场还没核实。先问我防火门和侧楼梯。');return;}
  if(s.friendsRoute!==route){
   if(!s.exited){s.friendsStep=0;s.flags.meet=false;}
   s.flags.intercepted=!!s.flags.leakedRoutes?.[route]&&!s.flags.decoy;
  }
  s.friendsRoute=route;
  s.chapter=s.exited?5:s.friendsStep===2?4:3;
  if(s.flags.intercepted)tell(s,c.lead,'那个口的路线已经公开过了，先停下来。请换路。');
  else publish(s,room,c.lead,`收到，走${c.routes[route].path}。司机也需要收到同一个出口。`);
  if(s.exited&&!s.flags.intercepted){
   for(const id of s.roster.atExit)placePerson(s,id,exits[route]);
   s.positions.me=exits[route];
  }
  if(!s.flags.startedRoute&&!s.flags.intercepted){s.flags.startedRoute=true;advance(s,room);}
 }
}
function stopShare(s,room){
 if(room!=='old'&&!members(s,room).includes(indoor(s)))return;
 s.shared.old=false;
 tell(s,indoor(s),'旧群共享结束。已经发出去的点位还在。');
}
const stripMention = (s,room,text)=>{
 const who=members(s,room).find(id=>id!=='me'&&text.startsWith('@'+name(id)));
 return (who?text.slice(name(who).length+1):text).trim().replace(/[。！!]+$/,'');
};
function discussedHere(s,room,who,route){
 const receipt=s.knowledge[who].arrangements?.[route];
 const message=s.messages.find(m=>m.id===receipt);
 return message?.room===room&&members(s,room).every(id=>id==='me'||message.deliveredTo.includes(id));
}
function fixedReply(s,room,who,text,kind){
 const c=s.case;
 if(kind==='open'||kind==='leave'||kind==='abandon'){s.pending={kind,room};return;}
 if(kind==='reset'){s.codeValid=false;note(s,room,'[内侧面板：访客码已作废。]');return;}
 if(kind==='stop'&& (room==='old'||members(s,room).includes(indoor(s)))){stopShare(s,room);return;}
 if(!who)return;
 const trusted=room!=='old'&&!members(s,room).includes(c.danger);
 const inGroup=members(s,room).length>2;
 if(who===c.source&&s.chapter>=3&&c.events.includes('lowBattery')){
  note(s,room,'[未回应 · 对方电量不足。可向同行者补查资料。]');return;
 }
 if(kind==='caution'){publish(s,room,who,'先别动门锁。等确认了再说。');return;}
 if(kind==='hold'){publish(s,room,who,'好，先等你确认。');return;}
 if(kind==='relay'){
  const contact=!inGroup&&trusted&&s.flags.identity&&who===c.lead&&c.danger==='zhou'?'先私聊正义，让他在车边找老金。':'请直接私聊对方，或拉进你确认过的会合群。';
  publish(s,room,who,`我没有替你发。${contact}`);return;
 }
 if(kind==='reported'){
  publish(s,room,who,who===c.driver&&s.driverRoute&&(!inGroup||discussedHere(s,room,who,s.driverRoute))?`在我这里实际收到的安排是${exits[s.driverRoute]}。`:'我只看得到这边的消息。让对方回一下他收到的是哪个口。');return;
 }
 if(kind==='locationChallenge'){
  const knowledge=s.knowledge[who];
  const confirmed=knowledge.roomClues.find(item=>item.kind==='confirmed');
  const evidence=s.messages.find(m=>m.id===confirmed?.message);
  const label=evidence?.room==='old'?'散场群':evidence?.room===room?'这个聊天':'我收到的那条消息';
  const earlier=knowledge.roomClues.find(item=>item.kind!=='confirmed'&&item.message!==s.messages.at(-1)?.id);
  publish(s,room,who,evidence?`我是从${label}看到的。`:
   earlier?'之前那条消息提到过这个房间。我还没确认你在那里。':'我没确认你在哪，不用把房号发出来。');return;
 }
 if(kind==='help'){
  s.nodes.push({kind:'help',text:'玩家在聊天中主动求助。'});
  publish(s,room,who,'你先把新收到的消息和原来的记录对一下。卡住的话，在「发现」里有当前提示。');return;
 }
 if(kind==='routeQuestion'){
  const planned=who===c.driver?s.driverRoute:who===c.lead?s.friendsRoute:null;
  if(inGroup&&(!planned||!discussedHere(s,room,who,planned))){
   publish(s,room,who,'出口先单独核对，群里先不发集合点。');return;
  }
  const recap=planned?`我这边最后收到的是${exits[planned]}。`:'这边还没收到确定的出口。';
  const option=!inGroup&&/后院|南侧/.test(text)&&who===c.lead&&s.flags.inspected?'后院能走，要外面接应的人拉插销。':'';
  publish(s,room,who,recap+option+(option?'等你确定了再改。':''));return;
 }
 if(kind==='status'){
  if(inGroup){publish(s,room,who,'先私聊确认吧，别在这里报具体位置。');return;}
  if(who===c.danger){publish(s,room,who,'我在这边等。你方便说大概在哪吗？');return;}
  const self=s.people[who],beside=self.companions??[];
  publish(s,room,who,`我在${self.place}。${beside.length?`跟我在一起的是${labels(beside)}。`:'我这边只有自己。'}`);return;
 }
 if(kind==='stop'){publish(s,room,who,'这条共享不是我开的。请联系发位置的人。');return;}
 if(inGroup&&(kind==='record'||s.chapter<2&&['verify','inspect'].includes(kind))){
  publish(s,room,who,'这种事私聊核对，原件也单独发。');return;
 }
 if(kind==='record'&&trusted&&(who===c.source||who===c.lead)&&s.chapter>=1){
  if(c.investigation==='field'&&!s.flags.firstWitness){
   publish(s,room,who,`记录还在等现场复查。先问${name(c.lead)}核对西梯情况。`);return;
  }
  if(who===c.lead&&!s.flags.recordSent&&c.investigation==='request'){
   publish(s,room,who,`原件在${name(c.source)}那里，你从私聊向对方要，能确认来源。`);return;
  }
  if(!s.flags.recordSent)releaseRecord(s);
  else publish(s,room,who,'','file','record');
  publish(s,room,who,'','file','repair');
  return;
 }
 if(['verify','inspect'].includes(kind)&&trusted&&who===c.lead&&s.chapter===1){
  if(!witness(s))publish(s,room,who,evidencePrompt(s));
  return;
 }
 if(kind==='inspect'&&trusted&&who===c.lead&&s.chapter>=2){
  s.flags.inspected=true;
  publish(s,room,who,'我推过了。后场防火门能开，东门可走。侧梯也通，走后院门要车那边的人从外面拉插销。西梯和正门今晚都封。');return;
 }
 if(kind==='advance'&&trusted&&who===c.lead){advance(s,room);return;}
 if(kind==='verify'&&trusted&&who===c.lead&&s.friendsStep===2&&!s.flags.intercepted&&!s.exited){
  s.flags.meet=true;
  if(!s.nodes.some(node=>node.kind==='meet'))s.nodes.push({kind:'meet',text:'通过同伴设备核验了隔门会合点。'});
  const actual=c.danger==='zhou'?c.source:c.danger;
  s.people[actual].borrowedDevice=who;
  publish(s,room,who,`${c.challenge}。刚才等你的时候我们在隔门外又试了一遍，你能从猫眼看到手里的东西。屋门口如果有人催你，那不是我们的会合点。`,'text',null,{actualSpeaker:actual});
  return;
 }
 if(kind==='curb'&&trusted&&who===c.driver&&(s.exited||c.danger==='zhou'&&s.chapter>=2&&s.driverRoute==='south')){
  if(s.exited)s.flags.curb=true;else s.flags.curbEarly=true;
  if(!s.nodes.some(node=>node.kind==='curb'))s.nodes.push({kind:'curb',text:'用现场人员与即时车灯信号确认了接应。'});
  if(c.danger==='zhou'){
   if(!s.roster.recovered.includes('zhou'))s.roster.recovered.push('zhou');
   s.people.zhou.borrowedDevice=c.driver;s.people.zhou.companions=[c.driver];s.people[c.driver].companions=['zhou'];
  }
  if(s.driverRoute)park(s,s.driverRoute);
  const signal=`车尾号 0719，现场信号：${c.vehicleSignal}。${s.driverRoute?`车和${labels(s.roster.outside)}都在${c.routes[s.driverRoute].parking}。`:'先告诉我从哪个出口接。'}`;
  if(c.danger==='zhou')publish(s,room,who,c.evidence.outside.content);
  publish(s,room,who,signal,'text',null,c.danger==='zhou'?{actualSpeaker:'zhou'}:{});
  return;
 }
 if(kind==='pickup'&&trusted&&who===c.driver&&s.exited){
  if((c.type==='pickup'||c.danger==='zhou')&&!s.flags.curb){publish(s,room,who,'先跟我核验车旁情况，群里那条改口消息还没确认。');return;}
  const route=s.friendsRoute,exit=exits[route];
  if(route!==s.driverRoute||s.flags.intercepted){
   const missing=c.indoors.filter(id=>id!==c.lead);
   s.positions.me='街边安全处';placePerson(s,c.lead,'街边安全处');
   finish(s,'B',`你和${name(c.lead)}退到街边安全处。接应最后收到的是${s.driverRoute?exits[s.driverRoute]:'原街边车位'}，队伍走的是${exit}。没有在同一处会合，${labels(missing)}没上车。`,missing);return;
  }
  const roomCrew=s.roster.atExit.filter(id=>s.people[id].place===exit);
  const parking=c.routes[route].parking;
  const curbCrew=s.roster.outside.filter(id=>s.people[id].place===parking);
  const boarded=[...new Set(['me',...roomCrew,...curbCrew])];
  if(s.positions.me!==exit||s.roster.pickup!==route||!hasAll(boarded,c.evacuees)||
     !s.roster.recovered.includes(c.danger)||boarded.length>(c.vehicle??VEHICLE).seats){
   publish(s,room,who,'等我再点一次。只接到了这边的人，先别发车。');return;
  }
  s.roster.boarded=boarded;
  publish(s,room,who,`从${exit}接到了你和${labels(roomCrew)}。车边原来有${labels(curbCrew)}，七个人都点到了。`);
  for(const id of [...roomCrew,...curbCrew])placePerson(s,id,'老金的车里');
  s.positions.me='老金的车里';
  s.nodes.push({kind:'board',text:`${name(who)}从${exit}完成七人点名，人员全部上车。`});
  finish(s,'A',`楼内与车边人员在${exit}接上，七座车按名单点齐七人。`);return;
 }
 if(kind==='pickup'&&trusted&&who===c.driver){
  publish(s,room,who,'我先在车边等。等你们出楼，再确认接应。');return;
 }
 const normal={lan:'好，我先数一下人。',lin:'行，等我把手里东西放一下。',zhou:'收到。要接几个人告诉我。',wei:'好。最后都报一下平安。',rui:'我看到消息了，等我翻一下。',yi:'行，我先看看。'};
 const social=kind==='chat'&&s.chapter>0&&(room!=='old'&&(who!==c.danger||room===c.danger));
 const life=who==='wei'&&/蛋糕/.test(text)?'先别惦记蛋糕了。等人齐了，再分剩下的。'
  :who==='rui'&&/合照/.test(text)?'原图我留着。等都回去我再发，缺谁都不行。'
  :who==='lin'&&/充电|线/.test(text)?'我的黑线还在。你那根等人齐再找，别折回去。':null;
 const line=who===c.danger&&s.chapter>0?'刚才信号不好。具体在哪儿？':
  life??(/怕|紧张|慌/.test(text)?'慢慢说，我在看。':s.chapter>=2?'收到。我们先顾眼前这件事，到齐再慢慢聊。':normal[who]);
 publish(s,room,who,line,'text',null,{social:social&&!life});
}

function refreshShares(s){
 for(const [room,share] of Object.entries(s.shares)){
  if(!s.sharedSelf[room])continue;
  if(share.owner!=='me')continue;
  const m=s.messages.find(x=>x.id===share.messageId);
  if(!m)continue;
  const place=s.positions.me==='B03'&&m.value!=='room'?'B 楼附近':s.positions.me;
  if(place===m.lastLocation)continue;
  m.lastLocation=place;
  const update=publish(s,room,'me','[共享位置更新] '+place,'location',m.value,{lastLocation:place});
  if(update.deliveredTo.includes(dangerous(s)))leakRoute(s,routeOf(place),update.id);
 }
}
export function dispatchParty(input,e){
 if(!e.id||input.ending||(e.runId&&e.runId!==input.runId)||input.processed.includes(e.id))return input;
 const room=e.room??'me';
 if(!members(input,room).length)return input;
 const s=copy(input),c=s.case;
 if(s.pending&&!['CONFIRM','CANCEL'].includes(e.type))return input;
 s.processed.push(e.id);s.events.push({tick:s.clock,...Object.fromEntries(Object.entries(e).filter(([,value])=>value!==undefined))});
 switch(e.type){
 case 'SEND':{
  const text=e.text?.trim();if(!text)return input;
  const quoted=s.messages.find(m=>m.id===e.quoteId);
  const quotedContent=quoted?messageContent(s,quoted):undefined;
  const cleaned=stripMention(s,room,text);
  const kind=classify(cleaned);
  const m=publish(s,room,'me',text,e.messageType||'text',e.value,{quote:e.quote,quotedContent,quoteSource:quoted?.id},{quoted,playerText:cleaned});
  if(m.deliveredTo.includes(c.danger)){
   leakRoute(s,disclosedRoute(cleaned),m.id);
   if(quotedContent)leakRoute(s,disclosedRoute(quotedContent)??(quoted?.type==='location'?routeOf(quotedContent):null),m.id);
  }
  const selected=speaker(s,room,text);
  if(e.messageType==='sticker'){if(selected)publish(s,room,selected,s.chapter&&selected===c.danger?'我也收到了。':'收到你的表情。');break;}
  const role=['curb','pickup'].includes(kind)?c.driver:['verify','inspect','advance'].includes(kind)?c.lead:kind==='record'&&s.chapter===1?c.source:null;
  const who=role&&!text.startsWith('@')&&m.deliveredTo.includes(role)?role:selected;
  if(kind==='help')s.events.at(-1).askedHelp=true;
  s.flags.normal=true;
  if(kind==='route'||kind==='decoy')setRoute(s,room,routeOf(cleaned),m,kind==='decoy');
  else fixedReply(s,room,who,cleaned,kind);
  break;
 }
 case 'CAPTURE':
 case 'FORWARD':{
  const original=s.messages.find(x=>x.id===e.messageId);if(!original)return input;
  const content=original.type==='location'?original.lastLocation??original.text:original.text;
  const origin={room:original.room,from:original.from,id:original.id};
  const attachment=original.type==='location'?{lastLocation:content}:{};
  const m=e.type==='CAPTURE'
   ?publish(s,room,'me',messageContent(s,original),'capture',null,{origin},{original})
   :publish(s,room,'me',content,original.type,original.value==='public'?'area':original.value,
     {quote:original.quote,quotedContent:original.quotedContent,quoteSource:original.quoteSource,origin,...attachment},{original});
  if(m.deliveredTo.includes(c.danger)){
   const disclosed=original.type==='location'?routeOf(content):disclosedRoute(m.text);
   leakRoute(s,disclosed,m.id);
   if(m.quotedContent)leakRoute(s,disclosedRoute(m.quotedContent),m.id);
  }
  if(m.type==='text'&&classify(m.text)==='route')setRoute(s,room,routeOf(m.text),m);
  else if(speaker(s,room))publish(s,room,speaker(s,room),'转发收到了。');
  break;
 }
 case 'READ_FILE': if(!s.messages.some(m=>m.type==='file'&&m.value===e.value))return input;
  if(!s.viewed.includes(e.value))s.viewed.push(e.value);
  break;
 case 'PLAY_VOICE':
  if(!s.messages.some(m=>m.type==='voice'&&m.value===e.value))return input;
  if(e.value==='party-original')s.flags.original=true;
  if(e.value==='party-copy')s.flags.copy=true;
  break;
 case 'VOICE_REVIEWED':break;
 case 'SAVE':if(s.messages.some(m=>m.id===e.messageId)&&!s.evidence.includes(e.messageId))s.evidence.push(e.messageId);break;
 case 'NEW_GROUP':{
  const selected=[...new Set(e.members??[])].filter(id=>ids.includes(id));
  if(selected.length<2)return input;
  const group='g'+s.seq+'_'+Object.keys(s.groups).length;
  s.groups[group]={name:e.name?.trim().slice(0,20)||'临时群聊',members:['me',...selected]};
  note(s,group,'群已建立。成员从此条消息开始接收群消息。');
  s.lastGroup=group;
  break;
 }
 case 'EDIT_GROUP':{
  const group=s.groups[room];if(!group)return input;
  const selected=[...new Set(e.members??[])].filter(id=>ids.includes(id));
  if(selected.length<2)return input;
  group.name=e.name?.trim().slice(0,20)||'临时群聊';
  group.members=['me',...selected];
  note(s,room,'群资料已更新。新成员从现在开始收消息，已送达的记录仍保留。');
  break;
 }
 case 'LOCATION':{
  const current=s.positions.me;
  const target=e.value==='room'?'B 楼二层 B03':exits[e.value]??'B 楼附近';
  const location=e.share?(current==='B03'&&e.value!=='room'?'B 楼附近':current):target;
  const m=publish(s,room,'me',location,'location',e.value,{isShared:!!e.share,device:'me',lastLocation:location});
  if(e.share){s.sharedSelf[room]=true;s.shares[room]={owner:'me',messageId:m.id};}
  if(m.deliveredTo.includes(c.danger))leakRoute(s,routeOf(location),m.id);
  break;
 }
 case 'STOP_SELF_SHARE':s.sharedSelf[room]=false;note(s,room,'你结束了位置共享；历史点位保留。');break;
 case 'CALL':{
  const who=speaker(s,room);
  if(!who||s.blocked[who])break;
  if(who===c.lead&&room===c.lead)witness(s);
  const transcript=who===c.danger?'是我。你在哪儿？':who===c.lead&&s.flags.identity?c.evidence.lead.content:'我听得见。关键的事发文字，我们可以回看。';
  s.call={who,status:'active',transcript};
  publish(s,room,who,transcript,'call');
  break;
 }
 case 'ANSWER':if(s.call?.status==='incoming'){
  s.call.status='active';
  publish(s,s.call.who,s.call.who,s.call.transcript,'call',s.call.voice);
 }break;
 case 'HANGUP':if(s.call){note(s,s.call.who,s.call.status==='incoming'?'未接听 · 可查看语音字幕':'语音通话已结束');s.call=null;}break;
 case 'BLOCK':if(ids.includes(room)){s.blocked[room]=true;note(s,room,'已屏蔽此账号的来电。对方保留已经收到的信息。');if(s.call?.who===room)s.call=null;}break;
 case 'RESET_CODE':s.codeValid=false;note(s,room,'[内侧面板：临时访客码已作废。]');break;
 case 'REQUEST_ACTION':if(['open','leave','abandon'].includes(e.kind))s.pending={kind:e.kind,room};break;
 case 'CANCEL':s.pending=null;break;
 case 'CONFIRM':{
  const p=s.pending;s.pending=null;
  if(!p||s.exited)break;
  const outside=s.threatStep>=2&&!s.flags.decoy;
  if(outside&&p.kind==='leave'&&s.codeValid&&s.knowledge[c.danger].facts.code){
   s.clock++;
   moveThreat(s);
   if(!s.ending&&s.threatStep===3)finish(s,'C','门外的人已到达并持有有效访客码。你确认出门时，对方先一步进入。');
   if(s.ending)break;
  }
  if(p.kind==='open'){
   if(outside)finish(s,'C','门外的危险方已抵达 B03，你确认解开了反锁。');
   else note(s,p.room,'[门外暂时无人，你重新锁上门。]');
  }else if(outside)note(s,p.room,'[门把手还被握住。你没有推门。先把门外的人引去别处。]');
  else if(p.kind==='abandon'){
   s.exited=true;s.positions.me='街面';
   finish(s,'B',`你提前离开，${c.indoors.map(name).join('、')}仍未与你们会合。`,c.indoors);
  }else if(s.friendsStep===2&&s.flags.meet&&!s.flags.intercepted&&hasAll(s.roster.assembled,c.indoors)&&c.indoors.every(id=>s.people[id].place===meetPlace)){
   if(s.friendsRoute==='south'&&(s.driverRoute!=='south'||s.people.zhou.place!==c.routes.south.parking)){note(s,p.room,'[后院门外的插销需要接应者拉开。先把后院门安排送给车边的人，请对方核验车辆。]');break;}
   s.exited=true;s.chapter=5;s.positions.me=exits[s.friendsRoute];
   s.roster.atExit=[...s.roster.assembled];
   for(const id of s.roster.atExit)placePerson(s,id,s.positions.me);
   tell(s,c.lead,`我在${exits[s.friendsRoute]}又点了一遍。你和${labels(s.roster.atExit)}都出来了，等车边确认。`);
   if(c.type==='pickup'){s.flags.spoof=true;publish(s,'old',c.danger,'临时改在西门上车，快过来。我已经看到车了。');tell(s,c.driver,'刚才有人让你改口？先私聊我，核验车旁情况。');}
   if(c.danger==='zhou')tell(s,c.driver,'我在车边看到老金了。他没拿手机。你来核验，我让他借我的手机回。');
   else if(c.type!=='pickup')tell(s,c.driver,'到外面了就告诉我，来接你们。');
  }else note(s,p.room,'[先确认同伴到了约定地点，并核验门外身份。]');
  break;
 }
 default:return input;
 }
 startInvestigation(s);
 refreshShares(s);
 return s;
}

export function partyObjective(s){
 const c=s.case;
 if(s.ending)return '本次会话已结束';
 if(s.chapter===0)return '打开生日散场群的楼层图，再回一条文字消息。';
 if(s.chapter===1)return evidencePrompt(s);
 if(s.flags.intercepted&&s.flags.leakedRoutes?.east&&s.flags.leakedRoutes?.south)return '两个集合点都暴露了。私聊接收过路线的可疑账号，谎称在西门等，再重发真实安排。';
 if(s.flags.intercepted)return `请${name(c.lead)}结束旧群共享，改走另一条路线，并同步给接应人${name(c.driver)}。`;
 if(s.chapter===2)return `请${name(c.lead)}核实防火门和出口，再把路线分别告诉${name(c.lead)}和接应人${name(c.driver)}。`;
 if(s.chapter===3)return `问${name(c.lead)}走到哪了。${s.shared.old?'先请对方关闭旧群的位置共享。':''}`;
 if(s.chapter===4){
  if(s.threatStep>=2)return '门外有人堵住了。访客码可以先在门内作废。要引开对方，只把假集合点发给这个来电的账号。';
  if(!s.flags.meet)return `请${name(c.lead)}核验门外身份，问一件现场小事。`;
  return `出门与同伴会合，走后院门时先让${name(c.driver)}去外侧接应。`;
 }
 return `和${name(c.driver)}核验车旁情况，确认同一出口，再发「来接我们」。`;
}
export function partySuggestions(s,room){
 if(s.ending)return [];
 const c=s.case, group=members(s,room);
 if(s.chapter===0)return ['收到，我晚一点下来','充电线我再找找'];
 if(s.chapter===1)return ['能说说你亲眼看到什么吗？','能补发原始记录吗？','先别动，我再确认一下。'];
 const choices=[];
 if(s.threatStep>=2&&s.messages.some(m=>m.room===room&&m.value==='party-door')&&room!=='old')choices.push('我在西门等你');
 if(group.includes(c.lead)){
  if(s.chapter===2&&!s.flags.inspected)choices.push('核实现场防火门和出口');
  if(s.shared.old)choices.push('结束旧群共享');
  if(s.chapter>=2&&s.flags.inspected&&(s.chapter===2||s.flags.intercepted||s.chapter===5))choices.push('走东门','改走后院门');
  if(s.chapter===3&&!s.flags.intercepted)choices.push('你们到哪了？','现在可以往会合点走');
  if(s.chapter===4)choices.push(s.flags.meet?'出门会合':'核验身份，刚刚举的是什么？');
 }
 if(group.includes(c.driver)&&s.chapter>=2){
  choices.push('改到东门接','改到后院门接');
  if(s.exited||c.danger==='zhou'&&s.driverRoute==='south')choices.push('核验接应，确认车辆');
  if(s.exited)choices.push('来接我们');
 }
 return [...new Set(choices.length?choices:['收到','能补发原始记录吗？'])];
}
