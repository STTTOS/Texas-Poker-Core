import Pool from '@/Pool'
import Room from '@/Room'
import Dealer from '@/Dealer'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import Player, { User, ActionType, CallbackOfAction } from '@/Player'
import Controller, {
  CallbackOfGameEnd,
  CallbackOnNextStage
} from '@/Controller'
import {
  TexasEngineContext,
  type TexasEngineGlobalOptions
} from '@/TexasEngineContext'

// 在表单中填入一些基本的信息
// 比如大盲注
// 最大玩家数量
/** 当前引擎角色表最多支持 10 人桌；更大人数需扩展 playerRoleSetMap */
const SUPPORTED_MAX_TABLE_PLAYERS = 10

export interface CreateRoomInputArgs {
  lowestBetAmount: number
  /** 单桌最大入座人数（不超过引擎支持上限） */
  maximumCountOfPlayers: number
  /** 入座玩家起始筹码 */
  initialChips: number
  // 需要传入用户信息, 在创建房间时同时指定房主
  user: User
  // 玩家的思考时间, 单位: s
  thinkingTime?: number
}
export interface PreAction {
  userId: number
  allowedActions: ActionType[]
  restrict?: {
    min: number
    max: number
  }
}
export type TexasErrorCallback = (error: TexasError) => never
// 组件基类
export interface GameComponent {
  /** 标准 fail-fast：触发后一定抛出并中断流程 */
  fail?(error: TexasError): never
}

class GameEventEmitter {
  protected errorCallback?: (error: TexasError) => void
  onError(callback: (error: TexasError) => void) {
    this.errorCallback = callback
  }
}
class Texas extends GameEventEmitter {
  pool: Pool
  room: Room
  dealer: Dealer
  controller: Controller
  /** 标准 fail-fast 入口：先通知 onError，再 throw */
  fail: (error: TexasError) => never
  /** @deprecated 历史命名；等价于 fail */
  handleError: (error: TexasError) => never

  constructor({
    user,
    thinkingTime,
    lowestBetAmount,
    maximumCountOfPlayers,
    initialChips
  }: CreateRoomInputArgs) {
    super()

    // 使用箭头函数, 防止this指向问题
    this.fail = (error: TexasError) => {
      this.errorCallback?.(error)
      throw error
    }
    this.handleError = this.fail
    const cappedMaxPlayers = Math.min(
      maximumCountOfPlayers,
      SUPPORTED_MAX_TABLE_PLAYERS
    )
    const dealer = new Dealer(lowestBetAmount, this.fail, {
      maxTablePlayers: cappedMaxPlayers
    })
    const controller = new Controller(dealer, this.fail)
    const pool = new Pool(this.fail)
    const owner = new Player({
      user,
      initialChips,
      pool,
      dealer,
      controller,
      thinkingTime,
      lowestBetAmount,
      fail: this.fail
    })
    const room = new Room({
      dealer,
      owner,
      controller,
      initialChips,
      maximumCountOfPlayers: cappedMaxPlayers,
      fail: this.fail
    })
    this.pool = pool
    this.room = room
    this.dealer = dealer
    this.controller = controller
  }

  onPreAction(callback: (params: PreAction) => void) {
    this.dealer.forEach((player) => {
      player.onPreAction(callback)
    })
  }
  onGameEnd(callback: CallbackOfGameEnd) {
    this.controller.onGameEnd(callback)
  }

  onNextStage(callback: CallbackOnNextStage) {
    this.controller.onNextStage(callback)
  }

  onGameStart(callback: () => Promise<void>) {
    this.controller.onGameStart(callback)
  }

  /**
   * 监听玩家采取行动
   */
  onAction(callback: CallbackOfAction) {
    this.dealer.forEach((player) => player.onAction(callback))
  }

  // 设置各个玩家的初始角色
  ready() {
    this.room.ready()
  }

  async start() {
    if (this.room.getPlayersBySeatStatus('on-set').length < 2)
      this.fail(
        new TexasError(TexasCoreErrorCode.SESSION_START_MIN_SEATED, {
          min: 2
        })
      )

    if (this.room.status === 'seats_open')
      this.fail(new TexasError(TexasCoreErrorCode.SESSION_START_SEATS_OPEN))

    if (this.controller.status !== 'idle')
      this.fail(new TexasError(TexasCoreErrorCode.SESSION_START_NOT_IDLE))

    this.resetBeforeGameStart()
    this.dealer.dealCards()
    await this.controller.start()
  }

  // 测试阶段方法, 手动结束游戏
  end() {
    if (this.controller.status === 'idle')
      this.fail(new TexasError(TexasCoreErrorCode.SESSION_END_NOT_STARTED))

    this.controller.end()
  }

  async settle() {
    this.dealer.settle()
    // 计算并分配奖池
    await this.pool.pay()
  }

  reset() {
    this.pool.reset()
    this.dealer.reset()
    this.controller.reset()
  }

  /**
   *@description 在游戏开始时重置所有状态
   *目前没有考虑游戏异常结束的情况
   *所以需要在游戏开始时调用此方法去重置状态
   */
  resetBeforeGameStart() {
    this.reset()
  }

  // 获取默认下注行为
  getDefaultBet() {
    return this.controller.defaultBets
  }

  createPlayer(userInfo: User) {
    return new Player({
      user: userInfo,
      initialChips: this.room.initialChips,
      pool: this.pool,
      dealer: this.dealer,
      controller: this.controller,
      thinkingTime: this.room.owner.thinkingTime,
      lowestBetAmount: this.dealer.lowestBetAmount,
      fail: this.fail
    })
  }

  /** 进程级配置（trace、仿真开关等），建议在应用启动时调用一次 */
  static configureEngine(patch: Partial<TexasEngineGlobalOptions>): void {
    TexasEngineContext.configure(patch)
  }

  static resetEngineContext(): void {
    TexasEngineContext.reset()
  }
}

export default Texas
