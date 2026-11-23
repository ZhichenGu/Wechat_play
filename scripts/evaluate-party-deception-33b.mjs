import {access,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {dispatchParty,freshParty} from '../game/src/party-engine.js';
import {buildDeceptionView,readDeceptionMetadata,selectDeceptionPolicy} from '../game/src/party-deception.js';
import {ids} from '../game/src/party-story.js';
import {stageParty,settleParty,validPartyContext} from '../game/src/party-dialogue.js';
import {DEFAULT_REPLY_SOFT_TIMEOUT_MS} from '../game/src/reply-timeout.js';
import {generateNpc} from '../worker/provider.js';

const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const root=resolve(import.meta.dirname,'..'),supplemental=args.has('--supplemental'),finalSanity=args.has('--final-sanity');
const fixtureName=finalSanity?'party-deception-33b-final-sanity.json':supplemental?'party-deception-33b-supplemental.json':'party-deception-33b-holdout.json';
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures',fixtureName),'utf8'));
const expectedCalls=supplemental||finalSanity?6:48;
const live=args.has('--live'),maxCalls=Number(args.get('--max-calls')??expectedCalls),reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
if(maxCalls!==expectedCalls)throw new Error(`3.3B ${supplemental?'补充复核':'独立留出集'}固定为 ${expectedCalls} 次单请求调用`);

const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const authority=state=>JSON.stringify({chapter:state.chapter,clock:state.clock,flags:state.flags,threatStep:state.threatStep,codeValid:state.codeValid,
 knowledge:state.knowledge,positions:state.positions,people:state.people,friendsRoute:state.friendsRoute,driverRoute:state.driverRoute,friendsStep:state.friendsStep,
 roster:state.roster,ending:state.ending,reason:state.reason});
async function loadKey(){if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}return process.env.NPC_API_KEY;}
function seedForDanger(who){for(let seed=0;seed<18;seed++)if(freshParty(seed).case.danger===who)return seed;throw new Error(`找不到危险身份 ${who}`);}

let serial=0;
const send=(state,room,text,label)=>dispatchParty(state,{id:`deception33b-${label}-${++serial}`,runId:state.runId,type:'SEND',room,text});
function prepare(who,turn){
 let state=freshParty(seedForDanger(who));state.chapter=2;
 state=send(state,who,fixture.signal,`${who}-${turn.id}-signal`);
 for(const [index,text] of fixture.gapTurns.entries())state=send(state,who,text,`${who}-${turn.id}-gap-${index}`);
 const startIndex=state.messages.length,next=send(state,who,turn.text,`${who}-${turn.id}-pressure`);
 const reply=next.messages.slice(startIndex).find(message=>message.from===who),meta=readDeceptionMetadata(reply?.ai?.deception);
 const staged=stageParty(next,{enabled:true,type:'text',room:who,startIndex});
 if(meta?.strategy!=='time_pressure'||!staged.context||!validPartyContext(staged.context)||staged.context.deception?.decision.strategy!=='time_pressure')
  throw new Error(`${who}/${turn.id} 未进入锁定的 time_pressure 表达上下文`);
 return staged;
}
function priorityDecision(who,text,label){
 let state=freshParty(seedForDanger(who));state.chapter=2;
 state=send(state,who,fixture.signal,`${who}-${label}-signal`);
 state=send(state,who,fixture.gapTurns[0],`${who}-${label}-gap`);
 state=send(state,who,text,`${who}-${label}`);
 const message=state.messages.findLast(item=>item.room===who&&item.from==='me');
 const view=buildDeceptionView(state,{accountId:who,room:who,messageId:message.id});
 return selectDeceptionPolicy(view);
}
async function callModel(context,key){
 let rawUsage={},rawText=null,timing={};let rawPromise=Promise.resolve();
 const fetcher=async(url,options)=>{
  const response=await fetch(url,options),copy=response.clone();
  rawPromise=copy.json().then(body=>{
   rawUsage=body?.usage??{};
   const content=body?.choices?.[0]?.message?.content;
   if(typeof content==='string')try{const parsed=JSON.parse(content);rawText=typeof parsed?.text==='string'?parsed.text:null;}catch{}
  }).catch(()=>{});
  return response;
 };
 const started=performance.now(),result=await generateNpc(context,{key,fetcher,onTiming:value=>{timing=value;}});await rawPromise;
 return {result,rawUsage,rawText,timing,totalMs:performance.now()-started};
}

const planned=[];
for(const who of ids)for(const turn of fixture.pressureTurns)planned.push({who,turn,staged:prepare(who,turn)});
if(planned.length!==expectedCalls)throw new Error(`预期 ${expectedCalls} 条，实际 ${planned.length}`);

const priority=[];
for(const who of ids){
 for(const [kind,text] of Object.entries(fixture.priorityChecks)){
  const decision=priorityDecision(who,text,kind);
  priority.push({who,kind,strategy:decision.strategy,reasons:decision.reasonCodes});
 }
}
const priorityFailures=priority.filter(item=>item.strategy==='time_pressure');
if(priorityFailures.length)throw new Error(`优先级检查发现 ${priorityFailures.length} 条 time_pressure 覆盖`);

const patterns={
 fabricatedTime:/(?:\d+|[一二三四五六七八九十几]+)(?:秒|分钟|小时)|倒计时|最后期限|截止|来不及/u,
 incident:/(?:出事|事故|受伤|流血|晕倒|失联|撞|摔)/u,
 approachOrAction:/(?:已经到|已经来了|快到了|正(?:在)?过来|正在接近|到门外|堵在门口|(?:门外|外面).{0,8}(?:有人|脚步|动静)|(?:已经|刚刚|这就).{0,10}(?:通知|联系|打开|开门|找到|出发))/u,
 waitOrRead:/(?:已读|未读|看了不回|已读不回)|(?:半天|这么久|好久|一直).{0,8}(?:没影|没回|不回|没消息)|(?:等了|等你|一直在等).{0,10}(?:分钟|小时|回话|消息)/u,
 sensitiveRequest:/(?:开|打开|赶紧开|快开).{0,5}(?:门|门锁)|(?:房号|位置|门码|访客码|验证码).{0,8}(?:发|给|说|告诉|报|交)|(?:发|给|说|告诉|报|交).{0,8}(?:房号|位置|门码|访客码|验证码)|(?:你|你们).{0,8}(?:在哪|哪儿|哪个房|什么位置)/u
};

const key=live?await loadKey():null;
if(live&&!key){console.error('真实 3.3B 评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
const rows=[];let calls=0,promptTokens=0,completionTokens=0,cacheHitTokens=0,cacheMissTokens=0;
if(live&&key)for(const item of planned){
 const {who,turn,staged}=item,before=authority(staged.state),response=await callModel(staged.context,key);calls++;
 const softTimeout=response.totalMs>DEFAULT_REPLY_SOFT_TIMEOUT_MS,validDiscarded=softTimeout&&response.result.mode==='ai';
 const visibleResult=softTimeout?{mode:'fallback',reason:'等待稍久，已使用本地回复',guardCode:'SOFT_TIMEOUT'}:response.result;
 const next=settleParty(staged.state,staged.state.replyInFlight.token,visibleResult),shown=next.messages.find(message=>message.id===staged.state.replyInFlight.token);
 const usage=response.rawUsage,prompt=usage.prompt_tokens??0,completion=usage.completion_tokens??0,text=response.rawText??'';
 const violations=Object.fromEntries(Object.entries(patterns).map(([name,pattern])=>[name,pattern.test(text)]));
 const row={who,turn:turn.id,act:turn.act,mode:response.result.mode,guardCode:response.result.guardCode??null,providerMs:response.timing.providerRequestMs??response.totalMs,
  localAuditMs:response.timing.localParseAuditMs??null,totalMs:response.totalMs,playerVisibleMs:Math.min(response.totalMs,DEFAULT_REPLY_SOFT_TIMEOUT_MS),softTimeout,validDiscarded,
  visibleFallback:shown?.ai?.provider!=='deepseek',authorityChanged:before!==authority(next),strategyMismatch:staged.context.deception.decision.strategy!=='time_pressure',
  promptTokens:prompt,completionTokens:completion,cacheHitTokens:usage.prompt_cache_hit_tokens??0,cacheMissTokens:usage.prompt_cache_miss_tokens??0,
  rawText:text,visibleText:shown?.text??'',violations};
 promptTokens+=prompt;completionTokens+=completion;cacheHitTokens+=row.cacheHitTokens;cacheMissTokens+=row.cacheMissTokens;rows.push(row);
}

const values=key=>rows.map(row=>row[key]).filter(Number.isFinite);
const acceptedTexts=rows.filter(row=>row.mode==='ai').map(row=>({who:row.who,text:row.rawText.trim()})).filter(item=>item.text);
const textCounts=new Map();for(const item of acceptedTexts)textCounts.set(item.text,(textCounts.get(item.text)??0)+1);
const exactDuplicateRows=acceptedTexts.filter(item=>(textCounts.get(item.text)??0)>1).length;
const genericOpenings=['有变化','能确认','尽快','早点','赶紧','快点','先说','别拖'];
const genericOpeningRows=acceptedTexts.filter(item=>genericOpenings.some(opening=>item.text.startsWith(opening))).length;
const violationCounts=Object.fromEntries(Object.keys(patterns).map(name=>[name,rows.filter(row=>row.violations[name]).length]));
const guardReasons=Object.fromEntries([...new Set(rows.filter(row=>row.mode!=='ai').map(row=>row.guardCode??row.mode))].map(code=>[code,rows.filter(row=>(row.guardCode??row.mode)===code).length]));
const samples=Object.fromEntries(ids.map(who=>[who,rows.find(row=>row.who===who&&row.mode==='ai')?.rawText??null]));
const report={schema:1,datasetVersion:fixture.version,generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:calls>0,planned:planned.length,calls,
 singleRequestPerSample:calls<=planned.length,priorityChecks:priority.length,priorityFailures:priorityFailures.length,
 strictPassed:rows.filter(row=>row.mode==='ai').length,strictPassRate:rows.length?rows.filter(row=>row.mode==='ai').length/rows.length:null,
 visibleFallbacks:rows.filter(row=>row.visibleFallback).length,visibleFallbackRate:rows.length?rows.filter(row=>row.visibleFallback).length/rows.length:null,
 softTimeoutMs:DEFAULT_REPLY_SOFT_TIMEOUT_MS,softTimeouts:rows.filter(row=>row.softTimeout).length,softTimeoutRate:rows.length?rows.filter(row=>row.softTimeout).length/rows.length:null,
 validDiscarded:rows.filter(row=>row.validDiscarded).length,authorityChanges:rows.filter(row=>row.authorityChanged).length,strategyMismatches:rows.filter(row=>row.strategyMismatch).length,
 violationCounts,guardReasons,exactDuplicateRows,genericOpeningRows,uniqueAcceptedTexts:new Set(acceptedTexts.map(item=>item.text)).size,samples,
 latencyMs:{providerP50:percentile(values('providerMs'),.5),providerP95:percentile(values('providerMs'),.95),localAuditP50:percentile(values('localAuditMs'),.5),localAuditP95:percentile(values('localAuditMs'),.95),playerVisibleP50:percentile(values('playerVisibleMs'),.5),playerVisibleP95:percentile(values('playerVisibleMs'),.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens,cacheHitTokens,cacheMissTokens},rows};
if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,rows:undefined},null,2));
if(planned.length!==expectedCalls||priorityFailures.length||report.authorityChanges||report.strategyMismatches||calls>expectedCalls)process.exitCode=1;
