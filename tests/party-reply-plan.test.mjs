import test from 'node:test';
import assert from 'node:assert/strict';

import {dispatchParty,freshParty,recoverParty,retryParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {partyContext,partyInstruction,stageParty,validPartyContext} from '../game/src/party-dialogue.js';
import {generateNpc} from '../worker/provider.js';
import {checkReplyPlanOutput,replyPlanFallback,validReplyPlan} from '../game/src/party-reply-plan.js';

let serial=0;
const send=(state,room,text,{quoteId=null,label='send'}={})=>dispatchParty(state,{id:`reply-plan-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text,...(quoteId?{quoteId}:{})});
const stagedTurn=(state,text,options={})=>{
 const room=options.room??state.case.danger,startIndex=state.messages.length;
 const next=send(state,room,text,options),staged=stageParty(next,{enabled:true,type:'text',room,startIndex});
 assert.ok(staged.context);
 assert.equal(validPartyContext(staged.context),true);
 return staged;
};
const seedForDanger=who=>{
 for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;
 throw new Error(`missing seed for ${who}`);
};

test('ReplyPlan separates quoted account history from an unverified player allegation',()=>{
 let state=freshParty(0);state.chapter=2;
 state=send(state,state.case.danger,'今晚散场以后我有点饿。',{label:'history-base'});
 const accountLine=state.messages.findLast(message=>message.room===state.case.danger&&message.from===state.case.danger);
 assert.ok(accountLine);

 const quoted=stagedTurn(state,'你刚才这句和现在说的不一样，前后对不上。',{quoteId:accountLine.id,label:'history-quoted'});
 assert.equal(quoted.context.replyPlan.kind,'history_actual');
 assert.equal(quoted.context.replyPlan.claimStatus,'supported');
 assert.deepEqual(quoted.context.replyPlan.sourceIds,[accountLine.id]);
 assert.ok(quoted.context.memories.find(item=>item.id===quoted.context.latestUserId).references.includes(accountLine.id));

 const alleged=stagedTurn(state,'你前面明明说自己已经确认过，现在又改口。',{label:'history-alleged'});
 assert.equal(alleged.context.replyPlan.kind,'history_unverified');
 assert.equal(alleged.context.replyPlan.claimStatus,'unverified');
 assert.deepEqual(alleged.context.replyPlan.sourceIds,[]);

 const bad=checkReplyPlanOutput({text:'我前面确实说过已经确认。',memoryRefs:[]},{plan:alleged.context.replyPlan,accountId:state.case.danger,memories:alleged.context.memories});
 assert.equal(bad.code,'REPLY_PLAN_HISTORY_SOURCE');
});

test('six identities receive distinct response behaviors without changing the locked deception strategy',()=>{
 const behaviors=new Set(),fallbacks=new Set();
 for(const who of ids){
  const state=freshParty(seedForDanger(who));state.chapter=2;
  const staged=stagedTurn(state,'你今天说话很不对劲，你到底是不是本人？',{label:`identity-${who}`});
  assert.equal(staged.context.deception.decision.strategy,'evade_contradiction');
  assert.equal(staged.context.replyPlan.kind,'identity_direct');
  assert.equal(staged.context.replyPlan.speakerStatus,'unverified_account');
  behaviors.add(staged.context.replyPlan.behavior);
  fallbacks.add(replyPlanFallback(who,staged.context.replyPlan));
  assert.doesNotMatch(partyInstruction(staged.context),/你在微信里扮演|你在模仿这个账号/u);
 }
 assert.equal(behaviors.size,6);
 assert.equal(fallbacks.size,6);
});

test('normal friends and compromised accounts share bounded plans but retain different speaker status',()=>{
 let state=freshParty(3);state.chapter=2;
 const intruder=stagedTurn(state,'你说话有点怪，我不太信。',{room:state.case.danger,label:'intruder-status'});
 const friend=ids.find(id=>id!==state.case.danger);
 const normal=stagedTurn(state,'你说话有点怪，我不太信。',{room:friend,label:'friend-status'});
 assert.equal(intruder.context.replyPlan.speakerStatus,'unverified_account');
 assert.equal(normal.context.replyPlan.speakerStatus,'known_friend');
 assert.equal(intruder.context.replyPlan.kind,'general_suspicion');
 assert.equal(normal.context.replyPlan.kind,'general_suspicion');
});

test('ReplyPlan is deterministic across reload and checkpoint replay and cannot be forged in transit',()=>{
 let state=freshParty(7);state.chapter=2;
 const {checkpoints,...snapshot}=state;
 state.checkpoints.push({label:'plan-start',snapshot:structuredClone(snapshot)});
 const first=stagedTurn(state,'你到底是谁？这话不像你。',{label:'stable-first'}).context.replyPlan;
 const loadedContext=partyContext(recoverParty(structuredClone(send(state,state.case.danger,'你到底是谁？这话不像你。',{label:'stable-load'}))),state.case.danger,state.case.danger);
 assert.equal(validReplyPlan(loadedContext.replyPlan),true);

 let replay=retryParty(state,0);
 const replayed=stagedTurn(replay,'你到底是谁？这话不像你。',{label:'stable-replay'}).context.replyPlan;
 assert.deepEqual({...replayed,variation:first.variation},{...first,variation:first.variation});

 const staged=stagedTurn(state,'你到底是不是本人？',{label:'tamper'});
 const forged=structuredClone(staged.context);forged.replyPlan.kind='social';
 assert.equal(validPartyContext(forged),false);
});

test('provider receives the read-only plan in the existing single call and audits its result',async()=>{
 const state=freshParty(11);state.chapter=2;
 const staged=stagedTurn(state,'你前面说已经见过我，现在为什么不承认？',{label:'provider'});
 let calls=0,timing=null;
 const result=await generateNpc(staged.context,{key:'unit-test-only',fetcher:async(_url,request)=>{
  calls++;
  const body=JSON.parse(request.body),payload=JSON.parse(body.messages[1].content);
  assert.equal(payload.replyPlan.kind,'history_unverified');
  assert.deepEqual(payload.replyPlan.sourceIds,[]);
  assert.equal(Object.hasOwn(payload.replyPlan,'text'),false);
  return Response.json({choices:[{message:{content:JSON.stringify({text:'你说账号以前讲过这件事，但当前聊天里对不上。',memoryRefs:[]})}}],usage:{prompt_tokens:100,completion_tokens:16}});
 },onTiming:value=>{timing=value;}});
 assert.equal(calls,1);
 assert.equal(result.mode,'ai');
 assert.equal(Number.isFinite(timing.providerRequestMs),true);
 assert.equal(Number.isFinite(timing.localParseAuditMs),true);
});

test('ReplyPlan accepts source-denial language but blocks account-control claims in indirect suspicion',async()=>{
 let state=freshParty(4);state.chapter=2;
 let staged=stagedTurn(state,'你前面明明说见过我，现在又不认。',{label:'denied-history'});
 assert.equal(staged.context.replyPlan.kind,'history_unverified');
 assert.equal(checkReplyPlanOutput({text:'当前聊天里对不上，我不能把它当成我说过的话。',memoryRefs:[]},{plan:staged.context.replyPlan,accountId:state.case.danger,memories:staged.context.memories}).ok,true);

 staged=stagedTurn(state,'越聊越奇怪，我不太信你。',{label:'indirect-control'});
 assert.equal(staged.context.replyPlan.kind,'general_suspicion');
 assert.equal(checkReplyPlanOutput({text:'这个账号现在回你的就是我。',memoryRefs:[]},{plan:staged.context.replyPlan,accountId:state.case.danger,memories:staged.context.memories}).code,'REPLY_PLAN_IDENTITY_GUARD');

 const privateTurn=stagedTurn(state,'还记得只有咱俩知道的那次吗？',{label:'missing-ref-denial'});
 const result=await generateNpc(privateTurn.context,{key:'unit-test-only',fetcher:async()=>Response.json({
  choices:[{message:{content:JSON.stringify({text:'那次我没有依据能复述，不能靠猜。'})}}],usage:{prompt_tokens:80,completion_tokens:12}
 })});
 assert.equal(result.mode,'ai');
 assert.deepEqual(result.output.memoryRefs,[]);
});
