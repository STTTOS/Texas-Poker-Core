// 控制游戏的进程
import Dealer from '../Dealer'
import TexasError from '@/error'
import { Player } from '../Player'
import { Poke } from '@/Deck/constant'

export type Stage = 'pre_flop' | 'flop' | 'turn' | 'river'
const stages: Stage[] = ['pre_flop', 'flop', 'turn', 'river']

export type CallbackOfGameEnd = (params: {
  restCommonPokes: Poke[]
  currentStage: Stage
  showHandPokes: boolean
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
class Controller {
  #status: ControllerStatus = 'waiting'
  #stage: Stage = 'pre_flop'
  // 游戏在哪个极端结束的, 比如翻牌圈其他玩家都弃牌, 游戏在这个阶段就结束了
  #endAt: Stage = 'pre_flop'
  #activePlayer: Player | null = null
  #timer: NodeJS.Timeout | null = null
  // 记录游戏的进行时间,单位 second
  #count = 0
  #dealer: Dealer
  #callbackOfEnd?: CallbackOfGameEnd
  #callbackOnNextStage?: CallbackOnNextStage
  #callbackOfGameStart?: () => Promise<void>
  #defaultBets: Array<{ userId: number; balance: number; amount: number }> = []

  constructor(dealer: Dealer) {
    this.#dealer = dealer
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
    if (stage === 'pre_flop') return 0
    if (stage === 'flop') return 3
    if (stage === 'turn') return 4
    if (stage === 'river') return 5
  }

  /**
   * @description 将控制器移交给指定玩家
   * @param player
   */
  transferControlTo(player: Player | null) {
    if (this.#activePlayer === player)
      throw new TexasError(2100, '无法重复获得控制权')

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
        this.#stage === 'river')

    if (shouldEndGame) {
      this.end()
      this.#endAt = this.stage
      this.#callbackOfEnd?.({
        restCommonPokes: this.getCommonPokes(this.#stage, 'river'),
        currentStage: this.#stage,
        showHandPokes: true
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
      const lastStage = this.#stage
      const nextStage = stages[index + 1]

      this.#stage = nextStage
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      this.#dealer.resetActionsHistory()

      this.#callbackOnNextStage?.({
        stage: nextStage,
        lastStage,
        commonPokes: this.getCommonPokes(lastStage, nextStage)
      })
      console.log('游戏进入下一个阶段 => ', this.#stage)

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
  async takeActionInPreFlop() {
    console.log('takeActionInPreFlop')
    let current = this.#dealer.button?.getNextPlayer()

    if (current) {
      const amount =
        this.#dealer.count === 2
          ? this.#dealer.lowestBetAmount
          : this.#dealer.lowestBetAmount / 2
      current.bet(amount, true)
      this.#defaultBets.push({
        userId: current.getUserInfo().id,
        balance: current.balance,
        amount
      })

      if (this.#dealer.count > 2) {
        current = current.getNextPlayer()
        if (current) {
          const amount = this.#dealer.lowestBetAmount
          current.bet(amount, true)
          this.#defaultBets.push({
            userId: current.getUserInfo().id,
            balance: current.balance,
            amount
          })
        }
      }
    }
    const activePlayer = current?.getNextPlayer()
    if (activePlayer) {
      // 默认行为结束后, 游戏正式开始
      await this.#callbackOfGameStart?.()
      this.transferControlTo(activePlayer)
    } else throw new TexasError(2000, '游戏进程异常')
  }

  /**
   * @description 开始计时器, 将控制权移交给第一个可以行动的玩家
   */
  async start() {
    this.#status = 'on'
    this.#stage = 'pre_flop'
    this.#endAt = 'pre_flop'

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
      throw new TexasError(2100, '游戏不是暂停状态,无法继续')

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
      throw new TexasError(2100, '游戏不在进行中, 无法结束')

    this.clearTimer()
    this.#status = 'end'

    this.#activePlayer?.removeControl()
    this.#activePlayer = null
  }

  /**
   * @description 重置控制器, 在游戏结束之后调用
   */
  reset() {
    this.clearTimer()

    this.#activePlayer?.removeControl()
    this.#count = 0
    this.#defaultBets = []
    this.#status = 'waiting'
    this.#endAt = 'pre_flop'
    this.#stage = 'pre_flop'
    this.#activePlayer = null
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
