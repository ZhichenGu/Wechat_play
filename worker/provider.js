import roles from '../game/roles.json' with {type:'json'};
import {npcIds} from '../game/src/npc-memory.js';
import {rooms} from '../game/src/story.js';
import {validateNpcOutput} from '../game/src/npc-policy.js';
import {zhouProviderContext,zhouTaskInstruction} from '../game/src/zhou-dialogue.js';
import {validPartyContext,partyInstruction,checkPartyOutput} from '../game/src/party-dialogue.js';
import {validIntentContext,intentInstruction,checkIntentOutput} from '../game/src/party-ai.js';
import {checkDeceptionOutput,deceptionProviderContext} from '../game/src/party-deception.js';
import {checkReplyPlanOutput,replyPlanProviderContext} from '../game/src/party-reply-plan.js';
const DEEPSEEK={endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'};
const timingNow=()=>globalThis.performance?.now?.()??Date.now();
export async function generateNpc(context,{key,fetcher=fetch,signal,onTiming=null}={}){
 if(!key)return {mode:'local',reason:'尚未配置密钥'};
 const party=context.scope==='party-social-only';
 const intent=context.scope==='party-intent-v1';
 if(party&&!validPartyContext(context))return {mode:'fallback',reason:'角色上下文不符合会话范围'};
 if(intent&&!validIntentContext(context))return {mode:'fallback',reason:'意图上下文不符合范围'};
 if(!party&&!intent&&!npcIds.includes(context.character))return {mode:'fallback',reason:'角色不存在'};
 const who=context.character,allowedRoom=r=>!!rooms[r]?.members.includes(who);
 const visibleRecord=x=>!x?.room||allowedRoom(x.room);
 if(!party&&!intent&&(!allowedRoom(context.room)||!(context.dialogue||[]).every(visibleRecord)||!(context.recalled||[]).every(visibleRecord)||!visibleRecord(context.pendingUser)||!(context.visibleRooms||[]).every(allowedRoom)||![...(context.claims||[]),...(context.emotions||[]),...Object.values(context.preferences||{})].every(x=>!rooms[x.source]||allowedRoom(x.source))||![...(context.imitation?.stickers||[]),...(context.imitation?.voices||[])].every(visibleRecord)))return {mode:'fallback',reason:'上下文含有该账号不可见的来源'};
 const started=Date.now();
 try{
  const role=intent?intentInstruction:party?partyInstruction(context):roles[context.character];
  const providerContext=intent?context:party?{phase:context.phase,latestUserId:context.latestUserId,recent:context.dialogue.slice(-6),emotion:context.emotion,
   style:context.style,allowedMemoryIds:context.allowedMemoryIds,facts:context.facts,replyPlan:replyPlanProviderContext(context.replyPlan),
   ...(context.deception?{deception:deceptionProviderContext(context.deception)}:{})}:zhouProviderContext(context);
  const requestStarted=timingNow();
  const response=await fetcher(DEEPSEEK.endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:DEEPSEEK.model,thinking:{type:'disabled'},max_tokens:intent?256:party?160:512,temperature:intent?0.1:party?0.7:0.8,response_format:{type:'json_object'},messages:[{role:'system',content:role+(providerContext.responseTask?'\n'+zhouTaskInstruction:'')},{role:'user',content:JSON.stringify(providerContext)}]}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  if(!response.ok)return {mode:'fallback',reason:response.status===401?'密钥验证失败':response.status===402?'账户余额不足':response.status===429?'服务繁忙或触发限流':`服务返回 ${response.status}`,latencyMs:Date.now()-started};
  const responseText=await response.text(),providerRequestMs=timingNow()-requestStarted;
  const localStarted=timingNow();
  const body=JSON.parse(responseText),content=body.choices?.[0]?.message?.content;
  const usage={prompt:body.usage?.prompt_tokens||0,completion:body.usage?.completion_tokens||0};
  if(typeof content!=='string'||!content.trim())return {mode:'fallback',reason:'返回为空',latencyMs:Date.now()-started};
  let data;try{data=JSON.parse(content)}catch{return {mode:'fallback',reason:'返回格式不正确',latencyMs:Date.now()-started,usage}}
  const checked=intent?checkIntentOutput(data,context):party?checkPartyOutput(data,context):validateNpcOutput(data,providerContext);
  const strategyChecked=party&&checked.ok&&context.deception?checkDeceptionOutput({text:checked.lines.join('\n'),memoryRefs:checked.memoryRefs},{decision:context.deception.decision,accountId:context.character,memories:context.memories}):null;
  const planChecked=party&&checked.ok&&(!strategyChecked||strategyChecked.ok)?checkReplyPlanOutput({text:checked.lines.join('\n'),memoryRefs:checked.memoryRefs},{plan:context.replyPlan,accountId:context.character,memories:context.memories}):null;
  const accepted=checked.ok&&(!strategyChecked||strategyChecked.ok)&&(!planChecked||planChecked.ok),rejected=strategyChecked&&!strategyChecked.ok?strategyChecked:planChecked&&!planChecked.ok?planChecked:checked;
  const output=intent?{candidates:checked.candidates}:{lines:checked.lines,memoryRefs:checked.memoryRefs};
  try{onTiming?.({providerRequestMs,localParseAuditMs:timingNow()-localStarted});}catch{}
  return accepted?{mode:'ai',output,latencyMs:Date.now()-started,usage}:{mode:'guarded',reason:rejected.reason,guardCode:rejected.code||'OTHER_GUARD',latencyMs:Date.now()-started,usage};
 }catch{return {mode:'fallback',reason:signal?.aborted?'请求已取消':'连接失败或超时',latencyMs:Date.now()-started};}
}
