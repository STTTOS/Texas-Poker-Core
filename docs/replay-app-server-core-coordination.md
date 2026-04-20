# 对局回放：App、Server、Core 如何配合

本文说明在 **领域事件已全量落库** 的前提下，**客户端（App）**、**服务端（Server，以 wish 系为例）** 与 **texas-poker-core（Core）** 如何分工，才能稳定做对局回放（牌谱）。与实时对局流水线的关系见 [integration-core-wish-event-flow.md](./integration-core-wish-event-flow.md)。

---

## 1. 回放的真源是什么

**真源（source of truth）** 是一条按 **产生顺序** 排列的 **领域事件磁带**：即与 `Texas#drainDomainEvents()` 返回顺序一致的 `TexasDomainEvent[]`。

- **规则重放**：只依赖事件类型 + `payload`（以及顺序），不依赖 wall-clock。
- **「像直播一样」的动画回放**：在规则重放之外，还需要每条（或每批）事件上的 **业务写入时间**（见下文物化行里的 `recordedAtMs` / DB `createdAt`），用于相邻事件间隔、进度条等。

Core **不**连接数据库；落库与读库都在 Server；App 通过 Server API 拉磁带或拉已加工视图。

---

## 2. Core：提供什么、不负责什么

### 2.1 提供的能力

| 能力                                                                                                               | 用途                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `TexasDomainEvent` 及子类型（`src/domain/handDomainEvents.ts`）                                                    | 磁带语义契约                                                               |
| `toPersistedDomainEventRows` / `domainEventsFromPersistedRows`（`src/replay/domainEventPersistence.ts`）           | Server 落库行 ↔ 事件对象                                                   |
| `validatePersistedDomainEventRows` / `assertPersistedDomainEventRows`（`src/replay/domainEventTapeValidation.ts`） | 磁带结构巡检（开发 / 对拍）                                                |
| `projectCompositeReadModel`（`src/replay/projectCompositeReadModel.ts`）                                           | 从一段事件序列聚合只读投影（池、公牌、最近 `TurnOffered`、`HandEnded` 等） |
| `reduce*` 族（`src/engine/domainEventReadModel.ts`）                                                               | 按需拆出更细的读模型，供 App 或 Server 复用                                |
| `verifyCanonicalSessionAgainstPersistedRows` 等（`src/replay/verifyCanonicalAgainstTape.ts`）                      | 命令牌谱与事件磁带一致性校验（可选）                                       |

本地/CI 可用脚本：`pnpm replay:composite`、`pnpm replay:validate`、`pnpm replay:verify`（见根目录 `package.json`）。

### 2.2 不负责的事

- 不读 DB、不写 DB、不鉴权、不按观众身份过滤手牌。
- **不**保证跨多手的全局单调 `seq`：`HandDomainEvent` 的 `seq` 是 **本手内** 单调（与 `handId` 配对）；多手对局的全局顺序应以 **落库顺序** 或 Server 分配的 **磁带序号** 为准（见 §3）。

---

## 3. Server：落库、顺序、API

### 3.1 与 Core 对齐的落库行形状

推荐使用 Core 已给出的 **`PersistedDomainEventRow`**（`src/replay/domainEventPersistence.ts`）作为逻辑字段集：

- `tableId`（或你们的 `matchId` / 房间 ID）
- `handId`：会话级事件为 `null`；本手事件与 `payload.handId` 一致
- `seq`：**与 `payload.seq` 一致**（便于与 Core 幂等键对齐）
- `eventType`、`payloadJson`（整颗 `JSON.stringify(TexasDomainEvent)`，反序列化后与 drain 结果一致）
- `recordedAtMs`（可选）：Server 在 **写入该行时** 填系统时间，用于回放 UI 节拍；纯规则重放可不存
- `correlationId`（可选）：便于把一次 HTTP 请求或一次 `drain` 批次关联起来

`DomainEventStore.appendBatch` 表达的是：**按数组顺序追加**，与 `drain` 顺序一致。

### 3.1a `matchId`（业务）与 `handId`（Core）

| 概念                         | 含义                               | 何时有值                                                                                                                                                        |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **matchId**（你们表上）      | 整桌对局 / 房间会话聚合根          | 从创建 `Match`、绑定房间起即可写入                                                                                                                              |
| **handId**（Core `payload`） | **某一手的**磁带 id（`h1`、`h2`…） | 在 **`Controller.prepareHandTape()`** 首次为本手分配（由 `setPlayerRoles` / `dealCards` 触发）；**自 `RolesAssigned` 起**即写入 `payload`，直至该手 `HandEnded` |

因此：`RolesAssigned` / `HoleCardsDealt` 与 `HandStarted` 及后续事件 **共用同一 `handId`**；落库列 `handId` 与 `payload.handId` 应对齐。与「从分配角色起就有 `matchId`」不冲突：前者是「第几手」，后者是「哪一盘」。

### 3.2 全局顺序与幂等

- **整局磁带的全局顺序**：仍以数据库 **自增 `id` / `tapeOrdinal`** 为主；跨多手时 **`payload.seq` 每手从 1 重新计数**（本手内自分配角色起单调递增）。
- **唯一键**：本手内 **`(matchId, handId, seq)`** 可唯一标识一条领域事件（`handId` 与 `payload` 一致）；**不要用 `(matchId, seq)` 单独做全局唯一键**。
- **幂等写入**：建议 **`(matchId, handId, payload.seq)`**（或叠加 `eventType` 若你们允许同 seq 多类型——Core 不会），避免重复 `drain` 双写。

### 3.3 与实时流水线如何衔接

实时对局时，Server 已在 **`drainAndInterpretTexas` / `processTexasDomainEvent`** 路径上处理事件（见 [integration-core-wish-event-flow.md](./integration-core-wish-event-flow.md) §5、§9）。**回放落库**应与该路径 **同序、同内容**：

1. 从 Core `drainDomainEvents()` 得到一批事件（顺序不变）。
2. **先**（或与业务副作用同一事务策略下）调用 `toPersistedDomainEventRows(tableId, events, { recordedAtMs })` 生成行并 `appendBatch`。
3. 再执行现有 WS、结算、Prisma 业务字段更新等（顺序以你们产品为准；文档 [roadmap-command-event-interpreter.md](./How%20to%20refactor%20to%20be%20side-effect-free/roadmap-command-event-interpreter.md) 中亦讨论 persist / notify 顺序）。

这样 **库里的磁带** 与 **当时玩家看到的规则结果** 同源。

### 3.4 给 App 的 API 形态（建议）

按产品需要任选或组合：

| 能力           | 说明                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **分页拉磁带** | `GET .../replay/events?afterId=` 或 `?afterTapeOrdinal=`，按全局顺序返回 `PersistedDomainEventRow` 或解析后的 `TexasDomainEvent` |
| **按手切片**   | `GET .../replay/hands/:handId/events`：过滤 `handId`，仍建议子排序用全局 `id` 或 `tapeOrdinal`                                   |
| **服务端聚合** | 对某一时间窗口的事件跑 `projectCompositeReadModel`（需 Server 依赖 Core），减少 App 包体积与重复实现                             |

**手牌隐私**：`HoleCardsDealt` 的 `payload` 在 Core 中为「全员真值」；Server 应对 **非当事玩家** 在 API 层做字段级过滤或下发脱敏磁带，而不是改 Core 产出的原始事件（便于审计与「裁判视角」导出）。

---

## 4. App：如何用磁带做回放

### 4.1 两种常见产品形态

1. **规则型牌谱（可拖拽、快进）**

   - 拉全量或增量事件 → 本地或 Server 已算好的 `projectCompositeReadModel` 作为「当前进度」摘要。
   - 展示公牌、池、行动线等，优先消费 `PlayerActed`、`StageAdvanced`、`HandEnded` 等；**不必**模拟与实时一致的 `sleep`。

2. **拟直播回放（带节奏）**
   - 除事件外依赖 `recordedAtMs`（或行 `createdAt`）计算间隔，按间隔播发下一条；跑马、思考时长等可近似还原。
   - 若需与当年 WS 文案完全一致，仍应以 Server 当时下发的展示协议为准，磁带只保证 **规则事实**。

### 4.2 客户端是否嵌入 Core

- **嵌入**：可直接 `JSON.parse` → `TexasDomainEvent`，调用 `projectCompositeReadModel` / `reduceCommunityBoardFromDomainEvents` 等，与 Server 逻辑一致。
- **不嵌入**：由 Server 返回已解析 JSON + 可选聚合字段；App 只做展示与动画。

### 4.3 与实时对局的差异

回放路径 **不应** 再调用 `dispatchCommand` 驱动同一局（除非做「分支模拟」类产品）。默认只做 **只读播放**；若要做「从某一事件分叉重算」，属于单独产品，需要新命令流与快照策略。

---

## 5. 分工一览

| 层级       | 回放相关职责                                                            |
| ---------- | ----------------------------------------------------------------------- |
| **Core**   | 定义事件与顺序约定；提供磁带物化/还原、校验、只读聚合与 CLI 工具        |
| **Server** | 实时 `drain` 同序落库；全局序与幂等；回放 API；按身份过滤敏感 `payload` |
| **App**    | 拉磁带或聚合结果；时间轴 UI；可选内嵌 Core 做投影                       |

---

## 6. 自检清单（上线前）

- [ ] 落库顺序与 `drainDomainEvents` 顺序一致；全局排序键明确。
- [ ] 本手事件幂等键包含 `handId` + `seq`。
- [ ] `payloadJson` 可 `JSON.parse` 为当前版本 Core 所识别的 `TexasDomainEvent`（升级 Core 时注意迁移/兼容策略）。
- [ ] 回放 API 对 `HoleCardsDealt` 等敏感事件已按观众身份处理。
- [ ] 可选：对抽检磁带跑 `validatePersistedDomainEventRows` 或抽样 `projectCompositeReadModel` 与业务 DB 快照对拍。

---

## 7. 代码索引（本仓库）

| 路径                                       | 说明                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/domain/handDomainEvents.ts`           | 领域事件 ADT                                                                             |
| `src/replay/domainEventPersistence.ts`     | `PersistedDomainEventRow`、`toPersistedDomainEventRows`、`domainEventsFromPersistedRows` |
| `src/replay/projectCompositeReadModel.ts`  | `projectCompositeReadModel`                                                              |
| `src/engine/domainEventReadModel.ts`       | 各类 `reduce*`                                                                           |
| `src/replay/domainEventTapeValidation.ts`  | 磁带校验                                                                                 |
| `docs/integration-core-wish-event-flow.md` | 实时对局 drain / wish 文件索引                                                           |

**wish 参考实现**（仓库外）：同集成文档 §9，如 `wish_mono_server/apps/texas/.../drainTexasDomainEvents.ts`、`processTexasDomainEvent` 等；落库实现应在上述 drain 路径上挂载，与 WS/结算并列维护。
