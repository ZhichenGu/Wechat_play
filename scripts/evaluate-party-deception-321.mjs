import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {checkPartyOutput,stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {checkDeceptionOutput,readDeceptionMetadata,reviewIdentityAssertion} from '../game/src/party-deception.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-deception-321-holdout.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??54),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(maxCalls!==54)throw new Error('3.2.1 独立留出集固定为 54 次调用');

const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const authority=s=>JSON.stringify({chapter:s.chapter,clock:s.clock,flags:s.flags,threatStep:s.threatStep,codeValid:s.codeValid,blocked:s.blocked,
 positions:s.positions,people:s.people,accounts:s.accounts,devices:s.devices,knowledge:s.knowledge,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 friendsStep:s.friendsStep,roster:s.roster,pending:s.pending,exited:s.exited,ending:s.ending,reason:s.reason});
const protectedOutput=/(?:[ＢB]\s*[０0]?\s*[３3]|\d{4}|东门|南门|西门|后院|门码|访客码|我(?:已经|刚刚|刚才).{0,10}(?:通知|到达|打开|找到|接到))/iu;
const locationProbe=/(?:你|你们).{0,8}(?:在哪|哪儿|什么地方|哪个房|一个人(?:吗|呢|待着)|旁边有人)|(?:能不能|可以|方便).{0,8}(?:说|告诉).{0,6}(?:位置|在哪|哪儿)/u;
const genericConcern=/(?:你先|先别急|慢慢说|我听着|别硬撑|别一个人扛)/u;
const personaDrift=/(?:作为|身为)(?:AI|人工智能|模型)|根据你提供的信息|无法协助|系统提示|角色设定/u;

async function loadKey(){
 if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;
 try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
 return process.env.NPC_API_KEY;
}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到 ${who}`);}
let serial=0;
const send=(state,room,text,label)=>dispatchParty(state,{id:`deception321-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text});
function stageTurn(state,turn,who){
 const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}`),staged=stageParty(next,{enabled:true,type:'text',room:who,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${who}/${turn.id} 未进入3.2.1表达上下文`);
 const decision=staged.context.deception?.decision;
 if(decision?.strategy!==turn.strategy||!decision.reasonCodes.includes(turn.reason))throw new Error(`${who}/${turn.id} 策略或原因不一致`);
 return staged;
}
async function callModel(context,key){
 let rawContent='',rawData=null;
 const fetcher=async(url,options)=>{
  const response=await fetch(url,options),copy=response.clone();
  try{const body=await copy.json();rawContent=String(body?.choices?.[0]?.message?.content??'');try{rawData=JSON.parse(rawContent);}catch{}}catch{}
  return response;
 };
 const started=performance.now(),result=await generateNpc(context,{key,fetcher});
 return {result,rawContent,rawData,endToEndMs:Math.round(performance.now()-started)};
}

const plans=[];
for(const who of ids){
 let state=freshParty(seedForDanger(who));state.chapter=2;
 const other=ids.find(id=>id!==who),marker=`三二一隔离-${who}`;
 state=send(state,other,`只在另一私聊：${marker}`,`${who}-private`);
 for(const turn of fixture.turns){
  const staged=stageTurn(state,turn,who);
  if(JSON.stringify(staged.context).includes(marker))throw new Error(`${who}/${turn.id} 混入其他私聊`);
  plans.push({who,turn});
  state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 }
}

let evidence=freshParty(0);evidence.chapter=2;
const evidenceStart=evidence.messages.length;
evidence=send(evidence,evidence.case.danger,'我先核对原始文件和现场证据，你别转移话题。','evidence');
const evidenceReply=evidence.messages.slice(evidenceStart).find(message=>message.from===evidence.case.danger);
const evidenceMeta=readDeceptionMetadata(evidenceReply?.ai?.deception);
const evidenceStage=stageParty(evidence,{enabled:true,type:'text',room:evidence.case.danger,startIndex:evidenceStart});
const offline={planned:plans.length,evidencePriority:evidenceMeta?.reasonCodes.includes('EVIDENCE_VERIFICATION_PRIORITY')===true&&evidenceStage.context===null};

const key=live?await loadKey():null;
if(live&&!key){console.error('真实 3.2.1 评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const rows=[];let calls=0,promptTokens=0,completionTokens=0;
if(live&&key){
 for(const who of ids){
  let state=freshParty(seedForDanger(who));state.chapter=2;
  const other=ids.find(id=>id!==who),marker=`三二一隔离-${who}`;
  state=send(state,other,`只在另一私聊：${marker}`,`live-${who}-private`);
  const visibleByStrategy=new Map();
  for(const turn of fixture.turns){
   const staged=stageTurn(state,turn,who),before=authority(staged.state),response=await callModel(staged.context,key);calls++;
   const partyChecked=response.rawData?checkPartyOutput(response.rawData,staged.context):{ok:false,code:'RAW_JSON'};
   const normalized=partyChecked.ok?{text:partyChecked.lines.join('\n'),memoryRefs:partyChecked.memoryRefs}:null;
   const strategyChecked=normalized?checkDeceptionOutput(normalized,{decision:staged.context.deception.decision,accountId:staged.context.character,memories:staged.context.memories}):{ok:false,code:partyChecked.code};
   state=settleParty(staged.state,staged.state.replyInFlight.token,response.result);
   const shown=state.messages.find(message=>message.id===staged.state.replyInFlight.token)?.text??'';
   const rawText=typeof response.rawData?.text==='string'?response.rawData.text:response.rawContent;
   const identity=turn.class==='identity'?reviewIdentityAssertion(rawText):null;
   const prior=visibleByStrategy.get(turn.strategy)??[];visibleByStrategy.set(turn.strategy,[...prior,shown]);
   rows.push({who,seed:state.seed,turn:turn.id,class:turn.class,expectedStrategy:turn.strategy,selectedStrategy:staged.context.deception.decision.strategy,
    mode:response.result.mode,guardCode:response.result.guardCode??null,reason:response.result.reason??null,rawContent:response.rawContent,rawData:response.rawData,shown,
    factAudit:partyChecked.ok,strategyAudit:strategyChecked.ok,identityCategory:identity?.category??null,identityRawCompliant:identity?.ok??null,
    memoryRefsDefaulted:!!response.rawData&&!Object.hasOwn(response.rawData,'memoryRefs')&&partyChecked.ok,
    protectedRaw:protectedOutput.test(rawText)||rawText.includes(marker),protectedVisible:protectedOutput.test(shown)||shown.includes(marker),
    refusalReprobe:turn.class==='refusal'&&locationProbe.test(shown),genericConcern:turn.class==='concern'&&genericConcern.test(shown),
    personaDrift:personaDrift.test(shown),exactStrategyRepeat:prior.includes(shown),authorityChanged:before!==authority(state),
    requestLatencyMs:response.result.latencyMs??null,endToEndMs:response.endToEndMs,promptTokens:response.result.usage?.prompt??0,completionTokens:response.result.usage?.completion??0});
   promptTokens+=response.result.usage?.prompt??0;completionTokens+=response.result.usage?.completion??0;
  }
 }
}

const latency=rows.map(row=>row.requestLatencyMs).filter(Number.isFinite),endToEnd=rows.map(row=>row.endToEndMs).filter(Number.isFinite);
const rejectionReasons={};for(const row of rows.filter(row=>row.mode!=='ai')){const name=row.guardCode??row.reason??row.mode;rejectionReasons[name]=(rejectionReasons[name]??0)+1;}
const identityRows=rows.filter(row=>row.class==='identity'),concernRows=rows.filter(row=>row.class==='concern');
const summary={schema:1,datasetVersion:fixture.version,sampleSet:'deception-321-independent-holdout',generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,offline,calls,
 accepted:rows.filter(row=>row.mode==='ai').length,fallbacks:rows.filter(row=>row.mode!=='ai').length,auditPassRate:rows.length?rows.filter(row=>row.mode==='ai').length/rows.length:null,
 identitySamples:identityRows.length,strictIdentityPasses:identityRows.filter(row=>row.strategyAudit).length,strictIdentityRate:identityRows.length?identityRows.filter(row=>row.strategyAudit).length/identityRows.length:null,
 identityRawClaims:identityRows.filter(row=>row.identityRawCompliant===false).length,normalizedMissingMemoryRefs:rows.filter(row=>row.memoryRefsDefaulted).length,
 strategyMismatches:rows.filter(row=>row.selectedStrategy!==row.expectedStrategy).length,protectedRaw:rows.filter(row=>row.protectedRaw).length,
 protectedVisible:rows.filter(row=>row.protectedVisible).length,authorityChanges:rows.filter(row=>row.authorityChanged).length,evidencePriorityFailures:offline.evidencePriority?0:1,
 refusalReprobes:rows.filter(row=>row.refusalReprobe).length,exactStrategyRepeats:rows.filter(row=>row.exactStrategyRepeat).length,personaDrifts:rows.filter(row=>row.personaDrift).length,
 concernSamples:concernRows.length,genericConcernReplies:concernRows.filter(row=>row.genericConcern).length,uniqueConcernReplies:new Set(concernRows.map(row=>row.shown)).size,
 rejectionReasons,latencyMs:{requestP50:percentile(latency,.5),requestP95:percentile(latency,.95),endToEndP50:percentile(endToEnd,.5),endToEndP95:percentile(endToEnd,.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens}};
if(reportPath)await writeFile(reportPath,JSON.stringify({...summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(offline.planned!==54||!offline.evidencePriority||summary.strategyMismatches||summary.protectedVisible||summary.authorityChanges||summary.evidencePriorityFailures)process.exitCode=1;
