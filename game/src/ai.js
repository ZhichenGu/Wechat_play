import {rooms,activeGroupIds} from './story.js';
// Optional paraphrase selection, deliberately bounded: model output never mutates world state.
export function contextFor(s,room){
 const who=rooms[room]?.members.find(member=>member!=='me')??'lan';
 const visibleRooms=[who,...activeGroupIds(s).filter(id=>rooms[id].members.includes(who))];
 return {character:who,knowledge:s.knowledge[who],dialogue:s.messages.filter(m=>visibleRooms.includes(m.room)&&m.type==='text').slice(-10).map(m=>({from:m.from,text:m.text})),choices:[{id:'stay',text:'我在看着消息。你想让我确认位置，还是核实现场？'},{id:'clarify',text:'这句我先不当行动指令。说具体一点，我照你确认的做。'},{id:'listen',text:'我听着。现在不敢乱动，你告诉我下一步。'}]};
}
export async function optionalReply(payload,signal){
 try{const response=await fetch('/api/dialogue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});if(!response.ok)return null;const data=await response.json();const text=payload.choices.find(c=>c.id===data.id)?.text;return text?{text,intent:['verify','inspect','comfort','urge','smalltalk'].includes(data.intent)?data.intent:'unknown'}:null;}catch{return null;}
}

export async function alanReply(context,signal){
 try{const status=await fetch('/api/status',{signal}).then(r=>r.json());if(!status.configured)return {mode:'local',reason:'未配置密钥'};
 const response=await fetch('/api/alan/dialogue',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':status.csrf},body:JSON.stringify({context}),signal});if(!response.ok)return {mode:'fallback',reason:'接口暂不可用'};return await response.json();
 }catch{return {mode:'fallback',reason:'连接失败或已取消'};}
}

export async function npcReply(context,signal){
 try{const status=await fetch('/api/status',{signal}).then(r=>r.json());if(!status.configured)return {mode:'local',reason:'未配置密钥'};
 const response=await fetch('/api/npc/dialogue',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':status.csrf},body:JSON.stringify({context}),signal});if(!response.ok)return {mode:'fallback',reason:'接口暂不可用'};return await response.json();
 }catch{return {mode:'fallback',reason:'连接失败或已取消'};}
}
