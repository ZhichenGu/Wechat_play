import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {freshParty,dispatchParty} from '../game/src/party-engine.js';
import {classify} from '../game/src/party-intents.js';
import {intentContext,intentRisk,reviewCandidateIntents,shouldInterpret,validatedCandidateIntents} from '../game/src/party-ai.js';
import {stageParty} from '../game/src/party-dialogue.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const fixturePath=resolve(root,String(args.get('--fixture')??'tests/fixtures/party-intent-eval.json'));
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
const live=args.has('--live');
const requested=Number(args.get('--max-calls')??fixture.cases.length);
if(!Number.isInteger(requested)||requested<1||requested>50)throw new Error('--max-calls 必须是 1–50 的整数');
const reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
const setEqual=(a,b)=>a.length===b.length&&a.every(value=>b.includes(value));
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;

function routeFor(item){
 if(shouldInterpret(item.text))return 'intent';
 if(classify(item.text)!=='chat')return 'local';
 const state=makeState(item),startIndex=state.messages.length;
 const next=dispatchParty(state,{id:`path-${item.id}`,runId:state.runId,type:'SEND',room:'lan',text:item.text});
 return stageParty(next,{enabled:true,type:'text',room:'lan',startIndex}).context?'expression':'local';
}
function makeState(item){
 const state=freshParty(0);state.chapter=2;state.flags.identity=true;
 for(const [index,message] of (item.history??[]).entries())state.messages.push({id:`eval-history-${index}`,room:'lan',from:message.from,text:message.content,type:'text',tick:0,deliveredTo:message.from==='me'?['lan']:['me']});
 return state;
}
function makeContext(state,item){
 const quote=item.quote?{id:`eval-quote-${item.id}`,from:item.quote.from,content:item.quote.content}:null;
 return intentContext(state,'lan',item.text,quote);
}
const candidate=(intent,item)=>({intent,target:'lan',params:intent==='clarify'?{topic:item.clarifyTopic??'object'}:{},confidence:.95,uncertain:false});
const highRisk=s=>JSON.stringify({pending:s.pending,positions:s.positions,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 threatStep:s.threatStep,codeValid:s.codeValid,exited:s.exited,ending:s.ending,leakedRoutes:s.flags.leakedRoutes,
 dangerFacts:s.knowledge[s.case.danger].facts});

const offline=[];
for(const item of fixture.cases){
 const state=makeState(item),localKind=classify(item.text),expectedModel=item.expectedModel??item.expectedAccepted;
 const context=makeContext(state,item),oracle=expectedModel.map(intent=>candidate(intent,item));
 const reviewed=reviewCandidateIntents(item.text,localKind,oracle,['lan'],context.dialogue),accepted=reviewed.accepted.map(x=>x.intent);
 const attack=(item.attackCandidates??[]).map(intent=>candidate(intent,item)),attackAccepted=validatedCandidateIntents(item.text,localKind,attack,['lan'],context.dialogue).map(x=>x.intent);
 const attackOk=!item.attackCandidates?.length||attackAccepted.every(intent=>item.expectedAccepted.includes(intent));
 const baseEvent={id:`base-${item.id}`,runId:state.runId,type:'SEND',room:'lan',text:item.text,intentRevision:state.seq,intentEventCount:state.events.length};
 const without=dispatchParty(state,baseEvent),withCandidates=dispatchParty(state,{...baseEvent,id:`ai-${item.id}`,intentCandidates:oracle});
 const pathActual=routeFor(item);
 const highRiskDifference=highRisk(without)!==highRisk(withCandidates);
 const highRiskIntentMisexecution=accepted.some(intent=>intentRisk[intent]==='progress'&&!item.expectedAccepted.includes(intent));
 const unexpectedHighRisk=highRiskIntentMisexecution||(highRiskDifference&&!item.allowHighRiskChange);
 offline.push({id:item.id,pathExpected:item.path,pathActual,localKind,expectedAccepted:item.expectedAccepted,
  accepted,clarified:!!reviewed.clarification,attackAccepted,pass:item.path===pathActual&&setEqual(accepted,item.expectedAccepted)&&
   !!reviewed.clarification===!!item.expectClarification&&attackOk&&!unexpectedHighRisk,
  highRiskDifference,highRiskIntentMisexecution,unexpectedHighRisk});
}

async function failureProbes(){
 const item=fixture.cases.find(x=>x.path==='intent'),context=makeContext(makeState(item),item),key='evaluation-placeholder';
 const cases=[
  ['invalid-json',async()=>Response.json({choices:[{message:{content:'not-json'}}]})],
  ['schema-rejected',async()=>Response.json({choices:[{message:{content:JSON.stringify({candidates:[{intent:'open',target:'lan',params:{},confidence:1,uncertain:false}]})}}]})],
  ['rate-limited',async()=>new Response('',{status:429})],
  ['network-failure',async()=>{throw new Error('offline probe')}]
 ];
 const results=[];
 for(const [name,fetcher] of cases){const result=await generateNpc(context,{key,fetcher});results.push({name,mode:result.mode,reason:result.reason,guardCode:result.guardCode});}
 return results;
}

async function loadLocalKey(){
 if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;
 const file=resolve(root,'.dev.vars');
 try{await access(file);process.loadEnvFile(file);}catch{}
 return process.env.NPC_API_KEY;
}

const liveRows=[];let calls=0,promptTokens=0,completionTokens=0;
if(live){
 const key=await loadLocalKey();
 if(!key){console.error('真实评测未运行：未找到 NPC_API_KEY。请在环境变量或仓库根目录 .dev.vars 中配置。');process.exitCode=2;}
 else{
  for(const item of fixture.cases.filter(x=>x.path==='intent').slice(0,requested)){
   const state=makeState(item),context=makeContext(state,item),started=performance.now();
   const result=await generateNpc(context,{key});calls++;
   const endToEndMs=Math.round(performance.now()-started),raw=result.mode==='ai'?(result.output.candidates??[]):[];
   const modelIntents=[...new Set(raw.map(x=>x.intent).filter(x=>x!=='chat'))],expectedModel=item.expectedModel??item.expectedAccepted;
   const reviewed=reviewCandidateIntents(item.text,classify(item.text),raw,['lan'],context.dialogue),accepted=reviewed.accepted.map(x=>x.intent);
   promptTokens+=result.usage?.prompt??0;completionTokens+=result.usage?.completion??0;
   const baseEvent={id:`live-base-${item.id}`,runId:state.runId,type:'SEND',room:'lan',text:item.text,intentRevision:state.seq,intentEventCount:state.events.length};
   const without=dispatchParty(state,baseEvent),withCandidates=dispatchParty(state,{...baseEvent,id:`live-ai-${item.id}`,intentCandidates:raw});
   liveRows.push({id:item.id,category:item.category,risk:item.risk??null,allowHighRiskChange:!!item.allowHighRiskChange,mode:result.mode,candidates:raw,expectedModel,modelIntents,expectedAccepted:item.expectedAccepted,accepted,clarified:!!reviewed.clarification,
    modelPass:result.mode==='ai'&&setEqual(modelIntents,expectedModel),acceptedPass:result.mode==='ai'&&setEqual(accepted,item.expectedAccepted),
    clarificationPass:!!reviewed.clarification===!!item.expectClarification,
    highRiskDifference:highRisk(without)!==highRisk(withCandidates),highRiskIntentMisexecution:accepted.some(intent=>intentRisk[intent]==='progress'&&!item.expectedAccepted.includes(intent)),
    providerLatencyMs:result.latencyMs??null,endToEndMs,reason:result.reason??null,guardCode:result.guardCode??null});
   if(['密钥验证失败','账户余额不足'].includes(result.reason))break;
  }
 }
}

const failures=await failureProbes();
const latency=liveRows.map(x=>x.providerLatencyMs).filter(Number.isFinite),e2e=liveRows.map(x=>x.endToEndMs);
const rejected={};for(const row of liveRows.filter(x=>x.mode!=='ai')){const key=row.guardCode??row.reason??row.mode;rejected[key]=(rejected[key]??0)+1;}
const reviewSummary={modelOmissionCases:liveRows.filter(x=>x.expectedAccepted.length&&x.expectedAccepted.some(intent=>!x.modelIntents.includes(intent))).length,
 correctLabelRejectedCases:liveRows.filter(x=>x.modelPass&&!x.acceptedPass).length,
 unexpectedCandidateSafelyRejectedCases:liveRows.filter(x=>!x.expectedAccepted.length&&x.modelIntents.length&&x.acceptedPass).length};
const lowRiskRows=liveRows.filter(x=>x.risk==='low'&&x.expectedAccepted.length),clarificationRows=liveRows.filter(x=>x.expectClarification||fixture.cases.find(item=>item.id===x.id)?.expectClarification);
const report={schema:1,datasetVersion:fixture.version,generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,
 fixture:fixturePath.slice(root.length+1),
 datasetCases:fixture.cases.length,intentCases:fixture.cases.filter(x=>x.path==='intent').length,offline:{passed:offline.filter(x=>x.pass).length,
  failed:offline.filter(x=>!x.pass).length,highRiskDifferences:offline.filter(x=>x.highRiskDifference).length,rows:offline},failureProbes:failures,
 live:{calls,modelExact:calls?liveRows.filter(x=>x.modelPass).length:null,modelAccuracy:calls?liveRows.filter(x=>x.modelPass).length/calls:null,
  acceptedExact:calls?liveRows.filter(x=>x.acceptedPass).length:null,acceptedAccuracy:calls?liveRows.filter(x=>x.acceptedPass).length/calls:null,
  lowRiskRecall:lowRiskRows.length?lowRiskRows.filter(x=>x.acceptedPass).length/lowRiskRows.length:null,
  lowRiskHits:lowRiskRows.length?lowRiskRows.filter(x=>x.acceptedPass).length:null,lowRiskCases:lowRiskRows.length,
  clarificationRate:clarificationRows.length?clarificationRows.filter(x=>x.clarificationPass).length/clarificationRows.length:null,
  clarificationHits:clarificationRows.length?clarificationRows.filter(x=>x.clarificationPass).length:null,clarificationCases:clarificationRows.length,
  highRiskMisexecution:liveRows.filter(x=>x.highRiskIntentMisexecution||(x.highRiskDifference&&!x.allowHighRiskChange)).length,latencyMs:{requestP50:percentile(latency,.5),requestP95:percentile(latency,.95),endToEndP50:percentile(e2e,.5),endToEndP95:percentile(e2e,.95)},
  usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens},providerRejectedReasons:rejected,engineReview:reviewSummary,rows:liveRows}};
if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,offline:{...report.offline,rows:undefined},live:{...report.live,rows:undefined}},null,2));
if(report.offline.failed||report.offline.highRiskDifferences)process.exitCode=1;
