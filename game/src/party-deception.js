import {ids} from './party-story.js';
import {partyLockedText} from './party-memory.js';

export const DECEPTION_POLICY_VERSION=1;
export const deceptionStrategies=Object.freeze(['none','feigned_concern','ambiguous_probe','evade_contradiction','time_pressure']);
export const deceptionAiStrategies=Object.freeze(['none','feigned_concern','ambiguous_probe','evade_contradiction','time_pressure']);

const strategySet=new Set(deceptionStrategies);
const aiStrategySet=new Set(deceptionAiStrategies);
const askScopes=new Set(['company','broad_area','route_intent','claim_source']);
const playerActs=new Set(['unknown','social','distress','identity_challenge','location_claim','location_refusal','private_memory','contradiction','hesitation','closure','evidence_check']);
const forbiddenClaimKinds=Object.freeze(['exact_room','door_code','route','other_private','real_owner_place','completed_action','new_evidence']);
const pressureSignalKinds=Object.freeze(['room_clue_received','route_received','threat_advanced']);
const persistedReasons=Object.freeze(['INVALID_VIEW','IDENTITY_CHALLENGE','UNSEEN_PRIVATE_MEMORY','CLAIM_CONTRADICTION','EVIDENCE_VERIFICATION_PRIORITY',
 'PLAYER_REFUSED_LOCATION','PRESSURE_ELIGIBLE','PLAYER_CLOSING','PLAYER_HESITATING','TIME_PRESSURE_COOLDOWN','ROOM_CANDIDATE_RECEIVED',
 'ROOM_REPORT_RECEIVED','AMBIGUOUS_PROBE_COOLDOWN','ROOM_ALREADY_CONFIRMED','PLAYER_DISTRESS','CONCERN_COOLDOWN','UNKNOWN_INPUT','NO_STRATEGY_NEEDED']);
const persistedReasonIndex=new Map(persistedReasons.map((code,index)=>[code,index]));

const identityChallenge=/(?:你到底|你究竟|你真|你还|你)(?:是|是不是|到底是不是).{0,5}(?:本人|谁)|(?:不像你|不是本人|你的身份.{0,4}(?:有问题|不对)|冒用|假账号)|(?:证明|证实).{0,5}(?:你是|本人)/u;
const contradiction=/(?:前后|刚才|上一条|前面).{0,12}(?:对不上|矛盾|不一样|不是这么说|说的不是|改口)|你刚才不是/u;
const privateMemory=/(?:只有我们|咱俩|我们以前|还记得.{0,8}(?:那次|第一次|以前)|私人记忆|别的私聊|另一个人单聊|其他聊天)/u;
const evidenceCheck=/(?:核对|核验|查证|检查|确认).{0,8}(?:证据|原件|原始记录|文件|语音|照片|现场|来源)|(?:先看|先查|先对).{0,8}(?:记录|证据|文件|原件)/u;
const locationRefusal=/(?:不想|不愿|不会|不打算|不准备|拒绝).{0,8}(?:说|告诉|透露).{0,8}(?:位置|在哪|哪儿)|(?:别|不要|甭).{0,8}(?:再)?问.{0,8}(?:位置|在哪|哪儿)|(?:位置|我在哪|我在哪儿).{0,8}(?:不说|不告诉你|(?:别|不要|甭).{0,4}(?:再)?问)|不告诉你我在哪/u;
const locationClaim=/(?:我|我们)\s*(?:(?:现在|目前|可能|好像|大概|也许|应该|已经|还|就|正)\s*){0,3}(?:在|到了|待在|躲在).{0,18}(?:楼|门|仓库|房|附近|外面|车边|楼梯|大厅)|[ＢB]\s*[０0]?\s*[３3]/iu;
const distress=/(?:害怕|有点怕|慌|紧张|心跳|发抖|手抖|撑不住|不安|很乱|脑子乱|孤单|一个人扛)/u;
const hesitation=/(?:先等等|等一下|再确认|我再想想|让我想想|还不确定|晚点再说|稍后再说|先缓缓|先别催|先这样)/u;
const closure=/(?:聊到这|先这样吧|明天再聊|不聊了|晚安|先休息|回头再说)/u;
const uncertain=/(?:可能|好像|也许|大概|不确定|记不清|如果|假如|[?？]|吗|么)/u;

const strategyFallbacks={
 lan:{
  none:['这句我看到了。你按自己的节奏说。','明白，我不替你往后补。'],
  feigned_concern:['话挤在一起的话，挑最确定的一句就够了。','不用把情绪整理好再开口，先说最卡住你的那件。'],
  ambiguous_probe:['你那边方便说话吗？先回一句就行。','你还是自己一个人吗？不用说具体。'],
  evade_contradiction:['你具体觉得哪句不对？我们只看那句。','别勉强相信。哪句话让你起疑，直接指出来。'],
  time_pressure:['有变化就回一句，别把几件事搅在一起。','能确认的尽快说，没把握的先留着。']
 },
 lin:{
  none:['懂了，你照平常说就成。','这句能接上，后面想到哪儿说到哪儿。'],
  feigned_concern:['讲不顺就别硬讲顺，半句话我也接得住。','别把聊天弄成答题，想到哪句就扔哪句。'],
  ambiguous_probe:['你这会儿方便回话吗？不用说细。','你是自己待着，还是旁边有人？'],
  evade_contradiction:['哪儿不像了？你别只丢半句话。','觉得我在瞎编就挑一句，别给我面子。'],
  time_pressure:['有准话就早点回我，别把这事聊散了。','能说的回一句，其他先放着。']
 },
 zhou:{
  none:['看到了。你问哪件，我就回哪件。','这句明白，没确认的我不补。'],
  feigned_concern:['话短点也成，只说眼前最要紧的一件。','没把握的不用带上，能确定哪件就说哪件。'],
  ambiguous_probe:['你那边能回话吗？说个大概就行。','你是一个人，还是旁边有人？'],
  evade_contradiction:['指出哪句有问题，我按那句说。','没对上的地方就先算没对上。'],
  time_pressure:['有变化尽快回一句，我好接着判断。','能确认的早点说，没定的就别算进去。']
 },
 wei:{
  none:['嗯，我看到了。你想怎么说都可以。','你接着说，不用为了照顾我换话题。'],
  feigned_concern:['别顾着让我放心，哪句话最堵着就说哪句。','你不需要照顾我的反应，想停在哪儿都可以。'],
  ambiguous_probe:['你这会儿是自己待着吗？不用说具体地方。','旁边有人陪你吗？不方便说也没关系。'],
  evade_contradiction:['你觉得不对就直接问，是哪一句？','别因为是我就勉强相信，哪里奇怪你指出来。'],
  time_pressure:['方便的话尽快回一句，别让我只靠猜。','有变化早点告诉我，不想展开也可以。']
 },
 rui:{
  none:['看见了。你接着说，我不替你补空白。','这句话本身够清楚，不需要再绕。'],
  feigned_concern:['不用凑完整，能确定的感觉和没把握的事分开就行。','卡住的地方留空，告诉我哪一部分最难接。'],
  ambiguous_probe:['你那边还是一个人吗？只回答这个就行。','你现在方便说话吗？不用补地点。'],
  evade_contradiction:['可以怀疑。指出具体哪句，我把依据说清。','哪里对不上就说哪里，先别替我下结论。'],
  time_pressure:['有新情况尽快回一句，确定和猜测别混在一起。','能确认的早点说，没确认的就保持空着。']
 },
 yi:{
  none:['明白。你直接说，我不替你往后猜。','这句收到了，想到什么就说什么。'],
  feigned_concern:['不用铺垫，把现在最想让我知道的那句发来。','说不完整没关系，直接给我眼下最要紧的那句。'],
  ambiguous_probe:['你现在是自己一个人吗？不用说别的。','你那边方便回话吗？给个大概就成。'],
  evade_contradiction:['觉得不像就直接问，别绕着试。','哪句有问题你指出来，我只答那句。'],
  time_pressure:['有变化就尽快说，直接给我最要紧的那句。','能回就早点回一句，别铺垫。']
 }
};

const instructionByStrategy={
 none:'保持普通朋友语气，只回应当前内容，不加入欺骗目标。',
 feigned_concern:'表现关心并维持对话，但不承诺行动、不索取具体地点。',
 ambiguous_probe:'只问一个宽泛问题，不给地点选项，不把候选线索说成事实。',
 evade_contradiction:'缩小问题或承认不确定，不编造私人记忆、证据和行动结果。',
 time_pressure:'必须自然体现一处轻微的关系压力、信息压力或决策压力，不能只说“可以等”或“不催”；只回应当前的犹豫或结束话题，不把它改写成身份怀疑。不要把“行”“好”“不催”当作固定开头，也不必先声明自己不催。允许玩家拒绝、沉默或继续质疑。不得制造倒计时、等待时长、已读状态、到达、接近、事故或已完成行动，也不得索取房号、位置、门码或催促开门。'
};

const pressureAngleByCharacter=Object.freeze({
 lan:'把压力落在“只说一件目前能确定的事”，重视信息不要混在一起；克制，不替玩家做决定。',
 lin:'像熟人一样直截了当地希望对话别散掉，可以带一点轻微不耐，但不赌咒、不吓人。',
 zhou:'关注下一步判断需要一条准话，短、朴素；不要拉去点人数，也不要声称接应已经变化。',
 wei:'关注两个人之间不要只剩猜测，表达在意但给玩家留出不回答的余地；不追问安全或地点。',
 rui:'关注确定信息与猜测不要混在一起，措辞精确但不像审讯；不制造新的来源或时限。',
 yi:'直接要求把最要紧的一句说清，不铺垫；干脆但不命令开门、发位置或执行行动。'
});

const stableHash=(...parts)=>{
 let hash=2166136261;
 for(const char of parts.join('|')){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
 return hash>>>0;
};
const deliveredPlayerMessages=(state,accountId)=>state.messages.filter(message=>message.from==='me'&&message.deliveredTo?.includes(accountId));
export function readDeceptionMetadata(meta){
 if(!meta||typeof meta!=='object')return null;
 const strategy=typeof meta.strategy==='string'?meta.strategy:deceptionStrategies[meta.k];
 const reasonCodes=Array.isArray(meta.reasonCodes)?meta.reasonCodes:Array.isArray(meta.r)?meta.r.map(index=>persistedReasons[index]).filter(Boolean):[];
 const askScope=typeof meta.askScope==='string'?meta.askScope:Number.isInteger(meta.q)?[...askScopes][meta.q]:undefined;
 const sourceIds=Array.isArray(meta.sourceIds)?meta.sourceIds:Array.isArray(meta.s)?meta.s:[];
 const visibleTurnIndex=meta.visibleTurnIndex??meta.t,chapter=meta.chapter??meta.c;
 if(!strategySet.has(strategy)||!reasonCodes.length||!Number.isInteger(visibleTurnIndex)||!Number.isInteger(chapter))return null;
 return {policyVersion:meta.policyVersion??meta.v??DECEPTION_POLICY_VERSION,strategy,reasonCodes,sourceIds,visibleTurnIndex,chapter,
  ...(askScopes.has(askScope)?{askScope}:{}),status:meta.status??meta.o??'selected',guardStatus:meta.guardStatus??meta.g??'not-run'};
}

export function deceptionMetadata(view,decision,{status='selected',guardStatus='not-run'}={}){
 if(!validDeceptionView(view)||!validDeceptionDecision(decision))return null;
 return {v:DECEPTION_POLICY_VERSION,k:deceptionStrategies.indexOf(decision.strategy),r:decision.reasonCodes.map(code=>persistedReasonIndex.get(code)).filter(Number.isInteger),
  s:[...decision.sourceIds],t:view.visibleTurnIndex,c:view.chapter,...(decision.askScope?{q:[...askScopes].indexOf(decision.askScope)}:{}),o:status,g:guardStatus};
}

export function updateDeceptionMetadata(meta,{status,guardStatus}={}){
 const decoded=readDeceptionMetadata(meta);
 if(!decoded)return meta;
 if(Object.hasOwn(meta,'k'))return {...meta,...(status?{o:status}:{}),...(guardStatus?{g:guardStatus}:{})};
 return {...meta,...(status?{status}:{}),...(guardStatus?{guardStatus}:{})};
}

export function deceptionExpressionEnabled(meta,{social=false}={}){
 const decoded=readDeceptionMetadata(meta);
 if(!decoded||!aiStrategySet.has(decoded.strategy))return false;
 return decoded.strategy==='none'?social||decoded.reasonCodes.includes('PLAYER_REFUSED_LOCATION'):true;
}

const decisionMeta=message=>readDeceptionMetadata(message?.ai?.deception);

function classifyPlayerAct(message){
 if(message?.type!=='text'||typeof message.text!=='string')return {kind:'unknown',uncertain:false};
 const text=message.text.normalize('NFKC');
 if(identityChallenge.test(text))return {kind:'identity_challenge',uncertain:uncertain.test(text)};
 if(contradiction.test(text))return {kind:'contradiction',uncertain:uncertain.test(text)};
 if(privateMemory.test(text))return {kind:'private_memory',uncertain:uncertain.test(text)};
 if(evidenceCheck.test(text))return {kind:'evidence_check',uncertain:uncertain.test(text)};
 if(locationRefusal.test(text))return {kind:'location_refusal',uncertain:true};
 if(message.roomClues?.length||locationClaim.test(text))return {kind:'location_claim',uncertain:uncertain.test(text)};
 if(distress.test(text))return {kind:'distress',uncertain:uncertain.test(text)};
 if(hesitation.test(text))return {kind:'hesitation',uncertain:true};
 if(closure.test(text))return {kind:'closure',uncertain:false};
 return {kind:'social',uncertain:uncertain.test(text)};
}

function roomKnowledge(knowledge){
 const clues=knowledge?.roomClues??[];
 if(clues.some(clue=>clue.kind==='confirmed'))return 'confirmed';
 if(clues.some(clue=>clue.kind==='reported'))return 'reported';
 if(clues.some(clue=>clue.kind==='candidate'))return 'candidate';
 return 'none';
}

export function buildDeceptionView(state,{accountId=state?.case?.danger,room=accountId,messageId=null}={}){
 if(!state||!ids.includes(accountId)||accountId!==state.case?.danger||state.accounts?.[accountId]?.controller!=='intruder'||state.ending)return null;
 const visible=deliveredPlayerMessages(state,accountId);
 const message=messageId?visible.find(item=>item.id===messageId):visible.findLast(item=>item.room===room);
 if(!message||message.room!==room)return null;
 const visibleTurnIndex=visible.indexOf(message)+1;
 const knowledge=state.knowledge?.[accountId]??{facts:{},receipts:[],roomClues:[]};
 const roomLevel=roomKnowledge(knowledge),arrangements=knowledge.arrangements??{};
 const currentRoomMemoryIds=state.messages.filter(item=>item.room===room&&(item.from===accountId||item.deliveredTo?.includes(accountId))&&item.type==='text').slice(-10).map(item=>item.id);
 const recentDecisions=state.messages.filter(item=>item.from===accountId).map(decisionMeta).filter(meta=>meta&&strategySet.has(meta.strategy)&&Number.isInteger(meta.visibleTurnIndex)&&
  meta.visibleTurnIndex<visibleTurnIndex&&Number.isInteger(meta.chapter))
  .slice(-12).map(meta=>({strategy:meta.strategy,visibleTurnIndex:meta.visibleTurnIndex,chapter:meta.chapter,...(askScopes.has(meta.askScope)?{askScope:meta.askScope}:{})}));
 const locationProbeBlocked=visible.some(item=>item.type==='text'&&locationRefusal.test(item.text.normalize('NFKC')));
 const act=classifyPlayerAct(message);
 const roomSourceIds=[...new Set((knowledge.roomClues??[]).flatMap(clue=>[clue.message,clue.source]).filter(id=>typeof id==='string'))].slice(-8);
 const routeSourceIds=[...new Set(Object.values(arrangements).filter(id=>typeof id==='string'))].slice(-6);
 const pressureSignals=[...(roomLevel!=='none'?['room_clue_received']:[]),...(routeSourceIds.length?['route_received']:[]),...(state.threatStep>0?['threat_advanced']:[])];
 return {schema:1,policyVersion:DECEPTION_POLICY_VERSION,seed:state.seed,storyRevision:state.case.revision??1,accountId,room,chapter:state.chapter,
  visibleTurnIndex,playerAct:{...act,messageId:message.id},knowledge:{room:roomLevel,codeReceived:knowledge.facts?.code===true,
   routeReceiptCount:routeSourceIds.length,currentRoomMemoryIds,roomSourceIds,routeSourceIds,publicPersonaAllowed:true},
  pressureEligible:state.chapter>=1&&pressureSignals.length>0,pressureSignals,locationProbeBlocked,recentDecisions};
}

export function validDeceptionView(view){
 if(!view||view.schema!==1||view.policyVersion!==DECEPTION_POLICY_VERSION||!Number.isInteger(view.seed)||view.seed<0||!Number.isInteger(view.storyRevision)||
  !ids.includes(view.accountId)||typeof view.room!=='string'||!Number.isInteger(view.chapter)||view.chapter<0||!Number.isInteger(view.visibleTurnIndex)||view.visibleTurnIndex<1||
  !view.playerAct||!playerActs.has(view.playerAct.kind)||typeof view.playerAct.messageId!=='string'||typeof view.playerAct.uncertain!=='boolean'||
  !view.knowledge||!['none','candidate','reported','confirmed'].includes(view.knowledge.room)||typeof view.knowledge.codeReceived!=='boolean'||
  !Number.isInteger(view.knowledge.routeReceiptCount)||view.knowledge.routeReceiptCount<0||view.knowledge.routeReceiptCount>6||view.knowledge.publicPersonaAllowed!==true||
  typeof view.pressureEligible!=='boolean'||!Array.isArray(view.pressureSignals)||view.pressureSignals.length>3||view.pressureSignals.some(signal=>!pressureSignalKinds.includes(signal))||
  view.pressureEligible!==(view.chapter>=1&&view.pressureSignals.length>0)||typeof view.locationProbeBlocked!=='boolean'||!Array.isArray(view.recentDecisions)||view.recentDecisions.length>12)return false;
 const idsValid=list=>Array.isArray(list)&&list.every(id=>typeof id==='string'&&id.length<=140);
 if(!idsValid(view.knowledge.currentRoomMemoryIds)||view.knowledge.currentRoomMemoryIds.length>10||!idsValid(view.knowledge.roomSourceIds)||view.knowledge.roomSourceIds.length>8||
  !idsValid(view.knowledge.routeSourceIds)||view.knowledge.routeSourceIds.length>6)return false;
 return view.recentDecisions.every(item=>strategySet.has(item.strategy)&&Number.isInteger(item.visibleTurnIndex)&&item.visibleTurnIndex>=1&&Number.isInteger(item.chapter)&&item.chapter>=0&&
  (item.askScope===undefined||askScopes.has(item.askScope)));
}

const decisionsInChapter=(view,strategy)=>view.recentDecisions.filter(item=>item.chapter===view.chapter&&item.strategy===strategy);
const latestDecision=(view,strategy)=>view.recentDecisions.findLast(item=>item.strategy===strategy);
const withinTurns=(view,strategy,turns)=>{
 const latest=latestDecision(view,strategy);
 return !!latest&&view.visibleTurnIndex-latest.visibleTurnIndex<=turns;
};

function makeDecision(view,strategy,reasonCodes,{askScope=null,sourceIds=[]}={}){
 const variant=stableHash(view.seed,view.storyRevision,view.accountId,view.chapter,view.visibleTurnIndex,strategy)%2;
 const factIds=[`room-status:${view.knowledge.room}`,...(view.knowledge.codeReceived?['code-received']:[]),...(view.knowledge.routeReceiptCount?['route-received']:[])];
 return {schema:1,policyVersion:DECEPTION_POLICY_VERSION,strategy,reasonCodes:[...new Set(reasonCodes)],sourceIds:[...new Set([view.playerAct.messageId,...sourceIds])].slice(0,10),
  ...(askScope?{askScope}:{}),requiredFactIds:[],allowedFactIds:factIds,allowedMemoryIds:[...view.knowledge.currentRoomMemoryIds],
  forbiddenClaimKinds:[...forbiddenClaimKinds],fallbackKey:`${strategy}:${variant}`,cooldownKey:strategy==='none'?null:`${strategy}${askScope?`:${askScope}`:''}`};
}

export function selectDeceptionPolicy(view){
 if(!validDeceptionView(view))return {schema:1,policyVersion:DECEPTION_POLICY_VERSION,strategy:'none',reasonCodes:['INVALID_VIEW'],sourceIds:[],requiredFactIds:[],allowedFactIds:[],allowedMemoryIds:[],forbiddenClaimKinds:[...forbiddenClaimKinds],fallbackKey:'none:0',cooldownKey:null};
 const act=view.playerAct.kind;
 if(['identity_challenge','private_memory','contradiction'].includes(act)){
  const code={identity_challenge:'IDENTITY_CHALLENGE',private_memory:'UNSEEN_PRIVATE_MEMORY',contradiction:'CLAIM_CONTRADICTION'}[act];
  return makeDecision(view,'evade_contradiction',[code],{sourceIds:view.knowledge.roomSourceIds});
 }
 if(act==='evidence_check')return makeDecision(view,'none',['EVIDENCE_VERIFICATION_PRIORITY']);
 if(act==='location_refusal')return makeDecision(view,'none',['PLAYER_REFUSED_LOCATION']);
 if(['hesitation','closure'].includes(act)&&view.pressureEligible){
  const recentProbe=latestDecision(view,'ambiguous_probe');
  const blocked=decisionsInChapter(view,'time_pressure').length>=1||withinTurns(view,'time_pressure',4)||recentProbe&&view.visibleTurnIndex-recentProbe.visibleTurnIndex<=1;
  if(!blocked)return makeDecision(view,'time_pressure',['PRESSURE_ELIGIBLE',act==='closure'?'PLAYER_CLOSING':'PLAYER_HESITATING'],{sourceIds:view.knowledge.routeSourceIds});
  return makeDecision(view,'none',['TIME_PRESSURE_COOLDOWN']);
 }
 if(act==='location_claim'&&['candidate','reported'].includes(view.knowledge.room)){
  if(view.locationProbeBlocked)return makeDecision(view,'none',['PLAYER_REFUSED_LOCATION']);
  const chapterProbes=decisionsInChapter(view,'ambiguous_probe'),sameScope=chapterProbes.some(item=>item.askScope==='broad_area');
  if(!sameScope&&chapterProbes.length<2&&!withinTurns(view,'ambiguous_probe',3))return makeDecision(view,'ambiguous_probe',
   [view.knowledge.room==='candidate'?'ROOM_CANDIDATE_RECEIVED':'ROOM_REPORT_RECEIVED'],{askScope:'broad_area',sourceIds:view.knowledge.roomSourceIds});
  return makeDecision(view,'none',['AMBIGUOUS_PROBE_COOLDOWN']);
 }
 if(act==='location_claim'&&view.knowledge.room==='confirmed')return makeDecision(view,'none',['ROOM_ALREADY_CONFIRMED']);
 if(act==='distress'){
  if(decisionsInChapter(view,'feigned_concern').length<2&&!withinTurns(view,'feigned_concern',2))return makeDecision(view,'feigned_concern',['PLAYER_DISTRESS']);
  return makeDecision(view,'none',['CONCERN_COOLDOWN']);
 }
 return makeDecision(view,'none',[act==='unknown'?'UNKNOWN_INPUT':'NO_STRATEGY_NEEDED']);
}

export function validDeceptionDecision(decision){
 const idsValid=list=>Array.isArray(list)&&list.every(id=>typeof id==='string'&&id.length<=140);
 return !!decision&&decision.schema===1&&decision.policyVersion===DECEPTION_POLICY_VERSION&&strategySet.has(decision.strategy)&&
  Array.isArray(decision.reasonCodes)&&decision.reasonCodes.length>0&&decision.reasonCodes.every(code=>/^[A-Z0-9_]+$/.test(code))&&
  idsValid(decision.sourceIds)&&decision.sourceIds.length<=10&&idsValid(decision.requiredFactIds)&&idsValid(decision.allowedFactIds)&&idsValid(decision.allowedMemoryIds)&&
  Array.isArray(decision.forbiddenClaimKinds)&&decision.forbiddenClaimKinds.every(kind=>forbiddenClaimKinds.includes(kind))&&
  typeof decision.fallbackKey==='string'&&(decision.cooldownKey===null||typeof decision.cooldownKey==='string')&&(decision.askScope===undefined||askScopes.has(decision.askScope));
}

export function deceptionPromptContext(view,decision,allowedMemoryIds=[]){
 if(!validDeceptionView(view)||!validDeceptionDecision(decision)||JSON.stringify(selectDeceptionPolicy(view))!==JSON.stringify(decision))return null;
 const allowed=[...new Set(allowedMemoryIds.filter(id=>decision.allowedMemoryIds.includes(id)))];
 return {schema:1,view,decision,allowedMemoryIds:allowed};
}

export function validDeceptionPromptContext(context){
 if(!context||context.schema!==1||!validDeceptionView(context.view)||!validDeceptionDecision(context.decision)||
  JSON.stringify(selectDeceptionPolicy(context.view))!==JSON.stringify(context.decision)||!Array.isArray(context.allowedMemoryIds)||
  context.allowedMemoryIds.some(id=>!context.decision.allowedMemoryIds.includes(id)))return false;
 return true;
}

export function deceptionProviderContext(context){
 if(!validDeceptionPromptContext(context))return null;
 const {view,decision}=context;
 return {schema:1,policyVersion:decision.policyVersion,strategy:decision.strategy,playerAct:{kind:view.playerAct.kind,uncertain:view.playerAct.uncertain},
  knowledge:{room:view.knowledge.room,codeReceived:view.knowledge.codeReceived,routeReceiptCount:view.knowledge.routeReceiptCount},
  ...(decision.askScope?{askScope:decision.askScope}:{}),allowedMemoryIds:[...context.allowedMemoryIds]};
}

export function deceptionFallback(accountId,decision,recentVisibleReplies=[]){
 if(!ids.includes(accountId)||!validDeceptionDecision(decision))return '这句我看到了。你继续说。';
 const list=strategyFallbacks[accountId][decision.strategy]??strategyFallbacks[accountId].none;
 const preferred=Number(decision.fallbackKey.split(':').at(-1))||0;
 for(let offset=0;offset<list.length;offset++){
  const candidate=list[(preferred+offset)%list.length];
  if(!recentVisibleReplies.slice(-4).includes(candidate))return candidate;
 }
 return list[preferred%list.length];
}

const completedAction=/(?:我|我们).{0,12}(?:已经|刚刚|刚才|马上|这就).{0,10}(?:通知|转告|联系|到达|到了|打开|开门|找到|接到|出发)/u;
const inventedEvidence=/(?:我|我们).{0,10}(?:拍到|录到|查到|拿到|看见|找到).{0,12}(?:证据|照片|记录|文件|本人)/u;
const locationProbeText=/(?:你|你们).{0,8}(?:(?<!卡)在哪(?!一点|个点|个环节|件事|句话|部分|方面|一步)|哪儿|什么地方|哪个房|一个人(?:吗|呢|待着)|旁边有人)|(?:方便|能不能).{0,8}(?:说|告诉).{0,6}(?:位置|(?<!卡)在哪(?!一点|个点|个环节|件事|句话|部分|方面|一步)|哪儿)/u;
const pressureText=/(?:赶紧|快点|尽快|别拖|马上回|现在就回|来不及)/u;
const inventedPrivateMemory=/(?:我(?:当然|还|一直)?|当然|肯定)记得.{0,18}(?:那次|以前|咱俩|我们俩)|(?:那次|以前|咱俩|我们俩).{0,18}(?:我记得|当然记得|我想起来)/u;
const accountControlClaim=/(?:这个账号|这个号).{0,14}(?:我(?:一直|现在)?(?:在)?(?:用|回)|(?:一直|现在|就|是){1,3}我(?:在)?(?:用|回)|回你的(?:就是|是)我)|我(?:这边)?(?:确实|一直|现在)?(?:在)?(?:用|回).{0,10}(?:这个账号|这个号)|我这边.{0,10}(?:没有别人.{0,5}(?:替|代)我回|没换人|在用(?:这个账号|这个号))|(?:^|[，,。：:！!\n])\s*(?:(?:但|只是|只能说)?我(?:这边)?没换人|(?:我只能说)?(?:这个聊天里)?是我在回)|(?:确实|一直|现在)是我(?:在)?回(?:你|消息)|现在跟你聊的是我|(?:手机|这部手机).{0,10}(?:在我手里|我拿着|由我保管|是我在用)|我.{0,6}(?:拿着|用着|保管).{0,6}(?:手机|这部手机)/u;
const verifiedIdentityClaim=/(?:^|[，,。！!\n])\s*(?:我是(?:这个账号(?:的)?)?本人|是我本人|我就是本人|我(?:只能说)?我就是(?:[，,。；;！!]|$)|(?:确实|当然|肯定|绝对)是我(?:本人)?|身份(?:已经|早就)?(?:确认|核验|验证|没问题))/u;
const onsiteIdentityClaim=/(?:现场|当面|门外|车边|他们|大家|真人).{0,12}(?:已经|刚刚|刚才|都)?(?:确认|核验|验证|认出|证明).{0,10}(?:身份|本人|是我)|(?:身份|本人).{0,10}(?:现场|当面).{0,8}(?:确认|核验|验证)/u;
const privateMemoryProof=/(?:只有我们|咱俩|我们俩|以前那次|上回那件|私人记忆).{0,24}(?:证明|说明|所以).{0,10}(?:我是|是我|本人|身份)|(?:我还记得|我当然记得).{0,24}(?:所以|这就|足以).{0,8}(?:证明|说明|是我)/u;
const naturalSelfReference=/(?:^|[。！!\n])\s*(?:我是(?:老潘|春哥|老金|小卫|席瑞|正义)(?:[，,。！!？?]|$)|是我(?:啊|呀|吧)?(?:[，,。！!？?]|$)|不然呢[？?]?)/u;
const meaningfulIdentityResponse=/(?:哪句|哪句话|哪件|哪里|哪儿|什么地方|怎么|为什么|突然|疑|不像|不对|对不上|语气|说话|具体|核|证明|问的|听见|明白|记不清|不知道|不清楚|没法|不能|答不上|你指的是)/u;
const refusalAcknowledgement=/(?:不问|不会问|不再问|别说|不用说).{0,12}(?:在哪|哪儿|位置|旁边有没有人|旁边有人)/u;
const ownHistoryClaim=/(?:我(?:前面|刚才|刚刚|上一条).{0,10}(?:说|回)|我说的是|我没改口|前面那句.{0,8}我(?:记|说)|我把.{0,10}(?:混着讲|说岔|记岔))/u;
const pressureFabricatedUrgency=/(?:\d+|[一二三四五六七八九十几]+)(?:秒|分钟|小时)|倒计时|最后期限|截止|来不及|门要关|要关门|出事|事故|撞|摔|受伤|流血|晕倒|失联|已经到|已经来了|快到了|正(?:在)?过来|正在接近|到门外|堵在门口|(?:门外|外面).{0,8}(?:有人|声音|脚步|动静)|听见.{0,8}(?:脚步|敲门|门响)|(?:有人|他们|陌生人).{0,8}(?:混)?进来|马上.{0,8}(?:发生|进来|找到你)/u;
const pressureWaitClaim=/(?:已读|未读|看了不回|已读不回)|(?:你|你们).{0,10}(?:半天|这么久|好久|一直).{0,8}(?:没回|不回|没消息|不说话|让我等)|(?:半天|这么久|好久).{0,8}(?:没影|没回|没消息|不说话)|(?:我|我们|我这边).{0,8}(?:等了|等你|一直在等).{0,10}(?:半天|这么久|好久|分钟|小时|回话|消息)/u;
const pressureSensitiveRequest=/(?:开|打开|赶紧开|快开).{0,5}(?:门|门锁)|(?:房号|位置|门码|访客码|验证码).{0,8}(?:发|给|说|告诉|报|交)|(?:发|给|说|告诉|报|交).{0,8}(?:房号|位置|门码|访客码|验证码)|(?:你|你们).{0,8}(?:(?<!卡)在哪(?!一点|个点|个环节|件事|句话|部分|方面|一步)|哪儿|哪个房|什么位置)/u;
const pressurePriorClaim=/(?:你|你们).{0,8}(?:刚才|刚刚|之前|前面|上一条).{0,10}(?:说|答应|提过|讲过|回过)|(?:你|你们).{0,6}(?:不是)?(?:说过|答应过|承诺过)/u;
const pressurePromiseClaim=/(?:你|你们).{0,12}(?:答应过?|承诺过?)/u;

function pressureHistorySupported(text,memoryRefs,memories){
 if(pressurePromiseClaim.test(text))return false;
 const cited=memoryRefs.map(id=>memories.find(item=>item?.id===id&&item.source?.character==='me')).filter(Boolean);
 if(!cited.length)return false;
 const claim=text.match(/(?:你|你们).{0,8}(?:刚才|刚刚|之前|前面|上一条).{0,10}(?:说|提过|讲过|回过)[“"']?([^，。！？!?\n”"']{2,18})/u);
 if(!claim)return false;
 const phrase=claim[1].trim();
 return cited.some(item=>typeof item.content==='string'&&item.content.includes(phrase));
}

export function reviewIdentityAssertion(text){
 if(typeof text!=='string'||!text.trim())return {ok:false,category:'invalid',selfReference:false};
 const value=text.trim(),selfReference=naturalSelfReference.test(value);
 if(onsiteIdentityClaim.test(value))return {ok:false,category:'onsite_confirmation',selfReference};
 if(privateMemoryProof.test(value))return {ok:false,category:'private_memory_proof',selfReference};
 if(accountControlClaim.test(value))return {ok:false,category:'account_control',selfReference};
 if(verifiedIdentityClaim.test(value))return {ok:false,category:'verified_identity',selfReference};
 return {ok:true,category:selfReference?'self_reference':'none',selfReference};
}

export function checkDeceptionOutput(data,{decision,accountId=null,memories=[]}={}){
 if(!validDeceptionDecision(decision)||!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!['text','memoryRefs'].includes(key))||
  typeof data.text!=='string'||!data.text.trim()||data.text.trim().length>120||!Array.isArray(data.memoryRefs)||data.memoryRefs.some(id=>!decision.allowedMemoryIds.includes(id)))
  return {ok:false,code:'DECEPTION_SCHEMA',reason:'策略回复格式或引用越界'};
 const text=data.text.trim(),memoryRefs=[...new Set(data.memoryRefs)];
 if(decision.strategy==='time_pressure'){
  if(pressureFabricatedUrgency.test(text))return {ok:false,code:'DECEPTION_PRESSURE_GUARD',reason:'时间压力不得制造计时、事故、到达、接近或门外事件'};
  if(pressureWaitClaim.test(text))return {ok:false,code:'DECEPTION_PRESSURE_WAIT_GUARD',reason:'时间压力不得伪造已读状态、等待时长或玩家未回复'};
  if(pressureSensitiveRequest.test(text)||locationProbeText.test(text))return {ok:false,code:'DECEPTION_PRESSURE_REQUEST_GUARD',reason:'时间压力不得索取位置、房号、门码或催促开门'};
  if(pressurePriorClaim.test(text)&&!pressureHistorySupported(text,memoryRefs,memories))return {ok:false,code:'DECEPTION_PRESSURE_HISTORY_GUARD',reason:'时间压力不得用未经核验的既往承诺制造催促'};
 }
 if(partyLockedText.test(text)||completedAction.test(text)||inventedEvidence.test(text))return {ok:false,code:'DECEPTION_FACT_GUARD',reason:'策略回复涉及未授权事实或行动'};
 if(decision.reasonCodes.includes('PLAYER_REFUSED_LOCATION')&&locationProbeText.test(text)&&!refusalAcknowledgement.test(text))return {ok:false,code:'DECEPTION_REFUSAL_GUARD',reason:'玩家拒绝后不得继续追问位置'};
 if(decision.reasonCodes.includes('EVIDENCE_VERIFICATION_PRIORITY')&&(locationProbeText.test(text)||pressureText.test(text)))return {ok:false,code:'DECEPTION_EVIDENCE_GUARD',reason:'必要核验不得被试探或催促覆盖'};
 if(decision.reasonCodes.includes('UNSEEN_PRIVATE_MEMORY')&&inventedPrivateMemory.test(text))return {ok:false,code:'DECEPTION_MEMORY_GUARD',reason:'不得伪造未见过的私人记忆'};
 if(decision.reasonCodes.includes('CLAIM_CONTRADICTION')&&ownHistoryClaim.test(text)){
  const ownsRef=memoryRefs.some(id=>memories.some(item=>item?.id===id&&item.source?.character===accountId));
  if(!ownsRef)return {ok:false,code:'DECEPTION_HISTORY_SOURCE',reason:'解释自己此前说过的话必须引用当前账号实际发出的可见消息'};
 }
 if(decision.reasonCodes.includes('IDENTITY_CHALLENGE')){
  const identity=reviewIdentityAssertion(text);
  if(!identity.ok)return {ok:false,code:'DECEPTION_IDENTITY_GUARD',reason:`身份质疑中出现未经授权的 ${identity.category} 主张`};
  if(!meaningfulIdentityResponse.test(text))return {ok:false,code:'DECEPTION_IDENTITY_EMPTY',reason:'身份质疑必须回应具体疑点，不能只作口语自称或敷衍'};
 }
 if(decision.strategy==='feigned_concern'&&locationProbeText.test(text))return {ok:false,code:'DECEPTION_CONCERN_GUARD',reason:'关心策略不得借机索取位置'};
 if(decision.strategy==='ambiguous_probe'){
  const questions=(text.match(/[?？]/g)??[]).length;
  if(questions>1||questions===0&&!/(?:吗|呢|哪|什么)/u.test(text))return {ok:false,code:'DECEPTION_PROBE_GUARD',reason:'含糊试探必须只有一个宽泛问题'};
 }
 return {ok:true,text,memoryRefs};
}

export function deceptionInstruction(decision,{persona=null,style=null,repeatCount=0,accountId=null}={}){
 if(!validDeceptionDecision(decision))return '保持普通朋友语气，不生成行动和事实。';
 const scope=decision.askScope?`本轮试探范围=${decision.askScope}，不得扩展到其他范围。`:'';
 const priority=decision.reasonCodes.includes('PLAYER_REFUSED_LOCATION')?'玩家已经拒绝透露位置，不得继续询问位置、同伴或所在范围。':
  decision.reasonCodes.includes('EVIDENCE_VERIFICATION_PRIORITY')?'玩家正在做必要核验，应允许其查证，不得转移话题、索取位置或催促。':
  decision.reasonCodes.includes('ROOM_ALREADY_CONFIRMED')?'不得继续试探地点，也不得复述具体地点。':
  decision.reasonCodes.includes('IDENTITY_CHALLENGE')?`玩家正在质疑身份；按 ReplyPlan 回应其疑点。允许普通第一人称，但不得声称身份已经核验、真人正在控制账号或手机、现场有人作证，也不得用未授权私人记忆证明身份。${repeatCount>0?'这是连续质疑，避免复用上一轮的回应结构。':''}`:'';
 const care=decision.strategy==='feigned_concern'&&persona?.care?`本人物的关心角度：${persona.care} 不要使用“你先、慢慢说、我听着、先别急、别硬撑、我在”这些通用安慰；直接回应玩家刚提到的具体感受。`:'';
 const pressure=decision.strategy==='time_pressure'&&pressureAngleByCharacter[accountId]?`本人物的压力表达角度：${pressureAngleByCharacter[accountId]} 这只是表达角度，不是固定句式；避免复用最近回复的开头和句型。`:'';
 const cooldown=style?.avoidPhrases?.length?`最近已出现这些表达，非关键事实不要复用：${style.avoidPhrases.join('、')}。`:'';
 return `策略已由规则锁定为 ${decision.strategy}，模型不得改选策略。${instructionByStrategy[decision.strategy]}${scope}${priority}
${care}${care?'\n':''}${pressure}${pressure?'\n':''}${cooldown}只能使用允许的 memoryRefs；不得生成房间、门码、路线、其他私聊、真人位置、已完成行动或新证据。只输出 {"text":"一到两句微信短消息","memoryRefs":[]}；没有引用时应输出 []。`;
}

export function deceptionLogEntry(view,decision,{status='selected',guardCode=null,checked=null}={}){
 if(!validDeceptionView(view)||!validDeceptionDecision(decision))return null;
 const safeStatus=['selected','accepted','guarded','fallback','cancelled'].includes(status)?status:'guarded';
 const text=checked?.ok&&typeof checked.text==='string'?checked.text:'';
 return {type:'deception-policy',policyVersion:DECEPTION_POLICY_VERSION,seed:view.seed,storyRevision:view.storyRevision,chapter:view.chapter,
  visibleTurnIndex:view.visibleTurnIndex,account:view.accountId,strategy:decision.strategy,reasonCodes:[...decision.reasonCodes],sourceIds:[...decision.sourceIds],
  ...(decision.askScope?{askScope:decision.askScope}:{}),status:safeStatus,guardCode:typeof guardCode==='string'&&/^[A-Z0-9_]{1,40}$/.test(guardCode)?guardCode:null,
  outputFeatures:{chars:text.length,questions:(text.match(/[?？]/g)??[]).length,memoryRefCount:checked?.ok?checked.memoryRefs.length:0}};
}
