import assets from './assets.generated.js';
import {generateNpc} from './provider.js';
import {validPartyContext} from '../game/src/party-dialogue.js';
import {validIntentContext} from '../game/src/party-ai.js';
const enc=new TextEncoder();
const ACCESS_COOKIE='night_playtest_access';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function sign(secret,value){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(await crypto.subtle.sign('HMAC',key,enc.encode(value)));}
const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const providerKey=(request,env)=>{const supplied=request.headers.get('X-NPC-API-Key');if(supplied!==null)return /^[\x21-\x7e]{16,256}$/.test(supplied)?supplied:null;return env.NPC_API_KEY||null;};
async function requirePlaytestAccess(request,env,url){
 if(!env.PLAYTEST_ACCESS_CODE)return null;
 if(!env.SESSION_SECRET)return new Response('Preview unavailable',{status:503});
 const token=await sign(env.SESSION_SECRET,`playtest:${env.PLAYTEST_ACCESS_CODE}`);
 const cookie=request.headers.get('Cookie')?.match(new RegExp(`(?:^|; )${ACCESS_COOKIE}=([^;]+)`))?.[1];
 const supplied=url.searchParams.get('access');
 if(supplied!==null&&(same(supplied,env.PLAYTEST_ACCESS_CODE)||same(cookie,token))){
  const clean=new URL(url);clean.searchParams.delete('access');
  const headers={Location:clean.toString(),'Cache-Control':'no-store'};
  if(same(supplied,env.PLAYTEST_ACCESS_CODE))headers['Set-Cookie']=`${ACCESS_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
  return new Response(null,{status:302,headers});
 }
 if(same(cookie,token))return null;
 return new Response('This closed playtest link is not available.',{status:404,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}});
}
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
function assetBytes(base64,start,end){
 const firstBlock=Math.floor(start/3);
 const encoded=base64.slice(firstBlock*4,Math.ceil((end+1)/3)*4);
 const offset=start-firstBlock*3;
 const length=end-start+1;
 if(Uint8Array.fromBase64)return Uint8Array.fromBase64(encoded).subarray(offset,offset+length);
 const binary=atob(encoded),bytes=new Uint8Array(length);
 for(let i=0;i<length;i++)bytes[i]=binary.charCodeAt(offset+i);
 return bytes;
}
export function createWorker({generate=generateNpc,now=()=>Date.now()}={}){return {async fetch(request,env,ctx){
 const url=new URL(request.url),route=url.pathname;
 const access=await requirePlaytestAccess(request,env,url);if(access)return access;
 if(!route.startsWith('/api/')){
  if(!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
  const asset=assets[route];if(!asset)return new Response('Not found',{status:404});
  const headers={'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':route.startsWith('/assets/')?'public,max-age=86400':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"};
  const media=route.startsWith('/assets/');
  if(media)headers['Accept-Ranges']='bytes';
  const range=media?request.headers.get('Range')?.match(/^bytes=(\d*)-(\d*)$/):null;
  if(range&&(range[1]||range[2])){
   const start=range[1]?Number(range[1]):Math.max(0,asset.size-Number(range[2]));
   const end=range[1]&&range[2]?Math.min(Number(range[2]),asset.size-1):asset.size-1;
   if(start>end||start>=asset.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${asset.size}`}});
   return new Response(request.method==='HEAD'?null:assetBytes(asset.base64,start,end),{
    status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${asset.size}`,'Content-Length':String(end-start+1)}
   });
  }
  return new Response(request.method==='HEAD'?null:assetBytes(asset.base64,0,asset.size-1),{
   headers:{...headers,'Content-Length':String(asset.size)}
  });
 }
 if(!['/api/status','/api/npc/dialogue','/api/npc/intent'].includes(route))return json({error:'接口不存在'},404);
 if(!env.SESSION_SECRET)return json({configured:false,mode:'local',reason:'当前使用本地剧情'},503);
 const time=now();let session=await validSession(request,env.SESSION_SECRET,time);
 if(route==='/api/status'&&request.method==='GET'){
  if(!session){const id=crypto.randomUUID(),until=time+365*86400000;session={id,raw:`${id}.${until}.${await sign(env.SESSION_SECRET,`${id}.${until}`)}`};}
  return json({configured:!!providerKey(request,env)&&!!env.DB,hosted:true,model:'deepseek-flash',csrf:await sign(env.SESSION_SECRET,`csrf:${session.id}`),dailyLimits:{global:Number(env.GLOBAL_DAILY_LIMIT||300),player:Number(env.PLAYER_DAILY_LIMIT||150)}},200,{'Set-Cookie':`night_session=${session.raw}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`});
 }
 if(request.method!=='POST')return json({error:'请求方式不支持'},405);
 if(!session||request.headers.get('Origin')!==url.origin||request.headers.get('X-CSRF-Token')!==await sign(env.SESSION_SECRET,`csrf:${session.id}`)||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({mode:'fallback',reason:'请求校验失败'},403);
 const key=providerKey(request,env);if(!key)return json({mode:'local',reason:'当前使用本地回复'});
 if(!env.DB)return json({mode:'fallback',reason:'自然对话暂不可用'},503);
 try{
  if(Number(request.headers.get('Content-Length')||0)>65000)return json({mode:'fallback',reason:'消息过长'},413);
  const raw=await request.text();if(enc.encode(raw).length>65000)return json({mode:'fallback',reason:'消息过长'},413);
  const data=JSON.parse(raw),context=data.context;
  const routeMatches=route==='/api/npc/intent'?validIntentContext(context):validPartyContext(context)||(context&&['lan','zhou','lin'].includes(context.character)&&context.scope==='social-expression-only'&&Array.isArray(context.dialogue)&&Array.isArray(context.allowedMemoryIds));
  if(!routeMatches)return json({mode:'fallback',reason:'消息格式不正确'},400);
  const reason=await quota(env,session.id,request,time);if(reason)return json({mode:'fallback',reason},429);
  ctx?.waitUntil?.(env.DB.prepare('DELETE FROM usage_counters WHERE expires_at < ?').bind(time).run());
  return json(await generate(context,{key,signal:request.signal}));
 }catch{return json({mode:'fallback',reason:'自然对话暂不可用，请继续本地剧情'});}
}};}
export default createWorker();
