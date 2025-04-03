// 控制游戏的进程
import { isNil, complement } from 'ramda'

import Dealer from '../Dealer'
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
export type ControllerStatus = 'on' | 'pause' | 'abort' | 'waiting'
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
  #callback?: CallbackOfGameEnd
  #callbackOnNextStage?: CallbackOnNextStage
  #defaultBets: Array<{ userId: number; balance: number; amount: number }> = []

  constructor(dealer: Dealer) {
    this.#dealer = dealer
  }

  get status() {
    return this.#status
  }
  get stage() {
    return this.#stage
  }
  setControl(player: Player | null) {
    this.#activePlayer = player
  }

  transferControlToNext(player: Player | null) {
    this.setControl(player)
    player?.getControl()
  }

  get endAt() {
    return this.#endAt
  }

  get activePlayer() {
    return this.#activePlayer
  }

  // 每个玩家行动之后都要调用此方法
  // 判断游戏是否该结束
  // 所有玩家都采取了行动, 并且status为'waiting'的玩家只剩一个
  tryToEndGame() {
    const otherPlayersFold =
      this.#dealer.filter((player) => player.getStatus() === 'out').length ===
      this.#dealer.count - 1

    // 其他玩家都弃牌了
    if (otherPlayersFold) {
      this.#endAt = this.#stage
      this.#callback?.({
        restCommonPokes: this.getCommonPokes(this.stage, this.#endAt),
        currentStage: this.#stage,
        showHandPokes: false
      })
      console.log('游戏结束(otherPlayersFold):', this.#endAt)
      return true
    }

    // const actions = this.#dealer
    //   .filter(
    //     (player) =>
    //       player.getStatus() !== 'allIn' && player.getStatus() !== 'out'
    //   )
    //   .map((player) => player.getAction())
    // const allPlayersTakeAction = actions.every(complement(isNil))

    // 除了弃牌 与 all-in 并且都行动后的玩家 数量 <=1
    // 表示该直接从当前阶段推进到 => river 阶段并且摊牌, 比牌
    // 然后进入游戏结算状态
    const shouldEndGame =
      this.#dealer.filter(
        (player) =>
          player.getStatus() !== 'out' && player.getStatus() !== 'allIn'
      ).length === 0

    if (shouldEndGame) {
      this.#endAt = 'river'
      this.#callback?.({
        restCommonPokes: this.getCommonPokes(this.stage, 'river'),
        currentStage: this.stage,
        showHandPokes: true
      })
      console.log('游戏结束(shouldEndGame):', this.#endAt)
      return true
    }
    return false
  }
  // 每个玩家行动之后, 都要调用此方法
  // 推进到新的阶段后, 将控制权交给小盲位
  // 如果小盲位已经出局或者无法行动(all-in), 依次将控制权交给下一个可以行动的玩家
  tryToAdvanceGameToNextStage() {
    // if (this.#stage === 'river') return false

    const players = this.#dealer
      // 场上正常下注的玩家, 下注金额需要都等于最大下注金额
      .filter(
        (player) =>
          player.getStatus() !== 'allIn' && player.getStatus() !== 'out'
      )

    const bets = players.map((player) => player.getCurrentStageTotalAmount())
    const maxBetAmount = Math.max(...bets)
    const allPlayersBetThSameAmount = bets.every(
      (amount) => amount === maxBetAmount
    )

    const actions = players.map((player) => player.getAction())
    const allPlayersTakeAction = actions.every(complement(isNil))

    const canPushToNextStage =
      allPlayersTakeAction && allPlayersBetThSameAmount && bets.length > 1
    if (canPushToNextStage) {
      const index = stages.findIndex((stage) => stage === this.#stage)
      const lastStage = stages[index]
      const stage = stages[index + 1]

      if (!stage) {
        this.tryToEndGame()
        return true
      }
      this.#stage = stage
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      this.#callbackOnNextStage?.({
        stage,
        lastStage,
        commonPokes: this.getCommonPokes(lastStage, stage)
      })
      console.log('游戏进入下一个阶段 => ', this.#stage)

      this.transferControlToNext(this.#dealer.getTheFirstPlayerToAct())
      return true
    }
    return false
  }

  #getPokeEndIndex(stage: Stage) {
    if (stage === 'pre_flop') return 0
    if (stage === 'flop') return 3
    if (stage === 'turn') return 4
    if (stage === 'river') return 5
  }
  getCommonPokes(currentStage: Stage, endStage: Stage) {
    if (currentStage === endStage) return []

    const commonPokes = this.#dealer.getDeck().getPokes().commonPokes
    return commonPokes.slice(
      this.#getPokeEndIndex(currentStage),
      this.#getPokeEndIndex(endStage)
    )
  }

  onNextStage(callback: CallbackOnNextStage) {
    this.#callbackOnNextStage = callback
  }

  onGameEnd(callback: CallbackOfGameEnd) {
    this.#callback = callback
  }
  // 创建一个迭代器控制游戏进行
  *gameIterator(): Generator<void> {
    while (true) {
      // this.transferControlToNext(this.#dealer.);
      // 暂停，等待玩家行动
      yield
    }
  }

  get defaultBets() {
    return this.#defaultBets
  }
  // 大盲小盲的默认下注行为
  takeActionInPreFlop() {
    console.log('takeActionInPreFlop')
    let current = this.#dealer.button?.getNextPlayer()
    if (current) {
      // this.transferControlToNext(SM)
      const amount = this.#dealer.getLowestBetAmount() / 2
      current.bet(amount, true)
      this.#defaultBets.push({
        userId: current.getUserInfo().id,
        balance: current.getBalance(),
        amount
      })

      if (this.#dealer.count > 2) {
        current = current.getNextPlayer()
        if (current) {
          const amount = this.#dealer.getLowestBetAmount()
          current.bet(amount, true)
          this.#defaultBets.push({
            userId: current.getUserInfo().id,
            balance: current.getBalance(),
            amount
          })
        }
      }
    }
    const activePlayer = current?.getNextPlayer()
    if (activePlayer) this.transferControlToNext(activePlayer)
    else throw new Error('游戏进程异常')
    // console.log('大盲小盲的默认下注行为', this.defaultBets)
  }
  /**
   * @description 开始计时器, 将控制权移交给第一个可以行动的玩家
   */
  start() {
    this.#status = 'on'
    this.#stage = 'pre_flop'
    // this.#endAt = 'pre_flop'

    // 测试环境保持玩家balance起始不变
    if (process.env.PROJECT_ENV === 'dev') this.#dealer.reset()

    this.takeActionInPreFlop()
    this.startTimer()
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
   * @description 结束游戏, 回收控制权, 清除玩家的计时器
   */
  end() {
    this.clearTimer()
    this.#status = 'waiting'

    this.#activePlayer?.removeControl()
    this.#activePlayer?.clearTimer()
    this.#activePlayer = null
    this.#defaultBets = []
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
