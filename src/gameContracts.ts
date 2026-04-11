import type TexasError from '@/TexasError'
import type { ActionTypeEnum } from '@/Player/constant'

/**
 * 跨模块共享的引擎契约（错误回调、组件接口、PreAction 载荷）。
 * 独立文件以避免 Texas 门面与 Controller / Dealer / Player / Room / Pool 之间的循环依赖。
 */
export type TexasErrorCallback = (error: TexasError) => never

export interface GameComponent {
  /** 标准 fail-fast：触发后一定抛出并中断流程 */
  fail?(error: TexasError): never
}

export interface PreAction {
  userId: number
  allowedActions: ActionTypeEnum[]
  restrict?: {
    min: number
    max: number
  }
}

/**
 * 一手牌在控制器中的生命周期。
 * 放在本文件以便 `playerSessionPorts` 等引用，避免与 `Controller` 循环依赖。
 */
export type HandLifecycle =
  | 'idle'
  | 'in_hand'
  | 'in_hand_paused'
  | 'hand_complete'
  | 'aborted'
