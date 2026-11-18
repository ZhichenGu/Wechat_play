# Wechat Play · 别发到群里

中文通信恐怖短篇。包含 9 秒可跳过开场、三条结局、个人朋友圈、语音通话字幕和聊天回执。

这个仓库是游戏的开发与 Cloudflare 部署源。界面和剧情改动直接在 `game/src/` 完成，再从本仓库构建和测试。

## 本地试玩

需要 Node.js 22.12 或更新版本。在仓库目录运行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:4183/ 。本地预览使用固定剧情回复。构建后可用 `npm test` 运行托管测试。

- `game/src/` 保存界面、剧情、角色记忆和存档逻辑。
- `game/assets/` 和 `game/audio/` 包含游戏图片和音频。
- `game/assets/opening.mp4` 是新开局播放的静音竖屏动画。
- `worker/` 包含服务端 DeepSeek 接入和额度控制。 `drizzle/` 包含数据库迁移。

## 以后开放在线试玩

现有服务端支持 Cloudflare Workers 和 D1。D1 记录请求次数，剧情存档保存在玩家浏览器中。

1. 创建自己的 D1 数据库，复制 `wrangler.example.jsonc` 为 `wrangler.jsonc`，填入数据库 ID，并应用 `drizzle/` 中的迁移。
2. 运行 `npm run build`，部署 `dist/server/index.js`。可使用 Cloudflare 的 Git 集成或 Wrangler。
3. 在托管后台设置私密变量 `NPC_API_KEY` 和 `SESSION_SECRET`。前者填自己的 DeepSeek API Key，后者填独立的随机值。默认全站每天 300 次、每浏览器每天 150 次，按北京时间重置。

[Workers 配置](https://developers.cloudflare.com/workers/wrangler/configuration/) · [私密变量](https://developers.cloudflare.com/workers/configuration/secrets/) · [D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)
