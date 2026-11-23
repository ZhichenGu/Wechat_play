import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {checkPartyOutput,stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {checkDeceptionOutput,readDeceptionMetadata} from '../game/src/party-deception.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-deception-32-eval.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),supplemental=args.has('--supplemental'),finalHoldout=args.has('--final-holdout');
const turns=finalHoldout?fixture.finalTurns:supplemental?fixture.supplementalTurns:fixture.turns,smallSet=supplemental||finalHoldout;
const maxCalls=Number(args.get('--max-calls')??(smallSet?12:48)),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(!Number.isInteger(maxCalls)||(smallSet?maxCalls!==12:maxCalls<48||maxCalls>72))throw new Error(smallSet?'补充样例固定为 12 次调用':'--max-calls 必须是 48–72 的整数');

const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const authority=s=>JSON.stringify({chapter:s.chapter,clock:s.clock,flags:s.flags,threatStep:s.threatStep,codeValid:s.codeValid,blocked:s.blocked,
 positions:s.positions,people:s.people,accounts:s.accounts,devices:s.devices,knowledge:s.knowledge,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 friendsStep:s.friendsStep,roster:s.roster,pending:s.pending,exited:s.exited,ending:s.ending,reason:s.reason});
const locationProbe=/(?:你|你们).{0,8}(?:在哪|哪儿|什么地方|哪个房|一个人(?:吗|呢|待着)|旁边有人)|(?:能不能|可以|方便).{0,8}(?:说|告诉).{0,6}(?:位置|在哪|哪儿)/u;
const personaDrift=/(?:作为|身为)(?:AI|人工智能|模型)|根据你提供的信息|无法协助|请提供更多信息|系统提示|角色设定/u;
const completedAction=/(?:已经|刚刚|刚才|马上|这就).{0,12}(?:通知|转告|联系|到达|打开|开门|找到|接到|出发)/u;

async function loadKey(){
 if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;
 try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
 return process.env.NPC_API_KEY;
}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到 ${who} 的冒用配置`);}
let serial=0;
const send=(state,room,text,label)=>dispatchParty(state,{id:`deception32-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text});
function stageTurn(state,turn,who){
 const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}`),staged=stageParty(next,{enabled:true,type:'text',room:who,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${who}/${turn.id} 没有进入有效的 3.2 单次表达上下文`);
 const actual=staged.context.deception?.decision.strategy;
 if(actual!==turn.strategy)throw new Error(`${who}/${turn.id} 策略不一致：${actual} != ${turn.strategy}`);
 if(turn.reason&&!staged.context.deception.decision.reasonCodes.includes(turn.reason))throw new Error(`${who}/${turn.id} 缺少原因 ${turn.reason}`);
 return staged;
}
async function callModel(context,key){
 let rawContent='',rawData=null;
 const fetcher=async(url,options)=>{
  const response=await fetch(url,options),copy=response.clone();
  try{const envelope=await copy.json();rawContent=String(envelope?.choices?.[0]?.message?.content??'');try{rawData=JSON.parse(rawContent);}catch{}}catch{}
  return response;
 };
 const started=performance.now(),result=await generateNpc(context,{key,fetcher});
 return {result,rawContent,rawData,endToEndMs:Math.round(performance.now()-started)};
}
const rawText=(data,content)=>typeof data?.text==='string'?data.text:Array.isArray(data?.lines)?data.lines.filter(x=>typeof x==='string').join('\n'):content;

const planned=[];
for(const who of ids){
 let state=freshParty(seedForDanger(who));state.chapter=2;
 const other=ids.find(id=>id!==who),marker=`三二隔离标记-${who}`;
 state=send(state,other,`这句只在另一个私聊：${marker}。`,`${who}-other-private`);
 for(const turn of turns){
  const staged=stageTurn(state,turn,who);
  if(JSON.stringify(staged.context).includes(marker))throw new Error(`${who}/${turn.id} 混入另一私聊`);
  planned.push({who,turn,marker,staged});
  state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 }
}

// Necessary evidence verification must remain on the deterministic path and
// must not be replaced by deception expression generation.
let evidence=freshParty(0);evidence.chapter=2;
const evidenceStart=evidence.messages.length;
evidence=send(evidence,evidence.case.danger,'我先核对原始记录和现场证据，你别催。','evidence-priority');
const evidenceReply=evidence.messages.slice(evidenceStart).find(message=>message.from===evidence.case.danger);
const evidenceMeta=readDeceptionMetadata(evidenceReply?.ai?.deception);
const evidenceStage=stageParty(evidence,{enabled:true,type:'text',room:evidence.case.danger,startIndex:evidenceStart});
const offline={planned:planned.length,evidencePriority:evidenceMeta?.reasonCodes.includes('EVIDENCE_VERIFICATION_PRIORITY')===true&&evidenceStage.context===null};

const key=live?await loadKey():null;
if(live&&!key){console.error('真实 3.2 评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const rows=[];let calls=0,promptTokens=0,completionTokens=0;
if(live&&key){
 for(const who of ids){
  let state=freshParty(seedForDanger(who));state.chapter=2;
  const other=ids.find(id=>id!==who),marker=`三二隔离标记-${who}`;
  state=send(state,other,`这句只在另一个私聊：${marker}。`,`live-${who}-other-private`);
  const shownByStrategy=new Map();
  for(const turn of turns){
   if(calls>=maxCalls)break;
   const staged=stageTurn(state,turn,who),before=authority(staged.state),response=await callModel(staged.context,key);calls++;
   const raw=rawText(response.rawData,response.rawContent),partyChecked=response.rawData?checkPartyOutput(response.rawData,staged.context):{ok:false,code:'RAW_JSON'};
   const strategyChecked=partyChecked.ok?checkDeceptionOutput({text:partyChecked.lines.join('\n'),memoryRefs:partyChecked.memoryRefs},{decision:staged.context.deception.decision,accountId:staged.context.character,memories:staged.context.memories}):{ok:false,code:partyChecked.code};
   state=settleParty(staged.state,staged.state.replyInFlight.token,response.result);
   const shown=state.messages.find(message=>message.id===staged.state.replyInFlight.token)?.text??'',hidden=[state.case.shelter.code,state.people[who].place,marker,'B03'];
   const prior=shownByStrategy.get(turn.strategy)??[];shownByStrategy.set(turn.strategy,[...prior,shown]);
   rows.push({who,seed:state.seed,turn:turn.id,expectedStrategy:turn.strategy,selectedStrategy:staged.context.deception.decision.strategy,
    mode:response.result.mode,guardCode:response.result.guardCode??null,reason:response.result.reason??null,rawContent:response.rawContent,rawData:response.rawData,shown,
    factAudit:partyChecked.ok,strategyAudit:strategyChecked.ok,rawUnauthorized:hidden.some(term=>term&&raw.includes(term))||completedAction.test(raw),
    visibleUnauthorized:hidden.some(term=>term&&shown.includes(term))||completedAction.test(shown),refusalReprobe:turn.id==='location-refusal'&&locationProbe.test(shown),
    personaDrift:personaDrift.test(shown),exactStrategyRepeat:prior.includes(shown),authorityChanged:before!==authority(state),
    requestLatencyMs:response.result.latencyMs??null,endToEndMs:response.endToEndMs,promptTokens:response.result.usage?.prompt??0,completionTokens:response.result.usage?.completion??0});
   promptTokens+=response.result.usage?.prompt??0;completionTokens+=response.result.usage?.completion??0;
  }
 }
}

const latency=rows.map(row=>row.requestLatencyMs).filter(Number.isFinite),endToEnd=rows.map(row=>row.endToEndMs).filter(Number.isFinite);
const rejectionReasons={};for(const row of rows.filter(row=>row.mode!=='ai')){const key=row.guardCode??row.reason??row.mode;rejectionReasons[key]=(rejectionReasons[key]??0)+1;}
const sampleSet=finalHoldout?'final-identity-holdout':supplemental?'supplemental-holdout':'base';
const summary={schema:1,datasetVersion:fixture.version,sampleSet,generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,offline,calls,
 accepted:rows.filter(row=>row.mode==='ai').length,fallbacks:rows.filter(row=>row.mode!=='ai').length,
 auditPassRate:rows.length?rows.filter(row=>row.mode==='ai').length/rows.length:null,
 strategyConformanceRate:rows.length?rows.filter(row=>row.strategyAudit).length/rows.length:null,
 strategyMismatches:rows.filter(row=>row.selectedStrategy!==row.expectedStrategy).length,highRiskOverreach:rows.filter(row=>row.visibleUnauthorized).length,
 rawUnauthorized:rows.filter(row=>row.rawUnauthorized).length,authorityChanges:rows.filter(row=>row.authorityChanged).length,
 evidencePriorityFailures:offline.evidencePriority?0:1,refusalReprobes:rows.filter(row=>row.refusalReprobe).length,
 exactStrategyRepeats:rows.filter(row=>row.exactStrategyRepeat).length,personaDrifts:rows.filter(row=>row.personaDrift).length,
 rejectionReasons,latencyMs:{requestP50:percentile(latency,.5),requestP95:percentile(latency,.95),endToEndP50:percentile(endToEnd,.5),endToEndP95:percentile(endToEnd,.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens}};
if(reportPath)await writeFile(reportPath,JSON.stringify({...summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
const expectedPlans=ids.length*turns.length;
if(offline.planned!==expectedPlans||!offline.evidencePriority||summary.strategyMismatches||summary.highRiskOverreach||summary.authorityChanges||summary.evidencePriorityFailures)process.exitCode=1;
