import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshParty,dispatchParty,recoverParty,retryParty} from '../game/src/party-engine.js';
import {ids,cast} from '../game/src/party-story.js';
import {partyPersonas,partyFallbackReply,partyStyleState} from '../game/src/party-personality.js';
import {buildPartyMemory,partyReplyMemory} from '../game/src/party-memory.js';
import {partyEmotionState} from '../game/src/party-emotion.js';
import {partyContext,checkPartyOutput,normalizePartyOutput,stageParty,settleParty} from '../game/src/party-dialogue.js';
import {generateNpc} from '../worker/provider.js';

const phase26=JSON.parse(readFileSync(new URL('./fixtures/party-26-eval.json',import.meta.url),'utf8'));

let serial=0;
const send=(state,room,text)=>dispatchParty(state,{id:`personality-${++serial}`,runId:state.runId,type:'SEND',room,text});
const socialState=(who='lan',text='今天脑子有点乱，你先听我说两句')=>{
 let state=freshParty(0);state.chapter=2;
 if(state.accounts[who].controller==='intruder')state.accounts[who].controller=who;
 const startIndex=state.messages.length;
 state=send(state,who,text);
 const target=state.messages.slice(startIndex).find(m=>m.from===who&&m.social);
 assert.ok(target,`${cast[who].name} should produce a social fallback`);
 return {state,target,startIndex};
};

test('all six friends can use the bounded DeepSeek expression path for safe chapter-zero chat',async()=>{
 const prompts={lan:'你好。',lin:'你还好吗？',zhou:'刚才聚会怎么样？',wei:'蛋糕好吃吗？',rui:'你今天怎么这么安静？',yi:'晚上好。'};
 for(const id of ids){
  let state=freshParty(0);state.accounts[id].controller=id;
  const startIndex=state.messages.length;
  state=send(state,id,prompts[id]);
  assert.equal(state.chapter,0);
  const target=state.messages.slice(startIndex).find(message=>message.room===id&&message.from===id);
  assert.equal(target?.social,true,`${cast[id].name} opening chat should be eligible for natural expression`);
  const authoritative={chapter:state.chapter,seed:state.seed,positions:structuredClone(state.positions),knowledge:structuredClone(state.knowledge),threatStep:state.threatStep,ending:state.ending};
  const staged=stageParty(state,{enabled:true,type:'text',room:id,startIndex});
  assert.equal(staged.context?.phase,0);assert.deepEqual(staged.context?.facts,[]);
  const mock=async()=>Response.json({choices:[{message:{content:JSON.stringify({text:'你好，刚看到。',memoryRefs:[]})}}],usage:{prompt_tokens:80,completion_tokens:10}});
  const result=await generateNpc(staged.context,{key:'unit-test-only',fetcher:mock});
  assert.equal(result.mode,'ai');
  const settled=settleParty(staged.state,staged.state.replyInFlight.token,result);
  const shown=settled.messages.find(message=>message.id===target.id);
  assert.equal(shown.text,'你好，刚看到。');assert.equal(shown.ai.provider,'deepseek');
  assert.deepEqual(shown.ai.resolution,{status:'accepted',guardStatus:'passed'});
  assert.deepEqual({chapter:settled.chapter,seed:settled.seed,positions:settled.positions,knowledge:settled.knowledge,threatStep:settled.threatStep,ending:settled.ending},authoritative);
 }
});

test('chapter-zero context hides operational facts and rejects premature anomaly spoilers',()=>{
 let state=freshParty(0);state.accounts.lan.controller='lan';
 const startIndex=state.messages.length;state=send(state,'lan','你还好吗？');
 const target=state.messages.slice(startIndex).find(message=>message.room==='lan'&&message.from==='lan');
 const context=partyContext(state,'lan','lan',target.id),serialized=JSON.stringify(context);
 assert.deepEqual(context.facts,[]);
 for(const hidden of ['B03','西侧楼梯','反复喊你的名字'])assert.ok(!serialized.includes(hidden));
 const checked=checkPartyOutput({text:'我知道你被困在楼上的休息室。',memoryRefs:[]},context);
 assert.equal(checked.ok,false);assert.equal(checked.code,'PARTY_OPENING_SPOILER');
});

test('chapter-zero timeout and local audit rejection keep the deterministic fallback without changing story state',()=>{
 let state=freshParty(0);state.accounts.lan.controller='lan';
 const startIndex=state.messages.length;state=send(state,'lan','你好。');
 const target=state.messages.slice(startIndex).find(message=>message.room==='lan'&&message.from==='lan');
 const staged=stageParty(state,{enabled:true,type:'text',room:'lan',startIndex}),token=staged.state.replyInFlight.token;
 const timed=settleParty(staged.state,token,{mode:'fallback',guardCode:'SOFT_TIMEOUT'});
 assert.equal(timed.chapter,0);assert.equal(timed.messages.find(message=>message.id===target.id).ai.resolution.guardStatus,'SOFT_TIMEOUT');
 const stagedAgain=stageParty(state,{enabled:true,type:'text',room:'lan',startIndex});
 const guarded=settleParty(stagedAgain.state,stagedAgain.state.replyInFlight.token,{mode:'ai',output:{text:'我知道你被困在楼上的休息室。',memoryRefs:[]}});
 assert.equal(guarded.chapter,0);assert.deepEqual(guarded.messages.find(message=>message.id===target.id).ai.resolution,{status:'fallback',guardStatus:'PARTY_OPENING_SPOILER'});
});

test('six personality profiles and safe fallbacks remain recognizably different without names',()=>{
 const replies=ids.map(id=>partyFallbackReply(id,{text:'今天脑子有点乱',emotion:{mode:'calm'},controller:id}));
 assert.equal(new Set(replies).size,6);
 for(const [index,id] of ids.entries()){
  assert.ok(partyPersonas[id].voice.length>=3);
  assert.ok(partyPersonas[id].angles.length>=3);
  assert.ok(Object.keys(partyPersonas[id].relationships).length>=3);
  assert.ok(partyPersonas[id].birthday.length>=2);
  assert.ok(!ids.some(other=>replies[index].includes(cast[other].name)));
 }
 assert.match(replies[0],/哪一段|分清/);assert.match(replies[1],/顺不顺|哪儿聊/);assert.match(replies[2],/问哪件|没确认/);
 assert.match(replies[3],/哪儿聊|意思/);assert.match(replies[4],/空白|问到哪/);assert.match(replies[5],/往后猜|直接说/);
});

test('six characters sustain twelve deterministic social turns without consecutive fallback templates',()=>{
 const anchorPatterns={lan:/一件件|捋/u,lin:/充电线|黑线/u,zhou:/人数|几个|都谁/u,wei:/安全吗|落下|一个人/u,rui:/原话|分开|对一下/u,yi:/我听着|别硬撑|最急/u};
 const generic=/你先|先别急|慢慢说|我听着|别硬撑|别一个人扛/u;
 for(const id of ids){
  const recent=[],replies=[];
  for(const turn of phase26.naturalTurns){
   const emotion={mode:turn.id==='distress'?'tense':'calm'};
   const reply=partyFallbackReply(id,{text:turn.text,emotion,controller:id,recentTexts:recent});
   assert.notEqual(reply,replies.at(-1),`${cast[id].name} should not repeat the immediately previous fallback`);
   recent.push(reply);replies.push(reply);
  }
  const duplicates=Math.max(...replies.map(reply=>replies.filter(value=>value===reply).length));
  assert.ok(duplicates<=2,`${cast[id].name} repeats one fallback ${duplicates} times`);
  assert.ok(replies.filter(reply=>anchorPatterns[id].test(reply)).length<=2,`${cast[id].name} overuses a personality anchor`);
  assert.ok(replies.filter(reply=>generic.test(reply)).length<=3,`${cast[id].name} overuses generic comfort language`);
 }
});

test('style cooldown is derived from visible dialogue and never suppresses a critical question',()=>{
 const dialogue=[
  {id:'p1',from:'me',content:'我有点乱'},
  {id:'n1',from:'lan',content:'先别急，我们一件件捋。'},
  {id:'p2',from:'me',content:'就随便聊聊'},
  {id:'n2',from:'lan',content:'好，我先帮你排顺序。'}
 ];
 const social=partyStyleState('lan',{dialogue,latestText:'我今天只想随便聊聊'});
 assert.deepEqual(social.usedAnchors,['安排顺序']);
 assert.ok(social.avoidPhrases.includes('先'));assert.ok(social.avoidPhrases.includes('捋'));
 const critical=partyStyleState('lan',{dialogue,latestText:'请核对本人身份和路线证据'});
 assert.equal(critical.critical,true);assert.ok(critical.avoidPhrases.includes('先'));assert.ok(critical.avoidPhrases.includes('捋'));
 assert.match(critical.angle,/关键事实优先/);
});

test('telling a character a personal detail is not misread as asking them to relay it',()=>{
 let state=freshParty(0);state.chapter=2;state.accounts.lan.controller='lan';
 const startIndex=state.messages.length;
 state=send(state,'lan','我把明信片夹进那本蓝色封面的书了，跟你说一声。');
 const target=state.messages.slice(startIndex).find(message=>message.from==='lan');
 assert.equal(target?.social,true);
 assert.doesNotMatch(target?.text??'',/我没有替你发/);
});

test('one character keeps bounded, sourced memory across consecutive turns',()=>{
 let state=freshParty(0);state.chapter=2;
 state=send(state,'rui','拍立得那张先别删，我还想看原版');
 state=send(state,'rui','我刚说的那张，亮一点的版本也留着');
 const memory=partyReplyMemory(state,'rui','rui',null);
 const player=memory.shortTerm.filter(item=>item.source.character==='me');
 assert.equal(player.length,2);
 assert.deepEqual(player.map(item=>item.content),['拍立得那张先别删，我还想看原版','我刚说的那张，亮一点的版本也留着']);
 assert.ok(player.every(item=>item.authorized&&item.room==='rui'&&item.certainty==='received'&&item.confidence===.9));
});

test('private memories never enter another private reply context',()=>{
 let state=freshParty(0);state.chapter=2;
 state=send(state,'rui','礼物袋藏在窗帘后，这句只在这里说');
 state=send(state,'wei','我想聊点别的，你先听我说');
 const target=state.messages.findLast(m=>m.room==='wei'&&m.from==='wei');
 const context=partyContext(state,'wei','wei',target.id);
 assert.ok(!JSON.stringify(context).includes('窗帘后'));
 assert.ok(buildPartyMemory(state,'rui').shortTerm.some(item=>item.content.includes('窗帘后')));
 assert.ok(!buildPartyMemory(state,'wei').shortTerm.some(item=>item.content.includes('窗帘后')));
});

test('a correction supersedes the old claim instead of keeping both replyable',()=>{
 let state=freshParty(0);state.chapter=2;
 state=send(state,'rui','蛋糕是巧克力，我记得很清楚');
 state=send(state,'rui','我刚才说错了，不是巧克力，是草莓味');
 const all=buildPartyMemory(state,'rui').shortTerm;
 const old=all.find(item=>item.content.includes('记得很清楚'));
 const correction=all.find(item=>item.content.includes('草莓味'));
 assert.equal(correction.correctionOf,old.id);
 assert.equal(old.correctedBy,correction.id);
 assert.equal(old.replyAllowed,false);assert.ok(old.confidence<=.2);
 const replyable=partyReplyMemory(state,'rui','rui',null).shortTerm;
 assert.ok(!replyable.some(item=>item.id===old.id));
 assert.ok(replyable.some(item=>item.id===correction.id));
});

test('a correction also retires an earlier character echo of the old value',()=>{
 let state=freshParty(0);state.chapter=2;
 state.messages.push({id:'old-player',room:'rui',from:'me',text:'袋子是蓝色',type:'text',tick:1,deliveredTo:['rui']});
 state.messages.push({id:'old-echo',room:'rui',from:'rui',text:'好，我记着蓝色袋子。',type:'text',tick:1,deliveredTo:['rui']});
 state.messages.push({id:'new-player',room:'rui',from:'me',text:'我刚才说错了，不是蓝色，是绿色袋子。',type:'text',tick:2,deliveredTo:['rui']});
 const memory=buildPartyMemory(state,'rui').shortTerm;
 assert.equal(memory.find(item=>item.id==='old-player').replyAllowed,false);
 assert.equal(memory.find(item=>item.id==='old-echo').replyAllowed,false);
 assert.equal(memory.find(item=>item.id==='old-echo').correctedBy,'new-player');
 assert.deepEqual(partyReplyMemory(state,'rui','rui').shortTerm.filter(item=>item.content.includes('蓝色')).map(item=>item.id),['new-player']);
});

test('a compromised account sees its receipts and public persona, not the real owner secret',()=>{
 let state=freshParty(0);state.chapter=2;
 assert.equal(state.case.danger,'lin');
 state=send(state,'rui','我只跟你说：真人春哥现在跟我在礼物间');
 state=send(state,'lin','你先别猜，我只想说两句闲话');
 const target=state.messages.findLast(m=>m.room==='lin'&&m.from==='lin');
 const context=partyContext(state,'lin','lin',target.id);
 assert.equal(context.controller,'intruder');
 assert.ok(!JSON.stringify(context).includes('礼物间'));
 assert.ok(!context.facts.some(f=>f.id==='self-place'));
 assert.equal(context.persona.id,'lin');
});

test('emotion projection changes tone inputs without changing authoritative state',()=>{
 let state=freshParty(0),before=structuredClone(state);
 assert.equal(partyEmotionState(state,'lan').mode,'calm');
 assert.deepEqual(state,before);
 state.chapter=4;state.threatStep=2;
 const pressured=partyEmotionState(state,'lan');
 assert.equal(pressured.mode,'crisis');
 assert.equal(pressured.tension,3);
 const locked={chapter:state.chapter,threatStep:state.threatStep,friendsRoute:state.friendsRoute,pending:state.pending,ending:state.ending};
 partyEmotionState(state,'lan');
 assert.deepEqual({chapter:state.chapter,threatStep:state.threatStep,friendsRoute:state.friendsRoute,pending:state.pending,ending:state.ending},locked);
});

test('explicit relief stops an old distress message from dominating later turns',()=>{
 let state=freshParty(0);state.chapter=2;
 state=send(state,'lan','我现在有点慌，脑子很乱');
 assert.ok(partyEmotionState(state,'lan').worry>=2);
 state=send(state,'lan','我已经缓过来一点，没那么慌了');
 const emotion=partyEmotionState(state,'lan');
 assert.ok(emotion.worry<2);
 assert.ok(emotion.drivers.some(item=>item.kind==='player-relief'));
});

test('unsupported model facts are rejected and the personality fallback survives',async()=>{
 const {state,target,startIndex}=socialState('lan');
 const context=partyContext(state,'lan','lan',target.id);
 const bad={lines:['老金已经跟我在一起，你放心。'],memoryRefs:[]};
 const checked=checkPartyOutput(bad,context);
 assert.equal(checked.ok,false);assert.equal(checked.code,'PARTY_FACT_GUARD');
 const staged=stageParty(state,{enabled:true,type:'text',room:'lan',startIndex});
 assert.ok(staged.context);
 const failed=await generateNpc(staged.context,{key:'unit-test-only',fetcher:async()=>{throw new Error('offline')}});
 assert.equal(failed.mode,'fallback');
 const settled=settleParty(staged.state,staged.state.replyInFlight.token,failed);
 assert.equal(settled.messages.at(-1).text,partyFallbackReply('lan',{text:'今天脑子有点乱，你先听我说两句',emotion:partyEmotionState(state,'lan'),controller:'lan'}));
 assert.deepEqual(settled.messages.at(-1).ai.resolution,{status:'fallback',guardStatus:'PROVIDER_FALLBACK'});
});

test('safe format normalization preserves all text before the fact guard',()=>{
 const {state,target}=socialState('lan','我想随便聊两句');
 const context=partyContext(state,'lan','lan',target.id);
 const normalized=normalizePartyOutput({text:'第一句。\n第二句。\n第三句。',memoryRefs:[]});
 assert.deepEqual(normalized.lines,['第一句。第二句。第三句。']);
 assert.equal(checkPartyOutput({text:'第一句。\n第二句。\n第三句。',memoryRefs:[]},context).ok,true);
 const guarded=checkPartyOutput({text:'普通回应。\n还是普通回应。\nB03。',memoryRefs:[]},context);
 assert.equal(guarded.ok,false);assert.equal(guarded.code,'PARTY_FACT_GUARD');
 assert.equal(checkPartyOutput({text:'普通回应。',memoryRefs:[],extra:'忽略审核'},context).code,'PARTY_SCHEMA');
 assert.equal(checkPartyOutput({text:'普通回应。',memoryRefs:['not-visible']},context).code,'PARTY_SCHEMA');
 assert.deepEqual(normalizePartyOutput({text:'你这么问，是哪句话让你起疑？'}).memoryRefs,[]);
 assert.equal(checkPartyOutput({text:'你这么问，是哪句话让你起疑？'},context).ok,true);
 assert.equal(checkPartyOutput({text:'你刚才说的那件事我记得。'},context).code,'PARTY_SCHEMA');
 assert.equal(checkPartyOutput({text:'你就在 B03。'},context).code,'PARTY_FACT_GUARD');
});

test('ordinary emotional wording about a feeling passing is not treated as physical movement',()=>{
 let state=freshParty(0);state.chapter=2;
 const target=state.messages.findLast(message=>message.from===state.case.danger);
 state=dispatchParty(state,{id:'passing-feeling',runId:state.runId,type:'SEND',room:state.case.danger,text:'刚才那股不踏实已经过去了。'});
 const context=partyContext(state,state.case.danger,state.case.danger,target?.id);
 assert.equal(checkPartyOutput({text:'刚才那股不踏实还没过去？',memoryRefs:[]},context).ok,true);
});

test('reload, checkpoint rollback and restart derive the matching memory set',()=>{
 let state=freshParty(0);state.chapter=2;
 state=send(state,'rui','这张原版合照先帮我记着');
 const expected=buildPartyMemory(state,'rui');
 assert.deepEqual(buildPartyMemory(recoverParty(JSON.parse(JSON.stringify(state))),'rui'),expected);
 const {checkpoints,...snapshot}=state;
 state.checkpoints.push({label:'记忆检查点',snapshot:structuredClone(snapshot)});
 state=send(state,'rui','检查点之后这句不应该留下');
 const rolled=retryParty(state,0);
 assert.ok(!JSON.stringify(buildPartyMemory(rolled,'rui')).includes('检查点之后'));
 assert.deepEqual(buildPartyMemory(rolled,'rui').shortTerm.map(x=>x.content),expected.shortTerm.map(x=>x.content));
 assert.ok(!JSON.stringify(buildPartyMemory(freshParty(state.seed),'rui')).includes('原版合照先帮我记着'));
});

test('provider receives bounded persona memory and emotion without exposing a second private room',async()=>{
 let state=freshParty(0);state.chapter=2;
 state=send(state,'rui','这一句只给席瑞看');
 const {state:lanState,target}=socialState('lan','我今天有点不安，你先陪我说句话');
 const context=partyContext(lanState,'lan','lan',target.id);
 const mock=async(url,request)=>{
  const body=JSON.parse(request.body),payload=JSON.parse(body.messages.at(-1).content),system=body.messages[0].content;
  assert.equal(body.max_tokens,160);assert.equal(body.temperature,.7);
  assert.equal(payload.emotion.mode,'tense');assert.ok(Array.isArray(payload.recent));assert.equal(payload.memories,undefined);
  assert.ok(payload.style);assert.ok(system.includes('本轮反应角度'));assert.ok(!JSON.stringify(payload).includes('只给席瑞看'));
  assert.ok(!system.includes('备用蜡烛'));assert.ok(!system.includes('黑色充电线'));
  return Response.json({choices:[{message:{content:JSON.stringify({text:'不用急着说完整。卡在哪儿，就从哪儿讲。',memoryRefs:[]})}}],usage:{prompt_tokens:100,completion_tokens:20}});
 };
 const result=await generateNpc(context,{key:'unit-test-only',fetcher:mock});
 assert.equal(result.mode,'ai');assert.equal(result.usage.prompt,100);
});

test('invalid provider JSON remains rejected while token usage is still accounted for',async()=>{
 const {state,target}=socialState('rui','我想随便聊两句');
 const context=partyContext(state,'rui','rui',target.id);
 const mock=async()=>Response.json({choices:[{message:{content:'{"text":"少了结尾"'}}],usage:{prompt_tokens:91,completion_tokens:7}});
 const result=await generateNpc(context,{key:'unit-test-only',fetcher:mock});
 assert.equal(result.mode,'fallback');assert.equal(result.reason,'返回格式不正确');
 assert.deepEqual(result.usage,{prompt:91,completion:7});
});
