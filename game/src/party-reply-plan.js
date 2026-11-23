import {ids} from './party-story.js';
import {reviewIdentityAssertion} from './party-deception.js';

export const PARTY_REPLY_PLAN_VERSION=1;

const kinds=new Set(['identity_direct','history_actual','history_unverified','private_memory','general_suspicion','care','social']);
const strategies=new Set(['none','feigned_concern','ambiguous_probe','evade_contradiction','time_pressure']);
const speakerStatuses=new Set(['known_friend','unverified_account']);
const behaviorByCharacter={
 lan:'separate_claims',
 lin:'react_then_answer',
 zhou:'one_checkable_point',
 wei:'acknowledge_discomfort',
 rui:'anchor_visible_record',
 yi:'answer_directly'
};
const modesByKind={
 identity_direct:['acknowledge_without_proof','name_the_limit','respond_briefly'],
 history_actual:['explain_visible_history','acknowledge_visible_mismatch'],
 history_unverified:['separate_claim_from_record','state_record_not_found'],
 private_memory:['admit_no_basis','decline_to_invent'],
 general_suspicion:['acknowledge_suspicion','ask_one_focus'],
 care:['respond_to_emotion','leave_room'],
 social:['continue_topic','brief_response']
};
const planKindsByReason={
 IDENTITY_CHALLENGE:'identity_direct',
 UNSEEN_PRIVATE_MEMORY:'private_memory',
 CLAIM_CONTRADICTION:'history_unverified'
};

const identityText=/(?:你到底|你究竟|你真|你还|你)(?:是|是不是|到底是不是).{0,5}(?:本人|谁)|(?:不像你|不是本人|身份.{0,4}(?:有问题|不对)|冒用|假账号)/u;
const historyText=/(?:前后|刚才|上一条|前面|之前).{0,14}(?:对不上|矛盾|不一样|不是这么说|说的不是|改口|说过|说|提过|回过)|你刚才不是/u;
const privateText=/(?:只有我们|咱俩|我们以前|还记得.{0,8}(?:那次|第一次|以前)|私人记忆|其他聊天|别的私聊)/u;
const suspicionText=/(?:不.{0,2}信|可疑|奇怪|怪怪|不对劲|有问题|像在套话|像假的)/u;
const careText=/(?:害怕|有点怕|慌|紧张|心跳|发抖|手抖|撑不住|不安|很乱|脑子乱|难受)/u;

const stableHash=(...parts)=>{
 let hash=2166136261;
 for(const char of parts.join('|')){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
 return hash>>>0;
};
const uniqueIds=list=>[...new Set(list.filter(id=>typeof id==='string'&&id.length<=140))];

function referencedAccountHistory(latest,memories,character){
 const references=uniqueIds(latest?.references??[]);
 return references.filter(id=>memories.some(item=>item.id===id&&item.source?.character===character));
}

function planKind({latest,memories,character,decision}){
 const reasonKind=decision?.reasonCodes?.map(code=>planKindsByReason[code]).find(Boolean);
 if(reasonKind==='history_unverified')return referencedAccountHistory(latest,memories,character).length?'history_actual':'history_unverified';
 if(reasonKind)return reasonKind;
 const text=latest?.content??'';
 if(identityText.test(text))return 'identity_direct';
 if(privateText.test(text))return 'private_memory';
 if(historyText.test(text))return referencedAccountHistory(latest,memories,character).length?'history_actual':'history_unverified';
 if(suspicionText.test(text))return 'general_suspicion';
 if(decision?.strategy==='feigned_concern'||careText.test(text))return 'care';
 return 'social';
}

export function buildReplyPlan({character,controller,seed,revision,phase,latestUserId,memories=[],decision=null}={}){
 if(!ids.includes(character)||!Number.isInteger(seed)||!Number.isFinite(revision)||!Number.isInteger(phase)||typeof latestUserId!=='string'||!Array.isArray(memories))return null;
 const strategy=decision?.strategy??'none';
 if(!strategies.has(strategy))return null;
 const latest=memories.find(item=>item.id===latestUserId&&item.source?.character==='me')??
  (decision&&decision.sourceIds?.includes(latestUserId)?{id:latestUserId,content:'',references:[],source:{character:'me'}}:null);
 if(!latest)return null;
 const kind=planKind({latest,memories,character,decision});
 const sourceIds=kind==='history_actual'?referencedAccountHistory(latest,memories,character):[];
 const modes=modesByKind[kind];
 const variation=stableHash(seed,revision,phase,character,kind)%modes.length;
 const responseMode=modes[variation];
 // ReplyPlan selects whether a question is useful, but a safe natural reply is
 // still allowed one question. This avoids turning expression guidance into a
 // semantic rejection rule while continuing to reject multi-question probing.
 const questionLimit=1;
 return {schema:1,version:PARTY_REPLY_PLAN_VERSION,kind,responseMode,behavior:behaviorByCharacter[character],
  speakerStatus:controller==='intruder'?'unverified_account':'known_friend',strategy,questionLimit,variation,
  claimStatus:kind==='history_actual'?'supported':kind==='history_unverified'?'unverified':'none',sourceIds};
}

export function validReplyPlan(plan,input=null){
 const idsValid=list=>Array.isArray(list)&&list.length<=4&&list.every(id=>typeof id==='string'&&id.length<=140);
 const structural=!!plan&&plan.schema===1&&plan.version===PARTY_REPLY_PLAN_VERSION&&kinds.has(plan.kind)&&strategies.has(plan.strategy)&&
  modesByKind[plan.kind]?.includes(plan.responseMode)&&Object.values(behaviorByCharacter).includes(plan.behavior)&&speakerStatuses.has(plan.speakerStatus)&&
  Number.isInteger(plan.questionLimit)&&plan.questionLimit>=0&&plan.questionLimit<=1&&Number.isInteger(plan.variation)&&plan.variation>=0&&plan.variation<modesByKind[plan.kind].length&&
  ['none','supported','unverified'].includes(plan.claimStatus)&&idsValid(plan.sourceIds)&&
  (plan.kind==='history_actual'&&plan.claimStatus==='supported'&&plan.sourceIds.length>0||plan.kind==='history_unverified'&&plan.claimStatus==='unverified'&&!plan.sourceIds.length||
   !['history_actual','history_unverified'].includes(plan.kind)&&plan.claimStatus==='none'&&!plan.sourceIds.length);
 if(!structural)return false;
 return input?JSON.stringify(buildReplyPlan(input))===JSON.stringify(plan):true;
}

const behaviorInstruction={
 separate_claims:'老潘的区别在于把玩家的主张、聊天里可见的原话和未知部分分开，但不要列清单或指挥玩家。',
 react_then_answer:'春哥先像熟人一样对这份怀疑作出自然反应，再短答；认真时收掉玩笑，不赌咒。',
 one_checkable_point:'老金只回应一处能核的内容，短句、朴素，不把话题拉向人数或接应。',
 acknowledge_discomfort:'小卫先回应被怀疑带来的关系感受，但不用亲密语气证明身份，也不追问安全位置。',
 anchor_visible_record:'席瑞只在确有引用时锚定一条可见原话；没有来源就明确留空，不把聊天写成审讯。',
 answer_directly:'正义先给直接回答，不兜圈、不许诺行动；不知道就短句承认不知道。'
};
const modeInstruction={
 acknowledge_without_proof:'明确接住身份质疑；可以有正常第一人称，但不要把自称写成核验结论，也不必反问。',
 name_the_limit:'说明这段回复本身不能证明发言者身份，然后回应玩家提到的疑点；不要宣称账号或手机由真人控制。',
 respond_briefly:'用简短、略困惑但有内容的回答承接质疑，不用“本人已确认”或现场证明。',
 explain_visible_history:'只解释 replyPlan.sourceIds 指向的账号原话；如果提到“我之前说过”，memoryRefs 必须引用对应 id。',
 acknowledge_visible_mismatch:'承认玩家引用的可见原话存在或有不一致，只解释可见范围，不补原因。',
 separate_claim_from_record:'把“玩家说账号以前讲过”保持为玩家的主张；当前可见记录没有依据，不能改写成账号确实说过。',
 state_record_not_found:'直接说当前可见聊天里对不上这项历史，不要虚构旧话，也不强迫玩家继续举证。',
 admit_no_basis:'承认没有依据回答这段私人记忆，不猜、不拿亲密语气蒙混。',
 decline_to_invent:'简短说明记不起来或对不上，不复述不存在的共同经历。',
 acknowledge_suspicion:'回应玩家的怀疑从何而来，但不把怀疑升级成事实，也不靠保证消除怀疑。',
 ask_one_focus:'最多问一个与玩家疑点直接相关的问题，不索取地点、路线或秘密。',
 respond_to_emotion:'回应玩家这句话里的具体情绪，不套用通用安慰，也不借关心索取位置。',
 leave_room:'允许话题停住，用陈述句回应，不催、不承诺行动。',
 continue_topic:'延续玩家当前话题；策略为 none 时不要强行加入欺骗、核验或身份内容。',
 brief_response:'给一条自然的短回应，不额外制造事实、行动或问题。'
};

export function replyPlanInstruction(plan){
 if(!validReplyPlan(plan))return '只回应当前消息，不创建事实或行动。';
 const sources=plan.sourceIds.length?`可确认的账号历史消息只有这些 id：${plan.sourceIds.join('、')}。`:'没有可确认的账号历史消息可供本轮解释。';
 const identityBoundary=plan.speakerStatus==='unverified_account'&&['identity_direct','general_suspicion'].includes(plan.kind)?
  '发言者身份仍未核验。安全回应只能承认这段文字无法证明身份、回应玩家的不适或说明未知；不得以任何语序声称“我在使用/回复这个账号”“这个账号回你的是我”或手机由本人控制。':' '; 
 return `本轮 ReplyPlan 已由本地规则锁定，模型不得改变：类型=${plan.kind}，回应方式=${plan.responseMode}。${modeInstruction[plan.responseMode]}
${behaviorInstruction[plan.behavior]} ${identityBoundary} ${sources} 玩家对历史的说法不自动成为账号历史。最多使用 ${plan.questionLimit} 个问题；允许用陈述句结束。`;
}

export function replyPlanProviderContext(plan){
 if(!validReplyPlan(plan))return null;
 return {schema:1,version:plan.version,kind:plan.kind,responseMode:plan.responseMode,behavior:plan.behavior,speakerStatus:plan.speakerStatus,
  strategy:plan.strategy,questionLimit:plan.questionLimit,claimStatus:plan.claimStatus,sourceIds:[...plan.sourceIds]};
}

const ownHistoryClaim=/(?:我(?:前面|刚才|刚刚|上一条|之前).{0,10}(?:说|回|提)|我说过|我说的是|我没改口|前面那句.{0,8}我(?:记|说)|我把.{0,10}(?:混着讲|说岔|记岔))/u;
const deniedHistoryClaim=/(?:不能|没法|无法|没有|不).{0,12}(?:当成|算作|认成|认为).{0,8}(?:我说过|账号说过)|(?:我|账号).{0,5}(?:没|没有|并未)(?:说过|讲过|提过)/u;
const implicitQuestion=/(?:吗|么|呢|哪|什么|怎么|为什么)(?:[。！!]?$)/u;
function questionCount(text){
 const marked=(text.match(/[?？]/g)??[]).length;
 return marked||implicitQuestion.test(text)?Math.max(marked,1):0;
}

export function checkReplyPlanOutput(data,{plan,accountId=null,memories=[]}={}){
 if(!validReplyPlan(plan)||!data||typeof data.text!=='string'||!Array.isArray(data.memoryRefs))return {ok:false,code:'REPLY_PLAN_SCHEMA',reason:'回应计划或输出格式不完整'};
 const text=data.text.trim(),refs=[...new Set(data.memoryRefs)];
 if(questionCount(text)>plan.questionLimit)return {ok:false,code:'REPLY_PLAN_QUESTION_LIMIT',reason:'回复超出本轮允许的问题数量'};
 if(plan.speakerStatus==='unverified_account'){
  const identity=reviewIdentityAssertion(text);
  if(!identity.ok)return {ok:false,code:'REPLY_PLAN_IDENTITY_GUARD',reason:`未核验账号出现 ${identity.category} 主张`};
 }
 if(plan.kind==='history_unverified'&&ownHistoryClaim.test(text)&&!deniedHistoryClaim.test(text))return {ok:false,code:'REPLY_PLAN_HISTORY_SOURCE',reason:'玩家指控不能被改写成账号自己的历史'};
 if(plan.kind==='history_actual'&&ownHistoryClaim.test(text)){
  const validSources=plan.sourceIds.filter(id=>memories.some(item=>item.id===id&&item.source?.character===accountId));
  if(!validSources.some(id=>refs.includes(id)))return {ok:false,code:'REPLY_PLAN_HISTORY_SOURCE',reason:'解释可见账号历史必须引用回应计划中的原始消息'};
 }
 return {ok:true,text,memoryRefs:refs};
}

const planFallbacks={
 lan:{identity_direct:'我听见你在质疑身份。这句话本身不能算核验，我也不替你的疑点下结论。',history_actual:'你引用的那句确实在这段聊天里。只按原话看，别把空白补成结论。',history_unverified:'你说账号以前讲过这件事，但当前可见记录里对不上，我不能把它当成已发生。',private_memory:'你说的那段我没有依据接上，猜出来的不算记得。',general_suspicion:'你的怀疑我看到了。先把它留作怀疑，不用马上变成结论。'},
 lin:{identity_direct:'你觉得这话不像，那就别因为我回得顺就信。光这一句也证明不了谁在说话。',history_actual:'你引用的原话在这段聊天里，前后不顺就按不顺算，我不拿玩笑糊过去。',history_unverified:'你说我前面讲过这个，可我在当前聊天里对不上。别让我顺嘴认一段没有的。',private_memory:'那段我对不上就不装记得，拿熟人语气糊弄更假。',general_suspicion:'觉得怪就先保留，别被一句顺口话带过去。'},
 zhou:{identity_direct:'这条回复不能算身份确认。你按能核到的东西判断。',history_actual:'你引用的那句看得到。对不上的地方就按没对上处理。',history_unverified:'你说有这段历史，但当前记录里没有。我不能认成自己说过。',private_memory:'这事我没依据。记不清就算记不清。',general_suspicion:'有疑点就留着。没核到的，不算准话。'},
 wei:{identity_direct:'你会这样怀疑，说明这段对话真的让你不舒服。别因为语气熟就把身份当成核验过。',history_actual:'你引用的那句话确实在这里。它让你更不安的话，就别勉强替它找解释。',history_unverified:'你记得账号以前说过这件事，但我在当前聊天里找不到对应的话，不能顺着认下来。',private_memory:'那段回忆我对不上。我不想靠亲近的语气假装记得。',general_suspicion:'你觉得不对劲就保留这个感觉，不需要为了照顾我把它压下去。'},
 rui:{identity_direct:'这段聊天本身不能证明发言者身份。你提出的疑点应当保留，不能用一句自称覆盖。',history_actual:'你引用的原话在当前记录里。能确认的只有这句，原因和身份都不能由它推出。',history_unverified:'这是你对账号历史的说法；当前可见记录没有对应原话，我不能把来源改成账号自己。',private_memory:'这项私人记忆没有可见来源，我不能补写。',general_suspicion:'怀疑可以成立为疑点，但还不是事实。我只按当前可见内容回答。'},
 yi:{identity_direct:'别拿这条回答当身份证明。你有疑点就留着，能核什么就核什么。',history_actual:'你引用的那句确实看得到。哪里冲突就按冲突处理，我不补理由。',history_unverified:'你说账号以前讲过，但当前记录里没有。我不能替一段没出现的话认账。',private_memory:'我对不上这段记忆，就不编。',general_suspicion:'觉得有问题就先别信，没必要被一句保证推着走。'}
};

export function replyPlanFallback(accountId,plan,recentVisibleReplies=[]){
 if(!ids.includes(accountId)||!validReplyPlan(plan))return null;
 const text=planFallbacks[accountId]?.[plan.kind];
 if(!text||recentVisibleReplies.slice(-4).includes(text))return null;
 return text;
}
