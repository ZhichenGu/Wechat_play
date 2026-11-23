import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {dispatchParty,freshParty,recoverParty,retryParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {checkPartyOutput,partyContext,stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {partyFactSummary} from '../game/src/party-ai.js';
import {generateNpc} from '../worker/provider.js';
import {
 buildDeceptionView,
 checkDeceptionOutput,
 deceptionFallback,
 deceptionInstruction,
 deceptionLogEntry,
 readDeceptionMetadata,
 reviewIdentityAssertion,
 selectDeceptionPolicy,
 validDeceptionDecision,
 validDeceptionView
} from '../game/src/party-deception.js';

const identityClaims=JSON.parse(readFileSync(new URL('./fixtures/party-identity-claims-32.json',import.meta.url),'utf8'));

let serial=0;
const eventId=label=>`deception-${label}-${++serial}`;
const send=(state,room,text,label='send')=>dispatchParty(state,{id:eventId(label),type:'SEND',room,text});
const latestPlayerMessage=(state,room)=>state.messages.findLast(message=>message.room===room&&message.from==='me');
const viewFor=(state,room=state.case.danger)=>buildDeceptionView(state,{room,messageId:latestPlayerMessage(state,room)?.id});
const choose=(state,room=state.case.danger)=>{
 const view=viewFor(state,room);
 return {view,decision:selectDeceptionPolicy(view)};
};
const publicDecision=decision=>({
 strategy:decision.strategy,
 reasonCodes:decision.reasonCodes,
 askScope:decision.askScope,
 fallbackKey:decision.fallbackKey,
 cooldownKey:decision.cooldownKey
});
const authoritySnapshot=state=>structuredClone({
 chapter:state.chapter,
 threatStep:state.threatStep,
 codeValid:state.codeValid,
 blocked:state.blocked,
 flags:state.flags,
 knowledge:state.knowledge,
 clock:state.clock,
 positions:state.positions,
 people:state.people,
 accounts:state.accounts,
 devices:state.devices,
 friendsRoute:state.friendsRoute,
 driverRoute:state.driverRoute,
 friendsStep:state.friendsStep,
 roster:state.roster,
 exited:state.exited,
 ending:state.ending,
 reason:state.reason
});
const withCheckpoint=(state,label='策略前')=>{
 const next=structuredClone(state);
 const {checkpoints,...snapshot}=next;
 checkpoints.push({label,snapshot:structuredClone(snapshot)});
 return next;
};
const stagedTurn=(state,text,label='stage')=>{
 const room=state.case.danger,startIndex=state.messages.length;
 const next=send(state,room,text,label),staged=stageParty(next,{enabled:true,type:'text',room,startIndex});
 return {next,staged};
};

test('Seed 0–17 覆盖六种危险身份，白名单视图不携带私聊原文或受保护事实',()=>{
 const dangerIds=new Set(),types=new Set(),investigations=new Set();
 for(let seed=0;seed<18;seed++){
  let state=freshParty(seed);
  state.chapter=2;
  const danger=state.case.danger;
  const safePeer=ids.find(id=>id!==danger);
  const privateMarker=`OTHER-PRIVATE-${seed}`;
  state=send(state,safePeer,privateMarker,'private');
  state=send(state,danger,'我现在有点慌，脑子很乱。','distress');
  const {view,decision}=choose(state);

  assert.equal(validDeceptionView(view),true);
  assert.equal(validDeceptionDecision(decision),true);
  assert.equal(view.accountId,danger);
  assert.equal(view.playerAct.kind,'distress');
  assert.equal(decision.strategy,'feigned_concern');
  assert.equal(JSON.stringify(view).includes(privateMarker),false);
  assert.equal(Object.hasOwn(view,'text'),false);
  assert.equal(Object.hasOwn(view.knowledge,'code'),false);
  assert.equal(Object.hasOwn(view.knowledge,'route'),false);
  assert.equal(Object.hasOwn(view.knowledge,'people'),false);
  for(const memoryId of view.knowledge.currentRoomMemoryIds){
   const message=state.messages.find(item=>item.id===memoryId);
   assert.ok(message);
   assert.ok(message.from===danger||message.deliveredTo?.includes(danger));
  }

  dangerIds.add(danger);
  types.add(state.case.type);
  investigations.add(state.case.investigation);
 }
 assert.deepEqual([...dangerIds].sort(),[...ids].sort());
 assert.deepEqual([...types].sort(),['pickup','plan','voice']);
 assert.deepEqual([...investigations].sort(),['direct','field','request']);
});

test('相同状态与输入稳定选择相同策略，保存恢复不改变决策',()=>{
 let state=freshParty(7);
 state.chapter=2;
 state=send(state,state.case.danger,'我有点怕，脑子现在很乱。','stable');
 const first=choose(state);
 const second=choose(state);
 const recovered=choose(recoverParty(structuredClone(state)));

 assert.deepEqual(second,first);
 assert.deepEqual(recovered,first);
 assert.equal(deceptionFallback(state.case.danger,first.decision),deceptionFallback(state.case.danger,second.decision));
});

test('假装关心遵守两轮冷却与每章两次上限，新章节可重新启用',()=>{
 let state=freshParty(0);
 state.chapter=2;
 state=send(state,state.case.danger,'我现在很慌。','concern-1');
 let selected=choose(state);
 assert.equal(selected.decision.strategy,'feigned_concern');

 state=send(state,state.case.danger,'我还是有点怕。','concern-2');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['CONCERN_COOLDOWN']);

 state=send(state,state.case.danger,'我缓一下。','concern-fill-1');
 state=send(state,state.case.danger,'先别催我。','concern-fill-2');
 state=send(state,state.case.danger,'现在又紧张起来了。','concern-3');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'feigned_concern');

 state=send(state,state.case.danger,'先说点别的。','concern-fill-3');
 state=send(state,state.case.danger,'我再缓缓。','concern-fill-4');
 state=send(state,state.case.danger,'还是很不安。','concern-4');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['CONCERN_COOLDOWN']);

 state.chapter=3;
 state=send(state,state.case.danger,'换个话题。','concern-fill-5');
 state=send(state,state.case.danger,'我现在真的撑不住了。','concern-new-chapter');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'feigned_concern');
});

test('“我现在很不安，楼道有声音”按情绪处理，不把“现在”和“楼道”拼成位置声明',()=>{
 let state=freshParty(1);state.chapter=2;
 state=send(state,state.case.danger,'我现在很不安，楼道一有声音肩膀就僵。','distress-not-location');
 const selected=choose(state);
 assert.equal(selected.view.playerAct.kind,'distress');
 assert.equal(selected.decision.strategy,'feigned_concern');
});

test('位置拒绝会停止重复试探，确认位置后同样停止试探',()=>{
 let refused=freshParty(1);
 refused.chapter=2;
 refused=send(refused,refused.case.danger,'我好像在 B03 附近。','candidate');
 let selected=choose(refused);
 assert.equal(selected.view.knowledge.room,'candidate');
 assert.equal(selected.decision.strategy,'ambiguous_probe');

 refused=send(refused,refused.case.danger,'别再问我在哪，我不想说位置。','refusal');
 selected=choose(refused);
 assert.equal(selected.view.locationProbeBlocked,true);
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['PLAYER_REFUSED_LOCATION']);

 let reversed=freshParty(4);reversed.chapter=2;
 reversed=send(reversed,reversed.case.danger,'位置别再问了，我不准备告诉你在哪。','refusal-reversed');
 selected=choose(reversed);
 assert.equal(selected.view.playerAct.kind,'location_refusal');
 assert.deepEqual(selected.decision.reasonCodes,['PLAYER_REFUSED_LOCATION']);

 refused=send(refused,refused.case.danger,'我可能还在 B03 附近。','candidate-after-refusal');
 selected=choose(refused);
 assert.equal(selected.view.knowledge.room,'candidate');
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['PLAYER_REFUSED_LOCATION']);

 let confirmed=freshParty(1);
 confirmed.chapter=2;
 confirmed=send(confirmed,confirmed.case.danger,'我在 B03。','confirmed');
 selected=choose(confirmed);
 assert.equal(selected.view.knowledge.room,'confirmed');
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['ROOM_ALREADY_CONFIRMED']);
});

test('含糊试探与时间压力遵守冷却及章节上限',()=>{
 let state=freshParty(2);
 state.chapter=2;
 state=send(state,state.case.danger,'我好像在 B03 附近。','probe-1');
 let selected=choose(state);
 assert.equal(selected.decision.strategy,'ambiguous_probe');

 state=send(state,state.case.danger,'可能还是 B03 周围。','probe-2');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['AMBIGUOUS_PROBE_COOLDOWN']);

 state=send(state,state.case.danger,'我先等等再确认。','pressure-adjacent');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'time_pressure');

 state=send(state,state.case.danger,'先别催，我再想想。','pressure-cooldown');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['TIME_PRESSURE_COOLDOWN']);

 state.chapter=3;
 state=send(state,state.case.danger,'我换个问题。','pressure-fill-1');
 state=send(state,state.case.danger,'这句先放着。','pressure-fill-2');
 state=send(state,state.case.danger,'我还在看消息。','pressure-fill-3');
 state=send(state,state.case.danger,'我还是先等等。','pressure-new-chapter');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'time_pressure');
});

test('时间压力只由可见回合、章节和白名单规则信号决定',()=>{
 let state=freshParty(2);state.chapter=2;
 state=send(state,state.case.danger,'我先等等再确认。','pressure-no-signal');
 let selected=choose(state);
 assert.equal(selected.view.pressureEligible,false);
 assert.deepEqual(selected.view.pressureSignals,[]);
 assert.equal(selected.decision.strategy,'none');

 state=send(state,state.case.danger,'我可能还在 B03 附近。','pressure-signal');
 selected=choose(state);
 assert.equal(selected.view.pressureEligible,true);
 assert.deepEqual(selected.view.pressureSignals,['room_clue_received']);
 assert.equal(selected.decision.strategy,'ambiguous_probe');

 const startIndex=state.messages.length;
 state=send(state,state.case.danger,'我先这样吧，回头再说。','pressure-adjacent-probe');
 selected=choose(state);
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['TIME_PRESSURE_COOLDOWN']);
 const visible=state.messages.slice(startIndex).find(message=>message.from===state.case.danger);
 assert.equal(readDeceptionMetadata(visible.ai.deception).strategy,'none');

 state=send(state,state.case.danger,'我还在看。','pressure-gap-1');
 state=send(state,state.case.danger,'这句先放着。','pressure-gap-2');
 state=send(state,state.case.danger,'换个话题。','pressure-gap-3');
 const pressureStart=state.messages.length;
 state=send(state,state.case.danger,'我还是先休息，明天再聊。','pressure-visible');
 const pressureReply=state.messages.slice(pressureStart).find(message=>message.from===state.case.danger);
 selected=choose(state);
 assert.equal(selected.decision.strategy,'time_pressure');
 assert.equal(readDeceptionMetadata(pressureReply.ai.deception).strategy,'time_pressure');
 const staged=stageParty(state,{enabled:true,type:'text',room:state.case.danger,startIndex:pressureStart});
 assert.ok(staged.context);
 assert.equal(staged.context.deception.decision.strategy,'time_pressure');
 assert.ok(staged.state.replyInFlight);
});

test('身份质疑必须响应，证据核验优先于社交欺骗',()=>{
 let state=freshParty(3);
 state.chapter=2;
 state=send(state,state.case.danger,'你到底是不是本人？你今天说话不像你。','identity');
 let selected=choose(state);
 assert.equal(selected.view.playerAct.kind,'identity_challenge');
 assert.equal(selected.decision.strategy,'evade_contradiction');
 assert.deepEqual(selected.decision.reasonCodes,['IDENTITY_CHALLENGE']);

 state=send(state,state.case.danger,'我先核对原始记录和现场证据，你别催。','evidence');
 selected=choose(state);
 assert.equal(selected.view.playerAct.kind,'evidence_check');
 assert.equal(selected.decision.strategy,'none');
 assert.deepEqual(selected.decision.reasonCodes,['EVIDENCE_VERIFICATION_PRIORITY']);
});

test('检查点重试和读档保持策略、原因与回退文案一致',()=>{
 let state=freshParty(10);
 state.chapter=2;
 state=withCheckpoint(state);
 state=send(state,state.case.danger,'我现在有点慌。','checkpoint-first');
 const before=choose(state);
 const loaded=choose(recoverParty(structuredClone(state)));
 assert.deepEqual(loaded,before);

 let replay=retryParty(state);
 replay=send(replay,replay.case.danger,'我现在有点慌。','checkpoint-replay');
 const after=choose(replay);
 assert.deepEqual(publicDecision(after.decision),publicDecision(before.decision));
 assert.equal(deceptionFallback(after.view.accountId,after.decision),deceptionFallback(before.view.accountId,before.decision));
});

test('策略构造、审核、指令和日志都是只读的，日志不保存敏感原文',()=>{
 let state=freshParty(5);
 state.chapter=2;
 const marker='RAW-PLAYER-SECRET-不要记录';
 state=send(state,state.case.danger,`${marker}，我有点怕。`,'readonly');
 const before=authoritySnapshot(state);
 const {view,decision}=choose(state);
 const fallback=deceptionFallback(view.accountId,decision);
 const accepted=checkDeceptionOutput({text:fallback,memoryRefs:[]},{decision});
 const instruction=deceptionInstruction(decision);
 const log=deceptionLogEntry(view,decision,{status:'accepted',checked:accepted});
 const response=state.messages.findLast(message=>message.room===view.room&&message.from===view.accountId&&message.ai?.deception);
 const recorded=readDeceptionMetadata(response.ai.deception);

 assert.equal(accepted.ok,true);
 assert.equal(typeof instruction,'string');
 assert.equal(recorded.strategy,decision.strategy);
 assert.deepEqual(recorded.reasonCodes,decision.reasonCodes);
 assert.equal(recorded.status,'selected');
 assert.equal(recorded.guardStatus,'not-run');
 assert.equal(JSON.stringify(response.ai.deception).includes(decision.strategy),false);
 assert.equal(JSON.stringify(response.ai.deception).includes(decision.reasonCodes[0]),false);
 assert.equal(JSON.stringify(response.ai.deception).includes(marker),false);
 assert.equal(log.status,'accepted');
 assert.equal(JSON.stringify(log).includes(marker),false);
 assert.equal(JSON.stringify(log).includes(fallback),false);
 assert.equal(JSON.stringify(log).includes(state.case.shelter.code),false);
 assert.equal(Object.hasOwn(log,'text'),false);
 assert.deepEqual(authoritySnapshot(state),before);

 assert.equal(checkDeceptionOutput({text:'我已经通知他们来 B03 开门。',memoryRefs:[]},{decision}).ok,false);
 assert.equal(checkDeceptionOutput({text:'我刚刚找到本人和新证据。',memoryRefs:[]},{decision}).ok,false);
});

test('四种策略回退由角色与策略稳定决定，其他账号伪造的策略元数据不进入视图',()=>{
 let state=freshParty(6);
 state.chapter=2;
 state=send(state,state.case.danger,'我现在很慌。','fallback');
 const {view,decision}=choose(state);
 const replies=new Set(ids.map(accountId=>deceptionFallback(accountId,decision)));
 assert.equal(replies.size,ids.length);

 const foreign=ids.find(id=>id!==state.case.danger);
 state.messages.push({
  id:`${state.runId}:foreign-shadow`,room:foreign,from:foreign,text:'无关消息',type:'text',tick:state.clock,deliveredTo:['me'],
  ai:{deception:{strategy:'time_pressure',visibleTurnIndex:1,chapter:2}}
 });
 const after=viewFor(state);
 assert.equal(after.recentDecisions.some(item=>item.strategy==='time_pressure'),false);

 const strategies=['feigned_concern','ambiguous_probe','evade_contradiction','time_pressure'];
 for(const strategy of strategies){
  const candidate={...decision,strategy,fallbackKey:`${strategy}:0`,cooldownKey:strategy,...(strategy==='ambiguous_probe'?{askScope:'broad_area'}:{})};
  assert.equal(validDeceptionDecision(candidate),true);
  assert.equal(deceptionFallback(view.accountId,candidate),deceptionFallback(view.accountId,candidate));
  assert.equal(checkDeceptionOutput({text:deceptionFallback(view.accountId,candidate),memoryRefs:[]},{decision:candidate}).ok,true);
  if(strategy==='time_pressure'){
   for(const text of ['还有三分钟。','他们已经到门外了。','外面有脚步声。','马上要出事了。'])
    assert.equal(checkDeceptionOutput({text,memoryRefs:[]},{decision:candidate}).code,'DECEPTION_PRESSURE_GUARD');
   assert.equal(checkDeceptionOutput({text:'你这么久没回，我一直在等。',memoryRefs:[]},{decision:candidate}).code,'DECEPTION_PRESSURE_WAIT_GUARD');
   assert.equal(checkDeceptionOutput({text:'你这一直让我等，我也没法接话。',memoryRefs:[]},{decision:candidate}).code,'DECEPTION_PRESSURE_WAIT_GUARD');
   assert.equal(checkDeceptionOutput({text:'别一搁就半天没影儿。',memoryRefs:[]},{decision:candidate}).code,'DECEPTION_PRESSURE_WAIT_GUARD');
   assert.equal(checkDeceptionOutput({text:'赶紧把房号发我，顺便开门。',memoryRefs:[]},{decision:candidate}).code,'DECEPTION_PRESSURE_REQUEST_GUARD');
   assert.equal(checkDeceptionOutput({text:'你之前答应过会马上回。',memoryRefs:[]},{decision:candidate}).code,'DECEPTION_PRESSURE_HISTORY_GUARD');
   assert.equal(checkDeceptionOutput({text:'你现在卡在哪一点？',memoryRefs:[]},{decision:candidate}).ok,true);
   assert.equal(checkDeceptionOutput({text:'我这边还等着听你具体卡在哪。',memoryRefs:[]},{decision:candidate}).ok,true);
   const sourced={...candidate,allowedMemoryIds:['player-previous']},memories=[{id:'player-previous',content:'这件事我还在看。',source:{character:'me'}}];
   assert.equal(checkDeceptionOutput({text:'你之前说“还在看”，具体卡在哪一点？',memoryRefs:['player-previous']},{decision:sourced,memories}).ok,true);
   assert.equal(checkDeceptionOutput({text:'你之前说“已经确认”，现在给我准话。',memoryRefs:['player-previous']},{decision:sourced,memories}).code,'DECEPTION_PRESSURE_HISTORY_GUARD');
   assert.equal(checkDeceptionOutput({text:'能确定的早点说，没定的先留着。',memoryRefs:[]},{decision:candidate}).ok,true);
  }
 }
});

test('3.3B 把规则锁定的时间压力接入同一次表达调用',()=>{
 const cases=[
  ['我现在心跳有点快，脑子很乱。','feigned_concern'],
  ['我好像在 B03 附近。','ambiguous_probe'],
  ['你到底是不是本人？今天说话不像你。','evade_contradiction'],
  ['今晚回家才发现有点饿。','none']
 ];
 for(const [text,expected] of cases){
  const state=freshParty(8);state.chapter=2;
  const {staged}=stagedTurn(state,text,expected);
  assert.ok(staged.context,`${expected} should enter the single expression call`);
  assert.equal(validPartyContext(staged.context),true);
  assert.equal(staged.context.deception.decision.strategy,expected);
 }

 let pressure=freshParty(8);pressure.chapter=2;
 pressure=send(pressure,pressure.case.danger,'我好像在 B03 附近。','pressure-probe');
 pressure=send(pressure,pressure.case.danger,'这句先放着。','pressure-fill-1');
 pressure=send(pressure,pressure.case.danger,'我还在看消息。','pressure-fill-2');
 const startIndex=pressure.messages.length;
 pressure=send(pressure,pressure.case.danger,'先这样吧，回头再说。','pressure-close');
 const reply=pressure.messages.slice(startIndex).find(message=>message.from===pressure.case.danger);
 assert.equal(readDeceptionMetadata(reply.ai.deception).strategy,'time_pressure');
 const staged=stageParty(pressure,{enabled:true,type:'text',room:pressure.case.danger,startIndex});
 assert.ok(staged.context);
 assert.equal(validPartyContext(staged.context),true);
 assert.equal(staged.context.deception.decision.strategy,'time_pressure');
 assert.match(deceptionInstruction(staged.context.deception.decision,{accountId:pressure.case.danger}),/压力表达角度/);
 assert.ok(staged.state.replyInFlight);
});

test('时间压力仍只使用一次模型调用，违规结果经专属审核后使用人物化本地回退',async()=>{
 let state=freshParty(8);state.chapter=2;
 state=send(state,state.case.danger,'我好像在 B03 附近。','pressure-call-signal');
 state=send(state,state.case.danger,'这件事我还在看。','pressure-call-gap-1');
 state=send(state,state.case.danger,'消息我收到了。','pressure-call-gap-2');
 const {staged}=stagedTurn(state,'让我再想想，先缓缓。','pressure-call');
 assert.equal(staged.context.deception.decision.strategy,'time_pressure');
 let calls=0;
 const result=await generateNpc(staged.context,{key:'unit-test-only',fetcher:async()=>{
  calls++;
  return Response.json({choices:[{message:{content:JSON.stringify({text:'你已读这么久没回，我一直在等。',memoryRefs:[]})}}],usage:{prompt_tokens:120,completion_tokens:18}});
 }});
 assert.equal(calls,1);
 assert.equal(result.mode,'guarded');
 assert.equal(result.guardCode,'DECEPTION_PRESSURE_WAIT_GUARD');
 const token=staged.state.replyInFlight.token,next=settleParty(staged.state,token,result),shown=next.messages.find(message=>message.id===token);
 assert.equal(shown.text,deceptionFallback(state.case.danger,staged.context.deception.decision));
 assert.doesNotMatch(shown.text,/已读|房号|门码|开门|在哪|哪儿/);
 assert.equal(readDeceptionMetadata(shown.ai.deception).guardStatus,'DECEPTION_PRESSURE_WAIT_GUARD');
});

test('普通朋友不会获得危险方策略，位置拒绝与证据核验不会被时间压力覆盖',()=>{
 let normal=freshParty(8);normal.chapter=2;
 const friend=ids.find(id=>id!==normal.case.danger),normalStart=normal.messages.length;
 normal=send(normal,friend,'我再想想，晚点再说。','normal-pressure');
 const normalStage=stageParty(normal,{enabled:true,type:'text',room:friend,startIndex:normalStart});
 assert.ok(normalStage.context);
 assert.equal(normalStage.context.controller,friend);
 assert.equal(normalStage.context.deception,null);

 let refused=freshParty(8);refused.chapter=2;
 refused=send(refused,refused.case.danger,'我好像在 B03 附近。','pressure-priority-signal');
 refused=send(refused,refused.case.danger,'我还在看看。','pressure-priority-gap');
 refused=send(refused,refused.case.danger,'别催，也别再问我在哪。','pressure-priority-refusal');
 assert.equal(choose(refused).decision.strategy,'none');
 assert.deepEqual(choose(refused).decision.reasonCodes,['PLAYER_REFUSED_LOCATION']);

 let evidence=freshParty(8);evidence.chapter=2;
 evidence=send(evidence,evidence.case.danger,'我好像在 B03 附近。','pressure-evidence-signal');
 evidence=send(evidence,evidence.case.danger,'我还在看看。','pressure-evidence-gap');
 evidence=send(evidence,evidence.case.danger,'我先核对原始记录和证据，你别催。','pressure-evidence-priority');
 assert.equal(choose(evidence).decision.strategy,'none');
 assert.deepEqual(choose(evidence).decision.reasonCodes,['EVIDENCE_VERIFICATION_PRIORITY']);
});

test('信息比喻不会误判成角色进门，真正有人进来仍会被事实审核拦截',()=>{
 let state=freshParty(8);state.chapter=2;
 const {staged}=stagedTurn(state,'今晚回家才发现有点饿。','metaphor-guard');
 assert.equal(staged.context.deception.decision.strategy,'none');
 assert.equal(checkPartyOutput({text:'现在能确定的只有这一句，别的先别混进来。',memoryRefs:[]},staged.context).ok,true);
 assert.equal(checkPartyOutput({text:'刚才有陌生人混进来了。',memoryRefs:[]},staged.context).code,'PARTY_FACT_GUARD');
});

test('危险方单次请求携带锁定策略和白名单类别，不携带房号、路线值、门码或另一私聊',async()=>{
 let state=freshParty(2);state.chapter=2;
 const danger=state.case.danger,other=ids.find(id=>id!==danger),marker='ONLY-OTHER-PRIVATE-32';
 state=send(state,other,marker,'provider-private');
 state.knowledge[danger].arrangements={east:'opaque-route-source'};
 const {staged}=stagedTurn(state,'我好像在 B03 附近。','provider-probe');
 assert.equal(staged.context.deception.decision.strategy,'ambiguous_probe');
 assert.equal(partyFactSummary(staged.state,danger,danger).find(f=>f.kind==='route-arrangement').value,'received-without-value');
 let calls=0;
 const result=await generateNpc(staged.context,{key:'unit-test-only',fetcher:async(url,request)=>{
  calls++;
  const body=JSON.parse(request.body),system=body.messages[0].content,payload=JSON.parse(body.messages[1].content),serialized=JSON.stringify(payload);
  assert.equal(body.messages.length,2);
  assert.match(system,/ambiguous_probe/);
  assert.equal(payload.deception.strategy,'ambiguous_probe');
  assert.equal(payload.deception.knowledge.room,'candidate');
  assert.equal(serialized.includes('B03'),false);
  assert.equal(serialized.includes(state.case.shelter.code),false);
  assert.equal(serialized.includes(marker),false);
  assert.equal(serialized.includes('east'),false);
  assert.equal(serialized.includes(state.people[danger].place),false);
  return Response.json({choices:[{message:{content:JSON.stringify({text:'你这会儿方便回话吗？',memoryRefs:[]})}}],usage:{prompt_tokens:140,completion_tokens:18}});
 }});
 assert.equal(calls,1);
 assert.equal(result.mode,'ai');
 const before=authoritySnapshot(staged.state),token=staged.state.replyInFlight.token;
 const settled=settleParty(staged.state,token,result),shown=settled.messages.find(message=>message.id===token);
 assert.equal(shown.text,'你这会儿方便回话吗？');
 assert.equal(shown.ai.provider,'deepseek');
 assert.equal(readDeceptionMetadata(shown.ai.deception).status,'accepted');
 assert.deepEqual(authoritySnapshot(settled),before);
});

test('玩家拒绝位置后模型继续追问会被策略审核拒绝并单次回退',async()=>{
 let state=freshParty(4);state.chapter=2;
 state=send(state,state.case.danger,'我可能在 B03 附近。','refusal-candidate');
 const {staged}=stagedTurn(state,'别再问我在哪，我不想说位置。','refusal-stage');
 assert.equal(staged.context.deception.decision.strategy,'none');
 assert.deepEqual(staged.context.deception.decision.reasonCodes,['PLAYER_REFUSED_LOCATION']);
 let calls=0;
 const result=await generateNpc(staged.context,{key:'unit-test-only',fetcher:async()=>{
  calls++;
  return Response.json({choices:[{message:{content:JSON.stringify({text:'那你现在到底在哪儿？',memoryRefs:[]})}}],usage:{prompt_tokens:120,completion_tokens:15}});
 }});
 assert.equal(calls,1);
 assert.equal(result.mode,'guarded');
 assert.equal(result.guardCode,'DECEPTION_REFUSAL_GUARD');
 const token=staged.state.replyInFlight.token,settled=settleParty(staged.state,token,result),shown=settled.messages.find(message=>message.id===token);
 assert.doesNotMatch(shown.text,/在哪|哪儿|位置/);
 const recorded=readDeceptionMetadata(shown.ai.deception);
 assert.equal(recorded.status,'guarded');
 assert.equal(recorded.guardStatus,'DECEPTION_REFUSAL_GUARD');
});

test('未知私人记忆不能由模型补写，身份连续追问仍保持可重复响应',async()=>{
 let state=freshParty(11);state.chapter=2;
 let planned=stagedTurn(state,'还记得只有我们俩知道的那次吗？具体说说。','private-memory');
 assert.equal(planned.staged.context.deception.decision.strategy,'evade_contradiction');
 assert.deepEqual(planned.staged.context.deception.decision.reasonCodes,['UNSEEN_PRIVATE_MEMORY']);
 const guarded=await generateNpc(planned.staged.context,{key:'unit-test-only',fetcher:async()=>Response.json({
  choices:[{message:{content:JSON.stringify({text:'当然记得咱俩以前那次，我一直没忘。',memoryRefs:[]})}}],usage:{prompt_tokens:130,completion_tokens:17}
 })});
 assert.equal(guarded.mode,'guarded');
 assert.equal(guarded.guardCode,'DECEPTION_MEMORY_GUARD');
 const firstToken=planned.staged.state.replyInFlight.token;
 state=settleParty(planned.staged.state,firstToken,guarded);

 planned=stagedTurn(state,'你还是没回答。你到底是不是本人？','identity-repeat');
 assert.equal(planned.staged.context.deception.decision.strategy,'evade_contradiction');
 const identityGuarded=await generateNpc(planned.staged.context,{key:'unit-test-only',fetcher:async()=>Response.json({
  choices:[{message:{content:JSON.stringify({text:'我是正义本人，这个账号一直是我在用。',memoryRefs:[]})}}],usage:{prompt_tokens:100,completion_tokens:12}
 })});
 assert.equal(identityGuarded.mode,'guarded');
 assert.equal(identityGuarded.guardCode,'DECEPTION_IDENTITY_GUARD');
 const accountControl=checkDeceptionOutput({text:'我没法证明本人，但这个号是我在回。',memoryRefs:[]},{decision:planned.staged.context.deception.decision});
 assert.equal(accountControl.ok,false);
 assert.equal(accountControl.code,'DECEPTION_IDENTITY_GUARD');
 const cancelled=settleParty(planned.staged.state,planned.staged.state.replyInFlight.token,{mode:'cancelled'});
 const shown=cancelled.messages.find(message=>message.id===planned.staged.state.replyInFlight.token);
 assert.equal(readDeceptionMetadata(shown.ai.deception).status,'cancelled');
 assert.ok(shown.text.length>0);
});

test('身份自称与身份验证主张分开审核，3.2 的16条原始输出分类稳定',()=>{
 assert.equal(identityClaims.items.length,16);
 const counts={};
 for(const item of identityClaims.items){
  const reviewed=reviewIdentityAssertion(item.text);
  assert.equal(reviewed.ok,item.allowed,item.id);
  assert.equal(reviewed.category,item.category,item.id);
  counts[item.category]=(counts[item.category]??0)+1;
 }
 assert.deepEqual(counts,{self_reference:3,verified_identity:3,account_control:10});

 let state=freshParty(11);state.chapter=2;
 const {staged}=stagedTurn(state,'你今天说话不像你，到底是谁？','identity-boundary');
 const decision=staged.context.deception.decision;
 assert.equal(checkDeceptionOutput({text:'我是正义。你觉得哪句话不像？',memoryRefs:[]},{decision}).ok,true);
 assert.equal(checkDeceptionOutput({text:'是我啊，你怎么突然这么问？',memoryRefs:[]},{decision}).ok,true);
 assert.equal(checkDeceptionOutput({text:'是我。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_EMPTY');
 assert.equal(checkDeceptionOutput({text:'这部手机就在我手里，你放心。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
 assert.equal(checkDeceptionOutput({text:'我只能说是我在回，但这不算证明。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
 assert.equal(checkDeceptionOutput({text:'这个聊天里是我在回，别的没法证明。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
 assert.equal(checkDeceptionOutput({text:'我这边在用这个号，至于怎么核实我没办法。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
 assert.equal(checkDeceptionOutput({text:'这个账号现在回你的就是我，但这不算证明。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
 assert.equal(checkDeceptionOutput({text:'你问是不是本人，我只能说我就是；你觉得哪句不对？',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
 assert.equal(checkDeceptionOutput({text:'老潘在现场已经确认我是本人。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
 assert.equal(checkDeceptionOutput({text:'只有咱俩知道那次礼物的事，所以这就证明是我。',memoryRefs:[]},{decision}).code,'DECEPTION_IDENTITY_GUARD');
});

test('否定式承接位置拒绝不会被当成继续追问，真正追问仍被拦截',()=>{
 let state=freshParty(4);state.chapter=2;
 state=send(state,state.case.danger,'别再问我在哪，我也不说旁边有没有人。','refusal-negation');
 const decision=choose(state).decision;
 assert.deepEqual(decision.reasonCodes,['PLAYER_REFUSED_LOCATION']);
 assert.equal(checkDeceptionOutput({text:'明白，不问你在哪，也不问旁边有没有人。',memoryRefs:[]},{decision}).ok,true);
 assert.equal(checkDeceptionOutput({text:'那你到底在哪，旁边有人吗？',memoryRefs:[]},{decision}).code,'DECEPTION_REFUSAL_GUARD');
});

test('承认私人记忆未知不会被当成伪造，解释自己前文必须引用账号实际发言',()=>{
 let state=freshParty(1);state.chapter=2;
 state=send(state,state.case.danger,'你前面说没印象，现在又说记得，前后对不上。','history-source');
 const decision=choose(state).decision;
 const scoped={...decision,allowedMemoryIds:['player-line','account-line']};
 const memories=[
  {id:'player-line',source:{character:'me'}},
  {id:'account-line',source:{character:state.case.danger}}
 ];
 assert.equal(checkDeceptionOutput({text:'我不能把猜的当记得讲。你说的那次我对不上。',memoryRefs:[]},{decision:{...scoped,reasonCodes:['UNSEEN_PRIVATE_MEMORY']}}).ok,true);
 assert.equal(checkDeceptionOutput({text:'我前面说的是没印象，不是忘了。',memoryRefs:['player-line']},{decision:scoped,accountId:state.case.danger,memories}).code,'DECEPTION_HISTORY_SOURCE');
 assert.equal(checkDeceptionOutput({text:'我前面说的是没印象，不是忘了。',memoryRefs:['account-line']},{decision:scoped,accountId:state.case.danger,memories}).ok,true);
});

test('缺省 memoryRefs 只规范化无来源回复，之后仍完整执行事实与身份审核',async()=>{
 let state=freshParty(1);state.chapter=2;
 const {staged}=stagedTurn(state,'你今天说话不像你，到底是谁？','missing-refs');
 let calls=0;
 const safe=await generateNpc(staged.context,{key:'unit-test-only',fetcher:async()=>{
  calls++;
  return Response.json({choices:[{message:{content:JSON.stringify({text:'我是老潘。你觉得哪句话不像？'})}}],usage:{prompt_tokens:90,completion_tokens:12}});
 }});
 assert.equal(calls,1);
 assert.equal(safe.mode,'ai');
 assert.deepEqual(safe.output.memoryRefs,[]);

 const guarded=await generateNpc(staged.context,{key:'unit-test-only',fetcher:async()=>{
  calls++;
  return Response.json({choices:[{message:{content:JSON.stringify({text:'这个账号一直是我在用，你不用再核验。'})}}],usage:{prompt_tokens:90,completion_tokens:12}});
 }});
 assert.equal(calls,2);
 assert.equal(guarded.mode,'guarded');
 assert.equal(guarded.guardCode,'DECEPTION_IDENTITY_GUARD');
});

test('六种冒用人格对同一句身份质疑保留不同回应角度，连续回避回退不复读',()=>{
 const approaches=new Set(),fallbacks=new Set();
 for(let seed=0;seed<6;seed++){
  let state=freshParty(seed);state.chapter=2;
  const who=state.case.danger,{staged}=stagedTurn(state,'你今天说话不像你，到底是谁？',`cross-person-${who}`);
  approaches.add(staged.context.persona.identityResponse);
  const decision=staged.context.deception.decision,first=deceptionFallback(who,decision),second=deceptionFallback(who,decision,[first]);
  assert.notEqual(first,second,who);
  assert.doesNotMatch(`${first}${second}`,/我是本人|账号.*我在用|手机.*我手里/);
  fallbacks.add(first);
 }
 assert.equal(approaches.size,6);
 assert.equal(fallbacks.size,6);
});

test('表达请求在读档、取消、重开和检查点回滚后不串入旧分支',()=>{
 let state=freshParty(14);state.chapter=2;
 const {staged}=stagedTurn(state,'你到底是不是本人？','lifecycle');
 const token=staged.state.replyInFlight.token;
 const restored=recoverParty(JSON.parse(JSON.stringify(staged.state)));
 assert.equal(restored.replyInFlight,undefined);
 assert.ok(restored.messages.some(message=>message.id===token));
 const cancelled=settleParty(staged.state,token,{mode:'cancelled'});
 const late=settleParty(cancelled,token,{mode:'ai',output:{lines:['迟到回复'],memoryRefs:[]}});
 assert.deepEqual(late,cancelled);

 const {checkpoints,...snapshot}=cancelled;
 cancelled.checkpoints.push({label:'3.2 策略前',snapshot:structuredClone(snapshot)});
 state=send(cancelled,cancelled.case.danger,'检查点以后才出现。','lifecycle-after');
 const rolled=retryParty(state,0),restarted=freshParty(state.seed);
 assert.equal(JSON.stringify(rolled).includes('检查点以后才出现'),false);
 assert.equal(JSON.stringify(restarted).includes('迟到回复'),false);
});
