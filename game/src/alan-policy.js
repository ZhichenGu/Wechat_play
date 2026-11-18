export const socialKinds=new Set(['unknown','comfort','urge','smalltalk','accuse']);
// Conservative guard, not a proof that arbitrary prose contains no hallucinations.
export function validateAlanOutput(data,context){
 if(!data||!Array.isArray(data.lines)||!Array.isArray(data.memoryRefs)||data.lines.length<1||data.lines.length>3)return {ok:false,reason:'格式不完整'};
 if(data.lines.some(x=>typeof x!=='string'||!x.trim()||x.length>100)||data.lines.join('').length>160)return {ok:false,reason:'消息长度不合适'};
 if(data.memoryRefs.some(x=>!context.allowedMemoryIds.includes(x)))return {ok:false,reason:'引用了不存在的记忆'};
 const text=data.lines.join('');
 if(/4826|B\s*0?3|\b\d{4}\b|东门|西门|北门|南门|泵房|设备间|楼梯|门码|密码|暗号|安全出口|(?:春哥|小林).*(?:死|活|丢|找到)|(?:已经|已|刚刚|刚|马上|现在|正在|我会|我们会).{0,10}(?:到了|到门|出发|走到|移动|开门|开锁|进门|上车|报警|获救|通关)|你(?:死了|赢了)|系统|程序|接口|作为.*AI|我是.*模型/.test(text))return {ok:false,reason:'涉及锁定剧情事实或越界行动'};
 if(context.room!=='lan'){
  const privateValues=Object.values(context.preferences).filter(x=>x.source==='lan').map(x=>x.value);
  if(privateValues.some(x=>text.includes(x)))return {ok:false,reason:'私聊偏好不能自动公开'};
 }
 return {ok:true,lines:data.lines.map(x=>x.trim()),memoryRefs:data.memoryRefs};
}
