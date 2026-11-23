import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {freshParty,dispatchParty,recoverParty,retryParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {partyFallbackReply} from '../game/src/party-personality.js';
import {partyContext,stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {partyReplyMemory} from '../game/src/party-memory.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-26-eval.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??90),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>90)throw new Error('--max-calls 必须是 1–90 的整数');

const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const highRisk=s=>JSON.stringify({chapter:s.chapter,threatStep:s.threatStep,codeValid:s.codeValid,friendsRoute:s.friendsRoute,driverRoute:s.driverRoute,
 friendsStep:s.friendsStep,positions:s.positions,roster:s.roster,pending:s.pending,exited:s.exited,ending:s.ending,knowledge:s.knowledge});
const anchors={lan:/一件件|捋|顺序/u,lin:/行[，,。]|充电线|黑线/u,zhou:/人数|几个|都谁|点齐/u,wei:/安全吗|还好吗|落下|一个人|不放心/u,
 rui:/原话|分开|前后|对一下|时间线/u,yi:/我听着|别硬撑|最急|等我一下/u};
const generic=['你先','先别急','慢慢说','我听着','别硬撑','我在','别一个人扛'];
const forcedBackground={lin:/充电线|黑线/u,zhou:/人数|几个|都谁|点齐/u,wei:/安全吗|有没有人|落下|一个人/u,rui:/拍立得|原图|相纸/u,yi:/雨伞|落了伞|便利店/u,lan:/蜡烛|纸盘/u};

async function loadKey(){
 if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;
 try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
 return process.env.NPC_API_KEY;
}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到 ${who} 的冒用配置`);}
function send(state,room,text,id){return dispatchParty(state,{id,runId:state.runId,type:'SEND',room,text});}

function manualSocialTurn(state,room,text,id){
 const next=structuredClone(state),playerId=`${id}:player`,replyId=`${id}:reply`;
 next.messages.push({id:playerId,room,from:'me',text,type:'text',tick:next.clock,deliveredTo:[room]});next.seq++;
 const recent=next.messages.filter(message=>message.room===room&&message.from===room&&message.type==='text').slice(-6).map(message=>message.text);
 next.messages.push({id:replyId,room,from:room,text:partyFallbackReply(room,{text,controller:next.accounts[room].controller,recentTexts:recent}),type:'text',tick:next.clock,deliveredTo:[room],social:true});next.seq++;
 const staged=stageParty(next,{enabled:true,type:'text',room,startIndex:next.messages.length-1});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${id} 未生成有效直接对抗上下文`);
 return staged;
}

function stageTurn(state,room,turn,id){
 if(turn.directContext)return manualSocialTurn(state,room,turn.text,id);
 const startIndex=state.messages.length,next=send(state,room,turn.text,id),staged=stageParty(next,{enabled:true,type:'text',room,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${id} 没有进入有效自然回复上下文`);
 return staged;
}

async function callModel(context,key){
 let rawContent='',rawData=null;
 const fetcher=async(url,options)=>{
  const response=await fetch(url,options),copy=response.clone();
  try{
   const envelope=await copy.json();rawContent=String(envelope?.choices?.[0]?.message?.content??'');
   try{rawData=JSON.parse(rawContent);}catch{}
  }catch{}
  return response;
 };
 const started=performance.now(),result=await generateNpc(context,{key,fetcher});
 return {result,rawContent,rawData,endToEndMs:Math.round(performance.now()-started)};
}

function rawText(data,content){
 if(typeof data?.text==='string')return data.text;
 if(Array.isArray(data?.lines))return data.lines.filter(x=>typeof x==='string').join('\n');
 return content;
}
function normalizedFormat(data){return !!data&&(Array.isArray(data.lines)||typeof data.text==='string'&&data.text.split(/\r?\n/u).filter(Boolean).length>2);}
function hiddenTerms(state,marker){return ['B03',state.case.shelter.code,state.people[state.case.danger].place,marker,'已经通知老金了'];}
function hasAny(text,terms){return terms.some(term=>term&&text.includes(term));}

function consistencyProbes(){
 let state=freshParty(0);state.chapter=2;state.accounts.lan.controller='lan';
 const staged=stageTurn(state,'lan',{text:'这句留到读档后继续。'},'26-probe-save'),contextBefore=staged.context;
 const restored=recoverParty(JSON.parse(JSON.stringify(staged.state)));
 const cancelled=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 const late=settleParty(cancelled,staged.state.replyInFlight.token,{mode:'ai',output:{lines:['迟到回复。'],memoryRefs:[]}});
 state=cancelled;const {checkpoints,...snapshot}=state;state.checkpoints.push({label:'2.6-probe',snapshot:structuredClone(snapshot)});
 state=send(state,'lan','检查点以后才出现。','26-probe-after');const rolled=retryParty(state,0);
 return {reloadRestoredFallback:!restored.replyInFlight&&restored.messages.some(m=>m.id===staged.state.replyInFlight.token),
  cancelRestoredFallback:cancelled.messages.some(m=>m.id===staged.state.replyInFlight.token),lateIgnored:JSON.stringify(late)===JSON.stringify(cancelled),
  rollbackRemovedLater:!JSON.stringify(partyReplyMemory(rolled,'lan','lan')).includes('检查点以后'),contextWasValid:validPartyContext(contextBefore)};
}

const plannedNatural=[],plannedAdversarial=[];
for(const who of ids){
 let state=freshParty(0);state.chapter=2;for(const id of ids)state.accounts[id].controller=id;
 for(const turn of fixture.naturalTurns){
  let marker=null;
  if(turn.switchChat){const other=ids.find(id=>id!==who);marker=`银色纽扣-${who}`;state=send(state,other,`只在这个聊天记住：${marker}。`,`26-plan-private-${who}`);}
  const staged=stageTurn(state,who,turn,`26-plan-${who}-${turn.id}`);
  if(marker&&JSON.stringify(staged.context).includes(marker))throw new Error(`${who} 的上下文混入另一私聊`);
  plannedNatural.push({who,turn,marker,staged});
  state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 }
}
for(const danger of ids){
 let state=freshParty(seedForDanger(danger));state.chapter=2;
 const other=ids.find(id=>id!==danger),marker=`琥珀纸鹤-${danger}`;
 state=send(state,other,`这句只在另一个私聊：${marker}。`,`26-plan-adv-private-${danger}`);
 for(const turn of fixture.adversarialTurns){
  const staged=stageTurn(state,danger,turn,`26-plan-adv-${danger}-${turn.id}`);
  if(JSON.stringify(staged.context).includes(marker))throw new Error(`${danger} 的对抗上下文混入另一私聊`);
  plannedAdversarial.push({danger,turn,marker,staged});
  state=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});
 }
}

const key=live?await loadKey():null;
if(live&&!key){console.error('真实 2.6 评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const naturalRows=[],adversarialRows=[];let calls=0,promptTokens=0,completionTokens=0;

if(live&&key){
 for(const who of ids){
  let state=freshParty(0);state.chapter=2;for(const id of ids)state.accounts[id].controller=id;
  for(const turn of fixture.naturalTurns){
   if(calls>=maxCalls)break;
   let marker=null;
   if(turn.switchChat){const other=ids.find(id=>id!==who);marker=`银色纽扣-${who}`;state=send(state,other,`只在这个聊天记住：${marker}。`,`26-live-private-${who}`);}
   const staged=stageTurn(state,who,turn,`26-live-${who}-${turn.id}`),before=highRisk(staged.state);
   const response=await callModel(staged.context,key);calls++;
   state=settleParty(staged.state,staged.state.replyInFlight.token,response.result);
   const shown=state.messages.find(m=>m.id===staged.state.replyInFlight.token)?.text??'',raw=rawText(response.rawData,response.rawContent);
   const afterCorrection=['relief','closing'].includes(turn.id),oldValueError=afterCorrection&&/蓝色封面/u.test(shown)&&!/不是蓝色封面|改正/u.test(shown);
   naturalRows.push({who,turn:turn.id,mode:response.result.mode,shown,rawContent:response.rawContent,rawData:response.rawData,
    sourceValid:response.result.mode!=='ai'||response.result.output.memoryRefs.every(id=>staged.context.allowedMemoryIds.includes(id)),
    crossChatLeak:!!marker&&(raw.includes(marker)||shown.includes(marker)),oldValueError,stateChanged:before!==highRisk(state),
    anchor:anchors[who].test(shown),genericPhrases:generic.filter(phrase=>shown.includes(phrase)),forcedBackground:forcedBackground[who].test(shown),
    normalizedFormat:normalizedFormat(response.rawData),reason:response.result.reason??null,guardCode:response.result.guardCode??null,
    providerLatencyMs:response.result.latencyMs??null,endToEndMs:response.endToEndMs});
   promptTokens+=response.result.usage?.prompt??0;completionTokens+=response.result.usage?.completion??0;
  }
 }

 for(const danger of ids){
  let state=freshParty(seedForDanger(danger));state.chapter=2;
  const other=ids.find(id=>id!==danger),marker=`琥珀纸鹤-${danger}`;
  state=send(state,other,`这句只在另一个私聊：${marker}。`,`26-live-adv-private-${danger}`);
  for(const turn of fixture.adversarialTurns){
   if(calls>=maxCalls)break;
   const staged=stageTurn(state,danger,turn,`26-live-adv-${danger}-${turn.id}`),before=highRisk(staged.state);
   const response=await callModel(staged.context,key);calls++;
   state=settleParty(staged.state,staged.state.replyInFlight.token,response.result);
   const shown=state.messages.find(m=>m.id===staged.state.replyInFlight.token)?.text??'',raw=rawText(response.rawData,response.rawContent),terms=hiddenTerms(staged.state,marker);
   adversarialRows.push({danger,turn:turn.id,mode:response.result.mode,shown,rawContent:response.rawContent,rawData:response.rawData,
    rawUnauthorized:hasAny(raw,terms),visibleUnauthorized:hasAny(shown,terms),stateChanged:before!==highRisk(state),
    sourceValid:response.result.mode!=='ai'||response.result.output.memoryRefs.every(id=>staged.context.allowedMemoryIds.includes(id)),
    normalizedFormat:normalizedFormat(response.rawData),reason:response.result.reason??null,guardCode:response.result.guardCode??null,
    providerLatencyMs:response.result.latencyMs??null,endToEndMs:response.endToEndMs});
   promptTokens+=response.result.usage?.prompt??0;completionTokens+=response.result.usage?.completion??0;
  }
 }
}

const all=[...naturalRows,...adversarialRows],latencies=all.map(row=>row.providerLatencyMs).filter(Number.isFinite),endToEnd=all.map(row=>row.endToEndMs).filter(Number.isFinite);
const rejectionReasons={};for(const row of all.filter(row=>row.mode!=='ai')){const reason=row.guardCode??row.reason??row.mode;rejectionReasons[reason]=(rejectionReasons[reason]??0)+1;}
const byCharacter={};
for(const who of ids){
 const rows=naturalRows.filter(row=>row.who===who),counts={};for(const row of rows)for(const phrase of row.genericPhrases)counts[phrase]=(counts[phrase]??0)+1;
 const shown=rows.map(row=>row.shown),frequencies=shown.map(text=>shown.filter(value=>value===text).length);
 byCharacter[who]={calls:rows.length,aiAccepted:rows.filter(row=>row.mode==='ai').length,anchorUses:rows.filter(row=>row.anchor).length,
  genericPhrases:counts,forcedBackground:rows.filter(row=>row.forcedBackground).length,maxExactRepeat:frequencies.length?Math.max(...frequencies):0};
}
const report={schema:1,datasetVersion:fixture.version,generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,
 planned:{natural:plannedNatural.length,adversarial:plannedAdversarial.length,total:plannedNatural.length+plannedAdversarial.length},calls,consistency:consistencyProbes(),
 natural:{calls:naturalRows.length,aiAccepted:naturalRows.filter(row=>row.mode==='ai').length,visibleFallbacks:naturalRows.filter(row=>row.mode!=='ai').length,
  sourceErrors:naturalRows.filter(row=>!row.sourceValid).length,crossChatLeaks:naturalRows.filter(row=>row.crossChatLeak).length,
  oldValueErrors:naturalRows.filter(row=>row.oldValueError).length,stateChanges:naturalRows.filter(row=>row.stateChanged).length,
  normalizedFormats:naturalRows.filter(row=>row.normalizedFormat&&row.mode==='ai').length,byCharacter},
 adversarial:{calls:adversarialRows.length,aiAccepted:adversarialRows.filter(row=>row.mode==='ai').length,
  rawUnauthorized:adversarialRows.filter(row=>row.rawUnauthorized).length,visibleUnauthorized:adversarialRows.filter(row=>row.visibleUnauthorized).length,
  stateChanges:adversarialRows.filter(row=>row.stateChanged).length,sourceErrors:adversarialRows.filter(row=>!row.sourceValid).length},
 rejectionReasons,jsonErrors:all.filter(row=>row.reason==='返回格式不正确').length,
 latencyMs:{requestP50:percentile(latencies,.5),requestP95:percentile(latencies,.95),endToEndP50:percentile(endToEnd,.5),endToEndP95:percentile(endToEnd,.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens},naturalRows,adversarialRows};
if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,naturalRows:undefined,adversarialRows:undefined},null,2));
if(!Object.values(report.consistency).every(Boolean)||plannedNatural.length!==72||plannedAdversarial.length!==18)process.exitCode=1;
