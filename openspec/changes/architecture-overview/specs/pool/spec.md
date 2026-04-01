## ADDED Requirements

### Requirement: Pool records bets and pays out

Pool **MUST** 负责下注记录、边池划分与结算分配。

#### Scenario: Pot conservation

- **WHEN** 一局结算完成（Pool.pay / settle）
- **THEN** 玩家总余额变化应满足守恒（只在玩家之间转移）
- **AND** 每个 pot 的发放总额必须等于该 pot 的累计下注额
