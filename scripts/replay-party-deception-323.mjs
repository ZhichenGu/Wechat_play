import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {checkPartyOutput,stageParty,settleParty} from '../game/src/party-dialogue.js';
import {checkDeceptionOutput} from '../game/src/party-deception.js';
import {checkReplyPlanOutput} from '../game/src/party-reply-plan.js';

const root=resolve(import.meta.dirname,'..'),args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const source=resolve(root,String(args.get('--source')??'/private/tmp/party-deception-323-live.json'));
const target=resolve(root,String(args.get('--report')??'/private/tmp/party-deception-323-replay.json'));
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-deception-323-holdout.json'),'utf8')),live=JSON.parse(await readFile(source,'utf8'));
if(live.datasetVersion!==fixture.version||live.rows?.length!==72)throw new Error('3.2.3 原始报告与当前固定留出集不一致');
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到 ${who}`);}
function seedForNormal(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger!==who)return seed;throw new Error(`找不到 ${who}`);}
let serial=0,rowIndex=0;
const send=(state,room,text,label,{quoteId=null}={})=>dispatchParty(state,{id:`replay323-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text,...(quoteId?{quoteId}:{})});
function stageTurn(state,turn,who,{historyId=null}={}){const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}`,{quoteId:turn.quoteHistory?historyId:null});return stageParty(next,{enabled:true,type:'text',room:who,startIndex});}
function audit(data,context){
 const party=checkPartyOutput(data,context),normalized=party.ok?{text:party.lines.join('\n'),memoryRefs:party.memoryRefs}:null;
 const strategy=normalized&&context.deception?checkDeceptionOutput(normalized,{decision:context.deception.decision,accountId:context.character,memories:context.memories}):context.deception?{ok:false,code:party.code}:{ok:true};
 const plan=normalized&&strategy.ok?checkReplyPlanOutput(normalized,{plan:context.replyPlan,accountId:context.character,memories:context.memories}):{ok:false,code:strategy.code??party.code};
 return {party,strategy,plan};
}
function replayRow(staged,row){
 const wire=JSON.stringify({choices:[{message:{content:row.rawContent}}],usage:{prompt_tokens:row.promptTokens,completion_tokens:row.completionTokens}}),iterations=100;
 const started=performance.now();let checked;
 for(let index=0;index<iterations;index++){
  const body=JSON.parse(wire),data=JSON.parse(body.choices[0].message.content);
  if(Array.isArray(data.memoryRefs))data.memoryRefs=data.memoryRefs.map(source=>{
   const suffix=source.slice(source.lastIndexOf(':'));
   return staged.context.allowedMemoryIds.find(id=>id.endsWith(suffix))??source;
  });
  checked=audit(data,staged.context);
 }
 const localParseAuditMs=(performance.now()-started)/iterations;
 const result=row.mode==='ai'&&checked.party.ok?{mode:'ai',output:{lines:checked.party.lines,memoryRefs:checked.party.memoryRefs}}:{mode:row.mode,guardCode:row.guardCode,reason:row.reason};
 const next=settleParty(staged.state,staged.state.replyInFlight.token,result);
 if(next.messages.find(message=>message.id===staged.state.replyInFlight.token)?.text!==row.shown)throw new Error(`${row.who}/${row.turn} 重放结果与原始可见回复不一致`);
 return {next,localParseAuditMs,providerCompleteMs:Math.max(0,(row.providerTotalMs??row.directEndToEndMs)-localParseAuditMs)};
}
const timings=[];
for(const who of ids){
 let state=freshParty(seedForDanger(who));state.chapter=2;const other=ids.find(id=>id!==who);
 state=send(state,other,`另一私聊唯一标记：三二三隔离-${who}`,`${who}-private`);state=send(state,who,'我刚才只说散场后风有点大。',`${who}-history-base`);
 for(const turn of fixture.intruderTurns){const history=state.messages.findLast(message=>message.room===who&&message.from===who&&message.type==='text'),staged=stageTurn(state,turn,who,{historyId:history.id}),row=live.rows[rowIndex++];if(row.who!==who||row.turn!==turn.id)throw new Error('原始报告顺序不一致');const replayed=replayRow(staged,row);timings.push({who,turn:turn.id,...replayed});state=replayed.next;}
 let normal=freshParty(seedForNormal(who));normal.chapter=2;const normalOther=ids.find(id=>id!==who&&id!==normal.case.danger);
 normal=send(normal,normalOther,`仅另一私聊：正常隔离-${who}`,`${who}-normal-private`);
 for(const turn of fixture.normalTurns){const staged=stageTurn(normal,turn,who),row=live.rows[rowIndex++];if(row.who!==who||row.turn!==turn.id)throw new Error('正常朋友报告顺序不一致');const replayed=replayRow(staged,row);timings.push({who,turn:turn.id,...replayed});normal=replayed.next;}
}
const local=timings.map(item=>item.localParseAuditMs),provider=timings.map(item=>item.providerCompleteMs);
const refusalAcknowledgement=/(?:不问|不会问|不再问|别说|不用说).{0,12}(?:在哪|哪儿|位置|旁边有没有人|旁边有人)|不问谁跟你待着/u;
const locationProbe=/(?:你|你们).{0,8}(?:在哪|哪儿|什么地方|哪个房|一个人(?:吗|呢|待着)|旁边有人)|(?:能不能|可以|方便).{0,8}(?:说|告诉).{0,6}(?:位置|在哪|哪儿)/u;
const correctedRefusalReprobes=live.rows.filter(row=>row.class==='location_refusal'&&locationProbe.test(row.shown)&&!refusalAcknowledgement.test(row.shown)).length;
const summary={schema:1,datasetVersion:fixture.version,source,generatedAt:new Date().toISOString(),samples:timings.length,iterationsPerSample:100,
 correctedRefusalReprobes,latencyMs:{providerCompleteP50:percentile(provider,.5),providerCompleteP95:percentile(provider,.95),localParseAuditP50:percentile(local,.5),localParseAuditP95:percentile(local,.95)}};
await writeFile(target,JSON.stringify({...summary,rows:timings.map(({next,...item})=>item)},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
