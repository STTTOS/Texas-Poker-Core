## ADDED Requirements

### Requirement: Controller turn control and stage machine

Controller **MUST** 负责：

- `StageEnum` 阶段推进（PRE_FLOP→FLOP→TURN→RIVER）
- 行动权 `activePlayer` 的移交
- 游戏结束条件与 gameEnd 回调

#### Scenario: Stage progression

- **WHEN** 所有玩家在当前阶段都不可行动
- **THEN** Controller 必须推进到下一阶段
- **AND** 触发 onNextStage 回调（包含 stage/lastStage/cardsToReveal）

#### Scenario: Game end triggers

- **WHEN** 游戏满足结束条件（例如只剩 1 个未弃牌玩家、或到 RIVER 结束等）
- **THEN** Controller 必须进入 end 状态并触发 onGameEnd 回调
