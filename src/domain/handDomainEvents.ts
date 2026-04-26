import type { Role } from '@/Player/constant'
import type { Stage } from '@/Controller/stage'
import type { ActionTypeEnum } from '@/Player/constant'
import type { Poke, RankCategory } from '@/Deck/constant'

/**
 * 思考权结束原因（计时由业务层负责时，`timeout` 在收到超时 Command 后由 Core 标记；
 * `leave`：`FoldDueToLeave` 且为本席思考窗内离场时标记）。
 */
export type TurnEndedReason =
  | 'acted'
  | 'control_cleared'
  | 'paused'
  | 'timeout'
  | 'leave'

/**
 * 本手磁带内每条事件均携带同一 `handId` 与单调 `seq`。
 * `handId` 在 {@link Controller.prepareHandTape}（`Texas#setPlayerRoles` / `dealCards` 路径）分配；`seq` 自分配角色起连续递增直至本手 `HandEnded`。
 */
export type HandEventMeta = {
  handId: string
  seq: number
}

/**
 * 本手领域事件（无业务 callback；由 {@link Texas#dispatchCommand} 等同步返回，或 {@link Texas#drainDomainEvents} / Controller 缓冲取出）。
 * 含 **分配角色 → 发洞牌 → 贴盲与街道** 的完整磁带，便于「只重放某一手」时按 `handId` 过滤即可。
 * 牌局节奏上的「下一步」另由 Controller 的 `pendingFlowOps`（进街 / 交权）表达，与事件 drain 解耦。
 *
 * **顺序约定（终极目标 / 回放友好）**
 * - 自愿下注：`PlayerActed` 与同一次入池后的 **`PotUpdated` 紧邻**，且 **`PlayerActed` 在前**（见 `Controller.recordPlayerAction`）。
 * - 盲注：每次 `#postBlind` 入池后各一条 **`PotUpdated`**（细粒度），再以 **`BlindsPosted`** 汇总；不发 `PlayerActed`。
 * - `seq` 在 {@link HandEventMeta} 中本手单调递增，与 `handId` 联用做幂等与重放键。
 */
export type HandDomainEvent =
  | {
      type: 'RolesAssigned'
      payload: HandEventMeta & {
        players: Array<{
          userId: number
          name: string
          role: Role
          actionIndex: number
        }>
      }
    }
  | {
      type: 'HoleCardsDealt'
      payload: HandEventMeta & {
        /** 规则真值：全员手牌；出站前由业务按 viewer 过滤 */
        byUserId: Record<number, Poke[]>
      }
    }
  | {
      type: 'HandStarted'
      payload: HandEventMeta
    }
  | {
      type: 'BlindsPosted'
      payload: HandEventMeta & {
        posts: Array<{ userId: number; amount: number; kind: 'sb' | 'bb' }>
      }
    }
  | {
      type: 'PostedBigBlind'
      payload: HandEventMeta & {
        userId: number
        /** 实际入池（短码时为 `min(requested, balance)`） */
        amount: number
        /** 桌级大盲规定额 */
        requested: number
      }
    }
  | {
      type: 'PlayerActed'
      payload: HandEventMeta & {
        userId: number
        street: Stage
        actionType: ActionTypeEnum
        /** 下注/加注等金额；无则省略 */
        amount?: number
      }
    }
  | {
      type: 'PotUpdated'
      payload: HandEventMeta & {
        totalAmount: number
        contributions: Array<{ userId: number; amount: number }>
      }
    }
  | {
      type: 'StageAdvanced'
      payload: HandEventMeta & {
        fromStage: Stage
        toStage: Stage
        pokesRevealedThisStep: Poke[]
        advanceKind: 'betting_round_complete' | 'runout_reveal'
      }
    }
  | {
      type: 'TurnOffered'
      payload: HandEventMeta & {
        userId: number
        street: Stage
        allowedActions: ActionTypeEnum[]
        restrict: { min: number; max: number }
      }
    }
  | {
      type: 'TurnEnded'
      payload: HandEventMeta & {
        userId: number
        reason: TurnEndedReason
      }
    }
  | {
      type: 'PotAwarded'
      payload: HandEventMeta & {
        /** 本手中央池在分配前总额（与 Pool.totalAmount 一致） */
        potTotal: number
        allocations: Array<{ userId: number; amount: number }>
      }
    }
  | {
      type: 'HandEnded'
      payload: HandEventMeta & {
        outcome: 'showdown' | 'fold_win'
        /** 截至终局时已发出的公牌（与 `StageAdvanced` 跑马拼接结果一致，便于收尾入库） */
        pokesRevealed: Poke[]
        endStage: Stage
        showHandPokes: boolean
        bestPokes?: Poke[][]
        bestRankCategory?: RankCategory
        bestRankStrength?: number
      }
    }

/** 与 {@link HandDomainEvent} 同义；保留别名供业务侧「领域事件」统称。 */
export type TexasDomainEvent = HandDomainEvent
