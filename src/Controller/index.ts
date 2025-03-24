// 控制游戏的进程
import { isNil, complement } from 'ramda'

import Dealer from '../Dealer'
import { Player } from '../Player'

export type Stage = 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown'
const stages: Stage[] = ['pre-flop', 'flop', 'turn', 'river', 'showdown']

class Controller {
  #status: 'on' | 'pause' | 'abort' | 'waiting' = 'waiting'
  #stage: Stage = 'pre-flop'
  // 游戏在哪个极端结束的, 比如翻牌圈其他玩家都弃牌, 游戏在这个阶段就结束了
  #endAt: Stage = 'pre-flop'
  #activePlayer: Player | null = null
  #timer: NodeJS.Timeout | null = null
  // 记录游戏的进行时间,单位 second
  #count = 0
  #dealer: Dealer
  constructor(dealer: Dealer) {
    this.#dealer = dealer
  }

  #callback?: () => void
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
      this.#callback?.()
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
      ).length <= 1

    if (shouldEndGame) {
      console.log('除了弃牌的玩家')
      this.#endAt = 'river'
      this.#stage = 'showdown'
      this.#callback?.()
      console.log('游戏结束(shouldEndGame):', this.#endAt)
      return true
    }
    return false
  }
  // 每个玩家行动之后, 都要调用此方法
  // 推进到新的阶段后, 将控制权交给小盲位
  // 如果小盲位已经出局或者无法行动(all-in), 依次将控制权交给下一个可以行动的玩家
  tryToAdvanceGameToNextStage() {
    if (this.#stage === 'showdown') throw new Error('游戏已经结束')

    const maxBetAmount = this.#dealer.getCurrentStageMaxBetAmount()
    // this.#dealer.forEach((p) => p.log('ss,'))
    const players = this.#dealer
      // 场上正常下注的玩家, 下注金额需要都等于最大下注金额
      .filter((p) => p.getStatus() === 'waiting')

    const allPlayersBetThSameAmount = players
      .map((p) => p.getCurrentStageTotalAmount())
      .every((amount) => amount === maxBetAmount)

    const actions = this.#dealer
      // 排除 all-in的玩家 与 弃牌的玩家
      .filter(
        (player) =>
          player.getStatus() !== 'allIn' && player.getStatus() !== 'out'
      )
      .map((player) => player.getAction())
    const allPlayersTakeAction = actions.every(complement(isNil))

    const canPushToNextStage = allPlayersTakeAction && allPlayersBetThSameAmount
    if (canPushToNextStage) {
      const index = stages.findIndex((stage) => stage === this.#stage)
      const newStage = stages[index + 1]
      // 出发游戏结束, 开始结算
      if (newStage === 'showdown') {
        this.#endAt = 'river'
        this.#stage = newStage
        this.#callback?.()
        console.log('游戏结束', this.#endAt)
        return
      }
      this.#stage = newStage
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      console.log('游戏进入下一个阶段 => ', this.#stage)

      this.transferControlToNext(this.#dealer.getTheFirstPlayerToAct())
      return true
    }
    return false
  }

  onEnd(callback: () => void) {
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

  // 大盲小盲的默认下注行为
  takeActionInPreFlop() {
    const SM = this.#dealer.button?.getNextPlayer()
    if (SM) {
      this.transferControlToNext(SM)
      SM.bet(this.#dealer.getLowestBetAmount() / 2, true)

      const BB = SM.getNextPlayer()
      if (BB && this.#dealer.count > 2) {
        BB.bet(this.#dealer.getLowestBetAmount(), true)
      }
    }
  }
  /**
   * @description 开始计时器, 将控制权移交给第一个可以行动的玩家
   */
  start() {
    this.#status = 'on'
    this.#stage = 'pre-flop'
    this.#endAt = 'pre-flop'

    if (process.env.PROJECT_ENV === 'dev')
      this.transferControlToNext(this.#dealer.getTheFirstPlayerToAct())
    else this.takeActionInPreFlop()

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
    this.#stage = 'showdown'
    this.#status = 'waiting'

    this.#activePlayer?.removeControl()
    this.#activePlayer?.clearTimer()
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
