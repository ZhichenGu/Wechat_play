import {ids} from './party-story.js';

const clamp=value=>Math.max(0,Math.min(3,value));
const received=(s,who)=>s.messages.filter(m=>m.from===who||m.deliveredTo?.includes(who));

export function partyEmotionState(s,who){
 if(!ids.includes(who))return {mode:'calm',tension:0,worry:0,suspicion:0,trust:1,drivers:[]};
 const visible=received(s,who),drivers=[];
 let tension=clamp(Math.floor((s.chapter??0)/2)),worry=0,suspicion=0,trust=1;
 const player=visible.filter(m=>m.from==='me'&&m.type==='text').slice(-6);
 const relieved=text=>/没那么慌|不慌了|缓过来|好些了|好多了|先聊到这|不用担心/.test(text);
 const latestFear=player.findLast(m=>/怕|慌|紧张|撑不住|不安/.test(m.text)&&!relieved(m.text));
 if(latestFear){worry+=2;drivers.push({kind:'player-distress',source:latestFear.id});}
 const latestRelief=player.findLast(m=>relieved(m.text));
 if(latestRelief&&(!latestFear||player.indexOf(latestRelief)>player.indexOf(latestFear))){worry=Math.max(0,worry-1);drivers.push({kind:'player-relief',source:latestRelief.id});}
 const latestDoubt=player.findLast(m=>/不信|你怎么知道|说谎|假的|不对劲|冒用/.test(m.text));
 if(latestDoubt){suspicion+=2;drivers.push({kind:'player-doubt',source:latestDoubt.id});}
 const latestTrust=player.findLast(m=>/谢谢|信你|靠你|麻烦你了|辛苦/.test(m.text));
 if(latestTrust){trust+=1;drivers.push({kind:'player-trust',source:latestTrust.id});}
 const clues=s.knowledge?.[who]?.roomClues??[];
 if(clues.some(item=>item.kind==='candidate'||item.kind==='reported')){suspicion+=1;drivers.push({kind:'unverified-clue',source:clues.at(-1).message});}
 if(s.chapter>=3){tension+=1;drivers.push({kind:'story-pressure',source:`phase:${s.chapter}`});}
 if(s.threatStep>=2){tension+=1;worry+=1;drivers.push({kind:'crisis-pressure',source:`threat:${s.threatStep}`});}
 tension=clamp(tension);worry=clamp(worry);suspicion=clamp(suspicion);trust=clamp(trust);
 const peak=Math.max(tension,worry,suspicion);
 const mode=peak>=3?'crisis':peak===2?'tense':peak===1?'wary':'calm';
 return {mode,tension,worry,suspicion,trust,drivers:drivers.slice(-4)};
}

export function validPartyEmotion(value){
 return value&&['calm','wary','tense','crisis'].includes(value.mode)&&['tension','worry','suspicion','trust'].every(key=>Number.isInteger(value[key])&&value[key]>=0&&value[key]<=3)&&
  Array.isArray(value.drivers)&&value.drivers.length<=4&&value.drivers.every(item=>item&&['player-distress','player-relief','player-doubt','player-trust','unverified-clue','story-pressure','crisis-pressure'].includes(item.kind)&&typeof item.source==='string'&&item.source.length<=140);
}
