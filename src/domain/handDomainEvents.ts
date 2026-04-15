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
 * 本手内每条领域事件均携带同一 `handId`（`Controller.start()` 分配）与单调 `seq`，
 * 便于持久化幂等与回放；会话级事件见 {@link SessionDomainEvent}。
 */
export type HandEventMeta = {
  handId: string
  seq: number
}

/**
 * 本手内领域事件（无业务 callback；由 {@link Texas#drainDomainEvents} / Controller 缓冲取出）。
 * 牌局节奏上的「下一步」另由 Controller 的 `pendingFlowOps`（进街 / 交权）表达，与事件 drain 解耦。
 */
export type HandDomainEvent =
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
        boardThroughStageAfter: Stage
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
        pokesRevealed: Poke[]
        currentStage: Stage
        endStage: Stage
        showHandPokes: boolean
        bestPokes?: Poke[][]
        bestRankCategory?: RankCategory
        bestRankStrength?: number
      }
    }

/** 会话级（尚未进入或跨 Controller 一手） */
export type SessionDomainEvent =
  | {
      type: 'RolesAssigned'
      payload: {
        seq: number
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
      payload: {
        seq: number
        /** 规则真值：全员手牌；出站前由业务按 viewer 过滤 */
        byUserId: Record<number, Poke[]>
      }
    }

export type TexasDomainEvent = SessionDomainEvent | HandDomainEvent
