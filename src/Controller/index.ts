// 控制游戏的进程
import Dealer from '../Dealer'
import { Player } from '../Player'
import { Poke, RankCategory } from '@/Deck/constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import { GameComponent, TexasErrorCallback } from '@/Texas'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

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
  restCommonPokes: Poke[]
  currentStage: Stage
  showHandPokes: boolean
  // 游戏到shutdown阶段时, 需要展示场上最大牌型组合
  // 此字段可能为空, 比如其他玩家都弃牌时, 并不需要展示
  bestPokes?: Poke[][]
  bestRankCategory?: RankCategory
}) => void
export type CallbackOnNextStage = (params: {
  commonPokes: Poke[]
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

class Controller implements GameComponent {
  #status: HandLifecycle = 'idle'
  #stage: Stage = StageEnum.PRE_FLOP
  // 游戏在哪个极端结束的, 比如翻牌圈其他玩家都弃牌, 游戏在这个阶段就结束了
  #endAt: Stage = StageEnum.PRE_FLOP
  #activePlayer: Player | null = null
  #dealer: Dealer
  #callbackOfEnd?: CallbackOfGameEnd
  #callbackOnNextStage?: CallbackOnNextStage
  #callbackOfGameStart?: () => Promise<void>
  #defaultBets: Array<{ userId: number; balance: number; amount: number }> = []
  fail: TexasErrorCallback

  constructor(
    dealer: Dealer,
    fail: TexasErrorCallback = (error) => {
      throw error
    }
  ) {
    this.#dealer = dealer
    this.fail = fail
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
    return this.#endAt
  }

  get activePlayer() {
    return this.#activePlayer
  }

  #getPokeEndIndex(stage: Stage) {
    if (stage === StageEnum.PRE_FLOP) return 0
    if (stage === StageEnum.FLOP) return 3
    if (stage === StageEnum.TURN) return 4
    if (stage === StageEnum.RIVER) return 5
  }

  /**
   * @description 将控制器移交给指定玩家
   * @param player
   */
  transferControlTo(player: Player | null) {
    if (this.#activePlayer === player)
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_DUPLICATE_CONTROL)
      )

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
    const otherPlayersFold =
      this.#dealer.filter((player) => player.getStatus() === 'out').length ===
      this.#dealer.count - 1

    // 其他玩家都弃牌了
    if (otherPlayersFold) {
      this.end()
      this.#endAt = this.#stage
      this.#callbackOfEnd?.({
        restCommonPokes: this.getCommonPokes(this.#stage, this.#endAt),
        currentStage: this.#stage,
        showHandPokes: false
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'hand_end_fold_win',
        data: { endAt: this.#endAt }
      })
      return true
    }

    // 可以行动的人数(非allIn & out) <= 1 && 可以行动的人采取了行动
    const playersCanAct = this.#dealer.getPlayersCanAct()
    const shouldEndGame =
      playersCanAct.length === 0 ||
      (playersCanAct.length === 1 && !playersCanAct[0].actionable()) ||
      (this.#dealer.every((player) => !player.actionable()) &&
        this.#stage === StageEnum.RIVER)

    if (shouldEndGame) {
      this.end()
      this.#endAt = this.stage
      const { rankCategory, pokes } = this.#dealer.deck.getBestRankInfo()

      this.#callbackOfEnd?.({
        showHandPokes: true,
        currentStage: this.#stage,
        restCommonPokes: this.getCommonPokes(this.#stage, StageEnum.RIVER),
        bestPokes: pokes,
        bestRankCategory: rankCategory
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'hand_end_showdown',
        data: { endAt: this.#endAt }
      })
      return true
    }
    return false
  }

  /**
   * @description 每个玩家行动之后, 都要调用此方法
   * 推进到新的阶段后, 将控制权交当前阶段第一位可以行动的玩家
   */
  tryToAdvanceGameToNextStage() {
    const canPushToNextStage = this.#dealer.every(
      (player) => !player.actionable()
    )
    if (canPushToNextStage) {
      const index = stages.findIndex((stage) => stage === this.#stage)
      const currentStage = this.#stage
      const nextStage = stages[index + 1]

      this.#stage = nextStage
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      this.#dealer.resetActionsHistory()

      this.#callbackOnNextStage?.({
        stage: nextStage,
        lastStage: currentStage,
        commonPokes: this.getCommonPokes(currentStage, nextStage)
      })
      TexasEngineContext.emitTrace({
        channel: 'controller',
        name: 'stage_changed',
        data: {
          from: currentStage,
          to: nextStage,
          byUserId: this.#activePlayer?.getUserInfo().id
        }
      })

      this.resetActivePlayer()
      this.transferControlTo(this.#dealer.getTheFirstPlayerToAct())
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
      this.transferControlTo(activePlayer)
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
    this.#endAt = StageEnum.PRE_FLOP

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
   * @description 结束游戏, 回收玩家控制权
   */
  end() {
    if (this.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_END_NOT_IN_HAND))

    this.#status = 'hand_complete'
    this.resetActivePlayer()
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
    this.#endAt = StageEnum.PRE_FLOP
    this.#stage = StageEnum.PRE_FLOP
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
