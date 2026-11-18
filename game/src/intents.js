// Text describes claims. Only explicit actions become candidates, never direct permissions.
export function parse(text){
 const t=text.trim();
 if(/不要|别|不许|不能|不想|不开|不出|没要|如果|假如|假设|要是|会怎样|如何|怎么|是否|能否|[?？“”「」"']|^>|引用/.test(t)&&/开门|出去|出门|离开|走.*[东西南北]门/.test(t))return {kind:'caution'};
 if(/作废|换.*码|改.*码|重置.*码/.test(t))return {kind:'resetCode'};
 if(/开门|允许.*进|让.*进来/.test(t))return {kind:'open'};
 if(/提前离开|先走了|不等了|放弃救援|自己先走/.test(t))return {kind:'abandon'};
 if(/出门|离开房间|下楼会合|出去会合/.test(t))return {kind:'leave'};
 if(/建.*群|拉.*群/.test(t))return {kind:'newGroup'};
 if(/停.*共享|关.*定位|别.*共享|取消.*共享/.test(t))return {kind:'stopShare'};
 if(/报警|警察|求助/.test(t))return {kind:'help'};
 if(/躲|藏|锁好|反锁/.test(t))return {kind:'hide'};
 if(/现场|防火门|门能开|铁链|货梯|通不通/.test(t))return {kind:'inspect'};
 if(/核实|核验|确认身份|证明|暗号|真的是|你是谁|本人|背景声|一样|重复/.test(t))return {kind:'verify'};
 if(/东门|南门|南侧|西门|北门/.test(t))return {kind:'route',route:/东门/.test(t)?'east':/南门|南侧/.test(t)?'south':/西门/.test(t)?'west':'north',move:/走|去|改|到|集合|接|会合|路线|出口/.test(t)&&!/[?？]|是不是|能不能|安全吗/.test(t)};
 if(/到哪|在哪|位置|走到|进度/.test(t))return {kind:'where'};
 if(/等等|等一下|继续|下一步|然后|往前|走吧/.test(t))return {kind:'advance'};
 if(/上车|接我们|接人|来接|会合了/.test(t))return {kind:'pickup'};
 if(/别怕|没事|抱抱|放心|陪着|加油/.test(t))return {kind:'comfort'};
 if(/快|赶紧|抓紧/.test(t))return {kind:'urge'};
 if(/骗|滚|混蛋|有病/.test(t))return {kind:'accuse'};
 if(/谢谢|辛苦|困|饿|哈哈|撤场|收到|好的|^好$|[😀😂👍❤️]/.test(t))return {kind:'smalltalk'};
 return {kind:'unknown'};
}
