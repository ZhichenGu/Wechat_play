import {isMixedGroup} from './story.js';
import {dispatch} from './engine.js';
import {clone} from './save.js';
import {parse} from './intents.js';
import {npcContext,chooseSpeaker,syncNpcMemories} from './npc-memory.js';
import {socialKinds} from './npc-policy.js';

// Reserve the deterministic fallback, but don't publish it as a received message.
export function stageNpcReply(next,{enabled,type='text',room,text,startIndex}){
 if(!enabled||isMixedGroup(room)||type!=='text'||!socialKinds.has(parse(text).kind)||next.pending||next.ending)return {state:next,context:null};
 const who=chooseSpeaker(room,text);
 const target=next.messages.slice(startIndex).filter(m=>m.from===who&&m.room===room&&m.type==='text').at(-1);
 if(!target)return {state:next,context:null};
 const context=npcContext(next,who,room,target.id),state=clone(next),index=state.messages.findIndex(m=>m.id===target.id);
 state.messages.splice(index,1);
 state.replyInFlight={token:target.id,runId:state.runId,room,who,index,message:target,revision:context.revision,userId:context.latestUserId};
 syncNpcMemories(state);
 return {state,context};
}

export function settleNpcReply(current,token,result={mode:'fallback'}){
 const pending=current.replyInFlight;
 if(!pending||pending.token!==token||pending.runId!==current.runId)return current;
 let state=clone(current);delete state.replyInFlight;
 if(!state.ending){
  state.messages.splice(Math.min(pending.index,state.messages.length),0,pending.message);
  // The existing engine revalidates role, memory refs, revision and latest user turn.
  if(result.mode==='ai')state=dispatch(state,{id:crypto.randomUUID(),runId:pending.runId,type:'NPC_REPLY',character:pending.who,room:pending.room,targetId:token,userId:pending.userId,revision:pending.revision,output:result.output});
 }
 syncNpcMemories(state);return state;
}
