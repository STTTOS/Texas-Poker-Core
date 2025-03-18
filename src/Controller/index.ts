// 控制游戏的进程
import Dealer from '../Dealer'
import { Player } from '../Player'

export type Stage = 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown'
const stages: Stage[] = ['pre-flop', 'flop', 'turn', 'river', 'showdown']

class Controller {
  #status: 'on' | 'pause' | 'abort' | 'waiting' = 'waiting'
  #stage: Stage = 'pre-flop'
  #activePlayer: Player | null = null
  #timer: NodeJS.Timeout | null = null
  // 记录游戏的进行时间,单位 second
  #count = 0
  #dealer: Dealer
  constructor(dealer: Dealer) {
    this.#dealer = dealer
  }

  get stage() {
    return this.#stage
  }
  setControl(player: Player | null) {
    this.#activePlayer = player
  }

  transferControlToNext(nextPlayer: Player | null) {
    this.setControl(nextPlayer)
    nextPlayer?.getControl()
  }

  get activePlayer() {
    return this.#activePlayer
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

    if (allPlayersBetThSameAmount) {
      const index = stages.findIndex((stage) => stage === this.#stage)
      this.#stage = stages[index + 1]
      this.setControl(this.#dealer.getTheFirstPlayerToAct())
      this.#dealer.resetCurrentStageTotalAmount()
      this.#dealer.resetActionsOfPlayers()
      console.log('游戏进入下一个阶段 => ', this.#stage)
      return true
    }
    return false
  }

  // 创建一个迭代器控制游戏进行
  *gameIterator(): Generator<void> {
    while (true) {
      // this.transferControlToNext(this.#dealer.);
      // 暂停，等待玩家行动
      yield
    }
  }

  /**
   * @description 开始计时器, 将控制权移交给第一个可以行动的玩家
   */
  start() {
    // 将控制权给第一个可以行动的玩家
    this.transferControlToNext(this.#dealer.getTheFirstPlayerToAct())

    this.#status = 'on'
    this.#stage = 'pre-flop'
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
