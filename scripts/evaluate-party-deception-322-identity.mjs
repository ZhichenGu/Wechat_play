import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {checkPartyOutput,stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {checkDeceptionOutput,reviewIdentityAssertion} from '../game/src/party-deception.js';
import {checkReplyPlanOutput} from '../game/src/party-reply-plan.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-deception-322-identity-confirm.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??18),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(maxCalls!==18)throw new Error('3.2.2 身份确认留出集固定为 18 次调用');
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const authority=s=>JSON.stringify({chapter:s.chapter,clock:s.clock,flags:s.flags,threatStep:s.threatStep,codeValid:s.codeValid,blocked:s.blocked,
 positions:s.positions,people:s.people,accounts:s.accounts,devices:s.devices,knowledge:s.knowledge,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 friendsStep:s.friendsStep,roster:s.roster,pending:s.pending,exited:s.exited,ending:s.ending,reason:s.reason});
const genericQuestion=/(?:哪句|哪句话|哪里|哪儿|什么地方|指出|具体).{0,10}[?？]/u;
async function loadKey(){if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}return process.env.NPC_API_KEY;}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到 ${who}`);}
let serial=0;
const send=(state,room,text,label)=>dispatchParty(state,{id:`deception322-confirm-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text});
function stageTurn(state,turn,who){
 const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}`),staged=stageParty(next,{enabled:true,type:'text',room:who,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${who}/${turn.id} 未进入表达上下文`);
 const decision=staged.context.deception?.decision;
 if(decision?.strategy!==turn.strategy||!decision.reasonCodes.includes(turn.reason)||staged.context.replyPlan.kind!==turn.planKind)throw new Error(`${who}/${turn.id} 本地计划不一致`);
 return staged;
}
async function callModel(context,key){
 let rawContent='',rawData=null,rawUsage={};
 const fetcher=async(url,options)=>{const response=await fetch(url,options),copy=response.clone();try{const body=await copy.json();rawContent=String(body?.choices?.[0]?.message?.content??'');rawUsage=body?.usage??{};try{rawData=JSON.parse(rawContent);}catch{}}catch{}return response;};
 const started=performance.now(),result=await generateNpc(context,{key,fetcher});
 return {result,rawContent,rawData,rawUsage,endToEndMs:Math.round(performance.now()-started)};
}

const offline=[];
for(const who of ids){let state=freshParty(seedForDanger(who));state.chapter=2;for(const turn of fixture.turns){const staged=stageTurn(state,turn,who);offline.push({who,turn:turn.id,kind:staged.context.replyPlan.kind});state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});}}
const key=live?await loadKey():null;if(live&&!key){console.error('真实身份确认集未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const rows=[];let calls=0,promptTokens=0,completionTokens=0,cacheHitTokens=0,cacheMissTokens=0;
if(live&&key){
 for(const who of ids){
  let state=freshParty(seedForDanger(who));state.chapter=2;let genericSeen=false;
  for(const turn of fixture.turns){
   const staged=stageTurn(state,turn,who),before=authority(staged.state),response=await callModel(staged.context,key);calls++;
   const party=response.rawData?checkPartyOutput(response.rawData,staged.context):{ok:false,code:'RAW_JSON'};
   const normalized=party.ok?{text:party.lines.join('\n'),memoryRefs:party.memoryRefs}:null;
   const strategy=normalized?checkDeceptionOutput(normalized,{decision:staged.context.deception.decision,accountId:who,memories:staged.context.memories}):{ok:false,code:party.code};
   const plan=normalized&&strategy.ok?checkReplyPlanOutput(normalized,{plan:staged.context.replyPlan,accountId:who,memories:staged.context.memories}):{ok:false,code:strategy.code??party.code};
   const rawText=typeof response.rawData?.text==='string'?response.rawData.text:response.rawContent,identity=reviewIdentityAssertion(rawText);
   state=settleParty(staged.state,staged.state.replyInFlight.token,response.result);
   const shown=state.messages.find(message=>message.id===staged.state.replyInFlight.token)?.text??'',generic=genericQuestion.test(shown);
   rows.push({who,turn:turn.id,class:turn.class,mode:response.result.mode,guardCode:response.result.guardCode??null,rawContent:response.rawContent,rawData:response.rawData,shown,
    partyAudit:party.ok,strategyAudit:strategy.ok,planAudit:plan.ok,identityCompliant:identity.ok,identityCategory:identity.category,
    strictAudit:party.ok&&strategy.ok&&plan.ok&&identity.ok,visibleFallback:response.result.mode!=='ai',genericQuestion:generic,genericRepeat:generic&&genericSeen,
    authorityChanged:before!==authority(state),requestLatencyMs:response.result.latencyMs??null,endToEndMs:response.endToEndMs,
    promptTokens:response.rawUsage.prompt_tokens??0,completionTokens:response.rawUsage.completion_tokens??0,cacheHitTokens:response.rawUsage.prompt_cache_hit_tokens??0,cacheMissTokens:response.rawUsage.prompt_cache_miss_tokens??0});
   genericSeen=genericSeen||generic;promptTokens+=response.rawUsage.prompt_tokens??0;completionTokens+=response.rawUsage.completion_tokens??0;
   cacheHitTokens+=response.rawUsage.prompt_cache_hit_tokens??0;cacheMissTokens+=response.rawUsage.prompt_cache_miss_tokens??0;
  }
 }
}
const latency=rows.map(row=>row.requestLatencyMs).filter(Number.isFinite),end=rows.map(row=>row.endToEndMs).filter(Number.isFinite),rejections={};
for(const row of rows.filter(row=>!row.strictAudit)){const key=row.guardCode??row.identityCategory??'AUDIT';rejections[key]=(rejections[key]??0)+1;}
const summary={schema:1,datasetVersion:fixture.version,sampleSet:'deception-322-postfix-identity-holdout',generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,
 offlinePlanned:offline.length,calls,strictPasses:rows.filter(row=>row.strictAudit).length,strictPassRate:rows.length?rows.filter(row=>row.strictAudit).length/rows.length:null,
 accountControlClaims:rows.filter(row=>['account_control','verified_identity','onsite_confirmation','private_memory_proof'].includes(row.identityCategory)).length,
 visibleFallbacks:rows.filter(row=>row.visibleFallback).length,genericQuestions:rows.filter(row=>row.genericQuestion).length,genericQuestionRepeats:rows.filter(row=>row.genericRepeat).length,
 authorityChanges:rows.filter(row=>row.authorityChanged).length,rejectionReasons:rejections,
 latencyMs:{requestP50:percentile(latency,.5),requestP95:percentile(latency,.95),endToEndP50:percentile(end,.5),endToEndP95:percentile(end,.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens,cacheHitTokens,cacheMissTokens}};
if(reportPath)await writeFile(reportPath,JSON.stringify({...summary,rows},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
if(summary.offlinePlanned!==18||summary.authorityChanges)process.exitCode=1;
