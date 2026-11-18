import {files,voices,stickers,rooms} from './story.js';
// Rebuilt exclusively from messages visible to Alan. No model-generated summaries enter canonical state.
export function lanVisible(m){return !!rooms[m.room]?.members.includes('lan');}
export function extractAddress(text){
 const m=text.match(/(?:^|[，,。.!！；;\n])\s*(?:你|以后|之后|都|请|就){0,3}(?:叫我|喊我|称呼我)([\p{L}\p{N}_·]{1,12})/u);
 if(!m)return null;return m[1].replace(/(?:就好|就行|好了|吧)$/,'')||null;
}
export function buildLanMemory(s){
 const visible=s.messages.filter(lanVisible), preferences={},claims=[],episodes=[],emotions=[];
 for(const m of visible){
  let content=m.type==='file'?`${files[m.value]?.name}\n${files[m.value]?.text}`:m.type==='voice'||m.type==='call'?voices[m.value]?.text||m.text:m.type==='sticker'?`[表情：${stickers[m.value]}]`:m.text;
  const record={id:m.id,room:m.room,from:m.from,type:m.type,content:String(content||'').slice(0,1800),tick:m.tick};
  episodes.push(record);
  if(m.from!=='me')continue;
  if(m.type==='text'){
   const address=extractAddress(m.text);if(address)preferences.address={id:m.id,value:address,source:m.room};
   if(/别叫.*统筹|不要叫.*统筹/.test(m.text))preferences.avoidTitle={id:m.id,value:'统筹',source:m.room};
   if(/说慢点|一句一句|慢慢说|别一口气/.test(m.text))preferences.pacing={id:m.id,value:'短句、逐条说明',source:m.room};
   if(/害怕|好怕|慌|紧张|撑不住/.test(m.text))emotions.push({id:m.id,value:'玩家表达害怕或紧张',source:m.room});
   if(/(?:我|我们).*(?:在|有|已经|觉得)|安全|门码|门开了/.test(m.text))claims.push({id:m.id,value:m.text.slice(0,300),source:m.room,verified:false});
  }
 }
 const observations=[{id:'fact:role',value:'玩家是撤场统筹；老潘正在园区撤场。',source:'开场交接'},
 {id:'fact:alan-location',value:`老潘自己的位置：${s.positions.lan}`,source:'程序已结算行动'}];
 if(s.chapter>=2)observations.push({id:'fact:found-lin',value:'老潘已经找到春哥本人，两人共用老潘手机；春哥手机遗失。',source:'可信通话与现场确认'});
 if(s.flags.inspected)observations.push({id:'fact:inspection',value:'现场核实：西货梯断电、西门铁链；东侧防火门和南连廊可通行。',source:'程序已结算现场核实'});
 observations.push({id:'fact:sharing',value:s.shared.old?'老潘仍在旧群共享位置。':'老潘已经结束旧群共享；旧信息不会被遗忘。',source:'老潘设备状态'});
 return {schema:1,owner:'lan',revision:visible.length,preferences,claims:claims.slice(-24),emotions:emotions.slice(-8),observations,episodes};
}
export function syncLanMemory(s){s.characterMemory??={};s.characterMemory.lan=buildLanMemory(s);return s.characterMemory.lan;}
export function lanContext(s,room='lan',targetId=null){
 if(!rooms[room]?.members.includes('lan'))throw Error('Alan is not a recipient');
 const memory=buildLanMemory(s),latest=memory.episodes.filter(m=>m.from==='me'&&m.room===room).at(-1);
 const episodes=memory.episodes.filter(m=>m.id!==targetId);
 const query=latest?.content||'';
 const words=query.match(/[\p{L}\p{N}]{2,}/gu)||[];
 const older=episodes.slice(0,-14).filter(m=>m.from==='me'&&words.some(w=>m.content.includes(w))).slice(-6);
 return {schema:1,character:'lan',runId:s.runId,revision:s.seq,room,targetId,latestUserId:latest?.id,pendingUser:latest,
  observations:memory.observations,preferences:memory.preferences,claims:memory.claims,emotions:memory.emotions,
  recalled:older,dialogue:episodes.slice(-14),allowedMemoryIds:[...episodes.map(m=>m.id),...memory.observations.map(m=>m.id)],
  scope:'social-expression-only'};
}
