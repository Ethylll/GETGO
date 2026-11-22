# GETGO V2.0 需求追踪矩阵

P00 已审核，随阶段更新，来源为 [V2 原始规格](v2-spec.md)。阶段编号均以 V2 为命名空间，与 V1 和 PRD 页面编号分开。每行按一个独立验收结果分配 ID。计划实现位置是拟议位置。

**P07 最新状态**　按 [独立审查修复追踪](v2-audit-resolution.md) 核对原 98 条及新增 V2-EX-01～07。DEC-019 更新模拟时间规则。P07 证据包括程序回归、固定模型响应、真实 DeepSeek 及浏览器复验，人工验收另行进行。

- 状态使用 TODO（待实现）、IMPLEMENTED（已实现、证据不足）、PASS（已通过对应自主测试）、PARTIAL、FAIL、UNVERIFIED 和 BLOCKED。PASS 不等于人工验收。
- 「—」表示尚未产生实际验收证据。测试入口和用例均写在「验收方式」，不会预填到证据列。
- 在证据列记录实际测试、可复现输入、状态差异或工具回执。DEC 链接仅证明产品决策已确认。
- 跨阶段事项写明依赖和待验证内容。每阶段自主审查后更新本表，最终人工验收另行发起。

## 初始 Workflow

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-WF-01 | §5.1、5.3、13.1 | 区分一次性与周期性；适合重复的知识点进入周期练习。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 用实践资料观察两类均可生成，普通一次性资料允许全为一次性。 | PASS | P07　真实 DeepSeek 一次复验 v2-mixed 生成独立 oneTime 和 recurring，CLI 及真实浏览器均进入今日页，引用通过校验。 [证据](v2-audit-resolution.md) |
| V2-WF-02 | §5.2、13.1 | 任务保留唯一 ID、名称、类型、目标、可执行步骤、预计时长、单次完成标准、必要前置、引用和可查询状态。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 核对模型输出、保存和 UI 读模型；缺必需字段被拒。 | PASS | realAnalysis.test.js 校验任务字段、初始状态、用时和拒绝缺项；真实 V2 返回初始定义。V2-P02 验证任务定义、单次完成标准和实例状态在今日页可读，原始／有效计划及历史实例可刷新恢复（learningDays.test.js、Edge）。 |
| V2-WF-03 | §5.2、5.3、DEC-019 | 周期任务含启动条件、频率、复核节点、持续目标及停止／减量／调整条件；有明确原文的自然间隔按模拟分钟，无此证据时标注学习日教学建议。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 读取完整周期字段，用合法与非法调度边界验证。 | PASS | P07　DEC-019；R5 拦无时间、单次时长和错用途引用。真实 v2-elapsed 给出 2880 模拟分钟，复核独立。 [证据](v2-audit-resolution.md) |
| V2-WF-04 | §5.3 | 无原文依据的周期、频率教学建议明确标记为推导，不伪造引用。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 无频率的资料生成建议并显示标记；错误引用被拦截。 | PASS | P07　推荐值禁止携带时间原文证明；R5 核对无语义引文被拒，材料含明确间隔才能生成 source 时间。 [证据](v2-audit-resolution.md) |
| V2-WF-05 | §5.3 | 保留必要依赖。周期练习只按明确可观察动作或自检反馈解锁后续任务，无门槛时可与新知识并行。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 有效混合路线通过；不能因为存在长期周期任务阻断无依赖新知识。 | PASS | P07　自检／完成门槛原回归通过，R1 验证已开始任务接受拆解后也不能越过新增前置。 [证据](v2-audit-resolution.md) |
| V2-WF-06 | §5.4 | 独立核验类型合理性和运行安排，拒绝不可执行、明显不合理的练习。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 向核验提供不合理分类及无可执行动作，验证拒绝。 | PASS | 真实独立核验接受一次性卡片整理，拒绝把它重复五次就算掌握的练习。集成测试验证拒绝会裁剪任务及依赖。 |
| V2-WF-07 | §5.4 | 程序拒绝循环或无效的依赖；受影响的任务不能进入有效路线。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 测试自环、双向环、缺 ID 和有效依赖。 | PASS | realAnalysis.test.js 覆盖任务自环、双节点环、缺失前置与合法独立任务，拒绝无效起点。 |
| V2-WF-08 | §5.4 | 核验明确的完成标准、真实来源及事实依据；沿用有界核验，不增加复杂多轮链。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 测试含糊标准、伪造原文、明显错误和调用次数。 | PASS | 真实独立核验拒绝含糊标准和无据掌握主张。realAnalysis.test.js 拒绝缺项、伪造引用，核对正常仅一次独立核验、格式错误时有界重试。 |
| V2-WF-09 | §1、4.1、13.1 | 保留真实导入、识图、主题澄清、结构化路线、独立核验和异常输入分支。 | V2-P01 | 分析 Service、`server/learningAnalysis.js`、规划与核验 Prompt、计划校验器 | 复跑文字及图片闭环、主题不明、部分失败、冲突省略和不可用资料。 | PASS | P07　实际文本导入、真实主题识别和两类任务见浏览器；既有 PNG 在真实生产处理器再次实测 processed 和 ready，图像失败分支仍有回归。 [证据](v2-audit-resolution.md) |

## 今日学习与会话

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-DAY-01 | §6.1、6.2、13.2 | 学习页默认今日任务，保留暖色风格及现有任务详情和引用。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 新计划落地 Day 1；今日为主视图，引用仍能打开原文。 | PASS | Edge 从真实图片导入直接进入 Day 1，步骤及答疑引用仍能打开并高亮原文片段。 |
| V2-DAY-02 | §6.1 | 完整路线主动查看整体目标、当前阶段、完成的一次性任务、后续内容与持续练习。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 打开原侧栏依次核对五类信息，并回到今日焦点。 | PASS | Edge 默认收起，点击路线入口后显示整体目标、当前阶段、已完成一次性任务、后续内容和周期练习，可返回今日。 |
| V2-DAY-03 | §6.2 | 展示主题、Day N、预计时长、完成进度及两类任务分组。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 混合日、只有一类、空日与已完成日均可用。 | PASS | 已确认 Q1（DEC-012）；Edge 验证混合日、仅一次性任务、必做完成与空日；learningDays.test.js 验证仅周期任务、预计时长及上限。 |
| V2-DAY-04 | §6.2 | 当前任务详情、原文引用、答疑入口和下一日操作可用；存在教学调整时保留展示位。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 在桌面与手机打开各入口；调整内容由 V2-P05 联调。 | PASS | P07　「下一日」低干扰放置，浏览器点击及三入口可用，原步骤、引文和教学展示保留。 [证据](v2-audit-resolution.md) |
| V2-DAY-05 | §6.3、DEC-019 | 调度按模拟学习时间纳入已满足启动条件且到期的周期练习。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 未启动、不应出现、应出现三类实例；同日去重。 | PASS | P07　程序及浏览器 Day 1 完成后立即推进，48 小时练习在 Day 2 不出现、Day 3 出现。 [证据](v2-audit-resolution.md) |
| V2-DAY-06 | §6.3 | 按明确前置依赖纳入可做的一次性任务。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 未满足前置不会排入，独立任务仍可推进。 | PASS | P07　R1 直接提交进行中旧实例完成命令，确认拆解或延期后均拒绝，未解锁下游。 [证据](v2-audit-resolution.md) |
| V2-DAY-07 | §6.3、6.6 | 保留仍需完成的一次性任务，仅在适合的学习日重排。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 跳过任务保持未完成，下个适合日出现，依赖不变。 | PASS | 已确认 Q1（DEC-012）；learningDays.test.js 保留未完成记录并在后续学习日重新排入，积压按最近安排顺序轮转。 |
| V2-DAY-08 | §6.3 | 生效的调整参与组装，待确认和失败的调整不参与。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 给定三种变更状态，调度只消费生效版本。 | PASS | P07　R2/R3 验证当前实例更新及配额时明确延后；还未确认、失败和越权结果不应用。 [证据](v2-audit-resolution.md) |
| V2-DAY-09 | §6.3、13.2 | 默认每日 30 分钟、最多 5 项，可配置，无需填满。剩余配额内同日新解锁只能选学。避免欠项堆积并提供明确结束边界。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 多日积压后仍有明确定量边界和稳定选择顺序。 | PASS | P07　R6 兼容 30 分钟合法任务与 20 分钟内部配额、旧快照空日恢复；默认 30 分钟和 5 项边界保留，选学回归通过。 [证据](v2-audit-resolution.md) |
| V2-DAY-10 | §6.3、4.2 | 每日按已有计划、时长、顺序和调度纯程序组装。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 同一快照输出可重现，组装零模型调用。 | PASS | learningDays.test.js 用同一输入得到相同调度；Edge 单次分析后推进至 Day 3，由本地程序处理。 |
| V2-DAY-11 | §6.4、DEC-019 | 用户可随时主动推进。每次增加 24 小时模拟时间，真实操作时间另记，刷新保留模拟时间。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 同天跨数个 Day，历史时间仍真实；过午夜不自动刷新。 | PASS | P07　DEC-019；模拟分钟 0、1440、2880，墙钟不参与调度。浏览器即时推进并刷新仍为 2880，真实操作时间独立记录。 [证据](v2-audit-resolution.md) |
| V2-DAY-12 | §6.5、13.2 | 允许未全部完成时推进，提示不阻断，独立任务照常。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 部分完成及一项未做均能继续，旧任务不会被补记已完成。 | PASS | Edge 验证当日有未完成任务仍能推进，未完成记录仍可回看；learningDays.test.js 验证一项未完成亦能继续。 |
| V2-DAY-13 | §6.5、DEC-019 | 推进先封存原日状态及问答。未开始及进行中属于原日未完成，其中进行中保留已开始含义；随后推进编号并排新日。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 刷新读到旧日记录与新日；迟到的问答仍归发送日（V2-P03 联调）。 | PASS | P07　推进先封存原任务与问答，提前状态未判失败；事务、浏览器、额外教学观察顺序均复验。 [证据](v2-audit-resolution.md) |
| V2-DAY-14 | §6.6、DEC-019 | 周期漏练只留该日实际未完成状态，后续按模拟学习时钟和正常节律安排，不倍补或推断能力下降。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 漏练后核对历史状态与下一次配额。 | PASS | P07　漏练保留实际状态；练习按模拟日或有来源的模拟分钟当前间隔安排，无额外积压。 [证据](v2-audit-resolution.md) |
| V2-DAY-15 | §5.1、6.7、13.2 | 完成一次性任务默认不再排；只有合法巩固行动可重排且不改旧完成记录。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 普通日不复现；模拟已生效巩固后保留原完成时间。 | PASS | P04 执行器以合法 RESCHEDULE 加入巩固选学并产生独立 ID，原一次性任务不重排，原完成时间仍可查。 |
| V2-DAY-16 | §5.1、6.7、13.2 | 任务定义与每日实例独立，周期单日完成不等于长期完成或掌握。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 同一任务跨日生成独立 ID、状态和时间，复核不变成自动结业。 | PASS | learningDays.test.js 验证跨日练习拥有独立实例和进度；完成单次练习未计入一次性任务完成或掌握。 |
| V2-DAY-17 | §6.7、9.1、9.2 | 历史实例保存当时任务内容或版本，后续变更不篡改历史。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 修改步骤后回看旧日仍看到旧步骤和原记录。 | PASS | P07　程序回归验证封存日及当日已完成实例保留，恢复不重写已完成版本和问答。 [证据](v2-audit-resolution.md) |
| V2-DAY-18 | §9.1、9.2、13.2 | 保留初始计划与有效计划、每日编号／开始时间／实例／完成时间；刷新恢复进度和有效计划。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 初始与有效可并列核对，刷新和复读快照无损。 | PASS | P07　新旧 V2 按日编号持久化或复原模拟分钟，V1 恢复测试照常；浏览器 Day 3 刷新保留实际任务和模拟时间。 [证据](v2-audit-resolution.md) |
| V2-DAY-19 | §9.3 | 保留 V1 进度、问答和资料，可继续用兼容视图。不补造 Day 和时长、不强制迁移。新项目使用 V2。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 迁移进行中和已结束的真实／旧 Mock 样本；失败保护原记录。 | PASS | 已确认 Q3（DEC-012）；Edge 注入合法 V1 后刷新恢复原任务；会话测试覆盖旧 Mock、进度、原始资料、问答、已完成态及损坏数据保护。V1 标签页不能覆盖 V2。 |
| V2-DAY-20 | §9.2、10.4 | 重复点击推进或重复完成时不重复创建学习日、实例或进度。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 双击、重复事件和延迟写入测试，仅一份有效结果。 | PARTIAL | P07　同时触发的双标签持 Web Locks 实测 Day 3 只写一次 Day 4，并只发出一次 Agent 请求。无 Web Locks 的浏览器用单标签。 [证据](v2-audit-resolution.md) |
| V2-DAY-21 | §13.4 | 保留独立回看、已结束记录和引用，回看不推进当前学习。 | V2-P02 | `DailyLearningView.jsx`、`learningDays.js`、`useDailyLearning.js`、`learningSessionStorage.js` | 打开旧任务、回到今日；核对进度与旧来源不变。 | PASS | 已确认 Q1（DEC-012）；Edge 打开旧日任务、旧答疑引用，再返回今日；封存状态和实际学习日未改变。 |

## 观察与问答

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-OBS-01 | §7.2A、6.6、DEC-019 | 汇集当前与已封存模拟学习日、任务状态、连续未完成证据、一次性进度和依赖，开放日暂不判断未完成。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 使用有遗漏和依赖的多日快照核对字段与事实 ID。 | PASS | P07　真实多日请求包含 Day 1/2 进行中且封存未完成、当前日 open，模拟分钟 0/1440/2880；无真实操作戳。 [证据](v2-audit-resolution.md) |
| V2-OBS-02 | §7.2A、7.10 | 观察已执行调整及其后续表现，把行动回执与学习效果分别记录。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 有执行回执但未实践时状态仍为等待；实际反馈后才更新观察。 | PASS | P07　R3 按实例版本及事件顺序识别调整后完成，配额保留旧版本时不会误作新实践；真实历史验证完成后观察识别。 [证据](v2-audit-resolution.md) |
| V2-OBS-03 | §7.2B、7.3 | 读取困难、困惑、时间限制、重复提问及已经提供的帮助。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 同任务与历史相关任务样例均可取到，不以答疑回复推断掌握。 | PASS | P07　两次真实答疑经 API 得到时间困难及引用，并与原日状态一同进入 Day 3 真实模型。 [证据](v2-audit-resolution.md) |
| V2-OBS-04 | §7.2、7.3 | 有界地读取初始与有效计划、相关原始资料、近期及相关对话；无新画像和记忆服务。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 超长历史仍受条数和长度限制，项目外资料不能混进观察。 | PASS | learningObservation.test.js 验证最多 5 个学习日、10 条消息和 320 字消息片段，读取初始／有效计划及有效原文，不纳入其他项目对话。 |
| V2-OBS-05 | §7.3、9.1 | 问答含项目 ID、学习日、可选任务 ID、问题、回答和时间。无当前任务时可基于项目资料提问。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 发送、跨日响应和刷新仍归到最初项目、日期、任务或无任务。 | PASS | 已确认 Q4（DEC-013）；Edge 在空日发起项目答疑并刷新后回看，projectId/dayId 保留、taskId 为空；迟到任务答复保留原实例。真实项目问答验证有效引用。 |
| V2-OBS-06 | §7.3、13.4 | 继承任务上下文问答和轻量 RAG，保留历史可查与引用验证。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 直接问及追问能溯源，历史任务隔离，资料外拒答。 | PASS | chat.test.js 验证项目追问隔离旧任务上下文并保持引用核验；Edge 回看高亮来源，真实直接问题可溯源，资料外问题正常拒答。 |
| V2-OBS-07 | §7.4、6.5 | 保存完成并且状态提交后提供下一学习日观察机会。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 事件顺序为保存、推进与观察；失败不阻断下一日。 | PASS | learningObservation.test.js 验证旧日、发送中问答、新日和唯一观察索引整体写入后才释放事件；失写仍可进入下一日，无事件释放。 |
| V2-OBS-08 | §7.4、8.4 | 纳入任务级和项目级新学习反馈、澄清回复；普通知识问答不触发即时观察。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 学习反馈与澄清可观察，普通提问不重复调用；无任务场景按确认策略验收。 | PASS | P05 Edge 验证同一澄清跨日回应后产生一次观察，读取原问题 ID 和用户回复；暂缓不触发观察。P03 的任务及项目反馈策略保持。 |
| V2-OBS-09 | §7.4、12.9、10.4 | 普通勾选、渲染和无变化不调用模型；重复反馈或同一事件不重复发起。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | Mock 统计请求次数，双提交与刷新不会重复启动。 | PARTIAL | P07　固定回归覆盖无变化、重复和单一事件；双标签有 Web Locks 路径实测一次请求。无 Web Locks 多页限制接受。 [证据](v2-audit-resolution.md) |
| V2-OBS-10 | §9.2、7.3 | 跨日、项目重置和任务调整期间的迟到答复不串关联，历史问答仍可恢复。 | V2-P03 | `learningObservation.js`、`useDailyLearning.js`、`learningSessionStorage.js`、`useLearningChat.js`、`api/chat.js` | 旧消息落回发送时记录；已结束项目的回调不得写入新会话。 | PASS | Edge 验证迟到答复归原日、切换项目后不写入新会话；单测调整有效计划并移除任务定义后，仍按原实例保存和读取旧答复。 |

## 有限自治和执行

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-AG-01 | §4.3、7.1、7.4 | 模型根据实际观察决定是否干预、证据够不够、如何行动和何时等待。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 用不同上下文观察模型自主选择；代码无按次数直接映射行动。 | PASS | 真实 Vercel＋DeepSeek 三个合成场景自主选择 KEEP_PLAN、GUIDE、ADJUST_PRACTICE；模型收到回执后结束或等待。 |
| V2-AG-02 | §7.5.1–6 | 默认保守；普通问题和偶发漏练不自动调整，区分没时间、没执行、没理解、不熟练；严重即时困难可及时帮助，证据不足可等待。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 对比稳定、偶发、重复、严重即时与空历史样例（§11）。 | PASS | 真实轻量样例保留正常安排，用户明确表示时间不足或练习困惑时选择不同动作；默认保守和缺证据等待见 Prompt 与测试。 |
| V2-AG-03 | §7.5.7–12 | 优先低成本小动作；参考先前帮助，避免重复、盲目降标和按自评判定掌握；不改历史及无故全量重规划。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 受控输入和最终变更比较，检查历史、必要要求和全量规划调用不变。 | PASS | P07　R4 与 R7 验证近似拒绝、完整历史等待，七动作及技能掌握限制原回归通过。 [证据](v2-audit-resolution.md) |
| V2-AG-04 | §7.6 Action 1、8.6 | KEEP_PLAN 正常结束，无计划变动和重复提示。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 执行后计划版本不变，保存决策但 UI 不打断。 | PASS | 真实稳定样例回执 kept，计划和提示均无变化；固定响应 Edge 切日不插入技术步骤。 |
| V2-AG-05 | §7.6 Action 2 | GUIDE 实际发布有任务归属和资料支持的教学提示，不写计划。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 执行器产出可见提示，引用可查，计划版本不变。 | PASS | P04 真实 GUIDE 由本地执行器保存，P05 Edge 验证在今日页按任务展示并定位精确引用，计划和实际进度不变。 |
| V2-AG-06 | §7.6 Action 3 | CLARIFY 发出简短且未回答过的问题，允许等待。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 已有答案不重复问，未回复时保持安全安排。 | PASS | P07　历史已回答的同任务精确澄清离开上下文窗口仍拒绝；近期问答成对，跨日保留来源及回复日。语义去重效果待后续评测。 [证据](v2-audit-resolution.md) |
| V2-AG-07 | §7.6 Action 4 | DECOMPOSE_TASK 实际生成局部子任务，保留原目标、必要依赖和资料依据。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 合法拆解进入新安排，历史不改，依赖绕过被拒。 | PASS | P07　R1 同时验证新前置、旧实例完成拦截及撤销恢复；子任务、依赖、目标及来源原回归通过。 [证据](v2-audit-resolution.md) |
| V2-AG-08 | §7.6 Action 5 | ADJUST_PRACTICE 可调整时长、频率、难度、步骤和复核时机，只改必要字段。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 逐个属性验证补丁及历史隔离。 | PASS | P07　R2/R3 当前进行中有问答的练习更新仍保留历史依据；后续适用范围及回执核对。真实 6→3。 [证据](v2-audit-resolution.md) |
| V2-AG-09 | §7.6 Action 6 | RESCHEDULE 可后延、独立提前、减负或重排复习，依赖始终有效。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 有依赖和无依赖任务对照，巩固不清除原完成。 | PASS | P07　R1 验证延期确认后直接完成命令被拦，下游未解锁；优先及巩固原回归通过。 [证据](v2-audit-resolution.md) |
| V2-AG-10 | §7.6 Action 7 | CHECK_MASTERY 产生简单自我检验任务，结果是自评／有限检验。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 执行后实际可做可反馈，系统不显示专业评分或认证。 | PASS | Edge 完成模型驱动的选学自检，结果及步骤刷新后恢复；单测验证满额次日提供且不计入主线完成或专业结论。 |
| V2-AG-11 | §7.7、13.3 | 执行真实工具并把结果交回同一判断循环，模型能继续、结束或等待。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 记录模型输入、行动及实际回执，再验证下一分支；无回执不得宣称执行。 | PASS | P07　真实历史驱动调整回传 applied、当日影响与新版本时长，下一次由模型决定保持；预算和工具原回归通过。 [证据](v2-audit-resolution.md) |
| V2-AG-12 | §7.7、7.9、12.8 | 限制上下文、工具、模型次数、总耗时及重试；禁止无限执行或任意外部工具。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 重复非法指令、慢工具、耗尽预算均中止。 | PASS | learningAgent.test.js 验证 3 次工具、4 次判断、5 次含核验的模型调用以及截止失败；任意外部工具被拒，本地 Vercel 使用 12 秒单次上游时限。 |
| V2-AG-13 | §7.7、7.10 | 工具校验／执行成功不代表教学有效，后续效果取真实反馈。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 执行后未实践保持待反馈，新完成记录或严重新困难到来后再评估。 | PASS | P07　完成修订版实例进入观察，旧版本完成不当作调整成效；自检与掌握独立。 [证据](v2-audit-resolution.md) |
| V2-AG-14 | §7.8、9.1、13.3 | 结构化保存干预判断、问题、真实证据、动作、目标、参数、简短原因、确认需求、结果和终态。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 检查存储及恢复的记录，验证证据 ID，不储完整内部推理。 | PASS | P07　保留回执、状态及脱敏类，不保存原始异常正文；预算与非法动作回归通过。 [证据](v2-audit-resolution.md) |
| V2-AG-15 | §7.9 | 禁止改整体目标、删原始资料、回写历史、直接标完成、虚报掌握、重生全计划及脱离主题。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 每类越权被执行器拒绝，状态未动。 | PASS | 白名单不提供全量重规划、外部执行、资料删除或写进度能力；测试外部动作、伪造证据和目标／完成标准字段均被拒。 |
| V2-AG-16 | §7.9、8.5 | 程序统一校验：教学提示、重新讲解、无历史覆盖的辅助练习及低影响未来调整可直接生效。已开始当前任务的实质性变更或高影响变更须确认。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 模型自称低影响仍按本地权限表判定。 | PASS | 已确认 Q5（DEC-013）；低影响未来练习自动生效；已开始的周期练习和改前置的拆解等待确认。执行器按实际实例状态重验，重复确认无效果。 P06 修复带问答的旧实例可能绕过新增前置，回归测试确认仅在前置和配额均满足时可开始。 |
| V2-AG-17 | §7.10 | 调整过的任务未实践时默认等待，严重新困难或明显调整问题才可例外。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 输入旧困难和新严重反馈，检查有无有效新证据，无固定冷却阈值。 | PASS | P07　R7 在六次独立合法变更后仍检查退出五条观察窗口的任务；新明确困难可引用后续反馈作为例外。 [证据](v2-audit-resolution.md) |
| V2-AG-18 | §9.1、9.2 | 保存调整前后差异、原因、任务、用户确认状态与生效时间，不覆盖初始计划。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 单次应用和恢复前后对照，旧计划与历史仍可读。 | PASS | 测试读写前后差异、确认及生效时间，区分直接撤销与新增逆向变更；初始计划及有学习记录的旧日不变。 |
| V2-AG-19 | §10.1、13.3 | 请求失败、超时或输出不可用时继续用有效计划组装，保留历史并记异常。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 断网与超时注入，Day 已推进，不显示成功调整。 | PASS | P07　正式请求层及 API 固定响应验证配置、网络、上游、输出、超时五类；实际页面注入 503 仍推进。 [证据](v2-audit-resolution.md) |
| V2-AG-20 | §10.2 | 拒绝未知任务、非法参数、依赖或越权，预算内可修正，超额终止。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 先非法后改正与始终非法两条路径，拒绝时快照不脏。 | PASS | 测试未知动作、伪造来源、循环依赖、语义核验失败和合法修正；本地 Vercel 真实时长样例将 invalid_steps 纠正后应用。 |
| V2-AG-21 | §10.3 | 缺历史时可保持、澄清或根据已表达的即时困难局部帮助。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 空历史和即时反馈各跑一次，不捏造历史。 | PASS | 真实无明确困难的样例维持原安排，只有一次原话的练习困难样例能提供有来源帮助；没有捏造额外学习记录。 |
| V2-AG-22 | §9.2、10.4 | 重复应用、过期响应、重复接受和并发写入不会生成重复动作或损坏状态。 | V2-P04 | `api/learning-agent.js`、`learningAgent.js`、`agentActions.js`、`agentPlanChanges.js` | 同动作两次、旧修订、双标签页与中断恢复；合法写入仅一次。 | PARTIAL | P07　现有写锁外，为同日推进与同事件观察增加互斥。双标签一次写入和一次请求，单页与过期、重复授权回归通过。无 Web Locks 多标签页仍有限制。 [证据](v2-audit-resolution.md) |

## 教学交互

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-UI-01 | §8.1 | 教学干预融入现有学习页与答疑，不增加独立 Agent 后台。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 现有三入口与日任务可达，无需理解技术概念。 | PASS | Edge 核对今日页和既有答疑承载指导与澄清，仍只有三个侧栏入口。历史路线、原文定位及 V1 回归通过。 |
| V2-UI-02 | §8.2 | 指导简短、关联任务，不展示无依据鼓励或重复寄语。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 真实提示可定位任务及来源，对无新证据场景无重复。 | PASS | Edge 验证任务名、提示正文和精确引用，刷新可查看且不重放。P04 真实指导及重复提示拦截已补入验收。 |
| V2-UI-03 | §8.3 | 今日轻量提示可查看原因、受影响任务和生效后的新安排。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 对比变更前后渲染与实际调度一致。 | PASS | P07　R2/R3 测试当日更新、暂停与后续生效，真实工具回执的当日影响和有效计划相符。 [证据](v2-audit-resolution.md) |
| V2-UI-04 | §8.3、4.2 | 尚未产生关联学习记录或反馈的调整可撤销。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 撤销一次并刷新，旧计划及记录无重复。 | PASS | 已确认 Q5（DEC-013）；Edge 在没有关联记录时点击撤销，今日实例恢复到 6 分钟，刷新仍为已撤销；单测验证后续变更时不会开放失效操作。 |
| V2-UI-05 | §8.3 | 已产生关联学习记录或反馈的调整通过新变更恢复安排，保留历史。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 实践后再恢复，旧记录和调整均可查。 | PASS | 已确认 Q5（DEC-013）；Edge 完成受调整的练习后点击恢复先前安排，有效计划返回 6 分钟，保留已经完成的 3 分钟实例及时间，并另存一条变更；刷新完整恢复。 |
| V2-UI-06 | §8.4 | 复用答疑处理澄清，可答或忽略，未答时可以继续学习。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 回答后记录回到观察，忽略后仍能推进。 | PASS | Edge 通过原答疑暂缓，推进后回复旧问题，消息仍归发送目标任务原日，当前轮读取问题和原话。单测覆盖项目级、伪造归属和重复提交。 |
| V2-UI-07 | §8.5、13.3 | 高影响调整可接受或拒绝，拒绝留原计划与结果，无新证据不反复提。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 验收接受、拒绝、重复接受、过时提案、无新证据重提。 | PASS | P07　拒绝保持现有安排；R4 无新证据拦同目的同方向近似重提，有新的时间反馈可再次待确认。 [证据](v2-audit-resolution.md) |
| V2-UI-08 | §8.6 | 无干预直接进入学习，无额外步骤和技术日志展示。 | V2-P05 | `DailyLearningView.jsx`、`TeachingUpdates.jsx`、`ChatPanel.jsx`、`teachingInteractions.js` | 真实保持计划路径用户可直接继续。 | PASS | 通过真实 DeepSeek 的稳定样例从浏览器直接推进学习日，无技术日志、额外教学区或强制操作，原有三个面板保持收起。 |

## 功能验收及回归

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-VAL-01 | §11 场景一 | 稳定学习中基础练习与新知并行，Agent 可保持原计划。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 查看实际排程和保持回执。 | PASS | P07　T2 样例真实模型直接 KEEP_PLAN，本轮浏览器真实混合路线可做两类任务。 [证据](v2-audit-resolution.md) |
| V2-VAL-02 | §11 场景二 | 偶尔未完成不阻塞次日或自动调整。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | Day 2 部分完成跨 Day 3，核对旧状态。 | PASS | P07　立即跨日浏览器保留未完成和已完成，Agent 只在观察节点自行判断；没有次数强制触发变更。 [证据](v2-audit-resolution.md) |
| V2-VAL-03 | §11 场景三 | 持续困难且问答提供证据，模型可选择拆解或练习调整并观察后续。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 保留实际选择和已生效实例，记录随后反馈。 | PASS | P07　真实两封存日均进行中未完成、相关问答均保留；实际 ADJUST_PRACTICE 6→3，回执后保持，随后程序观察读到修订版本完成。 [证据](v2-audit-resolution.md) |
| V2-VAL-04 | §11 场景四 | 首次明确严重困难即可局部帮助，无需等待多日。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 真实问题触发指导、澄清或合法局部调整。 | PASS | P07　真实首次严重困难 GUIDE 经独立核验发布；后续判断中重复提示被拒，上游一度 502，已发布教学提示保留。 [证据](v2-audit-resolution.md) |
| V2-VAL-05 | §11 场景五 | 多次完成并自评熟练允许安排自检，不能自动认定掌握。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 检查实际检验实例及反馈归属。 | PASS | 固定响应测试向模型步骤提供连续两日完成与自评熟练，执行器新增独立选学自检，完成与掌握分别记录；Edge 验证自检可操作并刷新。 |
| V2-VAL-06 | §11 场景六 | 拆解后尚未实践时等待反馈，无相同重复改动。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 同状态再次进入并核对有效计划无新补丁。 | PASS | P07　受控 R7 无实践拦重复；真实调整后回执阶段尚未尝试，模型选择 KEEP_PLAN。 [证据](v2-audit-resolution.md) |
| V2-VAL-07 | §11 场景七 | Agent 不可用时按当前计划继续。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 超时或故障后仍生成次日。 | PASS | P07　实际浏览器注入 Agent 503，模拟日、有效计划及刷新恢复可用；程序分别断言非成功类别。 [证据](v2-audit-resolution.md) |
| V2-VAL-08 | §13.1–13.3 | 真实 DeepSeek 至少验证不干预、局部指导和任务调整。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 分别保留脱敏输入、实际决策、工具回执、UI／快照前后及边界；Mock 不替代。 | PASS | P07　真实 Vercel 至少实际完成保持、发布指导及已生效调整。多日历史路径实际应用并保持，首次指导的后续判断 HTTP 502 已记录。 [证据](v2-audit-resolution.md) |
| V2-VAL-09 | §13.4 | 回归 V1 资料输入、真实分析与生成、任务展示、原图／原文与引用。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 桌面与窄屏跑通输入到学习页，刷新后验证图片与提取文字行为。 | PARTIAL | P07　本轮浏览器真实文本到今日页成功；原 PNG 经真实生产处理器 OCR 与计划均通过，未重新验图片浏览器上传全链。此前偶发生成失败按用户决策不阻断。 [证据](v2-audit-resolution.md) |
| V2-VAL-10 | §13.4 | 回归 V1 任务上下文答疑、轻量 RAG、来源约束、历史回看及恢复。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 真实追问与资料外拒答；换任务、点击引用、刷新并核对进度。 | PASS | P07　实际浏览器真实答疑 answered、3 条引用，程序回归覆盖溯源、拒答、跨日和 V1 快照。 [证据](v2-audit-resolution.md) |
| V2-VAL-11 | §1、13、14.4 | 完成必要功能与回归，不开展系统化质量、竞品、留存或价值实验。 | V2-P06 | Node 测试、浏览器功能验收、现有接口及本地会话 | 测试报告区分程序、真实功能演示和未做的评测。 | PASS | 阶段记录分列程序测试、浏览器固定响应与有限真实模型试跑。本阶段没有引入系统化评测、竞品或用户实验。 |

## 文档与交付纪律

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-DOC-01 | §14.1 | 正式 PRD 重组到 V2，覆盖背景、需求、定位、演进、流程、任务类型、学习日、Agent 边界、职责、范围和非目标。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 逐章走查，保留适用的 V1 要求；旧版由 Git 保留，不全文追加。 | PASS | P07　正式 PRD 同步 DEC-019、实例边界、Agent 告知和 V1 兼容，已标记图片非阻断和原始用户反馈证据边界。 [证据](v2-audit-resolution.md) |
| V2-DOC-02 | §14.2 A | 记录从启动扩展到持续学习，区分反馈、原因分析和待验价值假设。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 检查背景、选项、取舍与验证方向，核对未编造人数、原话或留存。 | PASS | DEC-015 记录启动与持续学习的变化，区分已反馈、原因解释和待验证假设，无新人数、引语或留存数据。 |
| V2-DOC-03 | §14.2 B | 记录双任务类型、日主页、未完成可推进、历史与依赖、确定性调度。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 逐项复核决策和产品行为。 | PASS | P07　DEC-012/016 保留历史，DEC-019 为当前口径，正式 PRD 和指南按模拟日推进。 [证据](v2-audit-resolution.md) |
| V2-DOC-04 | §14.2 C | 记录有限 Agent 的需求驱动、四种方案比较、观察／行动／权限与稳定性取舍。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 核对固定规则、固定 Workflow、有限自治和完全自治选项。 | PASS | DEC-017 对照规则、固定 Workflow、有限自治与完全自治，记录观察、白名单行动、执行回执及稳定性与成本。 |
| V2-DOC-05 | §14.2 D | 记录混合架构、DeepSeek 与轻量 RAG 复用、保持 Demo 边界的理由。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 核对职责和放弃复杂依赖的说明。 | PASS | DEC-018 区分初始 Workflow、确定性程序与教学 Agent，并保留现有 DeepSeek、轻量 RAG、前端与本地存储。 |
| V2-DOC-06 | §14.2 | 沿用 DEC 编号，每项保留背景、备选、决定、理由、收益、风险及验证方向。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 从当前 DEC-011 续号，不覆盖历史。 | PASS | DEC-012～014 已记录在 P00；V2 正式决策以 DEC-015～018 续号。旧 DEC 条目未覆盖。 |
| V2-DOC-07 | §14.3 | 更新 README、实际架构、阶段进展、功能范围、数据结构／API 说明并复用现有记录。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 对照源代码、API、协议和状态字段检查各文档一致。 | PASS | P07　README、正式 PRD、修复表和计划同步数据契约、来源、脱敏诊断与复验结果。 [证据](v2-audit-resolution.md) |
| V2-DOC-08 | §14.4 | 仅记录后续评测方向：持续学习、周期安排、干预时机与动作、困难缓解、计划稳定、成本与耗时。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 方向齐全，无新增系统化评测方案、扩评测集或虚构数字。 | PASS | 正式 PRD §6 和 DEC-015～018 记录持续行为、周期、干预时机与行动、缓解、稳定、成本及耗时。未开展系统化评测。 |
| V2-DOC-09 | §1、15、16 | 各阶段重读需求与计划，按 ID 开发、测试并上传证据；披露部分和限制，自主审查并单独提交，收到「继续」再推进。最终统一人工验收。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 检查每阶段记录及实际证据，构建通过不得单独判定验收。 | UNVERIFIED | P07　P01～P06 的检查点存在，但历史会话重读、逐轮授权和上传证据不能由仓库独立证明。P07 检查点和实际证据另见修复追踪。 [证据](v2-audit-resolution.md) |
| V2-DOC-10 | §16 | 最终交付说明核心功能、V1 差异、Workflow、Agent、数据代码、文档 DEC、测试、限制与后续评测。 | V2-P06 | `docs/prd.md`、`docs/decisions.md`、`README.md`、既有架构与版本记录 | 按 §16 九项核对，与追踪矩阵一致。 | PASS | P07　P07 修复追踪、正式 PRD 及最终指南披露实际证据、范围与剩余缺口。 [证据](v2-audit-resolution.md) |

## 范围和技术边界

计划位置的共用入口见各行。验收样例按对应产品行为独立判断。

| 需求 ID | 原规格 | 需求 | 阶段 | 计划位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-LIM-01 | §3.2、12.4–7 | 单个有限 Agent，不引入多 Agent、开放自治、复杂 Agent 框架、知识图谱、技能树、复杂事件系统或独立记忆。 | V2-P06 | 架构、生成物、接口、持久化及交付审查 | 核对依赖、API 和工具权限，文档准确描述自治范围。 | PASS | 核对 package.json 和 Git 基线，V2 无新依赖或存储服务。单个学习 Agent、有限工具注册表及确定性调度经程序测试。 |
| V2-LIM-02 | §3.2、12.1–3 | 沿用 DeepSeek、当前模型配置、识图、规划、独立核验与 RAG；无新增供应商、密钥、向量库、Embedding 或微调。 | V2-P06 | 架构、生成物、接口、持久化及交付审查 | 配置清单与构建依赖检查，断开 API 后降级有效。 | PASS | 依赖无新增供应商、Embedding、向量库或微调；Vercel 的三个接口沿用 DeepSeek。故障降级经 Edge 及程序测试。 |
| V2-LIM-03 | §3.2 | 无音视频或绘画专业评分。 | V2-P06 | 架构、生成物、接口、持久化及交付审查 | 自检界面与结果仅是有限反馈或自评。 | PASS | 自检仅记录用户选择及实际学习操作；代码和 UI 无专业音、视频或作品评分。 |
| V2-LIM-04 | §3.2、6.4、DEC-019 | 无日历、推送、后台定时与自动跨日。通过「下一日」手动推进模拟自然日。 | V2-P06 | 架构、生成物、接口、持久化及交付审查 | 仅用户触发，后台空闲或跨午夜不改变状态。 | PASS | P07　DEC-019 仅手动点击推进；后台不读取墙钟重排。浏览器立即切日和刷新复验。 [证据](v2-audit-resolution.md) |
| V2-LIM-05 | §3.2、9.3 | 无登录、云同步、商业化或新持久化基础设施。 | V2-P06 | 架构、生成物、接口、持久化及交付审查 | 只使用现有本地状态与无状态服务，不建项目管理或账号模块。 | PASS | 版本化 localStorage 读写测试与代码审查确认仅客户端单会话，无登录、同步、数据库或项目管理。 |
| V2-LIM-06 | §3.2、7.9 | 无后续追加资料及整体再生成。 | V2-P06 | 架构、生成物、接口、持久化及交付审查 | 学习页无追加入口，执行器无全局重规划动作。 | PASS | 首页一次导入。正式学习界面无追加入口，执行器拒绝整体重规划或任意外部工具。 |
| V2-LIM-07 | §12.11–12.13、1 | 引用溯源、内容边界和服务端密钥保持；优先复用 React/Vite/JS/Tailwind/Vercel 组织。 | V2-P06 | 架构、生成物、接口、持久化及交付审查 | 检查引用与打包，密钥仅服务端，范围差异均有记录。 | PASS | P07　三接口继续服务端读取配置，构建检查未发现 Key 配置标志、供应商 URL 和 Agent Prompt。 [证据](v2-audit-resolution.md) |


## 独立审查补充要求

| 需求 ID | 原规格及依据 | 需求 | 阶段 | 实现位置 | 验收方式 | 状态 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V2-EX-01 | [独立审查](v2-audit.md#原矩阵遗漏或合并后需单独判定的约束) | 关键前置与历史版本的一致性，即使原实例已开始并经用户确认（§6.3、7.6、7.9；拆自 DAY-06／AG-07） | V2-P07 | [学习调度](../src/learningDays.js) | [修复追踪](v2-audit-resolution.md) | PASS | R1 直接提交旧完成命令，确认拆解和延期后拦截，保留开始时间、问答及历史，撤销后恢复合法执行。 |
| V2-EX-02 | [DEC-019](decisions.md#dec-019demo-采用手动推进的模拟自然日) | 原文明确的自然间隔才按对应模拟分钟排程，频率与复核分别校验。 | V2-P07 | [计划双端校验](../src/services/validateLearningPlan.js) · [服务端规划](../server/learningAnalysis.js) | [修复追踪](v2-audit-resolution.md) | PASS | R5 真实但无时间内容的引用及复核或单次时长被拒；真实 48 小时使用模拟 2880 分钟。 |
| V2-EX-03 | [独立审查](v2-audit.md#原矩阵遗漏或合并后需单独判定的约束) | 第三方模型发送前告知，覆盖切日等交互发起的 Agent 观察（V1 正式 PRD §5.2；原矩阵未明确追踪） | V2-P07 | [今日页](../src/DailyLearningView.jsx) · [正式 PRD](prd.md#5-数据接口与隐私) | [修复追踪](v2-audit-resolution.md) | PASS | 新建与恢复界面渲染测试、真实浏览器均验证显示学习记录、问答、资料片段及供应商条款的发送前告知。 |
| V2-EX-04 | [独立审查](v2-audit.md#原矩阵遗漏或合并后需单独判定的约束) | 历史完成状态与问答驱动的真实模型计划调整实例（本轮审查 §7；细化 VAL-03／08） | V2-P07 | [观察](../src/learningObservation.js) · [Agent](../src/learningAgent.js) | [修复追踪](v2-audit-resolution.md) | PASS | 真实两日分别 partial、2/3 条引用及 time 原话；Day 3 模型引用两天任务及问答，ADJUST_PRACTICE 经核验应用 6→3，KEEP_PLAN，完成后可观察。 |
| V2-EX-05 | [独立审查](v2-audit.md#原矩阵遗漏或合并后需单独判定的约束) | 独立复核定性用户反馈的出处及证据限度（原始规格 §2.2、14.2；细化 DOC-02） | V2-P07 | [v2-spec.md:43](../docs/v2-spec.md#L43) · [decisions.md:126](../docs/decisions.md#L126) · [prd.md:5](../docs/prd.md#L5) | [修复追踪](v2-audit-resolution.md) | UNVERIFIED | 定性叙述由原始规格和决策记录提供，缺少原始访谈和留存数据；正式 PRD 已说明边界，无新增量化数据。 |
| V2-EX-06 | [独立审查](v2-audit.md#原矩阵遗漏或合并后需单独判定的约束) | 执行回执反映受影响的实际学习实例版本（§7.7、8.3、9.2；细化 AG-11／UI-03） | V2-P07 | [变更影响](../src/agentPlanChanges.js) · [回执](../src/learningAgent.js) · [观察](../src/learningObservation.js) | [修复追踪](v2-audit-resolution.md) | PASS | R2/R3 的当日实际更新、后续适用、暂停及历史更新有类型回执；真实 6→3 明确返回 day-3:practice updated。 |
| V2-EX-07 | [独立审查](v2-audit.md#原矩阵遗漏或合并后需单独判定的约束) | 继承 V1 AC01、§5.3 的 10 份、图片格式／大小及长文限制（细化 WF-09） | V2-P07 | [导入](../src/App.jsx) · [图片检查](../src/materials.js) · [分析接口](../api/analysis.js) | [修复追踪](v2-audit-resolution.md) | PASS | 复查 10 份资料、文字长度及图片验证路径。既有异常回归通过，真实图文读取复验。 |
