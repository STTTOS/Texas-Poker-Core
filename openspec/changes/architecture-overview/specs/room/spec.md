## ADDED Requirements

### Requirement: Room seating and watching

Room 负责玩家加入（join）、入座（seat）、观战（watch）、退出（remove）与房间状态（ready/unReady）。
Room 维护初始筹码 `initialChips`，供创建 Player 时作为默认起始筹码来源。

#### Scenario: Room stores initialChips

- **WHEN** 创建 `new Room({ initialChips: N, ... })`
- **THEN** `room.initialChips` 必须等于 N
- **AND** `getBaseInfo()` 必须包含 `initialChips`

#### Scenario: Join assigns seat status based on capacity and game status

- **WHEN** 房间未满且 controller.status 为 waiting
- **THEN** join 的玩家应进入 on-set 并被 Dealer.join

- **WHEN** 房间已满或 controller.status 非 waiting
- **THEN** join 的玩家应进入 hang（观战席）
