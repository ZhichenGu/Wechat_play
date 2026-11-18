import {extractAddress} from './lan-memory.js';

// This narrows the reply topic; it grants no new knowledge or action permissions.
export function zhouReplyTask(context){
 if(context.character!=='zhou'||context.room!=='zhou'||!context.pendingUser)return null;
 const text=context.pendingUser.content||'',address=context.preferences?.address;
 if(address?.id===context.latestUserId&&extractAddress(text)===address.value)return {kind:'acknowledge-address',address:address.value,source:address.id};
 const otherPrivate=/(?:老潘|阿[岚兰]).*私聊|私聊.*(?:老潘|阿[岚兰])/.test(text)&&/称呼|叫|喊/.test(text);
 // If somebody has already reported that nickname, retain the full sourced context.
 const priorReport=(context.dialogue||[]).concat(context.recalled||[]).some(m=>m.id!==context.latestUserId&&m.from==='me'&&/(?:老潘|阿[岚兰])/.test(m.content)&&/叫|称呼|喊/.test(m.content)&&!/[?？]|你知道|不知道|记得/.test(m.content));
 if(otherPrivate&&!priorReport)return {kind:'unseen-private-nickname'};
 return null;
}

export function zhouFallback(context){
 const task=zhouReplyTask(context);
 if(task?.kind==='acknowledge-address')return `行，${task.address}。以后就这么叫你。`;
 if(task?.kind==='unseen-private-nickname')return '你和老潘私聊说的，我看不见。没告诉我的，我就不猜。';
 return null;
}

export function zhouProviderContext(context){
 const task=zhouReplyTask(context);if(!task)return context;
 const preferences=task.kind==='acknowledge-address'?{address:context.preferences.address}:{};
 const ids=new Set([context.latestUserId,...Object.values(preferences).map(p=>p.id)]);
 return {...context,observations:[],claims:[],emotions:[],recalled:[],dialogue:[context.pendingUser],preferences,
  allowedMemoryIds:context.allowedMemoryIds.filter(id=>ids.has(id)),responseTask:task};
}

export const zhouTaskInstruction=`当前有 responseTask 时，只回应这件小事。acknowledge-address：用收到的称呼自然答应，别讲记忆机制，也别追问接应。unseen-private-nickname：自然说明看不到那段私聊、不知道其中称呼，不要误当成玩家让你修改称呼。最多两句短消息，不附带车牌、车辆状态、路线、行动或其他剧情信息。不要照抄规则、提及系统或模型。`;
