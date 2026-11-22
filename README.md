# 开练｜GETGO V2.0

GETGO 是面向技能自学者的 Web Demo。粘贴教程或笔记，或上传截图，即可生成带来源的学习路线，从今日任务开始。路线包含一次性任务和周期练习。遇到困难时，可以就导入的资料提问，学习 Agent 也会根据进展提供指导或建议局部调整。

## 运行方式

### 在线体验

打开 [GETGO 在线 Demo](https://quick-start-learning-agent.vercel.app/)，直接体验 Vercel 托管的公开版本。

### 本地运行

1. 安装依赖。Windows PowerShell 运行 `npm.cmd ci`，其他环境运行 `npm ci`。
2. 在项目根目录的 `.env.local` 中设置服务端环境变量 `DEEPSEEK_API_KEY`，也可指定 `DEEPSEEK_MODEL`。`.env.local` 已被 Git 忽略。
3. 运行 `npm.cmd run dev:vercel`，其他环境运行 `npm run dev:vercel`。启动后打开 [本地 Demo](http://127.0.0.1:3000)。本地模式无需登录或链接 Vercel 项目。仅调试前端时可运行 `npm run dev`。

点击「下一日」会推进 24 小时模拟学习时间。Demo 在浏览器中保存一个学习会话。想从头体验时，可以打开无痕窗口。

## 项目文档

- [正式产品需求](docs/prd.md)
- [部分设计决策](docs/decisions.md)

## 技术与测试

React、Vite、JavaScript 和 Tailwind CSS 提供界面。Vercel Functions 调用 DeepSeek 读取资料、生成并核验计划，以及提供资料内答疑与有限教学判断。浏览器按规则安排今日任务，在本地事务中执行合法调整，并把实际回执交给模型。旧 V1 会话仍可在原线性界面继续。

运行 `node --test` 执行程序测试，运行 `npm run build` 检查生产构建。Windows PowerShell 可使用 `npm.cmd run build`。
