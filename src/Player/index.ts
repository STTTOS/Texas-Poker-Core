import type { TableStakes } from '@/TableStakes'
import type {
  GameComponent,
  HandLifecycle,
  TexasErrorCallback
} from '@/gameContracts'
import type {
  StreetPotSink,
  PlayerDealerRing,
  PlayerHandSession
} from '@/playerSessionPorts'

import { getRandomInt } from '@/utils'
import { StageEnum } from '@/Controller/stage'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import { Poke, RankCategory, RankSignature } from '../Deck/constant'
import { roleMap, RoleEnum, type Role, ActionTypeEnum } from './constant'
import {
  resolveAllowedActions,
  type AllowedActionsContext
} from './allowedActions'
import {
  executeBet,
  executeCall,
  executeFold,
  executeAllIn,
  executeCheck,
  executeRaise
} from './handBettingActions'

export { ActionTypeEnum }

/** 参与本手的座位状态；当前思考者仅由 {@link PlayerHandSession.activePlayer} 表示 */
export type PlayerStatus = 'eligible' | 'allIn' | 'out'
export type Action = {
  type: ActionType
  payload?: {
    value: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
}
// 玩家回合时采取的行动（使用枚举值作为类型）
export type ActionType = ActionTypeEnum

export interface User {
  id: number
  /**
   * 昵称
   */
  name: string
}
export type { Role } from './constant'
export { RoleEnum } from './constant'
export {
  resolveAllowedActions,
  type AllowedActionsContext
} from './allowedActions'

/**
 * 玩家
 */
export class Player implements GameComponent {
  /**
   * 玩家当前所处的位置
   */
  #role?: Role
  /**
   * 用户信息
   */
  #userInfo: Pick<User, 'id' | 'name'>
  #pot: StreetPotSink<Player>
  #dealerRing: PlayerDealerRing<Player>
  #handSession: PlayerHandSession<Player>
  /**
   * 积分
   */
  #balance = 0
  #status: PlayerStatus = 'eligible'
  /**
   * `getControl` 已执行且尚未 `removeControl`。
   * - `resetActivePlayer` / `pause` 据此决定是否记 `TurnEnded`。
   * - `flushPendingTurnHandoff`：若队里异常出现连续多条 `turn_handoff` 且本席尚未 `removeControl`，避免第二次 `getControl` 重复发 `TurnOffered`。
   *   业务「多调一次 flush」通常队头已非 `turn_handoff`，靠队列即可挡，不依赖本标记。
   */
  #action?: Action
  #hasJoiningBlindOption = false
  #stakes: TableStakes
  /**
   * 当前阶段的下注总额, 全押筹码不够时可以小于此金额
   */
  #currentStageTotalAmount = 0
  /**
   * 对局总下注额度
   */
  #totalBetAmount = 0
  /**
   * 输赢情况
   */
  #wager = 0
  /**
   * 指针指向上一个玩家, 庄家位的`lastPlayer`为`null`
   */
  #lastPlayer: Player | null = null
  #nextPlayer: Player | null = null

  fail: TexasErrorCallback = (error) => {
    throw error
  }

  constructor(options: {
    user: Pick<User, 'id' | 'name'>
    /** 起始筹码，写入 #balance */
    initialChips?: number
    role?: Role
    pot: StreetPotSink<Player>
    dealerRing: PlayerDealerRing<Player>
    isOwner?: boolean
    handSession: PlayerHandSession<Player>
    stakes: TableStakes
    lastPlayer?: Player | null
    nextPlayer?: Player | null
    fail?: TexasErrorCallback
  }) {
    const {
      stakes,
      user,
      lastPlayer = null,
      nextPlayer = null,
      handSession,
      dealerRing,
      pot,
      initialChips = 100,
      fail
    } = options
    this.#balance = initialChips

    this.#pot = pot
    this.#dealerRing = dealerRing
    this.#userInfo = user
    this.#handSession = handSession
    if (fail) this.fail = fail
    this.#lastPlayer = lastPlayer
    this.#nextPlayer = nextPlayer
    this.#stakes = stakes
  }
  get balance() {
    return this.#balance
  }
  set balance(value: number) {
    if (TexasEngineContext.simulation().ignoreBalanceSetter) return
    this.#balance = value
  }

  get currentStageTotalAmount() {
    return this.#currentStageTotalAmount
  }
  set currentStageTotalAmount(value: number) {
    this.#currentStageTotalAmount = value
  }
  get totalBetAmount() {
    return this.#totalBetAmount
  }
  set totalBetAmount(value: number) {
    this.#totalBetAmount = value
  }
  get wager() {
    return this.#wager
  }
  set wager(value: number) {
    this.#wager = value
  }
  get id() {
    return this.#userInfo.id
  }

  get lowestBetAmount() {
    return this.#stakes.bigBlind
  }
  /**
   * 翻牌前大盲的「选项」: 已下大盲且无人加注, 轮到大盲选择过牌/加注/弃牌(无需再跟注)
   */
  #isBigBlindOptionInPreFlop(): boolean {
    return (
      this.#handSession.stage === StageEnum.PRE_FLOP &&
      this.#role === RoleEnum.BB &&
      this.#currentStageTotalAmount >= this.getMaxBetAmountAtCurrentStage()
    )
  }

  /**
   * 翻牌前入座贴盲选项：已贴到当前最高注且尚未消耗该次行动机会时，可选择过牌/加注/弃牌/全下。
   */
  #isJoiningBlindOptionInPreFlop(): boolean {
    return (
      this.#handSession.stage === StageEnum.PRE_FLOP &&
      this.#hasJoiningBlindOption &&
      this.#currentStageTotalAmount >= this.getMaxBetAmountAtCurrentStage()
    )
  }

  /**
   * 供 {@link resolveAllowedActions} 与单测/工具复用的只读输入切片（无倒计时、无 I/O）。
   */
  getAllowedActionsContext(): AllowedActionsContext {
    return {
      selfStatus: this.#status,
      selfBalance: this.balance,
      selfCurrentStageTotal: this.#currentStageTotalAmount,
      dealerActionHistory: this.#dealerRing.actionHistory,
      maxOthersStageBet: this.getMaxOthersStageBet(),
      isBigBlindPreFlopOption: this.#isBigBlindOptionInPreFlop(),
      isJoiningBlindPreFlopOption: this.#isJoiningBlindOptionInPreFlop()
    }
  }

  /**
   * @description 获取玩家允许的行动列表
   * 防止预期外的行为
   */
  #getAllowedActions(): Array<ActionType> {
    return resolveAllowedActions(this.getAllowedActionsContext())
  }

  /**
   * 本街其他在座玩家已下注额的最大值（不含自己），供允许动作与加注校验使用。
   */
  getMaxOthersStageBet(): number {
    let maxOthersStageBet = 0
    this.#dealerRing.forEach((p) => {
      if (p !== this && p.currentStageTotalAmount > maxOthersStageBet) {
        maxOthersStageBet = p.currentStageTotalAmount
      }
    })
    return maxOthersStageBet
  }

  /** 摊牌评估存于 {@link HandSettlement}，经控制器按 userId 解析 */
  get bestFiveCards(): Poke[] | undefined {
    return this.#handSession.getShowdownEvalForPlayer(this)?.bestFiveCards
  }

  setNextPlayer(player: Player | null) {
    this.#nextPlayer = player
  }
  get rankSignature(): RankSignature | undefined {
    return this.#handSession.getShowdownEvalForPlayer(this)?.rankSignature
  }
  get rankCategory(): RankCategory | undefined {
    return this.#handSession.getShowdownEvalForPlayer(this)?.rankCategory
  }

  getNextPlayer() {
    return this.#nextPlayer
  }

  getLastPlayer() {
    return this.#lastPlayer
  }
  setLastPlayer(player: Player | null) {
    this.#lastPlayer = player
  }

  setStatus(status: PlayerStatus) {
    this.#status = status
  }

  getStatus() {
    return this.#status
  }

  get rankStrength() {
    return this.#handSession.getShowdownEvalForPlayer(this)?.rankStrength ?? 0
  }
  reset() {
    this.resetAction()
    this.resetCurrentStageTotalAmount()

    this.#totalBetAmount = 0
    this.#status = 'eligible'
    this.#wager = 0
    if (TexasEngineContext.simulation().restoreBalanceOnPlayerReset) {
      this.balance = this.#balance
    }
  }

  setRole(role: Role) {
    this.#role = role
  }

  /** 本街已确认的动作写入（由 handBettingActions 在校验通过后调用） */
  assignCurrentStreetAction(action: Action): void {
    this.#action = action
  }

  /** 将筹码记入中央奖池 */
  appendChipsToPot(amount: number): void {
    this.#pot.add(this, amount)
  }

  /** 记入荷官行动顺序（与发牌位无关，仅时间序） */
  notifyDealerActionHistory(): void {
    this.#dealerRing.addAction(this)
  }

  notifyActionCommitted(options: { emitPot: boolean }): void {
    this.#hasJoiningBlindOption = false
    this.#handSession.recordPlayerAction(this, {
      emitPot: options.emitPot
    })
    const turnReason = this.#handSession.consumePendingTurnEndedReason()
    this.#handSession.recordTurnEnded(
      this.getUserInfo().id,
      turnReason ?? 'acted'
    )
  }

  /** 本手在控制器中的生命周期（供离场分支等判断） */
  get handLifecycle(): HandLifecycle {
    return this.#handSession.status
  }

  /** 在不经 `completeBettingTurn` 的落账后尝试收局（如独赢弃牌） */
  tryHandSessionEndGame(): boolean {
    return this.#handSession.tryToEndGame()
  }

  /** 单步下注落账后：尝试收局 / 进街 / 把控制权交给下一位 */
  completeBettingTurn(): void {
    this.transferControl()
  }

  /**
   * 获取其他玩家在当前阶段的最大下注额。
   * @deprecated 与 {@link getMaxOthersStageBet} 同义，请新代码统一用 `getMaxOthersStageBet`。
   */
  getOthersMaxBetAmountAtCurrentStage() {
    return this.getMaxOthersStageBet()
  }

  /**
   *
   * @description 获取当前阶段的最大下注额
   */
  getMaxBetAmountAtCurrentStage() {
    return Math.max(
      0,
      ...this.#dealerRing.map((player) => player.currentStageTotalAmount)
    )
  }

  /**
   * @description 获取其他玩家的最大下注能力
   * @returns
   */
  getMaxAllInAmount() {
    return Math.max(
      0,
      ...this.getOtherPlayers().map(
        (player) => player.balance + player.currentStageTotalAmount
      )
    )
  }

  /**
   * @description 获取除自己外的其他玩家
   */
  getOtherPlayers() {
    return this.#dealerRing.filter((player) => player !== this)
  }

  /**
   * @description 调用此方法, 知道该玩家是否需要继续行动
   */
  actionable() {
    if (this.#status === 'allIn' || this.#status === 'out') return false

    if (!this.#action) return true

    // 翻牌前盲注选项：大盲或入座贴盲玩家仅下过盲注视为未行动，须给一次选择机会
    if (
      (this.#isBigBlindOptionInPreFlop() ||
        this.#isJoiningBlindOptionInPreFlop()) &&
      this.#action.type === ActionTypeEnum.BET
    )
      return true

    // 当前的下注金额已经等于最大下注额
    return (
      this.#currentStageTotalAmount !== this.getMaxBetAmountAtCurrentStage()
    )
  }

  /**
   * @description 重置action, 需要在每一个新的阶段
   * 以及游戏结束后调用
   */
  resetAction() {
    this.#action = undefined
    this.#hasJoiningBlindOption = false
  }

  getAllowedActions() {
    return this.#getAllowedActions()
  }

  // 根据条件找到上一个满足条件的玩家
  returnLatestPlayerIf(filter: (player: Player) => boolean): Player | null {
    let current = this.getLastPlayer()
    while (current) {
      if (filter(current)) return current
      current = current.getLastPlayer()
    }
    return null
  }

  // 根据条件找到下一个满足条件的玩家
  returnNextPlayerIf(filter: (player: Player) => boolean): Player | null {
    let current = this.getNextPlayer()
    while (current) {
      if (filter(current)) return current
      current = current.getNextPlayer()
    }
    return null
  }

  getAction() {
    return this.#action
  }

  getRole() {
    return this.#role
  }
  getUserInfo() {
    return this.#userInfo
  }

  /** 自愿行动前校验：`activePlayer === this` 且本手 `in_hand`。 */
  checkIfCanAct() {
    if (this.#handSession.activePlayer !== this) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_DISPATCH_NOT_ACTOR, {
          playerId: this.#userInfo.id
        })
      )
    }
    if (this.#handSession.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_NOT_IN_HAND))
  }

  toString() {
    return `id: ${this.#userInfo.id}, role: ${roleMap.get(this.#role!)};name: ${
      this.#userInfo.name || this.#userInfo.id
    };balance: ${this.balance}`
  }
  /** 调试用字符串；观测请用业务层对领域事件或指令的日志。 */
  log(prefix: string = '') {
    void prefix
  }

  /** 手牌唯一存于荷官侧快照，经 {@link Dealer.getHoleCardsForPlayer} 按座位解析 */
  getHandPokes(): Poke[] {
    return [...this.#dealerRing.getHoleCardsForPlayer(this)]
  }

  setHandPokes(pokes: readonly Poke[]): void {
    this.#dealerRing.setHoleCardsForPlayer(this, pokes)
  }

  setShowdownEval(evalData: {
    bestFiveCards: Poke[]
    rankSignature: RankSignature
    rankStrength: number
    rankCategory: RankCategory
  }): void {
    this.#handSession.setShowdownEvalForPlayer(this, evalData)
  }

  earn(money: number) {
    this.#balance += money
    this.#wager = money - this.totalBetAmount
  }

  // 游戏推进到下个阶段后, 需要将此字段清空
  resetCurrentStageTotalAmount() {
    this.#currentStageTotalAmount = 0
  }

  /**
   * 单步行动后的控制权交接：先清空 `activePlayer`，再按序尝试
   * {@link PlayerHandSession.tryToEndGame}（独赢弃牌 / 河摊牌等）→
   * {@link PlayerHandSession.canDeferBettingRoundStageAdvance} / {@link PlayerHandSession.requestDeferredStageAdvance}（下注轮结束且未到河：只入队 `stage_advance`）→
   * 否则同街找下一位 {@link isPlayerEligibleForStreetBetting} 玩家，{@link PlayerHandSession.transferControlTo}（入队 `turn_handoff`）。
   * 「应进街」仅由 defer 分支入队；其余情况直接同街交权，不再用同一谓词做第二次进街探测。
   * 事件与队列须由上层 drain + 消费节拍驱动。
   * 进入本方法时须 `handSession.activePlayer === this`：自愿行动由 `checkIfCanAct` 保证；贴盲经 `executeBet`/`executeAllIn` 的 `skipTurnValidation` **不**调用 `completeBettingTurn`，首攻仅由 `takeActionInPreFlop` 末尾 `transferControlTo`。
   */
  transferControl() {
    if (this.#handSession.activePlayer !== this) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.INTERNAL_TRANSFER_ACTOR_MISMATCH, {
          actorUserId: this.#userInfo.id,
          activeUserId: this.#handSession.activePlayer?.getUserInfo().id ?? null
        })
      )
    }
    this.#handSession.clearActivePlayerAfterAction(this)

    const shouldEndGame = this.#handSession.tryToEndGame()
    if (shouldEndGame) {
      return
    }
    if (this.#handSession.canDeferBettingRoundStageAdvance()) {
      this.#handSession.requestDeferredStageAdvance()
      return
    }

    // 移交给下一个可以行动的玩家
    const nextPlayerToGetController = this.returnNextPlayerIf((player) =>
      isPlayerEligibleForStreetBetting(player)
    )
    if (!nextPlayerToGetController)
      return this.fail(
        new TexasError(TexasCoreErrorCode.INTERNAL_NO_NEXT_PLAYER)
      )

    this.#handSession.transferControlTo(nextPlayerToGetController)
  }

  __testTakeAction() {
    const actions = this.#getAllowedActions()
    const index = getRandomInt(0, actions.length - 1)
    const act = actions[index]
    const stub = 800
    void (() => {
      switch (act) {
        case ActionTypeEnum.FOLD:
          executeFold(this)
          break
        case ActionTypeEnum.CHECK:
          executeCheck(this)
          break
        case ActionTypeEnum.CALL:
          executeCall(this)
          break
        case ActionTypeEnum.BET:
          executeBet(this, stub)
          break
        case ActionTypeEnum.RAISE:
          executeRaise(this, stub)
          break
        case ActionTypeEnum.ALL_IN:
          executeAllIn(this)
          break
        default: {
          const _e: never = act
          void _e
        }
      }
    })()
  }
  takeDefaultAction() {
    if (TexasEngineContext.simulation().randomPickOnDefaultAction) {
      this.__testTakeAction()
      return
    }
    const allowed = this.#getAllowedActions()
    if (allowed.includes(ActionTypeEnum.CHECK)) {
      executeCheck(this)
    } else {
      executeFold(this)
    }
  }
  continue() {
    if (TexasEngineContext.simulation().immediateDefaultActionOnTurn) {
      void this.takeDefaultAction()
    }
  }
  pause() {
    // 思考权生命周期由 Controller 管理；Player 侧无需额外门闩。
  }

  /**
   * 行动前可下注区间：
   * - max：当前筹码（全下上限）
   * - min：补齐到「其他玩家本轮已下注」的最大值所需筹码；若无需补齐（≤0）则用 `lowestBetAmount`；最后与 max 取小，避免 min > 余额
   */
  getRestrict() {
    const max = this.balance
    const maxOthersStageTotal = this.getMaxOthersStageBet()
    const callGap = maxOthersStageTotal - this.#currentStageTotalAmount
    const rawMin = callGap > 0 ? callGap : this.#stakes.bigBlind

    return {
      min: Math.min(rawMin, max),
      max
    }
  }

  getControl() {
    this.#handSession.recordTurnOffered(this)
    this.continue()
  }

  /** 贴入座大盲后保留一次翻前主动选择权（直到该玩家提交一次自愿行动）。 */
  grantJoiningBlindOption(): void {
    this.#hasJoiningBlindOption = true
  }
}

/**
 * 仍可参与本街思考权轮转（未弃牌、未进入全下终态）。
 * 与 {@link DealerService.getPlayersCanAct} 语义一致，避免多处手写 `out`/`allIn`。
 */
export function isPlayerEligibleForStreetBetting(player: Player): boolean {
  const s = player.getStatus()
  return s !== 'out' && s !== 'allIn'
}

export default Player
