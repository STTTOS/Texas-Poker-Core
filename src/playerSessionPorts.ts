import type { Poke } from '@/Deck/constant'
import type { Stage } from '@/Controller/stage'
import type { HandLifecycle } from '@/gameContracts'
import type { TurnEndedReason } from '@/domain/handDomainEvents'
import type { ShowdownPlayerEval } from '@/Controller/HandSettlement'

/**
 * `Player` 在单桌内需要的「荷官环 + 行动序」视图，避免依赖整个 {@link Dealer} 类型。
 * 由 {@link Dealer} 实现。
 */
export interface PlayerDealerRing<TPlayer = unknown> {
  readonly actionHistory: TPlayer[]
  addAction(player: TPlayer): void
  forEach(callback: (player: TPlayer, index: number) => void): void
  map<R>(callback: (player: TPlayer, index: number) => R): R[]
  filter(callback: (player: TPlayer, index: number) => boolean): TPlayer[]
  getHoleCardsForPlayer(player: TPlayer): Poke[]
}

/**
 * `Player` 需要的「本手阶段机」视图，避免依赖整个 {@link Controller}。
 * 由 {@link Controller} 实现。
 */
export interface PlayerHandSession<TPlayer = unknown> {
  readonly status: HandLifecycle
  readonly stage: Stage
  /** 当前轮到行动的玩家；翻前贴盲完成前可能为 `null` */
  readonly activePlayer: TPlayer | null
  getShowdownEvalForPlayer(player: TPlayer): ShowdownPlayerEval | undefined
  tryToEndGame(): boolean
  tryToAdvanceGameToNextStage(): boolean
  transferControlTo(player: TPlayer): void
  recordPlayerAction(player: TPlayer, options: { emitPot: boolean }): void
  recordTurnOffered(player: TPlayer): void
  recordTurnEnded(userId: number, reason: TurnEndedReason): void
  /** 下一条 `TurnEnded` 使用指定 reason（如超时弃牌）；消费一次后恢复默认 `acted` */
  setPendingTurnEndedReason(reason: TurnEndedReason): void
  consumePendingTurnEndedReason(): TurnEndedReason | null
}

/**
 * 街道筹码流入中央池的端口；{@link Pool#add} 即实现。
 * 内部先经 {@link PlayerStreetBetLedger} 扣玩家侧，再写入池内 `betRecords` / `totalAmount`。
 */
export interface StreetPotSink<TPlayer = unknown> {
  add(player: TPlayer, amount: number): void
}

/**
 * 街道下注时玩家侧扣款与累计（余额、`currentStageTotalAmount`、`totalBetAmount`）。
 * 默认实现为 `Pool/StreetBetLedger`。
 */
export interface PlayerStreetBetLedger<TPlayer = unknown> {
  assertAndApplyPlayerDebit(player: TPlayer, amount: number): void
}
