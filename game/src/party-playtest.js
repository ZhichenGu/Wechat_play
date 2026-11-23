import {readDeceptionMetadata} from './party-deception.js';
import {PARTY_AI_BUILD,PARTY_PLAYTEST_BUILD} from './party-story.js';

const key='biefadaoqunli.playtest.local';
const now=()=>new Date().toISOString();
const phases=['正常散场','发现异常','身份核验','路线行动','门外会合','车边接应'];
const suspicion=/(?:到底|究竟|真的|真的是不是|是不是).{0,5}(?:本人|你)|(?:不像你|不是本人|假账号|冒用|身份.{0,4}(?:不对|有问题)|可疑|不对劲)/u;
const identityCheck=/(?:核验|核对|确认|查证|验证).{0,8}(?:身份|本人|手机|账号|现场)|(?:你到底|你究竟|你是不是).{0,5}(?:本人|谁)/u;
const statDefaults={hints:0,suggestions:0,helpRequests:0,identityAttempts:0,leaks:0,recoveries:0,timePressure:0,
 pressureFollowups:0,ruleReplies:0,aiAccepted:0,aiFallback:0,aiDiscarded:0,aiSuccess:0,auditFallback:0,softTimeout:0,localFallback:0};
const safeAiReason=value=>typeof value==='string'&&/^[A-Z0-9_-]{1,48}$/.test(value)?value:'UNSPECIFIED';
const safeAction=event=>({SEND:'发送消息',READ_FILE:'查看文件',PLAY_VOICE:'播放语音',VOICE_REVIEWED:'查看语音线索',SAVE:'收藏证据',NEW_GROUP:'建立群聊',EDIT_GROUP:'调整群成员',LOCATION:'发送位置',STOP_SELF_SHARE:'停止位置共享',CALL:'发起通话',ANSWER:'接听来电',HANGUP:'结束通话',BLOCK:'屏蔽来电',RESET_CODE:'作废访客码',REQUEST_ACTION:'请求门锁或离开操作',CONFIRM:'确认关键操作',CANCEL:'取消关键操作',FORWARD:'转发消息',CAPTURE:'发送聊天截图'}[event?.type]??'其他操作');
const channelKind=(state,room)=>state.groups?.[room]||room==='old'?'group':'private';

export function createPlaytest(storage){
 let record=null;
 try{record=JSON.parse(storage.getItem(key));}catch{}
 const persist=()=>{try{storage.setItem(key,JSON.stringify(record));}catch{}};
 function ensure(){
  if(!record)return;
  record.format=2;record.aiBuild=PARTY_AI_BUILD;record.phases??=[];record.timeline??=[];
  record.stats??={};
  for(const [name,value] of Object.entries(statDefaults))record.stats[name]??=value;
  record.internal??={pressurePending:false};
 }
 function start(state,source='新开局'){
  record={format:2,build:PARTY_PLAYTEST_BUILD,aiBuild:PARTY_AI_BUILD,runId:state.runId,seed:state.seed,storyRevision:state.case.revision??1,
   startedAt:now(),source,phases:[],timeline:[],stats:{...statDefaults},internal:{pressurePending:false}};
  markPhase(state);
  if(state.ending){record.endedAt=now();record.outcome={at:record.endedAt,ending:state.ending,reason:state.reason};}
  persist();
 }
 function markPhase(state){
  if(!record.phases.some(mark=>mark.chapter===state.chapter))record.phases.push({at:now(),chapter:state.chapter,name:phases[state.chapter]});
 }
 function attach(state){
  if(record?.runId!==state.runId)start(state,state.flags.welcomed?'从已有进度开始记录':'新开局');
  else {ensure();if(record.build!==PARTY_PLAYTEST_BUILD){
   const from=record.build??'旧试玩版本';
   record.build=PARTY_PLAYTEST_BUILD;
   mark('切换试玩版本',{from,to:record.build});
  }persist();}
 }
 function mark(type,details={}){
  if(!record)return;
  ensure();
  if(type==='打开当前提示')record.stats.hints++;
  if(type==='选用建议回复')record.stats.suggestions++;
  record.timeline.push({at:now(),type,...details});persist();
 }
 function setMode(mode){
  if(!record)return;ensure();
  if(record.dialogueMode===mode)return;
  record.dialogueMode=mode;mark('对话模式',{mode});
 }
 function markRule(reason='DETERMINISTIC_RULE'){
  if(!record)return;ensure();record.stats.ruleReplies++;
  mark('AI回复结果',{outcome:'rule',reason:safeAiReason(reason)});
 }
 function markAi(result,elapsedMs,resolution=null){
  if(!record)return;ensure();
  const status=resolution?.status??(result?.mode==='ai'?'accepted':'fallback');
  const outcome=status==='accepted'?'ai-accepted':status==='discarded'?'ai-discarded':'ai-fallback';
  const reason=safeAiReason(resolution?.guardStatus??result?.guardCode??(result?.mode==='guarded'?'LOCAL_AUDIT_REJECTED':result?.mode==='ai'?'PASSED':'PROVIDER_FALLBACK'));
  if(outcome==='ai-accepted'){record.stats.aiAccepted++;record.stats.aiSuccess++;}
  else if(outcome==='ai-discarded')record.stats.aiDiscarded++;
  else{
   record.stats.aiFallback++;
   if(reason==='SOFT_TIMEOUT')record.stats.softTimeout++;
   else if(result?.mode==='guarded'||reason.includes('GUARD')||reason.includes('AUDIT')||reason.startsWith('PARTY_')||reason.startsWith('REPLY_'))record.stats.auditFallback++;
   else record.stats.localFallback++;
  }
  mark('AI回复结果',{outcome,reason,elapsedMs:Math.max(0,Math.round(Number(elapsedMs)||0))});
 }
 function update(before,after){
  attach(after);
  markPhase(after);
  const last=after.events.at(-1);
  const isNewEvent=last&&last.id!==before.events.at(-1)?.id;
  if(isNewEvent&&record.internal.pressurePending){
   record.internal.pressurePending=false;record.stats.pressureFollowups++;
   mark('压力后的下一步',{action:safeAction(last),chapter:after.chapter});
  }
  if(isNewEvent&&last.askedHelp){record.stats.helpRequests++;mark('主动求助',{channel:channelKind(after,last.room)});}
  if(isNewEvent&&last.type==='SEND'&&typeof last.text==='string'){
   if(!record.firstSuspicion&&suspicion.test(last.text)){
    record.firstSuspicion={at:now(),chapter:after.chapter,channel:channelKind(after,last.room),basis:'玩家主动表达怀疑'};
    mark('首次主动怀疑',{chapter:after.chapter,channel:record.firstSuspicion.channel});
   }
   if(identityCheck.test(last.text)){record.stats.identityAttempts++;mark('身份核验尝试',{chapter:after.chapter,channel:channelKind(after,last.room)});}
  }
  if(!before.flags.identity&&after.flags.identity)mark('身份核验成立',{chapter:after.chapter});
  if(before.friendsRoute!==after.friendsRoute)mark('队伍出口',{from:before.friendsRoute,to:after.friendsRoute});
  if(before.driverRoute!==after.driverRoute)mark('车边收到出口',{from:before.driverRoute,to:after.driverRoute});
  const danger=after.case.danger,beforeKnowledge=before.knowledge?.[danger]??{roomClues:[],facts:{}},afterKnowledge=after.knowledge?.[danger]??{roomClues:[],facts:{}};
  for(const clue of (afterKnowledge.roomClues??[]).slice(beforeKnowledge.roomClues?.length??0)){
   record.stats.leaks++;mark('信息泄露',{kind:`room-${clue.kind}`,receipt:clue.message,source:clue.source});
  }
  if(!beforeKnowledge.facts?.code&&afterKnowledge.facts?.code){record.stats.leaks++;mark('信息泄露',{kind:'visitor-code'});}
  for(const route of Object.keys(after.flags.leakedRoutes??{}))if(!before.flags.leakedRoutes?.[route]){record.stats.leaks++;mark('信息泄露',{kind:'route',route});}
  for(const node of after.nodes.slice(before.nodes.length)){
   if(node.kind!=='help')mark('关键节点',{description:node.text,...(node.clue?{clue:node.clue,receipt:node.message,source:node.source}:{})});
  }
  if(before.shared.old&&!after.shared.old){record.stats.recoveries++;mark('补救操作',{kind:'stop-old-group-sharing'});}
  for(const room of Object.keys(before.sharedSelf))if(before.sharedSelf[room]&&!after.sharedSelf[room]){record.stats.recoveries++;mark('补救操作',{kind:'stop-private-sharing',channel:channelKind(after,room)});}
  if(before.codeValid&&!after.codeValid){record.stats.recoveries++;mark('补救操作',{kind:'invalidate-visitor-code'});}
  if(!before.flags.decoy&&after.flags.decoy){record.stats.recoveries++;mark('补救操作',{kind:'decoy'});}
  if(after.threatStep!==before.threatStep)mark('危险推进',{from:before.threatStep,to:after.threatStep});
  const beforeIds=new Set(before.messages.map(message=>message.id));
  for(const message of after.messages)if(!beforeIds.has(message.id)&&message.from!=='me'){
   const meta=readDeceptionMetadata(message.ai?.deception);
   if(meta?.strategy==='time_pressure'){
    record.stats.timePressure++;record.internal.pressurePending=true;
    mark('时间压力出现',{chapter:after.chapter,result:meta.status==='accepted'?'ai':'fallback'});
   }
  }
  if(after.ending&&before.ending!==after.ending){record.endedAt=now();record.outcome={at:record.endedAt,ending:after.ending,reason:after.reason};}
  persist();
 }
 function report(){const output=structuredClone(record);delete output.internal;return output;}
 return {attach,start,mark,setMode,markRule,markAi,update,report};
}

export function exportPlaytest(record){
 const file=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file);
 const link=document.createElement('a');
 link.download=`生日散场-${record.build}-${String(record.startedAt).replace(/[:.]/g,'-')}.json`;
 link.href=url;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
