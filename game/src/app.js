import {PARTY_AI_BUILD,PARTY_PLAYTEST_BUILD} from './party-story.js';
import {fresh,dispatch,retry,objective,rooms,people,files,voices,stickers,stickerFaces,endings,newGroupIds,activeGroupIds,isMixedGroup,load,save,
 stageNpcReply,settleNpcReply,buildIntentContext,shouldInterpretMessage,albumCovers,moments,profiles,priorChats,party,npcIds,partyLink,hasLegacy,syncCatalog} from './session.js';
import {createPlaytest,exportPlaytest} from './party-playtest.js';
import {partySuggestions} from './party-engine.js';
import {backgroundContacts,backgroundHistory,sendBackgroundMessage} from './background-contacts.js';
import {unreadCount,markRead,storeDraft,statusClockTime} from './chat-ui.js';
import {clearNpcApiKey,hasNpcApiKey,npcApiStatus,npcReply,npcIntent,setNpcApiKey} from './ai.js';
import {replyTimeoutConfig,startReplyRequest} from './reply-timeout.js';
import {playVoice,stopAudio,playPreview,setVoiceOutput,soundscape} from './audio.js';
let state=load()||fresh(),view='list',room='lan',panel=null,modal=null,draft='',quote=null,volume=soundscape.prefs.master,ai=localStorage.getItem('alan-ai-enabled')!=='false',apiStatus=null,epoch=0,controller=null,callMin=false,toastTimer;
const apiConnectedText='AI 接口已连接，日常聊天可使用自然回复；关键剧情由游戏规则控制。';
const app=document.querySelector('#app');
syncCatalog(state);
const query=new URLSearchParams(location.search),playtestEnabled=party&&query.has('playtest'),research=playtestEnabled&&query.has('research');
const playtest=playtestEnabled?createPlaytest(localStorage):null;
if(playtest)playtest.attach(state);
if(playtest)npcApiStatus().then(status=>{apiStatus=ai&&status.configured?'api-configured':'local-fallback';playtest.setMode(apiStatus);}).catch(()=>{apiStatus='local-fallback';playtest.setMode(apiStatus);});
const backgroundIds=Object.keys(backgroundContacts);
const isBackground=id=>Object.hasOwn(backgroundContacts,id);
const roomTitle=id=>rooms[id]?.name??people[id]?.name??backgroundContacts[id]?.name??'系统';
const roomMessages=id=>isBackground(id)?backgroundHistory(state,id):state.messages.filter(m=>m.room===id);
const scrollPositions={},sideHistory=[];
let viewedContact=null,momentsOwner=null,viewedMoment=null;
let chatParent='list',desktopSettingsOpen=false;
let showOpeningHint=false;
let activeVoice=null;
const callAudio={muted:false,speaker:false};
const callObserver={onFinish(reason){if(reason==='error')toast('通话音频未能播放，字幕仍可查看。');}};
const callVolume=()=>callAudio.muted?0:volume*(callAudio.speaker?1:.62);
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(id,size=24)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({back:'<path d="m15 4-8 8 8 8"/>',minimize:'<path d="m4 4 6 6m0-5v5H5m15 10-6-6m0 5v-5h5"/>',speaker:'<path d="M4 9h4l5-4v14l-5-4H4zM16 9a4.5 4.5 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/>',quiet:'<path d="M4 9h4l5-4v14l-5-4H4zM16 10l4 4m0-4-4 4"/>',personAdd:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M20 9v8m-4-4h8"/>',settings:'<path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',plus:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14q4 5 8 0M8 9h.1M16 9h.1"/>',voiceMessage:'<path d="M3 12h.1m3-3a4 4 0 0 1 0 6m4-9a8 8 0 0 1 0 12m4-15a12 12 0 0 1 0 18"/>',voice:'<circle cx="12" cy="12" r="9"/><path d="M10 8v8M14 6v12M6 10v4M18 10v4"/>',more:'<circle cx="5" cy="12" r=".7"/><circle cx="12" cy="12" r=".7"/><circle cx="19" cy="12" r=".7"/>',chat:'<path d="M20 11a8 8 0 0 1-8 7H7l-4 3 1-6a8 8 0 1 1 16-4Z"/><path d="M8 10h.1M12 10h.1M16 10h.1"/>',people:'<circle cx="10" cy="8" r="3"/><path d="M3 20v-2a7 7 0 0 1 14 0v2M17 5a3 3 0 0 1 0 6M21 20v-3a5 5 0 0 0-3-4"/>',me:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',file:'<path d="M5 2h9l5 5v15H5Z M14 2v6h5M8 13h8M8 17h6"/>',pin:'<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',phone:'<path d="m5 3 4 4-2 3q2 5 7 7l3-2 4 4q-3 5-8 2Q3 17 2 8q-1-4 3-5Z"/>',star:'<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',lock:'<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',send:'<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>'})[id]||'<circle cx="12" cy="12" r="8"/>'}</svg>`;
const designIcon=name=>`<img src="./assets/weixun/${name}.svg" alt="" aria-hidden="true">`;
const searchButton=()=>button(designIcon('search'),'search','aria-label="搜索聊天记录" title="搜索聊天记录"');
const groupButton=()=>button(designIcon('add'),'newgroup','aria-label="发起群聊"');
const button=(label,action,extra='',cls='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
function avatar(id,cls=''){
 const photo=backgroundContacts[id]?.avatar??people[id]?.avatar;
 if(photo)return `<span class="avatar ${cls}"><img src="./assets/contacts/${photo}.png" alt=""></span>`;
 if(rooms[id]?.members.length>2)return `<span class="avatar group ${rooms[id].members.length>4?'group-many':''} ${cls}">${rooms[id].members.filter(x=>x!=='me').concat('me').map(x=>avatar(x,'tiny')).join('')}</span>`;
 const p=people[id]||people.me;return `<span class="avatar ${cls}" style="background:${p.color}"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#ffffff18" d="M0 0h48v48H0z"/><path fill="#343b3e" d="M7 48q0-17 17-17t17 17"/><path fill="#d9c2aa" d="M16 19q0-10 8-10t8 10v7q-1 9-8 9t-8-9z"/><path fill="${id==='lin'?'#3d352e':'#293432'}" d="M14 23V13Q24-2 34 14v13l-4-11-14 4z"/><path d="M20 25h1m7 0h1" stroke="#444" stroke-width="2"/></svg></span>`;
}
function sticker(i){return `<div class="sticker-art"><svg viewBox="0 0 100 80" aria-hidden="true"><path d="M25 30 12 12Q0 40 21 51M75 30l13-18q12 28-9 39" fill="#b99d7a" stroke="#4b443a" stroke-width="2"/><ellipse cx="50" cy="43" rx="32" ry="28" fill="#f3e6cf" stroke="#4b443a" stroke-width="2"/><ellipse cx="50" cy="53" rx="14" ry="11" fill="#fff8eb"/><path d="m46 48 8 0-4 5Z" fill="#4b443a"/></svg><span class="dog-face">${stickerFaces[i]}</span><b>${stickers[i]}</b></div>`;}
function statusTime(){return party?stamp(state.clock):statusClockTime(state.statusClockStartedAt);}
function updateStatusClock(){
 const clock=document.querySelector('.statusbar time');
 if(clock)clock.textContent=statusTime();
}
function stamp(tick){if(party){const minute=23*60+42+Math.floor((tick??0)/2);return String(Math.floor(minute/60)%24).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');}return `01:${String(37+Math.floor(tick/2)).padStart(2,'0')}`;}
function quoteText(m){return party&&m?.type==='file'?files[m.value].name+' · '+files[m.value].text:short(m);}
function short(m){if(!m)return '';return m.type==='file'?'[文件] '+files[m.value].name:m.type==='capture'?'[聊天截图]':m.type==='voice'?'[语音]':m.type==='sticker'?'[表情]':m.type==='location'?'[位置] '+m.text:m.type==='call'?transcriptParts(m.text).map(part=>part.text).join(' '):m.text;}
function commit(next){const before=state;if(next===before)return;state=next;syncCatalog(state);playtest?.update(before,state);soundscape.update(before,state);saveState();render();}
function sendEvent(e){commit(dispatch(state,{id:crypto.randomUUID(),runId:state.runId,...e}));}
function cancelReply(){controller?.abort();if(state.replyInFlight)commit(settleNpcReply(state,state.replyInFlight.token));}
function saveState(){if(!save(state))toast('浏览器未能保存；请保持此页开启。');}
function keepDraft(){if(storeDraft(state,room,draft,quote?.id))saveState();}
function openChat(id){
 showOpeningHint=false;
 chatParent=view==='chat'?chatParent:view;
 const saved=state.chatUi?.drafts?.[id];
 room=id;view='chat';modal=null;panel=null;
 draft=state.ending?'':saved?.text??'';
 quote=state.ending||!saved?.quoteId?null:state.messages.find(m=>m.id===saved.quoteId)??null;
 render.bottom=true;
}
function openSide(next,id){
 const pane=document.querySelector('#messages,.screen .directory,.screen .chat-list');
 sideHistory.push({view,room,chatParent,viewedContact,momentsOwner,viewedMoment,scroll:pane?.scrollTop??0});
 if(activeVoice)stopAudio();
 if(next==='contactCard')viewedContact=id;
 else if(next==='moments')momentsOwner=id||null;
 else if(next==='momentDetail')viewedMoment=id;
 view=next;scrollPositions[next]=0;panel=null;modal=null;
}
function returnSide(){
 const prior=sideHistory.pop();
 if(!prior){view='discover';return;}
 const {view:destination,room:previousRoom,chatParent:parent,scroll}=prior;
 if(destination==='chat'){openChat(previousRoom);chatParent=parent;render.bottom=false;render.restoreScroll=scroll;}
 else {view=destination;scrollPositions[view]=scroll;}
 viewedContact=prior.viewedContact;momentsOwner=prior.momentsOwner;viewedMoment=prior.viewedMoment;panel=null;modal=null;
}
function nearBottom(messages){
 return !!messages&&messages.scrollHeight-messages.clientHeight-messages.scrollTop<=24;
}
function readVisibleChat(messages=document.querySelector('#messages')){
 if(view!=='chat'||isBackground(room)||document.hidden||modal||state.pending||!messages||(state.call&&!callMin))return;
 if(!nearBottom(messages))return;
 if(markRead(state,room,roomMessages(room)))saveState();
}
function toast(text){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=text;document.body.append(el);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),2600);}
function closeModal(){const copied=modal?.kind==='message'&&state.messages.find(m=>m.id===modal.mid)?.value==='copy';if(modal?.kind==='settings'||(activeVoice&&modal?.mid===activeVoice.id))stopAudio();modal=null;if(copied)reviewCopiedVoice();}
function reset(next,source='新开局'){sideHistory.length=0;for(const key of Object.keys(scrollPositions))delete scrollPositions[key];if(state.replyInFlight)playtest?.markAi({mode:'cancelled'},0,{status:'discarded',guardStatus:'RESET_OR_ROLLBACK'});epoch++;controller?.abort();stopAudio();soundscape.reset(next);state=next;syncCatalog(state);playtest?.start(state,source);if(playtest&&apiStatus)playtest.setMode(apiStatus);modal=null;panel=null;draft='';quote=null;callMin=false;showOpeningHint=false;view='list';saveState();render();}
function finishOpening(){
 if(state.flags.welcomed)return;
 state.flags.welcomed=true;
 playtest?.mark('进入微讯');
 state.statusClockStartedAt??=Date.now();
 showOpeningHint=true;
 saveState();
 render();
 document.querySelector('.opening-hint')?.focus({preventScroll:true});
}
function renderOpening(){
 if(app.querySelector('.opening-film'))return;
 if(party){
  soundscape.setPaused(true);
  app.innerHTML=`<section class="phone phone-opening" aria-label="故事开场">
   <div class="opening-film party-film"><div class="party-hall"></div><div class="party-captions">
   <p>周六 23:42<br>生日聚会刚散场。</p><p>你回楼上取充电器。<br>楼梯口有人反复喊你的名字。</p>
   <p>你退进 B03，反锁了门。<br>手机亮了。<br><strong>「你在哪间？我上来接你。」</strong></p>
   </div></div>${button('跳过','skipOpening','aria-label="跳过开场"','opening-skip')}</section>`;
  const film=app.querySelector('.party-film');
  setTimeout(()=>{if(film.isConnected)finishOpening();},9000);
  return;
 }
 soundscape.setPaused(true);
 app.innerHTML=`<section class="phone phone-opening" aria-label="故事开场">
  <video class="opening-film" src="/assets/opening.mp4" playsinline muted preload="auto"
   aria-label="凌晨 1:39，撤展的最后一夜。你在临时休息室等人来会合。房号和门码，别发到群里。"></video>
  ${button('跳过','skipOpening','aria-label="跳过开场"','opening-skip')}
 </section>`;
 const video=app.querySelector('.opening-film');
 const finish=()=>{if(video.isConnected)finishOpening();};
 video.addEventListener('ended',finish,{once:true});
 video.addEventListener('error',finish,{once:true});
 video.muted=true;
 video.play().catch(finish);
}
function transcriptParts(text){
 return text.split(/(\[[^\]]+\])/).map(part=>part.trim()).filter(Boolean).map(part=>{
  if(part.startsWith('[')&&part.endsWith(']')){
   const cue=part.slice(1,-1);
   const distant=cue.match(/^((?:春哥|小林)在远处)[：:]\s*(.+)$/);
   if(distant)return {text:distant[2],label:'春哥在远处'};
   return {text:cue,sound:true};
  }
  return {text:part.replace(/^(?:春哥|老潘|老金|小林|阿岚|阿兰|老周)(?:账号)?[：:]\s*/,'')};
 });
}
function renderTranscript(text){
 return `<span class="transcript-lines">${transcriptParts(text).map(part=>part.sound
  ?`<span class="transcript-sound">${icon('speaker',14)}<span>${esc(part.text)}</span></span>`
  :`<span class="transcript-speech">${part.label?`<small class="transcript-source">${esc(part.label)}</small>`:''}${esc(part.text)}</span>`).join('')}</span>`;
}
function preview(m){if(m.type==='file')return `<div class="file-body"><div><b>${esc(files[m.value].name)}</b><small>${esc(files[m.value].version)}</small></div><span class="file-icon">${icon('file',30)}</span></div><div class="card-foot">聊天文件</div>`;
 if(m.type==='capture')return `<span class="capture-card"><small>聊天截图</small><span>${esc(m.text)}</span></span>`;
 if(m.type==='sticker')return sticker(m.value);
 if(m.type==='location')return `<b class="location-title">${esc(party?m.lastLocation??m.text:m.text)}</b><small class="location-label">${party?'虚构 · 旧商业楼':'虚构 · 旧厂房园区'}</small>${mapSvg(false)}`;
 if(m.type==='call')return `<span class="call-receipt-title">${icon('phone',16)}通话记录</span>${renderTranscript(m.text)}`;
 return `${m.quote?`<div class="quoted">${esc(m.quote)}</div>`:''}${esc(m.text)}`;
}
const waveform=[5,9,13,19,11,16,8,5,10,15,8,5,7,12,8,5,10,18,14,11,15,8,6];
function voiceLabel(line){
 return `${line.matches('.is-playing')?'停止':'播放'}语音，${line.dataset.seconds} 秒${line.querySelector('.voice-unheard')?'，未听':''}`;
}
function syncVoiceBubble(id){
 const line=document.querySelector(`[data-voice-id="${CSS.escape(id)}"]`);
 if(!line)return;
 const playing=activeVoice?.id===id;
 line.classList.toggle('is-playing',playing);
 const listen=line.querySelector('.bubble.voice');
 listen.setAttribute('aria-pressed',String(playing));
 listen.setAttribute('aria-label',voiceLabel(line));
 line.querySelectorAll('.voice-wave i').forEach((bar,index)=>bar.classList.toggle('played',playing&&index/waveform.length<activeVoice.progress));
}
function voiceBubble(m){
 const seconds=voices[m.value].seconds;
 const playing=activeVoice?.id===m.id;
 const unheard=m.from!=='me'&&!state.chatUi?.heardVoice?.[m.id];
 const action=`${playing?'停止':'播放'}语音，${seconds} 秒${unheard?'，未听':''}`;
 const bars=waveform.map((height,index)=>`<i style="--bar-height:${height}px"${playing&&index/waveform.length<activeVoice.progress?' class="played"':''}></i>`).join('');
 return `<div class="voice-message"><div class="voice-line${playing?' is-playing':''}" data-voice-id="${m.id}" data-seconds="${seconds}">
 ${button(`<span class="voice-glyph">${icon('voiceMessage',20)}</span><span class="voice-wave" aria-hidden="true">${bars}</span>`,'voiceToggle',`data-mid="${m.id}" aria-label="${action}" aria-pressed="${playing}" style="--voice-width:${96+seconds*5}px"`,'bubble voice')}
 <span class="voice-meta" aria-hidden="true">${unheard?'<i class="voice-unheard"></i>':''}<span>${seconds}″</span></span>
 </div>${button('字幕','voiceTranscript',`data-mid="${m.id}" aria-label="查看语音字幕"`,'voice-transcript')}</div>`;
}
function reviewCopiedVoice(){
 if(state.flags.copy&&!state.flags.copyReviewed&&!state.ending)sendEvent({type:'VOICE_REVIEWED',value:'copy'});
}
async function playVoiceMessage(msg){
 stopAudio();
 const playback={id:msg.id,progress:0};
 activeVoice=playback;syncVoiceBubble(msg.id);
 let failed=false;
 const started=await playVoice(msg.value,volume,{
  onProgress(progress){if(activeVoice===playback){playback.progress=progress;syncVoiceBubble(msg.id);}},
  onFinish(reason){
   if(activeVoice!==playback)return;
   activeVoice=null;syncVoiceBubble(msg.id);failed=reason==='error';
   if(reason==='ended'&&msg.value==='copy'&&modal?.mid!==msg.id)reviewCopiedVoice();
   if(failed&&playback.started)toast('音频未能播放，字幕仍可查看。');
  }
 });
 if(!started){if(failed)toast('音频未能播放，字幕仍可查看。');return;}
 if(activeVoice!==playback)return;
 playback.started=true;
 const ui=state.chatUi??={};
 (ui.heardVoice??={})[msg.id]=true;
 saveState();
 if(!state.ending)sendEvent({type:'PLAY_VOICE',value:msg.value});
 else render();
}
function mapSvg(full=true){if(party)return `<svg class="map ${full?'full-map':''}" viewBox="0 0 330 222" role="img" aria-label="商业楼出口示意图">
 <rect width="330" height="222" fill="#e7ebe5"/><rect x="62" y="40" width="207" height="130" rx="5" fill="#d3dcd3"/>
 <path d="M165 31v157M51 100h228" stroke="#fafbf7" stroke-width="15"/>
 <path d="M165 100h115M165 101v87" stroke="#739386" stroke-width="5" fill="none"/>
 <g fill="#46574f" text-anchor="middle" font-size="12"><text x="165" y="24">正门</text><text x="35" y="103">西门</text><text x="300" y="103">东门</text>
 <text x="111" y="72">包间 208</text><text x="216" y="85">后场通道</text><text x="215" y="150">侧楼梯</text><text x="165" y="206">后院门</text></g></svg>`;return `<svg class="map ${full?'full-map':''}" viewBox="0 0 330 230" role="img" aria-label="园区示意图：北装卸口、西门、B楼、东泵房和南侧服务门"><rect width="330" height="230" fill="#e7ebe5"/><path d="M0 46h330M0 190h330M40 0v230M272 0v230" stroke="#fafbf7" stroke-width="16"/><path d="M165 46v144h108M165 106h108M40 106h125" fill="none" stroke="#c8d1c7" stroke-width="8"/><g fill="#d2d8d0" stroke="#b8c3b6"><rect x="74" y="64" width="66" height="70"/><rect x="190" y="64" width="54" height="65"/><rect x="72" y="153" width="61" height="24"/></g><g font-family="sans-serif" font-size="11" fill="#667366" text-anchor="middle"><text x="107" y="102">B 楼</text><text x="217" y="100">泵房</text><text x="106" y="169">设备间</text><text x="165" y="25">北装卸口</text><text x="40" y="140">西门</text><text x="285" y="140">东门</text><text x="165" y="219">南侧服务门</text></g><circle cx="110" cy="114" r="7" fill="#6a93c1" stroke="white" stroke-width="3"/><text x="310" y="23" font-size="12" fill="#849284">N ↑</text></svg>`;}
function unreadBadge(count){
 return count?`<span class="unread" aria-hidden="true">${count>99?'99+':count}</span><span class="unread-label">${count} 条未读消息</span>`:'';
}
function list(){
 const recentBackground=[...new Set((state.backgroundOutbox??[]).map(m=>m.room).reverse())];
 const earlierBackground=['dad','mom','zheng','fan','anning','jiang','xu','tao'];
 const backgroundDrafts=state.ending?[]:backgroundIds.filter(id=>state.chatUi?.drafts?.[id]);
 const ids=[...activeGroupIds(state),...npcIds,...new Set([...backgroundDrafts,...recentBackground,...earlierBackground])];
 const rows=ids.map(id=>{
  const messages=roomMessages(id);
  const last=messages.at(-1)??priorChats[id]?.at(-1);
  const unread=isBackground(id)?0:unreadCount(state,id,messages);
  const typing=state.replyInFlight?.room===id&&!state.ending;
  const summary=typing?'正在输入…':last?.type==='location'?last.text:short(last)||'暂无消息';
  const time=last?`<time>${last.time??stamp(last.tick)}</time>`:'';
  const saved=state.ending?null:state.chatUi?.drafts?.[id];
  const draftPreview=saved?`<span class="draft-mark">[草稿]</span> ${esc(saved.text||'引用消息')}`:'';
  return button(`${avatar(id)}<span class="list-copy"><b>${esc(roomTitle(id))}</b><small${typing?' class="list-typing"':''}>${draftPreview||esc(summary)}</small></span>${time}${unreadBadge(unread)}`,'chat',`data-room="${id}"`,'chat-row');
 }).join('');
 const next=state.ending?button('结局','end','aria-label="返回结局"'):groupButton();
 const hint=showOpeningHint?`<aside class="opening-hint" tabindex="-1" aria-label="开场提示">
  <div class="opening-hint-copy"><b>先看「${rooms.old.name}」</b><p>${party?'看看楼层图，再回条消息。':'先看园区图，再听群语音。'}</p></div>
  ${button('打开群聊','chat','data-room="old"','opening-hint-primary')}
  ${button(icon('close',16),'dismissOpeningHint','aria-label="关闭开场提示"','opening-hint-close')}
 </aside>`:'';
 return `${tabHeader('微讯',next)}${wideSearch('search','搜索聊天记录')}${hint}<div class="chat-list">${rows}</div>${nav()}`;
}
function wideSearch(action,label){
 return `<div class="tab-search">${button(`${designIcon('search')}<span>搜索</span>`,action,`aria-label="${label}"`)}</div>`;
}
function tabHeader(title,actions=''){
 return `<header class="tab-header"><h1>${title}</h1>${actions?`<div class="tab-actions">${actions}</div>`:''}</header>`;
}
function nav(){
 const items=[['chat','微讯','list'],['people','通讯录','contacts'],['discover','发现','discover'],['me','我','me']];
 const total=Object.keys(rooms).reduce((count,id)=>count+unreadCount(state,id,roomMessages(id)),0);
 return `<nav aria-label="底部导航">${items.map(([glyph,label,target])=>button(`<i>${designIcon('nav-'+glyph+(view===target?'-on':''))}</i><span>${label}</span>${target==='list'?unreadBadge(total):''}`,target,`aria-label="${label}"${target==='list'&&total?` aria-description="${total} 条未读消息"`:''}${view===target?' aria-current="page"':''}`,view===target?'selected':'')).join('')}</nav>`;
}
function suggestions(){
 if(party)return partySuggestions(state,room);
 if(state.ending)return [];
 if(isMixedGroup(room))return ['收到','我单独联系你'];
 if(room==='lin')return ['你在哪？','你真的是春哥？','不要开门'];
 if(room==='zhou'){
  if(state.exited)return ['来接我们','车在哪？'];
  if(state.friendsRoute&&state.driverRoute!==state.friendsRoute)return [state.friendsRoute==='south'?'改到南侧服务门接我们':'改到东门接我们','车在哪？'];
  return ['车在哪？','请帮我们报警'];
 }
 if(state.chapter===0)return ['门已反锁，收到','撤场辛苦了'];
 if(state.chapter===1)return state.flags.copy?['刚才的背景声怎么一样？']:['你在哪？'];
 if(state.flags.intercepted)return [state.friendsRoute==='east'?'改走南侧服务门':'改走东门',...(state.shared.old?['停止旧群共享']:[])];
 if(state.chapter===2)return ['你们安全吗？',...(state.flags.inspected?['走东门，经泵房','改走南侧服务门']:['核实现场防火门'])];
 if(state.chapter===3)return ['到哪了？',...(state.shared.old?['停止旧群共享']:[]),'继续走'];
 if(state.chapter===4)return state.flags.verifiedMeet?['出门会合','作废门码']:['核验身份，推车怎么卡住的？'];
 return ['谢谢，走吧'];
}
function chatHeader(title){
 const label={list:'聊天列表',contacts:'通讯录',discover:'发现',me:'我',contactCard:'联系人资料',moments:'朋友圈'}[chatParent];
 return `<header class="chat-header">${button(designIcon('back'),chatParent==='contactCard'?'backToCard':chatParent,`aria-label="返回${label}"`)}<h1>${title}</h1>${button(designIcon('more'),'members','aria-label="聊天信息"')}</header>`;
}
function historyBubbles(messages){
 return messages.map((m,i)=>{
  const timestamp=messages[i-1]?.time===m.time?'':`<div class="time-sep">${m.time}</div>`;
  const mine=m.from==='me';
  return `${timestamp}<div data-message="${m.id}" class="message ${mine?'outgoing':''}">${contactAvatar(m.from)}<div class="message-content"><div class="bubble text ${mine?'mine':''}">${esc(m.text)}</div></div></div>`;
 }).join('');
}
function backgroundChat(){
 return `${chatHeader(roomTitle(room))}<div class="messages" id="messages">${historyBubbles(roomMessages(room))}</div>${backgroundChatTools()}`;
}
function emptyComposerAction(){
 return isBackground(room)?button(designIcon('sticker'),'backgroundEmojis','aria-label="表情"'):button(designIcon('chat-add'),'plus','aria-label="更多功能"');
}
function backgroundChatTools(){
 if(state.ending)return chatTools();
 const emojis=panel==='backgroundEmojis'?`<section class="sticker-panel" aria-label="表情"><div class="emoji-line">${['👍','❤️','😅','😂','👀','🙏'].map(text=>button(text,'emoji',`data-text="${text}"`)).join('')}</div></section>`:'';
 return `<footer class="composer background-composer"><textarea id="draft" rows="1" aria-label="消息输入">${esc(draft)}</textarea>${draft.trim()?button('发送','send','','send'):emptyComposerAction()}</footer>${emojis}`;
}
function chat(){if(isBackground(room))return backgroundChat();const ms=roomMessages(room);return `${chatHeader(esc(roomTitle(room))+(rooms[room].members.length>2?` (${rooms[room].members.length})`:''))}<div class="messages" id="messages">${historyBubbles(priorChats[room]??[])}${state.ending||ms.length?`<div class="time-sep">${state.ending?'本次会话已结束':(party?'今晚 ':'凌晨 ')+stamp(state.clock)}</div>`:''}${ms.map(m=>m.from==='system'?`<div class="system-msg">${esc(m.text)}</div>`:`<div class="message ${m.from==='me'?'outgoing':''}" data-message="${m.id}" data-provider="${m.ai?.provider||'local'}">${contactAvatar(m.from)}<div class="message-content">${(rooms[room].members.length>2)&&m.from!=='me'?`<small class="sender">${people[m.from].name}</small>`:''}${m.type==='voice'?voiceBubble(m):`<button class="bubble ${m.type} ${m.from==='me'?'mine':''}" data-action="message" data-mid="${m.id}">${preview(m)}</button>`}${m.actualSpeaker?`<small class="origin">${people[m.actualSpeaker].name}借用此设备</small>`:''}${m.origin?`<small class="origin">转发自 ${esc(rooms[m.origin.room]?.name??'聊天记录')} · ${people[m.origin.from]?.name||'系统'}</small>`:''}</div></div>`).join('')}</div>${state.replyInFlight?.room===room&&!state.ending?`<div class="typing-indicator" role="status" aria-live="polite">${esc(people[state.replyInFlight.who].name)}正在输入<span aria-hidden="true">…</span></div>`:''}${chatTools()}`;}
function chatTools(){
 if(state.ending)return `<footer class="review-footer"><span>会话记录 · 只读</span>${button('返回结局','end')}</footer>`;
 return `${quote?`<div class="quote-draft">引用：${esc(quoteText(quote))}${button('×','unquote','aria-label="取消引用"')}</div>`:''}<footer class="composer">${button(designIcon('voice'),'voicemenu','aria-label="语音选项"')}<textarea id="draft" rows="1" aria-label="消息输入">${esc(draft)}</textarea>${button(designIcon('sticker'),'stickers','aria-label="表情"')}${draft.trim()?button('发送','send','','send'):button(designIcon('chat-add'),'plus','aria-label="更多功能"')}</footer>${panel==='replies'?`<section class="quick-replies" aria-label="可选回复">${suggestions().map(t=>button(esc(t),'suggest',`data-text="${esc(t)}"`)).join('')}</section>`:panel==='stickers'?`<section class="sticker-panel">${stickers.map((t,i)=>button(sticker(i),'sticker',`data-value="${i}" aria-label="${t}表情"`)).join('')}<div class="emoji-line">${['👍','❤️','😭','😅','👀','🙏'].map(t=>button(t,'emoji',`data-text="${t}"`)).join('')}</div></section>`:panel==='plus'?`<section class="plus-panel">${[['chat','可选回复','replies'],['file','文件','files'],['pin','位置','location'],['phone','语音通话','call'],['star','收藏','favorites'],['people','发起群聊','newgroup'],['lock','门锁','lock']].map(([i,t,a])=>button(`<span>${icon(i,27)}</span><small>${t}</small>`,a)).join('')}</section>`:''}`;
}
function directoryRow(label,action,leading='',detail='',attributes=''){
 return button(`${leading}<span class="directory-label">${esc(label)}</span>${detail?`<small>${detail}</small>`:''}${designIcon('chevron')}`,action,attributes);
}
function directoryGroup(title,rows){
 return `<section class="directory-group"><h2 data-directory-section="${title}">${title}</h2><div class="directory-rows">${rows.join('')}</div></section>`;
}
function directoryIcon(glyph){
 return `<span class="directory-icon directory-icon-${glyph}">${icon(glyph,19)}</span>`;
}
function contacts(){
 const row=(id,label,leading=avatar(id))=>directoryRow(label,rooms[id]?.members.length>2?'chat':'contactCard',leading,'',`data-room="${id}"`);
 const contactsBySection=party?{C:['lin'],L:['lan','zhou'],X:['wei','rui'],Z:['yi']}:{C:['lin'],L:['lan','zhou']};
 for(const id of backgroundIds)(contactsBySection[backgroundContacts[id].section]??=[]).push(id);
 const sections=Object.keys(contactsBySection).sort();
 const contactGroups=sections.map(section=>directoryGroup(section,contactsBySection[section].map(id=>row(id,roomTitle(id))))).join('');
 const index=`<aside class="directory-index" aria-label="按首字母查找联系人">${sections.map(section=>button(section,'contactSection',`data-value="${section}" aria-label="跳到 ${section}"`)).join('')}</aside>`;
 const shortcuts=[
  ['新的朋友','newFriends','people','orange'],
  ['仅聊天的朋友','chatOnly','chat','orange'],
  ['群聊','groupDirectory','people','green'],
  ['标签','contactTags','star','blue'],
  ['公众号','publicAccounts','file','blue'],
  ['服务号','serviceAccounts','chat','cyan'],
  [party?'生日聚会的朋友':'企业微讯联系人','workContacts','people','blue']
 ];
 const top=shortcuts.map(([label,action,glyph,color])=>directoryRow(label,action,`<span class="contact-tile ${color}">${icon(glyph,24)}</span>`)).join('');
 const search=wideSearch('contactSearch','搜索联系人');
 const add=state.ending?'':button(icon('personAdd',25),'newFriends','aria-label="添加朋友"');
 const work=party?'':directoryGroup('我的企业',[directoryRow('旧厂房园区撤场组','workContacts',`<span class="contact-tile blue">${icon('people',24)}</span>`)]);
 return `${tabHeader('通讯录',add)}${search}<div class="contacts-body"><div class="directory contacts-directory"><div class="directory-rows contact-shortcuts">${top}</div>${work}${contactGroups}</div>${index}</div>${nav()}`;
}
function discover(){
 const row=(glyph,label,action,detail='',attributes='')=>directoryRow(label,action,`<img class="discover-icon" src="./assets/weixun/discover-${glyph}.png" alt="">`,detail,attributes);
 const chatRow=(glyph,id,label,detail='')=>row(glyph,label,'chat',detail,`data-room="${id}"`);
 const groups=[
  [row('hint','朋友圈','moments'),directoryRow('当前提示','hint',directoryIcon('star'))],
  [chatRow('group','old',rooms.old.name,`${avatar('old')}<span>群聊</span>`)],
  [row('sound','氛围声音','settings',soundscape.enabled?'已开启':'已关闭')],
  [row('search','搜索消息','search')],
  [row('settings','会话设置','settings')],
  [row('saves','存档与重试','saves')],
  [row('about','关于本次会话','about')]
 ];
 const actions=searchButton()+(state.ending?'':groupButton());
 return `${tabHeader('发现',actions)}<div class="directory discover-directory">${groups.map(rows=>`<div class="directory-rows">${rows.join('')}</div>`).join('')}</div>${nav()}`;
}
function contactAvatar(id){
 return id==='me'?avatar(id):button(avatar(id),'contactCard',`data-room="${id}" aria-label="查看${esc(roomTitle(id))}的资料"`,'profile-avatar-button');
}
function sideHeader(title){
 return `<header class="chat-header">${button(designIcon('back'),'sideBack','aria-label="返回上一页"')}<h1>${title}</h1><span class="side-header-space"></span></header>`;
}
function momentEntry(id,extra=''){
 return directoryRow('朋友圈','moments',`<img class="discover-icon" src="./assets/weixun/discover-hint.png" alt="">`,extra,`data-room="${id}"`);
}
function contactCard(){
 const id=viewedContact,profile=profiles[id]??backgroundContacts[id],name=roomTitle(id);
 const photos=moments.filter(post=>post.author===id&&post.photo!=null).slice(0,5);
 const thumbnails=`<span class="card-moment-strip">${photos.map(post=>momentPhoto(post)).join('')}</span>`;
 const actions=id==='me'?'':`<div class="directory-rows card-actions">${button(`${icon('chat',20)}发消息`,'profileMessage')}${!isBackground(id)&&!state.ending?button(`${icon('phone',20)}语音通话`,'profileCall'):''}</div>`;
 return `<header class="chat-header">${button(designIcon('back'),'sideBack','aria-label="返回上一页"')}<h1 class="unread-label">联系人资料</h1>${button(icon('more'),'friendDetails','aria-label="更多联系人资料"')}</header><div class="directory contact-card">
  <div class="profile">${avatar(id)}<div><h2>${name}</h2><small>${profile.handle?`微讯号：${esc(profile.handle)}`:esc(profile.note)}</small>${profile.signature?`<p>${esc(profile.signature)}</p>`:''}</div></div>
  <div class="directory-rows friend-details">${directoryRow('朋友资料','friendDetails','',esc(profile.note))}</div>
  <div class="directory-rows card-moments">${directoryRow('朋友圈','moments','',thumbnails,`data-room="${id}"`)}</div>
  ${actions}
 </div>`;
}
const photoLabels=['纸箱里的猫','土豆烧冬瓜盒饭','冰化了的饮料','雨后的阳台薄荷'];
function momentPhoto(post,large=false){
 return `<span class="moment-photo moment-photo-${post.photo}${large?' large':''}" role="img" aria-label="${photoLabels[post.photo]}"></span>`;
}
function momentCard(post){
  const liked=!!state.chatUi?.momentLikes?.[post.id];
  const likes=[...(post.likes??[]).map(roomTitle),...(liked?['我']:[])];
  const author=post.author==='me'?`<span class="moment-author">${party?'我':'撤场统筹'}</span>`:button(roomTitle(post.author),'contactCard',`data-room="${post.author}"`,'moment-author');
  const photo=post.photo==null?'':button(momentPhoto(post),'momentPhoto',`data-value="${post.id}" aria-label="查看大图：${photoLabels[post.photo]}"`,'moment-photo-button');
  const replies=likes.length||post.comments?.length?`<div class="moment-replies">${likes.length?`<p class="moment-likes">♡ ${likes.join('、')}</p>`:''}${(post.comments??[]).map(([who,text])=>`<p><b>${roomTitle(who)}：</b>${esc(text)}</p>`).join('')}</div>`:'';
  return `<article class="moment">${contactAvatar(post.author)}<div class="moment-copy">${author}<p>${esc(post.text)}</p>${photo}
  <div class="moment-meta"><time>${post.time}</time>${button(liked?'♥ 已赞':'♡ 赞','momentLike',`data-value="${post.id}" aria-pressed="${liked}"`,'moment-like')}</div>${replies}</div></article>`;
}
const albumDates={'昨天':['十一月','17'],'前天':['十一月','16'],'三天前':['十一月','15']};
function momentsPage(){
 if(!momentsOwner)return `${sideHeader('朋友圈')}<div class="directory moments-feed">${moments.map(momentCard).join('')}</div>`;
 const name=roomTitle(momentsOwner);
 const posts=moments.filter(post=>post.author===momentsOwner);
 const profile=profiles[momentsOwner]??backgroundContacts[momentsOwner];
 const signature=momentsOwner==='me'?state.chatUi?.profileStatus||profile.signature:profile.signature;
 return `<div class="directory moments-album" aria-label="${esc(name)}的朋友圈">
  <div class="album-toolbar">${button(designIcon('back'),'sideBack','aria-label="返回上一页"')}</div>
  <div class="album-cover">
   <div class="album-identity"><h1>${esc(name)}</h1>${avatar(momentsOwner)}</div>
  </div>
  <p class="album-signature">${esc(signature)}</p>
  <div class="album-posts">${posts.map((post,index)=>{
   const day=post.time.split(' ')[0];
   const [month,date]=albumDates[day]??['',day];
   const sameDay=posts[index-1]?.time.startsWith(day+' ');
   const photo=post.photo==null?'':momentPhoto(post);
   const caption=`<span class="album-caption">${esc(post.text)}</span>`;
   return `<article class="album-row">
    <div class="album-date">${sameDay?'':`<span>${month}</span><strong>${date}</strong>`}</div>
    ${button(photo+caption,'momentDetail',`data-value="${post.id}"`,'album-post')}
   </article>`;
  }).join('')||'<p class="moment-empty">暂无动态</p>'}</div>
 </div>`;
}
function momentDetail(){
 const post=moments.find(post=>post.id===viewedMoment);
 return `${sideHeader('详情')}<div class="directory moments-feed">${momentCard(post)}</div>`;
}
const chatRecords=id=>[...(priorChats[id]??[]),...roomMessages(id)].filter(m=>m.from!=='system');
function recordDay(m){
 return m.id.startsWith('prior-')||m.id.startsWith('history-')?(m.time?.match(/^(前天|昨天|星期[一二三四五六日])/)?.[0]??'昨天'):'今天';
}
function chatRecordResults(id,filters){
 const term=(filters.term??'').trim().toLocaleLowerCase();
 const records=chatRecords(id).filter(m=>(!filters.day||recordDay(m)===filters.day)&&(!filters.type||m.type===filters.type)&&(!term||short(m).toLocaleLowerCase().includes(term))).reverse();
 return records.map(m=>button(`<small>${roomTitle(m.from)} · ${m.time??stamp(m.tick)}</small>${esc(short(m))}`,'searchMessage',`data-mid="${m.id}" data-room="${id}"`,'favorite')).join('')||'<p class="muted">没有符合条件的消息</p>';
}
function chatRecordDialog(filters){
 const id=filters.room;
 const days=[...new Set(chatRecords(id).reverse().map(recordDay))];
 const types=[['text','文字'],['file','文件'],['voice','语音'],['location','位置'],['sticker','表情'],['call','通话']];
 const options=(items,selected)=>items.map(([value,label])=>`<option value="${value}"${value===selected?' selected':''}>${label}</option>`).join('');
 return `<h2>查找聊天记录</h2><input class="search-field" id="room-search" placeholder="搜索关键词" aria-label="搜索当前会话" value="${esc(filters.term??'')}">
 <div class="record-filters"><label>日期 <select id="room-search-day">${options([['','全部日期'],...days.map(day=>[day,day])],filters.day)}</select></label><label>类型 <select id="room-search-type">${options([['','全部类型'],...types],filters.type)}</select></label></div>
 <div id="room-search-results" class="record-results">${chatRecordResults(id,filters)}</div>${button('关闭','close','','wide')}`;
}
function me(){
 return `<div class="directory profile-directory" aria-label="我">
 <div class="profile">${avatar('me')}<div><h2>${party?'我':'撤场统筹'}</h2><small>微讯号：night_shift_03</small>${button(esc(state.chatUi?.profileStatus||'＋ 状态'),'editStatus','','profile-status')}</div></div>
 <div class="directory-rows">${directoryRow('服务','serviceAccounts',directoryIcon('chat'))}</div>
 <div class="directory-rows">
  ${directoryRow('收藏','favorites',directoryIcon('star'),state.evidence.length?`${state.evidence.length} 条`:'')}
  ${momentEntry('me')}
  ${directoryRow('线索','clueDirectory',directoryIcon('pin'))}
  ${directoryRow('聊天文件','files',directoryIcon('file'))}
  ${directoryRow('表情','stickerAlbum',directoryIcon('smile'))}
 </div>
 <div class="directory-rows">${directoryRow('设置','settings','<img class="settings-icon" src="./assets/weixun/settings.png" alt="">','','aria-label="会话设置"')}</div></div>${nav()}`;
}
function contactToolContent(kind){
 const contacts=id=>directoryRow(roomTitle(id),'contactCard',avatar(id),'',`data-room="${id}"`);
 const close=button('返回','close','','wide');
 if(kind==='groupDirectory'){
  const groups=activeGroupIds(state).map(id=>directoryRow(roomTitle(id),'chat',avatar(id),'',`data-room="${id}"`)).join('');
  return `<h2>群聊</h2><div class="directory-rows">${groups}</div>${state.ending?'':button('发起群聊','newgroup','','wide')}${close}`;
 }
 if(kind==='newFriends')return `<h2>新的朋友</h2><p class="muted">暂无新的好友申请</p>${button('搜索联系人','contactSearch','','wide')}${close}`;
 if(kind==='chatOnly'||kind==='contactTags'||kind==='workContacts'){
  const title={chatOnly:'仅聊天的朋友',contactTags:'标签',workContacts:party?'生日聚会的朋友':'企业微讯联系人'}[kind];
  const ids={chatOnly:['guo','wen'],contactTags:['dad','mom','lan','lin','zhou'],workContacts:npcIds}[kind];
  return `<h2>${title}</h2><div class="directory-rows">${ids.map(contacts).join('')}</div>${close}`;
 }
 if(kind==='publicAccounts')return `<h2>公众号</h2><p>${party?'旧商业楼自助聚会馆':'旧厂房园区'}</p><p class="muted">${party?'订房信息与闭馆告示。':'园区活动和展览通知。'}</p>${close}`;
 if(kind==='serviceAccounts')return `<h2>${party?'场馆服务':'园区服务'}</h2>${button(party?'场馆地图':'园区位置','map','','wide')}${button('聊天文件','files','','wide')}${close}`;
 return '';
}
function dialogContent(){
 if(state.pending){const p=state.pending;return `<h2>${p.kind==='open'?'允许门外的人进入？':p.kind==='abandon'?'不等朋友，提前离开？':'离开 B03 去会合？'}</h2><p>${p.kind==='open'?'你将主动解开反锁。请先核对门外身份。':p.kind==='abandon'?'你将独自结束救援。本次选择会被记录。':'先确认同伴的位置，再离开房间。'}</p><div class="dialog-actions">${button('取消','cancel')}${button('确认'+(p.kind==='open'?'开门':p.kind==='abandon'?'提前离开':'出门'),'confirm','','danger')}</div>`;}
 if(!modal)return '';
 const m=modal;
 const contactTool=contactToolContent(m.kind);
 if(contactTool)return contactTool;
 if(m.kind==='friendDetails'){
  const profile=profiles[viewedContact]??backgroundContacts[viewedContact];
  return `<h2>朋友资料</h2><p>${esc(profile.note)}</p>${profile.signature?`<p>${esc(profile.signature)}</p>`:''}${button('返回','close','','wide')}`;
 }
 if(m.kind==='editStatus')return `<h2>状态</h2><input id="profile-status" class="search-field" type="text" maxlength="24" placeholder="写下此刻的状态" aria-label="状态" value="${esc(state.chatUi?.profileStatus??'')}">${button('保存','saveStatus','','primary wide')}${button('取消','close','','wide')}`;
 if(m.kind==='clueDirectory')return `<h2>线索</h2>${button(party?'场馆地图':'园区位置','map','','wide')}${button('门锁面板','lock','','wide')}${button('返回','close','','wide')}`;
 if(m.kind==='stickerAlbum')return `<h2>表情</h2><div class="sticker-album">${stickers.map((_,i)=>sticker(i)).join('')}</div>${button('返回','close','','wide')}`;
 if(m.kind==='hint')return `<h2>当前提示</h2><p>${esc(objective(state))}</p><p class="muted">阅读和查看提示不会推进危险。</p>${button(view==='discover'?'返回发现':'返回聊天','close','','primary wide')}`;
 if(m.kind==='about')return `<h2>本次会话</h2><p>《别发到群里》${party?`生日散场篇 · 试玩版 ${PARTY_PLAYTEST_BUILD}`:'v1.3.3 公开试玩版'}</p><p>微信式架空通信软件。人物、文件、位置和门码均为游戏内容；不使用真实联系人或 GPS。</p><p>音频为本机合成语音与原创环境声，待真人录音替换。完整字幕可静音游玩。</p><p>节奏由重要行动推进，15—20 分钟尚待真人计时试玩。</p>${button('返回','close','','primary')}`;
 if(m.kind==='file'){const f=files[m.value];return `<div class="preview-header">${icon('file',36)}<h2>${esc(f.name)}</h2></div><small>${esc(f.version)}<br>来源：${esc(f.source)}</small>${m.value==='map'?mapSvg():''}<pre>${esc(f.text)}</pre>${!party&&(m.value==='false'||m.value==='repair')?`<details><summary>版本与来源对照</summary><p>原图：建筑关系，未确认通行。<br>维修通知：北口吊装、西梯断电。<br>新路线：声称西梯可用，来源为春哥账号。<br>需向老潘请求现场核实。</p></details>`:''}<div class="dialog-actions">${!state.ending?button('转发','forward',`data-mid="${m.mid}"`)+(party?button('转发截图','capture',`data-mid="${m.mid}"`):'')+button('收藏','save',`data-mid="${m.mid}"`):''}${button('关闭','close')}</div>`;}
 if(m.kind==='message'){
  const msg=state.messages.find(x=>x.id===m.mid);
  if(isMessageSheet()){
   const target=`data-mid="${msg.id}"`;
   return `<p class="sheet-preview">${esc(short(msg))}</p><div class="sheet-actions">${button('引用','quote',target)}${button('转发','forward',target)}${party?button('转发截图','capture',target):''}${button('收藏','save',target)}</div>${button('取消','close','','sheet-cancel')}`;
  }
  const sample=msg.type==='capture'?`<h2>聊天截图</h2><pre>${esc(msg.text)}</pre>`:msg.type==='voice'||msg.type==='call'
   ?`<h2>${msg.type==='voice'?'语音字幕':'通话记录'}</h2>${renderTranscript(msg.type==='voice'?voices[msg.value].text:msg.text)}`
   :`<p class="message-sample">${esc(short(msg))}</p>`;
  return `${sample}${msg.type==='voice'?button('▶ 回放语音','play',`data-mid="${msg.id}"`):''}${!state.ending?`<div class="dialog-actions">${button('引用','quote',`data-mid="${msg.id}"`)}${button('转发','forward',`data-mid="${msg.id}"`)}${button('收藏','save',`data-mid="${msg.id}"`)}</div>`:''}${button('关闭','close','','wide')}`;}
 if(m.kind==='forward')return `<h2>选择发送给</h2><p class="muted">${m.capture?'截图会带上原消息可见内容。':'内容：'}${esc(short(state.messages.find(x=>x.id===m.mid)))}</p>${[...activeGroupIds(state),...npcIds].map(id=>button(`${avatar(id)} ${esc(rooms[id].name)}`,'target',`data-room="${id}" data-mid="${m.mid}"`,'contact')).join('')}${button('取消','close','','wide')}`;
 if(m.kind==='forwardConfirm')return `<h2>发送给 ${esc(rooms[m.target].name)}</h2><p>${m.capture?'发送截图 · ':''}${esc(short(state.messages.find(x=>x.id===m.mid)))}</p><div class="dialog-actions">${button('取消','close')}${button('确认发送','forwardSend',`data-room="${m.target}" data-mid="${m.mid}"`,'primary')}</div>`;
 if(m.kind==='members'){const id=m.room||room;
 if(isBackground(id))return `<h2>${esc(roomTitle(id))}</h2><div class="members"><div>${contactAvatar(id)}<small>${backgroundContacts[id].note}</small></div></div>${button('查找聊天记录','roomSearch','','wide')}${button('返回','close','','wide')}`;
 return `<h2>${esc(rooms[id].name)}</h2><div class="members">${rooms[id].members.map(p=>`<div>${contactAvatar(p)}<small>${people[p].name}</small></div>`).join('')}</div><p class="muted">群内消息会送达以上每个账号。账号所在的设备不等于本人位置。</p>${button('查找聊天记录','roomSearch','','wide')}${(party?npcIds.includes(id):id==='lin')&&!state.ending?button('屏蔽来电','block','','wide'):''}${party&&state.groups[id]&&!state.ending?button('编辑群成员和群名','partyEdit',`data-room="${id}"`,'wide'):''}${view==='chat'&&!state.ending?button('查看当前提示','hint','','wide')+button('会话设置','settings','','wide'):''}${button('返回','close','','wide')}`;}
 if(party&&m.kind==='newgroup'){
  const selected=m.members??[];
  return `<h2>${m.edit?'编辑群聊':'发起群聊'}</h2><p>至少选择两位联系人。每条消息按发送时的成员送达。</p>
   <label class="field">群名<input id="party-group-name" type="text" class="search-field" maxlength="20" value="${esc(m.name??'')}" placeholder="临时群聊"></label>
   <div class="group-candidates party-group-candidates">${npcIds.map(id=>button(`${avatar(id)}<span>${people[id].name}</span>`,'partyMember',`data-value="${id}" aria-pressed="${selected.includes(id)}"`,'group-candidate')).join('')}</div>
   ${button(m.edit?'保存群聊':'建立群聊','partyGroup',selected.length<2?'disabled':'','primary wide')}${button('取消','close','','wide')}`;
 }
 if(m.kind==='newgroup'){
  const selected=m.group??'safe',existing=activeGroupIds(state).includes(selected);
  const choices=newGroupIds.map(id=>{
   const members=rooms[id].members.filter(x=>x!=='me');
   const faces=members.map(x=>avatar(x)).join('');
   const names=members.map(x=>people[x].name).join('、');
   return button(`<span class="group-candidate-faces">${faces}</span><span>${names}</span>`,'selectGroup',`data-value="${id}" aria-label="${names}" aria-pressed="${selected===id}"`,'group-candidate');
  }).join('');
  return `<h2>发起群聊</h2><p>选择两位联系人。群消息会送达所选账号。</p><div class="group-candidates">${choices}</div>${button(`${existing?'打开':'建立'}「${rooms[selected].name}」`,'createGroup',`data-value="${selected}"`,'primary wide')}${button('取消','close','','wide')}`;
 }
 if(m.kind==='files')return `<h2>聊天文件</h2>${[...new Set(state.messages.filter(x=>x.type==='file').map(x=>x.value))].map(id=>{const msg=state.messages.find(x=>x.value===id&&x.type==='file');return button(`${icon('file')} ${files[id].name}`,'file',`data-value="${id}" data-mid="${msg.id}"`,'file-row');}).join('')}${button('取消','close','','wide')}`;
 if(m.kind==='favorites')return `<h2>收藏</h2>${state.evidence.length?state.evidence.map(id=>{const msg=state.messages.find(x=>x.id===id);return button(`<b>${esc(short(msg))}</b><small>来源：${esc(rooms[msg.room]?.name??'聊天记录')} / ${people[msg.from]?.name||'系统'}</small>`,'message',`data-mid="${id}"`,'favorite');}).join(''):'<p class="muted">打开消息菜单或文件预览，可收藏证据。</p>'}${button('返回','close','','wide')}`;
 if(m.kind==='location')return `<h2>位置</h2><p>发送给：${esc(rooms[room].name)}</p>${mapSvg()}<label class="field">地点<select id="location-value" aria-label="地点"><option value="area">B 楼附近（${party?'大致点位':'仅园区点位'}）</option><option value="room">B 楼二层 B03（准确房间）</option><option value="east">东门外</option><option value="south">${party?'后院门':'南侧服务门'}</option></select></label><div class="dialog-actions">${button('发送地点','sendLocation')}${button('共享位置','shareLocation')}</div>${state.sharedSelf?.[room]?button('结束我在本会话的共享','stopSelf','','wide danger'):''}<p class="muted">发送地点是固定卡片。共享位置会随游戏内设备移动更新；停止后不删除旧信息。这里不读取真实 GPS。</p>${button('取消','close','','wide')}`;
 if(m.kind==='locationConfirm')return `<h2>${m.share?'共享位置':'发送地点'}</h2><p>发送给：${esc(rooms[room].name)}</p><p>${esc(m.label)}</p>${button('确认发送','locationSend','','primary wide')}${button('取消','close','','wide')}`;
 if(m.kind==='locationView'){const msg=state.messages.find(x=>x.id===m.mid);const publicLan=msg.value==='public';const shared=msg.isShared||publicLan;const active=publicLan?state.shared.old:state.sharedSelf?.[msg.room]&&(!party||state.shares[msg.room]?.messageId===msg.id);return `<h2>${shared?'共享位置':'地点'}</h2><p>${esc(shared?publicLan?(party?`${people[msg.from].name}的设备：${msg.lastLocation}`:`老潘的设备：${active?state.positions.lan:msg.lastLocation||'展厅'}`):msg.lastLocation:msg.text)}</p>${mapSvg()}<p class="muted">${shared?active?'共享中 · 设备点位随关键行动更新':'共享已结束 · 记录保留':'固定地点卡片 · 不随设备移动'}<br>来源：${esc(rooms[msg.room]?.name??'聊天记录')} / ${people[msg.from].name}</p>${shared&&msg.from==='me'&&active?button('结束我在本会话的共享','stopSelf','','wide danger'):''}${button('返回','close','','wide')}`;}
 if(party&&m.kind==='map')return `<h2>旧商业楼出口图</h2>${mapSvg()}<p>我的位置：${esc(state.positions.me)}</p>
 <p>东门经后场。后院门经侧楼梯。具体通行情况请联系现场同伴。</p>${button('返回','close','','wide')}`;
 if(m.kind==='map')return `<h2>园区设备位置</h2>${mapSvg()}<p>我的设备：${state.positions.me}<br>老潘的设备：${state.positions.lan}<br>${state.shared.old?'原群共享：老潘仍在公开位置':'老潘已结束旧群共享'}</p>${room==='lin'||room==='old'?`<p>春哥账号设备：${state.positions.linPhone}</p>`:''}<p class="muted">位置只代表设备。具体房间需由文字或准确地点卡片确认。</p>${button('返回','close','','wide')}`;
 if(m.kind==='lock'&&state.ending)return `<h2>B03 · 门锁记录</h2><p>会话已结束，不能再操作门锁。</p><p>临时门码：${state.codeValid?'有效':'已作废'}</p>${button('返回','close','','wide')}`;
 if(party&&m.kind==='lock'){
  const record=state.messages.find(x=>x.type==='file'&&x.value==='handoff'&&x.room==='me');
  return `<h2>B03 · 内侧智能门锁</h2><p>${state.exited?'你已离开房间。':'门已反锁。外侧需要有效临时访客码。'}</p>
  <p>当前访客码：${state.codeValid?esc(state.case.shelter.code):'已作废'}</p>
  ${button('查看门锁说明','file',`data-value="handoff" data-mid="${record.id}"`,'wide')}
  ${state.exited?'':button('作废临时访客码','resetCode','','wide')+button('允许门外的人进入','openDoor','','wide danger')+button('出门会合','leave','','wide')+button('提前离开','abandon','','wide')}
  ${button('返回','close','','wide')}`;
 }
 if(m.kind==='lock')return `<h2>B03 · 内侧门锁</h2><p>${state.exited?'你已离开房间。':'门已反锁。外侧需要有效临时门码或内侧开门。'}</p><p>临时门码：${state.codeValid?'有效':'已作废'}</p>${button('作废临时门码','resetCode','','wide')}${button('允许门外的人进入','openDoor','','wide danger')}${button('离开房间去会合','leave','','wide')}${button('返回','close','','wide')}`;
 if(m.kind==='saves')return `<h2>会话存档</h2><p class="muted">当前位置自动保存。重试会回滚此后的消息、知识和行动。</p>${state.checkpoints.map((cp,i)=>button(cp.label,'retry',`data-value="${i}"`,'wide')).join('')||'<p>还没有到达检查点。</p>'}${button('重新开始','restartConfirm','','wide danger')}
 ${research?button('本地试玩记录','playtest','','wide'):''}
 ${party?`${playtest?'':`<p>Seed ${state.seed}</p>`}${hasLegacy()?`<a href="${partyLink}">继续旧版撤场存档</a>`:''}`:`<a href="${partyLink}">开始新版生日散场</a>`}${button('返回','close','','wide')}`;
 if(party&&m.kind==='restartConfirm')return playtest
  ?`<h2>开始一局生日散场</h2><p>当前会话会被替换。${research?'请先导出本局记录。':'如需保留记录，请先交给主持人。'}</p>${button('重玩相同局面','sameSeed','','wide')}${button('开始另一局','restart','','wide danger')}${button('取消','close','','wide')}`
  :`<h2>开始一局生日散场</h2><p>本版当前会话会替换。Seed 可用于重现初始局面。</p>
 <label class="field">Seed<input id="party-seed" class="search-field" inputmode="numeric" maxlength="10" placeholder="${state.seed}"></label>
 ${button('使用输入的 Seed','seedRestart','','wide')}${button('同 Seed 重玩','sameSeed','','wide')}${button('重新随机','restart','','wide danger')}${button('取消','close','','wide')}`;
 if(m.kind==='restartConfirm')return `<h2>重新开始本次会话？</h2><p>当前进度会被新局替换。</p>${button('重新开始','restart','','wide danger')}${button('取消','close','','wide')}`;
 if(m.kind==='playtest'&&research&&playtest){
  const data=playtest.report();
  return `<h2>本地试玩记录</h2><p>${esc(data.build)} · AI ${esc(data.aiBuild??PARTY_AI_BUILD)} · 剧情修订 ${data.storyRevision}</p><p>开始于 ${esc(new Date(data.startedAt).toLocaleString('zh-CN'))}，已记录 ${data.timeline.length} 个操作或事件。</p>
   ${button('导出 JSON','exportPlaytest','','primary wide')}${button('返回存档','saves','','wide')}`;
 }
 if(m.kind==='settings')return `<h2>会话设置 · 已暂停</h2><p class="muted">阅读和暂停都不会推进危险。语音均有完整字幕。</p>${button(soundscape.enabled?'关闭氛围声音':'开启氛围声音','sound',`aria-pressed="${soundscape.enabled}"`,'wide')}<label class="field">总音量 <input id="volume" type="range" min="0" max="1" step=".05" value="${volume}"></label><label class="field">环境底噪 <input id="ambience-volume" type="range" min="0" max="1" step=".05" value="${soundscape.prefs.ambience}"></label><label class="field">事件音效 <input id="effects-volume" type="range" min="0" max="1" step=".05" value="${soundscape.prefs.effects}"></label><p class="muted">设置中暂停环境声，语音播放时背景自动降低。</p>${button('试听声音（30秒）','soundPreview','','wide')}${button('存档与重试','saves','','wide')}<label class="field checkbox-field"><input id="ai" type="checkbox" ${ai?'checked':''}>角色自然对话</label><p class="muted" id="api-status">${apiStatus==='api-configured'?apiConnectedText:apiStatus==='local-fallback'?'当前使用本地回复，仍可完整游玩。':'正在确认自然对话状态……'}</p>${research?`<section class="host-api-settings"><h3>主持人设置</h3><label class="field">DeepSeek API Key<input id="npc-api-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${hasNpcApiKey()?'本次浏览器会话已配置':'输入后仅用于本次浏览器会话'}"></label><p class="muted">Key 不写入游戏存档、试玩记录、服务器数据库或仓库；关闭浏览器会话后清除。请勿让试玩者查看此页。</p>${button(hasNpcApiKey()?'替换本次会话 Key':'启用自然对话','saveNpcApiKey','','wide')}${hasNpcApiKey()?`${button('进入普通试玩界面','enterPlaytest','','primary wide')}${button('清除本次会话 Key','clearNpcApiKey','','wide danger')}`:''}</section>`:''}${button('继续会话','close','','primary wide')}`;
 if(m.kind==='debug')return `<h2>事件与规则状态</h2><pre>${esc(JSON.stringify({...state,messages:state.messages.length,checkpoints:state.checkpoints.map(x=>x.label)},null,2))}</pre>${button('返回','close','','wide')}`;
 if(m.kind==='roomSearch')return chatRecordDialog(m);
 if(m.kind==='momentPhoto'){const post=moments.find(post=>post.id===m.post);return `<h2>${photoLabels[post.photo]}</h2>${momentPhoto(post,true)}${button('关闭','close','','wide')}`;}
 if(m.kind==='contactSearch')return `<h2>搜索联系人</h2><input class="search-field" id="contact-search" placeholder="姓名或备注" aria-label="姓名或备注"><div id="contact-results" class="directory-rows"></div>${button('关闭','close','','wide')}`;
 if(m.kind==='search')return `<h2>搜索聊天记录</h2><input class="search-field" id="search" placeholder="输入关键词" aria-label="搜索关键词"><div id="search-results"></div>${button('关闭','close','','wide')}`;
 return '';
}
function callControl(label,action,glyph,kind,extra=''){
 return button(`<span class="call-control-icon">${icon(glyph,28)}</span><small>${label}</small>`,action,extra,`call-control ${kind}`);
}
function callScreen(){
 const call=state.call;
 if(!call||callMin)return '';
 const incoming=call.status==='incoming';
 const name=people[call.who].name;
 const transcript=call.transcript??(call.voice?voices[call.voice].text:call.who==='zhou'?'老金：我在园区外的车里。':'老潘：我还在找春哥，找到后联系你。');
 return `<section class="call-screen" role="dialog" aria-modal="true" aria-label="${incoming?'语音来电':'语音通话'}">
  <div class="call-top">${button(icon('minimize',22),'callmin','aria-label="返回聊天" title="最小化通话"')}</div>
  <div class="call-identity">${avatar(call.who)}<h2>${name}</h2><p>${incoming?'邀请你进行语音通话…':'语音通话中'}</p></div>
  ${incoming?'':`<div class="call-transcript">${renderTranscript(transcript)}${call.voice?button('重听','callplay','aria-label="重听通话语音"'):''}</div>`}
  <div class="call-actions ${incoming?'call-incoming':'call-active'}">
  ${incoming?
    callControl('拒绝','hangup','phone','hangup')+callControl('接听','answer','phone','answer'):
    callControl('静音','mute','quiet','secondary',`aria-pressed="${callAudio.muted}" title="静音通话声音"`)+
    callControl('挂断','hangup','phone','hangup')+
    callControl('扬声器','speaker','speaker','secondary',`aria-pressed="${callAudio.speaker}" title="切换游戏内外放音量"`)}
  </div>
 </section>`;
}
async function playCallVoice(){
 if(state.call?.voice)await playVoice(state.call.voice,callVolume(),callObserver);
}
function partyResult(){
 const c=state.case;
 const whereabouts=npcIds.map(id=>`${people[id].name} · ${esc(state.people[id].place)}${state.missing.includes(id)?'（未会合）':''}`).join('<br>');
 const nodes=state.nodes.map(node=>`<li>${esc(node.text)}</li>`).join('');
 return `${playtest?'<p>本局答案已写入研究记录，试玩界面不显示。</p>':`<p>Seed <b>${state.seed}</b> · 被冒用账号 <b>${people[c.danger].name}</b></p>`}
 <details><summary>查看人物去向与关键节点</summary><p>${whereabouts}</p>${nodes?`<ul>${nodes}</ul>`:'<p>没有记录到敏感信息泄露。</p>'}</details>`;
}
function endScreen(){const e=endings[state.ending];return `<div class="ending ${state.ending==='C'?'death':''}"><span class="eyebrow">会话结束 · ${state.ending}</span><div class="ending-icon">${icon(state.ending==='C'?'phone':'chat',42)}</div><h2>${e.title}</h2><p>${e.sub}</p><p>${e.body}</p>${!party&&state.ending==='A'?'<div class="last-message">春哥账号 · 撤场小分队<br><b>你们是不是又建了一个群？</b></div>':''}<details><summary>查看这次的行动原因</summary><p>${esc(state.reason)}</p></details>${party?partyResult():''}${research?button('本地试玩记录','playtest','','wide'):''}${button('从检查点重试','saves','','wide')}${button('查看会话记录','review','','wide')}${button('重新开始','restartConfirm','','wide muted')}</div>`;}
let review=false;
function isMessageSheet(){
 return !state.pending&&!state.ending&&modal?.kind==='message'
  &&state.messages.some(m=>m.id===modal.mid&&['text','sticker'].includes(m.type));
}
function desktopToolbar(){
 const paused=modal?.kind==='settings';
 const blocked=state.pending||(modal&&!paused)||(state.call&&!callMin)||(state.ending&&!review);
 const settings=button(icon('settings',18),'desktopSettings',`type="button" aria-label="会话设置" title="会话设置" aria-haspopup="dialog" aria-expanded="${paused}"${blocked?' disabled':''}`,'desktop-settings');
 return `<div class="desktop-toolbar" role="group" aria-label="游戏工具"><span>别发到群里</span>${settings}</div>`;
}
function render(){
 if(!state.flags.welcomed){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)finishOpening();
  else renderOpening();
  return;
 }
 const restoreToolbarFocus=desktopSettingsOpen&&!modal;
 if(restoreToolbarFocus)desktopSettingsOpen=false;
 const sheet=isMessageSheet();
 const albumCover=view==='moments'&&momentsOwner?albumCovers[momentsOwner]??'gray':null;
 soundscape.setScene(state);soundscape.setPaused(document.hidden||['settings','saves','restartConfirm','debug'].includes(modal?.kind));
 const field=document.activeElement?.id==='draft'?document.activeElement:null;
 const selection=field?[field.selectionStart,field.selectionEnd]:null;
 const scroll=document.querySelector('#messages')?.scrollTop;
 app.innerHTML=`${desktopToolbar()}<section class="phone${view==='chat'?' phone-chat':view==='me'||view==='contactCard'?' phone-profile':''}${state.call&&!callMin&&!state.ending?' phone-in-call':''}${albumCover?' phone-moment-album':''}"${albumCover?` data-album-cover="${albumCover}"`:''} aria-label="微讯游戏"><div class="statusbar"><time>${statusTime()}</time><span class="status-icons" aria-hidden="true">${designIcon('signal')}${designIcon('wifi')}${designIcon('battery')}</span></div><div class="screen">${state.call&&callMin?button('◉ 语音通话 · 点此返回','callshow','','call-strip'):''}${view==='list'?list():view==='chat'?chat():view==='contacts'?contacts():view==='discover'?discover():view==='moments'?momentsPage():view==='momentDetail'?momentDetail():view==='contactCard'?contactCard():me()}</div><div class="home-indicator"></div>${state.ending&&!review?endScreen():callScreen()}${state.pending||modal?`<div class="modal-backdrop${sheet?' sheet-backdrop':''}"><section class="dialog${sheet?' message-sheet':''}" role="dialog" tabindex="-1" aria-modal="true" aria-label="${state.pending?'行动确认':sheet?'消息操作':'会话选项'}">${dialogContent()}</section></div>`:''}</section>`;
 if(restoreToolbarFocus)document.querySelector('.desktop-settings')?.focus({preventScroll:true});
 if(view==='chat'){
  const messages=document.querySelector('#messages'),input=document.querySelector('#draft');
  if(input)resizeDraft(input);
  if(render.jumpTo){
   const target=document.querySelector(`[data-message="${CSS.escape(render.jumpTo)}"]`);
   target?.scrollIntoView({block:'center'});
   target?.classList.add('search-hit');
   render.jumpTo=null;
  }else messages.scrollTop=render.bottom?messages.scrollHeight:render.restoreScroll??scroll??messages.scrollHeight;
  render.restoreScroll=null;
  render.bottom=false;
  if(selection&&input&&!modal&&!state.pending){input.focus({preventScroll:true});input.setSelectionRange(...selection);}
  readVisibleChat(messages);
 }else{
  const pane=document.querySelector('.screen .chat-list,.screen .directory');
  if(pane){
   pane.scrollTop=scrollPositions[view]??0;
   if(pane.matches('.moments-album'))pane.classList.toggle('is-scrolled',pane.scrollTop>32);
  }
 }
}
async function send(text=draft,type='text',value=null){
 if(state.ending){toast('会话已结束，当前为只读记录。');return;}
 if(!text.trim()&&type!=='sticker')return;
 if(isBackground(room)){
  state=sendBackgroundMessage(state,room,text.trim(),crypto.randomUUID(),stamp(state.clock));
  draft='';panel=null;storeDraft(state,room,'');render.bottom=true;saveState();render();
  return;
 }
 cancelReply();
 const activeRoom=room,oldQuote=quote,requestRun=state.runId,intentRevision=state.seq,intentEventCount=state.events.length;let startIndex=state.messages.length;draft='';quote=null;if(party)panel=null;storeDraft(state,activeRoom,'');
 let intentCandidates=[],intentDialogue=[],interpreted=false;
 if(ai&&shouldInterpretMessage(text,type)){
  interpreted=true;
  const context=buildIntentContext(state,activeRoom,text,oldQuote?{id:oldQuote.id,from:oldQuote.from,content:short(oldQuote)}:null);
  intentDialogue=context.dialogue;
  const ctrl=new AbortController();controller=ctrl;const timer=setTimeout(()=>ctrl.abort(),7000);
  try{const result=await npcIntent(context,ctrl.signal);if(result.mode==='ai')intentCandidates=result.output?.candidates??[];}catch{}
  finally{clearTimeout(timer);if(controller===ctrl)controller=null;}
  // A reset or restored checkpoint invalidates the interpretation and the unsent draft.
  if(state.runId!==requestRun)return;
  if(state.seq!==intentRevision||state.events.length!==intentEventCount){intentCandidates=[];intentDialogue=[];startIndex=state.messages.length;}
 }
 const next=dispatch(state,{id:crypto.randomUUID(),runId:requestRun,type:'SEND',room:activeRoom,text:text||'[表情]',messageType:type,value,quoteId:oldQuote?.id,quote:oldQuote?quoteText(oldQuote):undefined,intentCandidates,intentDialogue,intentRevision,intentEventCount});
 if(oldQuote&&!party){const own=next.messages.slice(startIndex).find(m=>m.from==='me');if(own)own.quote=short(oldQuote);}
 const staged=stageNpcReply(next,{enabled:ai&&!interpreted,type,room:activeRoom,text,startIndex});
 render.bottom=true;commit(staged.state);
 if(!staged.context){
  if(staged.state.messages.slice(startIndex).some(message=>message.from!=='me'&&message.from!=='system'))playtest?.markRule(interpreted?'INTENT_RULE':'DETERMINISTIC_RULE');
  return;
 }
 const token=state.replyInFlight.token,operation=startReplyRequest(signal=>npcReply(staged.context,signal),replyTimeoutConfig());
 controller=operation.controller;
 const outcome=await operation.visible,result=outcome.result;
 if(controller===operation.controller)controller=null;
 // A retry, new message or another resolution invalidates this reserved turn.
 if(state.replyInFlight?.token===token){
  const settled=settleNpcReply(state,token,result),message=settled.messages.find(item=>item.id===token);
  playtest?.markAi(result,outcome.elapsedMs,message?.ai?.resolution);
  render.bottom=view==='chat'&&room===activeRoom&&nearBottom(document.querySelector('#messages'));commit(settled);
 }else if(state.runId===requestRun)playtest?.markAi(result,outcome.elapsedMs,{status:'discarded',guardStatus:'STATE_CHANGED'});
}

function resizeDraft(input){
 input.style.height='auto';
 input.style.height=Math.min(input.scrollHeight,110)+'px';
}
app.addEventListener('scroll',e=>{
 const pane=e.target;
 if(pane.id==='messages')readVisibleChat(pane);
 else if(pane.matches?.('.screen .chat-list,.screen .directory')){
  scrollPositions[view]=pane.scrollTop;
  if(pane.matches('.moments-album'))pane.classList.toggle('is-scrolled',pane.scrollTop>32);
 }
},true);
app.addEventListener('input',e=>{if(e.target.id==='draft'){draft=e.target.value;const composer=document.querySelector('.composer');const last=composer.lastElementChild;if(draft.trim()&&last.dataset.action!=='send'){last.outerHTML=button('发送','send','','send');}else if(!draft.trim()&&last.dataset.action==='send')last.outerHTML=emptyComposerAction();resizeDraft(e.target);keepDraft();}if(e.target.id==='volume'){volume=Number(e.target.value);soundscape.setLevel('master',volume);}if(e.target.id==='ambience-volume')soundscape.setLevel('ambience',e.target.value);if(e.target.id==='effects-volume')soundscape.setLevel('effects',e.target.value);if(e.target.id==='search'){const term=e.target.value.trim();document.querySelector('#search-results').innerHTML=term?[...backgroundIds.flatMap(roomMessages),...Object.values(priorChats).flat(),...state.messages].filter(m=>short(m).includes(term)).slice(-20).map(m=>button(`<small>${esc(roomTitle(m.room))}</small>${esc(short(m))}`,'searchMessage',`data-mid="${m.id}" data-room="${m.room}"`,'favorite')).join(''):'';}});
app.addEventListener('input',e=>{
 if(e.target.id!=='contact-search')return;
 const term=e.target.value.trim().toLocaleLowerCase();
 const matches=term?[...npcIds,...backgroundIds].filter(id=>{
  const contact=backgroundContacts[id];
  return [roomTitle(id),contact?.note,contact?.section].some(value=>value?.toLocaleLowerCase().includes(term));
 }):[];
 document.querySelector('#contact-results').innerHTML=matches.map(id=>directoryRow(roomTitle(id),'contactCard',avatar(id),backgroundContacts[id]?.note,`data-room="${id}"`)).join('')||(term?'<p>未找到联系人</p>':'');
});
function updateRoomSearch(event){
 if(modal?.kind!=='roomSearch')return;
 const key={'room-search':'term','room-search-day':'day','room-search-type':'type'}[event.target.id];
 if(!key)return;
 modal[key]=event.target.value;
 document.querySelector('#room-search-results').innerHTML=chatRecordResults(modal.room,modal);
}
app.addEventListener('input',updateRoomSearch);
app.addEventListener('change',updateRoomSearch);
app.addEventListener('change',e=>{if(e.target.id==='ai'){ai=e.target.checked;if(!ai)cancelReply();localStorage.setItem('alan-ai-enabled',String(ai));npcApiStatus(undefined,{fresh:true}).then(x=>{apiStatus=ai&&x.configured?'api-configured':'local-fallback';playtest?.setMode(apiStatus);const el=document.querySelector('#api-status');if(el)el.textContent=apiStatus==='api-configured'?apiConnectedText:'当前使用本地回复，仍可完整游玩。';}).catch(()=>{apiStatus='local-fallback';playtest?.setMode(apiStatus);toast('AI 接口不可用，继续本地模式。');});}});
let composing=false;app.addEventListener('compositionstart',()=>composing=true);app.addEventListener('compositionend',()=>composing=false);
app.addEventListener('keydown',e=>{if(e.target.id==='draft'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!composing&&e.keyCode!==229){e.preventDefault();send();}if(e.key==='Escape'){closeModal();if(state.pending)sendEvent({type:'CANCEL'});else render();}});
app.addEventListener('contextmenu',e=>{const bubble=e.target.closest('[data-mid]');if(bubble){e.preventDefault();modal={kind:'message',mid:bubble.dataset.mid};render();}});
app.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,v=b.dataset.value,mid=b.dataset.mid;
 if(state.ending&&['send','suggest','sticker','emoji','newgroup','createGroup','quote','forward','capture','save','location','call','resetCode','openDoor','leave','block'].includes(a)){toast('会话已结束，当前为只读记录。');return;}
 switch(a){
 case 'skipOpening':finishOpening();return;
 case 'dismissOpeningHint':showOpeningHint=false;break;
 case 'contactSection':document.querySelector(`.contacts-directory [data-directory-section="${v}"]`)?.scrollIntoView({block:'start'});return;
 case 'contactCard':if(people[b.dataset.room]||isBackground(b.dataset.room))openSide('contactCard',b.dataset.room);break;
 case 'saveStatus':{
  const ui=state.chatUi??={};ui.profileStatus=document.querySelector('#profile-status').value.trim();saveState();modal=null;break;
 }
 case 'friendDetails':case 'editStatus':case 'clueDirectory':case 'stickerAlbum':case 'newFriends':case 'chatOnly':case 'groupDirectory':case 'contactTags':case 'publicAccounts':case 'serviceAccounts':case 'workContacts':modal={kind:a};break;
 case 'moments':openSide('moments',b.dataset.room);break;
 case 'momentDetail':openSide('momentDetail',v);break;
 case 'sideBack':returnSide();break;
 case 'backToCard':view='contactCard';panel=null;modal=null;if(activeVoice)stopAudio();break;
 case 'profileMessage':
  if(sideHistory.at(-1)?.view==='chat'&&sideHistory.at(-1).room===viewedContact)returnSide();
  else openChat(viewedContact);
  break;
 case 'momentPhoto':modal={kind:'momentPhoto',post:v};break;
 case 'momentLike':{
  const ui=state.chatUi??={};const likes=ui.momentLikes??={};
  likes[v]=!likes[v];saveState();break;
 }
 case 'roomSearch':modal={kind:'roomSearch',room};break;
 case 'chat':if(activeVoice)stopAudio();openChat(b.dataset.room);break;
 case 'list':case 'contacts':case 'discover':case 'me':if(activeVoice)stopAudio();view=a;panel=null;modal=null;break;
 case 'desktopSettings':
  if(modal?.kind==='settings'){closeModal();render();return;}
  desktopSettingsOpen=true;modal={kind:'settings'};render();
  document.querySelector('.dialog')?.focus({preventScroll:true});
  return;
 case 'hint':playtest?.mark('打开当前提示',{chapter:state.chapter});modal={kind:'hint'};break;
 case 'playtest':if(playtest)modal={kind:a};break;
 case 'exportPlaytest':if(playtest)exportPlaytest(playtest.report());break;
 case 'saveNpcApiKey':{
  if(!research)return;
  const input=document.querySelector('#npc-api-key');
  if(!setNpcApiKey(input?.value)){toast('请输入完整的 DeepSeek API Key。');return;}
  try{const status=await npcApiStatus(undefined,{fresh:true});apiStatus=ai&&status.configured?'api-configured':'local-fallback';playtest?.setMode(apiStatus);toast(apiStatus==='api-configured'?'AI 接口已连接。':'接口暂不可用，继续使用本地回复。');}
  catch{apiStatus='local-fallback';playtest?.setMode(apiStatus);toast('接口暂不可用，继续使用本地回复。');}
  break;
 }
 case 'clearNpcApiKey':{
  if(!research)return;
  clearNpcApiKey();
  try{const status=await npcApiStatus(undefined,{fresh:true});apiStatus=ai&&status.configured?'api-configured':'local-fallback';}
  catch{apiStatus='local-fallback';}
  playtest?.setMode(apiStatus);toast('已清除本次浏览器会话的 API Key。');break;
 }
 case 'enterPlaytest':{
  if(!research||!hasNpcApiKey())return;
  const next=new URL(location.href);next.searchParams.delete('research');next.searchParams.delete('access');location.assign(next);return;
 }
 case 'settings':case 'saves':case 'about':case 'favorites':case 'files':case 'map':case 'lock':case 'search':case 'contactSearch':case 'restartConfirm':case 'debug':modal={kind:a};break;
 case 'members':modal={kind:a,room:b.dataset.room||room};break;
 case 'newgroup':modal={kind:'newgroup'};break;
 case 'partyEdit':{
  const id=b.dataset.room,group=state.groups[id];
  if(group)modal={kind:'newgroup',edit:id,name:group.name,members:group.members.filter(id=>id!=='me')};break;
 }
 case 'partyMember':{
  modal.name=document.querySelector('#party-group-name').value;
  const selected=new Set(modal.members??[]);
  if(selected.has(v))selected.delete(v);else selected.add(v);
  modal.members=[...selected];break;
 }
 case 'partyGroup':{
  const name=document.querySelector('#party-group-name').value;
  if((modal.members?.length??0)<2)break;
  const edit=modal.edit,members=modal.members;
  sendEvent(edit?{type:'EDIT_GROUP',room:edit,name,members}:{type:'NEW_GROUP',name,members});
  openChat(edit??state.lastGroup);break;
 }
 case 'selectGroup':if(newGroupIds.includes(v))modal={kind:'newgroup',group:v};break;
 case 'createGroup':if(newGroupIds.includes(v)){if(!activeGroupIds(state).includes(v))sendEvent({type:'NEW_GROUP',group:v});openChat(v);}break;
 case 'close':closeModal();break;
 case 'sound':if(soundscape.enabled)soundscape.disable();else if(!await soundscape.enable())toast(soundscape.error);break;
 case 'soundPreview':if(!await playPreview(volume))toast('试听未能播放，请再点一次。');break;
 case 'alanLab':window.open('/lab.html','_blank','noopener');break;
 case 'replies':panel='replies';break;
 case 'plus':panel=panel==='plus'?null:'plus';break;
 case 'stickers':panel=panel==='stickers'?null:'stickers';break;
 case 'backgroundEmojis':panel=panel==='backgroundEmojis'?null:'backgroundEmojis';break;
 case 'sticker':panel=null;await send('[表情]','sticker',Number(v));break;
 case 'emoji':panel=null;await send(b.dataset.text);break;
 case 'send':await send();break;
 case 'suggest':playtest?.mark('选用建议回复',{chapter:state.chapter,room});draft=b.dataset.text;panel=null;keepDraft();render();document.querySelector('#draft').focus();if(!sessionStorage.getItem('reply-fill-hint')){sessionStorage.setItem('reply-fill-hint','1');toast('已填入输入框，点击“发送”回复。');}return;
 case 'voiceToggle':{
  if(activeVoice?.id===mid){stopAudio();return;}
  const msg=state.messages.find(x=>x.id===mid);
  if(msg?.type==='voice')await playVoiceMessage(msg);
  return;
 }
 case 'voiceTranscript':
 case 'message':{
  const msg=state.messages.find(x=>x.id===mid);
  if(!msg)break;
  if(msg.type==='file'){modal={kind:'file',value:msg.value,mid};sendEvent({type:'READ_FILE',value:msg.value});}
  else if(msg.type==='location')modal={kind:'locationView',mid};
  else {
   modal={kind:'message',mid};
   if(msg.type==='voice'){stopAudio();if(!state.ending)sendEvent({type:'PLAY_VOICE',value:msg.value});}
  }
  break;
 }
 case 'file':modal={kind:'file',value:v,mid};sendEvent({type:'READ_FILE',value:v});break;
 case 'play':{const msg=state.messages.find(x=>x.id===mid);if(msg?.type==='voice')await playVoiceMessage(msg);break;}
 case 'save':if(isMessageSheet())modal=null;sendEvent({type:'SAVE',messageId:mid});toast('已添加到收藏');break;
 case 'quote':quote=state.messages.find(x=>x.id===mid);keepDraft();modal=null;break;
 case 'unquote':quote=null;keepDraft();break;
 case 'capture':case 'forward':modal={kind:'forward',mid,capture:a==='capture'};break;
 case 'target':modal={kind:'forwardConfirm',mid,target:b.dataset.room,capture:modal.capture};break;
 case 'forwardSend':sendEvent({type:modal.capture?'CAPTURE':'FORWARD',room:b.dataset.room,messageId:mid});modal=null;toast('已发送给 '+rooms[b.dataset.room].name);break;
 case 'location':modal={kind:'location'};break;
 case 'sendLocation':case 'shareLocation':{const select=document.querySelector('#location-value');modal={kind:'locationConfirm',value:select.value,label:select.selectedOptions[0].textContent,share:a==='shareLocation'};break;}
 case 'locationSend':sendEvent({type:'LOCATION',room,value:modal.value,share:modal.share});modal=null;render.bottom=true;break;
 case 'stopSelf':sendEvent({type:'STOP_SELF_SHARE',room});break;
 case 'voicemenu':modal={kind:'message',mid:state.messages.find(x=>x.type==='voice')?.id};toast('可回放固定语音，或从“+”发起通话。此原型不录制麦克风。');break;
 case 'profileCall':
 case 'call':
  if(a==='profileCall'){if(state.ending)break;openChat(viewedContact);}
  stopAudio();callAudio.muted=false;callAudio.speaker=false;callMin=false;panel=null;
  sendEvent({type:'CALL',room});await playCallVoice();break;
 case 'answer':
  if(state.call?.status!=='incoming')break;
  callAudio.muted=false;callAudio.speaker=false;sendEvent({type:'ANSWER'});await playCallVoice();break;
 case 'hangup':stopAudio();sendEvent({type:'HANGUP'});callMin=false;break;
 case 'callmin':callMin=true;break;
 case 'callshow':callMin=false;break;
 case 'callplay':await playCallVoice();break;
 case 'mute':callAudio.muted=!callAudio.muted;setVoiceOutput(callVolume(),callObserver);break;
 case 'speaker':callAudio.speaker=!callAudio.speaker;setVoiceOutput(callVolume(),callObserver);break;
 case 'resetCode':sendEvent({type:'RESET_CODE',room});toast('门码已作废');break;
 case 'openDoor':modal=null;sendEvent(party?{type:'REQUEST_ACTION',room,kind:'open'}:{type:'SEND',room,text:'开门'});break;
 case 'leave':modal=null;sendEvent(party?{type:'REQUEST_ACTION',room,kind:'leave'}:{type:'SEND',room,text:'出门会合'});break;
 case 'abandon':modal=null;sendEvent({type:'REQUEST_ACTION',room,kind:'abandon'});break;
 case 'confirm':sendEvent({type:'CONFIRM'});break;
 case 'cancel':sendEvent({type:'CANCEL'});break;
 case 'retry':{review=false;const next=retry(state,Number(v));next.statusClockStartedAt=state.statusClockStartedAt;reset(next,'从检查点重试');return;}
 case 'sameSeed':review=false;reset(party?fresh(state.seed,state.case.revision??1):fresh(state.seed));return;
 case 'seedRestart':{
  const seed=document.querySelector('#party-seed').value.trim();
  if(!/^\d{1,10}$/.test(seed)||Number(seed)>0xffffffff){toast('请输入 0 到 4294967295 之间的整数。');return;}
  review=false;reset(fresh(Number(seed)));return;
 }
 case 'restart':review=false;reset(fresh());return;
 case 'review':sideHistory.length=0;review=true;view='list';panel=null;draft='';quote=null;break;
 case 'end':review=false;modal=null;break;
 case 'block':sendEvent({type:'BLOCK',room});modal=null;break;
 case 'searchMessage':if(activeVoice)stopAudio();if(view==='chat'&&room===b.dataset.room)modal=null;else openChat(b.dataset.room);render.jumpTo=mid;break;
 }
 render();
});
if(state.flags.welcomed&&state.statusClockStartedAt==null){state.statusClockStartedAt=Date.now();saveState();}
render();

setInterval(updateStatusClock,1000);
document.addEventListener('visibilitychange',()=>{updateStatusClock();readVisibleChat();soundscape.setPaused(document.hidden||!state.flags.welcomed||['settings','saves','restartConfirm','debug'].includes(modal?.kind));});
window.addEventListener('pagehide',()=>{soundscape.disable();});

