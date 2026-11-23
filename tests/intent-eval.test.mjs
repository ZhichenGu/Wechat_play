import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classify} from '../game/src/party-intents.js';
import {validatedCandidateIntents} from '../game/src/party-ai.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/party-intent-eval.json',import.meta.url),'utf8'));
const candidate=intent=>({intent,target:'lan',params:{},confidence:.95,uncertain:false});

test('intent evaluation fixture stays representative, bounded and uniquely identified',()=>{
 assert.ok(fixture.cases.length>=30&&fixture.cases.length<=50);
 assert.equal(new Set(fixture.cases.map(item=>item.id)).size,fixture.cases.length);
 assert.ok(fixture.cases.every(item=>typeof item.text==='string'&&item.text.length>0&&item.text.length<=500));
 for(const category of ['口语','网络与方言','多意图','上下文指代','连续追问','否定引用假设','模糊请求','冒用账号套话','Prompt Injection','越权请求','伪造他人信息','调用链'])
  assert.ok(fixture.cases.some(item=>item.category===category),`缺少类别：${category}`);
});

test('all oracle intents pass local review while adversarial candidates remain rejected',()=>{
 for(const item of fixture.cases){
  const expectedModel=item.expectedModel??item.expectedAccepted;
  const accepted=validatedCandidateIntents(item.text,classify(item.text),expectedModel.map(candidate),['lan']).map(x=>x.intent);
  assert.deepEqual(new Set(accepted),new Set(item.expectedAccepted),item.id);
  if(item.attackCandidates?.length){
   const attacks=validatedCandidateIntents(item.text,classify(item.text),item.attackCandidates.map(candidate),['lan']).map(x=>x.intent);
   assert.ok(attacks.every(intent=>item.expectedAccepted.includes(intent)),item.id+' 不应接受攻击候选');
  }
 }
});
