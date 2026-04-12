# 领域事件表（草稿，待核对）

本文档列出向 **「领域事件 + 外层解释器」** 演进时建议的 **事件词汇与粒度**，供评审与实现对照。  
**已定方向**：摊牌前公牌揭示在 **Core 内真多步推进（跑马 / runout）**——每一街状态与亮牌均为事实，便于回放、机器人与 UI 节奏（节奏本身仍在解释器，Core 不 `sleep`）。

---

## 1. 约定（建议所有事件携带的元数据）

| 字段                 | 说明                                                           |
| -------------------- | -------------------------------------------------------------- |
| `handId`             | 本手唯一 id（桌级单调生成）                                    |
| `seq`                | **本手内**单调递增序号，持久化与回放幂等、排序用               |
| `tableId` / `roomId` | 可选，便于多桌路由                                             |
| `correlationId`      | 可选；同一次 `applyCommand` 产出的多条事件可共享，便于日志关联 |

**关于 wall-clock 时间戳（`recordedAt` / `serverTime` 等）**

- **是干什么的**：表示「这条记录在**现实世界**里大约何时落库/出站」，用于运营统计、对局争议、慢查询分析、与外部系统对账等。它和 **牌局规则**无关：同一手牌重放两次，`seq` 应一致，但 wall-clock 可以不同。
- **为何不放 Core**：Core 若写 `Date.now()`，单测/重放会**非确定**（同样输入每次时间不同）；机器人、录像重放也难对齐。因此建议：**Core 只产出规则事实 + `seq`**；解释器在 `handlerPersist` 或 `handlerNotify` 里**写入库/发 WS 前**再打上 `recordedAt`。
- **纯确定性回放**：重放时只依赖 `seq` 与 payload 即可还原状态；若需要「当年那一把的真实时间轴」，那是**持久化层**存的历史字段，不必让 Core 计算。

---

## 2. 事件总表（按生命周期）

以下为 **建议的事件类型名**（实现时可映射为 TS 联合类型）。payload 为形状说明，非最终实现。

### 2.1 桌 / 会话（偏门面，可与 `Texas` 对齐）

| 事件类型         | 何时发出                                                                                                         | Payload 要点                                        | 与现状近似对应                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| `RolesAssigned`  | 座位与角色确定（含 action 顺序）                                                                                 | `players: { userId, name, role, actionIndex }[]`    | `Texas` `roles_assigned` / `onRolesAssigned` |
| `HoleCardsDealt` | 私牌已发；**推荐** Core 写**全量** `byUserId`（规则真值），各客户端可见性由解释器过滤（见 **§5 仍待选 · 私牌**） | `byUserId: Record<userId, Poke[]>` 或每人一条子事件 | `Texas` `cards_dealt` / `onDealCards`        |

### 2.2 本手开始与盲注

| 事件类型       | 何时发出                                                         | Payload 要点                                                       | 与现状近似对应             |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| `HandStarted`  | 一手在 `Controller` 侧进入可玩状态（盲注前或紧接盲注，择一固定） | `handId`, `buttonUserId?`, `sbUserId`, `bbUserId` 等               | trace / `onGameStart` 前后 |
| `BlindsPosted` | 小盲/大盲已从栈扣入池                                            | `posts: { userId, amount, kind: 'sb' \| 'bb' }[]`, `potTotalAfter` | `defaultBets` 一类信息     |
| `HandAborted`  | 本手合法取消（人数不足等，若规则支持）                           | `reason`                                                           | 少见，按需                 |

### 2.3 玩家行动与池子

| 事件类型             | 何时发出                                                                                     | Payload 要点                                                                                                                | 与现状近似对应                         |
| -------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `PlayerActed`        | 某次合法行动已提交（规则已接受）                                                             | `userId`, `action`: `Fold` \| `Check` \| `Call` \| `Bet` \| `Raise` \| `AllIn`（含金额/增量等）, `street`, `balancesAfter?` | `Player` `onAction` / 行动历史         |
| `PotUpdated`         | 中央池总额或边池结构变化后（**可选粗粒度**：仅在本手关键节点发；**细粒度**：每次贡献后都发） | `totalAmount`, `betRecords` 快照或 delta                                                                                    | `Pool` 状态；**单拎出来的意义见 §7.5** |
| `BettingRoundClosed` | 当前街下注轮结束（即将进街或进入跑马/终局）                                                  | `street`, `reason`: `'all_matched' \| 'all_in_runout' \| 'fold_win_pending'` 等                                             | 无直接 callback；可由规则推导          |

### 2.4 阶段与公牌（**含正常进街与跑马**）

**原则**：凡 `boardThroughStage` 或公共牌张数变化，都应有可序列化事实；**禁止**仅在一次 `HandEnded` 里「跳过中间街」描述公牌（与已定「Core 真多步跑马」一致）。

| 事件类型        | 何时发出                                                                        | Payload 要点                                                                                                                                    | 与现状近似对应                                                         |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `StageAdvanced` | 当前「游戏阶段」从 `fromStage` 进到 `toStage`，且本步有新亮牌或明确无牌（极少） | `fromStage`, `toStage`, `pokesRevealedThisStep: Poke[]`, `boardThroughStageAfter`, `advanceKind`: `'betting_round_complete' \| 'runout_reveal'` | `onNextStage`；跑马时 **连发多条**（Flop→Turn→River 各一条或按你拆法） |
| `RunoutBegun`   | 可选：从「有人需行动」切到「仅亮牌至河牌再比牌」时打标                          | `fromStreet`, `remainingStreets`                                                                                                                | 见下文 **§7.2**；**可不实现**                                          |

**跑马（全下后无更多下注）建议 Core 行为**：

1. 不在单次状态跳转中把 `stage` 从例如 `PRE_FLOP` 直接设为 `RIVER` 再结算。
2. 改为内部循环：每揭示一条街 → 更新 `DealtBoard` / `boardThroughStage` → 追加一条 `StageAdvanced`（`advanceKind: 'runout_reveal'`）→ 直至河牌。
3. 再在河牌后发结算类事件与 `HandEnded`。

**跑马时「每条街之间的间隔」谁控制**：**解释器**，不是 Core。常见两种做法（见 **§7.3**）：（1）一次 `apply` 产出多条 `StageAdvanced`，`interpret` **逐条** `await handlerPacing`（Flops 与 Turn 可配不同 `delayMs`）；（2）每条街一次 `apply`（如 `RunoutRevealNext`），业务在两次调用之间自己 `sleep`——更灵活，但 API 更碎。

**独家获胜（其余均弃牌）**：通常 **不发生** 后续 `StageAdvanced`（未发公牌则保持当前 `boardThroughStage`）；直接走 2.5 的 `HandEnded`（`outcome: 'fold_win'`）。与当前 `tryToEndGame` 中 fold 分支语义一致。

### 2.5 控制权（轮到谁行动）

| 事件类型      | 何时发出                                                       | Payload 要点                                                                 | 与现状近似对应                                                   |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `TurnOffered` | 行动权交给某玩家（可行动时）                                   | `userId`, `street`, `allowedActions` 快照或引用, `deadlineAt?`（若由规则算） | `getControl` 语义；**与 `PlayerActed` 同事务边界见 §5 已定决策** |
| `TurnEnded`   | 当前行动方**思考窗口结束**（已提交行动、超时收权、或规则收权） | `userId`, `reason`                                                           | 见 **§7.4**、**§7.6**（与 Core 是否内置超时 Hook 的关系）        |

### 2.6 摊牌评估与终局

| 事件类型     | 何时发出                                | Payload 要点                                                                                            | 与现状近似对应                                                               |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PotAwarded` | 彩池已按赢家分配（栈已增减）            | `allocations: { userId, amount }[]`, `potTotalAfter`                                                    | `Pool.pay` 前后                                                              |
| `HandEnded`  | 本手完全结束，控制器进入可复盘/待下一手 | `outcome`: `'showdown' \| 'fold_win'`, `endStage`, `pokesRevealed`（全公牌累计）, 摊牌时 `bestPokes` 等 | `onGameEnd` / `hand_completed`；摊牌最强组合与牌型见本事件，宜作收尾或近收尾 |

**顺序建议（摊牌路径）**：多条 `StageAdvanced(runout_reveal)` → `HandEnded`（`outcome: 'showdown'`，含最佳牌信息）→ `PotAwarded`（由 `Texas.settle()` 等触发，可与 `HandEnded` 同批或紧随）。

---

## 3. 与当前 `TexasEngineEvent` / callback 的映射（迁移用）

| 当前机制                                      | 建议替代/拆解                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `roles_assigned`                              | `RolesAssigned`                                                                     |
| `cards_dealt`                                 | `HoleCardsDealt`                                                                    |
| `stage_advanced`                              | `StageAdvanced`（`advanceKind: 'betting_round_complete'`）                          |
| `hand_completed`                              | **`HandEnded` + 前置** `StageAdvanced`（跑马多条）/ `PotAwarded`（按你最终粒度）    |
| `onGameEnd` 单 payload                        | 拆成上表多条事件；兼容期可由 adapter **由 events 再组装**旧 payload                 |
| `onNextStage`                                 | `StageAdvanced`                                                                     |
| `onAction`                                    | `PlayerActed`（+ 可选 `PotUpdated`）                                                |
| `beforeStageAdvance` / `beforeNextPlayerTurn` | **不对应事件**；迁到解释器 `handlerPacing`，消费 `TurnOffered` / `StageAdvanced` 等 |

---

## 4. 序列示例（便于核对）

### 4.1 正常：翻牌圈结束 → 发转牌

1. `PlayerActed`（最后一注）
2. `BettingRoundClosed`（可选）
3. `StageAdvanced`：`FLOP → TURN`，`pokesRevealedThisStep` 为 1 张，`advanceKind: 'betting_round_complete'`
4. **另一次**规则提交 / 事件批次：`TurnOffered`（转牌圈首位）— 与 §5「硬边界」一致时，**不与** 1 ～ 3 混在同一 `apply` 产物里（实现上可为连续两次 `apply` 或两段 `events[]`，由编排约定）。

### 4.2 跑马：翻牌前全下，需发 Flop、Turn、River

1. `BettingRoundClosed`（`reason: 'all_in_runout'` 或等价，可选）
2. `RunoutBegun`（可选）
3. `StageAdvanced`：`PRE_FLOP → FLOP`，3 张，`advanceKind: 'runout_reveal'`
4. `StageAdvanced`：`FLOP → TURN`，1 张，`advanceKind: 'runout_reveal'`
5. `StageAdvanced`：`TURN → RIVER`，1 张，`advanceKind: 'runout_reveal'`
6. `HandEnded`（`outcome: 'showdown'`，含 `bestPokes` / 牌型等）
7. `PotAwarded`（若本手会调用 `settle()`，可与 6 同批或紧随）

### 4.3 独家获胜：一人未弃牌

1. `PlayerActed`（Fold）
2. `HandEnded`（`outcome: 'fold_win'`，`endStage` 为当前街，公牌未发则不推进 `StageAdvanced`）

---

## 5. 待你核对的问题（评审清单）

### 已定决策

- **`PlayerActed` 与 `TurnOffered` 硬边界**：**不在同一规则事务里**打包「下家轮到谁」。一次 `apply`（或严格定义下的一批事件）只表达**一类**迁移：例如先处理 `Bet`/`Call` → 仅产出 `PlayerActed`（及可能的 `PotUpdated` 等）；**再**由下一次 `apply`（如 `OfferNextTurn` / 内部在行动链末尾显式调用的第二步）产出 `TurnOffered`。
  - **好处**：命令边界清晰、幂等与重放简单、不会出现「一个 HTTP 请求里既算行动又算交权」的语义纠缠。
  - **代价**：编排层多一次调用或状态机多一步；解释器可对**相邻两步**仍串行 `await`，对外延迟可不变。

### 仍待选

1. **`PotUpdated` 要发得多细**

   - **细**：每次有人下注/跟注/全下后都发一条 `PotUpdated`（池子总额、记录表快照或增量）。好处：流水完整，做审计、动画筹码飞入池子方便。坏处：事件多。
   - **粗**：只在「一条街结束」或「本手结束」发一两条。好处：事件少。坏处：中间过程要靠别的事件推断或读状态快照。

2. **私牌怎么发到各客户端（你已选：Core 全量 + 解释器过滤）**

   - **Core**：`HoleCardsDealt` 的 payload 里可以包含**桌上每位玩家的真实手牌**（全量事实，便于测试与重放一致）。
   - **解释器 / WS**：给玩家 1 推送时**删掉**其他玩家的牌，只留本人可见；观战、裁判端可另配策略。
   - 这样 Core 不引入「视角」概念，安全与展示策略集中在业务层。

3. **`RunoutBegun` 是否保留**：仅用 `StageAdvanced.advanceKind === 'runout_reveal'` 是否足够（见 §7.2）。

4. **边池**：当前模型若未来扩展，是否在事件表预留 `SidePotChanged` 一类命名。

---

## 7. 常见问题（设计说明）

### 7.1 wall-clock 时间戳是干嘛的？

见 **§1** 段首「关于 wall-clock 时间戳」：主要用于**运营/对账/分析**的「何时写入」，不是牌规的一部分；宜在解释器持久化或出站时附加，保证 Core 与重放确定性。

### 7.2 `RunoutBegun` 这个事件是干啥的？

**纯标记用**：告诉外围「接下来连续几条 `StageAdvanced` 都属于**跑马亮牌**，不是正常下注圈进街」。便于：

- UI 一套「跑马动画」皮肤，与普通发翻牌区分；
- 统计里单独统计 runout 局数。

规则上**不是必须**：从第一条 `StageAdvanced(..., advanceKind: 'runout_reveal')` 也能推断已进入跑马。团队若嫌事件类型多，**可删 `RunoutBegun`**，只保留 `StageAdvanced`。

### 7.3 Core 内部循环每揭示一条街，节奏怎么给业务灵活控制？

Core 负责：**状态**确实一条街一条街变（真多步），**不在 Core 里 `sleep`**。

业务灵活间隔靠 **解释器**：

- **做法一（常见）**：一次规则提交后 `events = [StageAdv₁, StageAdv₂, StageAdv₃, …]`，`interpret` 里 `for (e of events)`，遇到 `StageAdvanced` 且 `advanceKind === 'runout_reveal'` 时 `await delay(config.runoutGapMs[toStage])`，再 `ws.broadcast`。Flops / Turn / River 用不同配置即可。
- **做法二**：每条街单独 `apply`（例如由解释器在 delay 后调用 `continueRunout()`），间隔完全由业务两次调用之间决定；Core 每次只前进一条街、产一条 `StageAdvanced`。

回放时：重放 **事件序列**；若用做法一，重放仍可对每个 `StageAdvanced` 再套同样 pacing（或 `gapMs=0` 快放）。

### 7.4 `TurnEnded` 在录像里扮演什么角色？只有 `PlayerActed` 不够吗？

**够还原「他做了什么」**：多数录像只重放 `PlayerActed` + `StageAdvanced` + `HandEnded` 即可还原牌局结果。

**`TurnEnded` 额外价值**：

- 标记「**思考权这段区间**结束」：含**超时未动**被系统收权时，可能没有新的 `PlayerActed`，但仍需明确「轮到下一人」的起点；
- 分析 **思考时长**、做「轮到谁」的 UI 高亮起止，而不必从下一个 `TurnOffered` 反推。

若不做超时收权、也不做细粒度计时，仍可省略 `TurnEnded`，仅用 `TurnOffered` + `PlayerActed`。

### 7.5 `PotUpdated` 单拎出来的意义是什么？

- **关注点分离**：`PlayerActed` 描述「选了什么动作」；彩池是**派生状态**（多路入口都会改池：跟注、盲注、边池将来拆分等）。单独事件让只关心「池面/底池动画/审计流水」的 handler **不必解析每种 action 语义**即可更新 UI 或账本。
- **订阅与回放**：客户端可以只订 `PotUpdated` 做筹码飞入效果；持久化可以只对池子做快照表，而不把池子再塞进每条 `PlayerActed`。
- **与 `PlayerActed` 解耦**：若将来规则上出现「池子变了但并非某个座位的常规定义行动」（例如修正、边池形成），仍有统一事件类型可挂。

是否**每条**行动后都发（细粒度）仍是 §5 待选题；**类型单拎**与**频率**是两件事。

**与客户端推送次数的关系**：若 `handlerNotify` 对**每条**领域事件各发一条 WS，则同一次用户行动后可能出现 **两条**（先 `PlayerActed`、再 `PotUpdated`）。这是**解释器策略**，不是 Core 强加的：

- **接受两次**：语义清晰（行动一条、池面一条），弱网下客户端也可只依赖 `PotUpdated` 纠偏底池。
- **合并一次推送**：在同一 `interpret` 循环迭代内，对「同一 `correlationId` / 同一用户 tick」把多条事件 **攒批** 成一个 envelope（例如 `{ events: [...] }`）再 `broadcast` —— 仍保留域内两条事件（持久化、回放），只是 **出站消息数** 为 1。
- **冗余快照**：在 `PlayerActed` payload 里**额外带** `potTotalAfter`（与 `PotUpdated` 重复），客户端可只根据一条更新 UI；`PotUpdated` 仍写给只关心池子的模块或用于对账。**注意**与单一数据源约定：以 Core 产出为准，冗余字段需与 `PotUpdated` 一致，否则易漂移。

结论：**领域模型可以拆两条事件**；**推送几次**由业务在解释器里选「逐条 / 批处理 / 带冗余」，不必为了少推一条而把池子逻辑塞回 `PlayerActed`。

### 7.6 若采用 `TurnEnded`，Core 还要不要内置「超时」类 Hook？

**推荐：Core 不内置真实计时 / 超时策略**（不 `setTimeout`、不把「几秒后自动 fold」写在库里）。

推荐形态：

1. Core 产出 `TurnOffered`（规则上轮到谁、允许哪些动作）。
2. **解释器 / 业务**：收到后启动自己的计时器（时长、是否银行家时间、是否全局统一，全在业务配置）。
3. 到时后业务向 Core 发 **显式 Command**（如 `FoldDueToTimeout` / `MuckDueToTimeout`，由规则表定义是否等价于 `Fold`）。
4. Core `apply` 校验「仍是该玩家回合」后，产出 `TurnEnded`（`reason: 'timeout'`），再按 §5 硬边界在**后续** `apply` 中产 `TurnOffered`（下家）或进入阶段推进。

这样 **「多久算超时、超时算弃牌还是过牌、是否提醒一次」** 全是业务策略；Core 只认**合法 Command** 与**状态迁移**。现有 `Player` 上的思考计时若仍存在，演进方向是 **迁到解释器**，与 [roadmap-command-event-interpreter.md](./roadmap-command-event-interpreter.md) 阶段 4 一致。

**注意**：若库内仍保留「可选计时」作为过渡，应标 **deprecated**，与上述目标模型对齐。

---

## 8. 文档关系

- 迁移节奏见 [roadmap-command-event-interpreter.md](./roadmap-command-event-interpreter.md)（阶段 0 以本文为评审稿）。
- 原则与解释器形状见 [architecture-events-orchestration.md](./architecture-events-orchestration.md)。

**状态**：草稿 — 评审通过后可将「草稿」改为「v1」并在实现 PR 中同步调整 payload 字段。
