export function statusClockTime(startedAt,now=Date.now()){
  const elapsed=Math.floor(Math.max(0,now-startedAt)/60_000);
  const minutes=(99+elapsed)%1440;
  return [Math.floor(minutes/60),minutes%60].map(value=>String(value).padStart(2,'0')).join(':');
}

export function isIncoming(message){
  return message.from!=='me'&&message.from!=='system';
}

export function unreadCount(state,room,messages){
  const marker=state.chatUi?.readThrough?.[room];
  const index=marker?messages.findIndex(message=>message.id===marker):-1;
  return messages.slice(index+1).filter(isIncoming).length;
}

export function markRead(state,room,messages){
  const latest=messages.findLast(isIncoming);
  if(!latest||state.chatUi?.readThrough?.[room]===latest.id)return false;
  const ui=state.chatUi??={};
  (ui.readThrough??={})[room]=latest.id;
  return true;
}

export function storeDraft(state,room,text,quoteId){
  const previous=state.chatUi?.drafts?.[room];
  if(!text&&!quoteId){
    if(!previous)return false;
    delete state.chatUi.drafts[room];
    return true;
  }
  if(previous?.text===text&&previous.quoteId===quoteId)return false;
  const ui=state.chatUi??={};
  (ui.drafts??={})[room]={text,quoteId};
  return true;
}
