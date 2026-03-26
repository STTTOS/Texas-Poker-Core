## Core 接口清单

业务层负责：房间接入、权限、观战策略、倒计时、落库等。引擎负责：德州规则状态机、合法行动、奖池拆分。

### 进程级配置 `TexasEngineContext` / `Texas.configureEngine`

- **`Texas.configureEngine(patch)`**（等同 `TexasEngineContext.configure`）：应用启动时注册 **trace**、**simulation** 等。
- **`Texas.resetEngineContext()`**（等同 `TexasEngineContext.reset`）：单测中恢复默认（`jest.setup.ts` 已 `beforeEach` 调用）。
- **`trace?: (e: TexasTraceEvent) => void`**：替代库内 `console.log`，由应用自行写日志。
- **`simulation`**：对齐旧 `PROJECT_ENV=dev` 的可选行为，例如：
  - `resetDealerBeforeHandStart`（旧 Controller dev 开局前 `dealer.reset`）
  - `allowSingleSeatedPlayer`（旧 Dealer 仅 1 人环形桌）
  - `ignoreBalanceSetter` / `restoreBalanceOnPlayerReset`
  - `immediateDefaultActionOnTurn` / `randomPickOnDefaultAction`

### `Texas`

- **constructor**：`maximumCountOfPlayers` 会与引擎支持上限（当前角色表 **2–10**）取 `min`；`Dealer` / `Room` 共用该上限。
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

- **不变量**（不满足则引擎无法继续或会坏状态）：如一手至少 2 人在座才能 `start`、`ready` 至少 2 人、`controller.status` 与 `seat/watch/remove` 的互斥等。
- **规则合法性**：下注/加注/跟注/过牌是否在允许集合、余额是否够等。
- **已交给业务**：开桌筹码下限、是否允许观战、邀请与踢人等 **产品策略** 不在 core 前置校验。
