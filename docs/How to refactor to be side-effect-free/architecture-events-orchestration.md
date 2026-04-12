# 游戏节奏、Core 边界与长期架构方向

本文档整理关于 **turn pacing hooks**、**`bet` / `transferControl` 语义**、以及 **录像回放 / 机器人** 等扩展目标的架构讨论结论，便于后续决策与实现对照。

---

## 1. 现状与问题

### 1.1 当前机制（简述）

- `Controller.transferControlTo` 在移交控制权前会 `await` 业务注入的 `beforeNextPlayerTurn`。
- 阶段推进路径上还有 `beforeStageAdvance`，并与 `skipNextPlayerPacing` 等组合使用。
- 玩家行动（如 `bet`）最终会走到 `Player.transferControl()` → `Controller.transferControlTo()`，因此 **整段 Promise 会包含 pacing 等待**。

### 1.2 语义与可观测性问题

1. **指标**：若业务把「接口处理时长」定义为 `await bet(...)` 的耗时，会把 **规则处理** 与 **节奏 / 动画延迟** 混在一起。
2. **语义**：`bet` 在概念上应是「下注这一规则动作」；**「何时把思考权交给下家」** 属于编排 / 展示策略，不宜内嵌在同一抽象里。
3. **耦合**：在 Core 内通过 hooks 塞入「等多久再交权」，本质是 **编排逻辑侵入领域流程**。

---

## 2. 设计原则（长期）

- **Core（领域）**：校验 → 状态迁移 → 产出**可观测、可序列化的事实**（建议以 **事件** 形式表达）。应尽量 **不** 依赖真实时间、`setTimeout`、数据库、推送。
- **编排 / 基础设施层**：消息顺序、动画、延迟、何时开表计时、写库、WS 推送——均为 **策略与副作用**，可替换、可组合。
- **Callback（写库、推送）**：在架构上归类为 **对领域事件的投影（副作用）**，与「本手规则是否成立」分离。

---

## 3. 可选方案对比（摘要）

### 3.1 延迟交接（Deferred handoff）

- **做法**：规则上 action 已 commit，状态一致；**暂不** `getControl()` 给下家（或等价语义）。业务发完 WS、做完动画后再调用显式 API（如 `openNextTurn` / `flushHandoff`）完成交权。
- **优点**：与现有「先推送行动、再下一手计时」的心智一致；**指标**上可把「commit 完成」与「节奏」拆开。
- **代价**：需定义 **中间态不变量**（commit 后、open 前是否允许再收指令等），并在文档中写清。
- **定位**：可单独作为过渡方案；也可作为下面「解释器」里的一种 pacing 策略。

### 3.2 Core 同步交权 + 外层包装

- **做法**：Core 内不再 `await` pacing；由外层先 `await` 业务再调 `transferControlTo`。
- **局限**：若 `bet` 末尾仍**隐式**调用交权，顺序仍被绑在 Core 内；要彻底解耦通常仍需 **延迟交接** 或 **事件驱动** 的配合。

### 3.3 命令 / 事件 + 副作用解释器（推荐长期主线）

- **输入**：**Command**（意图），如 `Bet`、`Fold`，来源可为 HTTP/WS/机器人，统一入口。
- **核心**：`apply(state, command) → { state', events[] }`（或等价过程式实现，但**产出事件列表**）。无 DB、无 `sleep`、无 WS。
- **输出**：**Event 流**（已发生的事实），如 `BetPlaced`、`Folded`、`StageAdvanced`、`TurnChanged` 等（粒度可迭代）。
- **解释器（可插拔）**：按事件（或批次）执行：
  - 持久化 / Event Store
  - 推送
  - Pacing（动画、`delay`、何时暴露「轮到谁行动」）
  - 录像录制（序列化事件）
  - 机器人（零延迟、无 WS 的另一套解释器）

| 需求        | 仅靠延迟交接 / 外层包装 | 事件 + 解释器                      |
| ----------- | ----------------------- | ---------------------------------- |
| 录像回放    | 易与真实代码路径分叉    | **事件序列为真相**，重放即还原状态 |
| 机器人      | 易到处 `if (bot)`       | 换解释器：零延迟、无推送           |
| 写库 / 推送 | 与 `bet` 完成语义纠缠   | 明确为对事件的 handler             |

**与延迟交接的关系**：延迟交权是 **Pacing 解释器** 的一种实现，而不是 Core 内部的特殊 hook。

### 3.4 「可插拔解释器」指什么、雏形长什么样

**解释器**在这里不是编译原理里的那种「解释执行语法树」，而是一个**很具体的东西**：

- Core 算完规则后，吐出一串 **领域事件** `events[]`（内存里的数据结构即可）。
- **解释器** = 一段（或多段）**按顺序消费这些事件**的代码：对每种事件决定要不要 **写库、推 WS、`sleep`、开倒计时、写入录像磁带** 等。
- **可插拔** = 同一套 `events`，换一组 **handler 列表** 就换行为：
  - 线上：`持久化 + 推送 + 有 turn 间隔`
  - 机器人：可能只要 `TurnChanged → 立即算下一步 Command`，**不 sleep、不广播**
  - 录像录制：`push(JSON)` 到磁带，**不做 WS**

实现上通常就是 **`EventHandler[]` 管道**、或一个小型 `for (e of events) for (h of handlers) await h(e)`，没有神秘框架。

#### 伪代码：Core vs 业务各自做什么

```text
// ---------- CORE：只负责「规则 + 事实」----------
// 输入：当前状态 + 玩家意图（Command）
// 输出：新状态 + 已发生事实（Events）
// 禁止：await DB、await sleep、发 WS

function applyCommand(state, command): { state; events[] } {
  validate(command, state)
  newState = mutateState(state, command)   // 池子、行动历史、轮到谁等
  events = buildEvents(state, newState, command)
  return { state: newState, events }
}

// ---------- 业务层：解释器 = 对 events 做「世界里的副作用」----------
// 可替换：liveHandlers / botHandlers / replayRecorderHandlers

async function interpret(events, ctx, handlers: Handler[]) {
  for (const e of events) {
    for (const h of handlers) {
      await h(ctx, e)   // 顺序策略可按产品调整（串行 / 部分并行）
    }
  }
}

// 线上：写库 + 推送 + 节奏
handlerPersist(ctx, e) {
  if (e is ActionRelated) await ctx.db.saveEvent(e)
}
handlerNotify(ctx, e) {
  if (e is ActionRelated) await ctx.ws.broadcast(room, e)
}
handlerPacing(ctx, e) {
  if (e is TurnHandoff) {
    await delay(ctx.config.gapMs)   // 只有这里「等」
    await ctx.ws.notifyYourTurn(...)
    ctx.startThinkingTimer(...)
  }
}

// 机器人：换一组 handler —— 无 delay，无 WS
handlerBot(ctx, e) {
  if (e is TurnHandoff && e.nextId == ctx.botId) {
    ctx.bot.scheduleNextCommand()   // 仍走同一 applyCommand 入口
  }
}

// 录像：再换一组 —— 只追加到磁带
handlerRecord(ctx, e) {
  ctx.replayTape.push(serialize(e))
}
```

#### 伪代码：一次 HTTP/WS 请求怎么串起来

```text
async function onBetRequest(room, playerId, amount) {
  cmd = { type: "Bet", playerId, amount }

  { state, events } = applyCommand(room.state, cmd)
  room.state = state

  // 指标：若只关心「规则提交」，可在这里记 t1；sleep 在 interpret 里，不计入 bet 核心路径
  await interpret(events, room.ctx, room.liveHandlers)

  return HTTP 200
}
```

要点：**Core 的 `applyCommand` 不等人、不等动画**；**等人、等动画、推消息、写库** 都在 **`interpret` + 可替换的 `handlers`** 里。换场景 = 换 `handlers`，不必 fork 一套 `bet` 实现。

---

## 4. Callback（写库、推送）的归宿

建议将现有「行动后 callback」演进为：

- 规则提交后发出 **领域事件**（如 `PlayerActed`）。
- **PersistenceHandler**：`on(PlayerActed) { await repo.save(); … }`
- **NotifyHandler**：`on(PlayerActed) { await ws.broadcast(); … }`

收益：

- 测试：对 **reducer / apply** 做零 I/O 单测；对解释器做集成测。
- 回放：可只重放事件重建状态，或选择性不重放当年 WS。
- 指标：「命令处理」与「节奏」边界清晰（若需把持久化算进 SLA，也可在解释器层单独计时）。

### 4.1 伪代码：从「bet 里 callback」到「事件 → handler」

**之前（示意）**：副作用挂在行动方法上，和规则一步走完。

```text
async function Player.bet(amount) {
  validate(...)
  mutatePotAndHistory(...)
  await this.callbackAfterAction(this)   // 写库 + 推送全塞在这里
  await this.transferControl()         // 里面还可能 await pacing
}
```

**之后（示意）**：Core 只产事件；写库 / 推送是解释器里**按事件类型**注册的函数，可多可少、可换顺序。

```text
// Core 内：不再调用「业务 callback」，只追加到 events
function applyCommand(state, command): { state; events[] } {
  ...
  events = [
    { type: "PlayerActed", handId, seq, playerId, action: { kind: "Bet", amount }, ...snapshotOrDelta },
    // 可能同一次 apply 里还有：
    { type: "PotUpdated", total: ... },
    { type: "TurnScheduled", nextActorId: ..., reason: "same_street" },
  ]
  return { state: newState, events }
}
```

```text
// 业务层：把原来的 callback 拆成「对事件的 handler」
async function handlerPersist(ctx, e) {
  switch (e.type) {
    case "PlayerActed":
      await ctx.db.insertHandEvent(e.handId, e.seq, e)     // 或 append 到 event store
      await ctx.db.updateHandSnapshot(e.handId, ctx.room.stateForDb())  // 若仍要快照表
      break
    case "HandEnded":
      await ctx.db.closeHand(e.handId, e.settlement)
      break
    // 不关心的事件直接 return
  }
}

async function handlerNotify(ctx, e) {
  switch (e.type) {
    case "PlayerActed":
      await ctx.ws.broadcast(ctx.roomId, { op: "action", payload: e })
      break
    case "StageAdvanced":
      await ctx.ws.broadcast(ctx.roomId, { op: "stage", payload: e })
      break
  }
}

// 与 §3.4 的 interpret 拼在一起：先落盘再推、或先推再落盘，由 handler 顺序决定
room.liveHandlers = [handlerPersist, handlerNotify, handlerPacing, ...]
```

```text
// 入口不变：apply → interpret
async function onBetRequest(room, playerId, amount) {
  const { state, events } = applyCommand(room.state, { type: "Bet", playerId, amount })
  room.state = state
  await interpret(events, room.ctx, room.liveHandlers)
}
```

### 4.2 伪代码：handler 之间如何分工（雏形）

| Concern    | 典型放进哪个 handler | 说明                                                |
| ---------- | -------------------- | --------------------------------------------------- |
| 幂等、顺序 | `handlerPersist`     | 用 `handId + seq` 去重；回放重放同一 seq 可检测冲突 |
| 对外可见   | `handlerNotify`      | 只负责把**已提交事实**推出去，不改规则状态          |
| 节奏       | `handlerPacing`      | `sleep`、开表计时；见 §3.4                          |
| 录像文件   | `handlerReplayTape`  | `tape.push(e)`，常与 persist 共用同一份序列化结果   |

```text
// 最小可运行雏形：三类副作用分三个函数，便于单测替换
const defaultLivePipeline = [
  handlerPersist,
  handlerNotify,
  handlerPacing,
]

// 单元测试「只验规则」：interpret(events, ctx, []) 或 mock ctx
// 集成测试「验写库+推送」：interpret(events, fakeDb, [handlerPersist, handlerNotify])
```

**注意**：若业务要求「必须先落库成功再广播」，则把 `handlerPersist` 放在 `handlerNotify` 前面；若允许「先广播、异步落库」，可拆队列——**顺序是产品设计，不是 Core 硬编码**。

---

## 5. 落地建议（分阶段，不必一步到位）

1. 在现有代码中 **显式列出**「规则完成后会发生的事」（即使暂时仍是函数调用），与 `sleep` / pacing hooks 分离。
2. 将 DB/推送从「与 `bet` 同一 Promise 的隐性含义」迁到 **对结构化事件的 handler**。
3. 引入 **append-only 事件日志**（可先只记关键事件），为录像与对账铺路。
4. 机器人走 **同一 Command 入口 + 无 pacing / 轻量解释器**。

---

## 6. 一句话结论

**长期应以「命令 + 领域事件」为轴心，I/O 与节奏全部放在可插拔的解释器中。**  
录像、机器人、写库、推送均为同一事件流的不同消费方式，避免在 `Player.bet` 与 `Controller.transferControlTo` 中持续堆叠 hooks 与分支。

---

## 7. 相关代码位置（便于对照）

- **领域事件缓冲**：`Controller` 内 `#handEvents`、`drainHandEvents`；本手 `handId` + `seq` 在 `start()` / `#eventMeta()`。
- **统一指令**：`Texas.dispatchCommand`、`domain/tableCommand.ts`。
- **解释器雏形**：`src/orchestration/interpret.ts`（`interpret` + `DomainEventHandler`）。
- **交权**：`Controller.transferControlTo` 当前为同步 `getControl()`，**不再**内嵌 `await` pacing hook；动画/间隔由业务在消费 `TurnOffered` / `StageAdvanced` 后自行延迟（阶段 4 的「延迟交权 / openNextTurn」仍为可选演进）。
- **玩家行动链**：`Player.transferControl`、`handBettingActions`、`notifyActionCommitted`。

---

## 8. Core 禁止清单（阶段 0，长期约束）

下列能力**不应**出现在领域规则路径（`Player` 下注、`Controller` 阶段机、池子结算等）的**必选**依赖中；若暂时存在，应标 TODO 并迁往解释器或业务层：

| 禁止 / 慎用在 Core 内                               | 归属                                       |
| --------------------------------------------------- | ------------------------------------------ |
| `setTimeout` / `sleep` 驱动「何时交权」             | `handlerPacing` 或 API 层                  |
| 直接写数据库 / ORM                                  | `handlerPersist`                           |
| WebSocket / HTTP 推送                               | `handlerNotify`                            |
| `Date.now()` 写入**规则事实** payload（回放非确定） | 出站打时间戳由 handler 完成（见事件表 §1） |

**允许**：`TexasEngineContext.emitTrace` 类诊断日志（不参与规则真值）；测试/仿真开关。
