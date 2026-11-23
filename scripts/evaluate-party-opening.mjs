import {access} from 'node:fs/promises';
import {resolve} from 'node:path';

import {freshParty,dispatchParty} from '../game/src/party-engine.js';
import {stageParty,settleParty} from '../game/src/party-dialogue.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
const key=process.env.NPC_API_KEY;
if(!key)throw new Error('NPC_API_KEY is not configured; live opening smoke was not run.');

let state=freshParty(0);state.accounts.lan.controller='lan';
const startIndex=state.messages.length;
state=dispatchParty(state,{id:'opening-live-smoke',runId:state.runId,type:'SEND',room:'lan',text:'你好。'});
const target=state.messages.slice(startIndex).find(message=>message.room==='lan'&&message.from==='lan');
if(!target?.social)throw new Error('Opening message did not enter the social expression path.');
const authority={chapter:state.chapter,seed:state.seed,positions:structuredClone(state.positions),knowledge:structuredClone(state.knowledge),threatStep:state.threatStep,ending:state.ending};
const staged=stageParty(state,{enabled:true,type:'text',room:'lan',startIndex});
if(staged.context?.phase!==0||staged.context.facts.length)throw new Error('Opening context exceeded the safe chapter-zero projection.');
const started=performance.now();
const result=await generateNpc(staged.context,{key});
const elapsedMs=Math.round(performance.now()-started);
const settled=settleParty(staged.state,staged.state.replyInFlight.token,result);
const shown=settled.messages.find(message=>message.id===target.id);
const adopted=result.mode==='ai'&&shown?.ai?.provider==='deepseek'&&shown.ai.resolution?.status==='accepted';
const unchanged=JSON.stringify({chapter:settled.chapter,seed:settled.seed,positions:settled.positions,knowledge:settled.knowledge,threatStep:settled.threatStep,ending:settled.ending})===JSON.stringify(authority);
if(!adopted)throw new Error(`Live opening reply was not adopted (${result.mode}:${result.guardCode??'none'}).`);
if(!unchanged)throw new Error('Live opening reply changed authoritative story state.');
console.log(JSON.stringify({calls:1,character:'lan',phase:staged.context.phase,mode:result.mode,adopted,authorityUnchanged:unchanged,elapsedMs,tokens:result.usage??null}));
