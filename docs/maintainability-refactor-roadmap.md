# 长期可维护 / 可扩展重构路线图

本文档记录德州引擎在**架构层面**的演进方向与优先级，与 `docs/refactoring-class-responsibilities.md`（已完成的一轮拆分说明）互补：前者偏「历史与模块边界」，本文偏「接下来要做什么、为什么」。

---

## 目标

- **单一职责（SRP）**：**SRP** 即 _Single Responsibility Principle_（单一职责原则）：一个类/模块应主要因**同一类变更理由**而改变；本仓库语境下指发牌、阶段机、下注、摊牌评估、奖池、房间规则边界清晰。
- **单一数据源**：局面类数据（已发牌、摊牌评估）集中持有，`Player` 尽量只做「参与者身份 + 回合状态 + 对外协作入口」。
- **可测试、可替换**：纯规则与 I/O 分离；依赖通过窄接口注入，便于单测与后续插件化（不同盲注结构、边池规则等）。

---

## 优先级总览

| 层级   | 内容                                                                                                                                              | 状态                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | 下注/街道行动从 `Player` 抽到 `handBettingActions`；摊牌评估从 `Player` 字段迁到 `HandSettlement` 按 `userId` 存储，`Player` 经 `Controller` 只读 | **已实施**：`src/Player/handBettingActions.ts`、`HandSettlement` 内 `#evalByUserId`、`Controller.getShowdownEvalForPlayer`、`Texas.reset()` 先 `controller` 后 `dealer`                      |
| **P1** | `TableStakes` 对象化；`Player` 依赖窄接口（`PlayerDealerRing` / `PlayerHandSession` / `StreetPotSink`）而非具体 `Dealer`/`Controller`/`Pool` 类型 | **已实施**：`src/TableStakes.ts`、`src/playerSessionPorts.ts`；`Dealer`/`Controller`/`Pool` 分别实现对应接口；`HandLifecycle` 迁至 `gameContracts` 打破循环依赖                              |
| **P1** | `Pool.add` 与余额变更收拢为 `Ledger` 或显式「扣款 + 记池」                                                                                        | **已实施**：`Pool/StreetBetLedger` 负责玩家侧扣款；`Pool#recordPotContribution` 负责 `totalAmount` / `betRecords`；`PlayerStreetBetLedger` 见 `playerSessionPorts`                           |
| **P2** | 显式 `Hand` / `CurrentHand` 聚合根，一手内状态归位                                                                                                | **已实施**：`src/Hand/CurrentHand.ts`；`Controller` 内聚 `#hand` 持有生命周期/街/控制权/盲注记录/`HandSettlement`                                                                            |
| **P2** | 领域事件 + 读模型，收敛 `Texas` 上零散 callback                                                                                                   | **已实施（渐进）**：`Texas.subscribeEngineEvents` 统一 `roles_assigned` / `cards_dealt` / `hand_completed` / `stage_advanced`；与 `onRolesAssigned` 等并存；`Controller` 回调支持多 listener |
| **—**  | **`Controller` / `Player` 按 SRP 继续瘦身**（阶段机、`#hand`、玩家侧计时与协作边界再拆）                                                          | **未做**：见下文「未做 / 后续」                                                                                                                                                              |

---

## P0（已采纳设计要点）

### 1. `Player/handBettingActions.ts`

- **职责**：在「已轮到行动、允许动作列表已确定」的前提下，执行 check / fold / bet / raise / call / all-in 的校验、写回 `Player` 本街动作、写入奖池、通知荷官行动历史、trace、以及交回控制权链。
- **`Player` 保留**：计时、`allowedActions` 上下文拼装、`transferControl`、状态字段；对外 `check()` 等仍为 `Player` 的 API，内部委托给 `handBettingActions`，避免调用方大面积改名。

### 2. 摊牌评估存入 `HandSettlement`

- **职责**：`bestFiveCards`、`rankSignature`、`rankStrength`、`rankCategory` 作为**本手摊牌快照**，按 `userId` 存在 `HandSettlement` 的 Map 中。
- **`Player` 对外**：仍提供同名 getter（若本手未结算或已 `reset`，返回 `undefined` / `0`），`Pool.getWinners` 等无需改动调用方式。
- **`Texas.reset` 顺序**：先 `controller.reset()`（清空 `HandSettlement`），再 `dealer.reset()`，避免在清空桌面后仍短暂读到上一手的牌力快照。

---

## P1（已落地摘要）

- **`TableStakes`**：`bigBlind`、`smallBlind`（大盲之半）、`lowestBetAmount` 别名；`Dealer` 构造仍接受 `number`，内部转为 `TableStakes`。
- **窄接口**：`Player` 构造参数为 `stakes`、`pot`、`dealerRing`、`handSession`；运行时仍传入真实 `Pool`/`Dealer`/`Controller`（结构化实现接口）。
- **`HandLifecycle`**：定义于 `gameContracts.ts`，`Controller` 再导出，供 `playerSessionPorts` 引用。
- **`StreetBetLedger`**：`Pool.add` = 玩家账务扣减 + 中央池记账两步；包入口导出 `StreetBetLedger` / `PlayerStreetBetLedger`，便于自定义测试或接审计。

## P2（已落地摘要）

- **`CurrentHand`**：一手内状态（`status` / `stage` / `boardThroughStage` / `activePlayer` / `defaultBets` / `HandSettlement`）由 `Controller` 的 `#hand` 持有；`reset()` 与 `Controller.reset` 对齐。
- **领域事件**：`TexasEngineEvent` + `subscribeEngineEvents`；终局与进街与 `controller.onGameEnd` / `onNextStage` 同源 payload。角色与发牌在 `setPlayerRoles` / `dealCards` 内同步发出。历史 `onXxx` callback 仍可用；后续可逐步只保留事件总线或再拆 `PotDistributed` 等细粒度事件。

## 未做 / 后续

### `Controller` 与 `Player` 继续变薄（SRP 持续优化）

- **现状**：`CurrentHand` 已把手牌内状态（生命周期、街、控制权、盲注记录、`HandSettlement`）归位到 `#hand`，但 **`Controller` 仍同时承担**阶段机、控制权转移、与 `#hand` 的编排，类仍偏大、变更面仍多。
- **`Player`**：仍集中计时、`allowedActions` 上下文、交回控制、会话与池协作等；虽已有 `handBettingActions` / `allowedActions` / `turnTiming` 等抽取，**单文件体量与职责面仍可再拆**。
- **方向**：按 SRP 把「阶段推进 / 终局路径 / 纯状态持有」的协作边界划清（例如独立模块或更窄的内部类型），**属持续重构**，适合多轮小步 PR，而非与 P0–P2 同级的单次交付。

---

## 与 OpenSpec / 其它文档

- OpenSpec 中若仍写「写入每个玩家的 `bestFiveCards`」，语义上应理解为：**写入本手摊牌评估存储（当前实现为 `HandSettlement`），`Player` 上为只读视图**。
- 实现细节变更时，以本文 **P0 设计要点** 与源码为准，并同步更新相关 spec 段落。
