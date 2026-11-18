import assets from './assets.generated.js';
import {generateNpc} from './provider.js';
const enc=new TextEncoder();
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function sign(secret,value){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(await crypto.subtle.sign('HMAC',key,enc.encode(value)));}
async function validSession(request,secret,now){const raw=request.headers.get('Cookie')?.match(/(?:^|; )night_session=([^;]+)/)?.[1];if(!raw)return null;const [id,until,mac]=raw.split('.');if(!/^[a-f0-9-]{36}$/.test(id)||Number(until)<now)return null;return await sign(secret,`${id}.${until}`)===mac?{id,raw}:null;}
export async function take(db,bucket,limit,expiry){const row=await db.prepare('INSERT INTO usage_counters(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(bucket,expiry,limit).first();return row?Number(row.count):null;}
async function quota(env,id,request,now){
 const day=new Date(now+8*3600000).toISOString().slice(0,10),expiry=now+3*86400000;
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';const ipHash=(await sign(env.SESSION_SECRET,ip)).slice(0,22);
 if(!await take(env.DB,`minute:${ipHash}:${Math.floor(now/60000)}`,30,now+120000))return '消息有点密集，稍后再试；现在可继续本地剧情。';
 if(!await take(env.DB,`player:${id}:${day}`,Number(env.PLAYER_DAILY_LIMIT||150),expiry))return '今天的自然对话次数已用完，仍可继续本地剧情。';
 if(!await take(env.DB,`global:${day}`,Number(env.GLOBAL_DAILY_LIMIT||300),expiry))return '今天的共享自然对话次数已用完，仍可继续本地剧情。';
 return null;
}
export function createWorker({generate=generateNpc,now=()=>Date.now()}={}){return {async fetch(request,env,ctx){
 const url=new URL(request.url),route=url.pathname;
 if(!route.startsWith('/api/')){
  if(!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
  const asset=assets[route];if(!asset)return new Response('Not found',{status:404});
  const bytes=Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));
  const headers={'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':route.startsWith('/assets/')?'public,max-age=86400':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"};
  const range=request.headers.get('Range')?.match(/^bytes=(\d+)-(\d*)$/);
  if(range&&route.startsWith('/assets/')){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):bytes.length-1,bytes.length-1);if(start>end||start>=bytes.length)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});return new Response(request.method==='HEAD'?null:bytes.subarray(start,end+1),{status:206,headers:{...headers,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`}});}
  return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Accept-Ranges':'bytes'}});
 }
 if(!['/api/status','/api/npc/dialogue'].includes(route))return json({error:'接口不存在'},404);
 if(!env.SESSION_SECRET)return json({configured:false,mode:'local',reason:'当前使用本地剧情'},503);
 const time=now();let session=await validSession(request,env.SESSION_SECRET,time);
 if(route==='/api/status'&&request.method==='GET'){
  if(!session){const id=crypto.randomUUID(),until=time+365*86400000;session={id,raw:`${id}.${until}.${await sign(env.SESSION_SECRET,`${id}.${until}`)}`};}
  return json({configured:!!env.NPC_API_KEY&&!!env.DB,hosted:true,model:'deepseek-flash',csrf:await sign(env.SESSION_SECRET,`csrf:${session.id}`),dailyLimits:{global:Number(env.GLOBAL_DAILY_LIMIT||300),player:Number(env.PLAYER_DAILY_LIMIT||150)}},200,{'Set-Cookie':`night_session=${session.raw}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`});
 }
 if(request.method!=='POST')return json({error:'请求方式不支持'},405);
 if(!session||request.headers.get('Origin')!==url.origin||request.headers.get('X-CSRF-Token')!==await sign(env.SESSION_SECRET,`csrf:${session.id}`)||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({mode:'fallback',reason:'请求校验失败'},403);
 if(!env.NPC_API_KEY)return json({mode:'local',reason:'当前使用本地回复'});
 if(!env.DB)return json({mode:'fallback',reason:'自然对话暂不可用'},503);
 try{
  if(Number(request.headers.get('Content-Length')||0)>65000)return json({mode:'fallback',reason:'消息过长'},413);
  const raw=await request.text();if(enc.encode(raw).length>65000)return json({mode:'fallback',reason:'消息过长'},413);
  const data=JSON.parse(raw),context=data.context;
  if(!context||!['lan','zhou','lin'].includes(context.character)||context.scope!=='social-expression-only'||!Array.isArray(context.dialogue)||!Array.isArray(context.allowedMemoryIds))return json({mode:'fallback',reason:'消息格式不正确'},400);
  const reason=await quota(env,session.id,request,time);if(reason)return json({mode:'fallback',reason},429);
  ctx?.waitUntil?.(env.DB.prepare('DELETE FROM usage_counters WHERE expires_at < ?').bind(time).run());
  return json(await generate(context,{key:env.NPC_API_KEY,signal:request.signal}));
 }catch{return json({mode:'fallback',reason:'自然对话暂不可用，请继续本地剧情'});}
}};}
export default createWorker();
