import {VERSION,rooms,files,voices,chapters,newGroupIds,activeGroupIds,isMixedGroup} from './story.js';
import {parse} from './intents.js';
import {learn,recipients} from './knowledge.js';
import {clone,recoverPendingReply} from './save.js';
import {lanContext,buildLanMemory} from './lan-memory.js';
import {syncNpcMemories,npcContext,chooseSpeaker,buildNpcMemory} from './npc-memory.js';
import {validateNpcOutput,socialKinds} from './npc-policy.js';
import {zhouFallback} from './zhou-dialogue.js';
import {validateAlanOutput} from './alan-policy.js';
export function message(s,room,from,text,type='text',value=null){
 const m={id:`${s.runId}:${++s.seq}`,room,from,text,type,value,tick:s.clock};s.messages.push(m);return m;
}
function once(s,key,fn){if(s.flags[key])return;s.flags[key]=true;fn()}
function note(s,room,text){message(s,room,'system',text)}
export function fresh(seed=1701){
 const s={version:VERSION,runId:globalThis.crypto?.randomUUID?.()||`run-${Date.now()}-${Math.random()}`,seed,seq:0,clock:0,chapter:0,messages:[],events:[],processed:[],flags:{},knowledge:{},positions:{me:'B03',lan:'展厅',linPerson:'设备间',linPhone:'西侧楼梯',zhou:'北侧外门'},actions:{},queue:[],evidence:[],viewed:[],shared:{old:true},sharedSelf:{},friendsRoute:null,driverRoute:null,friendsStep:0,threatStep:0,codeValid:true,permission:false,safeGroup:false,blocked:false,exited:false,ending:null,reason:'',checkpoints:[],pending:null,call:null,comfortSticker:null};
 for(const id of ['lan','lin','zhou'])s.knowledge[id]={facts:{},claims:[],sources:[],stickers:[],recent:[],action:'等待'};
 s.knowledge.lan.facts={room:'B03',code:true};
 message(s,'old','system','你、老潘、春哥、老金在群聊中');
 message(s,'old','zhou','车停北侧外门了，尾号 0719。最后一趟，别又把推车搬上来。');
 message(s,'old','lan','撤场资料放这儿。我去找春哥，等下碰头。','file','map');
 message(s,'old','lin',voices.original.text,'voice','original');
 message(s,'lan','lan','你换的休息室交接单，单独发你了。群里还挂着旧集合点，等我找到春哥再改。','file','handoff');
 message(s,'lan','lan','反锁试过了？外面没码进不来。你把东西收好，给我回一句。');
 message(s,'old','lan','[共享位置] 老潘的设备在展厅；北侧为旧集合点。','location','public');
 syncNpcMemories(s);return s;
}
export function checkpoint(s,label){
 syncNpcMemories(s);
 const snap=clone(s);snap.checkpoints=[];snap.pending=null;s.checkpoints.push({label,snapshot:snap});if(s.checkpoints.length>2)s.checkpoints.shift();
}
export function retry(s,index=s.checkpoints.length-1){const cp=s.checkpoints[index];if(!cp)return fresh(s.seed);const restored=recoverPendingReply(clone(cp.snapshot));restored.checkpoints=clone(s.checkpoints.slice(0,index+1));restored.runId=globalThis.crypto?.randomUUID?.()||`retry-${Date.now()}`;restored.call=null;restored.pending=null;syncNpcMemories(restored);return restored}
function finish(s,ending,reason){s.ending=ending;s.reason=reason;s.call=null;s.pending=null;s.events.push({clock:s.clock,kind:'ending',ending,reason});}
function reply(s,room,text,who){const from=who||recipients(s,room)[0]||'lan';message(s,room,from,text);}
function onset(s){
 if(s.chapter===0&&s.flags.text&&s.flags.sticker&&s.flags.original&&s.viewed.includes('map')&&s.viewed.includes('handoff')){
  s.chapter=1;s.clock=Math.max(s.clock,6);message(s,'lin','lin',voices.copy.text,'voice','copy');message(s,'lin','lin','刚才没发出去？你现在在哪间？我来找你。');
  // The copied message is encountered before the explanation; Alan does not read it.
 }
 if(s.chapter===1&&s.flags.copyReviewed&&!s.flags.truthCall){
  s.flags.truthCall=true;message(s,'lan','lan','有件事得单独跟你说，方便接电话吗？');s.call={who:'lan',status:'incoming',voice:'truth'};
 }
}
function confirmAnomaly(s){once(s,'anomaly',()=>{
 s.chapter=2;s.clock=Math.max(s.clock,10);s.positions.lan='设备间';s.positions.linPerson='设备间';
 message(s,'lan','lan','他在我旁边，没拿手机。刚才那两短一长的敲击是关展厅铁架的声音，铁架已经被搬走了。');
 message(s,'lan','lan','我让他把手伸到我镜头里。他说刚才推车卡住，手机放楼梯上就忘了拿。我们两人只用我这个号。');
 message(s,'lan','lan','值班室还有一张维修通知。原图不能直接当今晚的路线。','file','repair');
 message(s,'lin','lin','走西门，最快。我更新了。','file','false');
 message(s,'old','zhou','北口吊装把路全挡了，我只能在园区外绕。选好新出口告诉我，别让我空等。');
 checkpoint(s,'已确认异常');
 });}
function moveThreat(s){
 if(s.chapter<3||s.exited||!s.knowledge.lin.facts.room||s.flags.lured)return;
 if(s.threatStep===0){s.threatStep=1;s.positions.linPhone='B楼楼梯';message(s,'lin','lin','B 楼的灯怎么关了。我上楼找你。');note(s,'lan','[楼下响起一段拖轮声，随后是楼梯上的脚步。]');}
 else if(s.threatStep===1){s.threatStep=2;s.positions.linPhone='B03门外';message(s,'lin','lin',voices.door.text,'voice','door');message(s,'lan','lan','我们还在楼下通道。你门口的不是我们。门锁挡得住，别给它权限。');if(!s.blocked&&!s.call)s.call={who:'lin',status:'incoming',voice:'door'};}
 else s.threatStep=3;
}
function death(s){if(s.knowledge.lin.facts.room&&s.threatStep>=3&&(s.permission||(s.knowledge.lin.facts.code&&s.codeValid))&&s.positions.me==='B03')finish(s,'C','春哥账号已收到 B03；它经楼梯、走廊抵达门外；有效门码或开门许可让它进入。');}
function advance(s){
 s.clock++;moveThreat(s);
 if(s.friendsRoute&&!s.flags.intercepted&&s.friendsStep<2){
  s.friendsStep++;
  if(s.friendsStep===1){s.positions.lan=s.friendsRoute==='east'?'泵房':'南连廊';s.positions.linPerson=s.positions.lan;message(s,'lan','lan',s.friendsRoute==='east'?'到泵房了。春哥跟着我，地上的水不深。我们先停在转角。':'到南连廊了。外侧门要司机拉一下，我们在里面等。');
   if(s.shared.old&&!s.flags.lured){const route=s.friendsRoute;s.flags.publicRoute=route;s.flags.intercepted=true;message(s,'old','lan',`[共享位置更新] ${s.positions.lan}`,'location',route);s.knowledge.lin.claims.push({value:route,source:s.messages.at(-1).id});message(s,'lin','lin','我看到你们往哪儿去了。');message(s,'lan','lan','糟了，旧群共享还没关。前面有拖轮声，我们停住；先关共享，再换另一条。');}
  }
  else {s.positions.lan='B楼安全楼梯';s.positions.linPerson=s.positions.lan;message(s,'lan','lan','我们从安全楼梯到 B 楼下了。先核验再出门：让春哥说推车为什么卡住。');s.chapter=4;s.clock=Math.max(s.clock,26);checkpoint(s,'最终会合前');}
 }
 death(s);
}
function setRoute(s,room,route){
 const people=recipients(s,room);const safe=route==='east'||route==='south';
 if(people.includes('lin')){
  s.knowledge.lin.claims.push({value:route,source:s.messages.at(-1)?.id});
  if(safe){s.flags.publicRoute=route;message(s,'lin','lin',route==='east'?'泵房是吧。我也过去。':'南侧服务门。我记住了。');
   if(s.friendsRoute===route){s.flags.intercepted=true;message(s,'lan','lan','前面有拖轮声。像是有人正堵在出口。刚才的路线是不是发给春哥账号了？我们先停住，得改另一条。');}}
  else {s.flags.lured=true;s.positions.linPhone=route==='west'?'西门途中':'北装卸口途中';message(s,'lin','lin','好，我去那里等。');}
 }
 if(!safe){if(people.includes('lan'))reply(s,room,'不走那边。西侧货梯没电，北口吊装封着。请结合维修通知核实东侧或南侧。','lan');return;}
 if(people.includes('lan')){
  if(!s.flags.inspected){reply(s,room,'先让我现场核实一下防火门，再确定路线。','lan');return;}
  if(s.friendsRoute!==route){s.friendsStep=0;s.flags.verifiedMeet=false;s.flags.intercepted=false;}
  s.friendsRoute=route;s.chapter=Math.max(s.chapter,3);s.clock=Math.max(s.clock,16);
  s.knowledge.lan.action=`沿${route}移动`;s.actions.friends=route;
  const followup=people.includes('lin')?'收到。我先核实怎么走。':people.includes('zhou')?'收到，老金也在群里。':'我带着春哥。记得单独通知老金。';
  reply(s,room,people.includes('lin')?followup:`收到，${route==='east'?'经泵房走东门':'改走南连廊服务门'}。${followup}`,'lan');
  if(s.flags.publicRoute===route&&!s.flags.lured){s.flags.intercepted=true;message(s,'lan','lan','刚到转角就听到拖轮声，出口被跟上了。我们停在里面；请改另一条路线。');}
  once(s,'threatAsk',()=>{message(s,'lin','lin','你还在休息室？把房号、门码发我。我去接你。');message(s,'lan','lan','我们靠近前会报推车的事。别有人敲门就开，记住了吗。');});
 }
 if(people.includes('zhou')){s.driverRoute=route;s.positions.zhou=route==='east'?'东门外':'南服务门外';reply(s,room,`收到，我绕到${route==='east'?'东门':'南侧服务门'}外等。车灯闪两下，车牌尾号 0719。`,'zhou');}
 advance(s);
}
function handleIntent(s,room,intent){
 const people=recipients(s,room),trusted=people.includes('lan'),lin=room==='lin';
 if(isMixedGroup(room)&&(['inspect','verify','where'].includes(intent.kind)||(intent.kind==='route'&&!intent.move))){
  reply(s,room,trusted?'这事私聊说，先别在群里发位置。':'楼里的事请单独问老潘。',trusted?'lan':'zhou');return;
 }
 switch(intent.kind){
 case 'open':s.pending={kind:'open',room};return;
 case 'leave':s.pending={kind:'leave',room};return;
 case 'abandon':s.pending={kind:'abandon',room};return;
 case 'newGroup':createGroup(s);return;
 case 'resetCode':s.codeValid=false;note(s,room,'[你在内侧面板作废了临时门码。门仍然反锁。]');return;
 case 'hide':reply(s,room,lin?'我看见灯了，怎么不回我？':'门反锁好就先待着。没有人能隔着门把你带走。');return;
 case 'help':if(room==='fieldGroup'){reply(s,room,'园区外的事请直接联系老金。','lan');return;}message(s,'zhou','zhou','我联系了园区门卫和外部救援，他们从外门排查，楼里需要时间。我留在车边，不让你们找不到人。');s.flags.help=true;return;
 case 'stopShare':if(trusted||room==='old'){s.shared.old=false;s.knowledge.lan.action='停止旧群共享';message(s,'old','lan','我已结束位置共享。');message(s,'lan','lan','关掉了。但之前的点位对方已经看见，改路线仍得谨慎。');}else reply(s,room,'你只能结束自己共享的位置；老潘的共享需要问她。');return;
 case 'route':if(intent.move)setRoute(s,room,intent.route);else reply(s,room,lin?'西门一直能走啊。':'东门要经泵房，南侧服务门是备用。先核实现场，再明确告诉我走哪条。');return;
 case 'inspect':if(trusted&&s.chapter>=2){s.flags.inspected=true;message(s,room,'lan','我照了手电。西货梯按钮是黑的，远处西门有铁链。东侧防火门能推开，泵房地上有浅水；南连廊也通。维修通知说得对。');}else reply(s,room,lin?'不用看，听我的就行。':'楼内要问老潘，我只能确认外门车辆。');return;
 case 'verify':if(room==='zhou'){reply(s,room,'我是老金。车牌尾号 0719，车灯闪两下；楼里的身份请向老潘核实。','zhou');return;}if(trusted&&s.chapter===1){confirmAnomaly(s);return;}if(trusted&&s.friendsStep===2){s.flags.verifiedMeet=true;message(s,room,'lan','[春哥借老潘的手机] 推车右轮缠了你那卷蓝胶带。上车以后你赔我一瓶水。老潘就在旁边，我们在 B 楼安全楼梯，不在休息室门前。');if(s.comfortSticker)message(s,room,'lan','', 'sticker',s.comfortSticker);return;}reply(s,room,lin?'我就是春哥。你连我的声音都听不出来？':s.chapter>=2?'春哥人和我在一起。他手机在别处。先前录音背景声一模一样，是同一个片段。':'你可以回听群里的原始语音。先把交接单看完。');return;
 case 'where':if(trusted&&s.chapter>=3){advance(s);reply(s,room,`我们两人在${s.positions.lan}。手机只有我这一部。`,'lan');}else reply(s,room,lin?`我在${s.positions.linPhone}。你在哪？`:room==='zhou'?`车在${s.positions.zhou}，我不知道楼内情况。`:`我在${s.positions.lan}，找完春哥就来。`);return;
 case 'advance':if(s.chapter>=3)advance(s);else reply(s,room,'先把手头的资料和消息核对一下。');return;
 case 'pickup':if(people.includes('zhou')&&room!=='old'){
  if(!s.exited){reply(s,room,'你还没出来。先和他们核验，在安全楼梯会合。','zhou');return;}
  finish(s,s.friendsStep===2&&s.flags.verifiedMeet&&s.driverRoute===s.friendsRoute&&!s.flags.intercepted?'A':'B',s.driverRoute!==s.friendsRoute?'接应变更没有送达司机，他等在另一个出口。':'你在确认身份后与两位朋友会合，司机收到相同出口安排。');
  if(s.ending==='A')message(s,'old','lin','你们是不是又建了一个群？');
 }else reply(s,room,'接应要通知老金。');return;
 case 'caution':reply(s,room,lin?'那我等你。':'明白，先不开门；核验完再行动。');return;
 case 'comfort':reply(s,room,lin?'那你来接我啊。':'嗯。你别挂，我们一起出去。');return;
 case 'urge':reply(s,room,lin?'我马上到。':'知道，我不会跑散。要继续走，告诉我“继续走”或问我到哪了。');return;
 case 'accuse':reply(s,room,lin?'怎么突然这样说？刚刚还好好的。':'先把人带出来，别在这里吵。');return;
 case 'smalltalk':reply(s,room,lin?'等我到了再说。':'收到了。等上车再聊，今晚真的够累。');return;
 default:{
  const text=s.messages.filter(m=>m.room===room&&m.from==='me').at(-1)?.text||'';
  if(trusted&&!people.includes('lin')&&/安全|还好吗|怎么办|害怕|好怕|慌/.test(text)){
   const answer=s.chapter<2?'我还在找春哥。你先把门反锁好，我找到他就联系你。':s.exited?'看见你了。我们一起走，接应再跟老金确认一下。':s.flags.intercepted?'我们停住了，先不往前走。你也别急着出门。':s.friendsStep===2?'我们在等你。你先核对门外身份，别急着开门。':'我们暂时安全。你先别出门，看看我发你的维修通知。';
   reply(s,room,answer,'lan');return;
  }
  s.seed=(s.seed*1664525+1013904223)>>>0;reply(s,room,lin?'我还在等你回话。你想问哪件事？':s.seed%2?'我在，慢慢说。你想先确认哪件事？':'我没听明白，你再具体说说？');
 }
 }
}
function createGroup(s,id='safe'){
 if(!newGroupIds.includes(id)||activeGroupIds(s).includes(id))return;
 if(id==='safe')s.safeGroup=true;
 else (s.extraGroups??={})[id]=true;
 const names=rooms[id].members.filter(member=>member!=='me').map(member=>rooms[member].name);
 note(s,id,`你邀请${names.join('、')}加入了群聊「${rooms[id].name}」`);
 if(id==='safe')message(s,id,'lan',s.chapter>=2?'这里就我们三个账号，春哥跟我用一部手机。路线在这里说。':'先建个接应群。等找到春哥，我再联系你。');
 else if(id==='driverGroup')message(s,id,'zhou','群收到了。有接应的安排就告诉我。');
 else message(s,id,'lan','我看到群了。具体情况咱们私聊。');
}
export function dispatch(input,event){
 if(event.runId&&event.runId!==input.runId)return input;
 if(input.processed.includes(event.id))return input;
 if(event.type==='NEW_GROUP'&&event.group!==undefined&&!newGroupIds.includes(event.group))return input;
 if(['SEND','FORWARD','LOCATION','STOP_SELF_SHARE','CALL'].includes(event.type)&&isMixedGroup(event.room)&&!activeGroupIds(input).includes(event.room))return input;
 const s=clone(input);if(s.ending&&event.type!=='RESTORE')return s;
 s.processed.push(event.id);s.events.push({id:event.id,clock:s.clock,...event});const room=event.room||'lan';
 switch(event.type){
 case 'SEND':{
  const text=event.text.trim();if(!text)return input;
  const m=message(s,room,'me',text,event.messageType||'text',event.value);learn(s,room,m);
  for(const who of recipients(s,room))s.knowledge[who].recent.push(m.id);
  if(event.messageType==='sticker'){
   s.flags.sticker=true;if(recipients(s,room).includes('lan')&&!recipients(s,room).includes('lin'))s.comfortSticker=event.value;
   reply(s,room,room==='lin'?'这张我也存下了。':'收到你的表情了。看见这个，心里踏实一点。');
   if(recipients(s,room).includes('lin')&&s.chapter>=2)message(s,'lin','lin','','sticker',event.value);
  }else {s.flags.text=true;if(/^(?:👍|❤️?|😭|😅|👀|🙏|😀|😂)+$/u.test(text))s.flags.sticker=true;const intent=parse(text),speaker=chooseSpeaker(room,text);handleIntent(s,room,intent);
   if(socialKinds.has(intent.kind)&&speaker){
    const target=s.messages.at(-1);if(target?.room===room&&target.from!=='me'&&target.from!=='system'){
     target.from=speaker;
     const address=buildNpcMemory(s,speaker).preferences.address;
     if(/叫我|喊我|称呼|还记得/.test(text))target.text=address?(/还记得|怎么.*称呼/.test(text)?`${address.value}。记得的。`:`好，${address.value}。我记住了。`):speaker==='lin'?'你刚刚是怎么说的？再说一遍。':speaker==='zhou'?'你还没跟我说过这个，怎么称呼你？':target.text;
     if(speaker==='zhou'&&intent.kind==='unknown'&&!/叫我|喊我|称呼|还记得/.test(text))target.text='我这边只知道收到的接应消息。你要我确认什么，具体说一下。';
     if(speaker==='zhou'){const natural=zhouFallback(npcContext(s,speaker,room,target.id));if(natural)target.text=natural;}
    }
   }
  }break;
 }
 case 'READ_FILE':if(!s.viewed.includes(event.value))s.viewed.push(event.value);break;
 case 'AI_INTENT':if(['verify','inspect','comfort','urge','smalltalk'].includes(event.intent)&&s.messages.at(-1)?.id===event.contextId)handleIntent(s,room,{kind:event.intent});break;
 case 'ALAN_REPLY':case 'NPC_REPLY':{const who=event.character||'lan';const target=s.messages.find(m=>m.id===event.targetId);const latest=s.messages.filter(m=>m.from==='me'&&m.room===room).at(-1);if(!target||target.from!==who||target.room!==room||latest?.id!==event.userId||s.seq!==event.revision)break;const checked=validateNpcOutput(event.output,npcContext(s,who,room,target.id));if(!checked.ok)break;target.text=checked.lines.join('\n');target.ai={provider:'deepseek',character:who,memoryRefs:checked.memoryRefs};break;}
 case 'PLAY_VOICE':if(event.value==='original')s.flags.original=true;if(event.value==='truth'&&s.chapter===1)confirmAnomaly(s);if(event.value==='copy'&&s.chapter===1)s.flags.copy=true;break;
 case 'VOICE_REVIEWED':if(event.value==='copy'&&s.flags.copy)s.flags.copyReviewed=true;break;
 case 'SAVE':if(!s.evidence.includes(event.messageId))s.evidence.push(event.messageId);break;
 case 'FORWARD':{const original=s.messages.find(m=>m.id===event.messageId);if(!original)return input;const m=message(s,room,'me',original.text,original.type,original.value);m.origin={id:original.id,from:original.from,room:original.room};learn(s,room,m);reply(s,room,'文件/消息收到了。');if(original.type==='text'){const p=parse(original.text);if(p.kind==='route'&&p.move)setRoute(s,room,p.route);}break;}
 case 'NEW_GROUP':createGroup(s,event.group);break;
 case 'LOCATION':{
  const title=event.value==='room'?'B 楼二层 B03 临时休息室':event.value==='east'?'东门外':event.value==='south'?'南侧服务门':'B 楼附近（不含楼层与房号）';
  const m=message(s,room,'me',title,'location',event.value);m.isShared=!!event.share;m.device='me';m.lastLocation=title;learn(s,room,m);if(event.share)s.sharedSelf[room]=true;
  reply(s,room,recipients(s,room).includes('lin')?'我看到你的位置了。':'位置收到了，先保护好自己。');break;}
 case 'STOP_SELF_SHARE':for(const m of s.messages.filter(m=>m.room===room&&m.isShared&&m.device==='me'))m.lastLocation=s.positions.me;s.sharedSelf[room]=false;note(s,room,'你结束了位置共享；之前发出的地点卡片仍保留。');break;
 case 'ANSWER':if(s.call){s.call.status='active';message(s,s.call.who,s.call.who,voices[s.call.voice].text,'call',s.call.voice);if(s.call.voice==='truth')confirmAnomaly(s);}break;
 case 'CALL':{const target=room==='driverGroup'?'zhou':room==='fieldGroup'?'lan':room;s.call={who:target==='zhou'?'zhou':target==='lin'?'lin':'lan',status:'active',voice:target==='lin'?'door':target==='zhou'||s.chapter===0?null:'truth'};if(target!=='lin'&&target!=='zhou'&&s.chapter>=1)confirmAnomaly(s);message(s,s.call.who,s.call.who,s.call.voice?voices[s.call.voice].text:target==='zhou'?'老金：我在车里。楼里的事请问老潘。':'老潘：我还在找春哥，找到后联系你。','call',s.call.voice);break;}
 case 'HANGUP':if(s.call){message(s,s.call.who,'system',s.call.status==='incoming'?'未接听 · 可在聊天中查看通话文字记录':'语音通话已结束');if(s.call.status==='incoming'&&s.call.voice==='truth')message(s,'lan','lan',voices.truth.text,'voice','truth');s.call=null;}break;
 case 'CONFIRM':{
  const p=s.pending;s.pending=null;if(!p)break;
  if(p.kind==='open'){s.permission=true;note(s,p.room,'[你解开反锁，明确允许门外的人进入。]');if(s.threatStep>=2){s.threatStep=3;death(s);}else {note(s,p.room,'[门外暂时无人。你重新锁好了门。]');s.permission=false;}}
  if(p.kind==='abandon'&&s.threatStep>=2&&!s.flags.lured){note(s,p.room,'[门外仍有人堵着。你退回门内；需要先让它离开，才能安全撤离。]');break;}
  if(p.kind==='abandon'){s.exited=true;s.positions.me='外门';finish(s,'B','你明确选择不等朋友、提前离开。');}
  if(p.kind==='leave'){
   if(s.threatStep>=2&&!s.flags.lured){note(s,p.room,'[门把手仍被外侧握住。你没有推门，退回门内。先作废门码或用假路线把它引走。]');}
   else if(s.friendsStep===2&&s.flags.verifiedMeet&&!s.flags.intercepted){s.exited=true;s.positions.me=s.friendsRoute==='east'?'东门':'南侧服务门';s.positions.lan=s.positions.me;s.positions.linPerson=s.positions.me;s.chapter=5;s.clock=Math.max(s.clock,34);message(s,'lan','lan','看见你了。我们三个一起走，别回头。给老金发“来接我们”。');}
   else note(s,p.room,'[你看了看猫眼，没有熟悉的人。先核验两位朋友是否到达安全楼梯；如要放弃等待，可明确选择提前离开。]');
  }break;
 }
 case 'CANCEL':s.pending=null;break;
 case 'RESET_CODE':s.codeValid=false;note(s,room,'[内侧面板：临时门码已作废。]');break;
 case 'BLOCK':s.blocked=true;note(s,'lin','你已屏蔽此账号来电；这不会抹去对方已经收到的信息。');if(s.call?.who==='lin')s.call=null;break;
 case 'ADVANCE':advance(s);break;
 }
 onset(s);
 if(s.shared.old)for(const m of s.messages.filter(m=>m.value==='public'&&m.type==='location'))m.lastLocation=s.positions.lan;
 for(const m of s.messages.filter(m=>m.isShared&&m.device==='me'&&s.sharedSelf[m.room]))m.lastLocation=s.positions.me==='B03'&&m.value!=='room'?'B 楼附近（不含楼层与房号）':s.positions.me;
 // A leaked code is not an instant death; movement only advances through explicit events.
 syncNpcMemories(s);
 return s;
}
export function objective(s){
 if(s.ending)return '本次会话已结束';
 if(s.chapter===0){if(!s.viewed.includes('handoff'))return '老潘：交接单单独发你了，先看一下。';if(!s.viewed.includes('map'))return '群里有园区图，走之前记得看。';if(!s.flags.original)return '春哥在群里发了一条语音。';if(!s.flags.text)return '老潘在等你回话。';if(!s.flags.sticker)return '给老潘发个表情，省得她担心。';}
 if(s.chapter===1)return '对比两条语音，再听听老潘怎么说。';
 if(s.chapter===2)return s.flags.inspected?'把核实后的出口安排发给老潘和老金。':'老潘：维修通知在私聊里，先核实现场。';
 if(s.flags.intercepted)return '老潘：我们停住了，得换另一条通道。';
 if(s.chapter===3)return '确认两人的进度，别忘了告诉司机新出口。';
 if(s.chapter===4)return s.flags.verifiedMeet?'确认门外安全后，出门与他们会合。':'春哥：问问我，推车是怎么卡住的。';
 return '给老金发消息，确认接应。';
}
