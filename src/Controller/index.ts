// 控制游戏的进程
import type { ShowdownPlayerEval } from './HandSettlement'
import type { PlayerHandSession } from '@/playerSessionPorts'
import type { HandDomainEvent } from '@/domain/handDomainEvents'
import type {
  GameComponent,
  HandLifecycle,
  TexasErrorCallback
} from '@/gameContracts'

import Pool from '../Pool'
import Dealer from '../Dealer'
import { Player } from '../Player'
import { CurrentHand } from '@/Hand/CurrentHand'
import { TexasEngineContext } from '@/TexasEngineContext'
import { StageEnum, type Stage, STAGE_ORDER } from './stage'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

export { StageEnum, type Stage } from './stage'

export type { HandLifecycle }

class Controller implements GameComponent, PlayerHandSession<Player> {
  /** 当前一手的状态与摊牌评估 */
  #hand = new CurrentHand()
  #dealer: Dealer
  #pool: Pool
  #handEventSeq = 0
  #handEvents: HandDomainEvent[] = []
  fail: TexasErrorCallback

  constructor(
    dealer: Dealer,
    pool: Pool,
    fail: TexasErrorCallback = (error) => {
      throw error
    }
  ) {
    this.#dealer = dealer
    this.#pool = pool
    this.fail = fail
  }

  #nextSeq(): number {
    this.#handEventSeq += 1
    return this.#handEventSeq
  }

  /** 自上次 drain 以来本手产生的事件（取出后清空本手缓冲） */
  drainHandEvents(): HandDomainEvent[] {
    const out = this.#handEvents
    this.#handEvents = []
    return out
  }

  get status() {
    return this.#hand.status
  }

  get defaultBets() {
    return this.#hand.defaultBets
  }

  get stage() {
    return this.#hand.stage
  }

  getShowdownEvalForPlayer(player: Player): ShowdownPlayerEval | undefined {
    return this.#hand.settlement.getPlayerEval(player.id)
  }

  get endAt() {
    return this.#hand.boardThroughStage
  }

  get activePlayer() {
    return this.#hand.activePlayer
  }

  recordPlayerAction(
    player: Player,
    options: { emitPot: boolean; isBlindDefault?: boolean }
  ): void {
    const action = player.getAction()
    if (!action) return
    this.#handEvents.push({
      type: 'PlayerActed',
      payload: {
        seq: this.#nextSeq(),
        userId: player.getUserInfo().id,
        street: this.#hand.stage,
        actionType: action.type,
        amount: action.payload?.value,
        isBlindDefault: options.isBlindDefault
      }
    })
    if (options.emitPot) this.recordPotUpdated()
  }

  recordPotUpdated(): void {
    const snap = this.#pool.getContributionSnapshot()
    this.#handEvents.push({
      type: 'PotUpdated',
      payload: {
        seq: this.#nextSeq(),
        totalAmount: snap.totalAmount,
        contributions: snap.contributions
      }
    })
  }

  recordTurnOffered(player: Player): void {
    this.#handEvents.push({
      type: 'TurnOffered',
      payload: {
        seq: this.#nextSeq(),
        userId: player.getUserInfo().id,
        street: this.#hand.stage,
        allowedActions: [...player.getAllowedActions()],
        restrict: player.getRestrict()
      }
    })
  }

  /**
   * ① 仅剩一名玩家未弃牌（至少两人局才有「独赢」）
   */
  #isWinByExclusiveFold(): boolean {
    const n = this.#dealer.count
    if (n < 2)
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_ENDGAME_INVARIANT_DEALER_LT_2, {
          count: n
        })
      )

    const folded = this.#dealer.filter((p) => p.getStatus() === 'out').length
    return folded === n - 1
  }

  /**
   * ② 结束条件（没人还能操作）：
   * - 场上只剩 out / allIn（无 waiting）=> 直接结束（可能发生在任意街：多人全下）
   * - 河牌圈且所有仍可行动玩家都不可 actionable（即便 status 仍为 waiting）=> 结束
   */
  shouldShowDown(): boolean {
    const playersCanAct = this.#dealer.getPlayersCanAct()

    return (
      playersCanAct.length === 0 ||
      (playersCanAct.length === 1 && !playersCanAct[0].actionable()) ||
      (this.#hand.stage === StageEnum.RIVER &&
        playersCanAct.every((player) => !player.actionable()))
    )
  }

  #getPokeEndIndex(stage: Stage) {
    if (stage === StageEnum.PRE_FLOP) return 0
    if (stage === StageEnum.FLOP) return 3
    if (stage === StageEnum.TURN) return 4
    if (stage === StageEnum.RIVER) return 5
  }

  /** 获取游戏结束阶段时的公共牌*/
  getCommonPokesWhenGameEnd() {
    return this.getCommonPokes(StageEnum.PRE_FLOP, this.#hand.boardThroughStage)
  }

  transferControlTo(player: Player | null) {
    if (!player)
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NO_PLAYER))
    if (this.#hand.activePlayer === player)
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_DUPLICATE_CONTROL)
      )

    this.#hand.activePlayer = player
    player.getControl()
  }

  tryToEndGame() {
    if (this.#isWinByExclusiveFold()) {
      this.#hand.boardThroughStage = this.#hand.stage
      this.#settle()
      this.end()

      const pokesRevealed = this.getCommonPokes(
        StageEnum.PRE_FLOP,
        this.#hand.boardThroughStage
      )
      this.#handEvents.push({
        type: 'HandEnded',
        payload: {
          seq: this.#nextSeq(),
          outcome: 'fold_win',
          pokesRevealed,
          currentStage: this.#hand.stage,
          endStage: this.#hand.boardThroughStage,
          showHandPokes: false
        }
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'hand_end_fold_win',
        data: {
          lastActionStage: this.#hand.stage,
          boardThroughStage: this.#hand.boardThroughStage
        }
      })
      return true
    }

    if (this.shouldShowDown()) {
      const stageBeforeRunout = this.#hand.stage

      if (this.#hand.stage !== StageEnum.RIVER) {
        let from: Stage = this.#hand.stage
        while (from !== StageEnum.RIVER) {
          const index = STAGE_ORDER.findIndex((s) => s === from)
          if (index < 0 || index >= STAGE_ORDER.length - 1) break
          const to = STAGE_ORDER[index + 1]
          this.#hand.stage = to
          this.#hand.boardThroughStage = to
          const pokes = this.getCommonPokes(from, to)
          this.#handEvents.push({
            type: 'StageAdvanced',
            payload: {
              seq: this.#nextSeq(),
              fromStage: from,
              toStage: to,
              pokesRevealedThisStep: pokes,
              boardThroughStageAfter: to,
              advanceKind: 'runout_reveal'
            }
          })
          from = to
        }
      } else {
        this.#hand.boardThroughStage = StageEnum.RIVER
      }

      this.#settle()
      this.end()

      const { rankCategory, pokes, rankStrength } =
        this.#hand.settlement.snapshot
      this.#handEvents.push({
        type: 'ShowdownEvaluated',
        payload: {
          seq: this.#nextSeq(),
          bestPokes: pokes,
          bestRankCategory: rankCategory,
          bestRankStrength: rankStrength
        }
      })

      const pokesRevealed = this.getCommonPokes(
        StageEnum.PRE_FLOP,
        this.#hand.boardThroughStage
      )
      this.#handEvents.push({
        type: 'HandEnded',
        payload: {
          seq: this.#nextSeq(),
          outcome: 'showdown',
          pokesRevealed,
          currentStage: stageBeforeRunout,
          endStage: this.#hand.boardThroughStage,
          showHandPokes: true,
          bestPokes: pokes,
          bestRankCategory: rankCategory,
          bestRankStrength: rankStrength
        }
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'hand_end_showdown',
        data: {
          lastActionStage: stageBeforeRunout,
          boardThroughStage: this.#hand.boardThroughStage
        }
      })
      return true
    }

    return false
  }

  tryToAdvanceGameToNextStage(): boolean {
    const canPushToNextStage = this.#dealer.every(
      (player) => !player.actionable()
    )
    if (canPushToNextStage) {
      const index = STAGE_ORDER.findIndex((stage) => stage === this.#hand.stage)
      if (index < 0 || index >= STAGE_ORDER.length - 1) return false

      const currentStage = this.#hand.stage
      const nextStage = STAGE_ORDER[index + 1]

      this.#hand.stage = nextStage
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      this.#dealer.resetActionsHistory()

      const stagePayload = {
        fromStage: currentStage,
        toStage: nextStage,
        pokesRevealedThisStep: this.getCommonPokes(currentStage, nextStage),
        boardThroughStageAfter: nextStage,
        advanceKind: 'betting_round_complete' as const
      }
      this.#handEvents.push({
        type: 'StageAdvanced',
        payload: {
          seq: this.#nextSeq(),
          ...stagePayload
        }
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'stage_changed',
        data: {
          from: currentStage,
          to: nextStage,
          byUserId: this.#hand.activePlayer?.getUserInfo().id
        }
      })
      this.resetActivePlayer()

      this.transferControlTo(this.#dealer.getTheFirstPlayerToAct())
      return true
    }
    return false
  }

  getCommonPokes(currentStage: Stage, endStage: Stage) {
    if (currentStage === endStage) return []

    const commonPokes = this.#dealer.getPokes().commonPokes
    return commonPokes.slice(
      this.#getPokeEndIndex(currentStage),
      this.#getPokeEndIndex(endStage)
    )
  }

  takeActionInPreFlop() {
    this.#handEvents.push({
      type: 'HandStarted',
      payload: { seq: this.#nextSeq() }
    })

    const takeDefaultActionPlayers = this.#getSmallBindAndBigBind()
    const posts: Array<{ userId: number; amount: number; kind: 'sb' | 'bb' }> =
      []
    takeDefaultActionPlayers.forEach((player, index) => {
      if (player) {
        const amount =
          index === 0
            ? this.#dealer.stakes.smallBlind
            : this.#dealer.stakes.bigBlind

        player.bet(amount, true, true)
        this.#hand.defaultBets.push({
          userId: player.getUserInfo().id,
          balance: player.balance,
          amount
        })
        posts.push({
          userId: player.getUserInfo().id,
          amount,
          kind: index === 0 ? 'sb' : 'bb'
        })
      }
    })
    this.#handEvents.push({
      type: 'BlindsPosted',
      payload: { seq: this.#nextSeq(), posts }
    })
    this.recordPotUpdated()

    const [, bigBlind] = takeDefaultActionPlayers
    const activePlayer = bigBlind?.getNextPlayer()
    if (activePlayer) {
      this.transferControlTo(activePlayer)
    } else {
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_START_NO_ACTIVE))
    }
  }

  #getSmallBindAndBigBind() {
    const smallBind =
      this.#dealer.count === 2
        ? this.#dealer.button
        : this.#dealer.button?.getNextPlayer()

    const result = [smallBind, smallBind?.getNextPlayer()]
    if (result.some((player) => !player))
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_SB_BB_MISSING))
    return result
  }

  start() {
    this.#handEventSeq = 0
    this.#handEvents = []
    this.#hand.status = 'in_hand'
    this.#hand.stage = StageEnum.PRE_FLOP
    this.#hand.boardThroughStage = StageEnum.PRE_FLOP

    if (TexasEngineContext.simulation().resetDealerBeforeHandStart) {
      this.#dealer.reset()
    }

    this.takeActionInPreFlop()
  }

  continue() {
    if (this.#hand.status !== 'in_hand_paused')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NOT_PAUSED))

    this.#hand.status = 'in_hand'
    this.#hand.activePlayer?.continue()
  }

  settleRankingsThroughStage(throughStage: Stage) {
    this.#hand.boardThroughStage = throughStage
    this.#settle()
  }

  end() {
    if (this.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_END_NOT_IN_HAND))

    this.#hand.status = 'hand_complete'
    this.resetActivePlayer()
  }

  #settle() {
    const commonPokesWhenGameEnd = this.getCommonPokesWhenGameEnd()
    this.#hand.settlement.settleFromCommonBoard(
      this.#dealer.players,
      this.#dealer.getPlayersStillInGame(),
      commonPokesWhenGameEnd
    )
  }
  resetActivePlayer() {
    this.#hand.activePlayer?.removeControl()
    this.#hand.activePlayer = null
  }

  reset() {
    this.resetActivePlayer()
    this.#hand.reset()
    this.#handEventSeq = 0
    this.#handEvents = []
  }

  pause() {
    this.#hand.status = 'in_hand_paused'
    this.activePlayer?.pause()
  }
}
export type { ShowdownPlayerEval } from './HandSettlement'
export default Controller
