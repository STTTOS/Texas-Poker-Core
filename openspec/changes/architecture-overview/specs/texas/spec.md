## ADDED Requirements

### Requirement: Texas facade orchestration

Texas 作为对外门面，**MUST** 组装并串联 Room/Dealer/Controller/Pool，并暴露事件回调与对局生命周期方法。

#### Scenario: Create Texas instance with initialChips

- **WHEN** 调用 `new Texas({ user, initialChips, lowestBetAmount, ... })`
- **THEN** 必须创建 `Dealer/Controller/Pool/Room` 并创建 owner Player
- **AND** owner 的 `balance` 初始值应等于 `initialChips`
- **AND** `Room.initialChips` 应等于 `initialChips`

#### Scenario: Unified fail-fast error entrypoint

- **WHEN** 组件内部遇到业务约束错误（例如人数不足、非法行动）
- **THEN** 必须调用注入的 `fail(error): never` 中断流程
- **AND** `Texas.fail` 应先触发 `texas.onError(cb)` 回调，再抛出 `TexasError`

#### Scenario: Wire callbacks to players/controllers

- **WHEN** 调用 `texas.onPreAction(cb)`
- **THEN** 后续每次玩家获得控制权前应触发 PreAction（含 `allowedActions`）

- **WHEN** 调用 `texas.onAction(cb)`
- **THEN** 后续每次玩家行动后应触发 Action 回调

- **WHEN** 调用 `texas.onNextStage(cb)`
- **THEN** 每次阶段推进应触发 nextStage 回调

- **WHEN** 调用 `texas.onGameEnd(cb)`
- **THEN** 游戏结束时应触发 gameEnd 回调（包含 maxPokes/maxRankCategory 等）

#### Scenario: Expose role assignment and dealing as explicit domain steps

- **WHEN** 调用 `texas.setPlayerRoles()`
- **THEN** Texas **MUST** 触发一次角色分配流程（通过 Room/Dealer 完成）
- **AND** 成功后 **MUST** 触发 `texas.onRolesAssigned(cb)` 回调

- **WHEN** 调用 `texas.dealCards()`
- **THEN** Texas **MUST** 触发一次发牌流程（荷官侧 `DealtBoard` 捕获手牌矩阵；玩家经 `getHandPokes()` 解析得到 2 张私牌）
- **AND** 成功后 **MUST** 触发 `texas.onDealCards(cb)` 回调
