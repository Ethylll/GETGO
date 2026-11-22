# 开练｜GETGO V2.0

把收藏的图文交给 GETGO，就能开始一个学习日。它整理带来源的路线，安排一次性任务与周期练习，并在学到一半遇到困难时提供资料内答疑或局部调整。「下一日」每次推进 24 小时模拟学习时间。

## 本地运行

1. 使用项目当前的 Node.js 和 npm 环境安装锁定依赖 `npm.cmd ci`。非 Windows 环境使用 `npm ci`。
2. 在项目根目录的本地环境中配置服务端 `DEEPSEEK_API_KEY`。可选 `DEEPSEEK_MODEL`。项目忽略 `.env.local`，运行时从服务端读取密钥。
3. 执行 `npm.cmd run dev:vercel`，打开 `http://127.0.0.1:3000`。本地模式使用现有配置，无需登录或链接 Vercel 项目。普通 Vite 开发脚本用于前端调试。

## 从哪里看

- [正式产品需求](docs/prd.md)
- [设计决策](docs/decisions.md)
- [阶段记录与统一人工验收指南](docs/v2-plan.md#最终统一人工验收指南)
- [105 项需求与验收证据](docs/v2-checklist.md)
- [独立审查修复与复验证据](docs/v2-audit-resolution.md)

## 技术与测试

React、Vite、JavaScript 和 Tailwind CSS 提供界面。Vercel Functions 调用 DeepSeek 读取资料、生成并核验计划，以及提供资料内答疑与有限教学判断。浏览器按规则安排今日任务，在本地事务中执行合法调整，并把实际回执交给模型。旧 V1 会话仍可在原线性界面继续。

`node --test` 跑程序测试，`npm.cmd run build` 检查生产构建。启动本地 Vercel 后，可运行 `node scripts/verify-learning-agent.js http://127.0.0.1:3000/api/learning-agent` 验证合成资料上的三个真实模型场景。

Demo 只保留一个浏览器本地会话。需要从头体验时可打开无痕窗口，将已有记录留在原浏览器配置中。
