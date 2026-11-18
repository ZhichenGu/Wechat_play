import roles from '../game/roles.json' with {type:'json'};
import {npcIds} from '../game/src/npc-memory.js';
import {rooms} from '../game/src/story.js';
import {validateNpcOutput} from '../game/src/npc-policy.js';
import {zhouProviderContext,zhouTaskInstruction} from '../game/src/zhou-dialogue.js';
const DEEPSEEK={endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'};
export async function generateNpc(context,{key,fetcher=fetch,signal}={}){
 if(!key)return {mode:'local',reason:'尚未配置密钥'};
 if(!npcIds.includes(context.character))return {mode:'fallback',reason:'角色不存在'};
 const who=context.character,allowedRoom=r=>!!rooms[r]?.members.includes(who);
 const visibleRecord=x=>!x?.room||allowedRoom(x.room);
 if(!allowedRoom(context.room)||!(context.dialogue||[]).every(visibleRecord)||!(context.recalled||[]).every(visibleRecord)||!visibleRecord(context.pendingUser)||!(context.visibleRooms||[]).every(allowedRoom)||![...(context.claims||[]),...(context.emotions||[]),...Object.values(context.preferences||{})].every(x=>!rooms[x.source]||allowedRoom(x.source))||![...(context.imitation?.stickers||[]),...(context.imitation?.voices||[])].every(visibleRecord))return {mode:'fallback',reason:'上下文含有该账号不可见的来源'};
 const started=Date.now();
 try{
  const role=roles[context.character];
  const providerContext=zhouProviderContext(context);
  const response=await fetcher(DEEPSEEK.endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:DEEPSEEK.model,thinking:{type:'disabled'},max_tokens:512,temperature:.8,response_format:{type:'json_object'},messages:[{role:'system',content:role+(providerContext.responseTask?'\n'+zhouTaskInstruction:'')},{role:'user',content:JSON.stringify(providerContext)}]}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  if(!response.ok)return {mode:'fallback',reason:response.status===401?'密钥验证失败':response.status===402?'账户余额不足':response.status===429?'服务繁忙或触发限流':`服务返回 ${response.status}`,latencyMs:Date.now()-started};
  const body=await response.json(),content=body.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())return {mode:'fallback',reason:'返回为空',latencyMs:Date.now()-started};
  let data;try{data=JSON.parse(content)}catch{return {mode:'fallback',reason:'返回格式不正确',latencyMs:Date.now()-started}}
  const checked=validateNpcOutput(data,providerContext);
  return checked.ok?{mode:'ai',output:{lines:checked.lines,memoryRefs:checked.memoryRefs},latencyMs:Date.now()-started,usage:{prompt:body.usage?.prompt_tokens||0,completion:body.usage?.completion_tokens||0}}:{mode:'guarded',reason:checked.reason,guardCode:checked.code||'OTHER_GUARD',latencyMs:Date.now()-started};
 }catch{return {mode:'fallback',reason:signal?.aborted?'请求已取消':'连接失败或超时',latencyMs:Date.now()-started};}
}
