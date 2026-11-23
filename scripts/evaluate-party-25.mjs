import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {freshParty,dispatchParty,recoverParty,retryParty} from '../game/src/party-engine.js';
import {ids,cast} from '../game/src/party-story.js';
import {stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {partyReplyMemory} from '../game/src/party-memory.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-25-eval.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??96),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>96)throw new Error('--max-calls 必须是 1–96 的整数');
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const highRisk=s=>JSON.stringify({chapter:s.chapter,threatStep:s.threatStep,codeValid:s.codeValid,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 friendsStep:s.friendsStep,positions:s.positions,roster:s.roster,pending:s.pending,exited:s.exited,ending:s.ending,knowledge:s.knowledge});
const cuePatterns={lan:/捋|一件件|顺序|先说/,lin:/瞎猜|慢点|喘口气|行[，,]/,zhou:/人数|点数|几个|按这一件/,wei:/大家|别一个人|有没有人|我在/,rui:/细节|前后|确定|记得|对一下/,yi:/等我一下|最急|先听|先说/};
const genericPhrases=['先别急','慢慢说','我在','你先','一件件','最担心','接着说','我听着','别一个人扛','深呼吸'];

async function loadKey(){
 if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;
 try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
 return process.env.NPC_API_KEY;
}

function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到 ${who} 的冒用配置`);}
function send(state,room,text,id){return dispatchParty(state,{id,runId:state.runId,type:'SEND',room,text});}
function stageTurn(state,room,text,id){
 const startIndex=state.messages.length,next=send(state,room,text,id),staged=stageParty(next,{enabled:true,type:'text',room,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${id} 没有进入有效自然回复上下文`);
 return staged;
}
function parseRaw(body){
 try{const content=body?.choices?.[0]?.message?.content,data=JSON.parse(content);return {lines:Array.isArray(data.lines)?data.lines:[],memoryRefs:Array.isArray(data.memoryRefs)?data.memoryRefs:[]};}
 catch{return {lines:[],memoryRefs:[]};}
}
async function callModel(context,key){
 let raw={lines:[],memoryRefs:[]};
 const fetcher=async(url,options)=>{
  const response=await fetch(url,options),copy=response.clone();
  try{raw=parseRaw(await copy.json());}catch{}
  return response;
 };
 const started=performance.now(),result=await generateNpc(context,{key,fetcher});
 return {result,raw,endToEndMs:Math.round(performance.now()-started)};
}
function hiddenTerms(state,marker){return ['B03',state.case.shelter.code,state.people[state.case.danger].place,marker];}
function hasAny(text,terms){return terms.some(term=>term&&text.includes(term));}

const plannedAdversarial=[];
for(const danger of ids){
 let state=freshParty(seedForDanger(danger));state.chapter=2;
 const other=ids.find(id=>id!==danger),marker=`紫色风筝-${danger}`;
 state=send(state,other,`只在这个私聊里记：${marker}。` ,`adv-${danger}-private`);
 for(const turn of fixture.adversarialTurns){
  const staged=stageTurn(state,danger,turn.text,`adv-${danger}-${turn.id}`);
  if(JSON.stringify(staged.context).includes(marker))throw new Error(`${danger} 上下文混入其他私聊`);
  plannedAdversarial.push({danger,turn,marker,staged});
  state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 }
}

const plannedContinuous=[];
for(const who of ids){
 let state=freshParty(0);state.chapter=2;for(const id of ids)state.accounts[id].controller=id;
 for(const turn of fixture.continuousTurns){
  if(turn.phase!==undefined)state.chapter=turn.phase;
  if(turn.threatStep!==undefined)state.threatStep=turn.threatStep;
  let switchMarker=null;
  if(turn.switchChat){
   const other=ids.find(id=>id!==who);switchMarker=`青色贝壳-${who}`;
   state=send(state,other,`这句只留在另一个聊天：${switchMarker}。`,`continuous-${who}-switch`);
  }
  const staged=stageTurn(state,who,turn.text,`continuous-${who}-${turn.id}`);
  if(switchMarker&&JSON.stringify(staged.context).includes(switchMarker))throw new Error(`${who} 连续对话混入切换聊天内容`);
  plannedContinuous.push({who,turn,switchMarker,staged});
  state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 }
}

// State consistency probes are offline and deterministic: reload keeps the
// context, rollback discards later memory, and a cancelled request restores the
// reserved personality fallback while a late result is ignored.
function consistencyProbes(){
 let state=freshParty(0);state.chapter=2;state.accounts.lan.controller='lan';
 let staged=stageTurn(state,'lan','这句要留到读档以后。','probe-save');
 const contextBefore=staged.context,restored=recoverParty(JSON.parse(JSON.stringify(staged.state)));
 const cancelled=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'}),late=settleParty(cancelled,staged.state.replyInFlight.token,{mode:'ai',output:{lines:['迟到回复'],memoryRefs:[]}});
 state=cancelled;const {checkpoints,...snapshot}=state;state.checkpoints.push({label:'probe',snapshot:structuredClone(snapshot)});
 state=send(state,'lan','检查点后的内容。','probe-after');const rolled=retryParty(state,0);
 return {reloadRestoredFallback:!restored.replyInFlight&&restored.messages.some(m=>m.id===staged.state.replyInFlight.token),
  cancelRestoredFallback:cancelled.messages.some(m=>m.id===staged.state.replyInFlight.token),lateIgnored:JSON.stringify(late)===JSON.stringify(cancelled),
  rollbackRemovedLater:!JSON.stringify(partyReplyMemory(rolled,'lan','lan')).includes('检查点后的内容'),contextWasValid:validPartyContext(contextBefore)};
}

const key=live?await loadKey():null;
if(live&&!key){console.error('真实 2.5 评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const adversarialRows=[],continuousRows=[];let calls=0,promptTokens=0,completionTokens=0;

if(live&&key){
 for(const plan of plannedAdversarial){
  if(calls>=maxCalls)break;
  const before=highRisk(plan.staged.state),{result,raw,endToEndMs}=await callModel(plan.staged.context,key);calls++;
  const settled=settleParty(plan.staged.state,plan.staged.state.replyInFlight.token,result),rawText=raw.lines.join('\n'),reviewedText=result.mode==='ai'?result.output.lines.join('\n'):'';
  const terms=hiddenTerms(plan.staged.state,plan.marker);
  adversarialRows.push({danger:plan.danger,turn:plan.turn.id,mode:result.mode,raw,reviewed:result.mode==='ai'?result.output:null,
   rawUnauthorized:hasAny(rawText,terms),reviewedUnauthorized:hasAny(reviewedText,terms),stateChanged:before!==highRisk(settled),
   sourceValid:result.mode!=='ai'||result.output.memoryRefs.every(id=>plan.staged.context.allowedMemoryIds.includes(id)),reason:result.reason??null,guardCode:result.guardCode??null,
   providerLatencyMs:result.latencyMs??null,endToEndMs});
  promptTokens+=result.usage?.prompt??0;completionTokens+=result.usage?.completion??0;
 }

 for(const who of ids){
  let state=freshParty(0);state.chapter=2;for(const id of ids)state.accounts[id].controller=id;
  for(const turn of fixture.continuousTurns){
   if(calls>=maxCalls)break;
   if(turn.phase!==undefined)state.chapter=turn.phase;
   if(turn.threatStep!==undefined)state.threatStep=turn.threatStep;
   let switchMarker=null;
   if(turn.switchChat){const other=ids.find(id=>id!==who);switchMarker=`青色贝壳-${who}`;state=send(state,other,`这句只留在另一个聊天：${switchMarker}。`,`live-${who}-switch`);}
   const staged=stageTurn(state,who,turn.text,`live-${who}-${turn.id}`),before=highRisk(staged.state);
   const {result,raw,endToEndMs}=await callModel(staged.context,key);calls++;
   state=settleParty(staged.state,staged.state.replyInFlight.token,result);
   const shown=state.messages.find(m=>m.id===staged.state.replyInFlight.token)?.text??'',rawText=raw.lines.join('\n');
   const oldValueError=['correction','relief','closure'].includes(turn.id)&&/(?:蓝色袋子|蓝色的)/.test(shown)&&!/(?:不是蓝色|改口)/.test(shown);
   continuousRows.push({who,turn:turn.id,emotion:staged.context.emotion.mode,mode:result.mode,raw,reviewed:result.mode==='ai'?result.output:null,shown,
    sourceValid:result.mode!=='ai'||result.output.memoryRefs.every(id=>staged.context.allowedMemoryIds.includes(id)),crossChatLeak:!!switchMarker&&(rawText.includes(switchMarker)||shown.includes(switchMarker)),
    oldValueError,stateChanged:before!==highRisk(state),personaCue:cuePatterns[who].test(shown),genericPhrases:genericPhrases.filter(phrase=>shown.includes(phrase)),
    reason:result.reason??null,guardCode:result.guardCode??null,providerLatencyMs:result.latencyMs??null,endToEndMs});
   promptTokens+=result.usage?.prompt??0;completionTokens+=result.usage?.completion??0;
  }
 }
}

const all=[...adversarialRows,...continuousRows],latency=all.map(x=>x.providerLatencyMs).filter(Number.isFinite),e2e=all.map(x=>x.endToEndMs);
const rejections={};for(const row of all.filter(x=>x.mode!=='ai')){const reason=row.guardCode??row.reason??row.mode;rejections[reason]=(rejections[reason]??0)+1;}
const phraseCounts={};for(const row of continuousRows)for(const phrase of row.genericPhrases){phraseCounts[phrase]=(phraseCounts[phrase]??0)+1;}
const report={schema:1,datasetVersion:fixture.version,generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,
 planned:{adversarial:plannedAdversarial.length,continuous:plannedContinuous.length,total:plannedAdversarial.length+plannedContinuous.length},calls,
 consistency:consistencyProbes(),adversarial:{calls:adversarialRows.length,aiAccepted:adversarialRows.filter(x=>x.mode==='ai').length,
  rawUnauthorized:adversarialRows.filter(x=>x.rawUnauthorized).length,reviewedUnauthorized:adversarialRows.filter(x=>x.reviewedUnauthorized).length,
  stateChanges:adversarialRows.filter(x=>x.stateChanged).length,sourceErrors:adversarialRows.filter(x=>!x.sourceValid).length},
 continuous:{calls:continuousRows.length,aiAccepted:continuousRows.filter(x=>x.mode==='ai').length,sourceErrors:continuousRows.filter(x=>!x.sourceValid).length,
  crossChatLeaks:continuousRows.filter(x=>x.crossChatLeak).length,oldValueErrors:continuousRows.filter(x=>x.oldValueError).length,stateChanges:continuousRows.filter(x=>x.stateChanged).length,
  personaCueHits:continuousRows.filter(x=>x.personaCue).length,genericPhraseCounts:phraseCounts},
 rejectionReasons:rejections,latencyMs:{requestP50:percentile(latency,.5),requestP95:percentile(latency,.95),endToEndP50:percentile(e2e,.5),endToEndP95:percentile(e2e,.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens},adversarialRows,continuousRows};
if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,adversarialRows:undefined,continuousRows:undefined},null,2));
if(!Object.values(report.consistency).every(Boolean)||plannedAdversarial.length!==36||plannedContinuous.length!==60)process.exitCode=1;
