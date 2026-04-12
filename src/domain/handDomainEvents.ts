import type { Role } from '@/Player/constant'
import type { Stage } from '@/Controller/stage'
import type { ActionTypeEnum } from '@/Player/constant'
import type { Poke, RankCategory } from '@/Deck/constant'

/**
 * 本手内领域事件（无业务 callback；由 {@link Texas#drainDomainEvents} / Controller 缓冲取出）。
 * `seq` 单调递增，便于持久化与回放排序。
 */
export type HandDomainEvent =
  | {
      type: 'HandStarted'
      payload: { seq: number }
    }
  | {
      type: 'BlindsPosted'
      payload: {
        seq: number
        posts: Array<{ userId: number; amount: number; kind: 'sb' | 'bb' }>
      }
    }
  | {
      type: 'PlayerActed'
      payload: {
        seq: number
        userId: number
        street: Stage
        actionType: ActionTypeEnum
        /** 下注/加注等金额；无则省略 */
        amount?: number
        /** 盲注强制下注时为 true */
        isBlindDefault?: boolean
      }
    }
  | {
      type: 'PotUpdated'
      payload: {
        seq: number
        totalAmount: number
        contributions: Array<{ userId: number; amount: number }>
      }
    }
  | {
      type: 'StageAdvanced'
      payload: {
        seq: number
        fromStage: Stage
        toStage: Stage
        pokesRevealedThisStep: Poke[]
        boardThroughStageAfter: Stage
        advanceKind: 'betting_round_complete' | 'runout_reveal'
      }
    }
  | {
      type: 'TurnOffered'
      payload: {
        seq: number
        userId: number
        street: Stage
        allowedActions: ActionTypeEnum[]
        restrict: { min: number; max: number }
      }
    }
  | {
      type: 'ShowdownEvaluated'
      payload: {
        seq: number
        bestPokes?: Poke[][]
        bestRankCategory?: RankCategory
        bestRankStrength?: number
      }
    }
  | {
      type: 'HandEnded'
      payload: {
        seq: number
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
