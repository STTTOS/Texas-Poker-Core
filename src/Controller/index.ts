// 控制游戏的进程
import type { GameComponent, TexasErrorCallback } from '@/gameContracts'

import Dealer from '../Dealer'
import { Player } from '../Player'
import { Poke, RankCategory } from '@/Deck/constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import {
  formatterPoke,
  getBestRankInfo,
  getBestFiveCards,
  getFiveCardsRankSignature,
  getStrengthFromRankSignature
} from '@/Deck/core'

export enum StageEnum {
  PRE_FLOP = 'pre_flop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river'
}

export type Stage = StageEnum

const stages: Stage[] = [
  StageEnum.PRE_FLOP,
  StageEnum.FLOP,
  StageEnum.TURN,
  StageEnum.RIVER
]

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
/**
 * 控制器唯一状态：一手牌从「可开局」到「结束待清理」的完整生命周期。
 * - `idle`：无进行中的手牌（上一手已 `reset` 之后、下一手 `start` 之前；**局间等待下一手**也在此）
 * - `in_hand`：本手进行中
 * - `in_hand_paused`：本手暂停
 * - `hand_complete`：本手已结束（至调用 `reset` 之前；业务可在此期间做摊牌展示、奖池结算、`settle` 等）
 * - `aborted`：异常终止（预留）
 */
export type HandLifecycle =
  | 'idle'
  | 'in_hand'
  | 'in_hand_paused'
  | 'hand_complete'
  | 'aborted'

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

class Controller implements GameComponent {
  #status: HandLifecycle = 'idle'
  // 当前游戏阶段
  #stage: Stage = StageEnum.PRE_FLOP
  // 公共牌翻到哪个阶段, 用户结算时结算最大牌型
  #boardThroughStage: Stage = StageEnum.PRE_FLOP
  #activePlayer: Player | null = null
  #dealer: Dealer
  #callbackOfEnd?: CallbackOfGameEnd
  #callbackOnNextStage?: CallbackOnNextStage
  #callbackOfGameStart?: () => Promise<void>
  #defaultBets: Array<{ userId: number; balance: number; amount: number }> = []
  /** 牌型结算信息 */
  #rankInfo: {
    rankCategory?: RankCategory
    pokes: Poke[][]
    rankStrength: number
  } = { rankCategory: undefined, pokes: [], rankStrength: 0 }
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
    return this.#status
  }

  get defaultBets() {
    return this.#defaultBets
  }

  get stage() {
    return this.#stage
  }

  get endAt() {
    return this.#boardThroughStage
  }

  get activePlayer() {
    return this.#activePlayer
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
      (this.#stage === StageEnum.RIVER &&
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
    return this.getCommonPokes(StageEnum.PRE_FLOP, this.#boardThroughStage)
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
    if (this.#activePlayer === player)
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_DUPLICATE_CONTROL)
      )

    if (!options?.skipNextPlayerPacing) {
      await this.#turnPacingHooks?.beforeNextPlayerTurn?.()
    }

    this.#activePlayer = player
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
      this.#boardThroughStage = this.#stage
      this.#settle()
      this.end()

      this.#callbackOfEnd?.({
        currentStage: this.#stage,
        endStage: this.#boardThroughStage,
        showHandPokes: false,
        pokesToReveal: this.getCommonPokes(
          this.#stage,
          this.#boardThroughStage
        ),
        pokesRevealed: this.getCommonPokes(
          StageEnum.PRE_FLOP,
          this.#boardThroughStage
        )
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'hand_end_fold_win',
        data: {
          lastActionStage: this.#stage,
          boardThroughStage: this.#boardThroughStage
        }
      })
      return true
    }

    if (this.shouldShowDown()) {
      const currentStage = this.#stage
      this.#boardThroughStage = StageEnum.RIVER
      this.#stage = StageEnum.RIVER
      this.#settle()
      this.end()

      const { rankCategory, pokes, rankStrength } = this.#rankInfo
      this.#callbackOfEnd?.({
        bestPokes: pokes,
        showHandPokes: true,
        currentStage: currentStage,
        endStage: this.#boardThroughStage,
        bestRankStrength: rankStrength,
        bestRankCategory: rankCategory,
        pokesToReveal: this.getCommonPokes(
          currentStage,
          this.#boardThroughStage
        ),
        pokesRevealed: this.getCommonPokes(
          StageEnum.PRE_FLOP,
          this.#boardThroughStage
        )
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'hand_end_showdown',
        data: {
          lastActionStage: currentStage,
          boardThroughStage: this.#boardThroughStage
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
      const index = stages.findIndex((stage) => stage === this.#stage)
      if (index < 0 || index >= stages.length - 1) return false

      const currentStage = this.#stage
      const nextStage = stages[index + 1]

      this.#stage = nextStage
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      this.#dealer.resetActionsHistory()

      const activePlayerId = this.#activePlayer?.getUserInfo().id
      this.#callbackOnNextStage?.({
        stage: nextStage,
        lastStage: currentStage,
        pokesToReveal: this.getCommonPokes(currentStage, nextStage)
      })
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

    const commonPokes = this.#dealer.deck.getPokes().commonPokes
    return commonPokes.slice(
      this.#getPokeEndIndex(currentStage),
      this.#getPokeEndIndex(endStage)
    )
  }

  /**
   * @description 游戏stage变化时的回调监听函数
   * @param callback
   */
  onNextStage(callback: CallbackOnNextStage) {
    this.#callbackOnNextStage = callback
  }

  /**
   * @description 游戏结束时的回调监听函数
   * @param callback
   */
  onGameEnd(callback: CallbackOfGameEnd) {
    this.#callbackOfEnd = callback
  }

  // 大盲小盲的默认下注行为
  // 在双人竞技中, 庄家需要下小盲注, 同时率先开始行动
  async takeActionInPreFlop() {
    const takeDefaultActionPlayers = this.#getSmallBindAndBigBind()
    takeDefaultActionPlayers.forEach(async (player, index) => {
      if (player) {
        const amount =
          index === 0
            ? this.#dealer.lowestBetAmount / 2
            : this.#dealer.lowestBetAmount

        player.bet(amount, true)
        this.#defaultBets.push({
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
      await this.#callbackOfGameStart?.()
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
    this.#status = 'in_hand'
    this.#stage = StageEnum.PRE_FLOP
    this.#boardThroughStage = StageEnum.PRE_FLOP

    if (TexasEngineContext.simulation().resetDealerBeforeHandStart) {
      this.#dealer.reset()
    }

    await this.takeActionInPreFlop()
  }

  onGameStart(callback: () => Promise<void>) {
    this.#callbackOfGameStart = callback
  }

  /**
   * @description 继续游戏
   */
  continue() {
    if (this.#status !== 'in_hand_paused')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NOT_PAUSED))

    this.#status = 'in_hand'
    this.#activePlayer?.continue()
  }

  /**
   * 按「公共牌已发到哪一条街」结算各玩家 bestFiveCards / rank（如发牌后未开局、测试或强制结束时可调）。
   * 正常对局在 `tryToEndGame` 命中时已内部调用 `#settle`。
   */
  settleRankingsThroughStage(throughStage: Stage) {
    this.#boardThroughStage = throughStage
    this.#settle()
  }

  /**
   * @description 结束游戏, 回收玩家控制权（牌型结算由 `tryToEndGame` 或 `settleRankingsThroughStage` 负责）
   */
  end() {
    if (this.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_END_NOT_IN_HAND))

    this.#status = 'hand_complete'
    this.resetActivePlayer()
  }

  /** 根据当前阶段, dealer,以及deck 比较结算出最大牌型信息, 以及计算出每个玩家的牌型算力 */
  #settle() {
    const commonPokesWhenGameEnd = this.getCommonPokesWhenGameEnd()
    if (commonPokesWhenGameEnd.length === 0) return

    this.#dealer.forEach((player) => {
      const bestFiveCards = getBestFiveCards(
        player.getHandPokes(),
        commonPokesWhenGameEnd
      )

      // 存储最大五张牌, 防止后续重复计算
      player.bestFiveCards = bestFiveCards
      player.rankSignature = getFiveCardsRankSignature(bestFiveCards)
      player.rankStrength = getStrengthFromRankSignature(player.rankSignature)
    })
    this.#rankInfo = getBestRankInfo(
      this.#dealer
        // 弃牌玩家不参与最终牌型大小比较
        .getPlayersStillInGame()
        .map((player) => player.getHandPokes()),
      commonPokesWhenGameEnd
    )
    TexasEngineContext.emitTrace({
      channel: 'dealer',
      name: 'settle_common_pokes',
      data: {
        commonPokes: formatterPoke(commonPokesWhenGameEnd)
      }
    })
  }
  resetActivePlayer() {
    this.#activePlayer?.removeControl()
    this.#activePlayer = null
  }
  /**
   * @description 重置控制器, 在游戏结束之后调用
   */
  reset() {
    this.resetActivePlayer()
    this.#defaultBets = []
    this.#status = 'idle'
    this.#boardThroughStage = StageEnum.PRE_FLOP
    this.#stage = StageEnum.PRE_FLOP
    this.#rankInfo = { rankCategory: undefined, pokes: [], rankStrength: 0 }
  }

  /**
   * @description 暂停游戏
   */
  pause() {
    this.#status = 'in_hand_paused'
    this.activePlayer?.pause()
  }
}
export default Controller
