// Messages from before the playable night. They belong to the chat view only.
const exchanges={
 lan:[
  ['昨天 20:04',[
   ['lan','你见过一卷蓝胶带吗？'],
   ['me','纸箱右边，压在剪刀底下。'],
   ['lan','找到了。剪刀是我刚放的。']
  ]]
 ],
 zhou:[
  ['前天 18:42',[
   ['zhou','你上回发我那个修伞的店叫什么？'],
   ['me','名字忘了。菜市场进去，左边卖馒头那家隔壁。'],
   ['zhou','找着了。今天没开门，我先买俩馒头。']
  ]],
  ['昨天 12:18',[
   ['zhou','楼下那家盒饭今天又是土豆。'],
   ['me','昨天不是冬瓜吗'],
   ['zhou','昨天是土豆烧冬瓜。']
  ]]
 ],
 lin:[
  ['前天 22:06',[
   ['lin','发你个猫视频，等一下。'],
   ['lin','算了，转圈半天，发不出去。'],
   ['me','你可以口述一下'],
   ['lin','一只猫坐纸箱里。然后还是坐着。']
  ]],
  ['昨天 16:09',[
   ['me','你那杯还喝吗？冰全化了'],
   ['lin','喝啊，放着。'],
   ['lin','我回来了。谁把吸管插反了']
  ]]
 ]
};

export const priorChats=Object.fromEntries(Object.entries(exchanges).map(([room,groups])=>[
 room,groups.flatMap(([time,messages],group)=>messages.map(([from,text],index)=>({
  id:`prior-${room}-${group}-${index}`,room,from,text,type:'text',time
 })))
]));
