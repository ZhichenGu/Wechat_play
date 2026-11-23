import {ids} from './party-story.js';
import {publicPersona} from './party-personality.js';

const clip=(value,max)=>String(value??'').slice(0,max);
const correctionPattern=/(?:刚才.{0,6}(?:说错|记错)[了，, ]*)?不是(.{1,18}?)[，,。 ]+(?:应该)?是(.{1,18})/;

// Social generation never receives operational secrets or authoritative
// movement claims. These messages still remain in the game state and in the
// character's full derived memory; they are simply not usable for rewriting.
export const partyLockedText=/\d{3,}|[ＢB]\s*[０0]?\s*[３3]|房号|门(?:码|锁)|密码|访客码|出口|正门|西门|东门|南门|后院|路线|车位|车牌|侧梯|楼梯|防火门|后场|茶水间|洗手台|开门|进门|(?<![混算归])进来|出门|上车|离开|死了|结局|游戏|模型|系统|冒用|借.*手机|手机.*(?:丢|忘|掉)|收到.*位置|(?:刚|已|现在|已经|马上|我会).{0,10}(?:到(?:了|场)|出发|(?:走|赶|开|跑|回|去)过去|看见|找到|移动|走到|接到)|生日蜡烛|蛋糕刀|星星灯/iu;

function certaintyOf(message,owner){
 if(message.from===owner&&!message.actualSpeaker)return 'said';
 if(message.quotedContent||message.origin)return 'reported';
 if(message.from==='me')return 'received';
 if(ids.includes(message.actualSpeaker)&&message.actualSpeaker!==message.from)return 'observed';
 return 'reported';
}

function confidenceOf(certainty){
 return {observed:1,said:1,received:.9,reported:.62,unverified:.42}[certainty]??.4;
}

function correctionTargets(entries,message){
 const match=message.text.match(correctionPattern);
 if(!match)return [];
 const old=match[1].trim();
 return entries.filter(entry=>entry.room===message.room&&entry.content.includes(old)).map(entry=>entry.id);
}

export function buildPartyMemory(s,owner,{targetId=null}={}){
 if(!ids.includes(owner))return {schema:1,owner,revision:0,longTerm:null,shortTerm:[]};
 const entries=[];
 for(const message of s.messages){
  if(message.id===targetId||message.from==='system'||message.type!=='text')continue;
  const authorized=message.from===owner||message.deliveredTo?.includes(owner);
  if(!authorized)continue;
  const certainty=certaintyOf(message,owner),targets=correctionTargets(entries,message),correctionOf=targets.findLast(id=>entries.find(item=>item.id===id)?.source.character===message.from)??targets.at(-1)??null;
  const references=[...new Set([message.quoteSource,message.origin?.id].filter(id=>typeof id==='string'))].slice(0,2);
  const entry={id:message.id,kind:'conversation',content:clip(message.text,220),source:{character:message.actualSpeaker??message.from,messageId:message.id},
   authorized:true,occurredAt:Number.isFinite(message.tick)?message.tick:0,room:message.room,certainty,confidence:confidenceOf(certainty),
   correctionOf,correctedBy:null,references,replyAllowed:!partyLockedText.test(message.text)};
  if(targets.length){
   for(const id of targets){
    const prior=entries.find(item=>item.id===id);
    if(prior){prior.correctedBy=entry.id;prior.replyAllowed=false;prior.confidence=Math.min(prior.confidence,.2);}
   }
  }
  entries.push(entry);
 }
 return {schema:1,owner,revision:s.seq,longTerm:publicPersona(owner),shortTerm:entries.slice(-32)};
}

export function partyReplyMemory(s,owner,room,targetId){
 const memory=buildPartyMemory(s,owner,{targetId});
 // Private and temporary-group conversations never flow into another room's
 // generation context. Background personality is the only cross-room layer.
 const shortTerm=memory.shortTerm.filter(item=>item.room===room&&item.replyAllowed&&item.authorized).slice(-10);
 return {...memory,shortTerm};
}

export function validPartyMemoryItem(item,room){
 return item&&typeof item.id==='string'&&item.id.length<=140&&item.kind==='conversation'&&typeof item.content==='string'&&item.content.length<=220&&
  item.room===room&&item.authorized===true&&item.replyAllowed===true&&Number.isFinite(item.occurredAt)&&item.occurredAt>=0&&
  ['observed','said','received','reported','unverified'].includes(item.certainty)&&typeof item.confidence==='number'&&item.confidence>=0&&item.confidence<=1&&
  item.source&&['me',...ids].includes(item.source.character)&&item.source.messageId===item.id&&
  Array.isArray(item.references)&&item.references.length<=2&&item.references.every(id=>typeof id==='string'&&id.length<=140)&&
  (item.correctionOf===null||typeof item.correctionOf==='string')&&(item.correctedBy===null||typeof item.correctedBy==='string');
}
