export const DEFAULT_REPLY_SOFT_TIMEOUT_MS=6000;
export const DEFAULT_REPLY_HARD_TIMEOUT_MS=17000;

const finitePositive=value=>Number.isFinite(value)&&value>0;

// Runtime builds may override these values before the app module loads. The
// defaults stay deterministic and are never derived from observed latency.
export function replyTimeoutConfig(overrides=globalThis.__BFDQL_REPLY_TIMEOUTS__??{}){
 const softMs=Number(overrides?.softMs),hardMs=Number(overrides?.hardMs);
 if(finitePositive(softMs)&&finitePositive(hardMs)&&softMs<hardMs)return {softMs,hardMs};
 return {softMs:DEFAULT_REPLY_SOFT_TIMEOUT_MS,hardMs:DEFAULT_REPLY_HARD_TIMEOUT_MS};
}

const fallback=(reason,guardCode)=>({mode:'fallback',reason,guardCode});

// The visible promise settles once. A result arriving after the soft deadline
// remains observable through `done` for measurements, but can no longer change
// the chat. The hard deadline still aborts a request that has not completed.
export function startReplyRequest(request,options={}){
 const config=replyTimeoutConfig(options),timers=options.timers??globalThis,now=options.now??(()=>performance.now());
 const controller=new AbortController(),started=now();
 let softTimer=null,hardTimer=null,hardTimedOut=false;
 let requestPromise;
 try{requestPromise=Promise.resolve(request(controller.signal));}
 catch(error){requestPromise=Promise.reject(error);}
 const done=requestPromise.then(
  result=>({type:'result',result,elapsedMs:Math.max(0,now()-started),late:false}),
  ()=>({type:controller.signal.aborted?'cancelled':'error',result:fallback('连接中断，已使用本地回复',controller.signal.aborted?'CANCELLED':'REQUEST_FAILED'),elapsedMs:Math.max(0,now()-started),late:false})
 );
 const soft=new Promise(resolve=>{softTimer=timers.setTimeout(()=>resolve({type:'soft-timeout',result:fallback('等待稍久，已使用本地回复','SOFT_TIMEOUT'),elapsedMs:config.softMs,late:false}),config.softMs);});
 const hard=new Promise(resolve=>{hardTimer=timers.setTimeout(()=>{hardTimedOut=true;controller.abort();resolve({type:'hard-timeout',result:fallback('等待结束，已使用本地回复','HARD_TIMEOUT'),elapsedMs:config.hardMs,late:false});},config.hardMs);});
 const clear=id=>{if(id!==null)timers.clearTimeout(id);};
 const visible=Promise.race([done,soft,hard]).then(outcome=>{
  if(outcome.type==='soft-timeout'){
   clear(softTimer);
   done.finally(()=>clear(hardTimer));
   return outcome;
  }
  clear(softTimer);clear(hardTimer);
  return outcome;
 });
 return {controller,visible,done:done.then(outcome=>({...outcome,late:outcome.elapsedMs>config.softMs,hardTimedOut})),config};
}
