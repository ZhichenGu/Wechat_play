export const VERSION = 1;
export const people = {me:{name:'我',color:'#81938b'},lan:{name:'老潘',color:'#6d8282',avatar:'lan'},lin:{name:'春哥',color:'#b59873',avatar:'lin'},zhou:{name:'老金',color:'#7d8c9e',avatar:'zhou'}};
export const rooms = {old:{name:'撤场小分队',members:['me','lan','lin','zhou']},lan:{name:people.lan.name,members:['me','lan']},lin:{name:people.lin.name,members:['me','lin']},zhou:{name:people.zhou.name,members:['me','zhou']},safe:{name:'外门会合',members:['me','lan','zhou']},driverGroup:{name:'司机接应群',members:['me','lin','zhou']},fieldGroup:{name:'现场联络群',members:['me','lan','lin']}};
export const newGroupIds=['safe','driverGroup','fieldGroup'];
export const activeGroupIds=state=>['old',...newGroupIds.filter(id=>id==='safe'?state.safeGroup:state.extraGroups?.[id])];
export const isMixedGroup=id=>id==='driverGroup'||id==='fieldGroup';
export const files = {
 map:{name:'园区平面图_v1.svg',version:'原始图 · 23:10',source:'老潘 / 撤场资料',text:'北：旧装卸口（原集合点）\n西：货梯 → 西门\n东：泵房 → 东门\n南：连廊 → 南侧服务门\n图中只含建筑，不包含你新换的房间。\n注意：本图记录建筑关系，不代表今夜通行状态。'},
 repair:{name:'夜间维修通知.txt',version:'维修通知 · 00:20',source:'老潘 / 门卫值班室纸本',text:'今晚北侧装卸口吊装封闭，禁止通行。\n西侧货梯断电，西门铁链未拆。\n东侧泵房通道可步行，先核实防火门。\n南侧服务门可作为备用，须由外侧接应。\n通知没有改变建筑结构；必须结合现场验证。'},
 false:{name:'撤场近路_v2.txt',version:'新路线 · 01:42',source:'春哥账号 / 未核实',text:'直接坐西侧货梯下楼。西门已经打开。\n到西门再统一发位置。'},
 handoff:{name:'B03_交接.txt',version:'私聊交接 · 01:36',source:'老潘 → 我（仅此私聊）',text:'你刚换到 B 楼二层 B03。\n临时门码 4826。反锁后外面不能直接开门。\n门码可在内侧面板作废。不要把这张交接单发到原群。\n春哥只知道你之前在 A 楼。'}
};
export const voices={original:{file:'lin-loop.wav',seconds:6,text:'春哥：我去拿个推车，马上回来。[两短一长的金属敲击，随后一声拖轮摩擦]'},copy:{file:'lin-loop.wav',seconds:6,text:'春哥账号：我去拿个推车，马上回来。[两短一长的金属敲击，随后一声拖轮摩擦]'},truth:{file:'lan-call.wav',seconds:10,text:'老潘：我找到春哥了。他就在我旁边，手机丢在西侧楼梯了。你现在收到的，不是他发的。[春哥在远处：别给那个手机发位置！]'},door:{file:'door.wav',seconds:5,text:'[楼道脚步停下。门把手转动两下，被反锁挡住。] 春哥账号：是我，开一下门。'}};
export const stickers=['收到','疑问','害怕','抱抱','快走','无语','探头','平安'];
export const stickerFaces=['•ᴗ•','·᷄ࡇ·᷅','⊙﹏⊙','づ ◕‿◕ づ','≡┏( ･_･)┛','－_－','壁│•ﻌ•)','˘◡˘'];
export const chapters=['正常撤场','那个手机','核实出口','换个地方见','门外的人','会合'];
export const endings={A:{title:'全部离开',sub:'车门关上时，天还没有亮。',body:'老潘把春哥推进后座，你最后一个上车。老金没有问你们为什么一直盯着手机。园区的灯一盏盏灭下去。三个人都在车里。'},B:{title:'有人未归',sub:'车里有一个空位。',body:'你离开了园区。但发出的接应安排没有把所有人带到一起。天亮以后，那个座位仍空着。'},C:{title:'你失联了',sub:'输入中的草稿，再也没有发出去。',body:'门锁响了一声。屏幕上仍是春哥的头像。它没有换用你的账号；它只是终于走进了你所在的房间。'}};
