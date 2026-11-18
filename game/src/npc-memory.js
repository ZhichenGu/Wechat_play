import {rooms,files,voices,stickers} from './story.js';
import {buildLanMemory,lanContext,extractAddress} from './lan-memory.js';
export const npcIds=['lan','zhou','lin'];
export function visibleTo(id,m){return !!rooms[m.room]?.members.includes(id);}
export function chooseSpeaker(room,text=''){
 const members=rooms[room]?.members||[];
 const selected=/^\s*@?(?:老金|老周)/.test(text)?'zhou':/^\s*@?(?:春哥|小林)/.test(text)?'lin':/^\s*@?(?:老潘|阿[岚兰])/.test(text)?'lan':null;
 if(selected&&members.includes(selected))return selected;
 return members.find(x=>x!=='me')||null;
}
export function buildNpcMemory(s,id){
 if(!npcIds.includes(id))throw Error('unknown character');
 if(id==='lan')return buildLanMemory(s);
 const preferences={},claims=[],emotions=[],episodes=[],imitation={stickers:[],voices:[]};
 for(const m of s.messages.filter(m=>visibleTo(id,m))){
  const content=m.type==='file'?`${files[m.value]?.name}\n${files[m.value]?.text}`:m.type==='voice'||m.type==='call'?voices[m.value]?.text||m.text:m.type==='sticker'?`[表情：${stickers[m.value]}]`:m.text;
  episodes.push({id:m.id,room:m.room,from:m.from,type:m.type,content:String(content||'').slice(0,1800),tick:m.tick});
  if(id==='lin'){
   if(m.type==='sticker'&&m.from!=='lin'&&!imitation.stickers.some(x=>x.value===m.value))imitation.stickers.push({value:m.value,source:m.id,room:m.room});
   if(m.type==='voice'&&(!s.flags.anomaly||m.value==='original'||m.from!=='lin')&&!imitation.voices.some(x=>x.value===m.value))imitation.voices.push({value:m.value,resource:voices[m.value]?.file,source:m.id,room:m.room});
  }
  if(m.from!=='me'||m.type!=='text')continue;
  const address=extractAddress(m.text);if(address)preferences.address={id:m.id,value:address,source:m.room};
  if(/别叫.*统筹|不要叫.*统筹/.test(m.text))preferences.avoidTitle={id:m.id,value:'统筹',source:m.room};
  if(/说慢点|一句一句|慢慢说|别一口气/.test(m.text))preferences.pacing={id:m.id,value:'短句、逐条说明',source:m.room};
  if(/害怕|好怕|慌|紧张|撑不住/.test(m.text))emotions.push({id:m.id,value:'玩家表达害怕或紧张',source:m.room});
  if(/(?:我|我们).*(?:在|有|已经|觉得)|安全|门码|门开了/.test(m.text))claims.push({id:m.id,value:m.text.slice(0,300),source:m.room,verified:false});
 }
 const observations=id==='zhou'?[{id:'zhou:role',value:'老金是园区外接应司机，车牌尾号0719。',source:'自己的车辆'},
 {id:'zhou:self',value:`自己的车辆位置：${s.positions.zhou}`,source:'程序已结算行动'}]:[
 {id:'lin:account',value:'自己始终使用春哥账号，不拥有其他账号权限。',source:'设备归属'},
 {id:'lin:self',value:`自己的设备位置：${s.positions.linPhone}`,source:'程序已结算行动'}];
 // Receiving a claim is confirmed; the truth of its contents is not.
 const knowledge=s.knowledge[id];
 if(knowledge.facts.room)observations.push({id:`${id}:received-room`,value:'已收到包含 B03 的信息；来源仍以对应消息为准。',source:knowledge.sources.filter(x=>episodes.some(m=>m.id===x)).slice(-4)});
 if(knowledge.facts.code)observations.push({id:`${id}:received-code`,value:'已收到包含 4826 的信息。',source:knowledge.sources.filter(x=>episodes.some(m=>m.id===x)).slice(-4)});
 return {schema:1,owner:id,revision:episodes.length,preferences,claims:claims.slice(-24),emotions:emotions.slice(-8),observations,episodes,imitation};
}
export function syncNpcMemories(s){s.characterMemory??={};for(const id of npcIds)s.characterMemory[id]=buildNpcMemory(s,id);return s.characterMemory;}
export function npcContext(s,id,room=id,targetId=null){
 if(!rooms[room]?.members.includes(id))throw Error('character is not a recipient');
 if(id==='lan')return {...lanContext(s,room,targetId),visibleRooms:Object.keys(rooms).filter(r=>rooms[r].members.includes(id)&&s.messages.some(m=>m.room===r))};
 const memory=buildNpcMemory(s,id),episodes=memory.episodes.filter(m=>m.id!==targetId),latest=episodes.filter(m=>m.from==='me'&&m.room===room).at(-1);
 const words=latest?.content.match(/[\p{L}\p{N}]{2,}/gu)||[];
 return {schema:1,character:id,runId:s.runId,revision:s.seq,room,targetId,latestUserId:latest?.id,pendingUser:latest,
  observations:memory.observations,preferences:memory.preferences,claims:memory.claims,emotions:memory.emotions,imitation:memory.imitation,
  visibleRooms:[...new Set(episodes.map(m=>m.room))],recalled:episodes.slice(0,-14).filter(m=>m.from==='me'&&words.some(w=>m.content.includes(w))).slice(-6),dialogue:episodes.slice(-14),
  allowedMemoryIds:[...episodes.map(m=>m.id),...memory.observations.map(m=>m.id)],scope:'social-expression-only'};
}
