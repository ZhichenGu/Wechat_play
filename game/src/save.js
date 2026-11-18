import {VERSION} from './story.js';
import {syncNpcMemories} from './npc-memory.js';
export const SAVE_KEY='biefadaoqunli.v1';
const characterNames={老周:'老金',小林:'春哥',阿岚:'老潘',阿兰:'老潘'};
const updateNames=text=>text?.replace(/老周|小林|阿[岚兰]/g,name=>characterNames[name]);
export function updateSavedCharacterNames(state){
 if(state.characterNamesUpdated)return;
 for(const message of state.messages){
  if(message.from!=='me'||(message.origin&&message.origin.from!=='me'))message.text=updateNames(message.text);
 }
 if(state.reason)state.reason=updateNames(state.reason);
 for(const checkpoint of state.checkpoints??[])updateSavedCharacterNames(checkpoint.snapshot);
 state.characterNamesUpdated=true;
}
// A reload cancels the old network request; deliver its saved fallback once.
export function recoverPendingReply(s){const p=s.replyInFlight;if(!p)return s;delete s.replyInFlight;if(!s.ending&&p.runId===s.runId&&!s.messages.some(m=>m.id===p.token))s.messages.splice(Math.min(p.index,s.messages.length),0,p.message);return s;}
export function load(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));if(s?.version!==VERSION)return null;s.sharedSelf??={};recoverPendingReply(s);updateSavedCharacterNames(s);syncNpcMemories(s);return s}catch{return null}}
export function save(s){try{localStorage.setItem(SAVE_KEY,JSON.stringify(s));return true}catch{return false}}
export const clone=x=>JSON.parse(JSON.stringify(x));
