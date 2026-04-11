// 控制游戏的进程
import type { ShowdownPlayerEval } from './HandSettlement'
import type { PlayerHandSession } from '@/playerSessionPorts'
import type {
  GameComponent,
  HandLifecycle,
  TexasErrorCallback
} from '@/gameContracts'

import Dealer from '../Dealer'
import { Player } from '../Player'
import { CurrentHand } from '@/Hand/CurrentHand'
import { Poke, RankCategory } from '@/Deck/constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import { StageEnum, type Stage, STAGE_ORDER } from './stage'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

export { StageEnum, type Stage } from './stage'

export type CallbackOfGameEnd = (params: {
  /** 与 `onNextStage` 中 `pokesToReveal` 一致：`getCommonPokes(fromStage, toStage)` 本段新亮出的公牌 */
  pokesToReveal: Poke[]
  /** 游戏结束时, 已亮出的公牌 */
  pokesRevealed: Poke[]
  currentStage: Stage
  /** 本手结束所在街；摊牌结束为河牌 */
  endStage: Stage
  // 摊牌时需展示场上最大牌型组合；他人全弃牌时通常为空
  bestPokes?: Poke[][]
  bestRankCategory?: RankCategory
  bestRankStrength?: number
  showHandPokes: boolean
}) => void
export type CallbackOnNextStage = (params: {
  pokesToReveal: Poke[]
  stage: Stage
  lastStage: Stage
}) => void

export type { HandLifecycle }

/** 业务注入：在 core 固定顺序点 `await`，用于 WS/动画与思考计时起点对齐 */
export type TexasTurnPacingHooks = {
  /**
   * `onNextStage` 已同步执行完后、`getControl` 交给新街首位之前。
   * 宜发完 stage 相关 WS/写库后再在此 `sleep`。
   */
  beforeStageAdvance?: () => void | Promise<void>
  /**
   * 同一街内将控制权交给下一位、`getControl`（开表计时）之前。
   */
  beforeNextPlayerTurn?: () => void | Promise<void>
}

class Controller implements GameComponent, PlayerHandSession<Player> {
  /** 当前一手的状态与摊牌评估 */
  #hand = new CurrentHand()
  #dealer: Dealer
  #gameEndListeners: CallbackOfGameEnd[] = []
  #nextStageListeners: CallbackOnNextStage[] = []
  #gameStartListeners: Array<() => Promise<void>> = []
  #turnPacingHooks?: TexasTurnPacingHooks
  fail: TexasErrorCallback

  constructor(
    dealer: Dealer,
    fail: TexasErrorCallback = (error) => {
      throw error
    },
    turnPacingHooks?: TexasTurnPacingHooks
  ) {
    this.#dealer = dealer
    this.fail = fail
    this.#turnPacingHooks = turnPacingHooks
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

    // 只剩 1 名未弃牌玩家时由 `#isWinByExclusiveFold` 先结束，不会走到此处。
    return (
      playersCanAct.length === 0 ||
      // 只剩一个玩家可以行动, 并且该玩家不能再行动了(并且该玩家已经补足了筹码, 直接结束)
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

  /**
   * @description 将控制器移交给指定玩家
   * @param skipNextPlayerPacing 为 true 时跳过 `beforeNextPlayerTurn`（例如刚执行完阶段推进并已 `await beforeStageAdvance`）
   */
  async transferControlTo(
    player: Player | null,
    options?: { skipNextPlayerPacing?: boolean }
  ) {
    if (!player)
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NO_PLAYER))
    if (this.#hand.activePlayer === player)
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_DUPLICATE_CONTROL)
      )

    if (!options?.skipNextPlayerPacing) {
      await this.#turnPacingHooks?.beforeNextPlayerTurn?.()
    }

    this.#hand.activePlayer = player
    player?.getControl()
  }

  /**
   * @description 每个玩家行动之后都要调用此方法
   * 判断游戏是否该结束
   * @param end
   * @returns
   */
  tryToEndGame() {
    if (this.#isWinByExclusiveFold()) {
      this.#hand.boardThroughStage = this.#hand.stage
      this.#settle()
      this.end()

      const foldWinPayload = {
        currentStage: this.#hand.stage,
        endStage: this.#hand.boardThroughStage,
        showHandPokes: false,
        pokesToReveal: this.getCommonPokes(
          this.#hand.stage,
          this.#hand.boardThroughStage
        ),
        pokesRevealed: this.getCommonPokes(
          StageEnum.PRE_FLOP,
          this.#hand.boardThroughStage
        )
      }
      for (const fn of this.#gameEndListeners) fn(foldWinPayload)
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
      const currentStage = this.#hand.stage
      this.#hand.boardThroughStage = StageEnum.RIVER
      this.#hand.stage = StageEnum.RIVER
      this.#settle()
      this.end()

      const { rankCategory, pokes, rankStrength } =
        this.#hand.settlement.snapshot
      const showdownPayload = {
        bestPokes: pokes,
        showHandPokes: true,
        currentStage: currentStage,
        endStage: this.#hand.boardThroughStage,
        bestRankStrength: rankStrength,
        bestRankCategory: rankCategory,
        pokesToReveal: this.getCommonPokes(
          currentStage,
          this.#hand.boardThroughStage
        ),
        pokesRevealed: this.getCommonPokes(
          StageEnum.PRE_FLOP,
          this.#hand.boardThroughStage
        )
      }
      for (const fn of this.#gameEndListeners) fn(showdownPayload)
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'hand_end_showdown',
        data: {
          lastActionStage: currentStage,
          boardThroughStage: this.#hand.boardThroughStage
        }
      })
      return true
    }

    return false
  }

  /**
   * @description 每个玩家行动之后, 都要调用此方法
   * 推进到新的阶段后, 将控制权交当前阶段第一位可以行动的玩家
   */
  async tryToAdvanceGameToNextStage() {
    const canPushToNextStage = this.#dealer.every(
      (player) => !player.actionable()
    )
    if (canPushToNextStage) {
      // 补充最后一个玩家的行动间隔
      if (this.#turnPacingHooks?.beforeNextPlayerTurn) {
        await this.#turnPacingHooks?.beforeNextPlayerTurn()
      }
      const index = STAGE_ORDER.findIndex((stage) => stage === this.#hand.stage)
      if (index < 0 || index >= STAGE_ORDER.length - 1) return false

      const currentStage = this.#hand.stage
      const nextStage = STAGE_ORDER[index + 1]

      this.#hand.stage = nextStage
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      this.#dealer.resetActionsHistory()

      const activePlayerId = this.#hand.activePlayer?.getUserInfo().id
      const stagePayload = {
        stage: nextStage,
        lastStage: currentStage,
        pokesToReveal: this.getCommonPokes(currentStage, nextStage)
      }
      for (const fn of this.#nextStageListeners) fn(stagePayload)
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'stage_changed',
        data: {
          from: currentStage,
          to: nextStage,
          byUserId: activePlayerId
        }
      })
      this.resetActivePlayer()

      await this.#turnPacingHooks?.beforeStageAdvance?.()
      await this.transferControlTo(this.#dealer.getTheFirstPlayerToAct(), {
        skipNextPlayerPacing: true
      })
      return true
    }
    return false
  }

  /**
   * @description 根据起始阶段 & 最终阶段 获取需要翻的牌
   * @param currentStage
   * @param endStage
   * @returns
   */
  getCommonPokes(currentStage: Stage, endStage: Stage) {
    if (currentStage === endStage) return []

    const commonPokes = this.#dealer.getPokes().commonPokes
    return commonPokes.slice(
      this.#getPokeEndIndex(currentStage),
      this.#getPokeEndIndex(endStage)
    )
  }

  /**
   * @description 游戏stage变化时的回调监听函数
   * @param callback
   */
  /** 可多次注册；按注册顺序依次调用 */
  onNextStage(callback: CallbackOnNextStage) {
    this.#nextStageListeners.push(callback)
  }

  /**
   * @description 游戏结束时的回调监听函数
   */
  onGameEnd(callback: CallbackOfGameEnd) {
    this.#gameEndListeners.push(callback)
  }

  // 大盲小盲的默认下注行为
  // 在双人竞技中, 庄家需要下小盲注, 同时率先开始行动
  async takeActionInPreFlop() {
    const takeDefaultActionPlayers = this.#getSmallBindAndBigBind()
    takeDefaultActionPlayers.forEach(async (player, index) => {
      if (player) {
        const amount =
          index === 0
            ? this.#dealer.stakes.smallBlind
            : this.#dealer.stakes.bigBlind

        player.bet(amount, true)
        this.#hand.defaultBets.push({
          userId: player.getUserInfo().id,
          balance: player.balance,
          amount
        })
      }
    })
    const [, bigBlind] = takeDefaultActionPlayers
    const activePlayer = bigBlind?.getNextPlayer()
    if (activePlayer) {
      // 默认行为结束后, 游戏正式开始
      for (const fn of this.#gameStartListeners) {
        await fn()
      }
      await this.transferControlTo(activePlayer)
    } else {
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_START_NO_ACTIVE))
    }
  }
  // 获取小盲,大盲玩家
  #getSmallBindAndBigBind() {
    const smallBind =
      // 在双人游戏中, 庄家同时支付小盲注
      this.#dealer.count === 2
        ? this.#dealer.button
        : this.#dealer.button?.getNextPlayer()

    const result = [smallBind, smallBind?.getNextPlayer()]
    if (result.some((player) => !player))
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_SB_BB_MISSING))
    return result
  }
  /**
   * @description 开始计时器, 将控制权移交给第一个可以行动的玩家
   */
  async start() {
    this.#hand.status = 'in_hand'
    this.#hand.stage = StageEnum.PRE_FLOP
    this.#hand.boardThroughStage = StageEnum.PRE_FLOP

    if (TexasEngineContext.simulation().resetDealerBeforeHandStart) {
      this.#dealer.reset()
    }

    await this.takeActionInPreFlop()
  }

  onGameStart(callback: () => Promise<void>) {
    this.#gameStartListeners.push(callback)
  }

  /**
   * @description 继续游戏
   */
  continue() {
    if (this.#hand.status !== 'in_hand_paused')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NOT_PAUSED))

    this.#hand.status = 'in_hand'
    this.#hand.activePlayer?.continue()
  }

  /**
   * 按「公共牌已发到哪一条街」结算各玩家 bestFiveCards / rank（如发牌后未开局、测试或强制结束时可调）。
   * 正常对局在 `tryToEndGame` 命中时已内部调用 `#settle`。
   */
  settleRankingsThroughStage(throughStage: Stage) {
    this.#hand.boardThroughStage = throughStage
    this.#settle()
  }

  /**
   * @description 结束游戏, 回收玩家控制权（牌型结算由 `tryToEndGame` 或 `settleRankingsThroughStage` 负责）
   */
  end() {
    if (this.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_END_NOT_IN_HAND))

    this.#hand.status = 'hand_complete'
    this.resetActivePlayer()
  }

  /** 根据当前阶段, dealer,以及deck 比较结算出最大牌型信息, 以及计算出每个玩家的牌型算力 */
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
  /**
   * @description 重置控制器, 在游戏结束之后调用
   */
  reset() {
    this.resetActivePlayer()
    this.#hand.reset()
  }

  /**
   * @description 暂停游戏
   */
  pause() {
    this.#hand.status = 'in_hand_paused'
    this.activePlayer?.pause()
  }
}
export type { ShowdownPlayerEval } from './HandSettlement'
export default Controller
