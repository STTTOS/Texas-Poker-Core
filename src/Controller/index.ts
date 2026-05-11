/**
 * 控制本手阶段、奖池结算与领域事件缓冲。
 * 进街与下一位思考权不立即生效：写入 {@link Controller.#pendingFlowOps}，由业务调用
 * {@link applyPendingStageAdvance} / {@link flushPendingTurnHandoff}（或 {@link drainPendingFlowOpsSync}）消费。
 */
import type { Role } from '@/Player/constant'
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
import { Poke } from '@/Deck/constant'
import { Player, RoleEnum } from '../Player'
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
 * - `turn_handoff`：记录待交权目标；消费时才设置 `activePlayer` 并缓冲 `TurnOffered`。
 */
export type PendingFlowOp =
  | { kind: 'stage_advance' }
  | { kind: 'turn_handoff'; toUserId: number }
export type PendingFlowOpKind = PendingFlowOp['kind']

class Controller implements GameComponent, PlayerHandSession<Player> {
  /** 当前一手的状态与摊牌评估 */
  #hand = new CurrentHand()
  #dealer: Dealer
  #pool: Pool
  /** 桌级单调递增；每次 {@link prepareHandTape} 生成新本手 id（`h1`,`h2`,…） */
  #handSerial = 0
  /** 当前本手 id；`prepareHandTape` 起至 `reset()` 清空 */
  #activeHandId: string | null = null
  #handEventSeq = 0
  #handEvents: HandDomainEvent[] = []
  /** 下一条行动完成时的 `TurnEnded.reason`（如超时弃牌）；由 `consumePendingTurnEndedReason` 消费 */
  #pendingTurnEndedReason: TurnEndedReason | null = null
  /** 进街 / 交权由业务或 `drainPendingFlowOpsSync` 消费 */
  #pendingFlowOps: PendingFlowOp[] = []
  /** 暂停前持有思考权的玩家；continue 后会重新入队 handoff。 */
  #pausedActiveUserId: number | null = null
  /** 跑马路分段进街中；至河牌后结算并发 `HandEnded` */
  #runoutMode = false
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

  /** 本手领域事件元数据；须在 {@link prepareHandTape} 之后调用 */
  #eventMeta(): { handId: string; seq: number } {
    if (this.#activeHandId === null) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.INTERNAL_NO_ACTIVE_HAND_ID)
      )
    }
    return { handId: this.#activeHandId, seq: this.#nextSeq() }
  }

  /** 当前本手 id；未经过 `prepareHandTape` 时为 `null` */
  get currentHandId(): string | null {
    return this.#activeHandId
  }

  /**
   * 为本手分配 `handId`、重置本手 `seq` 与事件缓冲；同一物理手上再次调用（如仅 `rearrange`）时为 no-op。
   * 由 {@link Texas#setPlayerRoles} / {@link Texas#dealCards} 在写磁带前调用。
   */
  prepareHandTape(): void {
    if (this.#activeHandId !== null) return
    this.#handSerial += 1
    this.#activeHandId = `h${this.#handSerial}`
    this.#handEventSeq = 0
    this.#handEvents = []
    this.#pendingTurnEndedReason = null
    this.#pendingFlowOps = []
    this.#pausedActiveUserId = null
    this.#runoutMode = false
  }

  recordRolesAssigned(
    players: ReadonlyArray<{
      userId: number
      name: string
      role: Role
      actionIndex: number
    }>
  ): void {
    this.#handEvents.push({
      type: 'RolesAssigned',
      payload: { ...this.#eventMeta(), players: [...players] }
    })
  }

  recordHoleCardsDealt(byUserId: Record<number, Poke[]>): void {
    this.#handEvents.push({
      type: 'HoleCardsDealt',
      payload: { ...this.#eventMeta(), byUserId: { ...byUserId } }
    })
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

  setShowdownEvalForPlayer(player: Player, evalData: ShowdownPlayerEval): void {
    this.#hand.settlement.setPlayerEval(player.id, evalData)
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
    const { id: userId } = player.getUserInfo()
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

  /** 河牌摊牌：`settle` + `end` + `HandEnded(showdown)`（与跑马路最后一跳共用）。 */
  #emitShowdownHandEnded(): void {
    this.#settle()
    this.end()

    const { rankCategory, pokes, rankStrength, rankSignature } =
      this.#hand.settlement.snapshot

    const endStage = this.#hand.stage
    const pokesRevealed = this.getRevealedPokes()
    this.#handEvents.push({
      type: 'HandEnded',
      payload: {
        ...this.#eventMeta(),
        outcome: 'showdown',
        pokesRevealed,
        endStage,
        showHandPokes: true,
        bestPokes: pokes,
        bestRankCategory: rankCategory,
        bestRankSignature: rankSignature,
        bestRankStrength: rankStrength
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

  /**
   * 仅入队 `turn_handoff`，**不**设置 `activePlayer`、不调用 `getControl()`。
   * 下一家的 `TurnOffered` 在 {@link flushPendingTurnHandoff} 消费队头时进入缓冲。
   */
  transferControlTo(player: Player | null) {
    if (!player)
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NO_PLAYER))
    const last = this.#pendingFlowOps[this.#pendingFlowOps.length - 1]
    if (
      last?.kind === 'turn_handoff' &&
      last.toUserId === player.getUserInfo().id
    )
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_DUPLICATE_CONTROL)
      )
    this.#hand.activePlayer = null
    this.#pendingFlowOps.push({
      kind: 'turn_handoff',
      toUserId: player.getUserInfo().id
    })
  }

  clearActivePlayerAfterAction(player: Player): void {
    if (this.#hand.activePlayer !== player) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.INTERNAL_TRANSFER_ACTOR_MISMATCH, {
          actorUserId: player.getUserInfo().id,
          activeUserId: this.#hand.activePlayer?.getUserInfo().id ?? null
        })
      )
    }
    this.#hand.activePlayer = null
  }

  /**
   * 循环：队头为 `stage_advance` 则 {@link applyPendingStageAdvance}，否则 {@link flushPendingTurnHandoff}，直至队列为空。
   * 单测 / 模拟器「零节拍」跑通一手时使用；生产环境通常由业务在 sleep 之间逐步消费。
   */
  drainPendingFlowOpsSync(): void {
    for (;;) {
      const ops = this.getPendingFlowOps()
      if (ops.length === 0) break
      if (ops[0].kind === 'stage_advance') this.applyPendingStageAdvance()
      else this.flushPendingTurnHandoff()
    }
  }

  /** 返回队列快照，不修改队列。 */
  getPendingFlowOps(): PendingFlowOp[] {
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
    this.#pendingFlowOps.push({ kind: 'stage_advance' })
  }

  /**
   * 消费队头 `stage_advance`（否则抛 `CTRL_FLOW_PENDING_MISMATCH`）。
   * - 非跑马路：`#performBettingRoundStageAdvance` → `StageAdvanced(betting_round_complete)` → 再入队首位行动者的 `turn_handoff`。
   * - `#runoutMode`：`#applyOneRunoutRevealStep` → `StageAdvanced(runout_reveal)`；到河牌时顺带 settle、`HandEnded(showdown)`。
   */
  applyPendingStageAdvance(): void {
    if (this.#pendingFlowOps[0]?.kind !== 'stage_advance') {
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
   * 队头为 `turn_handoff` 时 shift，并在此刻真正设置 `activePlayer` 与发出 `TurnOffered`。
   * 队头类型不符、或目标玩家缺失时 **静默 return**（不抛错）。
   */
  flushPendingTurnHandoff(): void {
    const head = this.#pendingFlowOps[0]
    if (head?.kind !== 'turn_handoff') return
    this.#pendingFlowOps.shift()
    const p = this.#dealer.find((it) => it.getUserInfo().id === head.toUserId)
    if (!p) return
    this.#hand.activePlayer = p
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
      advanceKind: 'betting_round_complete' as const
    }
    this.#handEvents.push({
      type: 'StageAdvanced',
      payload: {
        ...this.#eventMeta(),
        ...stagePayload
      }
    })
    this.resetActivePlayer()

    this.transferControlTo(this.#dealer.getTheFirstPlayerToAct())
  }

  /**
   * 摊牌跑马路一步：推进 `stage` 并 `StageAdvanced(runout_reveal)`；到河牌则 settle、`HandEnded`。
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
    const pokes = this.getCommonPokes(from, to)
    this.#handEvents.push({
      type: 'StageAdvanced',
      payload: {
        ...this.#eventMeta(),
        fromStage: from,
        toStage: to,
        pokesRevealedThisStep: pokes,
        advanceKind: 'runout_reveal'
      }
    })
    if (to === StageEnum.RIVER) {
      // 跑马路结束，后续 stage_advance 不得再走 reveal 分支。
      this.#runoutMode = false
      this.#emitShowdownHandEnded()
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
      const endStage = this.#hand.stage
      this.#settle()
      this.end()

      const pokesRevealed = this.getRevealedPokes()
      this.#handEvents.push({
        type: 'HandEnded',
        payload: {
          ...this.#eventMeta(),
          outcome: 'fold_win',
          pokesRevealed,
          endStage,
          showHandPokes: false
        }
      })
      return true
    }

    if (this.shouldShowDown()) {
      if (this.#hand.stage !== StageEnum.RIVER) {
        this.#runoutMode = true
        let from: Stage = this.#hand.stage
        // 计算pending几次跑马
        while (from !== StageEnum.RIVER) {
          this.#pendingFlowOps.push({ kind: 'stage_advance' })
          const index = STAGE_ORDER.findIndex((s) => s === from)
          if (index < 0 || index >= STAGE_ORDER.length - 1) break
          from = STAGE_ORDER[index + 1]
        }
        this.resetActivePlayer()
        return true
      }

      this.#emitShowdownHandEnded()
      return true
    }

    return false
  }

  getCommonPokes(currentStage: Stage, endStage: Stage): Poke[] {
    if (currentStage === endStage) return []

    const commonPokes = this.#dealer.getPokes().commonPokes
    return commonPokes.slice(
      this.#getPokeEndIndex(currentStage),
      this.#getPokeEndIndex(endStage)
    )
  }

  /** 当前手牌阶段下已发出的公牌（翻前 → `#hand.stage`）。 */
  getRevealedPokes(): Poke[] {
    return this.getCommonPokes(StageEnum.PRE_FLOP, this.#hand.stage)
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

  /**
   * 入座大盲入账与池快照；供单条指令与批量开局共用（领域事件由调用方缓冲 `PostedJoiningBigBlinds`）。
   */
  #applyJoiningBigBlindChips(player: Player): {
    userId: number
    amount: number
    requested: number
  } {
    if (this.#hand.status !== 'in_hand') {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_POST_BB_NOT_IN_HAND)
      )
    }
    if (this.#hand.stage !== StageEnum.PRE_FLOP) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_POST_BB_NOT_PREFLOP)
      )
    }
    if (this.#hand.activePlayer === player) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_POST_BB_IS_ACTIVE_PLAYER)
      )
    }
    if (player.getStatus() !== 'eligible') {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_POST_BB_PLAYER_INELIGIBLE)
      )
    }
    if (player.currentStageTotalAmount !== 0) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_POST_BB_ALREADY_CONTRIBUTED)
      )
    }

    const requested = this.#dealer.stakes.bigBlind
    const balanceBefore = player.balance
    if (balanceBefore <= 0) {
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_POST_BB_NO_CHIPS))
    }

    const posted = this.#postBlind(player, requested)
    this.recordPotUpdated()
    return {
      userId: player.getUserInfo().id,
      amount: posted,
      requested
    }
  }

  /**
   * 中途入座贴大盲：翻前、非当前 `activePlayer`、本街 `currentStageTotalAmount === 0`、且玩家仍为 `eligible`。
   * 入池额 `min(桌大盲, 余额)`，与开局盲注路径一致；**不**调用 `completeBettingTurn`、不改变当前思考权。
   */
  postBigBlindForJoiningPlayer(player: Player): void {
    const row = this.#applyJoiningBigBlindChips(player)
    this.#handEvents.push({
      type: 'PostedJoiningBigBlinds',
      payload: {
        ...this.#eventMeta(),
        posts: [row]
      }
    })
  }

  #emitHandStarted(): void {
    this.#handEvents.push({
      type: 'HandStarted',
      payload: this.#eventMeta()
    })
  }

  /** 桌 SB/BB、`BlindsPosted`，再 `transferControlTo(BB.getNext())`（翻前首动）；不含 `HandStarted`。 */
  #postTableBlindsAndFirstPreflopActor(): void {
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
        this.recordPotUpdated()
      }
    })
    this.#handEvents.push({
      type: 'BlindsPosted',
      payload: { ...this.#eventMeta(), posts }
    })

    const [, bigBlind] = takeDefaultActionPlayers
    const activePlayer = bigBlind?.getNextPlayer()
    if (activePlayer) {
      this.transferControlTo(activePlayer)
    } else {
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_START_NO_ACTIVE))
    }
  }

  takeActionInPreFlop(): void {
    this.#emitHandStarted()
    this.#postTableBlindsAndFirstPreflopActor()
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

  /** 进入翻前会话帧（`in_hand` / `PRE_FLOP`、清队列）；须已有 `handId`；**不写**领域事件。 */
  #enterPreflopHandFrame(): void {
    if (this.#activeHandId === null) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.CTRL_START_NO_HAND_PREP)
      )
    }
    this.#pendingTurnEndedReason = null
    this.#pendingFlowOps = []
    this.#pausedActiveUserId = null
    this.#runoutMode = false
    this.#hand.status = 'in_hand'
    this.#hand.stage = StageEnum.PRE_FLOP

    if (TexasEngineContext.simulation().resetDealerBeforeHandStart) {
      this.#dealer.reset()
    }
  }

  /**
   * 进入本手街道阶段：须在 {@link prepareHandTape} 之后调用；不清空已缓冲的 `RolesAssigned` / `HoleCardsDealt`。
   * 写入 `HandStarted`、贴盲与 **`pendingFlowOps` / 跑马路状态**，再 `transferControlTo`（首人思考权先入队，待业务 flush）。
   */
  start(): void {
    this.#enterPreflopHandFrame()
    this.takeActionInPreFlop()
  }

  /**
   * 与 {@link start} 同属一手开局原子路径：先进入翻前帧并 `HandStarted`，再对 `joiningBigBlindUserIds`
   * 依次入账（跳过 SB/BB、环上不存在 id 忽略），其间每条入池后各一条 `PotUpdated`；
   * 最后 **恒** 缓冲一条 {@link PostedJoiningBigBlinds}，`posts` 为本次所有入座大盲（无人须贴时为空数组）；
   * 再贴桌盲并 `transferControlTo(BB.getNext())`。
   * 业务应仅此入口处理「待贴入座大盲」，勿在 `start()` 后再穿插 `PostBigBlind`。
   */
  startPreflopWithJoiningBigBlinds(
    joiningBigBlindUserIds: ReadonlyArray<number>
  ): void {
    this.#enterPreflopHandFrame()
    this.#emitHandStarted()
    const joiningPosts: Array<{
      userId: number
      amount: number
      requested: number
    }> = []
    for (const userId of joiningBigBlindUserIds) {
      const pl = this.#dealer.getById(userId)
      if (!pl) continue
      const role = pl.getRole()
      if (role === RoleEnum.SB || role === RoleEnum.BB) continue
      joiningPosts.push(this.#applyJoiningBigBlindChips(pl))
    }
    this.#handEvents.push({
      type: 'PostedJoiningBigBlinds',
      payload: {
        ...this.#eventMeta(),
        posts: joiningPosts
      }
    })
    this.#postTableBlindsAndFirstPreflopActor()
  }

  continue() {
    if (this.#hand.status !== 'in_hand_paused')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_NOT_PAUSED))

    this.#hand.status = 'in_hand'
    const pausedId = this.#pausedActiveUserId
    this.#pausedActiveUserId = null
    if (pausedId == null) return
    const player = this.#dealer.find((p) => p.getUserInfo().id === pausedId)
    if (!player) return
    this.transferControlTo(player)
  }

  settleRankingsThroughStage(throughStage: Stage) {
    const saved = this.#hand.stage
    this.#hand.stage = throughStage
    try {
      this.#settle()
    } finally {
      this.#hand.stage = saved
    }
  }

  end() {
    if (this.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.CTRL_END_NOT_IN_HAND))

    this.#hand.status = 'between_hands'
    this.resetActivePlayer()
  }

  #settle() {
    const commonPokes = this.getRevealedPokes()
    this.#hand.settlement.settleFromCommonBoard(
      this.#dealer.players,
      this.#dealer.getPlayersStillInGame(),
      commonPokes
    )
  }
  resetActivePlayer() {
    const ap = this.#hand.activePlayer
    if (ap) {
      this.recordTurnEnded(ap.getUserInfo().id, 'control_cleared')
    }
    this.#hand.activePlayer = null
    this.#pausedActiveUserId = null
  }

  reset() {
    this.#pendingTurnEndedReason = null
    this.#pendingFlowOps = []
    this.#pausedActiveUserId = null
    this.#runoutMode = false
    this.#hand.activePlayer = null
    this.#hand.reset()
    this.#handEventSeq = 0
    this.#handEvents = []
    this.#activeHandId = null
  }

  pause() {
    this.#hand.status = 'in_hand_paused'
    const ap = this.activePlayer
    if (ap) {
      this.recordTurnEnded(ap.getUserInfo().id, 'paused')
      this.#pausedActiveUserId = ap.getUserInfo().id
      this.#hand.activePlayer = null
    } else {
      this.#pausedActiveUserId = null
    }
  }
}
export type { ShowdownPlayerEval } from './HandSettlement'
export default Controller
