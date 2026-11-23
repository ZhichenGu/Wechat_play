import * as legacyEngine from './engine.js';
import * as legacy from './story.js';
import * as legacySave from './save.js';
import * as legacyDialogue from './reply-delivery.js';
import {profiles as oldProfiles,moments as oldMoments,albumCovers as oldCovers} from './moments.js';
import {priorChats as oldChats} from './prior-chats.js';
import {ids,cast,partyRooms,caseFiles,partyVoices,PARTY_VERSION} from './party-story.js';
import {freshParty,dispatchParty,retryParty,partyObjective,getGroups,recoverParty} from './party-engine.js';
import {stageParty,settleParty} from './party-dialogue.js';
import {intentContext,shouldInterpret} from './party-ai.js';

const key='biefadaoqunli.v2';
const query=new URLSearchParams(location.search);
function read(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
const newSave=read(key);
export const party=query.has('party')||(!query.has('legacy')&&(newSave?.version===PARTY_VERSION||read(legacySave.SAVE_KEY)?.version!==legacy.VERSION));
export const partyLink=party?'/?legacy=1':'/?party=1';
export const hasLegacy=()=>read(legacySave.SAVE_KEY)?.version===legacy.VERSION;
export const npcIds=party?ids:['lan','lin','zhou'];
export const rooms=party?{...partyRooms}:legacy.rooms;
export const people=party?{me:legacy.people.me,...cast}:legacy.people;
export const files=party?{}:legacy.files;
export const voices={...legacy.voices,...partyVoices};
export const profiles=party?{...cast,me:{note:'聚会的朋友',signature:'手机里存了好多路灯。'}}:oldProfiles;
export const albumCovers=party?{...oldCovers,wei:'dusk',rui:'garden',yi:'gray'}:oldCovers;
export const moments=party?[
 {id:'party-wei',author:'wei',time:'今天 18:40',text:'蛋糕订小了。现在的解决方案是切得非常薄。',likes:['lan','rui']},
 {id:'party-rui',author:'rui',time:'昨天 15:16',text:'记得帮我留原图，压过一遍的夜景全是黑的。等我的合照。',photo:2,comments:[['wei','原图要记得发我！']]},
 {id:'party-yi',author:'yi',time:'昨天 19:05',text:'这条小路出去就是便利店。下雨天别踩那块活动的砖。',likes:['zhou']},
 ...oldMoments.filter(post=>post.id!=='last-look')
]:oldMoments;
const history=(room,from,text)=>[{id:'past-party-'+room,room,from,text,type:'text',time:'昨天'}];
export const priorChats=party?{
 wei:history('wei','wei','订好了，还是二层 208。周六都来啊。'),
 rui:history('rui','rui','这次合照我带拍立得。相纸分我一包。'),
 yi:history('yi','yi','上次送你们过去，从便利店旁边进去就很近。'),
 lan:history('lan','lan','到门口了说一声，我下来接。'),
 lin:history('lin','lin','给我留块蛋糕，六点半到。'),
 zhou:history('zhou','zhou','散了我送人。老地方停车。')
}:oldChats;
export const {stickers,stickerFaces,newGroupIds,isMixedGroup}=legacy;
export const endings=party?{
 A:{title:'全部离开',sub:'车门终于关上。',body:'老金又数了一遍人。七个人都在。手机屏幕亮了，群里还有人在等回话。'},
 B:{title:'有人未归',sub:'车里的座位还空着。',body:'街对面的灯熄了。你又点开群聊，等着一条报平安的消息。'},
 C:{title:'你失联了',sub:'输入中的草稿停在屏幕上。',body:'门锁轻响了一声。下一条消息，还顶着你熟悉的头像。'}
}:legacy.endings;
export const fresh=party?freshParty:legacyEngine.fresh;
export const dispatch=party?dispatchParty:legacyEngine.dispatch;
export const retry=party?retryParty:legacyEngine.retry;
export const objective=party?partyObjective:legacyEngine.objective;
export const activeGroupIds=party?getGroups:legacy.activeGroupIds;
export const stageNpcReply=party?stageParty:legacyDialogue.stageNpcReply;
export const settleNpcReply=party?settleParty:legacyDialogue.settleNpcReply;
export const buildIntentContext=party?intentContext:()=>null;
export const shouldInterpretMessage=party?shouldInterpret:()=>false;
export function load(){return party?(newSave?.version===PARTY_VERSION?recoverParty(newSave):null):legacySave.load();}
export function save(state){if(!party)return legacySave.save(state);try{localStorage.setItem(key,JSON.stringify(state));return true;}catch{return false;}}
export function syncCatalog(state){
 if(!party)return;
 for(const id of Object.keys(rooms))if(!partyRooms[id])delete rooms[id];
 Object.assign(rooms,state.groups);
 Object.assign(files,caseFiles(state.case));
}
