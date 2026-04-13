# 重构维护参考：新增/变更 API 与关键操作

供维护 Core 或对接业务时快速查阅。与 [integration-core-wish-event-flow.md](./integration-core-wish-event-flow.md) 互补：本文偏 **API 与不变量**，彼文偏 **端到端事件流**。

---

## 1. 类型与枚举

| 名称                                   | 位置                         | 说明                                                                       |
| -------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `PendingFlowOpKind`                    | `Controller/index.ts` 导出   | `'stage_advance' \| 'turn_handoff'`：流程队列项。                          |
| `TexasDomainEvent` / `HandDomainEvent` | `domain/handDomainEvents.ts` | 本手事件含 `handId`、`seq`；会话事件为 `RolesAssigned`、`HoleCardsDealt`。 |
| `TableCommand`                         | `domain/tableCommand.ts`     | `dispatchCommand` 唯一推荐入口类型。                                       |

---

## 2. `Texas`：方法一览

| 方法                                     | 简述                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `drainDomainEvents()`                    | 取出并清空 **会话级 + 本手级** 事件缓冲；无副作用。                                                            |
| `dispatchCommand(cmd)`                   | **唯一推荐**的玩家行动入口；内部走 `handBettingActions`。超时用 `FoldDueToTimeout` / `CheckDueToTimeout`。     |
| `getPendingFlowOps()`                    | 返回队列 **拷贝**，不改变状态。                                                                                |
| `applyPendingStageAdvance()`             | 队头须为 `stage_advance`：执行 **一轮下注结束后的进街** 或 **跑马一步**；否则抛 `CTRL_FLOW_PENDING_MISMATCH`。 |
| `flushPendingTurnHandoff()`              | 队头须为 `turn_handoff`：弹出并 `getControl()`（发 `TurnOffered`）；头类型不对则 **静默 return**（不抛错）。   |
| `flushAllPendingFlowOps()`               | 循环 `apply` / `flush` 直至队列为空；**无 sleep**，供单测与批处理。                                            |
| `setPlayerRoles` / `dealCards` / `start` | 行为未变语义，但 `start` 后 **不会**立刻 `TurnOffered`，须业务消费 `pendingFlowOps`。                          |
| `settle()`                               | 池子分配并 `recordPotAwarded`；通常在 `HandEnded` 解释路径调用。                                               |
| `configureEngine` / `resetEngineContext` | 仅 **trace**、**simulation**；**已移除** `deferTurnHandoffUntilFlushed`、`businessPacedHandFlow`。             |

---

## 3. `Controller`：与队列相关方法

| 方法                                 | 简述                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transferControlTo(player)`          | 设置 `activePlayer`，**只** `push('turn_handoff')`，**不**调用 `player.getControl()`。                                                                                                                  |
| `drainPendingFlowOpsSync()`          | 与 `Texas.flushAllPendingFlowOps()` 等价逻辑（在 Controller 上直接调用）。                                                                                                                              |
| `getPendingFlowOps()`                | 队列拷贝。                                                                                                                                                                                              |
| `canDeferBettingRoundStageAdvance()` | 当且仅当：全员 `!actionable()` **且** 当前街 **未到河牌**（还可进下一街）。                                                                                                                             |
| `requestDeferredStageAdvance()`      | `push('stage_advance')`；由 `Player.transferControl` 在上一条件成立时调用。                                                                                                                             |
| `applyPendingStageAdvance()`         | 见上节；内部 `#runoutMode` 时分支到 `#applyOneRunoutRevealStep`。                                                                                                                                       |
| `flushPendingTurnHandoff()`          | 见上节。                                                                                                                                                                                                |
| `drainHandEvents()`                  | 取出本手事件缓冲。                                                                                                                                                                                      |
| `tryToAdvanceGameToNextStage()`      | **若本会进街**则 **抛错** `CTRL_TRY_ADVANCE_USE_APPLY_PENDING`；若本不该进街则 `return false`。勿在新代码中依赖其「成功进街」。                                                                         |
| `tryToEndGame()`                     | 独赢弃牌 / 河牌上摊牌仍 **同步** settle + `HandEnded`；**非河牌摊牌**则设 `#runoutMode`、预填多条 `stage_advance`、`resetActivePlayer` 后 `return true`，**不产生**当场 `HandEnded`，直至队列消费完毕。 |

---

## 4. `PlayerHandSession`（端口）新增成员

| 成员                                 | 说明                           |
| ------------------------------------ | ------------------------------ |
| `canDeferBettingRoundStageAdvance()` | 判断是否应走「推迟进街」分支。 |
| `requestDeferredStageAdvance()`      | 向队列追加 `stage_advance`。   |

实现类为 `Controller`；`Player` 仅通过该端口调用。

---

## 5. 关键操作详解

### 5.1 一次玩家行动之后（Core 内）

1. `dispatchCommand` → `handBettingActions` → `completeBettingTurn` → `transferControl()`。
2. `tryToEndGame()`：若结束本手，可能直接发 `HandEnded`，或进入 **跑马队列**（见上）。
3. 若未结束：若 `canDeferBettingRoundStageAdvance()` → `requestDeferredStageAdvance()` 并 **return**；否则 `tryToAdvanceGameToNextStage()`（仅返回 `false`，不推进）。
4. 若仍未 return：同街交下家 → `transferControlTo(next)` → 队列 **`turn_handoff`**。
5. **此时** `TurnOffered` 尚未进入缓冲，除非业务已 `flushPendingTurnHandoff()`。

### 5.2 `applyPendingStageAdvance` 两分支

- **`#runoutMode === false`（正常进街）**  
  调用 `#performBettingRoundStageAdvance`：改 `stage`、清本轮下注状态、发 `StageAdvanced(advanceKind: 'betting_round_complete')`、`resetActivePlayer`、`transferControlTo(firstToAct)` → 再入队 **`turn_handoff`**。

- **`#runoutMode === true`（跑马）**  
  调用 `#applyOneRunoutRevealStep`：推进一条街、`StageAdvanced(advanceKind: 'runout_reveal')`。若到 **河牌**：`#runoutMode = false`、settle、`end()`、发 **`HandEnded(showdown)`**；否则仅揭示，**不** settle。

### 5.3 `flushPendingTurnHandoff` 的静默 return

队头不是 `turn_handoff` 时 **直接 return**（常见于业务误序调用）。队头正确但 `activePlayer` 已为 `active` 时也会 return，避免重复 `getControl`。

### 5.4 `start()` / `reset()` 与队列

- `start()` 会清空 `#pendingFlowOps`、`#runoutMode`、`#runoutStageBefore`（与新手同步）。
- `reset()` 同样清空队列与跑马路状态。

### 5.5 错误码（维护时常见）

| Code                                        | 含义                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `CTRL_FLOW_PENDING_MISMATCH` (3308)         | `applyPendingStageAdvance` 队头非 `stage_advance`，或进街时状态已不允许推进。           |
| `CTRL_TRY_ADVANCE_USE_APPLY_PENDING` (3309) | 调用了 `tryToAdvanceGameToNextStage` 且当前应通过 **`applyPendingStageAdvance`** 进街。 |

---

## 6. `orchestration/interpret.ts`（可选）

| 符号                               | 说明                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `interpret(events, ctx, handlers)` | 对事件数组顺序执行多 handler；**Core 生产路径不依赖**，wish 当前用自研 `processTexasDomainEvent`。 |
| `DomainEventHandler`               | `(ctx, event) => void \| Promise<void>`。                                                          |

---

## 7. 对接业务时的最低要求

1. 任意 `dispatchCommand` / 改变牌局状态的 `Texas`/`Controller` 调用后，须 **尽快** 按产品节拍调用 **`drainDomainEvents`（或封装好的 drain）** 并消费 **`pendingFlowOps`**，否则下一玩家 **`status` 非 `active`**，无法行动。
2. 生产环境推荐与 wish 一致：**先 drain 缓冲事件，再按配置 sleep 后循环 `apply` / `flush`**。
3. 单测可 **`flushAllPendingFlowOps()`** 紧跟行动，等价「零节拍」。

---

## 8. 相关文件路径（Core）

| 路径                             | 内容                                       |
| -------------------------------- | ------------------------------------------ |
| `src/Texas/index.ts`             | `Texas` 门面与 `dispatchCommand`           |
| `src/Controller/index.ts`        | 队列、进街、跑马、`tryToEndGame`           |
| `src/Player/index.ts`            | `transferControl` 与 `completeBettingTurn` |
| `src/playerSessionPorts.ts`      | `PlayerHandSession`                        |
| `src/domain/handDomainEvents.ts` | 事件类型                                   |
| `src/domain/tableCommand.ts`     | 指令 ADT                                   |
| `src/TexasEngineContext.ts`      | `trace` / `simulation`                     |
| `src/orchestration/interpret.ts` | 通用 interpret 雏形                        |

---

_若增删队列相关 API，请同步更新本文与 `integration-core-wish-event-flow.md`。_
