import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createWorker,take} from '../worker/server.js';
function db(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE usage_counters(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0,expires_at INTEGER NOT NULL)');return {sqlite,prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null},async run(){return sqlite.prepare(sql).run(...args)}}}}}};}
const env=DB=>({DB,SESSION_SECRET:'test-session-only',NPC_API_KEY:'test-provider-only',GLOBAL_DAILY_LIMIT:'300',PLAYER_DAILY_LIMIT:'150'});
const context={character:'zhou',room:'zhou',scope:'social-expression-only',dialogue:[],allowedMemoryIds:[]};
async function session(worker,settings,headers={}){const response=await worker.fetch(new Request('https://play.example/api/status',{headers}),settings);const data=await response.json();return {cookie:response.headers.get('Set-Cookie').split(';')[0],csrf:data.csrf,data};}
const post=(session,body={context},origin='https://play.example',headers={})=>new Request('https://play.example/api/npc/dialogue',{method:'POST',headers:{Cookie:session.cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':session.csrf,...headers},body:JSON.stringify(body)});
const intentContext={schema:1,scope:'party-intent-v1',runId:'00000000-0000-0000-0000-000000000000',revision:1,phase:1,room:'lan',text:'帮我看下现场',quote:null,allowedTargets:['lan'],deterministicIntent:'chat',dialogue:[],facts:{lan:[]}};
const postIntent=(session,body={context:intentContext})=>new Request('https://play.example/api/npc/intent',{method:'POST',headers:{Cookie:session.cookie,Origin:'https://play.example','Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify(body)});
test('the hosted interface serves its avatar, Moments and navigation images',async()=>{
 const worker=createWorker();
 for(const [route,type] of [['contacts/lin.png','image/png'],['moments/snapshots.jpg','image/jpeg'],['weixun/back.svg','image/svg+xml']]){
  const image=await worker.fetch(new Request('https://play.example/assets/'+route),{});
  assert.equal(image.status,200);
  assert.equal(image.headers.get('Content-Type'),type);
  assert.ok((await image.arrayBuffer()).byteLength>0);
 }
});
test('public assets are allowlisted; roles, tools, test reports and key configuration are not served',async()=>{const worker=createWorker(),settings=env(db());for(const route of ['/private/roles/alan.md','/tests/live-setup.html','/verification.md','/.env','/lab.html','/api/config','/api/npc/campaign'])assert.equal((await worker.fetch(new Request('https://play.example'+route),settings)).status,404);assert.equal((await worker.fetch(new Request('https://play.example/'),settings)).status,200);const sound=await worker.fetch(new Request('https://play.example/assets/sfx/room-tone.wav',{headers:{Range:'bytes=0-99'}}),settings);assert.equal(sound.status,206);assert.equal((await sound.arrayBuffer()).byteLength,100);});
test('the opening video supports full playback, metadata and byte-range requests',async()=>{
 const worker=createWorker(),url='https://play.example/assets/opening.mp4';
 const file=await readFile('game/assets/opening.mp4');
 const head=await worker.fetch(new Request(url,{method:'HEAD'}),{});
 assert.equal(head.headers.get('Content-Type'),'video/mp4');
 assert.equal(head.headers.get('Content-Length'),String(file.length));
 assert.equal((await head.arrayBuffer()).byteLength,0);
 const full=await worker.fetch(new Request(url),{});
 assert.deepEqual(Buffer.from(await full.arrayBuffer()),file);
 for(const [range,start,end] of [['bytes=0-1',0,1],['bytes=13-29',13,29],['bytes=-7',file.length-7,file.length-1]]){
  const response=await worker.fetch(new Request(url,{headers:{Range:range}}),{});
  assert.equal(response.status,206);
  assert.equal(response.headers.get('Content-Range'),`bytes ${start}-${end}/${file.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),file.subarray(start,end+1));
 }
});
test('status never returns the provider secret and invalid origin/cookie cannot spend it',async()=>{let calls=0;const worker=createWorker({generate:async()=>{calls++;return {mode:'ai'}}}),settings=env(db());const s=await session(worker,settings);assert.ok(!JSON.stringify(s.data).includes(settings.NPC_API_KEY));assert.deepEqual(s.data.dailyLimits,{global:300,player:150});assert.equal((await worker.fetch(post(s,{context},'https://evil.example'),settings)).status,403);assert.equal((await worker.fetch(post({...s,cookie:'night_session=forged'}),settings)).status,403);assert.equal(calls,0);});
test('a session-only provider key enables the hosted API without echoing or storing it in status',async()=>{
 const key='sk-browser-session-only-1234567890';let calls=0;
 const worker=createWorker({generate:async(context,{key:received})=>{calls++;assert.equal(received,key);return {mode:'ai',output:{lines:['好。'],memoryRefs:[]}};}}),settings=env(db());delete settings.NPC_API_KEY;
 const s=await session(worker,settings,{'X-NPC-API-Key':key});assert.equal(s.data.configured,true);assert.ok(!JSON.stringify(s.data).includes(key));
 assert.equal((await worker.fetch(post(s,{context},'https://play.example',{'X-NPC-API-Key':key}),settings)).status,200);assert.equal(calls,1);
 const without=await session(worker,settings);assert.equal(without.data.configured,false);assert.equal((await (await worker.fetch(post(without),settings)).json()).mode,'local');assert.equal(calls,1);
 const invalid=await session(worker,settings,{'X-NPC-API-Key':'short'});assert.equal(invalid.data.configured,false);
});
test('closed preview access code becomes an HttpOnly cookie and is removed from the visible URL',async()=>{
 const worker=createWorker(),settings={...env(db()),PLAYTEST_ACCESS_CODE:'closed-preview-code-123'};
 assert.equal((await worker.fetch(new Request('https://play.example/?party=1'),settings)).status,404);
 assert.equal((await worker.fetch(new Request('https://play.example/api/status'),settings)).status,404);
 const admitted=await worker.fetch(new Request('https://play.example/?party=1&playtest=1&access=closed-preview-code-123'),settings);
 assert.equal(admitted.status,302);assert.equal(admitted.headers.get('Location'),'https://play.example/?party=1&playtest=1');
 assert.match(admitted.headers.get('Set-Cookie'),/night_playtest_access=.*HttpOnly.*Secure.*SameSite=Strict/);
 const cookie=admitted.headers.get('Set-Cookie').split(';')[0];
 const repeat=await worker.fetch(new Request('https://play.example/?party=1&playtest=1&access=closed-preview-code-123',{headers:{Cookie:cookie}}),settings);
 assert.equal(repeat.status,302);assert.equal(repeat.headers.get('Location'),'https://play.example/?party=1&playtest=1');
 assert.equal((await worker.fetch(new Request('https://play.example/?party=1',{headers:{Cookie:cookie}}),settings)).status,200);
 const s=await worker.fetch(new Request('https://play.example/api/status',{headers:{Cookie:cookie}}),settings);assert.equal(s.status,200);assert.ok(!(await s.text()).includes(settings.PLAYTEST_ACCESS_CODE));
});
test('a player can make 150 requests per Beijing day; the next never calls the provider',async()=>{let time=Date.UTC(2026,10,17,4),calls=0;const worker=createWorker({now:()=>time,generate:async()=>{calls++;return {mode:'ai',output:{lines:['好。'],memoryRefs:[]}}}}),settings=env(db()),s=await session(worker,settings);for(let i=0;i<150;i++){time+=61000;assert.equal((await worker.fetch(post(s),settings)).status,200);}time+=61000;assert.equal((await worker.fetch(post(s),settings)).status,429);assert.equal(calls,150);});
test('atomic global quota cannot exceed 300 even with simultaneous reservations',async()=>{const DB=db();const results=await Promise.all(Array.from({length:320},()=>take(DB,'global:day',300,1)));assert.equal(results.filter(Boolean).length,300);assert.equal(DB.sqlite.prepare('SELECT count FROM usage_counters WHERE bucket=?').get('global:day').count,300);});
test('two player sessions exhaust global 300, a third is blocked; next Beijing day resumes',async()=>{let time=Date.UTC(2026,10,17,2),calls=0;const worker=createWorker({now:()=>time,generate:async()=>{calls++;return {mode:'ai'}}}),settings=env(db());for(let player=0;player<2;player++){const s=await session(worker,settings);for(let i=0;i<150;i++){time+=61000;assert.equal((await worker.fetch(post(s),settings)).status,200);}}const third=await session(worker,settings);assert.equal((await worker.fetch(post(third),settings)).status,429);assert.equal(calls,300);time+=86400000;assert.equal((await worker.fetch(post(third),settings)).status,200);assert.equal(calls,301);});
test('missing provider key or database continues locally without paid calls',async()=>{let calls=0;const worker=createWorker({generate:async()=>{calls++;return {mode:'ai'}}});const settings=env(db());delete settings.NPC_API_KEY;const s=await session(worker,settings);assert.equal(s.data.configured,false);assert.equal((await (await worker.fetch(post(s),settings)).json()).mode,'local');settings.NPC_API_KEY='test';delete settings.DB;assert.equal((await worker.fetch(post(s),settings)).status,503);assert.equal(calls,0);});
test('intent endpoint accepts only its bounded schema and shares the existing quota path',async()=>{
 let calls=0;const worker=createWorker({generate:async context=>{calls++;assert.equal(context.scope,'party-intent-v1');return {mode:'ai',output:{candidates:[]}}}}),settings=env(db()),s=await session(worker,settings);
 assert.equal((await worker.fetch(postIntent(s),settings)).status,200);assert.equal(calls,1);
 assert.equal((await worker.fetch(postIntent(s,{context:{...intentContext,text:'x'.repeat(501)}}),settings)).status,400);assert.equal(calls,1);
 assert.equal((await worker.fetch(postIntent(s,{context:{...intentContext,allowedTargets:['intruder'],facts:{intruder:[]}}}),settings)).status,400);assert.equal(calls,1);
});
