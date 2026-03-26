## ADDED Requirements

### Requirement: Dealer manages players and settlement inputs

Dealer 维护玩家环形链表、角色分配、发牌，并在结算阶段为每个玩家计算：

- `bestFiveCards`
- `rankSignature`
- `rankStrength`

#### Scenario: Role assignment uses RoleEnum

- **WHEN** `dealer.setRoles()` 被调用
- **THEN** 参与对局玩家必须被分配 `RoleEnum`（BTN/SB/BB/...）

#### Scenario: Settle computes comparable fields

- **WHEN** `dealer.settle()` 被调用
- **THEN** 每个未出局玩家必须拥有 `bestFiveCards`、`rankSignature`、`rankStrength`
- **AND** `rankStrength` 越大表示牌力越强
