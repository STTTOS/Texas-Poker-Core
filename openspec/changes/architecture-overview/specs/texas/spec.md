## ADDED Requirements

### Requirement: Texas facade orchestration

Texas 作为对外门面，负责组装并串联 Room/Dealer/Controller/Pool，并暴露事件回调与对局生命周期方法。

#### Scenario: Create Texas instance with initialChips

- **WHEN** 调用 `new Texas({ user, initialChips, lowestBetAmount, ... })`
- **THEN** 必须创建 `Dealer/Controller/Pool/Room` 并创建 owner Player
- **AND** owner 的 `balance` 初始值应等于 `initialChips`
- **AND** `Room.initialChips` 应等于 `initialChips`

#### Scenario: Wire callbacks to players/controllers

- **WHEN** 调用 `texas.onPreAction(cb)`
- **THEN** 后续每次玩家获得控制权前应触发 PreAction（含 `allowedActions`）

- **WHEN** 调用 `texas.onAction(cb)`
- **THEN** 后续每次玩家行动后应触发 Action 回调

- **WHEN** 调用 `texas.onNextStage(cb)`
- **THEN** 每次阶段推进应触发 nextStage 回调

- **WHEN** 调用 `texas.onGameEnd(cb)`
- **THEN** 游戏结束时应触发 gameEnd 回调（包含 maxPokes/maxRankCategory 等）
