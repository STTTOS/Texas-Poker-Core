/**
 * 控制本手阶段、奖池结算与领域事件缓冲。
 * 进街与下一位思考权不立即生效：写入 {@link Controller.#pendingFlowOps}，由业务调用
 * {@link applyPendingStageAdvance} / {@link flushPendingTurnHandoff}（或 {@link drainPendingFlowOpsSync}）消费。
 */
import type { ShowdownPlayerEval } from './HandSettlement'
import type { PlayerHandSession } from '@/playerSessionPorts'
import type {
  HandDomainEvent,
  TurnEndedReason
} from '@/domain/handDomainEvents'
import type {
  GameComponent,
  HandLifecycle,
  TexasErrorCallback
} from '@/gameContracts'

import Pool from '../Pool'
import Dealer from '../Dealer'
import { Player } from '../Player'
import { CurrentHand } from '@/Hand/CurrentHand'
import { executeBet } from '../Player/handBettingActions'
import { TexasEngineContext } from '@/TexasEngineContext'
import { StageEnum, type Stage, STAGE_ORDER } from './stage'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

export { StageEnum, type Stage } from './stage'

export type { HandLifecycle }

/**
 * 流程队列项（FIFO）。
 * - `stage_advance`：一轮下注已结束，须再执行一条进街（含 `betting_round_complete` 或跑马路 `runout_reveal`）。
 * - `turn_handoff`：`activePlayer` 已指向下一位，须 `getControl()` 才会缓冲 `TurnOffered`。
 */
export type PendingFlowOpKind = 'stage_advance' | 'turn_handoff'

class Controller implements GameComponent, PlayerHandSession<Player> {
  /** 当前一手的状态与摊牌评估 */
  #hand = new CurrentHand()
  #dealer: Dealer
  #pool: Pool
  /** 桌级单调递增；每次 `start()` 生成新本手 id（`h1`,`h2`,…） */
  #handSerial = 0
  /** 当前本手 id；`start()` 起至 `reset()` 清空 */
  #activeHandId: string | null = null
  #handEventSeq = 0
  #handEvents: HandDomainEvent[] = []
  /** 下一条行动完成时的 `TurnEnded.reason`（如超时弃牌）；由 `consumePendingTurnEndedReason` 消费 */
  #pendingTurnEndedReason: TurnEndedReason | null = null
  /** 进街 / 交权由业务或 `drainPendingFlowOpsSync` 消费 */
  #pendingFlowOps: PendingFlowOpKind[] = []
  /** 跑马路分段进街中；至河牌后结算并发 `HandEnded` */
  #runoutMode = false
  /** 进入跑马路时的 `stage`（写入 `HandEnded.currentStage`） */
  #runoutStageBefore: Stage | null = null
  fail: TexasErrorCallback

  constructor(
    dealer: Dealer,
    pool: Pool,
    fail: TexasErrorCallback = (error) => {
      throw error
    }
  ) {
    this.#dealer = dealer
    this.#pool = pool
    this.fail = fail
  }

  #nextSeq(): number {
    this.#handEventSeq += 1
    return this.#handEventSeq
  }

  /** 本手领域事件元数据；须在 `start()` 之后调用 */
  #eventMeta(): { handId: string; seq: number } {
    if (this.#activeHandId === null) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.INTERNAL_NO_ACTIVE_HAND_ID)
      )
    }
    return { handId: this.#activeHandId, seq: this.#nextSeq() }
  }

  /** 当前本手 id；未开局或未 `start()` 时为 `null` */
  get currentHandId(): string | null {
    return this.#activeHandId
  }

  /** 自上次 drain 以来本手产生的事件（取出后清空本手缓冲） */
  drainHandEvents(): HandDomainEvent[] {
    const out = this.#handEvents
    this.#handEvents = []
    return out
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

  recordPlayerAction(player: Player, options: { emitPot: boolean }): void {
    const action = player.getAction()
    if (!action) return
    this.#handEvents.push({
      type: 'PlayerActed',
      payload: {
        ...this.#eventMeta(),
        userId: player.getUserInfo().id,
        street: this.#hand.stage,
        actionType: action.type,
        amount: action.payload?.value
      }
    })
    if (options.emitPot) this.recordPotUpdated()
  }

  recordPotUpdated(): void {
    const snap = this.#pool.getContributionSnapshot()
    this.#handEvents.push({
      type: 'PotUpdated',
      payload: {
        ...this.#eventMeta(),
        totalAmount: snap.totalAmount,
        contributions: snap.contributions
      }
    })
  }

  recordTurnOffered(player: Player): void {
    const allowedActions = [...player.getAllowedActions()]
    const restrict = player.getRestrict()
    const { id: userId, name } = player.getUserInfo()
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'got_control',
      data: { userId, name }
    })
    this.#handEvents.push({
      type: 'TurnOffered',
      payload: {
        ...this.#eventMeta(),
        userId,
        street: this.#hand.stage,
        allowedActions,
        restrict
      }
    })
  }

  /** 本轮是否已无人可再行动（下注轮可结束）。 */
  #everyPlayerNonActionableForRound(): boolean {
    return this.#dealer.every((pl) => !pl.actionable())
  }

  /** 河牌摊牌：`settle` + `end` + `HandEnded(showdown)` + trace（与跑马路最后一跳共用）。 */
  #emitShowdownHandEnded(stageForCurrentPayload: Stage): void {
    this.#settle()
    this.end()

    const { rankCategory, pokes, rankStrength } = this.#hand.settlement.snapshot

    const pokesRevealed = this.getCommonPokes(
      StageEnum.PRE_FLOP,
      this.#hand.boardThroughStage
    )
    this.#handEvents.push({
      type: 'HandEnded',
      payload: {
        ...this.#eventMeta(),
        outcome: 'showdown',
        pokesRevealed,
        currentStage: stageForCurrentPayload,
        endStage: this.#hand.boardThroughStage,
        showHandPokes: true,
        bestPokes: pokes,
        bestRankCategory: rankCategory,
        bestRankStrength: rankStrength
      }
    })
    TexasEngineContext.emitTrace({
      channel: 'controller',
      name: 'hand_end_showdown',
      data: {
        lastActionStage: stageForCurrentPayload,
        boardThroughStage: this.#hand.boardThroughStage
      }
    })
  }

  recordTurnEnded(userId: number, reason: TurnEndedReason): void {
    this.#handEvents.push({
      type: 'TurnEnded',
      payload: { ...this.#eventMeta(), userId, reason }
    })
  }

  setPendingTurnEndedReason(reason: TurnEndedReason): void {
    this.#pendingTurnEndedReason = reason
  }

  consumePendingTurnEndedReason(): TurnEndedReason | null {
    const r = this.#pendingTurnEndedReason
    this.#pendingTurnEndedReason = null
    return r
  }

  recordPotAwarded(
    potTotal: number,
    allocations: Array<{ userId: number; amount: number }>
  ): void {
    this.#handEvents.push({
      type: 'PotAwarded',
      payload: {
        ...this.#eventMeta(),
        potTotal,
        allocations
      }
    })
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
   * - 场上只剩 out / allIn（无 eligible）=> 直接结束（可能发生在任意街：多人全下）
   * - 河牌圈且所有仍可行动玩家都不可 actionable（即便 status 仍为 eligible）=> 结束
   */
  shouldShowDown(): boolean {
    const playersCanAct = this.#dealer.getPlayersCanAct()

    return (
      playersCanAct.length === 0 ||
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
   * 仅设置 `activePlayer` 并入队 `turn_handoff`，**不**调用 `getControl()`。
   * 下一家的 `TurnOffered` 在 {@link flushPendingTurnHandoff} 成功消费队头后进入缓冲。
   */
  transferControlTo(player: Player | null) {
    if (!player)
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NO_PLAYER))
    if (this.#hand.activePlayer === player)
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_DUPLICATE_CONTROL)
      )

    this.#hand.activePlayer = player
    this.#pendingFlowOps.push('turn_handoff')
  }

  /**
   * 循环：队头为 `stage_advance` 则 {@link applyPendingStageAdvance}，否则 {@link flushPendingTurnHandoff}，直至队列为空。
   * 单测 / 模拟器「零节拍」跑通一手时使用；生产环境通常由业务在 sleep 之间逐步消费。
   */
  drainPendingFlowOpsSync(): void {
    for (;;) {
      const ops = this.getPendingFlowOps()
      if (ops.length === 0) break
      if (ops[0] === 'stage_advance') this.applyPendingStageAdvance()
      else this.flushPendingTurnHandoff()
    }
  }

  /** 返回队列快照，不修改队列。 */
  getPendingFlowOps(): PendingFlowOpKind[] {
    return [...this.#pendingFlowOps]
  }

  /**
   * 当且仅当：全员本轮不可再行动 **且** 当前街仍可进到下一街（未到河牌）。
   * 为 true 时 {@link Player.transferControl} 会 {@link requestDeferredStageAdvance} 而非同步进街。
   */
  canDeferBettingRoundStageAdvance(): boolean {
    if (!this.#everyPlayerNonActionableForRound()) return false
    const index = STAGE_ORDER.findIndex((stage) => stage === this.#hand.stage)
    return index >= 0 && index < STAGE_ORDER.length - 1
  }

  /** 将「待进街」入队；实际推进由 {@link applyPendingStageAdvance} 执行。 */
  requestDeferredStageAdvance(): void {
    this.#pendingFlowOps.push('stage_advance')
  }

  /**
   * 消费队头 `stage_advance`（否则抛 `CTRL_FLOW_PENDING_MISMATCH`）。
   * - 非跑马路：`#performBettingRoundStageAdvance` → `StageAdvanced(betting_round_complete)` → 再入队首位行动者的 `turn_handoff`。
   * - `#runoutMode`：`#applyOneRunoutRevealStep` → `StageAdvanced(runout_reveal)`；到河牌时顺带 settle、`HandEnded(showdown)`。
   */
  applyPendingStageAdvance(): void {
    if (this.#pendingFlowOps[0] !== 'stage_advance') {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_FLOW_PENDING_MISMATCH)
      )
    }
    this.#pendingFlowOps.shift()
    if (this.#runoutMode) {
      this.#applyOneRunoutRevealStep()
      return
    }
    this.#performBettingRoundStageAdvance()
  }

  /**
   * 队头为 `turn_handoff` 时 shift 并 `activePlayer.getControl()`（写入 `TurnOffered`）。
   * 队头类型不符、或 `activePlayer` 缺失时 **静默 return**（不抛错）。
   * 若该玩家 {@link Player.hasEmittedTurnOffer} 已为 true，同样静默 return：挡的是队列里多余的连续 `turn_handoff`
   *（实现 bug、快照/回放错误等），而非「业务重复 flush」——后者第二次调用时队头通常已非 `turn_handoff`。
   */
  flushPendingTurnHandoff(): void {
    if (this.#pendingFlowOps[0] !== 'turn_handoff') return
    this.#pendingFlowOps.shift()
    const p = this.#hand.activePlayer
    if (!p || p.hasEmittedTurnOffer()) return
    p.getControl()
  }

  /**
   * 下注轮结束后的单步进街：`StageAdvanced(betting_round_complete)`，再 {@link transferControlTo} 首位行动者。
   */
  #performBettingRoundStageAdvance(): void {
    if (!this.#everyPlayerNonActionableForRound()) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_FLOW_PENDING_MISMATCH)
      )
    }
    const index = STAGE_ORDER.findIndex((stage) => stage === this.#hand.stage)
    if (index < 0 || index >= STAGE_ORDER.length - 1) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_FLOW_PENDING_MISMATCH)
      )
    }

    const currentStage = this.#hand.stage
    const nextStage = STAGE_ORDER[index + 1]

    this.#hand.stage = nextStage
    this.#dealer.resetCurrentStageTotalAmount()
    this.#dealer.resetActionsOfPlayers()
    this.#dealer.resetActionsHistory()

    const stagePayload = {
      fromStage: currentStage,
      toStage: nextStage,
      pokesRevealedThisStep: this.getCommonPokes(currentStage, nextStage),
      boardThroughStageAfter: nextStage,
      advanceKind: 'betting_round_complete' as const
    }
    this.#handEvents.push({
      type: 'StageAdvanced',
      payload: {
        ...this.#eventMeta(),
        ...stagePayload
      }
    })
    TexasEngineContext.emitTrace({
      channel: 'controller',
      name: 'stage_changed',
      data: {
        from: currentStage,
        to: nextStage,
        byUserId: this.#hand.activePlayer?.getUserInfo().id
      }
    })
    this.resetActivePlayer()

    this.transferControlTo(this.#dealer.getTheFirstPlayerToAct())
  }

  /**
   * 摊牌跑马路一步：推进 `stage`/`boardThroughStage` 并 `StageAdvanced(runout_reveal)`；到河牌则 settle、`HandEnded`。
   */
  #applyOneRunoutRevealStep(): void {
    const index = STAGE_ORDER.findIndex((s) => s === this.#hand.stage)
    if (index < 0 || index >= STAGE_ORDER.length - 1) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_FLOW_PENDING_MISMATCH)
      )
    }
    const from = this.#hand.stage
    const to = STAGE_ORDER[index + 1]
    this.#hand.stage = to
    this.#hand.boardThroughStage = to
    const pokes = this.getCommonPokes(from, to)
    this.#handEvents.push({
      type: 'StageAdvanced',
      payload: {
        ...this.#eventMeta(),
        fromStage: from,
        toStage: to,
        pokesRevealedThisStep: pokes,
        boardThroughStageAfter: to,
        advanceKind: 'runout_reveal'
      }
    })
    if (to === StageEnum.RIVER) {
      // 跑马路结束，后续 stage_advance 不得再走 reveal 分支。
      this.#runoutMode = false
      const stageBeforeRunout = this.#runoutStageBefore ?? from
      this.#runoutStageBefore = null
      this.#emitShowdownHandEnded(stageBeforeRunout)
    }
  }

  /**
   * 尝试收局。返回 `true` 表示本方法已处理终局逻辑（或已入队跑马路，不再向下传递控制权）。
   * - 独赢弃牌：同步 settle + `HandEnded(fold_win)`。
   * - 摊牌且 **非河牌**：`#runoutMode`、多条 `stage_advance` 入队、`resetActivePlayer`，**无**当场 `HandEnded`。
   * - 摊牌且 **已在河牌**：同步 settle + `HandEnded(showdown)`。
   */
  tryToEndGame() {
    if (this.#isWinByExclusiveFold()) {
      this.#hand.boardThroughStage = this.#hand.stage
      this.#settle()
      this.end()

      const pokesRevealed = this.getCommonPokes(
        StageEnum.PRE_FLOP,
        this.#hand.boardThroughStage
      )
      this.#handEvents.push({
        type: 'HandEnded',
        payload: {
          ...this.#eventMeta(),
          outcome: 'fold_win',
          pokesRevealed,
          currentStage: this.#hand.stage,
          endStage: this.#hand.boardThroughStage,
          showHandPokes: false
        }
      })
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
      const stageBeforeRunout = this.#hand.stage

      if (this.#hand.stage !== StageEnum.RIVER) {
        this.#runoutMode = true
        this.#runoutStageBefore = stageBeforeRunout
        let from: Stage = this.#hand.stage
        // 计算pending几次跑马
        while (from !== StageEnum.RIVER) {
          this.#pendingFlowOps.push('stage_advance')
          const index = STAGE_ORDER.findIndex((s) => s === from)
          if (index < 0 || index >= STAGE_ORDER.length - 1) break
          from = STAGE_ORDER[index + 1]
        }
        this.resetActivePlayer()
        return true
      }
      this.#hand.boardThroughStage = StageEnum.RIVER

      this.#emitShowdownHandEnded(stageBeforeRunout)
      return true
    }

    return false
  }

  getCommonPokes(currentStage: Stage, endStage: Stage) {
    if (currentStage === endStage) return []

    const commonPokes = this.#dealer.getPokes().commonPokes
    return commonPokes.slice(
      this.#getPokeEndIndex(currentStage),
      this.#getPokeEndIndex(endStage)
    )
  }

  /** 翻前强制贴盲：实际入池 `min(规定额, 当前余额)`，与盲注路径 `executeBet` 一致。 */
  #postBlind(player: Player, requested: number): number {
    const balanceBefore = player.balance
    const posted = Math.min(requested, balanceBefore)
    void executeBet(player, posted, true, true)
    this.#hand.defaultBets.push({
      userId: player.getUserInfo().id,
      balance: balanceBefore - posted,
      amount: posted
    })
    return posted
  }

  takeActionInPreFlop() {
    this.#handEvents.push({
      type: 'HandStarted',
      payload: this.#eventMeta()
    })

    const takeDefaultActionPlayers = this.#getSmallBindAndBigBind()
    const posts: Array<{ userId: number; amount: number; kind: 'sb' | 'bb' }> =
      []
    takeDefaultActionPlayers.forEach((player, index) => {
      if (player) {
        const requested =
          index === 0
            ? this.#dealer.stakes.smallBlind
            : this.#dealer.stakes.bigBlind
        const kind = index === 0 ? 'sb' : 'bb'
        const posted = this.#postBlind(player, requested)
        posts.push({
          userId: player.getUserInfo().id,
          amount: posted,
          kind
        })
      }
    })
    this.#handEvents.push({
      type: 'BlindsPosted',
      payload: { ...this.#eventMeta(), posts }
    })
    this.recordPotUpdated()

    const [, bigBlind] = takeDefaultActionPlayers
    const activePlayer = bigBlind?.getNextPlayer()
    if (activePlayer) {
      this.transferControlTo(activePlayer)
    } else {
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_START_NO_ACTIVE))
    }
  }

  #getSmallBindAndBigBind() {
    const smallBind =
      this.#dealer.count === 2
        ? this.#dealer.button
        : this.#dealer.button?.getNextPlayer()

    const result = [smallBind, smallBind?.getNextPlayer()]
    if (result.some((player) => !player))
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_SB_BB_MISSING))
    return result
  }

  /**
   * 新开一手：分配 `handId`、清空事件与 **`pendingFlowOps` / 跑马路状态**，执行贴盲后 `transferControlTo`（首人思考权在队头 `turn_handoff`）。
   */
  start() {
    this.#handSerial += 1
    this.#activeHandId = `h${this.#handSerial}`
    this.#handEventSeq = 0
    this.#handEvents = []
    this.#pendingTurnEndedReason = null
    this.#pendingFlowOps = []
    this.#runoutMode = false
    this.#runoutStageBefore = null
    this.#hand.status = 'in_hand'
    this.#hand.stage = StageEnum.PRE_FLOP
    this.#hand.boardThroughStage = StageEnum.PRE_FLOP

    if (TexasEngineContext.simulation().resetDealerBeforeHandStart) {
      this.#dealer.reset()
    }

    this.takeActionInPreFlop()
  }

  continue() {
    if (this.#hand.status !== 'in_hand_paused')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NOT_PAUSED))

    this.#hand.status = 'in_hand'
    const ap = this.#hand.activePlayer
    ap?.restoreDispatchLatchAfterPause()
    ap?.continue()
  }

  settleRankingsThroughStage(throughStage: Stage) {
    this.#hand.boardThroughStage = throughStage
    this.#settle()
  }

  end() {
    if (this.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_END_NOT_IN_HAND))

    this.#hand.status = 'between_hands'
    this.resetActivePlayer()
  }

  #settle() {
    const commonPokesWhenGameEnd = this.getCommonPokesWhenGameEnd()
    this.#hand.settlement.settleFromCommonBoard(
      this.#dealer.players,
      this.#dealer.getPlayersStillInGame(),
      commonPokesWhenGameEnd
    )
  }
  resetActivePlayer() {
    const ap = this.#hand.activePlayer
    if (ap) {
      if (ap.hasEmittedTurnOffer()) {
        this.recordTurnEnded(ap.getUserInfo().id, 'control_cleared')
      }
      ap.removeControl()
    }
    this.#hand.activePlayer = null
  }

  reset() {
    this.#pendingTurnEndedReason = null
    this.#pendingFlowOps = []
    this.#runoutMode = false
    this.#runoutStageBefore = null
    const ap = this.#hand.activePlayer
    if (ap) {
      ap.removeControl()
    }
    this.#hand.activePlayer = null
    this.#hand.reset()
    this.#handEventSeq = 0
    this.#handEvents = []
    this.#activeHandId = null
  }

  pause() {
    this.#hand.status = 'in_hand_paused'
    const ap = this.activePlayer
    if (ap && ap.hasEmittedTurnOffer()) {
      this.recordTurnEnded(ap.getUserInfo().id, 'paused')
    }
    ap?.pause()
  }
}
export type { ShowdownPlayerEval } from './HandSettlement'
export default Controller
