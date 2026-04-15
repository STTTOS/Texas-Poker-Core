## Core 接口清单

业务层负责：房间接入、权限、观战策略、倒计时、落库等。引擎负责：德州规则状态机、合法行动、奖池拆分。

**与 wish 参考服务端的一整局事件流、节拍与落库顺序**：见 [docs/integration-core-wish-event-flow.md](./docs/integration-core-wish-event-flow.md)。**重构后 API / 队列行为维护说明**：见 [docs/refactor-maintainer-reference.md](./docs/refactor-maintainer-reference.md)。

### 进程级配置 `TexasEngineContext` / `Texas.configureEngine`

- **`Texas.configureEngine(patch)`**（等同 `TexasEngineContext.configure`）：应用启动时注册 **trace**、**simulation** 等。
- **`Texas.resetEngineContext()`**（等同 `TexasEngineContext.reset`）：单测中恢复默认（`jest.setup.ts` 已 `beforeEach` 调用）。
- **`trace?: (e: TexasTraceEvent) => void`**：替代库内 `console.log`，由应用自行写日志。
- **`simulation`**：对齐旧 `PROJECT_ENV=dev` 的可选行为，例如：
  - `resetDealerBeforeHandStart`（旧 Controller dev 开局前 `dealer.reset`）
  - `allowSingleSeatedPlayer`（旧 Dealer 仅 1 人环形桌）
  - `ignoreBalanceSetter` / `restoreBalanceOnPlayerReset`
  - `immediateDefaultActionOnTurn` / `randomPickOnDefaultAction`
- **流程队列（固定行为）**：下注轮结束后的进街与 `transferControlTo` 的交权均进入 **`pendingFlowOps`**（`stage_advance` | `turn_handoff`）；业务按节拍调用 **`Texas#getPendingFlowOps`**、**`applyPendingStageAdvance`**、**`flushPendingTurnHandoff`** 消费。单测/脚本无节拍时可 **`Texas#flushAllPendingFlowOps()`**（内部 `Controller#drainPendingFlowOpsSync`）一次排空。

### `Texas`

- **`setPlayerRoles(type)`**：`type === 'initial'` 时仅 `Room.initialRoles`（定庄 + `setOthers` + 锁座），**不**调 `reArrangeRoles`；`type === 'rearrange'` 时仅 `reArrangeRoles()`（须已有庄位）；二者都会缓冲 **`RolesAssigned`**。局末移庄请用 **`rotateRolesForNewHand()`**（委托 `Room.rotateRoles`）。
- **`rotateRolesForNewHand()`**：`reset` 解锁后、下一手起手前按需调用；移庄并再次锁座。
- **`reArrangeRoles()`**：委托 `dealer.reArrangeRoles()`，按当前庄与人数重算角色；`Dealer.join` / `remove` 在环变化后**已**各调一次；业务可在批量 `seat`/`remove` 后**再**显式调用以便统一向客户端推角色（**不**缓冲 `RolesAssigned` 会话事件，与 `setPlayerRoles` 不同）。
- **`dispatchCommand({ type: 'PostBigBlind', playerId })`**：翻前、非当前 `activePlayer`、本街 `currentStageTotalAmount === 0` 且 `eligible` 时，按 `stakes.bigBlind` 贴盲（`min(BB, 余额)`），缓冲 **`PostedBigBlind`** + **`PotUpdated`**；不交权、金额不由业务传参。
- **constructor**：`maximumCountOfPlayers` 会与引擎支持上限（当前角色表 **2–10**）取 `min`；`Dealer` / `Room` 共用该上限。`Room` 上表示 **房间内总人数上限**（`hang` + `on-set`），在 **`join`** 时校验。
- **不再**校验 `initialChips` vs 大盲（由业务层保证）。
- 房主需业务层自行 `seat`。
- **`start()`**：仍校验 **至少 2 人入座**、**座位已锁定**、**controller 为 idle**（规则引擎不变量，避免状态机进入非法组合）。
- **`TexasError`**：`code` + 可选 **`payload`**；`message` 为默认中文描述，业务可用 `TexasCoreErrorCode` + `payload` 自行 i18n。

### `Room` / `Controller` / `Dealer` / `Player` / `Pool`

- `Room.getBaseInfo()` **已移除** `allowPlayersToWatch`。
- `Controller` **已移除** 局内秒表计数（`#count` / 仅用于计秒的 timer）。
- `Dealer` 人数上限为构造时传入的 **`maxTablePlayers`**（来自 Texas 的 capped `maximumCountOfPlayers`）。

### 错误码分段（`TexasCoreErrorCode`）

| 区间      | 含义                    |
| --------- | ----------------------- |
| 3100–3199 | 房间 / 座位             |
| 3200–3299 | 会话（Texas start/end） |
| 3300–3399 | Controller              |
| 3400–3499 | 玩家行动                |
| 3500–3599 | 奖池                    |
| 3600–3699 | Dealer                  |
| 3900–3999 | 内部不变量              |

辅助：**`texasErrorCategory(code)`** 返回上述归类 key（监控用）。

### Core 保留哪些校验？

- **不变量**（不满足则引擎无法继续或会坏状态）：如一手至少 2 人在座才能 `start`、`ready` 至少 2 人；**`seat` / `watch` 与已入座者的 `remove` 须 `seats_open`**；**仅观战（`hang`）`remove` 不受锁座限制**（与 `Controller` 解耦；`Texas.reset()` 会解锁）。
- **规则合法性**：下注/加注/跟注/过牌是否在允许集合、余额是否够等。
- **已交给业务**：开桌筹码下限、是否允许观战、邀请与踢人等 **产品策略** 不在 core 前置校验。
