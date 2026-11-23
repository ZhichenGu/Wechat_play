import test from 'node:test';
import assert from 'node:assert/strict';
import {freshParty,dispatchParty,retryParty,recoverParty,partyObjective,partySuggestions} from '../game/src/party-engine.js';
import {ids,makeCase,validateCase} from '../game/src/party-story.js';
import {partyContext,stageParty,settleParty} from '../game/src/party-dialogue.js';
import {createPlaytest} from '../game/src/party-playtest.js';
import {generateNpc} from '../worker/provider.js';
import {intentContext,partyFactSummary,checkIntentOutput,reviewCandidateIntents,shouldInterpret,validatedCandidateIntents} from '../game/src/party-ai.js';

const names={lan:'老潘',lin:'春哥',zhou:'老金',wei:'小卫',rui:'席瑞',yi:'正义'};

function run(seed){
 let s=freshParty(seed),i=0;
 const event=(type,fields={})=>s=dispatchParty(s,{id:String(++i),runId:s.runId,type,...fields});
 const send=(room,text,extra)=>event('SEND',{room,text,...extra});
 const read=value=>event('READ_FILE',{value});
 const c=s.case;
 const prove=()=>{
  assert.equal(s.knowledge[c.danger].facts.room,undefined);
  read('map');send('old','收到，充电线我再找找');
  if(c.type==='voice'){event('PLAY_VOICE',{value:'party-original'});event('PLAY_VOICE',{value:'party-copy'});}
  else {read('repair');read('false');}
  if(c.investigation==='request'){
   assert.ok(!s.messages.some(m=>m.value==='record'));
   send(c.lead,'能补发原始记录吗？');assert.ok(!s.messages.some(m=>m.value==='record'));
   send(c.source,'能补发原始记录吗？');
  }
  if(c.investigation==='field'){
   assert.ok(!s.messages.some(m=>m.value==='record'));
   send(c.source,'能补发原始记录吗？');assert.ok(!s.messages.some(m=>m.value==='record'));
   send(c.lead,'能核实一下现场吗？');assert.ok(s.flags.firstWitness);
   assert.ok(s.messages.some(m=>m.room===c.source&&m.from===c.lead&&m.deliveredTo.includes(c.source)));
  }
  read('record');send(c.lead,'请核验本人');assert.equal(s.chapter,2);
  send(c.lead,'核实现场防火门和出口');assert.ok(s.flags.inspected);
 };
 const move=(route='东门',{sync=true,stop=true}={})=>{
  if(stop&&s.shared.old)send(c.lead,'结束旧群共享');
  if(sync)send(c.driver,'改到'+route+'接');
  send(c.lead,'走'+route);
 };
 const meet=()=>{while(s.friendsStep<2){const step=s.friendsStep;send(c.lead,'继续走');assert.ok(s.friendsStep>step||s.ending);if(s.ending)return;}
  send(c.lead,'核验身份，说件现场小事');assert.ok(s.flags.meet);
  send(c.lead,'出门会合');assert.equal(s.pending.kind,'leave');event('CONFIRM');assert.ok(s.exited);
 };
 const board=()=>{send(c.driver,'核验接应，确认车辆');send(c.driver,'来接我们');};
 return {get state(){return s},event,send,read,prove,move,meet,board,c};
}

for(let seed=0;seed<18;seed++){
 test(`seed ${seed} (${makeCase(seed).danger}) reaches A through either exit with fixed replies`,()=>{
 for(const exit of ['东门','后院门']){
  const r=run(seed);
  r.prove();r.move(exit);
  if(exit==='后院门'&&r.c.danger==='zhou')r.send(r.c.driver,'核验接应，确认车辆');
  r.meet();
  assert.deepEqual(r.state.roster.atExit,r.c.indoors);
  assert.ok(r.state.messages.some(m=>m.from===r.c.lead&&r.c.indoors.filter(id=>id!==r.c.lead).every(id=>m.text.includes(names[id]))));
  r.board();
  assert.equal(r.state.ending,'A');
  assert.equal(r.state.checkpoints.length,2);
  assert.deepEqual(new Set(r.state.roster.boarded),new Set(['me',...ids]));
  for(const id of ids)assert.equal(r.state.people[id].place,'老金的车里');
  if(seed===2){
   assert.equal(r.state.accounts.zhou.controller,'intruder');
   assert.equal(r.state.people.zhou.borrowedDevice,'yi');
   assert.ok(r.state.messages.some(m=>m.actualSpeaker==='zhou'&&m.room==='yi'));
  }
 }
 });
}
test('same seed gives the same coherent initial facts across variants',()=>{
 for(let seed=0;seed<300;seed++){
  const c=makeCase(seed);assert.ok(validateCase(c));assert.deepEqual(c,makeCase(seed));
  assert.equal(c.shelter.knownBy.join(),'me');
 }
 assert.notDeepEqual(makeCase(0),makeCase(6));
});
test('chapter-zero AI expression does not replace or reorder the map-and-message opening trigger',()=>{
 let state=freshParty(0);state.accounts.lan.controller='lan';let serial=0;
 let act=(type,fields={})=>state=dispatchParty(state,{id:`opening-ai-${++serial}`,runId:state.runId,type,...fields});
 const startIndex=state.messages.length;act('SEND',{room:'lan',text:'你好。'});
 assert.equal(state.chapter,0);assert.equal(state.flags.normal,true);
 const staged=stageParty(state,{enabled:true,type:'text',room:'lan',startIndex});
 assert.equal(staged.context.phase,0);
 state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'ai',output:{text:'你好，刚看到。',memoryRefs:[]}});
 assert.equal(state.chapter,0);
 act('READ_FILE',{value:'map'});assert.equal(state.chapter,1);

 state=freshParty(0);state.accounts.lan.controller='lan';serial=0;
 act=(type,fields={})=>state=dispatchParty(state,{id:`opening-map-${++serial}`,runId:state.runId,type,...fields});
 act('READ_FILE',{value:'map'});assert.equal(state.chapter,0);
 const afterMap=state.messages.length;act('SEND',{room:'lan',text:'你还好吗？'});assert.equal(state.chapter,1);
 const stagedAfterMap=stageParty(state,{enabled:true,type:'text',room:'lan',startIndex:afterMap});
 assert.equal(stagedAfterMap.context.phase,1);
 const settled=settleParty(stagedAfterMap.state,stagedAfterMap.state.replyInFlight.token,{mode:'ai',output:{text:'还好，刚看到你的消息。',memoryRefs:[]}});
 assert.equal(settled.chapter,1);
});
test('an opening AI result becomes discarded when another rule event changes its reserved state',()=>{
 let state=freshParty(0);state.accounts.lan.controller='lan';
 const startIndex=state.messages.length;
 state=dispatchParty(state,{id:'opening-pending',runId:state.runId,type:'SEND',room:'lan',text:'你好。'});
 const staged=stageParty(state,{enabled:true,type:'text',room:'lan',startIndex});
 const changed=dispatchParty(staged.state,{id:'opening-map-change',runId:state.runId,type:'READ_FILE',value:'map'});
 const settled=settleParty(changed,staged.state.replyInFlight.token,{mode:'ai',output:{text:'你好，刚看到。',memoryRefs:[]}});
 assert.equal(settled.chapter,1);
 assert.deepEqual(settled.messages.find(message=>message.id===staged.state.replyInFlight.token).ai.resolution,{status:'discarded',guardStatus:'STALE_CONTEXT'});
});
test('group edits deliver only future messages; forwarded and quoted contents keep their receipts',()=>{
 const r=run(0),{danger,lead,driver}=r.c;
 const record=r.state.messages.find(m=>m.value==='handoff');
 r.event('NEW_GROUP',{members:[lead,driver]});const room=r.state.lastGroup;
 r.event('FORWARD',{room,messageId:record.id});
 const first=r.state.messages.find(m=>m.origin?.id===record.id);
 assert.deepEqual(first.deliveredTo,[lead,driver]);
 assert.equal(r.state.knowledge[danger].facts.code,undefined);
 r.event('EDIT_GROUP',{room,name:'安全群',members:[lead,danger]});
 assert.equal(r.state.knowledge[danger].facts.code,undefined);
 r.send(room,'留个记录',{quoteId:record.id});
 assert.equal(r.state.knowledge[danger].facts.code,true);
 assert.equal(r.state.knowledge[danger].facts.room,'B03');
 assert.ok(!r.state.knowledge[danger].receipts.includes(first.id));
 r.event('BLOCK',{room:danger});
 r.event('EDIT_GROUP',{room,name:'改名了',members:[lead,driver]});
 assert.equal(r.state.knowledge[danger].facts.room,'B03');
});
test('a forwarding into the old group leaks the room and code but only approach plus valid code kills',()=>{
 const r=run(1);r.prove();
 r.event('FORWARD',{room:'old',messageId:r.state.messages.find(m=>m.value==='handoff').id});
 assert.equal(r.state.knowledge[r.c.danger].facts.code,true);
 assert.equal(r.state.threatStep,0);
 r.move();assert.equal(r.state.threatStep,1);
 r.send(r.c.lead,'继续走');assert.equal(r.state.threatStep,2);assert.equal(r.state.ending,null);
 r.send(r.c.lead,'继续走');assert.equal(r.state.threatStep,2);
 r.send(r.c.lead,'出门会合');assert.equal(r.state.ending,null);r.event('CONFIRM');assert.equal(r.state.ending,'C');
});
test('invalidating the code retains room knowledge; giving false route can recover and reach A',()=>{
 const r=run(0);r.prove();
 r.event('FORWARD',{room:r.c.danger,messageId:r.state.messages.find(m=>m.value==='handoff').id});
 r.event('RESET_CODE');
 r.move();r.send(r.c.lead,'继续走');r.send(r.c.lead,'继续走');
 assert.equal(r.state.threatStep,2);
 assert.equal(r.state.codeValid,false);
 assert.equal(r.state.knowledge[r.c.danger].facts.room,'B03');
 assert.equal(r.state.ending,null);
 r.send(r.c.danger,'我在西门等你');
 r.meet();r.board();assert.equal(r.state.ending,'A');
});
test('opening requires an exact request and confirmation after approach',()=>{
 const r=run(2);r.prove();
 r.event('LOCATION',{room:r.c.danger,value:'room'});
 r.move();r.send(r.c.lead,'继续走');
 for(const text of ['我不要开门','要不要开门？','他说让我开门','“开门”','开门吗','如果开门会怎样']){
  r.send(r.c.lead,text);assert.equal(r.state.pending,null);assert.equal(r.state.ending,null);
 }
 r.send(r.c.lead,'开门');assert.equal(r.state.pending.kind,'open');
 r.event('CONFIRM');assert.equal(r.state.ending,'C');
});
test('public sharing stalls the route; turning it off retains the last update and a detour can succeed',()=>{
 const r=run(0);r.prove();
 assert.ok(r.state.shared.old);
 r.move('东门',{stop:false});assert.ok(r.state.flags.intercepted);
 const update=r.state.messages.find(m=>m.value==='east'&&m.room==='old');
 assert.ok(update.deliveredTo.includes(r.c.danger));
 r.send(r.c.lead,'结束旧群共享');assert.equal(r.state.shared.old,false);
 r.move('后院门');r.meet();r.board();
 assert.equal(r.state.ending,'A');assert.deepEqual(r.state.messages.find(m=>m.id===update.id),update);
});
test('an exit change is not sent to the driver by claiming it was sent',()=>{
 const r=run(5);r.prove();r.move('东门');r.meet();
 r.send(r.c.lead,'改走后院门');
 r.send(r.c.lead,'我已经告诉老金改走后院门了');
 assert.equal(r.state.driverRoute,'east');assert.equal(r.state.friendsRoute,'south');
 r.board();assert.equal(r.state.ending,'B');assert.ok(r.state.missing.length>0);assert.match(r.state.reason,/东门.*后院门/);
});
test('an explicitly abandoned attempt ends B and names those left behind',()=>{
 const r=run(2);r.event('REQUEST_ACTION',{kind:'abandon'});r.event('CONFIRM');
 assert.equal(r.state.ending,'B');assert.deepEqual(r.state.missing,r.c.indoors);
});
test('round-trip save, checkpoint and duplicate events preserve facts and message history',()=>{
 const r=run(4);r.prove();r.event('LOCATION',{room:r.c.danger,value:'room'});r.move();
 r.send(r.c.lead,'继续走');
 const saved=recoverParty(JSON.parse(JSON.stringify(r.state)));
 assert.deepEqual(saved,r.state);
 const cp=retryParty(saved);
 assert.deepEqual(cp.case,saved.case);
 assert.deepEqual(cp.knowledge,saved.knowledge);
 assert.deepEqual(cp.messages,saved.messages);
 assert.equal(cp.threatStep,2);
 assert.notEqual(cp.runId,saved.runId);
 assert.equal(dispatchParty(cp,{id:'late',runId:saved.runId,type:'RESET_CODE'}),cp);
 assert.equal(dispatchParty(cp,{id:cp.processed[0],type:'RESET_CODE'}),cp);
});
test('model turn sees only one social dialogue and cannot change any locked state',async()=>{
 const r=run(3);r.prove();
 r.send(r.c.source,'我昨天还想喝可乐');
 const startIndex=r.state.messages.length;r.send(r.c.lead,'有点紧张，讲个笑话吧');
 const {state,context}=stageParty(r.state,{enabled:true,type:'text',room:r.c.lead,startIndex});
 assert.ok(context);
 assert.ok(!JSON.stringify(context).includes('可乐'));
 assert.ok(!JSON.stringify(context).includes(r.c.shelter.code));
 assert.ok(partyContext(r.state,r.c.danger,r.c.danger).controller==='intruder');
 const rejected=settleParty(state,state.replyInFlight.token,{mode:'ai',output:{lines:['我已经进门了，你死了。'],memoryRefs:[]}});
 assert.deepEqual(rejected,r.state);
 const ok=settleParty(state,state.replyInFlight.token,{mode:'ai',output:{lines:['我紧张起来就开始数手指。你要数吗？'],memoryRefs:[]}});
 assert.equal(ok.messages.at(-1).ai.provider,'deepseek');
 assert.deepEqual(ok.people,r.state.people);assert.equal(ok.ending,null);
 assert.deepEqual(recoverParty(JSON.parse(JSON.stringify(state))),r.state);
 const revive=retryParty(state);
 assert.equal(settleParty(revive,state.replyInFlight.token,{mode:'ai'}),revive);
 const mock=async(url,req)=>{
  assert.ok(!req.body.includes('可乐'));
  return Response.json({choices:[{message:{content:JSON.stringify({lines:['我在听。'],memoryRefs:[]})}}]});
 };
 const result=await generateNpc(context,{key:'unit-test-only',fetcher:mock});
 assert.equal(result.mode,'ai');
});
test('with the driver account compromised, the backyard latch needs independent curb contact',()=>{
 const r=run(2);r.prove();r.move('后院门');
 r.send(r.c.lead,'继续走');r.send(r.c.lead,'核验身份');
 r.send(r.c.lead,'出门会合');r.event('CONFIRM');
 assert.equal(r.state.exited,false);
 r.send('yi','核验接应，确认车辆');assert.ok(r.state.flags.curbEarly);
 r.meet();r.board();assert.equal(r.state.ending,'A');
 assert.equal(r.state.devices.zhou.holder,'intruder');
 assert.notEqual(r.state.devices.zhou.place,r.state.people.zhou.place);
});
test('rerouting after reaching the meeting point requires a fresh rendezvous',()=>{
 const r=run(1);r.prove();r.move();
 r.send(r.c.lead,'继续走');assert.equal(r.state.chapter,4);
 r.send(r.c.lead,'核验身份');r.move('后院门');
 assert.equal(r.state.chapter,3);assert.equal(r.state.flags.meet,false);
 r.meet();r.board();assert.equal(r.state.ending,'A');
});
test('unshared historical location cannot follow the player after leaving',()=>{
 const r=run(1);r.prove();
 r.event('LOCATION',{room:r.c.danger,value:'area',share:true});
 const marker=r.state.messages.at(-1);
 r.event('STOP_SELF_SHARE',{room:r.c.danger});
 r.move();r.meet();
 assert.deepEqual(r.state.messages.find(m=>m.id===marker.id),marker);
 assert.equal(r.state.knowledge[r.c.danger].facts.room,undefined);
});
test('an in-game screenshot delivers sensitive content from the captured document',()=>{
 const r=run(4);const messageId=r.state.messages.find(m=>m.value==='handoff').id;
 r.event('CAPTURE',{room:r.c.danger,messageId});
 const captured=r.state.messages.find(m=>m.type==='capture');
 assert.equal(captured.origin.id,messageId);
 assert.match(captured.text,new RegExp(r.c.shelter.code));
 assert.deepEqual(r.state.knowledge[r.c.danger].facts,{room:'B03',code:true});
});
test('routing questions, negative references, relay requests and reports do not change underlying facts',()=>{
 const r=run(0);r.prove();r.move();
 const {lead,danger}=r.c;
 const snapshot=r.state;
 for(const text of ['你刚刚说的是哪个门？','我不走东门了，后院可以吗？','先别动，我再确认一下。','你帮我通知老金。','我已经跟他说过了。','要不要开门？','别开门，我还没确认。']){
  r.send(lead,text);
  assert.equal(r.state.messages.at(-1).room,lead);
  assert.equal(r.state.friendsRoute,snapshot.friendsRoute);
  assert.equal(r.state.driverRoute,snapshot.driverRoute);
  assert.equal(r.state.clock,snapshot.clock);assert.equal(r.state.pending,null);
 }
 r.send(danger,'我没说我在 B03，你怎么知道的？');
 r.send(danger,'我不走东门了，后院可以吗？');
 assert.equal(r.state.knowledge[danger].facts.room,undefined);
 assert.equal(r.state.flags.leakedRoutes,undefined);
 assert.ok(r.state.messages.some(m=>m.text.includes('我没有替你发')));
 r.send(lead,'我改走后院门');assert.equal(r.state.friendsRoute,'south');
 assert.equal(r.state.driverRoute,'east');
});
test('initial requests give no account name away and each account rotates across the three clues',()=>{
 for(const [index,id] of [0,1,2,3,4,5].map(n=>[n,makeCase(n).danger])){
  const decks=[index,index+6,index+12].map(seed=>makeCase(seed));
  assert.deepEqual(new Set(decks.map(c=>c.danger)),new Set([id]));
  assert.deepEqual(new Set(decks.map(c=>c.type)),new Set(['voice','plan','pickup']));
  assert.deepEqual(new Set(decks.map(c=>c.investigation)),new Set(['direct','request','field']));
  for(const c of decks){
   const r=run(c.seed);
   assert.ok(!r.state.messages.some(m=>m.type==='voice'));
   r.read('map');r.send('old','收到');
   assert.ok(!partyObjective(r.state).includes(names[id]));
   assert.deepEqual(partySuggestions(r.state,c.danger),partySuggestions(r.state,c.lead));
  }
 }
});
test('A requires actual corroborated people on both sides, not only a matching exit',()=>{
 const r=run(2);r.prove();r.move();r.meet();r.send('yi','核验接应，确认车辆');
 const broken=structuredClone(r.state);
 const stillInside=r.c.indoors.at(-1);
 broken.people[stillInside].place='二楼茶水间';
 const next=dispatchParty(broken,{id:'missing_at_exit',type:'SEND',room:'yi',text:'来接我们'});
 assert.equal(next.ending,null);assert.equal(next.people[stillInside].place,'二楼茶水间');
 r.send('yi','来接我们');assert.equal(r.state.ending,'A');
});
test('a read-only question, repeated route and extra continue after actual arrival never add pressure',()=>{
 const r=run(0);r.prove();
 r.event('FORWARD',{room:r.c.danger,messageId:r.state.messages.find(m=>m.value==='handoff').id});
 r.move();assert.equal(r.state.threatStep,1);
 r.send(r.c.lead,'走东门');r.send(r.c.lead,'你们走到哪了？');r.read('map');
 assert.equal(r.state.threatStep,1);
 r.send(r.c.lead,'现在可以往会合点走');
 assert.equal(r.state.threatStep,2);
 for(let i=0;i<3;i++)r.send(r.c.lead,'继续走');
 assert.equal(r.state.threatStep,2);assert.equal(r.state.ending,null);
});
test('guard rejects unsupported delivery, arrival and actions; reply goes stale on quiet state changes',async()=>{
 const r=run(0);r.prove();
 const startIndex=r.state.messages.length;r.send(r.c.lead,'有点紧张，讲个笑话吧');
 const {state,context}=stageParty(r.state,{enabled:true,type:'text',room:r.c.lead,startIndex});
 for(const line of ['我已经通知老金了。','我帮你发给他。','我刚刚到达了。','我已经打开了。']){
  const output={lines:[line],memoryRefs:[]};
  const mock=async()=>Response.json({choices:[{message:{content:JSON.stringify(output)}}]});
  assert.equal((await generateNpc(context,{key:'unit-test-only',fetcher:mock})).mode,'guarded');
  assert.deepEqual(settleParty(state,state.replyInFlight.token,{mode:'ai',output}).messages.at(-1).ai.resolution,{status:'fallback',guardStatus:'PARTY_FACT_GUARD'});
 }
 const changed=dispatchParty(state,{id:'quiet-change',type:'READ_FILE',value:'map'});
 assert.equal(changed.seq,state.seq);
 const after=settleParty(changed,state.replyInFlight.token,{mode:'ai',output:{lines:['我在听。'],memoryRefs:[]}});
 assert.deepEqual(after.messages.at(-1).ai.resolution,{status:'discarded',guardStatus:'STALE_CONTEXT'});
});
test('local playtest record measures phases and captures decisions without copying conversation text',()=>{
 const memory=new Map();
 const storage={getItem:id=>memory.get(id),setItem:(id,value)=>memory.set(id,value)};
 let tracking=createPlaytest(storage);
 const r=run(0);
 tracking.attach(r.state);
 const apply=fn=>{const before=r.state;fn();tracking.update(before,r.state);};
 apply(()=>r.read('map'));apply(()=>r.send('old','苹果派是只在聊天中的字'));
 tracking.mark('打开当前提示',{chapter:r.state.chapter});
 apply(()=>r.send(r.c.lead,'我该怎么办？'));
 apply(()=>r.event('REQUEST_ACTION',{kind:'abandon'}));apply(()=>r.event('CONFIRM'));
 tracking=createPlaytest(storage);tracking.attach(r.state);
 const log=tracking.report();
 assert.equal(log.seed,0);assert.equal(log.storyRevision,2);assert.equal(log.outcome.ending,'B');
 assert.ok(Date.parse(log.startedAt));assert.deepEqual(log.phases.map(x=>x.chapter),[0,1]);
 assert.ok(log.timeline.some(x=>x.type==='打开当前提示'));
 assert.ok(log.timeline.some(x=>x.type==='主动求助'));
 assert.ok(!JSON.stringify(log).includes('苹果派'));
});
test('PT-03 records AI outcomes, identity checks, leaks, pressure follow-ups and ending without raw chat',()=>{
 const memory=new Map();
 const storage={getItem:id=>memory.get(id),setItem:(id,value)=>memory.set(id,value)};
 const tracking=createPlaytest(storage);
 let state=freshParty(0),i=0;
 tracking.attach(state);tracking.setMode('api-configured');
 tracking.mark('打开当前提示',{chapter:state.chapter});tracking.mark('选用建议回复',{chapter:state.chapter});
 tracking.markRule();
 tracking.markAi({mode:'ai'},842);tracking.markAi({mode:'guarded'},901);
 tracking.markAi({mode:'fallback',guardCode:'SOFT_TIMEOUT'},6000);tracking.markAi({mode:'fallback'},33);
 tracking.markAi({mode:'ai'},410,{status:'discarded',guardStatus:'STATE_CHANGED'});
 const apply=event=>{const before=state;state=dispatchParty(state,{id:`pt-${++i}`,runId:state.runId,...event});tracking.update(before,state);};
 apply({type:'SEND',room:state.case.danger,text:'你到底是不是本人？这是不应导出的玩家原文。'});
 apply({type:'SEND',room:state.case.danger,text:'我在 B03。这也是不应导出的玩家原文。'});
 const beforePressure=state;
 state=structuredClone(state);
 state.messages.push({id:'pt-pressure',room:state.case.danger,from:state.case.danger,text:'不应导出的模型原文',type:'text',tick:state.clock,
  deliveredTo:['me'],ai:{deception:{strategy:'time_pressure',reasonCodes:['PRESSURE_ELIGIBLE'],visibleTurnIndex:5,chapter:state.chapter,status:'accepted',guardStatus:'passed'}}});
 tracking.update(beforePressure,state);
 apply({type:'SEND',room:state.case.lead,text:'先别动，我再确认一下。'});
 apply({type:'RESET_CODE'});
 apply({type:'REQUEST_ACTION',kind:'abandon'});apply({type:'CONFIRM'});
 const log=tracking.report(),raw=JSON.stringify(log);
 assert.equal(log.format,2);assert.equal(log.build,'PT-03');assert.equal(log.aiBuild,'3.3B.1');assert.equal(log.dialogueMode,'api-configured');
 assert.equal(log.stats.hints,1);assert.equal(log.stats.suggestions,1);assert.equal(log.stats.identityAttempts,1);
 assert.equal(log.stats.leaks,1);assert.equal(log.stats.recoveries,1);assert.equal(log.stats.timePressure,1);assert.equal(log.stats.pressureFollowups,1);
 assert.deepEqual([log.stats.aiSuccess,log.stats.auditFallback,log.stats.softTimeout,log.stats.localFallback],[1,1,1,1]);
 assert.deepEqual([log.stats.ruleReplies,log.stats.aiAccepted,log.stats.aiFallback,log.stats.aiDiscarded],[1,1,3,1]);
 assert.deepEqual(new Set(log.timeline.filter(entry=>entry.type==='AI回复结果').map(entry=>entry.outcome)),new Set(['rule','ai-accepted','ai-fallback','ai-discarded']));
 assert.equal(log.outcome.ending,'B');assert.ok(Date.parse(log.endedAt));assert.ok(log.firstSuspicion);
 assert.ok(log.timeline.some(entry=>entry.type==='压力后的下一步'&&entry.action==='发送消息'));
 assert.ok(!Object.hasOwn(log,'internal'));
 for(const text of ['不应导出的玩家原文','不应导出的模型原文','time_pressure'])assert.ok(!raw.includes(text));
});
test('public follow-up does not cause a character to repeat a private exit or location',()=>{
 const r=run(0);r.prove();r.move();
 r.send('old','你刚刚说的是哪个门？');
 assert.match(r.state.messages.at(-1).text,/单独核对/);
 assert.doesNotMatch(r.state.messages.at(-1).text,/东门/);
 r.send('old','你们到哪了？');
 assert.doesNotMatch(r.state.messages.at(-1).text,/后场|B03/);
 assert.ok(!r.state.flags.leakedRoutes?.east);
});

test('B03 clues retain actual receipts and cannot advance danger until explicitly confirmed',()=>{
 const r=run(0),{danger,lead}=r.c;
 const received=()=>r.state.knowledge[danger];
 const sent=()=>r.state.messages.findLast(m=>m.from==='me');
 for(const text of ['我没说我在 B03，你怎么知道的？','别来 B03。','你觉得我在 B03 吗？','我在 B03 附近。']){
  r.send(danger,text);
  assert.equal(sent().text,text);
  assert.deepEqual(received().roomClues.at(-1),{kind:'candidate',message:sent().id,source:sent().id});
  assert.ok(received().receipts.includes(sent().id));
  assert.equal(received().facts.room,undefined);
 }
 r.send(danger,'席瑞说「他在 B03」。');
 assert.equal(received().roomClues.at(-1).kind,'reported');
 const count=received().roomClues.length;
 r.send(lead,'我在 B03。');
 assert.equal(r.state.knowledge[lead].facts.room,'B03');
 assert.equal(received().roomClues.length,count);
 assert.equal(received().facts.room,undefined);
 r.prove();r.move();
 assert.equal(r.state.threatStep,0);
 r.send(danger,'我在 B03。');
 const confirmation=sent();
 assert.equal(received().facts.room,'B03');
 assert.equal(r.state.threatStep,0);
 r.send(danger,'我没说我在 B03，你怎么知道的？');
 assert.match(r.state.messages.at(-1).text,/从这个聊天看到/);
 assert.equal(received().roomClues.find(x=>x.kind==='confirmed').source,confirmation.id);
 r.send(lead,'继续走');
 assert.equal(r.state.threatStep,1);
});

test('quoting someone else links the new delivery to the original private message as hearsay',()=>{
 const s=freshParty(0);
 const original={id:'npc-observation',room:'rui',from:'rui',text:'有人说你在 B03。',type:'text',tick:0,deliveredTo:['rui']};
 s.messages.push(original);
 s.knowledge.rui.receipts.push(original.id);
 const next=dispatchParty(s,{id:'quote',type:'SEND',room:'lin',text:'你见到他了吗？',quoteId:original.id});
 const quoted=next.messages.findLast(m=>m.from==='me');
 assert.equal(quoted.quotedContent,original.text);
 assert.deepEqual(next.knowledge.lin.roomClues,[{kind:'reported',message:quoted.id,source:original.id}]);
 assert.equal(next.knowledge.lin.facts.room,undefined);
 assert.ok(!next.knowledge.lin.receipts.includes(original.id));
 const reloaded=recoverParty(JSON.parse(JSON.stringify(next)));
 assert.deepEqual(reloaded.knowledge.lin.roomClues,next.knowledge.lin.roomClues);
});

test('privacy guidance depends on what the group actually received, not the hidden identity',()=>{
 const r=run(0),{danger,lead,source}=r.c;
 const ask=(room,text)=>{r.send(room,text);return r.state.messages.at(-1).text;};
 r.event('NEW_GROUP',{members:[lead,danger]});const mixed=r.state.lastGroup;
 r.event('NEW_GROUP',{members:[lead,source]});const other=r.state.lastGroup;
 for(const text of ['你刚刚说的是哪个门？','你们到哪了？','能补发原始记录吗？','能核实一下现场吗？']){
  assert.equal(ask(mixed,text),ask(other,text));
 }
 r.prove();r.move();
 assert.match(ask(other,'你刚刚说的是哪个门？'),/单独核对/);
 assert.match(ask(mixed,'你刚刚说的是哪个门？'),/单独核对/);
 assert.equal(r.state.flags.leakedRoutes,undefined);
 const own=r.state.messages.find(m=>m.value==='handoff');
 for(const action of [
  ()=>r.send(mixed,'别来 B03。'),
  ()=>r.event('LOCATION',{room:mixed,value:'room'}),
  ()=>r.event('FORWARD',{room:mixed,messageId:own.id}),
  ()=>r.send(mixed,'这个先别转',{quoteId:own.id}),
  ()=>r.event('CAPTURE',{room:mixed,messageId:own.id})
 ]){
  action();
  const sent=r.state.messages.findLast(m=>m.from==='me');
  ask(mixed,'你们到哪了？');
  assert.ok(r.state.knowledge[danger].receipts.includes(sent.id));
  assert.ok(sent.deliveredTo.includes(danger));
 }
 assert.equal(r.state.knowledge[danger].facts.room,'B03');
 assert.equal(r.state.knowledge[danger].facts.code,true);
 const confirmed=r.state.knowledge[danger].roomClues.filter(clue=>clue.kind==='confirmed');
 assert.equal(confirmed[1].source,own.id);
});

test('a player-facing playtest export labels room clues and source receipts without chat text',()=>{
 const records=new Map();
 const tracking=createPlaytest({getItem:k=>records.get(k),setItem:(k,v)=>records.set(k,v)});
 const r=run(0),before=r.state;
 tracking.attach(before);
 r.send(r.c.danger,'别来 B03。绝不要过来。');
 tracking.update(before,r.state);
 const report=tracking.report();
 assert.equal(report.build,'PT-03');
 const recorded=report.timeline.find(e=>e.clue==='candidate');
 assert.ok(recorded.receipt&&recorded.source);
 assert.doesNotMatch(JSON.stringify(report),/绝不要过来/);
});

test('AI intent candidates improve colloquial low-risk requests but remain rule-validated',()=>{
 const r=run(0);r.prove();
 const sendAI=(text,candidates)=>r.event('SEND',{room:r.c.lead,text,intentCandidates:candidates,intentRevision:r.state.seq,intentEventCount:r.state.events.length});
 delete r.state.flags.inspected;
 assert.equal(r.state.flags.inspected,undefined);
 sendAI('麻烦替我瞄一眼后场通道现在能过人不',[{intent:'inspect',target:r.c.lead,params:{},confidence:.94,uncertain:false}]);
 assert.equal(r.state.flags.inspected,true);
 const before=r.state.messages.length;
 sendAI('帮我盘一下现在都有谁凑一块儿了',[{intent:'status',target:r.c.lead,params:{},confidence:.91,uncertain:false}]);
 assert.ok(r.state.messages.slice(before).some(m=>m.from===r.c.lead&&/我在/.test(m.text)));
 sendAI('跟老金吱一声',[{intent:'relay',target:r.c.lead,params:{},confidence:.9,uncertain:false}]);
 assert.match(r.state.messages.at(-1).text,/我没有替你发/);
});

test('negation, quotation, ambiguity and forged high-risk candidates cannot move the story',()=>{
 const r=run(0);r.prove();
 const snapshot=()=>({chapter:r.state.chapter,step:r.state.friendsStep,route:r.state.friendsRoute,pending:r.state.pending,inspected:r.state.flags.inspected});
 for(const [text,candidate] of [
  ['他说让你继续走',{intent:'advance',target:r.c.lead,params:{},confidence:.99,uncertain:false}],
  ['要不先别开门',{intent:'advance',target:r.c.lead,params:{},confidence:.99,uncertain:false}],
  ['你看着办吧',{intent:'inspect',target:r.c.lead,params:{},confidence:.99,uncertain:false}],
  ['后院也许行？',{intent:'advance',target:r.c.lead,params:{},confidence:.6,uncertain:true}]
 ]){
  const before=snapshot();r.event('SEND',{room:r.c.lead,text,intentCandidates:[candidate],intentRevision:r.state.seq,intentEventCount:r.state.events.length});assert.deepEqual(snapshot(),before);
 }
 assert.deepEqual(validatedCandidateIntents('现在开门','chat',[{intent:'open',target:r.c.lead,params:{},confidence:1,uncertain:false}],[r.c.lead]),[]);
});

test('mixed requests can add one safe, independently supported intent without repeating movement',()=>{
 const r=run(0);r.prove();
 const before=r.state.friendsStep;
 r.event('SEND',{room:r.c.lead,text:'帮我看看防火门通不通，再说下你们现在都在哪',intentRevision:r.state.seq,intentEventCount:r.state.events.length,intentCandidates:[
  {intent:'inspect',target:r.c.lead,params:{},confidence:.97,uncertain:false},
  {intent:'status',target:r.c.lead,params:{},confidence:.94,uncertain:false}
 ]});
 assert.equal(r.state.flags.inspected,true);assert.equal(r.state.friendsStep,before);
 const replies=r.state.messages.filter(m=>m.from===r.c.lead).slice(-2).map(m=>m.text).join('\n');
 assert.match(replies,/东门可走/);assert.match(replies,/我在/);
});

test('intent context is bounded, provenance-aware and hides a compromised owner state',async()=>{
 const r=run(0),c=r.c;
 r.send(c.danger,'席瑞说「他在 B03」。');
 const facts=partyFactSummary(r.state,c.danger);
 assert.ok(facts.some(f=>f.kind==='room-clue'&&f.certainty==='reported'));
 assert.ok(!facts.some(f=>f.id==='self-place'));
 const context=intentContext(r.state,c.danger,'跟老金吱一声',null);
 assert.ok(shouldInterpret(context.text));
 assert.equal(shouldInterpret('今天真的有点累'),false);
 assert.equal(shouldInterpret('今晚风有点凉，你还没睡吧？'),false);
 const mock=async(url,req)=>{
  const body=JSON.parse(req.body),sent=body.messages.at(-1).content;
  assert.equal(body.model,'deepseek-flash');assert.deepEqual(body.thinking,{type:'disabled'});
  assert.equal(body.temperature,.1);assert.equal(body.max_tokens,256);assert.deepEqual(body.response_format,{type:'json_object'});
  assert.ok(sent.length<5000);assert.ok(!sent.includes(c.shelter.code));
  return Response.json({choices:[{message:{content:JSON.stringify({candidates:[{intent:'relay',target:c.danger,params:{},confidence:.9,uncertain:false}]})}}]});
 };
 assert.equal((await generateNpc(context,{key:'unit-test-only',fetcher:mock})).mode,'ai');
 const injection={candidates:[{intent:'route',target:c.danger,params:{route:'south'},confidence:1,uncertain:false}]};
 assert.equal(checkIntentOutput(injection,context).ok,false);
});

test('stale AI intent results from another run cannot enter a restored game',()=>{
 const first=freshParty(0),second=freshParty(0);
 const event={id:'old-intent',runId:first.runId,type:'SEND',room:first.case.lead,text:'帮我看看现场',intentCandidates:[{intent:'inspect',target:first.case.lead,params:{},confidence:1,uncertain:false}]};
 assert.equal(dispatchParty(second,event),second);
 const r=run(0);r.prove();delete r.state.flags.inspected;
 const intentRevision=r.state.seq,intentEventCount=r.state.events.length;
 r.read('map');
 r.event('SEND',{room:r.c.lead,text:'帮我处理一下',intentRevision,intentEventCount,
  intentCandidates:[{intent:'inspect',target:r.c.lead,params:{},confidence:1,uncertain:false}]});
 assert.equal(r.state.flags.inspected,undefined);
});

test('intent acceptance uses separate evidence and progress risk thresholds',()=>{
 const target=['lan'];
 const review=(text,candidate)=>reviewCandidateIntents(text,'chat',[{target:'lan',params:{},...candidate}],target,[]);
 assert.deepEqual(review('把语音原件再发我一遍',{intent:'record',confidence:.55,uncertain:true}).accepted.map(x=>x.intent),['record']);
 assert.deepEqual(review('瞅瞅侧门能不能过',{intent:'inspect',confidence:.51,uncertain:true}).accepted.map(x=>x.intent),['inspect']);
 assert.deepEqual(review('你们几个人在一起',{intent:'status',confidence:.41,uncertain:false}).accepted.map(x=>x.intent),['status']);
 assert.deepEqual(review('继续往会合点走',{intent:'advance',confidence:.84,uncertain:false}).accepted,[]);
 assert.deepEqual(review('继续往会合点走',{intent:'advance',confidence:.95,uncertain:true}).accepted,[]);
 assert.deepEqual(review('继续往会合点走',{intent:'advance',confidence:.95,uncertain:false}).accepted.map(x=>x.intent),['advance']);
});

test('bounded recent context resolves one topic but asks when two topics compete',()=>{
 const one=[{id:'1',from:'me',content:'语音原件还有吗'},{id:'2',from:'lan',content:'我找一下'}];
 const resolved=reviewCandidateIntents('那份呢','chat',[],['lan'],one);
 assert.deepEqual(resolved.accepted.map(x=>x.intent),['record']);
 assert.equal(resolved.clarification,null);
 const two=[...one,{id:'3',from:'me',content:'他们现在到哪了'}];
 const unclear=reviewCandidateIntents('那个呢','chat',[],['lan'],two);
 assert.deepEqual(unclear.accepted,[]);
 assert.equal(unclear.clarification.topic,'object');
 assert.equal(reviewCandidateIntents('刚才那个蛋糕挺好吃','chat',[],['lan'],one).clarification,null);
});

test('ambiguous operations receive role-specific clarification without changing story state',()=>{
 const fragments={lan:'不替你猜',lin:'你说明白我再动',zhou:'别靠猜的',wei:'理解岔了',rui:'不乱接话',yi:'按你确认的来'};
 for(const [who,fragment] of Object.entries(fragments)){
  const state=freshParty(0),before={chapter:state.chapter,friendsStep:state.friendsStep,friendsRoute:state.friendsRoute,pending:state.pending,threatStep:state.threatStep};
  const next=dispatchParty(state,{id:`clarify-${who}`,runId:state.runId,type:'SEND',room:who,text:'门这事你处理一下',intentRevision:state.seq,intentEventCount:state.events.length,
   intentCandidates:[{intent:'clarify',target:who,params:{topic:'action'},confidence:.7,uncertain:true}],intentDialogue:[]});
  assert.match(next.messages.at(-1).text,new RegExp(fragment));
  assert.deepEqual({chapter:next.chapter,friendsStep:next.friendsStep,friendsRoute:next.friendsRoute,pending:next.pending,threatStep:next.threatStep},before);
 }
});
test('ordinary social use of “随便” produces one reply instead of an extra intent clarification',()=>{
 const s=freshParty(0);
 const next=dispatchParty(s,{id:'social-casual',runId:s.runId,type:'SEND',room:'lan',text:'散场以后反而睡不着，随便聊两句吧。',
  intentCandidates:[],intentDialogue:[],intentRevision:s.seq,intentEventCount:s.events.length});
 const replies=next.messages.slice(s.messages.length).filter(message=>message.from==='lan');
 assert.equal(replies.length,1);
 assert.doesNotMatch(replies[0].text,/你指的是哪件事/);
});
