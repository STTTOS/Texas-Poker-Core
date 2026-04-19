# 迁移路线图：命令 / 事件 + 副作用解释器

本文档说明如何**分阶段**从当前「对象方法 + 内置 callback / pacing hooks」演进为 [architecture-events-orchestration.md](./architecture-events-orchestration.md) 中的目标模型。  
原则：**每一阶段可合并、可发布、可回滚**；不必等「大重写」一次到位。

---

## 0. 目标模型（一句话）

- **Core**：`apply(state, command) → { state', events[] }`，无 DB / 无 `sleep` / 无 WS。
- **业务**：`interpret(events, handlers)`，写库、推送、节奏、录像、机器人策略都在这里**换 handler**。

---

## 1. 阶段总览

| 阶段 | 名称                     | 核心产出                                                      | 典型周期（示意） |
| ---- | ------------------------ | ------------------------------------------------------------- | ---------------- |
| 0    | 对齐词汇与边界           | 事件草稿表、禁止事项清单                                      | 很短             |
| 1    | 旁路观测：先「长」出事件 | 每次行动后内存里有一份 `events[]`（可先与行为等价于日志）     | 小               |
| 2    | 业务侧解释器雏形         | `interpret()` + `handlerPersist` / `handlerNotify` 空壳或双写 | 中               |
| 3    | callback 迁入解释器      | `#callbackOfAction` 等从 Core 调用链迁到 handler              | 中               |
| 4    | pacing 迁出 Core         | 去掉 `TexasTurnPacingHooks` 内嵌 await，延迟交权或外层 pacing | 中～大           |
| 5    | Command 统一入口         | 对外只暴露 `dispatchCommand`，`Player.bet` 等变薄或私有       | 大               |
| 6    | 持久化与回放             | append-only 事件日志、重放校验、机器人复用同入口              | 按需迭代         |

阶段 3 ～ 4 可部分交错，但建议 **先 3 再 4**：先习惯「副作用在解释器」，再动控制流与时序，风险更小。

---

## 2. 阶段 0：对齐词汇与边界

**目的**：团队对「什么叫 Command / Event / Handler」有一致定义，避免后面重构时命名混乱。

**要做的事**

1. 评审并定稿 **[领域事件表（草稿）](./domain-events-catalog.md)**：含事件类型、`handId`/`seq` 约定、**Core 真多步跑马**下的 `StageAdvanced` 序列、与现有 `TexasEngineEvent`/callback 的映射及待决问题清单。
2. 写清 **Core 禁止清单**：`setTimeout`、`sleep`、直接写库、直接 WS，长期都应迁出（当前代码可先标 TODO）。
3. 约定 **seq / handId**（或等价单调序号）：为以后幂等与回放预留字段（详见事件表 §1）。

**完成标准**：文档评审通过；无需改生产行为。

**与本仓库**：事件表 §3 已给出「事件类型 ← 当前触发点」映射初稿；实现时以定稿后的 `domain-events-catalog.md` 为准。

---

## 3. 阶段 1：旁路观测——先产出事件，不改变对外语义

**目的**：在不改变游戏结果的前提下，让每次合法行动后都能拿到 **结构化 `events[]`**（哪怕最初是「从事后状态 diff 推出来」）。

**可选实现策略（由易到难）**

- **A. 包装层**：在业务调用 `bet` / `fold` 成功后，根据返回状态或只读快照 **构造** 事件列表（与 Core 并行维护，易漂移，仅适合极短期）。
- **B. Core 内旁路**：在 `transferControl` / `tryToAdvanceGameToNextStage` / `tryToEndGame` 等**已确定事实**的锚点，向 `session.eventBuffer.push(...)` 追加事件；**不改变**原有 `await` 顺序。
- **C. 理想方向**：在状态变更函数末尾统一 `collectEvents`，与阶段 5 更接近。

**完成标准**

- 单测或集成测：同一串操作后 `events` 条数与类型稳定可断言。
- 线上可开关：关闭旁路时行为与改造前一致。

**风险**：若用 A，事件与真实规则易不一致；应尽快过渡到 B/C。

---

## 4. 阶段 2：解释器雏形 `interpret(events, handlers)`

**目的**：业务代码里出现**固定形状**的编排：`interpret(events, ctx, pipeline)`，pipeline 可先只有 `noop` 或日志。

**要做的事**

1. 在 **业务工程**（或本仓库的 `Texas` 适配层）新增模块，例如 `orchestration/interpret.ts`：  
   `for (e of events) for (h of handlers) await h(ctx, e)`。
2. 定义 `Handler` 类型与 `OrchestrationCtx`（`roomId`、`db`、`ws`、`config` 等）。
3. 先挂 **两个空壳**：`handlerPersist`、`handlerNotify`（内部 `console.debug` 或 metrics），逻辑仍可由旧 callback 执行——**双跑一段时间**亦可。

**完成标准**：任一手牌流程中，至少有一条路径走 `interpret`；可观测（日志/指标）证明 pipeline 被调用。

---

## 5. 阶段 3：把 callback（写库、推送）迁入 handler

**目的**：`Player` / `Controller` **不再直接** `await` 业务 callback；改为 Core 产出事件后由 **handlerPersist / handlerNotify** 执行原逻辑。

**要做的事**

1. 将 `#callbackOfAction` 的调用点改为：「本次 `apply` 产生的 `PlayerActed` 等」在 **解释器**里处理；Core 侧删除或降级为可选兼容层（feature flag）。
2. 明确 **顺序**：例如 persist → notify（或产品要求的其它顺序），写进 pipeline 配置而非散在多处。
3. 指标拆分：`apply` 结束记一段耗时；`interpret` 内 persist/notify 分段记时。

**完成标准**

- Core 单测不再 mock「写库」；集成测在 handler 层 mock DB/WS。
- 行为与迁移前一致（回归测试通过）。

**详见**：[architecture-events-orchestration.md §4](./architecture-events-orchestration.md) 伪代码。

---

## 6. 阶段 4：pacing 迁出 Core（延迟交权或等价）

**目的**：`beforeNextPlayerTurn` / `beforeStageAdvance` 不再在 `Controller.transferControlTo` 内 `await`；**节奏只属于** `handlerPacing`（或业务在 `interpret` 前后显式编排）。

**要做的事**

1. 定义 **中间态不变量**：例如「行动已提交、尚未 `openNextTurn`」时是否接受新 Command；写进文档与测试。
2. 实现 **延迟交权**：`apply` 只更新状态 + 事件；`handlerPacing` 在 `await delay` 后调用 **`openNextTurn()`**（或等价 API）触发 `getControl()` / 计时器。
3. 删除或旁路 `TexasTurnPacingHooks` 的 Core 内 await；保留过渡期可用「兼容 adapter：hooks 挪到默认 `handlerPacing`」。

**完成标准**

- `await bet(...)` 的耗时不再包含「下家思考前的固定 sleep」（若 HTTP 层仍 await 整个 pipeline，需在 API 层拆成两阶段或两指标）。
- 阶段推进与轮询节奏与产品一致。

**详见**：[architecture-events-orchestration.md §3.1](./architecture-events-orchestration.md)。

---

## 7. 阶段 5：Command 统一入口（Facade）

**目的**：外部（HTTP/WS/机器人）只调用 **`dispatchCommand(room, command)`**，内部再 `apply` + `interpret`；`Player.bet` 等变为私有实现或薄封装。

**要做的事**

1. 定义 **Command ADT**：`Bet | Fold | Check | Raise | ...`，带 `playerId`、额度等。
2. 将现有 `Player` 方法内的校验与状态变更 **逐步迁入** 单一 `applyCommand(state, cmd)`（可仍操作现有 `Player`/`Controller` 实例，先**适配器模式**包一层，再考虑纯函数状态机）。
3. 机器人、单元测试、录像重放 **统一** 只发 Command，不走「点对象方法」的杂路径。

**完成标准**

- 新功能只加 Command + apply 分支 + handler，不新增「带副作用的公开实例方法」。
- 全量测试绿。

---

## 8. 阶段 6：持久化模型与回放 / 机器人

**目的**：事件序列可 **append-only** 持久化；重放与线上共用 `apply`；机器人零特殊分支。

**要做的事**

1. 存储：**事件表**（`hand_id, seq, payload`）± **快照表**（加速读）；约定幂等键。
2. **重放工具**：读事件流 → `reduce(apply, initialState)` → 与快照或终局对比。
3. **机器人 runtime**：`interpret(events, [handlerBotDecision])`，其中 `handlerBotDecision` 提交下一 `Command`；pipeline 无 `handlerPacing` 或 gap=0。

**完成标准**

- 指定牌谱 JSONL 重放结果与黄金用例一致。
- 机器人可打完整手牌无人工延迟。

---

## 9. 每阶段通用检查清单

- [ ] 回归测试（含边界：全弃、摊牌、阶段齐）。
- [ ] 可观测：日志/指标能区分 apply vs interpret 各段。
- [ ] 文档：更新本路线图勾选进度；重大不变量写入 `architecture-events-orchestration.md` 附录。
- [ ] 功能开关：便于灰度与回滚。

---

## 10. 与本仓库文件的预期关系（演进后）

| 当前区域                                      | 演进方向                                               |
| --------------------------------------------- | ------------------------------------------------------ |
| `Player#bet` / `fold` / …                     | 迁入 `applyCommand` 或仅作内部实现                     |
| `Player#callbackOfAction`                     | 删除 → `handlerNotify` / `handlerPersist`              |
| `Controller#transferControlTo` + pacing hooks | 无 sleep；交权由 `openNextTurn` 或 pacing handler 触发 |
| `Texas` 构造参数里的 hooks                    | 迁到业务 `liveHandlers` 配置                           |
| 新业务代码                                    | 只依赖 `dispatch` + `interpret`，不依赖 Core 内部类    |

（具体路径可在阶段 5 后按包结构再拆 `packages/core` / `packages/orchestration`。）

---

## 11. 推荐阅读顺序

1. [architecture-events-orchestration.md](./architecture-events-orchestration.md) — 问题背景、原则、伪代码。
2. [domain-events-catalog.md](./domain-events-catalog.md) — 领域事件词汇表与跑马序列（阶段 0 评审稿）。
3. 本文 — 按阶段落地与验收。

---

## 12. 文档维护（与本仓库对齐进度）

在「理想终态」下逐条打勾；**部分完成**用说明标注（更新时请改日期）。

- [x] **阶段 0** — 词汇与边界：`domain-events-catalog.md`、`architecture-events-orchestration.md` §8 **Core 禁止清单**；本手 `handId` + `seq` 已在 `HandDomainEvent` 落地（`HandEventMeta`）。`tableId` / `correlationId` 仍可选、未强制进 payload。
- [x] **阶段 1** — 旁路事件：`Controller` 缓冲 + `Texas.drainDomainEvents()`；类型见 `handDomainEvents.ts`。
- [x] **阶段 2** — 解释器雏形：`src/orchestration/interpret.ts`（`interpret` + `DomainEventHandler`），根 `index` 已导出；业务工程可挂 `handlerPersist` / `handlerNotify`。
- [ ] **阶段 3** — callback → handler：Core 内已无 `#callbackOfAction` 一类钩子；**尚未**要求所有持久化/推送只经 `interpret`（需接入方迁移）。
- [x] **阶段 4** — pacing 迁出：`transferControlTo` **无**内嵌 `await` 节奏；进街与交权固定经 **`pendingFlowOps`** + `Texas#applyPendingStageAdvance` / `flushPendingTurnHandoff`（及测试用 `flushAllPendingFlowOps`）消费。中间态不变量全文仍以接入方文档为准。
- [x] **阶段 5** — Command 门面：`Texas.dispatchCommand` 经 `handBettingActions` 执行；`Player#bet`/`fold` 等标 `@deprecated`，盲注走 `Controller` 内 `executeBet`；迁移期单测仍可调用旧方法。
- [ ] **P4 增量（自愿指令 + 读投影）** — `applyVoluntaryTableCommand`（`Fold|Check|Call|Bet|Raise|AllIn` → `dispatchCommand` + `captureHandReduceProjection`）；`applyFoldOrCheckCommand` 为其别名；`voluntaryActionDisallowError`（`allowedActions.ts`）与跟注面额纯函数 `resolveCallChipsOrError`（`resolveCallChipsOrError.ts`，由 `executeCall` 复用）。下注与交权实现仍在 `Player` + `handBettingActions`，尚未迁入纯 `apply(state, cmd)`。
- [ ] **阶段 6** — 事件持久化与重放：**增量** — 磁带 → 只读复合投影 `projectCompositeReadModel`（`src/replay/projectCompositeReadModel.ts`，根 `index` 已导出）；append-only 存储与官方 `reduce(apply)` 重放 CLI 仍缺；机器人仍可按现有 API 接 Command。

**§9 通用清单**：回归测试随 PR 跑通；apply vs interpret **分段指标**与**功能开关**仍待产品化。
