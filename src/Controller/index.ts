// 控制游戏的进程
import Dealer from '../Dealer'
import { Player } from '../Player'
import TexasError from '@/TexasError'
import { Poke, RankCategory } from '@/Deck/constant'
import { GameComponent, TexasErrorCallback } from '@/Texas'

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
  maxPokes?: Poke[][]
  maxRankCategory?: RankCategory
}) => void
export type CallbackOnNextStage = (params: {
  commonPokes: Poke[]
  stage: Stage
  lastStage: Stage
}) => void
export type ControllerStatus =
  /**
   * 进行中
   */
  | 'on'
  /**
   * 暂停
   */
  | 'pause'
  /**
   * 进程出现异常
   */
  | 'abort'
  /**
   * 未开始
   */
  | 'waiting'
  /**
   * 游戏结束
   */
  | 'end'
class Controller implements GameComponent {
  #status: ControllerStatus = 'waiting'
  #stage: Stage = StageEnum.PRE_FLOP
  // 游戏在哪个极端结束的, 比如翻牌圈其他玩家都弃牌, 游戏在这个阶段就结束了
  #endAt: Stage = StageEnum.PRE_FLOP
  #activePlayer: Player | null = null
  #timer: NodeJS.Timeout | null = null
  // 记录游戏的进行时间,单位 second
  #count = 0
  #dealer: Dealer
  #callbackOfEnd?: CallbackOfGameEnd
  #callbackOnNextStage?: CallbackOnNextStage
  #callbackOfGameStart?: () => Promise<void>
  #defaultBets: Array<{ userId: number; balance: number; amount: number }> = []
  reportError: TexasErrorCallback

  constructor(
    dealer: Dealer,
    reportError: TexasErrorCallback = (error) => {
      throw error
    }
  ) {
    this.#dealer = dealer
    this.reportError = reportError
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
      this.reportError(new TexasError(2100, '无法重复获得控制权'))

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
      console.log('游戏结束(otherPlayersFold):', this.#endAt)
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
      const { rankSignature, pokes } =
        this.#dealer.deck.getMaxRankSignatureAndPokes()
      this.#callbackOfEnd?.({
        showHandPokes: true,
        currentStage: this.#stage,
        restCommonPokes: this.getCommonPokes(this.#stage, StageEnum.RIVER),
        maxPokes: pokes,
        maxRankCategory: rankSignature[0] as RankCategory
      })
      console.log('游戏结束(shouldEndGame):', this.#endAt)
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
      console.log(
        '推进到下个阶段, 触发人',
        this.#activePlayer?.getUserInfo().name
      )
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
      console.log('游戏进入下一个阶段 => ', this.#stage)

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
    } else this.reportError(new TexasError(2000, '游戏进程异常'))
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
      this.reportError(
        new TexasError(2000, '游戏进程异常: 小盲或大盲玩家不存在')
      )
    return result
  }
  /**
   * @description 开始计时器, 将控制权移交给第一个可以行动的玩家
   */
  async start() {
    this.#status = 'on'
    this.#stage = StageEnum.PRE_FLOP
    this.#endAt = StageEnum.PRE_FLOP

    // 测试环境保持玩家balance起始不变
    if (process.env.PROJECT_ENV === 'dev') this.#dealer.reset()

    await this.takeActionInPreFlop()
    this.startTimer()
  }

  onGameStart(callback: () => Promise<void>) {
    this.#callbackOfGameStart = callback
  }

  startTimer() {
    // 避免重复开启计时器
    if (this.#timer) return

    this.#timer = setInterval(() => {
      this.#count++
    }, 1000)
  }

  /**
   * @description 继续游戏
   */
  continue() {
    if (this.#status !== 'pause')
      this.reportError(new TexasError(2100, '游戏不是暂停状态,无法继续'))

    this.#status = 'on'
    this.#activePlayer?.continue()
    this.startTimer()
  }

  clearTimer() {
    if (this.#timer) {
      clearInterval(this.#timer)
      this.#timer = null
    }
  }

  /**
   * @description 结束游戏, 回收玩家控制权
   */
  end() {
    if (this.status !== 'on')
      this.reportError(new TexasError(2100, '游戏不在进行中, 无法结束'))

    this.clearTimer()
    this.#status = 'end'
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
    this.clearTimer()

    this.resetActivePlayer()
    this.#count = 0
    this.#defaultBets = []
    this.#status = 'waiting'
    this.#endAt = StageEnum.PRE_FLOP
    this.#stage = StageEnum.PRE_FLOP
  }

  /**
   * @description 暂停游戏
   */
  pause() {
    this.#status = 'pause'

    this.clearTimer()
    this.activePlayer?.pause()
  }
}
export default Controller
