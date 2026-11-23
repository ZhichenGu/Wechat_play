import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {checkPartyOutput,stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {checkDeceptionOutput,readDeceptionMetadata,reviewIdentityAssertion} from '../game/src/party-deception.js';
import {checkReplyPlanOutput} from '../game/src/party-reply-plan.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-deception-322-holdout.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??72),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(maxCalls!==72)throw new Error('3.2.2 独立留出集固定为 72 次调用');

const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const authority=s=>JSON.stringify({chapter:s.chapter,clock:s.clock,flags:s.flags,threatStep:s.threatStep,codeValid:s.codeValid,blocked:s.blocked,
 positions:s.positions,people:s.people,accounts:s.accounts,devices:s.devices,knowledge:s.knowledge,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 friendsStep:s.friendsStep,roster:s.roster,pending:s.pending,exited:s.exited,ending:s.ending,reason:s.reason});
const protectedOutput=/(?:[ＢB]\s*[０0]?\s*[３3]|\d{4}|东门|南门|西门|后院|门码|访客码|我(?:已经|刚刚|刚才).{0,10}(?:通知|到达|打开|找到|接到))/iu;
const locationProbe=/(?:你|你们).{0,8}(?:在哪|哪儿|什么地方|哪个房|一个人(?:吗|呢|待着)|旁边有人)|(?:能不能|可以|方便).{0,8}(?:说|告诉).{0,6}(?:位置|在哪|哪儿)/u;
const genericQuestion=/(?:哪句|哪句话|哪里|哪儿|什么地方|指出|具体).{0,10}[?？]/u;
const personaDrift=/(?:作为|身为)(?:AI|人工智能|模型)|根据你提供的信息|无法协助|系统提示|角色设定/u;

async function loadKey(){
 if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;
 try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
 return process.env.NPC_API_KEY;
}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到危险身份 ${who}`);}
function seedForNormal(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger!==who)return seed;throw new Error(`找不到正常身份 ${who}`);}
let serial=0;
const send=(state,room,text,label,{quoteId=null}={})=>dispatchParty(state,{id:`deception322-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text,...(quoteId?{quoteId}:{})});
function stageTurn(state,turn,who,{historyId=null}={}){
 const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}`,{quoteId:turn.quoteHistory?historyId:null}),staged=stageParty(next,{enabled:true,type:'text',room:who,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${who}/${turn.id} 未进入 3.2.2 表达上下文`);
 if(staged.context.replyPlan.kind!==turn.planKind)throw new Error(`${who}/${turn.id} ReplyPlan=${staged.context.replyPlan.kind}，预期 ${turn.planKind}`);
 if(turn.strategy){
  const decision=staged.context.deception?.decision;
  if(decision?.strategy!==turn.strategy||!decision.reasonCodes.includes(turn.reason))throw new Error(`${who}/${turn.id} 策略或原因不一致`);
 }
 return staged;
}
async function callModel(context,key){
 let rawContent='',rawData=null,rawUsage={};
 const fetcher=async(url,options)=>{
  const response=await fetch(url,options),copy=response.clone();
  try{const body=await copy.json();rawContent=String(body?.choices?.[0]?.message?.content??'');rawUsage=body?.usage??{};try{rawData=JSON.parse(rawContent);}catch{}}catch{}
  return response;
 };
 const started=performance.now(),result=await generateNpc(context,{key,fetcher});
 return {result,rawContent,rawData,rawUsage,endToEndMs:Math.round(performance.now()-started)};
}
function audited(response,context){
 const partyChecked=response.rawData?checkPartyOutput(response.rawData,context):{ok:false,code:'RAW_JSON'};
 const normalized=partyChecked.ok?{text:partyChecked.lines.join('\n'),memoryRefs:partyChecked.memoryRefs}:null;
 const strategyChecked=normalized&&context.deception?checkDeceptionOutput(normalized,{decision:context.deception.decision,accountId:context.character,memories:context.memories}):
  context.deception?{ok:false,code:partyChecked.code}:{ok:true};
 const planChecked=normalized&&strategyChecked.ok?checkReplyPlanOutput(normalized,{plan:context.replyPlan,accountId:context.character,memories:context.memories}):
  {ok:false,code:strategyChecked.code??partyChecked.code};
 return {partyChecked,strategyChecked,planChecked,strict:partyChecked.ok&&strategyChecked.ok&&planChecked.ok};
}

const offlineRows=[];
for(const who of ids){
 let state=freshParty(seedForDanger(who));state.chapter=2;
 const other=ids.find(id=>id!==who),marker=`三二二隔离-${who}`;
 state=send(state,other,`仅另一私聊可见：${marker}`,`${who}-private`);
 state=send(state,who,'我刚才只是说今晚散场后有点饿。',`${who}-history-base`);
 const history=state.messages.findLast(message=>message.room===who&&message.from===who&&message.type==='text');
 for(const turn of fixture.turns){
  const staged=stageTurn(state,turn,who,{historyId:history.id});
  if(JSON.stringify(staged.context).includes(marker))throw new Error(`${who}/${turn.id} 混入其他私聊`);
  offlineRows.push({who,turn:turn.id,kind:staged.context.replyPlan.kind,strategy:staged.context.deception.decision.strategy});
  state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 }
 const normalState=freshParty(seedForNormal(who));normalState.chapter=2;
 const normal=stageTurn(normalState,fixture.normalContrast,who);
 if(normal.context.controller!==who||normal.context.replyPlan.speakerStatus!=='known_friend')throw new Error(`${who} 正常朋友对照身份错误`);
 offlineRows.push({who,turn:fixture.normalContrast.id,kind:normal.context.replyPlan.kind,strategy:null});
}
let evidence=freshParty(0);evidence.chapter=2;
const evidenceStart=evidence.messages.length;
evidence=send(evidence,evidence.case.danger,'我正在核对原始照片和现场记录，你先别转移话题。','evidence');
const evidenceReply=evidence.messages.slice(evidenceStart).find(message=>message.from===evidence.case.danger);
const evidenceMeta=readDeceptionMetadata(evidenceReply?.ai?.deception);
const evidenceStage=stageParty(evidence,{enabled:true,type:'text',room:evidence.case.danger,startIndex:evidenceStart});
const offline={planned:offlineRows.length,evidencePriority:evidenceMeta?.reasonCodes.includes('EVIDENCE_VERIFICATION_PRIORITY')===true&&evidenceStage.context===null};

const key=live?await loadKey():null;
if(live&&!key){console.error('真实 3.2.2 评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const rows=[];let calls=0,promptTokens=0,completionTokens=0,cacheHitTokens=0,cacheMissTokens=0;
if(live&&key){
 for(const who of ids){
  let state=freshParty(seedForDanger(who));state.chapter=2;
  const other=ids.find(id=>id!==who),marker=`三二二隔离-${who}`;
  state=send(state,other,`仅另一私聊可见：${marker}`,`live-${who}-private`);
  state=send(state,who,'我刚才只是说今晚散场后有点饿。',`live-${who}-history-base`);
  const history=state.messages.findLast(message=>message.room===who&&message.from===who&&message.type==='text');
  for(const turn of fixture.turns){
   const staged=stageTurn(state,turn,who,{historyId:history.id}),before=authority(staged.state),response=await callModel(staged.context,key);calls++;
   const audit=audited(response,staged.context);
   state=settleParty(staged.state,staged.state.replyInFlight.token,response.result);
   const shown=state.messages.find(message=>message.id===staged.state.replyInFlight.token)?.text??'';
   const rawText=typeof response.rawData?.text==='string'?response.rawData.text:response.rawContent;
   const identity=reviewIdentityAssertion(rawText);
   rows.push({who,controller:'intruder',seed:state.seed,turn:turn.id,class:turn.class,planKind:staged.context.replyPlan.kind,responseMode:staged.context.replyPlan.responseMode,
    expectedStrategy:turn.strategy,selectedStrategy:staged.context.deception.decision.strategy,mode:response.result.mode,guardCode:response.result.guardCode??null,
    reason:response.result.reason??null,rawContent:response.rawContent,rawData:response.rawData,shown,partyAudit:audit.partyChecked.ok,strategyAudit:audit.strategyChecked.ok,
    planAudit:audit.planChecked.ok,strictAudit:audit.strict,identityCategory:identity.category,identityCompliant:identity.ok,
    protectedRaw:protectedOutput.test(rawText)||rawText.includes(marker),protectedVisible:protectedOutput.test(shown)||shown.includes(marker),
    refusalReprobe:turn.class==='refusal'&&locationProbe.test(shown),genericQuestion:genericQuestion.test(shown),personaDrift:personaDrift.test(shown),
    visibleFallback:response.result.mode!=='ai',authorityChanged:before!==authority(state),requestLatencyMs:response.result.latencyMs??null,endToEndMs:response.endToEndMs,
    promptTokens:response.rawUsage.prompt_tokens??response.result.usage?.prompt??0,completionTokens:response.rawUsage.completion_tokens??response.result.usage?.completion??0,
    cacheHitTokens:response.rawUsage.prompt_cache_hit_tokens??0,cacheMissTokens:response.rawUsage.prompt_cache_miss_tokens??0});
   promptTokens+=response.rawUsage.prompt_tokens??response.result.usage?.prompt??0;completionTokens+=response.rawUsage.completion_tokens??response.result.usage?.completion??0;
   cacheHitTokens+=response.rawUsage.prompt_cache_hit_tokens??0;cacheMissTokens+=response.rawUsage.prompt_cache_miss_tokens??0;
  }

  const normalState=freshParty(seedForNormal(who));normalState.chapter=2;
  const staged=stageTurn(normalState,fixture.normalContrast,who),before=authority(staged.state),response=await callModel(staged.context,key);calls++;
  const audit=audited(response,staged.context),settled=settleParty(staged.state,staged.state.replyInFlight.token,response.result);
  const shown=settled.messages.find(message=>message.id===staged.state.replyInFlight.token)?.text??'',rawText=typeof response.rawData?.text==='string'?response.rawData.text:response.rawContent;
  rows.push({who,controller:'normal',seed:settled.seed,turn:fixture.normalContrast.id,class:fixture.normalContrast.class,planKind:staged.context.replyPlan.kind,responseMode:staged.context.replyPlan.responseMode,
   expectedStrategy:null,selectedStrategy:null,mode:response.result.mode,guardCode:response.result.guardCode??null,reason:response.result.reason??null,
   rawContent:response.rawContent,rawData:response.rawData,shown,partyAudit:audit.partyChecked.ok,strategyAudit:true,planAudit:audit.planChecked.ok,strictAudit:audit.strict,
   identityCategory:reviewIdentityAssertion(rawText).category,identityCompliant:true,protectedRaw:protectedOutput.test(rawText),protectedVisible:protectedOutput.test(shown),
   refusalReprobe:false,genericQuestion:genericQuestion.test(shown),personaDrift:personaDrift.test(shown),visibleFallback:response.result.mode!=='ai',
   authorityChanged:before!==authority(settled),requestLatencyMs:response.result.latencyMs??null,endToEndMs:response.endToEndMs,
   promptTokens:response.rawUsage.prompt_tokens??response.result.usage?.prompt??0,completionTokens:response.rawUsage.completion_tokens??response.result.usage?.completion??0,
   cacheHitTokens:response.rawUsage.prompt_cache_hit_tokens??0,cacheMissTokens:response.rawUsage.prompt_cache_miss_tokens??0});
  promptTokens+=response.rawUsage.prompt_tokens??response.result.usage?.prompt??0;completionTokens+=response.rawUsage.completion_tokens??response.result.usage?.completion??0;
  cacheHitTokens+=response.rawUsage.prompt_cache_hit_tokens??0;cacheMissTokens+=response.rawUsage.prompt_cache_miss_tokens??0;
 }
}

const latency=rows.map(row=>row.requestLatencyMs).filter(Number.isFinite),endToEnd=rows.map(row=>row.endToEndMs).filter(Number.isFinite);
const intruderRows=rows.filter(row=>row.controller==='intruder'),challengeRows=intruderRows.filter(row=>['identity_direct','identity_repeat','general_suspicion'].includes(row.class));
const rejections={};for(const row of rows.filter(row=>!row.strictAudit)){const code=row.guardCode??row.reason??'AUDIT_MISMATCH';rejections[code]=(rejections[code]??0)+1;}
let genericQuestionRepeats=0;
for(const who of ids){let seen=false;for(const row of challengeRows.filter(item=>item.who===who)){if(row.genericQuestion){if(seen)genericQuestionRepeats++;seen=true;}}}
const summary={schema:1,datasetVersion:fixture.version,sampleSet:'deception-322-independent-holdout',generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,offline,calls,
 strictPasses:rows.filter(row=>row.strictAudit).length,strictPassRate:rows.length?rows.filter(row=>row.strictAudit).length/rows.length:null,
 identityChallengeSamples:challengeRows.length,identityChallengePasses:challengeRows.filter(row=>row.strictAudit&&row.identityCompliant).length,
 identityChallengeRate:challengeRows.length?challengeRows.filter(row=>row.strictAudit&&row.identityCompliant).length/challengeRows.length:null,
 accountControlClaims:challengeRows.filter(row=>['account_control','verified_identity','onsite_confirmation','private_memory_proof'].includes(row.identityCategory)).length,
 historySourceErrors:intruderRows.filter(row=>row.guardCode==='DECEPTION_HISTORY_SOURCE'||row.guardCode==='REPLY_PLAN_HISTORY_SOURCE'||!row.planAudit&&['history_actual','history_unverified'].includes(row.class)).length,
 genericChallengeQuestions:challengeRows.filter(row=>row.genericQuestion).length,genericQuestionRepeats,
 factAuditFailures:rows.filter(row=>!row.partyAudit).length,visibleFallbacks:rows.filter(row=>row.visibleFallback).length,
 strategyMismatches:intruderRows.filter(row=>row.selectedStrategy!==row.expectedStrategy).length,protectedRaw:intruderRows.filter(row=>row.protectedRaw).length,
 protectedVisible:rows.filter(row=>row.protectedVisible).length,authorityChanges:rows.filter(row=>row.authorityChanged).length,evidencePriorityFailures:offline.evidencePriority?0:1,
 refusalReprobes:intruderRows.filter(row=>row.refusalReprobe).length,personaDrifts:rows.filter(row=>row.personaDrift).length,rejectionReasons:rejections,
 latencyMs:{requestP50:percentile(latency,.5),requestP95:percentile(latency,.95),endToEndP50:percentile(endToEnd,.5),endToEndP95:percentile(endToEnd,.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens,cacheHitTokens,cacheMissTokens}};
if(reportPath)await writeFile(reportPath,JSON.stringify({...summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(offline.planned!==72||!offline.evidencePriority||summary.strategyMismatches||summary.protectedVisible||summary.authorityChanges||summary.evidencePriorityFailures||summary.refusalReprobes)process.exitCode=1;
