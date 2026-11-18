import {rooms} from './story.js';
import {validateAlanOutput,socialKinds} from './alan-policy.js';
export {socialKinds};
export function validateNpcOutput(data,context){
 const id=context.character;
 if(!['lan','zhou','lin'].includes(id)||!rooms[context.room]?.members.includes(id))return {ok:false,reason:'回复账号不属于此会话'};
 if(id==='lan')return validateAlanOutput(data,context);
 if(!data||!Array.isArray(data.lines)||!Array.isArray(data.memoryRefs)||data.lines.length<1||data.lines.length>3||data.lines.some(x=>typeof x!=='string'||!x.trim()||x.length>100)||data.lines.join('').length>160)return {ok:false,reason:'消息格式或长度不合适'};
 if(data.memoryRefs.some(x=>!context.allowedMemoryIds.includes(x)))return {ok:false,reason:'引用了不可见或不存在的记忆'};
 const text=data.lines.join('');
 if(/4826|四八二六|B\s*0?3|\b\d{4}\b|东门|西门|北门|南门|泵房|设备间|楼梯|门码|密码|暗号|安全出口|(?:已经|已|刚刚|刚|马上|现在|正在|我会|我们会).{0,10}(?:到了|到门|出发|走到|移动|开门|开锁|进门|上车|报警|获救|通关)|你(?:死了|赢了)|系统|程序|接口|作为.*AI|我是.*模型/.test(text)){
  const code=/4826|四八二六|B\s*0?3|\b\d{4}\b|门码|密码|暗号/.test(text)?'LOCKED_VALUE':/东门|西门|北门|南门|泵房|设备间|楼梯|安全出口/.test(text)?'LOCATION_DETAIL':/系统|程序|接口|作为.*AI|我是.*模型/.test(text)?'META_EXPRESSION':'ACTION_CLAIM';
  return {ok:false,reason:'涉及锁定剧情事实或越界行动',code};
 }
 if(id==='zhou'&&/(?:我|我这边).{0,8}(?:看见|看到|听见|听到).{0,10}(?:楼里|楼内|走廊|门外|老潘|阿[岚兰]|春哥|小林)|(?:春哥|小林).{0,8}(?:死|活|丢|找到|身边)/.test(text))return {ok:false,reason:'司机不能凭空获知楼内情况'};
 if(id==='lin'&&/新群|安全群|可信群|另一个群|换.*账号|用你.*账号/.test(text))return {ok:false,reason:'危险账号不能凭空知道新群或切换账号'};
 const secrets=Object.values(context.preferences||{}).filter(x=>x.source!==context.room&&['lan','zhou','lin'].includes(x.source)).map(x=>x.value);
 if(rooms[context.room].members.length>2&&secrets.some(x=>text.includes(x)))return {ok:false,reason:'不能自动公开私聊偏好'};
 return {ok:true,lines:data.lines.map(x=>x.trim()),memoryRefs:data.memoryRefs};
}
