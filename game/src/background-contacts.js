export const backgroundContacts = {
  anning: {name:'安宁',section:'A',avatar:'sea',note:'以前的室友',signature:'窗台快摆不下了。',time:'昨天',history:[
    ['them','窗台那盆薄荷我拿走了，放你这儿也没人浇。'],
    ['me','好，绿盆那个是薄荷，白盆是空的。'],
    ['them','放心，连土一起端走了。']
  ]},
  dad: {name:'爸爸',section:'B',avatar:'pa',note:'家人',signature:'早起走两圈。',time:'22:48',history:[
    ['them','到家要是太晚就别打电话了。'],
    ['me','还得等一会儿，你先睡。'],
    ['them','好，回来了锅里有粥。']
  ]},
  fan: {name:'范师傅',section:'F',avatar:'night',note:'常去的打印店',signature:'茶泡浓了就添点水。',time:'18:26',history:[
    ['me','那两张 A3 还要补多少钱？'],
    ['them','不用补了，下次一起算。']
  ]},
  guo: {name:'郭晨',section:'G',avatar:'portrait',note:'以前的同事',signature:'还在学怎么养鱼。'},
  jiang: {name:'江可',section:'J',avatar:'illustrated',note:'朋友',signature:'周末想坐一趟慢车。',time:'昨天',history:[
    ['them','周六还去那家吗？'],
    ['me','可以，我坐地铁过去。'],
    ['them','那就老地方，靠窗那桌。']
  ]},
  mom: {name:'妈妈',section:'M',avatar:'a4',note:'家人',signature:'把春天晒进被子里。',time:'21:12',history:[
    ['them','这张照片能洗大一点吗？'],
    ['me','可以，我明天给你问一下。'],
    ['them','不急，跟上回差不多就行。']
  ]},
  tao: {name:'陶子',section:'T',avatar:'cat',note:'楼上邻居',signature:'下楼五分钟，散步一小时。',time:'星期二',history:[
    ['them','快递帮你放门口了。'],
    ['me','谢啦，周末请你喝咖啡。'],
    ['them','你记得拆，箱子底有点湿。']
  ]},
  wen: {name:'温然',section:'W',avatar:'ink',note:'朋友',signature:'书签停在第 47 页。'},
  xu: {name:'许一帆',section:'X',avatar:'walk',note:'同学',signature:'电影散场后想走一站路。',time:'昨天',history:[
    ['me','上次说的电影你看了吗？'],
    ['them','看了一半。片尾要是好你再告诉我。']
  ]},
  zheng: {name:'小郑',section:'X',avatar:'frog',note:'咖啡店店员',signature:'拉花最好看的一杯总是自己的。',time:'20:35',history:[
    ['me','今天忘拿保温杯了，深蓝色那个。'],
    ['them','在前台，明天来拿就好。']
  ]}
};

const predefinedMessages = Object.fromEntries(
  Object.entries(backgroundContacts).map(([id,contact])=>[id,(contact.history??[]).map(([from,text],index)=>({
    id:`history-${id}-${index}`,room:id,from:from==='me'?'me':id,text,type:'text',time:contact.time
  }))])
);

export function backgroundHistory(state,id){
  return [...predefinedMessages[id],...(state.backgroundOutbox??[]).filter(message=>message.room===id)];
}

export function sendBackgroundMessage(state,room,text,id,time){
  if(!Object.hasOwn(backgroundContacts,room)||state.ending||!text.trim())return state;
  const message={id,room,from:'me',text,type:'text',time};
  return {...state,backgroundOutbox:[...(state.backgroundOutbox??[]),message]};
}
