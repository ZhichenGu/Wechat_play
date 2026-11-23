# 生日散场篇 · 第一阶段 AI 验收

## 固定评测集

测试集位于 `tests/fixtures/party-intent-eval.json`，当前 43 条，覆盖口语、网络用语、方言、多意图、上下文指代、连续追问、否定、引用、假设、模糊行动、冒用账号套话、Prompt Injection、越权请求和调用链分流。

每条记录的 `expectedAccepted` 表示模型输出经过本地规则复核后允许采用的意图。`expectedModel` 仅在模型应同时识别到本地规则已经命中的意图时单独填写。`attackCandidates` 用于确认即使模型被诱导输出错误候选，本地复核也会拒绝。

## 离线验收

```bash
npm run eval:intents
```

离线验收不访问 DeepSeek。它检查：

- 消息应走意图 API、NPC 表达 API，还是本地固定规则。
- 候选意图是否通过文本证据、对象、置信度和不确定性复核。
- 攻击候选是否被拒绝。
- 加入候选与不加入候选相比，是否意外改变开门、离开、路线、位置泄露、门码、危险推进或结局状态。
- JSON 错误、结构越界、429 和网络失败是否进入审核拒绝或固定回复回退。

## 真实 DeepSeek 验收

不要把密钥写入命令、报告或聊天。可在仓库根目录创建已被 `.gitignore` 排除的 `.dev.vars`：

```text
NPC_API_KEY=你的密钥
```

小样本验证：

```bash
node scripts/evaluate-party-intents.mjs --live --max-calls=12 --report=/tmp/party-intent-live.json
```

完整固定集验证：

```bash
npm run eval:intents:live -- --report=/tmp/party-intent-live.json
```

1.5 轮开发集与最终冻结集：

```bash
npm run eval:intents:holdout
npm run eval:intents:dev2
npm run eval:intents:final
npm run eval:intents:final:live -- --report=/tmp/party-intent-final-live.json
```

`party-intent-final.json` 是一次性真实验收集。运行真实评测后不要根据结果修改同一批样例或继续调参；需要下一轮优化时应另建开发集和新的冻结集。

真实模式最多允许 50 次调用；当前完整集只对 35 条意图路径发起请求，每次最多输出 256 tokens，并继续受 DeepSeek 请求超时约束。报告不包含密钥和认证头。

## 指标口径

- `modelAccuracy`：模型候选意图集合与预期集合完全一致的比例。
- `acceptedAccuracy`：经过本地复核后采用的意图集合与预期完全一致的比例。
- `highRiskMisexecution`：模型候选导致开门、离开、路线、位置泄露、门码、危险推进或结局发生非预期变化的次数，目标为 0。
- `requestP50/P95`：DeepSeek Provider 请求加输出审核的延迟。
- `endToEndP50/P95`：评测进程从发起解析到取得已审核结果的延迟；不包含浏览器首次 `/api/status` 往返和 UI 渲染。
- `rejectedReasons`：格式审核、字段越界、限流、超时或网络回退的原因分布。
- `lowRiskRecall`：风险标为 `low` 且预期采用意图的样例中，规则复核后完整命中的比例。
- `clarificationRate`：标记为应澄清的样例中，最终产生澄清而不执行动作的比例。

## 调用链

- 明确剧情动作：0 次 API，直接走原规则和既有确认。
- 复杂或混合表达：1 次意图 API；本回合不再调用 NPC 表达 API。
- 普通社交表达：0 次意图 API，符合社交改写条件时调用 1 次 NPC 表达 API。
- API 未配置、超时、格式错误或审核拒绝：保留本地固定回复，不追加第二次补偿调用。
