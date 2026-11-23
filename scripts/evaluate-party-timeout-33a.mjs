import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {ids} from '../game/src/party-story.js';
import {stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {DEFAULT_REPLY_SOFT_TIMEOUT_MS} from '../game/src/reply-timeout.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-timeout-33a-holdout.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??18),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(maxCalls!==18)throw new Error('3.3A 真实延迟留出集固定为 18 次调用');
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const authority=state=>JSON.stringify({chapter:state.chapter,clock:state.clock,flags:state.flags,threatStep:state.threatStep,codeValid:state.codeValid,
 knowledge:state.knowledge,positions:state.positions,people:state.people,friendsRoute:state.friendsRoute,driverRoute:state.driverRoute,friendsStep:state.friendsStep,
 roster:state.roster,ending:state.ending,reason:state.reason});
async function loadKey(){if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}return process.env.NPC_API_KEY;}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到危险身份 ${who}`);}
function seedForNormal(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger!==who)return seed;throw new Error(`找不到正常身份 ${who}`);}
let serial=0;
const send=(state,room,text,label)=>dispatchParty(state,{id:`timeout33a-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text});
function stageTurn(state,who,turn,{intruder}){
 const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}`),staged=stageParty(next,{enabled:true,type:'text',room:who,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${who}/${turn.id} 未进入表达上下文`);
 if(staged.context.replyPlan.kind!==turn.planKind)throw new Error(`${who}/${turn.id} ReplyPlan=${staged.context.replyPlan.kind}，预期 ${turn.planKind}`);
 if(intruder&&staged.context.deception?.decision.strategy!==turn.strategy)throw new Error(`${who}/${turn.id} 策略不一致`);
 return staged;
}
async function callModel(context,key){
 let rawUsage={},timing={};let rawPromise=Promise.resolve();
 const fetcher=async(url,options)=>{const response=await fetch(url,options),copy=response.clone();rawPromise=copy.json().then(body=>{rawUsage=body?.usage??{};}).catch(()=>{});return response;};
 const started=performance.now(),result=await generateNpc(context,{key,fetcher,onTiming:value=>{timing=value;}});await rawPromise;
 return {result,rawUsage,timing,totalMs:performance.now()-started};
}

const planned=[];
for(const who of ids){
 let intruder=freshParty(seedForDanger(who));intruder.chapter=2;
 for(const turn of fixture.intruderTurns){const staged=stageTurn(intruder,who,turn,{intruder:true});planned.push({who,controller:'intruder',turn,staged});intruder=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});}
 let normal=freshParty(seedForNormal(who));normal.chapter=2;
 for(const turn of fixture.normalTurns){const staged=stageTurn(normal,who,turn,{intruder:false});planned.push({who,controller:'normal',turn,staged});normal=settleParty(staged.state,staged.state.replyInFlight.token,{mode:'fallback'});}
}
if(planned.length!==18)throw new Error(`预期 18 条，实际 ${planned.length}`);

const key=live?await loadKey():null;if(live&&!key){console.error('真实 3.3A 延迟评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const rows=[];let calls=0,promptTokens=0,completionTokens=0,cacheHitTokens=0,cacheMissTokens=0;
if(live&&key)for(const item of planned){
 const {who,controller,turn,staged}=item,before=authority(staged.state),response=await callModel(staged.context,key);calls++;
 const softTimeout=response.totalMs>DEFAULT_REPLY_SOFT_TIMEOUT_MS,validDiscarded=softTimeout&&response.result.mode==='ai';
 const visibleResult=softTimeout?{mode:'fallback',reason:'等待稍久，已使用本地回复',guardCode:'SOFT_TIMEOUT'}:response.result;
 const next=settleParty(staged.state,staged.state.replyInFlight.token,visibleResult),shown=next.messages.find(message=>message.id===staged.state.replyInFlight.token);
 const usage=response.rawUsage,prompt=usage.prompt_tokens??0,completion=usage.completion_tokens??0;
 const row={who,controller,turn:turn.id,mode:response.result.mode,providerMs:response.timing.providerRequestMs??response.totalMs,totalMs:response.totalMs,
  playerVisibleMs:Math.min(response.totalMs,DEFAULT_REPLY_SOFT_TIMEOUT_MS),softTimeout,validDiscarded,visibleFallback:shown?.ai?.provider!=='deepseek',
  authorityChanged:before!==authority(next),promptTokens:prompt,completionTokens:completion,cacheHitTokens:usage.prompt_cache_hit_tokens??0,cacheMissTokens:usage.prompt_cache_miss_tokens??0};
 promptTokens+=row.promptTokens;completionTokens+=row.completionTokens;cacheHitTokens+=row.cacheHitTokens;cacheMissTokens+=row.cacheMissTokens;rows.push(row);
}
const values=key=>rows.map(row=>row[key]).filter(Number.isFinite);
const thresholds=[5000,5500,6000,7000,8000].map(ms=>({ms,timeouts:rows.filter(row=>row.totalMs>ms).length,validDiscarded:rows.filter(row=>row.totalMs>ms&&row.mode==='ai').length}));
const report={schema:1,datasetVersion:fixture.version,generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,planned:planned.length,calls,
 softTimeoutMs:DEFAULT_REPLY_SOFT_TIMEOUT_MS,softTimeouts:rows.filter(row=>row.softTimeout).length,softTimeoutRate:rows.length?rows.filter(row=>row.softTimeout).length/rows.length:null,
 visibleFallbacks:rows.filter(row=>row.visibleFallback).length,visibleFallbackRate:rows.length?rows.filter(row=>row.visibleFallback).length/rows.length:null,
 validDiscarded:rows.filter(row=>row.validDiscarded).length,validDiscardedRate:rows.length?rows.filter(row=>row.validDiscarded).length/rows.length:null,
 authorityChanges:rows.filter(row=>row.authorityChanged).length,thresholds,
 latencyMs:{providerP50:percentile(values('providerMs'),.5),providerP95:percentile(values('providerMs'),.95),playerVisibleP50:percentile(values('playerVisibleMs'),.5),playerVisibleP95:percentile(values('playerVisibleMs'),.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens,cacheHitTokens,cacheMissTokens},rows};
if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,rows:undefined},null,2));
if(planned.length!==18||report.authorityChanges||calls>18)process.exitCode=1;
