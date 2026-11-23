// Only explicitly addressed instructions change plans. Questions can ask for
// evidence or status, but mentioning a route in a question is not a route order.
export const routeOf=text=>/东门|后场通道/.test(text)?'east':/后院|南侧/.test(text)?'south':/西门/.test(text)?'west':/正门|北门/.test(text)?'north':null;
const person='老潘|春哥|老金|小卫|席瑞|正义';
const relay=new RegExp(`(?:帮(?:我|忙)|麻烦|请你|能不能|可以).{0,8}(?:通知|转告|告诉|发给|发消息给)(?:一下)?(?:${person}|他|她)`);
const accountClaim=/我(?:刚刚|刚才|已经|早就|才)?.{0,10}(?:通知过|告诉过|说过|发过|说了|通知了|告诉了|发给)|我已经.{0,12}(?:告诉|通知|转告)/;
const quoted=/[「」“”"'>]|(?:他说|她说|有人说|听说|引用)/;
const question=/[？?]|(?:哪个|哪扇|哪条|是不是|能不能|可以吗|行吗|吧吗|怎么样|是否|吗$)/;
const negative=/不(?:想|要|能|走|去|从|开|出)|先别|别(?:走|去|开|动|转告|通知|发|共享)|没(?:有)?(?:确认|通知|告诉)|如果|假如|先等等/;
export function classify(text){
 if(/^(开门|确认开门|允许门外的人进入|让门外的人进来)$/.test(text))return 'open';
 if(/^(出门会合|离开房间去会合|出门|出去会合|下楼会合|我现在出门跟你们会合)$/.test(text))return 'leave';
 if(/^(提前离开|我先走|不等了|自己先走)$/.test(text))return 'abandon';
 if(/(?:没(?:有)?说|没(?:有)?告诉|没在说).{0,14}[ＢB]\s*[０0]?\s*[３3]|你怎么知道.{0,8}(?:房号|我在哪)/i.test(text))return 'locationChallenge';
 if(/(?:开门|出门|出去了|作废).{0,8}(?:吗|[？?])|(?:别|不要|要不要|能不能|还没确认|如果).{0,9}(?:开门|出门|放人)|(?:开门|出门).{0,10}还没确认|[「」“”"'>].*(?:开门|出门)/.test(text))return 'caution';
 if(/先别动|先等等|先停一下|我再确认一下/.test(text))return 'hold';
 if(accountClaim.test(text)&&!/(?:可能|也许|好像|记不清|如果|假如)/.test(text))return 'reported';
 if(relay.test(text)&&!quoted.test(text)&&!negative.test(text))return 'relay';
 if(/^(?:救命|求助|帮帮我|我该怎么办|给个提示|有什么提示)[？?！!。]?$/.test(text))return 'help';
 if(/^(作废|重置)(临时)?(门码|访客码)$/.test(text))return 'reset';
 if(/^(?:请|先|麻烦你)?(?:停|结束|关闭|关掉|取消).{0,8}(共享|定位)$/.test(text))return 'stop';
 if(routeOf(text)&&!question.test(text)&&!negative.test(text)&&!quoted.test(text)){
  if(/假集合|我(?:在|去)(?:西门|正门).*等/.test(text)&&['west','north'].includes(routeOf(text)))return 'decoy';
  if(/^(?:(?:麻烦|请|那就|我们|你们|咱们|你|先|现在|接下来|我决定|我)[，,\s]*)*(?:改(?:走|到|去)|走|从|去|在|到|路线[:：]).*(?:东门|后场通道|后院|南侧|西门|正门|北门)/.test(text))return 'route';
 }
 if(/(?:哪个|哪扇|哪条).{0,5}(?:门|路|出口)|(?:门|出口).{0,8}(?:可以吗|能走吗|行吗)|(?:后院|东门).{0,4}(?:可以吗|行吗)|(?:改走|改到|走|去).*(?:后院|东门|西门).*[？?]/.test(text))return 'routeQuestion';
 if(/(?:来接|上车|接我们)/.test(text)&&!routeOf(text)&&!question.test(text)&&!quoted.test(text)&&!negative.test(text)&&!/(?:告诉|通知)/.test(text))return 'pickup';
 if(/现场核验|核验接应|确认(?:一下)?车(?:辆|边)|车旁|车在哪/.test(text)&&!negative.test(text)&&!quoted.test(text))return 'curb';
 if(/核[实对].{0,5}(?:现场|出口)|防火门|通不通|检查出口/.test(text)&&!negative.test(text)&&!quoted.test(text))return 'inspect';
 if(/核验|确认.{0,4}(?:身份|本人)|本人|是谁|背景声|一样|重复|证明|刚刚举的|亲眼看到|现场小事|谁在你旁边/.test(text)&&!negative.test(text)&&!quoted.test(text))return 'verify';
 if(/原始|记录|告示|资料|照片|现场线索/.test(text)&&!quoted.test(text))return 'record';
 if(/^(?:请|你们|那就|好[，,])*(?:继续走|往前走|继续|往会合点走|现在可以往会合点走)$/.test(text))return 'advance';
 if(/到哪|走到哪|到齐|和谁一起|谁跟着|几个人|你在哪/.test(text))return 'status';
 return 'chat';
}
export function disclosedRoute(text){
 const kind=classify(text);
 if(kind==='route')return routeOf(text);
 if(kind==='chat'&&!question.test(text)&&!negative.test(text)&&!quoted.test(text)&&
  /(?:真|实际).{0,6}(?:路线|集合点)|(?:我们|他们|大家)(?:要|正|将|在|从).{0,12}(?:集合|走|会合|等)/.test(text))return routeOf(text);
 return null;
}
