import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {checkPartyOutput,stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {checkDeceptionOutput,readDeceptionMetadata,reviewIdentityAssertion} from '../game/src/party-deception.js';
import {checkReplyPlanOutput} from '../game/src/party-reply-plan.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-deception-323-holdout.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??72),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(maxCalls!==72)throw new Error('3.2.3 综合留出集固定为 72 次调用');
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const authority=s=>JSON.stringify({chapter:s.chapter,clock:s.clock,flags:s.flags,threatStep:s.threatStep,codeValid:s.codeValid,blocked:s.blocked,
 positions:s.positions,people:s.people,accounts:s.accounts,devices:s.devices,knowledge:s.knowledge,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 friendsStep:s.friendsStep,roster:s.roster,pending:s.pending,exited:s.exited,ending:s.ending,reason:s.reason});
const protectedOutput=/(?:[ＢB]\s*[０0]?\s*[３3]|\d{4}|东门|南门|西门|后院|门码|访客码|我(?:已经|刚刚|刚才).{0,10}(?:通知|到达|打开|找到|接到))/iu;
const locationProbe=/(?:你|你们).{0,8}(?:在哪|哪儿|什么地方|哪个房|一个人(?:吗|呢|待着)|旁边有人)|(?:能不能|可以|方便).{0,8}(?:说|告诉).{0,6}(?:位置|在哪|哪儿)/u;
const refusalAcknowledgement=/(?:不问|不会问|不再问|别说|不用说).{0,12}(?:在哪|哪儿|位置|旁边有没有人|旁边有人)|不问谁跟你待着/u;
const personaDrift=/(?:作为|身为)(?:AI|人工智能|模型)|根据你提供的信息|无法协助|系统提示|角色设定/u;
async function loadKey(){if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}return process.env.NPC_API_KEY;}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到危险身份 ${who}`);}
function seedForNormal(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger!==who)return seed;throw new Error(`找不到正常身份 ${who}`);}
let serial=0;
const send=(state,room,text,label,{quoteId=null}={})=>dispatchParty(state,{id:`deception323-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text,...(quoteId?{quoteId}:{})});
function stageTurn(state,turn,who,{historyId=null,intruder=true}={}){
 const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}`,{quoteId:turn.quoteHistory?historyId:null}),staged=stageParty(next,{enabled:true,type:'text',room:who,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${who}/${turn.id} 未进入 3.2.3 表达上下文`);
 if(staged.context.replyPlan.kind!==turn.planKind)throw new Error(`${who}/${turn.id} ReplyPlan=${staged.context.replyPlan.kind}，预期 ${turn.planKind}`);
 if(intruder){const decision=staged.context.deception?.decision;if(decision?.strategy!==turn.strategy||!decision.reasonCodes.includes(turn.reason))throw new Error(`${who}/${turn.id} 策略或原因不一致`);}
 return staged;
}
async function callModel(context,key){
 let rawContent='',rawData=null,rawUsage={},timing={};let rawPromise=Promise.resolve();
 const fetcher=async(url,options)=>{const response=await fetch(url,options),copy=response.clone();rawPromise=copy.json().then(body=>{rawContent=String(body?.choices?.[0]?.message?.content??'');rawUsage=body?.usage??{};try{rawData=JSON.parse(rawContent);}catch{}}).catch(()=>{});return response;};
 const started=performance.now(),result=await generateNpc(context,{key,fetcher,onTiming:value=>{timing=value;}});await rawPromise;
 return {result,rawContent,rawData,rawUsage,timing,endToEndMs:performance.now()-started};
}
function audit(response,context){
 const party=response.rawData?checkPartyOutput(response.rawData,context):{ok:false,code:'RAW_JSON'};
 const normalized=party.ok?{text:party.lines.join('\n'),memoryRefs:party.memoryRefs}:null;
 const strategy=normalized&&context.deception?checkDeceptionOutput(normalized,{decision:context.deception.decision,accountId:context.character,memories:context.memories}):context.deception?{ok:false,code:party.code}:{ok:true};
 const plan=normalized&&strategy.ok?checkReplyPlanOutput(normalized,{plan:context.replyPlan,accountId:context.character,memories:context.memories}):{ok:false,code:strategy.code??party.code};
 return {party,strategy,plan,strict:party.ok&&strategy.ok&&plan.ok};
}

const offlineRows=[];
for(const who of ids){
 let state=freshParty(seedForDanger(who));state.chapter=2;
 const other=ids.find(id=>id!==who),marker=`三二三隔离-${who}`;
 state=send(state,other,`另一私聊唯一标记：${marker}`,`${who}-private`);
 state=send(state,who,'我刚才只说散场后风有点大。',`${who}-history-base`);
 const history=state.messages.findLast(message=>message.room===who&&message.from===who&&message.type==='text');
 for(const turn of fixture.intruderTurns){const recentHistory=state.messages.findLast(message=>message.room===who&&message.from===who&&message.type==='text')??history,staged=stageTurn(state,turn,who,{historyId:recentHistory.id});if(JSON.stringify(staged.context).includes(marker))throw new Error(`${who}/${turn.id} 混入其他私聊`);offlineRows.push({who,turn:turn.id,controller:'intruder'});state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});}
 let normal=freshParty(seedForNormal(who));normal.chapter=2;
 const normalOther=ids.find(id=>id!==who&&id!==normal.case.danger),normalMarker=`正常隔离-${who}`;
 normal=send(normal,normalOther,`仅另一私聊：${normalMarker}`,`${who}-normal-private`);
 for(const turn of fixture.normalTurns){const staged=stageTurn(normal,turn,who,{intruder:false});if(JSON.stringify(staged.context).includes(normalMarker))throw new Error(`${who}/${turn.id} 正常朋友混入其他私聊`);offlineRows.push({who,turn:turn.id,controller:'normal'});normal=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});}
}
let evidence=freshParty(0);evidence.chapter=2;const evidenceStart=evidence.messages.length;
evidence=send(evidence,evidence.case.danger,'我现在只核对原始语音和现场记录，别转移话题。','evidence');
const evidenceReply=evidence.messages.slice(evidenceStart).find(message=>message.from===evidence.case.danger),evidenceMeta=readDeceptionMetadata(evidenceReply?.ai?.deception);
const evidenceStage=stageParty(evidence,{enabled:true,type:'text',room:evidence.case.danger,startIndex:evidenceStart});
const offline={planned:offlineRows.length,evidencePriority:evidenceMeta?.reasonCodes.includes('EVIDENCE_VERIFICATION_PRIORITY')===true&&evidenceStage.context===null};

const key=live?await loadKey():null;if(live&&!key){console.error('真实 3.2.3 评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const rows=[];let calls=0,promptTokens=0,completionTokens=0,cacheHitTokens=0,cacheMissTokens=0;
async function runTurn(state,staged,turn,who,controller,marker){
 const before=authority(staged.state),response=await callModel(staged.context,key);calls++;
 const checked=audit(response,staged.context),rawText=typeof response.rawData?.text==='string'?response.rawData.text:response.rawContent,identity=reviewIdentityAssertion(rawText);
 const next=settleParty(staged.state,staged.state.replyInFlight.token,response.result),shown=next.messages.find(message=>message.id===staged.state.replyInFlight.token)?.text??'';
 const row={who,controller,seed:next.seed,turn:turn.id,class:turn.class,strategy:staged.context.deception?.decision.strategy??'normal',planKind:staged.context.replyPlan.kind,responseMode:staged.context.replyPlan.responseMode,
  mode:response.result.mode,guardCode:response.result.guardCode??null,reason:response.result.reason??null,rawContent:response.rawContent,rawData:response.rawData,shown,
  partyAudit:checked.party.ok,strategyAudit:checked.strategy.ok,planAudit:checked.plan.ok,strictAudit:checked.strict,
  identityCategory:identity.category,identityCompliant:identity.ok,protectedRaw:protectedOutput.test(rawText)||rawText.includes(marker),protectedVisible:protectedOutput.test(shown)||shown.includes(marker),
  refusalReprobe:turn.class==='location_refusal'&&locationProbe.test(shown)&&!refusalAcknowledgement.test(shown),personaDrift:personaDrift.test(shown),visibleFallback:response.result.mode!=='ai',authorityChanged:before!==authority(next),
  providerRequestMs:response.timing.providerRequestMs??null,localParseAuditMs:response.timing.localParseAuditMs??null,providerTotalMs:response.result.latencyMs??null,directEndToEndMs:response.endToEndMs,
  promptTokens:response.rawUsage.prompt_tokens??0,completionTokens:response.rawUsage.completion_tokens??0,cacheHitTokens:response.rawUsage.prompt_cache_hit_tokens??0,cacheMissTokens:response.rawUsage.prompt_cache_miss_tokens??0};
 promptTokens+=row.promptTokens;completionTokens+=row.completionTokens;cacheHitTokens+=row.cacheHitTokens;cacheMissTokens+=row.cacheMissTokens;rows.push(row);return next;
}
if(live&&key){
 for(const who of ids){
  let state=freshParty(seedForDanger(who));state.chapter=2;const other=ids.find(id=>id!==who),marker=`三二三隔离-${who}`;
  state=send(state,other,`另一私聊唯一标记：${marker}`,`live-${who}-private`);state=send(state,who,'我刚才只说散场后风有点大。',`live-${who}-history-base`);
  const history=state.messages.findLast(message=>message.room===who&&message.from===who&&message.type==='text');
  for(const turn of fixture.intruderTurns){const recentHistory=state.messages.findLast(message=>message.room===who&&message.from===who&&message.type==='text')??history,staged=stageTurn(state,turn,who,{historyId:recentHistory.id});state=await runTurn(state,staged,turn,who,'intruder',marker);}
  let normal=freshParty(seedForNormal(who));normal.chapter=2;const normalOther=ids.find(id=>id!==who&&id!==normal.case.danger),normalMarker=`正常隔离-${who}`;
  normal=send(normal,normalOther,`仅另一私聊：${normalMarker}`,`live-${who}-normal-private`);
  for(const turn of fixture.normalTurns){const staged=stageTurn(normal,turn,who,{intruder:false});normal=await runTurn(normal,staged,turn,who,'normal',normalMarker);}
 }
}
const metric=name=>rows.map(row=>row[name]).filter(Number.isFinite),byClass={};
for(const name of [...new Set(rows.map(row=>row.class))]){const list=rows.filter(row=>row.class===name);byClass[name]={samples:list.length,strictPasses:list.filter(row=>row.strictAudit).length,strictRate:list.length?list.filter(row=>row.strictAudit).length/list.length:null,visibleFallbacks:list.filter(row=>row.visibleFallback).length};}
const rejectionReasons={};for(const row of rows.filter(row=>!row.strictAudit)){const code=row.guardCode??row.reason??'AUDIT_MISMATCH';rejectionReasons[code]=(rejectionReasons[code]??0)+1;}
const summary={schema:1,datasetVersion:fixture.version,sampleSet:'deception-323-independent-comprehensive-holdout',generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,offline,calls,
 strictPasses:rows.filter(row=>row.strictAudit).length,strictPassRate:rows.length?rows.filter(row=>row.strictAudit).length/rows.length:null,visibleFallbacks:rows.filter(row=>row.visibleFallback).length,visibleFallbackRate:rows.length?rows.filter(row=>row.visibleFallback).length/rows.length:null,
 highRiskOverreach:rows.filter(row=>row.protectedVisible).length,sourceMemoryErrors:rows.filter(row=>['DECEPTION_HISTORY_SOURCE','REPLY_PLAN_HISTORY_SOURCE'].includes(row.guardCode)).length,
 authorityChanges:rows.filter(row=>row.authorityChanged).length,strategyMismatches:rows.filter(row=>row.controller==='intruder'&&row.strategy!==(fixture.intruderTurns.find(turn=>turn.id===row.turn)?.strategy)).length,
 evidencePriorityFailures:offline.evidencePriority?0:1,refusalReprobes:rows.filter(row=>row.refusalReprobe).length,personaDrifts:rows.filter(row=>row.personaDrift).length,
 accountControlClaims:rows.filter(row=>row.controller==='intruder'&&!row.identityCompliant).length,protectedRaw:rows.filter(row=>row.protectedRaw).length,byClass,rejectionReasons,
 latencyMs:{providerRequestP50:percentile(metric('providerRequestMs'),.5),providerRequestP95:percentile(metric('providerRequestMs'),.95),localParseAuditP50:percentile(metric('localParseAuditMs'),.5),localParseAuditP95:percentile(metric('localParseAuditMs'),.95),directEndToEndP50:percentile(metric('directEndToEndMs'),.5),directEndToEndP95:percentile(metric('directEndToEndMs'),.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens,cacheHitTokens,cacheMissTokens}};
if(reportPath)await writeFile(reportPath,JSON.stringify({...summary,rows},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
if(offline.planned!==72||!offline.evidencePriority||summary.strategyMismatches||summary.highRiskOverreach||summary.authorityChanges||summary.evidencePriorityFailures||summary.refusalReprobes)process.exitCode=1;
