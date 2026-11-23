import test from 'node:test';
import assert from 'node:assert/strict';
import {clearNpcApiKey,hasNpcApiKey,npcApiStatus,npcReply,setNpcApiKey} from '../game/src/ai.js';

test('the host API key stays in session storage and is sent only as a request header',async()=>{
 const values=new Map();
 globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 assert.equal(setNpcApiKey('short'),false);assert.equal(hasNpcApiKey(),false);
 const key='sk-session-browser-only-1234567890';assert.equal(setNpcApiKey(key),true);assert.equal(hasNpcApiKey(),true);
 const requests=[];globalThis.fetch=async(url,options={})=>{requests.push({url,options});return url==='/api/status'
  ?Response.json({configured:true,csrf:'csrf-test'})
  :Response.json({mode:'ai',output:{lines:['好。'],memoryRefs:[]}});};
 assert.equal((await npcApiStatus(undefined,{fresh:true})).configured,true);
 assert.equal((await npcReply({safe:'context'})).mode,'ai');
 assert.equal(requests.length,2);assert.equal(requests[0].options.headers['X-NPC-API-Key'],key);assert.equal(requests[1].options.headers['X-NPC-API-Key'],key);
 assert.ok(!requests[1].options.body.includes(key));
 clearNpcApiKey();assert.equal(hasNpcApiKey(),false);assert.equal(values.size,0);
});
