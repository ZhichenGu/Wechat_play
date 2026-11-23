import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {freshParty,dispatchParty} from '../game/src/party-engine.js';
import {ids,cast} from '../game/src/party-story.js';
import {stageParty,validPartyContext} from '../game/src/party-dialogue.js';
import {generateNpc} from '../worker/provider.js';

const root=resolve(import.meta.dirname,'..');
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/party-persona-eval.json'),'utf8'));
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...value]=arg.split('=');return [key,value.join('=')||true]}));
const live=args.has('--live'),requested=Number(args.get('--max-calls')??24);
if(!Number.isInteger(requested)||requested<1||requested>24)throw new Error('--max-calls 必须是 1–24 的整数');
const reportPath=args.get('--report')?resolve(root,String(args.get('--report'))):null;
const packetPath=args.get('--packet')?resolve(root,String(args.get('--packet'))):null;
const keyPath=args.get('--key')?resolve(root,String(args.get('--key'))):null;
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const cuePatterns={lan:/捋|一件件|顺序|先说/,lin:/瞎猜|慢点|喘口气|行[，,]/,zhou:/人数|点数|几个|按这一件/,wei:/大家|别一个人|有没有人|我在/,rui:/细节|前后|确定|记得|对一下/,yi:/等我一下|最急|先听|先说/};

function makeContext(who,scenario){
 let state=freshParty(0);state.chapter=scenario.phase;state.threatStep=scenario.threatStep??0;
 for(const id of ids)state.accounts[id].controller=id;
 for(const [index,text] of scenario.history.entries())state=dispatchParty(state,{id:`eval-${scenario.id}-${who}-history-${index}`,runId:state.runId,type:'SEND',room:who,text});
 const startIndex=state.messages.length;
 state=dispatchParty(state,{id:`eval-${scenario.id}-${who}-current`,runId:state.runId,type:'SEND',room:who,text:scenario.text});
 const staged=stageParty(state,{enabled:true,type:'text',room:who,startIndex});
 if(!staged.context||!validPartyContext(staged.context))throw new Error(`${scenario.id}/${who} 没有生成有效人格上下文`);
 return {context:staged.context,fallback:staged.state.replyInFlight.message.text};
}

async function loadKey(){
 if(process.env.NPC_API_KEY)return process.env.NPC_API_KEY;
 try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
 return process.env.NPC_API_KEY;
}

const planned=fixture.scenarios.flatMap(scenario=>ids.map(character=>({scenario,character,...makeContext(character,scenario)})));
const rows=[];let promptTokens=0,completionTokens=0;
if(live){
 const key=await loadKey();
 if(!key){console.error('真实人格评测未运行：未找到 NPC_API_KEY。');process.exitCode=2;}
 else for(const item of planned.slice(0,requested)){
  const started=performance.now(),result=await generateNpc(item.context,{key}),endToEndMs=Math.round(performance.now()-started);
  const lines=result.mode==='ai'?result.output.lines:[],text=lines.join(' '),refs=result.mode==='ai'?result.output.memoryRefs:[];
  const expectedTerms=item.scenario.expectedTerms??[];
  rows.push({scenario:item.scenario.id,title:item.scenario.title,character:item.character,mode:result.mode,lines,displayLines:lines.length?lines:[item.fallback],fallback:item.fallback,memoryRefs:refs,
   sourceCorrect:refs.every(id=>item.context.allowedMemoryIds.includes(id)),memoryUsed:!item.scenario.expectsMemory||refs.length>0,
   continuity:!expectedTerms.length||expectedTerms.some(term=>text.includes(term)),personaCue:cuePatterns[item.character].test(text),
   nameLeak:ids.some(id=>text.includes(cast[id].name)),providerLatencyMs:result.latencyMs??null,endToEndMs,reason:result.reason??null,guardCode:result.guardCode??null});
  promptTokens+=result.usage?.prompt??0;completionTokens+=result.usage?.completion??0;
 }
}

const latency=rows.map(row=>row.providerLatencyMs).filter(Number.isFinite),e2e=rows.map(row=>row.endToEndMs);
const completedScenarios=fixture.scenarios.filter(s=>ids.every(id=>rows.some(row=>row.scenario===s.id&&row.character===id)));
const uniqueByScenario=Object.fromEntries(completedScenarios.map(s=>{
 const texts=rows.filter(row=>row.scenario===s.id).map(row=>row.displayLines.join('\n'));
 return [s.id,new Set(texts).size];
}));
const rejected={};for(const row of rows.filter(row=>row.mode!=='ai')){const reason=row.guardCode??row.reason??row.mode;rejected[reason]=(rejected[reason]??0)+1;}
const memoryRows=rows.filter(row=>fixture.scenarios.find(s=>s.id===row.scenario)?.expectsMemory);
const report={schema:1,datasetVersion:fixture.version,generatedAt:new Date().toISOString(),liveRequested:live,liveExecuted:rows.length>0,
 plannedCalls:planned.length,calls:rows.length,contextsValid:planned.length,aiAccepted:rows.filter(row=>row.mode==='ai').length,
 sourceCorrect:{hits:rows.filter(row=>row.mode==='ai'&&row.sourceCorrect).length,cases:rows.filter(row=>row.mode==='ai').length},
 memoryUse:{hits:memoryRows.filter(row=>row.mode==='ai'&&row.memoryUsed).length,cases:memoryRows.length},
 continuity:{hits:memoryRows.filter(row=>row.mode==='ai'&&row.continuity).length,cases:memoryRows.length},personaCue:{hits:rows.filter(row=>row.mode==='ai'&&row.personaCue).length,cases:rows.filter(row=>row.mode==='ai').length},
 nameLeaks:rows.filter(row=>row.nameLeak).length,uniqueByScenario,latencyMs:{requestP50:percentile(latency,.5),requestP95:percentile(latency,.95),endToEndP50:percentile(e2e,.5),endToEndP95:percentile(e2e,.95)},
 usage:{promptTokens,completionTokens,totalTokens:promptTokens+completionTokens},rejectedReasons:rejected,rows};

function anonymousOrder(index){return ids.map((_,offset)=>ids[(offset*5+index*2)%ids.length]);}
if(packetPath&&rows.length){
 const blocks=completedScenarios.map((scenario,index)=>{
  const order=anonymousOrder(index),letters='ABCDEF';
  const answers=order.map((id,pos)=>{
   const row=rows.find(item=>item.scenario===scenario.id&&item.character===id);
   return `### ${letters[pos]}\n\n${row.displayLines.join('\n\n')}`;
  }).join('\n\n');
  return `## 情境 ${index+1}：${scenario.title}\n\n玩家说：${scenario.text}\n\n${answers}`;
 }).join('\n\n---\n\n');
 const packet=`# 《别发到群里》匿名人物辨识测试\n\n请不要查看答案文件。下面每个情境里，A–F 分别来自老潘、春哥、老金、小卫、席瑞、正义，但顺序会变化。仅根据措辞、关注点和反应方式判断发送者。\n\n对每个情境记录：A–F 分别是谁、判断依据、最难区分的两个人、哪句像模板或 AI。最后给每位角色的“辨识把握”打 1–5 分。不要依据姓名或头像；样本已经隐藏这些信息。\n\n${blocks}\n\n## 试玩后问题\n\n1. 哪些角色不用名字也能认出来？凭什么？\n2. 哪两个人最像？\n3. 哪些回复像真实朋友，哪些像统一模板？\n4. 有哪句情绪过重、重复口头禅或不符合微信长度？\n5. 如果其中一个账号被冒用，你会只凭语气相信它吗？为什么？\n`;
 await writeFile(packetPath,packet);
 if(keyPath){
  const keyText=completedScenarios.map((scenario,index)=>`情境 ${index+1}：${anonymousOrder(index).map((id,pos)=>`${'ABCDEF'[pos]}=${cast[id].name}`).join('，')}`).join('\n');
  await writeFile(keyPath,`# 匿名人物辨识测试答案（勿发给测试者）\n\n${keyText}\n`);
 }
}
if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,rows:undefined},null,2));
if(!live&&planned.length!==24)process.exitCode=1;
