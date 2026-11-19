import {PARTY_PLAYTEST_BUILD} from './party-story.js';

const key='biefadaoqunli.playtest.local';
const now=()=>new Date().toISOString();
const phases=['正常散场','发现异常','身份核验','路线行动','门外会合','车边接应'];

export function createPlaytest(storage){
 let record=null;
 try{record=JSON.parse(storage.getItem(key));}catch{}
 const persist=()=>{try{storage.setItem(key,JSON.stringify(record));}catch{}};
 function start(state,source='新开局'){
  record={format:1,build:PARTY_PLAYTEST_BUILD,runId:state.runId,seed:state.seed,storyRevision:state.case.revision??1,startedAt:now(),source,phases:[],timeline:[]};
  markPhase(state);
  if(state.ending)record.outcome={at:now(),ending:state.ending,reason:state.reason};
  persist();
 }
 function markPhase(state){
  if(!record.phases.some(mark=>mark.chapter===state.chapter))record.phases.push({at:now(),chapter:state.chapter,name:phases[state.chapter]});
 }
 function attach(state){
  if(record?.runId!==state.runId)start(state,state.flags.welcomed?'从已有进度开始记录':'新开局');
  else if(record.build!==PARTY_PLAYTEST_BUILD){
   const from=record.build??'旧试玩版本';
   record.build=PARTY_PLAYTEST_BUILD;
   mark('切换试玩版本',{from,to:record.build});
  }
 }
 function mark(type,details={}){
  if(!record)return;
  record.timeline.push({at:now(),type,...details});persist();
 }
 function update(before,after){
  attach(after);
  markPhase(after);
  const last=after.events.at(-1);
  if(last&&last.id!==before.events.at(-1)?.id&&last.askedHelp)mark('主动求助',{room:last.room});
  if(before.friendsRoute!==after.friendsRoute)mark('队伍出口',{from:before.friendsRoute,to:after.friendsRoute});
  if(before.driverRoute!==after.driverRoute)mark('车边收到出口',{from:before.driverRoute,to:after.driverRoute});
  for(const node of after.nodes.slice(before.nodes.length)){
   if(node.kind!=='help')mark('关键节点',{description:node.text,...(node.clue?{clue:node.clue,receipt:node.message,source:node.source}:{})});
  }
  if(before.shared.old&&!after.shared.old)mark('结束旧群共享');
  for(const room of Object.keys(before.sharedSelf))if(before.sharedSelf[room]&&!after.sharedSelf[room])mark('结束自己的共享',{room});
  if(before.codeValid&&!after.codeValid)mark('作废访客码');
  if(after.threatStep!==before.threatStep)mark('危险推进',{from:before.threatStep,to:after.threatStep});
  if(after.ending&&before.ending!==after.ending)record.outcome={at:now(),ending:after.ending,reason:after.reason};
  persist();
 }
 return {attach,start,mark,update,report:()=>structuredClone(record)};
}

export function exportPlaytest(record){
 const file=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file);
 const link=document.createElement('a');
 link.download=`生日散场-${record.build}-${record.seed}.json`;
 link.href=url;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
