import test from 'node:test';
import assert from 'node:assert/strict';

import {dispatchParty,freshParty,recoverParty,retryParty} from '../game/src/party-engine.js';
import {stageParty,settleParty} from '../game/src/party-dialogue.js';
import {DEFAULT_REPLY_HARD_TIMEOUT_MS,DEFAULT_REPLY_SOFT_TIMEOUT_MS,replyTimeoutConfig,startReplyRequest} from '../game/src/reply-timeout.js';

class ManualTimers{
 constructor(){this.now=0;this.nextId=1;this.tasks=new Map();}
 setTimeout(fn,delay){const id=this.nextId++;this.tasks.set(id,{id,at:this.now+delay,fn});return id;}
 clearTimeout(id){this.tasks.delete(id);}
 async advanceTo(target){
  while(true){
   const task=[...this.tasks.values()].filter(item=>item.at<=target).sort((a,b)=>a.at-b.at||a.id-b.id)[0];
   if(!task)break;
   this.tasks.delete(task.id);this.now=task.at;task.fn();
   await Promise.resolve();await Promise.resolve();await Promise.resolve();
  }
  this.now=target;await Promise.resolve();await Promise.resolve();
 }
}

const delayedReply=(clock,delay,counter)=>signal=>new Promise(resolve=>{
 counter.calls++;
 const timer=clock.setTimeout(()=>resolve({mode:'ai',output:{lines:['模型回复'],memoryRefs:[]}}),delay);
 signal.addEventListener('abort',()=>{clock.clearTimeout(timer);resolve({mode:'fallback',reason:'aborted'});},{once:true});
});

async function controlled(delay,config={softMs:6000,hardMs:17000}){
 const clock=new ManualTimers(),counter={calls:0};
 const operation=startReplyRequest(delayedReply(clock,delay,counter),{...config,timers:clock,now:()=>clock.now});
 await clock.advanceTo(Math.min(delay,config.softMs));
 const visible=await operation.visible;
 if(delay>clock.now)await clock.advanceTo(Math.min(delay,config.hardMs));
 const done=await operation.done;
 return {clock,counter,operation,visible,done};
}

test('默认软硬超时固定且配置只接受有效边界',()=>{
 assert.deepEqual(replyTimeoutConfig({}),{softMs:DEFAULT_REPLY_SOFT_TIMEOUT_MS,hardMs:DEFAULT_REPLY_HARD_TIMEOUT_MS});
 assert.deepEqual(replyTimeoutConfig({softMs:5500,hardMs:17000}),{softMs:5500,hardMs:17000});
 assert.deepEqual(replyTimeoutConfig({softMs:18000,hardMs:17000}),{softMs:6000,hardMs:17000});
});

test('100ms、800ms、2s、5s 在软超时前显示模型结果',async()=>{
 for(const delay of [100,800,2000,5000]){
  const run=await controlled(delay);
  assert.equal(run.counter.calls,1);
  assert.equal(run.visible.type,'result',`${delay}ms`);
  assert.equal(run.visible.result.mode,'ai');
  assert.equal(run.done.late,false);
 }
});

test('软超时边界接受已完成结果，边界后只显示一次本地回退',async()=>{
 for(const [delay,expected] of [[5999,'result'],[6000,'result'],[6001,'soft-timeout']]){
  const run=await controlled(delay);
  assert.equal(run.visible.type,expected,`${delay}ms`);
  assert.equal(run.counter.calls,1);
  if(delay>6000){assert.equal(run.visible.result.guardCode,'SOFT_TIMEOUT');assert.equal(run.done.late,true);}
 }
});

test('8s、14s、17s 的合法迟到结果不会替换软超时回退',async()=>{
 for(const delay of [8000,14000,17000]){
  const run=await controlled(delay);
  assert.equal(run.visible.type,'soft-timeout',`${delay}ms`);
  assert.equal(run.visible.result.mode,'fallback');
  assert.equal(run.done.type,'result');
  assert.equal(run.done.result.mode,'ai');
  assert.equal(run.done.late,true);
  assert.equal(run.counter.calls,1);
 }
});

test('17s 硬边界终止仍未完成的后台请求',async()=>{
 const clock=new ManualTimers(),counter={calls:0};
 const operation=startReplyRequest(delayedReply(clock,18000,counter),{softMs:6000,hardMs:17000,timers:clock,now:()=>clock.now});
 await clock.advanceTo(6000);
 assert.equal((await operation.visible).type,'soft-timeout');
 await clock.advanceTo(17000);
 const done=await operation.done;
 assert.equal(operation.controller.signal.aborted,true);
 assert.equal(done.result.mode,'fallback');
 assert.equal(done.hardTimedOut,true);
 assert.equal(counter.calls,1);
});

const authority=state=>JSON.stringify({chapter:state.chapter,threatStep:state.threatStep,clock:state.clock,flags:state.flags,knowledge:state.knowledge,
 positions:state.positions,people:state.people,friendsRoute:state.friendsRoute,driverRoute:state.driverRoute,friendsStep:state.friendsStep,ending:state.ending});
let serial=0;
const send=(state,room,text)=>dispatchParty(state,{id:`timeout-${++serial}`,runId:state.runId,type:'SEND',room,text});
const stagedTurn=(state,room,text)=>{const startIndex=state.messages.length,next=send(state,room,text),staged=stageParty(next,{enabled:true,type:'text',room,startIndex});assert.ok(staged.context);return staged;};

test('软超时、迟到结果、切换聊天和快速连发都只落一条有序回复',()=>{
 let state=freshParty(3);state.chapter=2;
 const first=stagedTurn(state,state.case.danger,'今晚有点累。'),firstToken=first.state.replyInFlight.token,before=authority(first.state);
 state=settleParty(first.state,firstToken,{mode:'fallback',guardCode:'SOFT_TIMEOUT'});
 assert.equal(authority(state),before);
 assert.equal(state.messages.filter(message=>message.id===firstToken).length,1);
 const afterLate=settleParty(state,firstToken,{mode:'ai',output:{lines:['迟到回复'],memoryRefs:[]}});
 assert.equal(afterLate,state);
 assert.equal(state.messages.some(message=>message.text==='迟到回复'),false);

 const other=Object.keys(state.accounts).find(id=>id!==state.case.danger);
 const second=stagedTurn(state,other,'第二条我还在听。'),secondToken=second.state.replyInFlight.token;
 const settled=settleParty(second.state,secondToken,{mode:'fallback',guardCode:'SOFT_TIMEOUT'});
 const ordered=settled.messages.filter(message=>[firstToken,secondToken].includes(message.id)).map(message=>message.id);
 assert.deepEqual(ordered,[firstToken,secondToken]);
 assert.equal(settled.messages.filter(message=>message.id===secondToken).length,1);
});

test('取消、读档、重开和检查点回滚会使旧结果失效且不推进危险',()=>{
 let state=freshParty(7);state.chapter=2;
 const {checkpoints,...snapshot}=state;state.checkpoints.push({label:'等待前',snapshot:structuredClone(snapshot)});
 const staged=stagedTurn(state,state.case.danger,'今天有点困。'),token=staged.state.replyInFlight.token,before=authority(staged.state);

 const loaded=recoverParty(structuredClone(staged.state));
 assert.equal(loaded.replyInFlight,undefined);
 assert.equal(loaded.messages.filter(message=>message.id===token).length,1);
 assert.equal(authority(loaded),before);
 assert.equal(settleParty(loaded,token,{mode:'ai',output:{lines:['旧读档结果'],memoryRefs:[]}}),loaded);

 const replay=retryParty(staged.state,0);
 assert.notEqual(replay.runId,staged.state.runId);
 assert.equal(replay.replyInFlight,undefined);
 assert.equal(replay.threatStep,state.checkpoints[0].snapshot.threatStep);

 const restarted=freshParty(state.seed);
 assert.notEqual(restarted.runId,staged.state.runId);
 assert.equal(settleParty(restarted,token,{mode:'ai',output:{lines:['旧开局结果'],memoryRefs:[]}}),restarted);
});
