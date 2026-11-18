import {voices} from './story.js';
export function soundEvents(before,next){
 if(before.runId!==next.runId)return [];
 const events=[];
 if(next.threatStep>before.threatStep){if(before.threatStep<1&&next.threatStep>=1)events.push('stairs');if(before.threatStep<2&&next.threatStep>=2)events.push('handle-locked');}
 if(before.codeValid&&!next.codeValid)events.push('lock-reset');
 if(next.ending&&next.ending!==before.ending)events.push('ending-'+next.ending.toLowerCase());
 if(!next.ending&&!events.length){const ids=new Set(before.messages.map(m=>m.id)),newMessages=next.messages.filter(m=>!ids.has(m.id)&&m.from!=='system');if(newMessages.some(m=>m.from==='me'))events.push('send');if(newMessages.some(m=>m.from!=='me')&&!next.call)events.push('message');}
 return events;
}
export function readAudioPrefs(){try{return {...{master:.65,ambience:.75,effects:.7},...JSON.parse(localStorage.getItem('night-audio')||'{}')}}catch{return {master:.65,ambience:.75,effects:.7}}}
export class Soundscape {
 constructor({contextFactory=()=>new (window.AudioContext||window.webkitAudioContext)(),fetcher=(...args)=>fetch(...args)}={}){this.contextFactory=contextFactory;this.fetcher=fetcher;this.prefs=readAudioPrefs();this.ctx=null;this.enabled=false;this.paused=false;this.generation=0;this.buffers=new Map();this.pending=new Map();this.shots=new Set();this.scene=null;this.voicing=false;this.ringing=false;this.error=null;this.loops={};this.gains={};}
 persist(){try{localStorage.setItem('night-audio',JSON.stringify(this.prefs))}catch{}}
 setLevel(kind,value){if(!Object.hasOwn(this.prefs,kind))return;this.prefs[kind]=Math.max(0,Math.min(1,Number(value)||0));this.persist();this.mix();this.onChange?.();if(player)player.volume=this.prefs.master;}
 async buffer(name){if(this.buffers.has(name))return this.buffers.get(name);if(!this.pending.has(name))this.pending.set(name,(async()=>{const response=await this.fetcher('/assets/sfx/'+name+'.wav');if(!response.ok)throw Error('audio missing');const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());this.buffers.set(name,buffer);return buffer;})().finally(()=>this.pending.delete(name)));return this.pending.get(name);}
 async enable(){try{if(!this.ctx){this.ctx=this.contextFactory();this.ctx.onstatechange=()=>this.onChange?.();this.bus=this.ctx.createGain();const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-10;limiter.ratio.value=4;this.bus.connect(limiter);limiter.connect(this.ctx.destination);for(const id of ['room-tone','pressure','ringtone']){this.gains[id]=this.ctx.createGain();this.gains[id].gain.value=0;this.gains[id].connect(this.bus);}}
 this.enabled=true;this.error=null;this.errorDetail=null;await this.ctx.resume();await Promise.all(['room-tone','pressure','ringtone'].map(n=>this.buffer(n)));if(!this.enabled)return false;for(const id of ['room-tone','pressure','ringtone'])if(!this.loops[id]){const src=this.ctx.createBufferSource();src.buffer=this.buffers.get(id);src.loop=true;src.connect(this.gains[id]);src.start();this.loops[id]=src;}if(this.paused)await this.ctx.suspend();this.mix();return true;
 }catch(error){this.errorDetail=error.name+': '+error.message;this.error='声音暂时不可用，可继续用字幕游玩';this.enabled=false;return false;}}
 ramp(gain,value,seconds=.5){if(!gain||!this.ctx)return;const at=this.ctx.currentTime;gain.gain.cancelScheduledValues(at);gain.gain.setValueAtTime(gain.gain.value,at);gain.gain.linearRampToValueAtTime(value,at+seconds);}
 mix(){if(!this.ctx)return;this.ramp(this.bus,this.enabled?this.prefs.master:0,.12);const dead=!!this.scene?.ending,duck=this.voicing||this.scene?.call?.status==='active' ? .23 : 1;const room=this.prefs.ambience*duck;this.ramp(this.gains['room-tone'],dead?0:room,dead?1.4:.6);this.ramp(this.gains.pressure,!dead&&this.scene?.chapter>=2?room*(this.scene?.threatStep>=1?.75:.25):0,1.8);this.ringing=this.scene?.call?.status==='incoming'&&!dead;this.ramp(this.gains.ringtone,this.ringing?this.prefs.effects*.65:0,.08);}
 async effect(name){if(!this.enabled||this.paused||!this.ctx)return;const generation=this.generation;try{const data=await this.buffer(name);if(generation!==this.generation||!this.enabled||this.paused)return;const src=this.ctx.createBufferSource(),gain=this.ctx.createGain();gain.gain.value=this.prefs.effects;src.buffer=data;src.connect(gain);gain.connect(this.bus);this.shots.add(src);src.onended=()=>{this.shots.delete(src);gain.disconnect()};src.start();}catch{this.error='个别音效未加载；字幕仍可使用';}}
 update(before,next){this.scene=next;this.mix();for(const name of soundEvents(before,next))void this.effect(name);}
 setScene(scene){this.scene=scene;this.mix();}
 setPaused(paused){if(this.paused===paused)return;this.paused=paused;if(paused){this.generation++;this.clearShots();stopAudio();if(this.ctx)void this.ctx.suspend().catch(()=>{});}else if(this.enabled&&this.ctx)void this.ctx.resume().then(()=>this.mix()).catch(()=>{this.error='点声音按钮恢复播放'});}
 clearShots(){for(const src of this.shots){try{src.stop()}catch{}}this.shots.clear();}
 reset(scene){this.generation++;this.clearShots();stopAudio();this.scene=scene;this.mix();}
 disable(){this.enabled=false;this.generation++;this.clearShots();stopAudio();this.mix();}
 get status(){return this.error||(!this.enabled?'开启氛围声音':this.paused?'环境声已暂停':this.ctx?.state!=='running'?'声音正在恢复':this.prefs.master===0?'声音已静音':'氛围声音已开启');}
 get playing(){return this.enabled&&!this.paused&&this.ctx?.state==='running';}
}
let player=null,voiceObserver=null;
export const soundscape=new Soundscape();
function finishAudio(reason){
 const observer=voiceObserver;
 if(player){player.onended=null;player.onerror=null;player.ontimeupdate=null;player.pause();player.currentTime=0;}
 player=null;voiceObserver=null;soundscape.voicing=false;soundscape.mix();
 observer?.onFinish?.(reason);
}
export function stopAudio(){finishAudio('stopped');}
export function setVoiceOutput(volume,observer){
 if(player&&observer&&voiceObserver===observer)player.volume=volume;
}
export async function playVoice(id,volume=soundscape.prefs.master,observer){
 stopAudio();
 if(!voices[id])return false;
 const current=new Audio('/assets/'+voices[id].file);
 player=current;voiceObserver=observer;
 current.volume=volume;
 current.onended=()=>{if(player===current)finishAudio('ended');};
 current.onerror=()=>{if(player===current)finishAudio('error');};
 current.ontimeupdate=()=>{if(player===current&&current.duration>0)observer?.onProgress?.(current.currentTime/current.duration);};
 try{
  await current.play();
  if(player!==current){current.pause();return false;}
  soundscape.voicing=true;soundscape.mix();return true;
 }catch{if(player===current)finishAudio('error');return false;}
}

export async function playPreview(volume=soundscape.prefs.master){stopAudio();const current=new Audio('/assets/sfx/soundscape-preview.wav');player=current;current.volume=volume;current.onended=current.onerror=()=>{if(player===current){player=null;soundscape.voicing=false;soundscape.mix();}};try{await current.play();if(player!==current){current.pause();return false;}return true;}catch{return false;}}
