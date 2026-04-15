## ADDED Requirements

### Requirement: Room seating and watching

Room **MUST** 负责玩家加入（join）、入座（seat）、观战（watch）、退出（remove）与房间状态（seats_open/seats_locked）。
Room **MUST** 维护初始筹码 `initialChips`，供创建 Player 时作为默认起始筹码来源。

#### Scenario: Room stores initialChips

- **WHEN** 创建 `new Room({ initialChips: N, ... })`
- **THEN** `room.initialChips` 必须等于 N
- **AND** `getBaseInfo()` 必须包含 `initialChips`

#### Scenario: Join puts player into hang by default

- **WHEN** 调用 `room.join(player)`
- **THEN** player 必须加入房间成员集合
- **AND** player 的座位状态必须为 `hang`（观战席）

#### Scenario: Seat moves a member from hang to on-set

- **GIVEN** `room.status` 为 `seats_open`
- **WHEN** 调用 `room.seat(player)`
- **THEN** player 必须从 `hang` 转为 `on-set`
- **AND** 必须调用 `dealer.join(player)` 使其参与对局环形链表

#### Scenario: Watch moves a member from on-set to hang

- **GIVEN** `room.status` 为 `seats_open`
- **WHEN** 调用 `room.watch(player)`
- **THEN** player 必须从 `on-set` 转为 `hang`
- **AND** 必须调用 `dealer.remove(player)` 使其退出对局环形链表

#### Scenario: Ready locks seats and roles

- **WHEN** 调用 `room.ready()`
- **THEN** 必须校验入座人数 ≥ 2
- **AND** 必须调用 `dealer.setRoles()` 分配 `RoleEnum`
- **AND** `room.status` 必须变为 `seats_locked`
