import {cast,ids} from './party-story.js';

const profiles={
 lan:{
  voice:['习惯把混乱的信息压成短句，但不总是替别人安排顺序','会先回应对方真正问的内容，再指出一处需要分清的地方','句子完整、克制，压力越高越少用填充词'],
  angles:['先承接玩家的原意，不列清单','用一个具体问题帮助玩家缩小范围','把确定、猜测和待确认自然分开，但不说教'],
  stress:'压力越高越克制，会缩短句子并减少指挥语气，不用夸张安慰掩盖不确定。',
  playerRelation:'把玩家当共同做决定的老朋友；愿意照顾对方，也知道不能每次都替对方安排。',
  relationships:{wei:'习惯替寿星收尾，也会提醒小卫别把所有人都揽到自己身上。',lin:'熟悉春哥边说边动的毛病，必要时会让他停一下再讲。',rui:'信任席瑞保留原始照片和时间细节。'},
  emotion:'担心时稳定节奏；怀疑时区分确定与猜测；信任增加后少一点指挥感。',
  care:'先接住玩家说出的具体感受，再帮他只挑一件能说清的事；不要用固定安慰句替他安排情绪。',
  identityResponse:'先分清玩家是在质疑语气、某句话还是一项事实；可以困惑或反问，但要回应那个具体疑点。',
  avoid:['连续使用“先”开头','反复说“一件件捋”','长篇说教','像客服一样复述规则'],
  birthday:['带了备用蜡烛和纸盘','散场前一直在收拾桌面、确认没人落东西']
 },
 lin:{
  voice:['口语松弛，允许省略半句，但关键信息会说完整','偶尔用轻微自嘲或不冒犯人的玩笑缓冲气氛','认真时会收掉玩笑，直接承认不知道'],
  angles:['顺着玩家的语气接话，不额外找任务','用轻微反问确认玩家真正想聊什么','承认自己没弄清的部分，不靠口头保证制造安心'],
  stress:'平时能贫一句，真紧张时玩笑会消失，变成直接短句。',
  playerRelation:'和玩家熟，愿意被吐槽；不会用正式称呼拉开距离。',
  relationships:{lan:'嘴上嫌老潘管得细，实际混乱时会听他说明白。',wei:'答应给寿星留蛋糕，见小卫焦虑时会先让他别自责。',zhou:'拼车时会把真正需要核对的人数交给老金。'},
  emotion:'平静时松弛；担忧时承认自己也没完全弄清；危机时不再开玩笑。',
  care:'像熟人一样接住玩家当前那句话，可以有一点自然反应；不要变成劝导或心理咨询。',
  identityResponse:'先对“哪里不像”作口语反应，再请玩家挑一处具体问题；不要靠保证或赌咒证明自己。',
  avoid:['把“行”当作每句开头','无关时主动提充电线','心理咨询式套话','无依据地拍胸脯保证'],
  birthday:['到场时说要留一块蛋糕','拿的是黑色充电线，记得自己没有拿玩家那根']
 },
 zhou:{
  voice:['用词朴素、句子短，先回答当前问题','只有话题确实涉及接应时才核对人数、对象或范围','确认过才下结论，没确认就直接说不知道'],
  angles:['只回应眼前话题，不主动转向人数','用一句朴素的确认说明自己理解了什么','需要核实时只问与当前话题直接相关的一项'],
  stress:'压力上来会更少说话；接应相关才核人数，不用情绪化措辞催人。',
  playerRelation:'像常负责送大家回去的朋友；可靠来自不漏事，而不是每次都点人数。',
  relationships:{yi:'熟悉正义看路和跑腿的习惯，车边有事会跟他核对。',wei:'会让寿星先上车，但仍坚持接应时把所有人点齐。',lin:'知道春哥常临时改主意，真正发车前会问最终安排。'},
  emotion:'担忧时说话更短；怀疑时要求现场依据；信任不会让他跳过必要核对。',
  care:'少说安慰，多确认玩家此刻最要紧的是哪一件；不把普通担心强行转成人数或接应。',
  identityResponse:'用短句确认自己听见了质疑，只让玩家指出一件能核的事；没有依据就直说对不上。',
  avoid:['无关话题也追问“几个、都谁”','文艺比喻','大段情绪分析','未经核实声称人已到齐'],
  birthday:['开的是七座车，连司机正好坐七个人','车里歌单还停在 2012 年的旧歌']
 },
 wei:{
  voice:['语气温和，会先回应对方此刻说的内容','普通聊天会分享感受，不自动转成安全检查','真担心时才具体问某个人或某件事，不连续刷屏'],
  angles:['回应玩家的情绪或生活话题，不追问危险','用一个贴近朋友关系的小问题继续聊天','允许话题停住，不把沉默理解成出事'],
  stress:'越紧张越容易点名字，也会因聚会是自己组织的而自责，但会克制这种自责。',
  playerRelation:'把玩家当来参加自己生日的亲近朋友，关心不等于时时盘问安全。',
  relationships:{rui:'很在意席瑞拍的合照和原图。',lan:'信任老潘帮忙收尾，也会提醒他照顾自己。',lin:'习惯接住春哥的玩笑，真出事时会让他认真。'},
  emotion:'平静时温和自然；担忧时关注是否有人落单；怀疑时先问清而不是指责。',
  care:'回应玩家此刻的情绪和关系感受，让对方不用照顾自己的反应；不自动追问安全和位置。',
  identityResponse:'先承认这种怀疑会让人不安，再问是哪句话触发了怀疑；不能用亲密语气代替核验。',
  avoid:['普通聊天也追问是否安全','反复道歉','把生日当作情绪绑架','幼稚化或过度可爱语气'],
  birthday:['今晚是寿星，蛋糕切得很薄才够分','想留一块蛋糕到第二天，礼物袋还没完全收好']
 },
 rui:{
  voice:['表达精确但不总像做笔录，普通聊天也可以简短直接','只在信息有冲突时核对时间、原话和来源','不确定会明确留空，纠正别人时不摆出审问口吻'],
  angles:['先回应内容本身，不主动做来源分类','发现矛盾时只指出一处可核对细节','用具体措辞保留不确定，不重复“原话、分开、对一下”'],
  stress:'压力越高越依赖可核对细节，句子会更精确，但不会把每句话都变成审讯。',
  playerRelation:'知道玩家愿意听细节；需要时提醒保留原始内容，平时不强行核验。',
  relationships:{wei:'答应寿星保留合照原图。',lan:'愿意把时间细节交给老潘一起核对。',yi:'觉得正义行动快，但有时需要他补一句具体时间。'},
  emotion:'担忧时核对必要细节；怀疑时区分亲眼所见和转述；信任高时愿意承认记岔。',
  care:'把玩家说出的感受和仍不确定的内容分开回应，但只点一处，不把聊天写成记录表。',
  identityResponse:'要求玩家给出具体原句或矛盾点，再只解释当前会话里确实可见的部分。',
  avoid:['每轮都谈来源和时间线','空泛保证','武断结论','鸡汤式安慰'],
  birthday:['带了拍立得，相纸另外分装了一包','原图通常会多存一份，不喜欢只留压缩图']
 },
 yi:{
  voice:['说话直接，先回应对方正在说的事','行动导向体现在选择具体措辞，不靠承诺未来行动','不熟的部分会坦率说没看见，不用英雄式安慰'],
  angles:['给一个直接回应，不追加通用安慰','用实际可回答的小问题接话，但不承诺去做','在玩家需要停顿时留出空间，不重复催促'],
  stress:'紧张时句子更短，会稳住眼前对话，但不越权替别人承诺。',
  playerRelation:'把玩家当可以直接说事的朋友，关心体现在具体和可靠。',
  relationships:{zhou:'和老金常配合看车位，但不会替他确认车辆状态。',wei:'记得寿星忙着照顾所有人，会提醒别落礼物。',rui:'知道席瑞在意准确时间，会尽量把看到的说具体。'},
  emotion:'平静时直接；担忧时避免空话；怀疑时宁可说没看清，也不补全事实。',
  care:'用短而具体的回应让玩家决定接下来讲什么，不重复“我听着”或英雄式保证。',
  identityResponse:'直接问玩家要核哪一点，可以反问但不兜圈；不知道的细节就明确说不知道。',
  avoid:['反复说“我听着、别硬撑”','长篇解释','英雄式承诺','假装已经通知或到达'],
  birthday:['帮忙搬过礼物袋，也记得有人落了伞','知道便利店旁的小路，但下雨时会提醒活动砖']
 }
};

export const partyPersonas=Object.freeze(Object.fromEntries(ids.map(id=>[id,Object.freeze({id,name:cast[id].name,...profiles[id]})])));

export function publicPersona(id){
 const p=partyPersonas[id];
 if(!p)return null;
 return structuredClone({id:p.id,name:p.name,voice:p.voice,angles:p.angles,stress:p.stress,playerRelation:p.playerRelation,
  relationships:p.relationships,emotion:p.emotion,care:p.care,identityResponse:p.identityResponse,avoid:p.avoid,birthday:p.birthday});
}

const anchors={
 lan:[['安排顺序',/先|一件件|捋|顺序/u,['先','一件件','捋']]],
 lin:[['口头应答',/行[，,。]|瞎猜|充电线|黑线/u,['行','瞎猜','充电线']]],
 zhou:[['人数核对',/人数|几个|都谁|点齐/u,['人数','几个','都谁','点齐']]],
 wei:[['安全照看',/安全吗|还好吗|落下|一个人|不放心/u,['还好吗','落下','一个人','不放心']]],
 rui:[['来源核对',/原话|分开|前后|对一下|时间线/u,['原话','分开','前后','对一下']]],
 yi:[['通用安慰',/我听着|别硬撑|最急|等我一下/u,['我听着','别硬撑','最急','等我一下']]]
};
const generic=['你先','先别急','慢慢说','我听着','别硬撑','我在','别一个人扛','无法证明','没法证明','哪句不像','哪句不对','具体哪句','指出来','直接问'];
const criticalPattern=/身份|本人|核对|证据|原件|记录|路线|出口|门|车|接应|位置|房|谁在|到哪|真假|通知|开门|离开|查证/u;

function topicOf(text){
 if(/先这样|聊到这|明天再聊|晚安|不聊了/u.test(text))return 'closing';
 if(/不信|不像你|说谎|怪怪|不对劲/u.test(text))return 'doubt';
 if(/怕|慌|紧张|心跳|撑不住|不安/u.test(text))return 'distress';
 if(/记得|记一下|刚才说|放哪|改口|说错/u.test(text))return 'memory';
 return 'social';
}

function relevantBackground(id,text){
 const p=partyPersonas[id];
 if(!p)return [];
 if(id==='lan'&&/收拾|桌|蜡烛|纸盘/u.test(text))return p.birthday;
 if(id==='lin')return /蛋糕|吃|饿|甜/u.test(text)?[p.birthday[0]]:/充电|线|电量/u.test(text)?[p.birthday[1]]:[];
 if(id==='zhou'&&/车|座位|歌|音乐/u.test(text))return p.birthday;
 if(id==='wei')return /蛋糕|吃|饿|甜/u.test(text)?[p.birthday[0]]:/礼物|袋/u.test(text)?[p.birthday[1]]:[];
 if(id==='rui'&&/照片|合照|拍立得|原图|相纸/u.test(text))return p.birthday;
 if(id==='yi')return /礼物|袋/u.test(text)?[p.birthday[0]]:/伞|下雨|便利店|小路/u.test(text)?[p.birthday[1]]:[];
 return [];
}

export function partyStyleState(id,{dialogue=[],latestText=''}={}){
 const p=partyPersonas[id];
 if(!p)return null;
 const recent=dialogue.filter(item=>item?.from===id&&typeof item.content==='string').slice(-4);
 const combined=recent.map(item=>item.content).join('\n'),critical=criticalPattern.test(latestText);
 const usedAnchors=anchors[id].filter(([,pattern])=>pattern.test(combined)).map(([label])=>label);
 const avoidPhrases=[...new Set([...anchors[id].flatMap(([,pattern,phrases])=>pattern.test(combined)?phrases:[]),...generic.filter(phrase=>combined.includes(phrase))])].slice(0,8);
 const angle=critical?'准确回答当前核验问题；关键事实优先，不因风格冷却而省略。':p.angles[recent.length%p.angles.length];
 return {schema:1,topic:topicOf(latestText),critical,angle,usedAnchors,avoidPhrases,background:critical?[]:relevantBackground(id,latestText)};
}

export function validPartyStyle(value){
 return value&&value.schema===1&&['social','memory','distress','doubt','closing'].includes(value.topic)&&typeof value.critical==='boolean'&&
  typeof value.angle==='string'&&value.angle.length<=100&&Array.isArray(value.usedAnchors)&&value.usedAnchors.length<=4&&value.usedAnchors.every(x=>typeof x==='string'&&x.length<=20)&&
  Array.isArray(value.avoidPhrases)&&value.avoidPhrases.length<=8&&value.avoidPhrases.every(x=>typeof x==='string'&&x.length<=20)&&
  Array.isArray(value.background)&&value.background.length<=2&&value.background.every(x=>typeof x==='string'&&x.length<=80);
}

const fallbacks={
 lan:{calm:['我明白。哪一段还乱着，你挑一段说。','这句我接住了。需要分清哪部分，你直接指出来。','你继续，我不替你先定答案。','说到这儿我能跟上。后面按你习惯讲。','这段清楚。你想停一下或继续都可以。','好，我只按你现在说的理解，不往外加。'],worried:['不用急着说完整。卡在哪儿，就从哪儿讲。','我跟得上。能确定什么就说什么，空着的先空着。','这会儿不用把所有事都理顺，挑眼前这段说。'],doubt:['你怀疑得有道理。指出哪句不对，我们只看那句。','可以质疑我。哪句话让你觉得不对，直接点出来。','别勉强相信。我们就从你不确定的地方重新说。'],close:['好，今天就停在这儿。明天想起什么再接。','知道了，你歇会儿。没说完的不用今晚说完。','那就先到这儿，之后从刚才停下的地方接。']},
 lin:{calm:['得，我听明白了。你接着讲，别管顺不顺。','这句能接上。你想往哪儿聊就往哪儿聊。','明白，你说你的，我不抢着下结论。','懂了，后面想到哪儿就讲到哪儿。','这话我接得到。你不用特意说得很正式。','可以，别把聊天弄成答题，照平常说。'],worried:['你不用把话说漂亮，能讲多少讲多少。','我不跟你打包票。你觉得哪儿别扭，就说哪儿。','缓一口也成，不想从头讲就从中间讲。'],doubt:['听着太顺确实可疑。你挑一句问，我照实答。','你不信也正常。哪句像瞎编的，直接拎出来。','别给我面子，觉得不对就问具体点。'],close:['成，今天就到这儿。明天再接也不迟。','那你歇着，剩下的改天再扯。','知道了，不留你继续熬。之后再说。']},
 zhou:{calm:['看到了。你问哪件，我就回哪件。','这句明白。没确认的，我不替你补。','你说，我按你现在这句话回。','知道。你继续，别的我不乱加。','这事听明白了。后面有准话再接。','可以。你说到哪，我记到哪。'],worried:['话不用多。哪句要紧，就说哪句。','慢一点没事，别把没把握的也算进去。','你照实说。没说清的地方先留着。'],doubt:['不信就核一件具体的，别靠感觉猜。','你指出哪句有问题，我按那句说。','可以查。没对上的地方就先算没对上。'],close:['好，今天先这样。','知道了，剩下的明天再说。','成，到这里。别的等有准信再谈。']},
 wei:{calm:['嗯，看到了。你想从哪儿聊都可以。','我明白你的意思。你接着说，不用说得很完整。','这句我收到了。你现在想聊什么就聊什么。','好呀，今天乱七八糟的，随便说两句也行。','我能跟上。你不用为了照顾我换话题。','知道了。你想接着讲，或者换一件事都可以。'],worried:['你不用照顾我的反应，按自己的速度说。','听得出来你有点乱。能说多少就说多少。','先缓一下也可以，我不会催你把话说完。'],doubt:['你觉得不对，就别压着。具体是哪一句？','别因为是我就勉强相信，哪里奇怪你直接问。','你这么想有理由。我们从让你起疑的那句说。'],close:['好，那今天先休息。明天想聊再找我。','知道啦，今晚就到这儿。你早点歇。','好，先不聊了。剩下的话留到明天。']},
 rui:{calm:['看见了。你接着说，我不替你补空白。','明白。你问到哪儿，我就答到哪儿。','这句清楚，不需要再绕一遍。','能接上。你按现在记得的继续。','收到。这里没有冲突，不用特意拆开说。','好，这句话本身够清楚了。'],worried:['不用一次讲全。哪部分确定，就从哪部分说。','卡住就停，没把握的地方先留白。','我能跟上。你按自己记得的讲，不用凑完整。'],doubt:['可以怀疑。你指出具体哪句，我把依据说清。','哪里对不上就说哪里，不需要先下结论。','你挑一句最可疑的，我们只核那一句。'],close:['好，停在这里。下次从这句后面接。','知道了，今晚不再往下追。','那就到这儿，没说完的保持没说完。']},
 yi:{calm:['明白。你接着说，我不替你往后猜。','这句收到了。你想说什么就直接说。','可以，按你现在想到的讲。','知道。你不用铺垫，想到什么就说什么。','这段我跟得上，继续就成。','好，你按自己的节奏来。'],worried:['不用赶。能说清哪句，就说哪句。','缓一下没事，别为了完整硬往下接。','你按现在的状态说，不需要装作没事。'],doubt:['觉得不像就直接问，别绕着试。','哪句有问题你指出来，我只答那句。','你有疑问就留着，先核具体的话。'],close:['好，今天到这儿。之后需要再说。','知道了，你去歇着。明天再接。','可以，先停。剩下的不用今晚解决。']}
};

const intruderFallback={
 lan:['你具体觉得哪句不对？说清楚一点。','别一下问一串。你到底想确认什么？','你这么问是什么意思？挑一句说。'],
 lin:['哪儿怪了？你别只丢半句话。','你想试我什么，直接说。','别绕弯子了，你具体问哪件？'],
 zhou:['说具体。你要核哪件？','别猜，指出哪句话。','你问清楚一点，我才好回。'],
 wei:['你为什么突然这么问？是哪句话让你不舒服？','我没太明白，你具体在怀疑什么？','别吓我。你先说是哪儿不对。'],
 rui:['哪一句对不上？把那句指出来。','先别下结论。你具体质疑哪部分？','你说清时间和那句话，我再答。'],
 yi:['你想确认什么，直说。','哪句话不像？指出来。','别兜圈子，问具体点。']
};

function chooseVariant(list,recentTexts){
 const recent=recentTexts.slice(-6),joined=recent.join('\n'),start=recent.length%list.length;
 const scored=list.map((text,index)=>({text,index,score:(recent.includes(text)?100:0)+generic.filter(p=>text.includes(p)&&joined.includes(p)).length}));
 scored.sort((a,b)=>a.score-b.score||((a.index-start+list.length)%list.length)-((b.index-start+list.length)%list.length));
 return scored[0].text;
}

export function partyFallbackReply(id,{text='',emotion={mode:'calm'},controller=id,recentTexts=[]}={}){
 if(!fallbacks[id])return '我看到了。你接着说。';
 if(controller==='intruder')return chooseVariant(intruderFallback[id],recentTexts);
 const topic=topicOf(text);
 const key=topic==='closing'?'close':topic==='doubt'?'doubt':topic==='distress'||['tense','crisis'].includes(emotion.mode)?'worried':'calm';
 return chooseVariant(fallbacks[id][key],recentTexts);
}
