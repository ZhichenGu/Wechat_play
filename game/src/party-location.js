// A receipt records what this account was told, not where the player really is.
const roomNumber=/\bB\s*0?3(?!\d)/i;
const mentionsRoom=text=>roomNumber.test((text??'').normalize('NFKC'));
const reportsSomeone=/(?:[「『“"\x27]|(?:听说|传闻|转述|引用|据说|(?:他|她|对方|老潘|春哥|老金|小卫|席瑞|正义)(?:刚才|刚刚)?(?:说|问|提到|告诉)))/;
const uncertainty=/(?:吗|么|吧|[?？]|可能|好像|应该|说不定|如果|假如|是否|不在|没在|没(?:有)?说|没(?:有)?告诉|不是)/;
const firstPerson=/^(?:(?:@\S+|我确认)[ ：:，,\s]*)?(?:我(?:现在|就|正|暂时)?(?:在|待在|躲在)|我(?:现在|刚)?到了|我(?:的)?(?:房间|位置|房号)(?:是|在|[:：]))\s*(?:B\s*0?3)(?!\d)/i;
const personalScope=/(?:没(?:有)?说|没(?:有)?告诉|没在说).{0,14}B\s*0?3/i;

export function roomCluesFor(message,{quoted,original,playerText}={}){
 if(original){
  return (original.roomClues??roomCluesFor(original)).map(clue=>({...clue,
   kind:clue.authoritative?'confirmed':'reported'}));
 }
 const clues=[];
 const add=(kind,source=message.id,authoritative=false)=>clues.push({kind,source,authoritative});
 if(message.from==='me'&&(message.type==='file'&&message.value==='handoff'||
    message.type==='location'&&mentionsRoom(message.text))){
  add('confirmed',message.id,true);
 }else if(message.from!=='system'&&mentionsRoom(message.text)){
  const text=(playerText??message.text).normalize('NFKC');
  const reported=!personalScope.test(text)&&reportsSomeone.test(text);
  const clauses=text.match(/[^，,。！？!?；;]+[，,。！？!?；;]?/g)??[];
  const confirms=message.from==='me'&&!reported&&!personalScope.test(text)&&clauses.some(clause=>
   firstPerson.test(clause.trim())&&!uncertainty.test(clause)&&!/B\s*0?3\s*(?:附近|门外|外面|隔壁|旁边|这一带)/i.test(clause));
  add(confirms?'confirmed':reported||message.from!=='me'?'reported':'candidate');
 }
 if(quoted){
  for(const clue of quoted.roomClues??roomCluesFor(quoted)){
   add(clue.authoritative?'confirmed':'reported',clue.source,clue.authoritative);
  }
 }else if(mentionsRoom(message.quotedContent))add('reported');
 return clues;
}

export function roomReceipt(message,clue){
 return {kind:clue.kind,message:message.id,source:clue.source};
}
