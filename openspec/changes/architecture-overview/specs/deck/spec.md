## ADDED Requirements

### Requirement: Five-card evaluation and ordering

Deck/core **MUST** 提供五张组合牌的可比较标识与可排序强度。

#### Scenario: RankSignature encodes RankCategory

- **WHEN** 调用 `getFiveCardsRankSignature(fiveCards)`
- **THEN** 返回值首字符必须是 `RankCategory`

#### Scenario: Strength ordering matches signature ordering

- **WHEN** `compareRankSignature(a, b)` 判定 a 强于 b
- **THEN** `getStrengthFromRankSignature(a)` 必须大于 `getStrengthFromRankSignature(b)`
