# 重构说明：类的职责拆分

本文档概括本轮针对 **单一职责** 与 **依赖方向** 的调整，便于后续维护与扩展。

## 1. `Deck/core` 按能力拆文件

原先 `src/Deck/core.ts` 同时包含：展示格式化、组合枚举、五张牌型签名、两副牌比较、多人最优牌型等逻辑。

现拆为（`core.ts` 仅作聚合再导出，兼容原 `import from '@/Deck/core'`）：

| 模块                       | 职责                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `Deck/format.ts`           | `formatterPoke`：展示用，与牌力无关                                                         |
| `Deck/handEvaluation.ts`   | 顺子判定、C(n,5) 预计算、`getFiveCardsRankSignature`、从牌池展开五张组合                    |
| `Deck/handCompare.ts`      | `compareRankSignature`、`compareFn`、`getStrengthFromRankSignature`、`getFiveCardsStrength` |
| `Deck/handCombinations.ts` | `getBestFiveCards`、`getBestPokesRankSignature`；全量组合排序为模块内私有辅助函数           |

**收益**：单测与按需引用更清晰；牌型「算出来」与「比大小」边界明确。

## 2. `Deck` 与 `DealtBoard` 分离

- **`Deck`**：只负责 52 张牌、洗牌、`dealCards(count)` **返回** `{ handPokes, commonPokes }`，**不再缓存**上一手结果。
- **`DealtBoard`**：由 `DealerService` 持有，`capture(snapshot)` 记录当前手牌与公牌；`reset()` 在局间清空。
- **对外读取**：`Dealer.getPokes()`（门面）→ `DealerService.getPokes()` → `DealtBoard.getPokes()`。`Controller` 等不再通过 `dealer.deck.getPokes()` 取公牌。

**收益**：物理牌堆与「本手已发出的牌」解耦；与玩家身上的手牌并存时，语义更清楚（牌堆对象不再冒充「当前局面」）。

## 3. `Player`：行动合法性 vs 思考计时

### 3.1 `Player/allowedActions.ts`

- `resolveAllowedActions(ctx)`：根据 `selfStatus`、行动历史、`maxOthersStageBet`、大盲选项等 **纯数据** 推导允许行动列表。
- `Player.#getAllowedActions()` 只负责从 `Dealer` / 自身拼出 `ctx` 并调用该函数。

### 3.2 `Player/turnTiming.ts`

- `PlayerTurnTiming`：`setTimeout` 链式 tick、截止时刻、`clear()`、`resumeCountdownIfNeeded()`。
- `Player` 不再内联一大段计时逻辑。

### 3.3 `Controller/stage.ts`

- 将 `StageEnum` / `Stage` / `STAGE_ORDER` 抽到独立文件，供 `Player/allowedActions`（若将来需要阶段信息）与 `Controller` 共用，**避免 Player ↔ Controller 通过阶段枚举产生循环依赖**。

**收益**：规则推导可单测；计时可替换实现；模块加载顺序更可控。

## 4. `Controller` 与 `HandSettlement`

- 新增 **`Controller/HandSettlement.ts`**：`settleFromCommonBoard` 负责为全体入座玩家写入 `bestFiveCards` / `rankSignature` / `rankStrength`，并汇总最强牌型快照；内部发出与原 `#settle` 一致的 trace。
- **`Controller`**：保留阶段机、控制权、`tryToEndGame` 等流程；摊牌数值结算委托给 `#settlement: HandSettlement`。

**收益**：「流程控制」与「摊牌算分」分离，`HandSettlement` 可单独覆盖单测。

## 5. 兼容与迁移提示

- 所有仍从 `@/Deck/core` 引入的符号保持不变（经 `core.ts` 转发）。
- 若业务代码曾使用 **`dealer.deck.getPokes()`**，请改为 **`dealer.getPokes()`**。
- 包入口 `src/index.ts` 新增导出 **`DealtBoard`**、**`DealSnapshot`**，便于自定义测试或扩展发牌管线。

## 6. 后续可选方向

- 将 `Deck/core.test.ts` 按子模块拆成多个测试文件，与源码目录对齐。
- `Player` 仍较大，可继续把 `bet`/`raise`/`call` 等与 `Pool` 的协作收成小的 **ActionHandlers**（需谨慎保持行为与错误码一致）。
