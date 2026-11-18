import {rooms,files} from './story.js';
export const recipients=(s,room)=>rooms[room]?.members.filter(x=>x!=='me')||[];
export function learn(s,room,m){
 for(const who of recipients(s,room)){
  const k=s.knowledge[who];
  if(!k.sources.includes(m.id))k.sources.push(m.id);
  const content=m.type==='file'?files[m.value]?.text||'':m.text||'';
  if(/B\s*0?3(?!\d)/i.test(content))k.facts.room='B03';
  if(/4826/.test(content))k.facts.code=true;
  if(m.type==='sticker'&&!k.stickers.includes(m.value))k.stickers.push(m.value);
  if(/东门/.test(content))k.claims.push({value:'east',source:m.id});
  if(/南门|南侧/.test(content))k.claims.push({value:'south',source:m.id});
  if(/西门/.test(content))k.claims.push({value:'west',source:m.id});
 }
}
