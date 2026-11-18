export const profiles={
 lan:{handle:'pan_stage',note:'撤场搭档',signature:'相机里还有去年夏天。'},
 lin:{handle:'chun_roll',note:'撤场小分队',signature:'今天也没说服猫。'},
 zhou:{handle:'jin_0719',note:'接应司机',signature:'歌单还停在 2012。'},
 me:{note:'撤场统筹',signature:'手机里存了好多路灯。'}
};

export const albumCovers={
 me:'dusk',
 lin:'cat',
 zhou:'black',
 lan:'gray',
 anning:'garden',
 dad:'black',
 fan:'black',
 tao:'black',
 wen:'black'
};

// These are posts visible to the player before tonight, separate from NPC knowledge.
export const moments=[
 {id:'cat-box',author:'lin',time:'昨天 22:40',text:'之前那个视频没传出去。补一张，它到现在还在箱子里。',photo:0,likes:['tao'],comments:[['tao','箱子的钱算它的吗']]},
 {id:'last-look',author:'lan',time:'昨天 20:16',text:'卷完最后一卷胶带才发现，今天忘了买纸巾。',likes:['zhou'],comments:[['zhou','车门边上有一包，明早记着拿。']]},
 {id:'me-night',author:'me',time:'昨天 18:14',text:'收工以后想吃点热的。'},
 {id:'melting',author:'lin',time:'昨天 16:13',text:'冰化完了以后，这家店的饮料终于没那么甜了。',photo:2,comments:[['lan','那你下次直接点少糖。']]},
 {id:'lunch',author:'zhou',time:'昨天 12:24',text:'土豆烧冬瓜。两个都入味，就是夹起来分不清。',photo:1,likes:['fan']},
 {id:'mint',author:'anning',time:'昨天 10:52',text:'薄荷换了个位置，看看这回能活几天。',photo:3,comments:[['tao','先别浇，刚下过雨。']]},
 {id:'delivery',author:'tao',time:'前天 20:05',text:'下楼扔个垃圾，回来在电梯里站了半天，忘了按楼层。'},
 {id:'mother',author:'mom',time:'前天 15:21',text:'楼下的玉兰开了一朵，其他几朵还没醒。',likes:['dad']},
 {id:'seat',author:'jiang',time:'三天前 21:30',text:'今天坐到了靠窗那桌。窗外什么也看不清，雨声倒是挺好听。'},
 {id:'printing',author:'fan',time:'三天前 09:07',text:'店里的装订机修好了。上午送来的那几份下午可以拿。'}
];
