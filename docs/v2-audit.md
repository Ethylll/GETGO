# GETGO V2.0 独立需求覆盖与产品验收审查

审查日期 2026-11-22（中国标准时间）。审查基线 `78fe69f`，V1 回归基线 `734abb6`。本次审查使用合成资料和隔离浏览器配置。

## A. 总体结论

**存在重大需求偏差，必须先修复。** 今日学习、资料内问答、V1 会话兼容和有限自治循环均已实现。进行中任务接受拆解后仍能绕过新增前置，并解锁原后继任务。这违背原始规格 §6.3、§7.6、§7.9 和 DEC-012 的核心依赖规则，应阻断最终人工验收。计划调整后实际实例与回执不一致、拒绝后近似重提，以及自然时间来源校验也需修复。

**Agent 具备真实有限自治能力。** DeepSeek 根据观察选择动作。浏览器执行受限操作、实际提交状态并回传结果，模型可继续、结束或等待。初始规划使用 Workflow，日常调度与写入采用确定性程序。没有新增模型供应商、账号、数据库、后台日程、额外记忆服务或多 Agent，满足轻量 Demo 的架构范围。真实功能样例只能证明对应路径可运行。

原有 98 个 ID 全部核对。原矩阵的 97 PASS、1 PARTIAL 为开发者自主状态。**独立结果 71 PASS、26 PARTIAL、0 FAIL、1 UNVERIFIED。** 另列出 7 项细化检查，包含两个被汇总状态掩盖的硬约束、一项继承的发送告知缺口，以及真实历史驱动调度和原始用户反馈的独立证据缺口。同一缺陷可以影响多条需求。扩展项不计入原 98 项，也不表示新增产品功能。

### 独立验收基线

| 规格来源 | 必须核对的行为 | 对应审查 |
| --- | --- | --- |
| 原始规格 §1–4、§12 | 复用 V1 真实资料与 RAG，初始 Workflow、程序调度、单 Agent；无系统化评测和非目标功能 | WF、AG、LIM、DOC |
| 原始规格 §5、§13.1 及 DEC-012 | 两类任务由模型生成，允许纯一次性；任务字段、独立核验、真实来源及自然间隔、自检依赖门槛 | WF、VAL、EX-02 |
| 原始规格 §6、§9、§10、§13.2 及 DEC-012 | 今日优先、30 分钟和 5 项、同日只添选学、主动推进、欠项与漏练、独立实例、时间与历史、V1 读路径、幂等 | DAY、OBS、AG、EX-01 |
| 原始规格 §7–8、§10–11、§13.3 及 DEC-013、017 | 真实观察、七项动作、回执循环、拒绝和确认、按影响授权、降级、先前调整与实际实践分离 | OBS、AG、UI、VAL、EX-04、EX-06 |
| 原始规格 §13.4、V1 PRD 与 DEC-005、007–011 | 资料导入、核验、回看、原文引用、答疑边界、保存和模型发送告知 | WF、OBS、DAY、LIM、EX-03、EX-07 |
| 原始规格 §14–16 及 DEC-014–018 | 正式 PRD、决策背景／备选／风险、阶段检查点、交付说明与待验证假设 | DOC、EX-05 |

原始规格自 `e7dbdf8` 纳入 Git，至本审查点未改。V1 正式 PRD 用 `git show 734abb6:docs/prd.md` 对照，`其他/prd_target.md` 与 `决策记录.txt` 用于识别早期已放弃的方案。现行 PRD、计划、追踪矩阵、README、AI 和 Prompt 记录均用于比对，未以阶段声明直接判通过。V2 六个阶段检查点依次为 `e7dbdf8`、`cbdf514`、`7ad32c1`、`39f645c`、`71c8dab`、`78fe69f`。原始规格的开发阶段回查依据为 Git 和项目记录。 [V2 规格](v2-spec.md) · [已确认决策](decisions.md#dec-012v2-学习日练习依赖与旧会话兼容) · [开发计划](v2-plan.md) · [正式 PRD](prd.md)

### 实际验证记录

| 编号 | 操作 | 审查实际结果 |
| --- | --- | --- |
| T1 | `node --test`、`npm.cmd run build` | 104 通过、0 失败、0 跳过。Vite 生产构建通过。扫描构建未找到 `DEEPSEEK_API_KEY`、DeepSeek API 地址或 Agent 系统 Prompt；`.env.local` 被忽略且未跟踪。 |
| T2 | 本地 Vercel 实际端口 3001，`node scripts/verify-learning-agent.js http://127.0.0.1:3001/api/learning-agent` | 三例脚本通过。稳定场景先收到非法 GUIDE 的 `invalid_note`，随后 KEEP_PLAN，未写指导或有效计划。明确听辨困难经独立核验得到 GUIDE → `published` → `wait`。只有 3 分钟的反馈得到 ADJUST_PRACTICE → `applied` → `wait`，今日实例及有效定义 6→3 分钟，初始定义 6 分钟。下一次判断输入含尚未实践且无后续实例。脚本通过正式 API，但以程序构造观察，并非真实用户访谈或浏览器提交。 |
| T3 | `node --env-file-if-exists=.env.local scripts/evaluate-learning.js --v2 v2-one-time v2-elapsed` 与 `--v2 v2-mixed v2-one-time` | 排线案例成功生成周期任务，48 小时 = 2880 实际分钟，复核单独为 3 个学习日建议。读书笔记初次不可用、后一次生成纯一次性任务且引用可定位。既有混合键盘／节奏案例本轮未生成计划，CLI 退出码 1。两次 CLI 批次都包含至少一个失败样例，不能以其他样例成功抵销。 |
| T4 | Chrome 无头、独立配置、320px 与本地 Vercel | 通过页面实际上传原有索引卡 PNG，进入分析后得到“现有资料不足，无法生成可靠的学习计划”。同一 PNG 单独走真实识图接口得到 200、processed，识别三条操作；因此本轮未验证成功的图片导入到计划整链。随后用合成已验证快照启动实际 UI，确认今日分组、三个入口和 320px 无横向溢出。真实 /api/chat 回答“交替敲击时要听节奏是否均匀”并返回引用。拦截 Agent 路由返回 503 后仍推进 Day 2、刷新保留问答，从 Day 1 历史看到原问题，并可继续 Day 3。固定模型输出在实际页面验证低影响 6→3、撤销 3→6、接受高影响调整到 14 分钟；V1 快照恢复原问题、当前任务且不造 Day。 |
| T5 | 两日已开始但未完成的合成敲击历史，经实际 /api/chat，封存后请求 /api/learning-agent | 两条真实答复均为 200 answered，保有难点原话及 3／4 条引用；Day 3 实际 Agent 请求含两个历史日的 inProgress、当前 notStarted 和两条旧日问答。首次 Agent 轮失败，无动作或计划写入。一次保留同类上下文的有限回放经真实模型选 GUIDE，独立核验通过，回传 published 后 KEEP_PLAN。以历史触发的真实计划调整本轮未证实。 |
| T6 | 临时内存脚本调用生产调度、观察、执行及校验；固定模型输出仅用于精确复现 | R1–R7 见问题清单。未写入业务代码或测试文件。临时浏览器测试只操作测试配置和本地服务。 |

### 104 项测试的证据价值

- **分析。** [analysisFlow.test.js](../tests/analysisFlow.test.js#L18) 和 [analysisService.test.js](../tests/analysisService.test.js#L31) 多用替身验证分支与协议。名为 `realAnalysis` 的 [realAnalysis.test.js](../tests/realAnalysis.test.js#L45) 测的是正式 HTTP 处理器、前端 Service 与固定上游之间的合同，覆盖实际图片字节、任务引用、候选裁剪、坏前置、有限重试。真实生成另以 T3、T4 计。
- **调度和恢复。** [learningDays.test.js](../tests/learningDays.test.js#L27) 对时钟、配额、依赖、实例和重读快照有具体断言。[learningSessionStorage.test.js](../tests/learningSessionStorage.test.js#L125) 验证自然语言历史和引文保留。测试不充分覆盖修改前已有开始记录和问答的组合。
- **答疑及观察。** [chat.test.js](../tests/chat.test.js#L99) 进入正式处理器，核对语义校验的程序处理、逐字引文、冲突及错误。[learningObservation.test.js](../tests/learningObservation.test.js#L77) 核对项目/日/任务边界、上下文规模、正确提交时机。语义相关性及答案品质须以真实模型结果评判。
- **Agent 与交互。** [learningAgent.test.js](../tests/learningAgent.test.js#L96) 运行同一生产循环，固定的是模型响应，有真正的本地状态差异与回执断言。[teachingInteractions.test.js](../tests/teachingInteractions.test.js#L117) 运行确认和恢复命令。已有前置测试只操作带问答但未开始的实例，已有拒绝测试重复完全相同参数，尚未覆盖 R1、R4、R7。浏览器点击、真实模型选择及文本可读性另有独立证据层。

## B. 完整需求覆盖矩阵

PASS 表示有足够的实现及验证证据。PARTIAL 表示有实质功能及可定位限制。FAIL 表示具体验收条件不满足。UNVERIFIED 表示证据不足。

### 初始 Workflow

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-WF-01 | 区分一次性与周期性；适合重复的知识点进入周期练习。 §5.1、5.3、13.1 | PASS | PARTIAL | 原始两类任务由模型规划并经校验；纯一次性实跑成功，原混合合成样例本轮返回不可用，见 T3。 | [learningAnalysis.js:157](../server/learningAnalysis.js#L157) · [learningAnalysis.js:212](../server/learningAnalysis.js#L212) · [realAnalysis.test.js:147](../tests/realAnalysis.test.js#L147) | I05 |
| V2-WF-02 | 任务保留唯一 ID、名称、类型、目标、可执行步骤、预计时长、单次完成标准、必要前置、引用和可查询状态。 §5.2、13.1 | PASS | PASS | 字段及 ID 双端验证；定义初始化，实例才记录开始及完成。缺字段及旧协议有反例断言。 | [learningAnalysis.js:157](../server/learningAnalysis.js#L157) · [validateLearningPlan.js:58](../src/services/validateLearningPlan.js#L58) · [learningDays.js:8](../src/learningDays.js#L8) · [realAnalysis.test.js:179](../tests/realAnalysis.test.js#L179) | — |
| V2-WF-03 | 周期任务含启动条件、频率、初始周期或复核节点、持续目标及停止／减量／调整条件。默认按 Day N，只有原资料明确自然间隔时按实际时间。 §5.2、5.3 | PASS | PARTIAL | 周期字段可校验；T3 排线返回 2880 实际分钟及独立复核，但 R5 表明无时间的原文也可通过时间结构校验。 | [learningAnalysis.js:151](../server/learningAnalysis.js#L151) · [validateLearningPlan.js:39](../src/services/validateLearningPlan.js#L39) · [realAnalysis.test.js:227](../tests/realAnalysis.test.js#L227) | I04 |
| V2-WF-04 | 无原文依据的周期、频率教学建议明确标记为推导，不伪造引用。 §5.3 | PASS | PARTIAL | recommendation 禁止附原文且详情有标记；R5 显示 source 分支可赋予无时间原文一个实际间隔。 | [validateLearningPlan.js:46](../src/services/validateLearningPlan.js#L46) · [DailyLearningView.jsx:33](../src/DailyLearningView.jsx#L33) · [realAnalysis.test.js:179](../tests/realAnalysis.test.js#L179) | I04 |
| V2-WF-05 | 保留必要依赖。周期练习只按明确可观察动作或自检反馈解锁后续任务，无门槛时可与新知识并行。 §5.3 | PASS | PARTIAL | 明确周期前置走 practiceCompletion 或自检，常规并行成立；确认拆解后旧进行中实例可绕过新见 R1。 | [validateLearningPlan.js:66](../src/services/validateLearningPlan.js#L66) · [learningDays.js:47](../src/learningDays.js#L47) · [learningDays.js:186](../src/learningDays.js#L186) · [learningDays.test.js:70](../tests/learningDays.test.js#L70) | I01 |
| V2-WF-06 | 独立核验类型合理性和运行安排，拒绝不可执行、明显不合理的练习。 §5.4 | PASS | PASS | 独立请求核验候选、逐任务返回判定；裁剪未通过任务及依赖，排线真实返回可执行周期练习。 | [analysis.review.md:1](../server/prompts/analysis.review.md#L1) · [learningAnalysis.js:245](../server/learningAnalysis.js#L245) · [realAnalysis.test.js:252](../tests/realAnalysis.test.js#L252) | — |
| V2-WF-07 | 程序拒绝循环或无效的依赖；受影响的任务不能进入有效路线。 §5.4 | PASS | PASS | 服务端先按有序前置裁剪，浏览器复验；有循环、未知依赖的固定上游样例进入真实处理器后被剔除。 | [learningAnalysis.js:178](../server/learningAnalysis.js#L178) · [validateLearningPlan.js:19](../src/services/validateLearningPlan.js#L19) · [realAnalysis.test.js:252](../tests/realAnalysis.test.js#L252) | 运行时新前置另见 I01。 |
| V2-WF-08 | 核验明确的完成标准、真实来源及事实依据；沿用有界核验，不增加复杂多轮链。 §5.4 | PASS | PASS | 独立核验后再裁剪，精确引用无效直接拦截；冲突样例保留独立任务，失败可返回无可靠路线。 | [learningAnalysis.js:242](../server/learningAnalysis.js#L242) · [analysis.review.md:1](../server/prompts/analysis.review.md#L1) · [realAnalysis.test.js:88](../tests/realAnalysis.test.js#L88) | — |
| V2-WF-09 | 保留真实导入、识图、主题澄清、结构化路线、独立核验和异常输入分支。 §1、4.1、13.1 | PASS | PASS | 生产 Service 连接三段分析，实际上传和固定上游失败/澄清路径见 T1、T3、T4。 | [analysisService.js:33](../src/services/analysisService.js#L33) · [analysisFlow.js:17](../src/analysisFlow.js#L17) · [analysis.js:36](../api/analysis.js#L36) · [realAnalysis.test.js:59](../tests/realAnalysis.test.js#L59) | 输入特定失败见 I05。 |

### 今日学习与会话

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-DAY-01 | 学习页默认今日任务，保留暖色风格及现有任务详情和引用。 §6.1、6.2、13.2 | PASS | PASS | App 对 V2 分支挂载今日页，Warm 配色沿用；浏览器状态及组件检查见 T4。 | [App.jsx:197](../src/App.jsx#L197) · [DailyLearningView.jsx:219](../src/DailyLearningView.jsx#L219) · [index.css:1](../src/index.css#L1) | — |
| V2-DAY-02 | 完整路线主动查看整体目标、当前阶段、完成的一次性任务、后续内容与持续练习。 §6.1 | PASS | PASS | 路线提供整体目标、当前阶段、已完成/后续一次性任务、周期练习和历史日。 | [DailyLearningView.jsx:92](../src/DailyLearningView.jsx#L92) · [LearningTools.jsx:93](../src/LearningTools.jsx#L93) | — |
| V2-DAY-03 | 展示主题、Day N、预计时长、完成进度及两类任务分组。 §6.2 | PASS | PASS | 主题、编号、必做完成数、含选学用时及分组由实例读取，空组据实际隐藏。 | [DailyLearningView.jsx:136](../src/DailyLearningView.jsx#L136) · [DailyLearningView.jsx:219](../src/DailyLearningView.jsx#L219) · [learningDays.test.js:27](../tests/learningDays.test.js#L27) | — |
| V2-DAY-04 | 当前任务详情、原文引用、答疑入口和下一日操作可用；存在教学调整时保留展示位。 §6.2 | PASS | PASS | 当前详情列步骤及引用并能调出现有答疑，下一日按钮和教学更新都在今日页。 | [DailyLearningView.jsx:43](../src/DailyLearningView.jsx#L43) · [DailyLearningView.jsx:247](../src/DailyLearningView.jsx#L247) · [LearningTools.jsx:93](../src/LearningTools.jsx#L93) | — |
| V2-DAY-05 | 调度纳入已满足启动条件且到期的周期练习。 §6.3 | PASS | PASS | 普通调度先检查启动前置与间隔，同时覆盖首次及重复；实际时间在 T3 与固定时钟回归得到核对。 | [learningDays.js:47](../src/learningDays.js#L47) · [learningDays.js:64](../src/learningDays.js#L64) · [learningDays.test.js:54](../tests/learningDays.test.js#L54) | 源时间真实性另见 I04。 |
| V2-DAY-06 | 按明确前置依赖纳入可做的一次性任务。 §6.3 | PASS | PARTIAL | 未开始的实例受明确前置保护；R1 中原进行中一次性任务无需新前置即可完成，并解锁其独立于新节点的后继。 | [learningDays.js:117](../src/learningDays.js#L117) · [learningDays.js:186](../src/learningDays.js#L186) · [learningAgent.test.js:175](../tests/learningAgent.test.js#L175) | I01 |
| V2-DAY-07 | 保留仍需完成的一次性任务，仅在适合的学习日重排。 §6.3、6.6 | PASS | PASS | 一次性未完成在合法日期仍可排程，按上次提供日排序，独立任务可以前进。 | [learningDays.js:55](../src/learningDays.js#L55) · [learningDays.js:88](../src/learningDays.js#L88) · [learningDays.test.js:89](../tests/learningDays.test.js#L89) | — |
| V2-DAY-08 | 生效的调整参与组装，待确认和失败的调整不参与。 §6.3 | PASS | PARTIAL | 未确认变更不装入有效计划，已生效变更参与未来排程；R2 某些今日实例继续旧内容。 | [agentActions.js:133](../src/agentActions.js#L133) · [agentActions.js:175](../src/agentActions.js#L175) · [learningDays.js:129](../src/learningDays.js#L129) | I02 |
| V2-DAY-09 | 默认每日 30 分钟、最多 5 项，可配置，无需填满。剩余配额内同日新解锁只能选学。避免欠项堆积并提供明确结束边界。 §6.3、13.2 | PASS | PARTIAL | 默认 5 项、30 分钟，选学使用剩余配额，空日/结束语存在；R6 自定义限额可让有效任务永久排不进去。 | [learningDays.js:69](../src/learningDays.js#L69) · [learningDays.js:102](../src/learningDays.js#L102) · [DailyLearningView.jsx:237](../src/DailyLearningView.jsx#L237) · [learningDays.test.js:89](../tests/learningDays.test.js#L89) | I08 |
| V2-DAY-10 | 每日按已有计划、时长、顺序和调度纯程序组装。 §6.3、4.2 | PASS | PASS | openDay 消费计划、时间、排序和实例；勾选仍纯程序，调用在事务结束后。 | [learningDays.js:88](../src/learningDays.js#L88) · [learningDays.js:173](../src/learningDays.js#L173) · [useDailyLearning.js:57](../src/useDailyLearning.js#L57) | — |
| V2-DAY-11 | 由用户在任意时间主动推进，Day N 与自然日期分开并记录真实操作时间。 §6.4 | PASS | PASS | 同一自然日可推进多次，记录真实操作时刻；自然间隔用 lastPracticedAt，固定时钟分别断言。 | [learningDays.js:55](../src/learningDays.js#L55) · [learningDays.js:173](../src/learningDays.js#L173) · [learningDays.test.js:39](../tests/learningDays.test.js#L39) | — |
| V2-DAY-12 | 允许未全部完成时推进，提示不阻断，独立任务照常。 §6.5、13.2 | PASS | PASS | 未完成提示不禁用下一日；不补写状态，原状态封存，独立任务继续。 | [DailyLearningView.jsx:250](../src/DailyLearningView.jsx#L250) · [learningDays.js:179](../src/learningDays.js#L179) · [learningDays.test.js:39](../tests/learningDays.test.js#L39) | — |
| V2-DAY-13 | 推进前保存本日完成情况与已存在的相关问答，封存旧日、推进编号并组装新日。 §6.5 | PASS | PASS | 切日前状态、现有问答、旧日和新日一次写入；成功后才提供观察，迟到回复仍归旧日。 | [learningObservation.js:55](../src/learningObservation.js#L55) · [useDailyLearning.js:36](../src/useDailyLearning.js#L36) · [learningObservation.test.js:32](../tests/learningObservation.test.js#L32) | — |
| V2-DAY-14 | 周期漏练只记该日未完成，之后依正常节律，无倍量补练或能力下降判定。 §6.6 | PASS | PASS | Day 按提供日、自然间隔按实际练习；无倍补分支，无能力下降写入。 | [learningDays.js:29](../src/learningDays.js#L29) · [learningDays.js:55](../src/learningDays.js#L55) · [learningDays.test.js:39](../tests/learningDays.test.js#L39) | — |
| V2-DAY-15 | 完成一次性任务默认不再排；只有合法巩固行动可重排且不改旧完成记录。 §5.1、6.7、13.2 | PASS | PASS | 普通一次性完成不再排；合法巩固新 ID 且保留历史。 | [learningDays.js:55](../src/learningDays.js#L55) · [agentPlanChanges.js:137](../src/agentPlanChanges.js#L137) · [learningAgent.test.js:334](../tests/learningAgent.test.js#L334) | — |
| V2-DAY-16 | 任务定义与每日实例独立，周期单日完成不等于长期完成或掌握。 §5.1、6.7、13.2 | PASS | PASS | 每日实例独立，真实练习和自检分开；周期任务不会由于一次完成停止或写入掌握。 | [learningDays.js:69](../src/learningDays.js#L69) · [learningDays.js:186](../src/learningDays.js#L186) · [learningDays.test.js:70](../tests/learningDays.test.js#L70) | — |
| V2-DAY-17 | 历史实例保存当时任务内容或版本，后续变更不篡改历史。 §6.7、9.1、9.2 | PASS | PASS | 计划补丁只重排开放日，封存日历史状态和原问答保留；复原测试检查旧时长和时间。 | [learningDays.js:129](../src/learningDays.js#L129) · [learningSessionStorage.js:119](../src/learningSessionStorage.js#L119) · [teachingInteractions.test.js:133](../tests/teachingInteractions.test.js#L133) | 当前日版本边界见 I02。 |
| V2-DAY-18 | 保留初始计划与有效计划、每日编号／开始时间／实例／完成时间；刷新恢复进度和有效计划。 §9.1、9.2、13.2 | PASS | PASS | 版本化快照区分初始与有效计划，并校验实例、配额和来源；重读覆盖正式存储模块。 | [learningSessionStorage.js:136](../src/learningSessionStorage.js#L136) · [learningSessionStorage.js:183](../src/learningSessionStorage.js#L183) · [learningDays.test.js:134](../tests/learningDays.test.js#L134) | — |
| V2-DAY-19 | 保留 V1 进度、问答和资料，可继续用兼容视图。不补造 Day 和时长、不强制迁移。新项目使用 V2。 §9.3 | PASS | PASS | 新项目 V2，旧快照不推导 Day，V1 恢复原进度、资料和问答，旧视图不能覆盖 V2。 | [useAnalysis.js:6](../src/useAnalysis.js#L6) · [App.jsx:195](../src/App.jsx#L195) · [learningSessionStorage.js:183](../src/learningSessionStorage.js#L183) · [learningDays.test.js:166](../tests/learningDays.test.js#L166) | — |
| V2-DAY-20 | 重复点击推进或重复完成时不重复创建学习日、实例或进度。 §9.2、10.4 | PASS | PARTIAL | 同日命令、实例状态及事件幂等，支持 Web Locks 的原子路径；无锁多页仍有写竞争。 | [learningDays.js:173](../src/learningDays.js#L173) · [useDailyLearning.js:57](../src/useDailyLearning.js#L57) · [learningDays.test.js:121](../tests/learningDays.test.js#L121) | I06 |
| V2-DAY-21 | 保留独立回看、已结束记录和引用，回看不推进当前学习。 §13.4 | PASS | PASS | 历史与选学/预览分别进入只读详情或可做实例，实际进度独立，来源共用原批次。 | [DailyLearningView.jsx:172](../src/DailyLearningView.jsx#L172) · [DailyLearningView.jsx:243](../src/DailyLearningView.jsx#L243) · [LearningTools.jsx:13](../src/LearningTools.jsx#L13) · [learningProgress.test.js:25](../tests/learningProgress.test.js#L25) | — |

### 观察与问答

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-OBS-01 | 汇集当日与历史完成状态、周期练习记录、未完成模式、一次性进度及依赖阶段。 §7.2A、6.6 | PASS | PASS | 实际接口收到了 Day 1/2 进行中、Day 3 未开始及依赖；以实际时间、周期概要和近期日表达。 | [learningObservation.js:95](../src/learningObservation.js#L95) · [learningObservation.js:133](../src/learningObservation.js#L133) · [learning-agent.js:42](../api/learning-agent.js#L42) · [learningObservation.test.js:104](../tests/learningObservation.test.js#L104) | — |
| V2-OBS-02 | 观察已执行调整及其后续表现，把行动回执与学习效果分别记录。 §7.2A、7.10 | PASS | PARTIAL | 既往已调整和随后的练习分开；R3 修订后完成的当日实例不会被计为后续表现。 | [learningObservation.js:78](../src/learningObservation.js#L78) · [learningAgent.js:61](../src/learningAgent.js#L61) · [learningObservation.test.js:128](../tests/learningObservation.test.js#L128) | I02 |
| V2-OBS-03 | 读取困难、困惑、时间限制、重复提问及已经提供的帮助。 §7.2B、7.3 | PASS | PASS | 真实两条历史问答均带原话和答复进入随后实际请求，答复作为已给帮助。 | [chat.js:175](../api/chat.js#L175) · [learningObservation.js:109](../src/learningObservation.js#L109) · [learningObservation.js:156](../src/learningObservation.js#L156) · [chat.test.js:65](../tests/chat.test.js#L65) | — |
| V2-OBS-04 | 有界地读取初始与有效计划、相关原始资料、近期及相关对话；无新画像和记忆服务。 §7.2、7.3 | PASS | PASS | 初始/有效计划、资料片段及近期与相关记录进生产请求，输入有上限；拆解保留原任务 ID，历史被保留。 | [learningObservation.js:95](../src/learningObservation.js#L95) · [learningObservation.js:118](../src/learningObservation.js#L118) · [learning-agent.js:42](../api/learning-agent.js#L42) | 多跳历史的相关优先级是有界摘要限制。 |
| V2-OBS-05 | 问答含项目 ID、学习日、可选任务 ID、问题、回答和时间。无当前任务时可基于项目资料提问。 §7.3、9.1 | PASS | PASS | 消息携带项目、学习日、可空任务、实例、时间及正文，项目答疑经同一真实处理器。 | [useLearningChat.js:5](../src/useLearningChat.js#L5) · [chat.js:51](../api/chat.js#L51) · [learningSessionStorage.js:42](../src/learningSessionStorage.js#L42) · [chat.test.js:45](../tests/chat.test.js#L45) | — |
| V2-OBS-06 | 继承任务上下文问答和轻量 RAG，保留历史可查与引用验证。 §7.3、13.4 | PASS | PASS | 关键词候选、语义重排、核验、逐字引用与存储重验均有实际链路；T4 见真实答疑结果。 | [chatRag.js:85](../server/chatRag.js#L85) · [chat.js:175](../api/chat.js#L175) · [learningSessionStorage.js:68](../src/learningSessionStorage.js#L68) · [chat.test.js:168](../tests/chat.test.js#L168) | — |
| V2-OBS-07 | 保存完成并且状态提交后提供下一学习日观察机会。 §7.4、6.5 | PASS | PASS | 先保存同时记录唯一 nextDay 事件，再启动 Agent；模拟存储失败不启动。 | [useDailyLearning.js:36](../src/useDailyLearning.js#L36) · [useDailyLearning.js:57](../src/useDailyLearning.js#L57) · [learningObservation.test.js:32](../tests/learningObservation.test.js#L32) | — |
| V2-OBS-08 | 纳入任务级和项目级新学习反馈、澄清回复；普通知识问答不触发即时观察。 §7.4、8.4 | PASS | PASS | 最新任务困难可立即观察；项目反馈保留给后续观察，真正澄清回复再开轮；普通知识不触发。 | [learningObservation.js:35](../src/learningObservation.js#L35) · [learningObservation.js:111](../src/learningObservation.js#L111) · [teachingInteractions.js:11](../src/teachingInteractions.js#L11) · [learningObservation.test.js:57](../tests/learningObservation.test.js#L57) · [teachingInteractions.test.js:48](../tests/teachingInteractions.test.js#L48) | 跨日迟到回复等到后续观察，符合记录边界。 |
| V2-OBS-09 | 普通勾选、渲染和无变化不调用模型；重复反馈或同一事件不重复发起。 §7.4、12.9、10.4 | PASS | PARTIAL | 单页已对相同反馈及事件去重；语义近义看模型结果，多页无锁时仍有竞争窗口。 | [learningObservation.js:35](../src/learningObservation.js#L35) · [learningAgent.js:43](../src/learningAgent.js#L43) · [useDailyLearning.js:57](../src/useDailyLearning.js#L57) · [chat.test.js:88](../tests/chat.test.js#L88) | I06 |
| V2-OBS-10 | 跨日、项目重置和任务调整期间的迟到答复不串关联，历史问答仍可恢复。 §9.2、7.3 | PASS | PASS | 迟到请求仍更新原上下文，持久化校验任务/日/项目，尚未开始的拆解实例保留原问答。 | [useLearningChat.js:34](../src/useLearningChat.js#L34) · [chatMessages.js:33](../src/chatMessages.js#L33) · [learningSessionStorage.js:42](../src/learningSessionStorage.js#L42) · [learningObservation.test.js:77](../tests/learningObservation.test.js#L77) · [learningAgent.test.js:175](../tests/learningAgent.test.js#L175) | 进行中调整的版本归属见 I02。 |

### 有限自治和执行

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-AG-01 | 模型根据实际观察决定是否干预、证据够不够、如何行动和何时等待。 §4.3、7.1、7.4 | PASS | PASS | 实际 frame 和回执进入一次判断；正常、困难、调整三条真实路径分别走出不同决策，模型可停止。 | [learning-agent.js:69](../api/learning-agent.js#L69) · [learningAgent.js:121](../src/learningAgent.js#L121) · [learningAgent.js:154](../src/learningAgent.js#L154) · [verify-learning-agent.js:67](../scripts/verify-learning-agent.js#L67) | — |
| V2-AG-02 | 默认保守；普通问题和偶发漏练不自动调整，区分没时间、没执行、没理解、不熟练；严重即时困难可及时帮助，证据不足可等待。 §7.5.1–6 | PASS | PASS | Prompt 要求区分困难、时间和未执行，程序只提供机会；真实试跑可保持，任务困难可即时进入。 | [learning-agent.system.md:1](../server/prompts/learning-agent.system.md#L1) · [learningObservation.js:35](../src/learningObservation.js#L35) · [learningObservation.test.js:57](../tests/learningObservation.test.js#L57) | 严重性识别和处理质量待后续评测。 |
| V2-AG-03 | 优先低成本小动作；参考先前帮助，避免重复、盲目降标和按自评判定掌握；不改历史及无故全量重规划。 §7.5.7–12 | PASS | PARTIAL | 默认低影响，原目标和封存历史受限，重复指导有检查；拒绝后近似提案及持续等待边界见 R4、R7。 | [agentActions.js:96](../src/agentActions.js#L96) · [agentActions.js:110](../src/agentActions.js#L110) · [learning-agent.system.md:1](../server/prompts/learning-agent.system.md#L1) · [learningAgent.test.js:136](../tests/learningAgent.test.js#L136) | I03、I07 |
| V2-AG-04 | KEEP_PLAN 正常结束，无计划变动和重复提示。 §7.6 Action 1、8.6 | PASS | PASS | KEEP_PLAN 收到 kept 后无变更或提示，本轮真实样例最终选择该行动。 | [agentActions.js:81](../src/agentActions.js#L81) · [learningAgent.js:92](../src/learningAgent.js#L92) · [learningAgent.test.js:79](../tests/learningAgent.test.js#L79) | 真实样例先拒绝了一次不合法 GUIDE。 |
| V2-AG-05 | GUIDE 实际发布有任务归属和资料支持的教学提示，不写计划。 §7.6 Action 2 | PASS | PASS | GUIDE 经逐字文证和独立支持核验发布，实际出现 published 回执且不写计划。 | [agentActions.js:89](../src/agentActions.js#L89) · [learningAgent.js:164](../src/learningAgent.js#L164) · [TeachingUpdates.jsx:123](../src/TeachingUpdates.jsx#L123) · [learningAgent.test.js:96](../tests/learningAgent.test.js#L96) | — |
| V2-AG-06 | CLARIFY 发出简短且未回答过的问题，允许等待。 §7.6 Action 3 | PASS | PARTIAL | 实际发布 asked，用户可等待和回复；程序只核对同任务最近一条及问题逐字等价，语义上已答依赖模型。 | [agentActions.js:89](../src/agentActions.js#L89) · [teachingInteractions.js:11](../src/teachingInteractions.js#L11) · [learningAgent.test.js:118](../tests/learningAgent.test.js#L118) | I10 |
| V2-AG-07 | DECOMPOSE_TASK 实际生成局部子任务，保留原目标、必要依赖和资料依据。 §7.6 Action 4 | PASS | PARTIAL | 确实创建顺序子任务并保留目标、来源与原依赖；R1 中进行中任务绕过接受后新增前置。 | [agentPlanChanges.js:101](../src/agentPlanChanges.js#L101) · [learningDays.js:186](../src/learningDays.js#L186) · [learningAgent.test.js:149](../tests/learningAgent.test.js#L149) | I01 |
| V2-AG-08 | ADJUST_PRACTICE 可调整时长、频率、难度、步骤和复核时机，只改必要字段。 §7.6 Action 5 | PASS | PARTIAL | 五类字段均可落入有效计划，真实结果 6→3；R2 有旧问答的进行中实例明示接受后仍读原值。 | [agentPlanChanges.js:78](../src/agentPlanChanges.js#L78) · [agentActions.js:175](../src/agentActions.js#L175) · [learningDays.js:142](../src/learningDays.js#L142) · [learningAgent.test.js:203](../tests/learningAgent.test.js#L203) | I02 |
| V2-AG-09 | RESCHEDULE 可后延、独立提前、减负或重排复习，依赖始终有效。 §7.6 Action 6 | PASS | PARTIAL | 未来延期、优先与巩固调度可执行；进行中实例在接受延期后仍显示可完成，同 R1 的读执行分支。 | [agentPlanChanges.js:121](../src/agentPlanChanges.js#L121) · [learningDays.js:117](../src/learningDays.js#L117) · [learningDays.js:186](../src/learningDays.js#L186) · [learningAgent.test.js:334](../tests/learningAgent.test.js#L334) | I01 |
| V2-AG-10 | CHECK_MASTERY 产生简单自我检验任务，结果是自评／有限检验。 §7.6 Action 7 | PASS | PASS | 生成独立选学任务、进入配额，页面可开始并勾选真实自检条件，没有掌握字段。 | [agentPlanChanges.js:70](../src/agentPlanChanges.js#L70) · [DailyLearningView.jsx:66](../src/DailyLearningView.jsx#L66) · [learningDays.js:186](../src/learningDays.js#L186) · [learningAgent.test.js:357](../tests/learningAgent.test.js#L357) | — |
| V2-AG-11 | 执行真实工具并把结果交回同一判断循环，模型能继续、结束或等待。 §7.7、13.3 | PASS | PASS | 浏览器执行并保存回执，下轮直接请求携带真实结果；T2 指导及调整后继续观察再等待。 | [learningAgent.js:77](../src/learningAgent.js#L77) · [learningAgent.js:154](../src/learningAgent.js#L154) · [learningAgent.js:176](../src/learningAgent.js#L176) · [learningAgent.test.js:96](../tests/learningAgent.test.js#L96) | — |
| V2-AG-12 | 限制上下文、工具、模型次数、总耗时及重试；禁止无限执行或任意外部工具。 §7.7、7.9、12.8 | PASS | PASS | 单轮工具 3、判断 4、模型请求 5、整体 34 秒，服务器单次 12 秒；非法预算内修正且无任意外部工具。 | [learningAgent.js:7](../src/learningAgent.js#L7) · [learningAgent.js:121](../src/learningAgent.js#L121) · [learning-agent.js:49](../api/learning-agent.js#L49) · [learningAgent.test.js:448](../tests/learningAgent.test.js#L448) | — |
| V2-AG-13 | 工具校验／执行成功不代表教学有效，后续效果取真实反馈。 §7.7、7.10 | PASS | PARTIAL | 成功回执和效果独立，后续指令未设掌握；R3 完成了修订实例但仍被当作尚未实践。 | [learningAgent.js:77](../src/learningAgent.js#L77) · [learningObservation.js:78](../src/learningObservation.js#L78) · [learningAgent.test.js:259](../tests/learningAgent.test.js#L259) | I02 |
| V2-AG-14 | 结构化保存干预判断、问题、真实证据、动作、目标、参数、简短原因、确认需求、结果和终态。 §7.8、9.1、13.3 | PASS | PASS | 记录结构化决策、证据、实际动作、确认、回执及终态；未知证据不存为有效依据。 | [learningAgent.js:77](../src/learningAgent.js#L77) · [agentActions.js:74](../src/agentActions.js#L74) · [learningAgent.js:15](../src/learningAgent.js#L15) | 细分网络和输出诊断见 I09。 |
| V2-AG-15 | 禁止改整体目标、删原始资料、回写历史、直接标完成、虚报掌握、重生全计划及脱离主题。 §7.9 | PASS | PASS | 白名单及协议不能改主题/原文/封存历史，不能写完成/掌握；教学内容做独立来源审核。 | [agentActions.js:6](../src/agentActions.js#L6) · [agentActions.js:126](../src/agentActions.js#L126) · [agentPlanChanges.js:152](../src/agentPlanChanges.js#L152) · [learningAgent.test.js:375](../tests/learningAgent.test.js#L375) | 新前置执行另见 I01。 |
| V2-AG-16 | 程序统一校验：教学提示、重新讲解、无历史覆盖的辅助练习及低影响未来调整可直接生效。已开始当前任务的实质性变更或高影响变更须确认。 §7.9、8.5 | PASS | PASS | 由程序计算影响、待确认前不写有效计划；真正提交使用当前 delta 比对，程序定义可自动生效的调整。 | [agentPlanChanges.js:78](../src/agentPlanChanges.js#L78) · [agentPlanChanges.js:101](../src/agentPlanChanges.js#L101) · [agentActions.js:142](../src/agentActions.js#L142) · [agentActions.js:175](../src/agentActions.js#L175) | 确认后的实例执行见 I01、I02。 |
| V2-AG-17 | 调整过的任务未实践时默认等待，严重新困难或明显调整问题才可例外。 §7.10 | PASS | PARTIAL | 通常可保护待实践；依赖仅最后 5 个调整，R7 旧待实践目标落出窗口后再次调整，R3 又会误判已完成的修订。 | [learningObservation.js:78](../src/learningObservation.js#L78) · [agentActions.js:117](../src/agentActions.js#L117) · [learningAgent.test.js:304](../tests/learningAgent.test.js#L304) | I02、I07 |
| V2-AG-18 | 保存调整前后差异、原因、任务、用户确认状态与生效时间，不覆盖初始计划。 §9.1、9.2 | PASS | PASS | 调整记录保存前后差异、目标、状态、原因和生效时间；初始路线仍可读取，恢复留单独变更。 | [agentActions.js:133](../src/agentActions.js#L133) · [agentActions.js:167](../src/agentActions.js#L167) · [learningSessionStorage.js:156](../src/learningSessionStorage.js#L156) · [teachingInteractions.test.js:133](../tests/teachingInteractions.test.js#L133) | — |
| V2-AG-19 | 请求失败、超时或输出不可用时继续用有效计划组装，保留历史并记异常。 §10.1、13.3 | PASS | PASS | Agent 失败写轮次状态，切日已经持久化；上游超时、网络及协议异常动态断言。 | [useDailyLearning.js:36](../src/useDailyLearning.js#L36) · [learningAgent.js:186](../src/learningAgent.js#L186) · [learningAgent.test.js:448](../tests/learningAgent.test.js#L448) · [learningAgent.test.js:470](../tests/learningAgent.test.js#L470) | 失败类别细化见 I09。 |
| V2-AG-20 | 拒绝未知任务、非法参数、依赖或越权，预算内可修正，超额终止。 §10.2 | PASS | PASS | 未知任务、非法字段、环、越权类型不执行，独立核验失败无补丁，合法修正再提交。 | [agentActions.js:74](../src/agentActions.js#L74) · [agentPlanChanges.js:152](../src/agentPlanChanges.js#L152) · [learningAgent.js:154](../src/learningAgent.js#L154) · [learningAgent.test.js:375](../tests/learningAgent.test.js#L375) | 已授权的新前置执行见 I01。 |
| V2-AG-21 | 缺历史时可保持、澄清或根据已表达的即时困难局部帮助。 §10.3 | PASS | PASS | 缺历史仍可保持、指导或澄清；T2 首次困难出 GUIDE，无额外虚构历史记录作为输入。 | [learningObservation.js:95](../src/learningObservation.js#L95) · [agentActions.js:89](../src/agentActions.js#L89) · [verify-learning-agent.js:67](../scripts/verify-learning-agent.js#L67) | — |
| V2-AG-22 | 重复应用、过期响应、重复接受和并发写入不会生成重复动作或损坏状态。 §9.2、10.4 | PARTIAL | PARTIAL | 有锁串行、旧修订检查及重复确认保护；无锁跨标签页为已知限制。 | [useDailyLearning.js:22](../src/useDailyLearning.js#L22) · [useDailyLearning.js:57](../src/useDailyLearning.js#L57) · [learningAgent.js:176](../src/learningAgent.js#L176) · [learningAgent.test.js:448](../tests/learningAgent.test.js#L448) | I06 |

### 教学交互

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-UI-01 | 教学干预融入现有学习页与答疑，不增加独立 Agent 后台。 §8.1 | PASS | PASS | 今日卡片及三个原有入口提供教学交互，默认闭合、没有独立控制台。 | [DailyLearningView.jsx:247](../src/DailyLearningView.jsx#L247) · [LearningTools.jsx:49](../src/LearningTools.jsx#L49) · [TeachingUpdates.jsx:92](../src/TeachingUpdates.jsx#L92) | — |
| V2-UI-02 | 指导简短、关联任务，不展示无依据鼓励或重复寄语。 §8.2 | PASS | PASS | 短指导按日和任务呈现，原文可定位；程序对同轮及无新同任务证据拦重。 | [agentActions.js:89](../src/agentActions.js#L89) · [TeachingUpdates.jsx:98](../src/TeachingUpdates.jsx#L98) · [learningAgent.test.js:136](../tests/learningAgent.test.js#L136) | — |
| V2-UI-03 | 今日轻量提示可查看原因、受影响任务和生效后的新安排。 §8.3 | PASS | PARTIAL | 可看原因、任务及前后值，实跑未开始实例确实改变；R2 今日计划差异与实际练习详情可能不一致。 | [TeachingUpdates.jsx:19](../src/TeachingUpdates.jsx#L19) · [TeachingUpdates.jsx:57](../src/TeachingUpdates.jsx#L57) · [learningDays.js:142](../src/learningDays.js#L142) | I02 |
| V2-UI-04 | 尚未产生关联学习记录或反馈的调整可撤销。 §8.3、4.2 | PASS | PASS | 无关联事件的生效变更显示撤销并走反向 delta，重复命令无新写入。 | [TeachingUpdates.jsx:77](../src/TeachingUpdates.jsx#L77) · [agentActions.js:155](../src/agentActions.js#L155) · [teachingInteractions.test.js:133](../tests/teachingInteractions.test.js#L133) | — |
| V2-UI-05 | 已产生关联学习记录或反馈的调整通过新变更恢复安排，保留历史。 §8.3 | PASS | PASS | 有关联学习记录则显示恢复并新增记录，封存实例和已完成值仍保留。 | [agentActions.js:148](../src/agentActions.js#L148) · [agentActions.js:185](../src/agentActions.js#L185) · [TeachingUpdates.jsx:77](../src/TeachingUpdates.jsx#L77) · [teachingInteractions.test.js:133](../tests/teachingInteractions.test.js#L133) | 已撤销状态的历史保留取决于当前实例版本，见 I02。 |
| V2-UI-06 | 复用答疑处理澄清，可答或忽略，未答时可以继续学习。 §8.4 | PASS | PASS | 问答面板可答、可暂缓，历史可回复，保存后才重新观察；没有回复也可切日。 | [ChatPanel.jsx:4](../src/ChatPanel.jsx#L4) · [ChatPanel.jsx:101](../src/ChatPanel.jsx#L101) · [teachingInteractions.js:11](../src/teachingInteractions.js#L11) · [teachingInteractions.test.js:48](../tests/teachingInteractions.test.js#L48) | — |
| V2-UI-07 | 高影响调整可接受或拒绝，拒绝留原计划与结果，无新证据不反复提。 §8.5、13.3 | PASS | PARTIAL | 确认与拒绝可操作，拒绝保持当前计划；R4 无新证据仅微调参数仍能重新出现同方向提案。 | [TeachingUpdates.jsx:77](../src/TeachingUpdates.jsx#L77) · [agentActions.js:110](../src/agentActions.js#L110) · [agentActions.js:175](../src/agentActions.js#L175) · [teachingInteractions.test.js:117](../tests/teachingInteractions.test.js#L117) | I03 |
| V2-UI-08 | 无干预直接进入学习，无额外步骤和技术日志展示。 §8.6 | PASS | PASS | 只对有效指导和变更渲染教学区域，KEEP_PLAN 不插入提示也不拦切日。 | [TeachingUpdates.jsx:92](../src/TeachingUpdates.jsx#L92) · [TeachingUpdates.jsx:120](../src/TeachingUpdates.jsx#L120) · [DailyLearningView.jsx:209](../src/DailyLearningView.jsx#L209) · [learningAgent.test.js:79](../tests/learningAgent.test.js#L79) | — |

### 功能场景与回归

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-VAL-01 | 稳定学习中基础练习与新知并行，Agent 可保持原计划。 §11 场景一 | PASS | PASS | 固定计划中的两种任务并行，正常样例真实 DeepSeek 最终保持且无计划变更。 | [learningDays.test.js:27](../tests/learningDays.test.js#L27) · [verify-learning-agent.js:67](../scripts/verify-learning-agent.js#L67) | 混合初始生成另看 I05。 |
| V2-VAL-02 | 偶尔未完成不阻塞次日或自动调整。 §11 场景二 | PASS | PASS | 部分完成时跨日，未完成不补记；不存在程序强制教学调整条件。 | [learningDays.js:179](../src/learningDays.js#L179) · [learningObservation.js:35](../src/learningObservation.js#L35) · [learningDays.test.js:39](../tests/learningDays.test.js#L39) | — |
| V2-VAL-03 | 持续困难且问答提供证据，模型可选择拆解或练习调整并观察后续。 §11 场景三 | PASS | PARTIAL | 固定响应验证历史困难到实际改动及反馈，真实历史调用另见 T5；已改实例的真实表现识别有 R3 缺口。 | [learningAgent.test.js:259](../tests/learningAgent.test.js#L259) · [learningObservation.js:78](../src/learningObservation.js#L78) · [learningAgent.js:154](../src/learningAgent.js#L154) | I02 |
| V2-VAL-04 | 首次明确严重困难即可局部帮助，无需等待多日。 §11 场景四 | PASS | PASS | 真实首次困难经模型指导、独立核验、存储 published，继而等待。历史不作为前置门槛。 | [verify-learning-agent.js:72](../scripts/verify-learning-agent.js#L72) · [learningObservation.js:45](../src/learningObservation.js#L45) · [learningAgent.js:164](../src/learningAgent.js#L164) | 真实脚本直接写反馈，与浏览器识别分开验证。 |
| V2-VAL-05 | 多次完成并自评熟练允许安排自检，不能自动认定掌握。 §11 场景五 | PASS | PASS | 多次完成与自述只是观察；独立自检可执行及记录，不改变主线完成或掌握。 | [learningAgent.test.js:285](../tests/learningAgent.test.js#L285) · [agentPlanChanges.js:70](../src/agentPlanChanges.js#L70) · [DailyLearningView.jsx:66](../src/DailyLearningView.jsx#L66) | 自检判断质量留待后续评测。 |
| V2-VAL-06 | 拆解后尚未实践时等待反馈，无相同重复改动。 §11 场景六 | PASS | PARTIAL | 单次拆解后尚未练习能拦重复调整；R7 超出观察窗口后该保护失效。 | [learningAgent.test.js:304](../tests/learningAgent.test.js#L304) · [agentActions.js:117](../src/agentActions.js#L117) · [learningObservation.js:78](../src/learningObservation.js#L78) | I07 |
| V2-VAL-07 | Agent 不可用时按当前计划继续。 §11 场景七 | PASS | PASS | 注入 503 或超时后仍继续使用有效计划，失败未记作生效。 | [learningAgent.test.js:448](../tests/learningAgent.test.js#L448) · [useDailyLearning.js:36](../src/useDailyLearning.js#L36) · [learningAgent.js:186](../src/learningAgent.js#L186) | 浏览器记录见 T4。 |
| V2-VAL-08 | 真实 DeepSeek 至少验证不干预、局部指导和任务调整。 §13.1–13.3 | PASS | PASS | 本地 Vercel 实际完成保持、正向指导及已提交调整，状态、回执均有核对。 | [verify-learning-agent.js:51](../scripts/verify-learning-agent.js#L51) · [verify-learning-agent.js:67](../scripts/verify-learning-agent.js#L67) · [learning-agent.js:69](../api/learning-agent.js#L69) | 单次样例，不代表模型效果。 |
| V2-VAL-09 | 回归 V1 资料输入、真实分析与生成、任务展示、原图／原文与引用。 §13.4 | PASS | PARTIAL | 实际 PNG 上传到规划失败；同一文件经真实识图通过，处理器固定上游覆盖图片字节、失败后确认、冲突、澄清。 | [App.jsx:114](../src/App.jsx#L114) · [analysisService.js:33](../src/services/analysisService.js#L33) · [realAnalysis.test.js:59](../tests/realAnalysis.test.js#L59) · [realAnalysis.test.js:88](../tests/realAnalysis.test.js#L88) | 特定混合路线未通过见 I05。 |
| V2-VAL-10 | 回归 V1 任务上下文答疑、轻量 RAG、来源约束、历史回看及恢复。 §13.4 | PASS | PASS | T4 真实引文答疑及历史归属，固定上游覆盖资料外拒答、伪造引用和同任务追问；V1 快照历史重读。 | [chat.test.js:99](../tests/chat.test.js#L99) · [chat.test.js:225](../tests/chat.test.js#L225) · [learningSessionStorage.test.js:125](../tests/learningSessionStorage.test.js#L125) · [chat.js:190](../api/chat.js#L190) | — |
| V2-VAL-11 | 完成必要功能与回归，不开展系统化质量、竞品、留存或价值实验。 §1、13、14.4 | PASS | PASS | 重新执行功能、回归和受控反例；阶段记录也明确区分脚本与真实功能，没有用功能试跑推导留存或模型准确率。 | [v2-plan.md:84](../docs/v2-plan.md#L84) · [prompt-evaluation.md:96](../docs/prompt-evaluation.md#L96) · [prd.md:95](../docs/prd.md#L95) | — |

### 文档与交付

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-DOC-01 | 正式 PRD 重组到 V2，覆盖背景、需求、定位、演进、流程、任务类型、学习日、Agent 边界、职责、范围和非目标。 §14.1 | PASS | PARTIAL | V2 PRD 已重组，主要流程和边界齐全；旧版条款提示要求未完整承接，观察及前置保护说明强于实际。 | [prd.md:24](../docs/prd.md#L24) · [prd.md:65](../docs/prd.md#L65) · [prd.md:91](../docs/prd.md#L91) · [decisions.md:120](../docs/decisions.md#L120) | I01、I02、I11 |
| V2-DOC-02 | 记录从启动扩展到持续学习，区分反馈、原因分析和待验价值假设。 §14.2 A | PASS | PASS | V1 定性反馈、可能原因与持续使用待验证分开；决策说明为何优先学习阶段。 | [v2-spec.md:43](../docs/v2-spec.md#L43) · [prd.md:5](../docs/prd.md#L5) · [decisions.md:126](../docs/decisions.md#L126) | 访谈原始证据见额外审查项。 |
| V2-DOC-03 | 记录双任务类型、日主页、未完成可推进、历史与依赖、确定性调度。 §14.2 B | PASS | PASS | 说明双任务形态、每日决策负担、允许推进、依赖与历史及程序排程，沿用 DEC-012。 | [decisions.md:105](../docs/decisions.md#L105) · [decisions.md:134](../docs/decisions.md#L134) · [prd.md:32](../docs/prd.md#L32) | — |
| V2-DOC-04 | 记录有限 Agent 的需求驱动、四种方案比较、观察／行动／权限与稳定性取舍。 §14.2 C | PASS | PASS | 四方案均明确，同时保留即时帮助、工具、权限、默认保持、过度干预和响应成本风险。 | [decisions.md:113](../docs/decisions.md#L113) · [decisions.md:142](../docs/decisions.md#L142) · [prd.md:65](../docs/prd.md#L65) | 实际稳定性见 I02、I03、I07。 |
| V2-DOC-05 | 记录混合架构、DeepSeek 与轻量 RAG 复用、保持 Demo 边界的理由。 §14.2 D | PASS | PASS | 初始 Workflow、程序状态和教学判断的分工及复用理由均有记录。 | [decisions.md:150](../docs/decisions.md#L150) · [prd.md:53](../docs/prd.md#L53) · [README.md:18](../README.md#L18) | — |
| V2-DOC-06 | 沿用 DEC 编号，每项保留背景、备选、决定、理由、收益、风险及验证方向。 §14.2 | PASS | PASS | 续用既有编号；DEC-015～018 均含背景、备选、决定、理由、预期、风险及验证。DEC-012～014 记录先行确认和阶段机制。 | [decisions.md:105](../docs/decisions.md#L105) · [decisions.md:120](../docs/decisions.md#L120) · [decisions.md:126](../docs/decisions.md#L126) | — |
| V2-DOC-07 | 更新 README、实际架构、阶段进展、功能范围、数据结构／API 说明并复用现有记录。 §14.3 | PASS | PARTIAL | 技术、运行命令、三接口、状态模型和阶段点已更新；失败分类和当前实例/观察的记录口径需随修复同步。 | [README.md:18](../README.md#L18) · [prd.md:80](../docs/prd.md#L80) · [v2-plan.md:75](../docs/v2-plan.md#L75) | I02、I09、I11 |
| V2-DOC-08 | 仅记录后续评测方向：持续学习、周期安排、干预时机与动作、困难缓解、计划稳定、成本与耗时。 §14.4 | PASS | PASS | 持续行为、周期安排、干预、缓解、稳定、时间与成本均写为未来方向。 | [decisions.md:126](../docs/decisions.md#L126) · [decisions.md:150](../docs/decisions.md#L150) · [prd.md:95](../docs/prd.md#L95) | — |
| V2-DOC-09 | 各阶段重读需求与计划，按 ID 开发、测试并上传证据；披露部分和限制，自主审查并单独提交，收到「继续」再推进。最终统一人工验收。 §1、15、16 | PASS | UNVERIFIED | 六个独立 Commit 与各阶段处置及对应证据存在；Git 和文档无法独立证明每一次重读、逐轮授权与上传证据过程。 | [decisions.md:120](../docs/decisions.md#L120) · [v2-plan.md:75](../docs/v2-plan.md#L75) · [v2-checklist.md:147](../docs/v2-checklist.md#L147) | 不把可见检查点等同于完成全部历史操作。 |
| V2-DOC-10 | 最终交付说明核心功能、V1 差异、Workflow、Agent、数据代码、文档 DEC、测试、限制与后续评测。 §16 | PASS | PARTIAL | 阶段记录加正式文档覆盖 §16 交付主题，已有声明与本轮发现存在差异，限制披露不完整。 | [v2-plan.md:84](../docs/v2-plan.md#L84) · [v2-plan.md:134](../docs/v2-plan.md#L134) · [v2-spec.md:1222](../docs/v2-spec.md#L1222) | I01–I08 |

### 范围与技术边界

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-LIM-01 | 单个有限 Agent，不引入多 Agent、开放自治、复杂 Agent 框架、知识图谱、技能树、复杂事件系统或独立记忆。 §3.2、12.4–7 | PASS | PASS | 单判断循环与本地确定性执行，V1 到 V2 未新增依赖；没有多 Agent 或外部记忆架构。 | [package.json:1](../package.json#L1) · [learningAgent.js:121](../src/learningAgent.js#L121) · [agentActions.js:6](../src/agentActions.js#L6) | — |
| V2-LIM-02 | 沿用 DeepSeek、当前模型配置、识图、规划、独立核验与 RAG；无新增供应商、密钥、向量库、Embedding 或微调。 §3.2、12.1–3 | PASS | PASS | 三个处理器走既有 DeepSeek 环境和模型路径；无额外供应商、Embedding、向量库或微调依赖。 | [learningAnalysis.js:76](../server/learningAnalysis.js#L76) · [chat.js:119](../api/chat.js#L119) · [learning-agent.js:59](../api/learning-agent.js#L59) · [package.json:1](../package.json#L1) | — |
| V2-LIM-03 | 无音视频或绘画专业评分。 §3.2 | PASS | PASS | 自检是文本任务与用户勾选，界面和数据无专业能力评分。 | [DailyLearningView.jsx:66](../src/DailyLearningView.jsx#L66) · [agentPlanChanges.js:42](../src/agentPlanChanges.js#L42) · [learningDays.js:186](../src/learningDays.js#L186) | — |
| V2-LIM-04 | 无日历、推送、后台定时与自动跨日。 §3.2、6.4 | PASS | PASS | 启动下一日来自明确交互；无定时任务、日历、推送及自动跨自然日，计时只参与到期判断。 | [DailyLearningView.jsx:209](../src/DailyLearningView.jsx#L209) · [learningDays.js:55](../src/learningDays.js#L55) · [learningDays.js:179](../src/learningDays.js#L179) · [vercel.json:1](../vercel.json#L1) | — |
| V2-LIM-05 | 无登录、云同步、商业化或新持久化基础设施。 §3.2、9.3 | PASS | PASS | 单本地记录及服务端即时处理，无账号、云同步、数据库或商业化能力。 | [learningSessionStorage.js:9](../src/learningSessionStorage.js#L9) · [learningSessionStorage.js:156](../src/learningSessionStorage.js#L156) · [App.jsx:173](../src/App.jsx#L173) · [package.json:1](../package.json#L1) | — |
| V2-LIM-06 | 无后续追加资料及整体再生成。 §3.2、7.9 | PASS | PASS | 一次性导入口且开始后没有追加，工具白名单无整体重生权限。 | [App.jsx:173](../src/App.jsx#L173) · [LearningTools.jsx:93](../src/LearningTools.jsx#L93) · [agentActions.js:6](../src/agentActions.js#L6) · [agentPlanChanges.js:152](../src/agentPlanChanges.js#L152) | — |
| V2-LIM-07 | 引用溯源、内容边界和服务端密钥保持；优先复用 React/Vite/JS/Tailwind/Vercel 组织。 §12.11–12.13、1 | PASS | PASS | 三接口均服务端环境读取，构建产物未找到 Key 配置标志、DeepSeek API 地址或 Agent Prompt；引用仍用原批次。 | [analysis.js:44](../api/analysis.js#L44) · [learning-agent.js:59](../api/learning-agent.js#L59) · [chat.js:119](../api/chat.js#L119) · [learningSources.js:22](../src/learningSources.js#L22) | 用户发送场景披露缺口另见 I11。 |

### 原矩阵遗漏或合并后需单独判定的约束

| ID | 原始需求及依据 | 开发者状态 | 独立状态 | 实际证据 | 文件及行号 | 问题及修复索引 |
| --- | --- | --- | --- | --- | --- | --- |
| V2-EX-01 | 关键前置与历史版本的一致性，即使原实例已开始并经用户确认（§6.3、7.6、7.9；拆自 DAY-06／AG-07） | — | FAIL | R1：已确认拆解新增必要前置后，进行中的旧实例仍能完成，并据此解锁下游。 | [v2-spec.md:617](../docs/v2-spec.md#L617) · [learningDays.js:117](../src/learningDays.js#L117) · [learningDays.js:186](../src/learningDays.js#L186) | I01 |
| V2-EX-02 | 只有原文明确给出自然间隔才能按实际时间排程（DEC-012 Q1；拆自 WF-03／04） | — | FAIL | R5：真实存在但无任何时间语义的引文通过 source + elapsedMinutes 结构校验。 | [decisions.md:105](../docs/decisions.md#L105) · [validateLearningPlan.js:39](../src/services/validateLearningPlan.js#L39) · [learningAnalysis.js:151](../server/learningAnalysis.js#L151) | I04 |
| V2-EX-03 | 第三方模型发送前告知，覆盖切日等交互发起的 Agent 观察（V1 正式 PRD §5.2；原矩阵未明确追踪） | — | PARTIAL | V1 §5.2 要求模型发送前告知处理边界。首页、答疑、澄清提示发送行为；切日自动观察发送学习记录与问答，按钮附近没有相应说明，正式 PRD 也省略供应商条款口径。 | [App.jsx:164](../src/App.jsx#L164) · [ChatPanel.jsx:113](../src/ChatPanel.jsx#L113) · [ChatPanel.jsx:129](../src/ChatPanel.jsx#L129) · [DailyLearningView.jsx:250](../src/DailyLearningView.jsx#L250) · [learningAgent.js:154](../src/learningAgent.js#L154) · [prd.md:91](../docs/prd.md#L91) | I11 |
| V2-EX-04 | 历史完成状态与问答驱动的真实模型计划调整实例（本轮审查 §7；细化 VAL-03／08） | — | UNVERIFIED | 真实历史已进入 API；重试收到 GUIDE → published → KEEP_PLAN，未演示真实模型因为多日历史自主改计划。程序测试能复现工具实际生效，真实调时样例由用户明确提出三分钟请求。 | [learningAgent.test.js:259](../tests/learningAgent.test.js#L259) · [verify-learning-agent.js:79](../scripts/verify-learning-agent.js#L79) · [learningAgent.js:154](../src/learningAgent.js#L154) | 最终人工验收记录自然情境下的决策及实际状态，本轮单次结果仅见 T5。 |
| V2-EX-05 | 独立复核定性用户反馈的出处及证据限度（原始规格 §2.2、14.2；细化 DOC-02） | — | UNVERIFIED | 原始规格及 DEC-015 支持定性叙述，仓库没有访谈记录或使用明细足以独立核实「大多数」。生效文档未增写样本量、比例或具体引语。 | [v2-spec.md:43](../docs/v2-spec.md#L43) · [decisions.md:126](../docs/decisions.md#L126) · [prd.md:5](../docs/prd.md#L5) | 表述来源为项目提供的定性反馈；评估流失程度需另有证据。 |
| V2-EX-06 | 执行回执反映受影响的实际学习实例版本（§7.7、8.3、9.2；细化 AG-11／UI-03） | — | PARTIAL | 变更前后差异已存，回执只说 applied 加任务 ID。R2 单个旧实例仍按 6 分钟，模型收到的计划显示 3 分钟，无法从回执判别哪个实例已更换版本。 | [v2-spec.md:653](../docs/v2-spec.md#L653) · [learningAgent.js:77](../src/learningAgent.js#L77) · [learningDays.js:142](../src/learningDays.js#L142) · [learningObservation.js:71](../src/learningObservation.js#L71) | I02 |
| V2-EX-07 | 继承 V1 AC01、§5.3 的 10 份、图片格式／大小及长文限制（细化 WF-09） | — | PASS | 授权前置及输入上限属于 WF-09 汇总项。首次导入与文件/文字数和大小检查走正常入口，服务端拒绝过大请求。完整端到端失败样例另见 VAL-09。 | [App.jsx:10](../src/App.jsx#L10) · [materials.js:1](../src/materials.js#L1) · [analysisService.js:9](../src/services/analysisService.js#L9) · [analysis.js:36](../api/analysis.js#L36) | 独立保留 V1 AC01、§5.3 的检查项。 |

## C. 问题清单

### P0｜阻断最终验收

#### I01｜接受任务拆解后，进行中的旧实例可绕过必要前置

- **R1 复现。** 使用 `makePlan()`，推进 Day 2，开始 `first`，先保持进行中。以固定模型输出为它提出 DECOMPOSE_TASK（两个顺序子任务），独立核验返回支持，用户接受。计划已将末个子任务写成 `first` 的新前置。调用完成旧 `day-2:first`，在两个子任务未完成时仍写入 `completed`，并当日解锁 `reflection`。
- **原因。** `currentDayInstances` 对非 `notStarted` 的实例直接放行。执行 `complete` 只查旧实例是 `inProgress`，没有验证新前置；完成后用状态解锁下游。日程延期对进行中实例也使用相同分支。
- **应修复。** 确认改动当前有效实例时，原开始记录可留作历史，但必须暂停受新前置阻挡的旧操作；若方案明确从后续实例生效，改动说明、依赖和调度应一致。覆盖确认、完成、直接下游解锁和撤销，保留原问答及原开始时间。 [拆解提交](../src/agentActions.js#L175) · [旧实例可见性](../src/learningDays.js#L117) · [完成分支](../src/learningDays.js#L186) · [当前回归用例](../tests/learningAgent.test.js#L175)

### P1｜重要产品行为

| 编号 | 实际结果与影响 | 修复建议 |
| --- | --- | --- |
| I02 | **R2、R3，调整生效和学习反馈的版本不一致。** Day 2 先开始 6 分钟周期练习并提问，再确认改为 3 分钟。记录及有效计划是 applied 与 3，今日实例仍是 6，次日才为 3。另一支去掉先前问答，接受后当日实例确实变成 3，用户完成后下一轮却收到 `waitingForPractice: true`、`subsequentPractice: []`，因为开始时间早于变更。 | 变更明确区分今日和未来实例，并把实际影响写入回执与界面。关联实际生效版本与后续操作时间，以此判定新实践。旧问答、原步骤和开始时间可在同一日保留历史。 [实例改写](../src/learningDays.js#L129) · [回执](../src/learningAgent.js#L77) · [后续实践选择](../src/learningObservation.js#L78) |
| I03 | **R4，拒绝后可无新证据近似重提。** 拒绝 6→14 分钟后推进，无新困难或实践，固定输出再提 6→13，第二条待确认成功。现有精确比较可以拦原参数的逐字重发。 | 依任务和变更方向／目的识别近似重提，优先要求适用的新证据；保留改变目标或用户主动反馈后的合法例外。 [拒绝保护](../src/agentActions.js#L110) |
| I04 | **R5，自然时间来源可借用无时间内容。** 用完全有效的原文“交替敲击并听节奏是否均匀。”，建立 `{unit:'elapsedMinutes', interval:99, basis:'source'}`，双端共用 `isValidLearningPlan` 返回 true。匹配为空时 `every` 成立。正确的 48 小时样例已通过，独立语义核验仍有一道保护。 | 结构层须要求可支持所声明自然间隔的非空证据，明确区分复核与练习间隔；支持可识别的等价表示，对超出表达覆盖的情况继续做清晰的核验或降级。 [间隔校验](../src/services/validateLearningPlan.js#L39) · [用途修正](../server/learningAnalysis.js#L151) |
| I05 | **本轮没有复现既有混合资料成功生成，图片实际入口也未获计划。** 既有键盘／节奏样例返回不足；图片真实 OCR 成功但浏览器规划失败；纯一次性首轮失败、后轮成功。有关测试稳定复现的是候选结构、裁剪和通过后调度。这里记录的是实际失败和证据缺口，未定位到某个 Prompt 或单个裁剪条件，也未据此推算失败率。 | 为现有样例保留分阶段的脱敏失败诊断，核对生成、结构拒绝与独立核验分别发生在哪一步；修复可确定的问题后再验证这些现有功能样例。 [生成及裁剪](../server/learningAnalysis.js#L212) · [原样例](../tests/fixtures/v2-workflow-smoke.json) |
| I07 | **R7，等待实践保护依赖模型的五条调整窗口。** 合成六项合法练习调整，均无实际练习，再调整最早任务 a。观察只带 b–f，生产执行器仍返回 applied。 | 保持模型上下文有界，同时以目标任务的实际变更记录做本地授权保护。 [窗口](../src/learningObservation.js#L78) · [执行检查](../src/agentActions.js#L117) |

### P2｜边界问题和 Demo 限制

| 编号 | 判定 | 修复或验收口径 |
| --- | --- | --- |
| I06 | 已披露限制。单页使用串行队列；支持 Web Locks 的浏览器增加跨页锁。其余浏览器的 revision 比较与 localStorage 写入无原子保证，跨页无法据此宣称全覆盖。 | 本地 Demo 可约定用支持 Web Locks 的浏览器或单标签。若要承诺多标签一致性，需要补实现及该环境实测。 [写锁](../src/useDailyLearning.js#L57) |
| I08 | **R6，自定义配额可永久饿死有效任务。** 调度默认 30 分钟正常。给 `createDailySession` 传 20 分钟配额，唯一任务 30 分钟，连续两日都无任务。正式界面不提供调整配额。 | 如果使用内部可配置能力，建计划时应共享配额，或给出可见的适配失败。 [创建及排程](../src/learningDays.js#L69) |
| I09 | 错误写入了轮次终态。浏览器对除 504 外的非成功 HTTP 仅记录通用失败，无法区分网络、配置、格式和模型输出；可诊断性受限，学习降级有效。 | 保留脱敏的错误类别。 [接口错误](../api/learning-agent.js#L49) · [前端归类](../src/learningAgent.js#L102) |
| I10 | 对同任务最近澄清、逐字等价和无新实践有保护；改写已回答的问题时仍需模型理解，特别是早期记录退出近期窗口。 | 用历史同义澄清做人工验收，记录实际效果。关键做法是继续保留已回答的问题和对应原话关系。 [澄清去重](../src/agentActions.js#L89) · [原回复关联](../src/learningAgent.js#L61) |
| I11 | 开始分析和主动问答告知发送。切日会把有界的学习与对话历史发送给 DeepSeek，产品界面的发送告知未覆盖这一路径，当前 PRD 也省略了 V1 的供应商条款口径。 | 轻量补充首次进入学习前的 Agent 数据用途说明，并同步口径。 [推进交互](../src/DailyLearningView.jsx#L250) · [实际请求](../src/learningAgent.js#L154) · [正式 PRD](prd.md#5-数据接口与隐私) |

本地单项目、图片刷新后用提取文字降级、有界的历史摘要、模型判断波动及无专业评分是已确认的 Demo 取舍。合成场景不能核定真实使用收益。这些边界与 I01–I05、I07 所列行为缺口分别验收。

## D. Agent 专项审查

### 生产链路与自治边界

1. 用户点击下一日，`useDailyLearning.transact` 在一次快照写入内封存旧日与问答、生成新日并登记观察事件。新鲜的任务级课程困难由 `/api/chat` 检索步骤语义识别并逐字验证，真正的澄清回复由答疑 UI 进入同一保存入口。普通勾选和渲染不启动模型，项目级反馈留给后续观察。程序判定的是事件和权限，未使用固定学习天数、未完成次数或关键词直接决定教学动作。 [状态事务](../src/useDailyLearning.js#L22) · [观察节点](../src/learningObservation.js#L35) · [问答反馈](../api/chat.js#L175)
2. `buildLearningObservation` 产出最多 5 日、10 条问答、8 段原文和最多 12 个相关任务的初始／有效定义，另有任务简要统计、近 5 次已应用变更、既往提示和提案。跨日答复依原日／实例归属，相关问题和已给帮助进入随后请求。项目级反馈明确优先选入。任务拆解保留原任务 ID，相关旧实例内容和问答可通过原任务、直接前置或共用来源进入有界选择。多跳依赖的较旧问答没有专门优先策略。当前模型可收到学习日和真实操作时间，掌握判断没有自动写入。 [观察选择](../src/learningObservation.js#L95) · [既往教学](../src/learningAgent.js#L61)
3. `/api/learning-agent` 服务端调用 DeepSeek 做一次判断或独立核验。`runLearningAgent` 按模型 JSON 决定是否发起工具，执行器查证据和实际权限，在修订及当前日仍有效时提交。预算允许的下一次模型判断会收到前序真实回执，模型根据结果继续、等待或结束。真实 GUIDE、调整后回执均已验证；等待确认或用户反馈时执行器也强制暂停进一步行动，保障边界。 [Serverless 接口](../api/learning-agent.js#L49) · [执行和回执](../src/learningAgent.js#L121)
4. 轮次上限为 3 个工具、4 次判断、5 个模型请求（含核验）及 34 秒，单请求 12 秒。拒绝的工具可在剩余预算内修正；连续同类拒绝提前终止。网络、超时、非法或过期输出不回退到固定课程；切日继续使用有效计划，未写入的动作不会作为 applied 展示。 [调用预算](../src/learningAgent.js#L7) · [失败终止](../src/learningAgent.js#L186)

### 七类行动的实际落点

| 行动 | 用户可见结果与证据 |
| --- | --- |
| KEEP_PLAN | 轮次记 kept，无计划改动与提示，T2 真实调用确认。 [处理](../src/agentActions.js#L81) |
| GUIDE | 逐字引文、独立核验后在今日显示关联任务的教学提示，可开原文。T2 和 T5 实际回传 published。 [执行](../src/agentActions.js#L89) · [界面](../src/TeachingUpdates.jsx#L123) |
| CLARIFY | 真实生成可答或暂缓的问答卡片。答复原日保留，提交后由当前日观察读取。固定上游和状态测试证实；本轮未特意消耗模型调用追求该动作。 [界面](../src/ChatPanel.jsx#L4) · [跨日测试](../tests/teachingInteractions.test.js#L48) |
| DECOMPOSE_TASK | 新建 2–3 项子任务及顺序，原目标和原引用保留，确认后改变有效计划；进行中的旧实例存在 I01。 [计划补丁](../src/agentPlanChanges.js#L101) |
| ADJUST_PRACTICE | 时长、频率、难度、步骤和复核可局部变更，原文时钟不能直接更改，进行中须确认。真实 6→3，固定浏览器验证撤销及确认，版本缺陷见 I02。 [计划补丁](../src/agentPlanChanges.js#L78) |
| RESCHEDULE | 延后、优先及一次性任务巩固对调度真实生效，巩固有独立 ID。已开始实例的接受结果见 I01。 [计划补丁](../src/agentPlanChanges.js#L121) · [断言](../tests/learningAgent.test.js#L334) |
| CHECK_MASTERY | 创造选学自检，实际可开始、记录勾选并完成；完成与技能掌握分开。 [计划补丁](../src/agentPlanChanges.js#L70) · [执行界面](../src/DailyLearningView.jsx#L66) |

如模型需要检索，可调用内部 SEARCH_SOURCES，返回本项目原文摘录；没有任意网页、通用工具或原始资料写权限。改动作、接受、拒绝和撤销均由本地状态授权而非由模型声明。无历史关联可撤销，产生关联实践或反馈后通过新变更保留旧状态。现有稳定性通过 Prompt 与真实记录保护共同提供，I02、I03、I07 表明程序覆盖仍有缺口；模型对所有困难的教学判断效果需在后续评估。 [检索与权限](../src/agentActions.js#L34) · [撤销和恢复](../src/agentActions.js#L155)

## E. 文档审查

- **反馈与归因。** 原始规格明确用户愿意试用、认可资料结构化，但很多在尝试几个步骤后停止，产品呈现一次性路线规划特征。DEC-015 和 PRD 保留定性结论，将线性推进与静态路线视为潜在原因，持续使用改善为待验证。仓库可支持这些说法的出处是产品规格和决策记录；没有可供独立核实人数和频率的原始访谈或记录。未发现新增虚构人数、引语、留存率或已达成业务指标的声明。 [原始背景](v2-spec.md#22-v1-用户反馈与问题发现) · [DEC-015](decisions.md#dec-015从学习启动扩展到持续技能学习)
- **任务和节奏。** DEC-012、016 记录实践技能需重复、单次完成与掌握不同、今日入口降低决策负担，允许在未完成时继续并保留依赖与历史。配额和时间单位分工清晰。正式 PRD 所写“必要前置受程序保护”超出实际覆盖，见 I01；可查的复核参考没有扩展成后台复核或评分。 [DEC-012](decisions.md#dec-012v2-学习日练习依赖与旧会话兼容) · [DEC-016](decisions.md#dec-016一次性任务和周期练习并行)
- **Agent 与架构取舍。** DEC-013 定义项目级反馈与权限；DEC-017 比较固定规则、固定 Workflow、有限自治、完全自治，说明单靠答疑不能应用计划；DEC-018 解释何以保留 Workflow、确定性程序、有限 Agent 及当前模型、轻量 RAG 和快照。预算、干预时机、低影响和确认的文档表述基本与代码一致，稳定性和历史反馈仍有 I02、I03、I07。正式 PRD 和 README 对混合架构的说法有生产代码支持。 [DEC-013](decisions.md#dec-013v2-项目级答疑与教学行动权限) · [DEC-017](decisions.md#dec-017引入有限自治-learning-agent) · [DEC-018](decisions.md#dec-018保留-workflow确定性程序与-agent-的混合架构)
- **验收纪律与后续验证。** DEC-014 的独立检查点、阶段顺序和最终统一验收有 Git／文件记录，本轮不追认先前所有会话级操作。PRD 与决策将持续学习、练习安排、干预、困难缓解、过度调整、成本和耗时列入待验证。开发阶段报告称已有端到端试跑，本轮重验中混合和图片规划未获同样结果，现有矩阵不能当作稳定性证明。 [DEC-014](decisions.md#dec-014v2-阶段自主交付与最终人工验收) · [阶段记录](v2-plan.md#v2-p06-最终自主验收证据) · [后续假设](prd.md#6-验收与交付)

## F. 最终建议及人工验收指南

**存在重大需求偏差，必须先修复。** 先解决进行中实例的前置绕过（I01），随后复查调整适用范围与反馈归属、重复提案、自然间隔证据以及混合／图片规划。经授权的修复和回归完成后，再进入最终人工验收。

1. 运行 `npm.cmd run dev:vercel`，使用实际显示的端口和有服务端配置的独立浏览器会话。分别导入原有 [混合任务和自然间隔样例](../tests/fixtures/v2-workflow-smoke.json) 与 [索引卡 PNG](../tests/fixtures/analysis-vision.png)，检查是否进入有效路线。对步骤和答疑点开来源，核对原图、准确引文与刷新后的提取文字。
2. 在今日页做一项而留一项未完成，确认同日新解锁为选学。推进两次，核对未完成状态、旧日问答和 48 小时练习仍按实际时间处理。观察结束提示及学习路线的导航是否清楚。
3. 在一个真实可描述的任务上提交具体困难，核对指导是否来自资料、是否接住用户所说的问题。若出现澄清，先忽略后跨日回答，再核对原问题归属及后续行动。项目级反馈在下一次观察也应出现。
4. 用受控响应稳定验权限和 R1–R4。对正在做且已有问答的任务分别接受拆解和练习调整，检查下游是否在前置完成后才解锁、当前实例与教学说明是否一致、练习完成后是否被 Agent 识别。对高影响动作拒绝后尝试近似提案；验证未实践时撤销、实践后以新变更恢复，旧记录仍可回看。
5. 运行 T2 的三路径脚本及一次包含多日历史的真实功能试跑，记录具体选择、回执和实际任务差异。最后在浏览器临时阻止本机 Agent API，确认仍能继续下一日，失败没有被记为教学已生效。按需要用窄屏及独立 V1 快照复核旧记录。

本报告完成后等待统一修复指令。本次工作范围为独立审查、必要运行验证与新增报告。
