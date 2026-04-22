import Texas from '@/Texas'
import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

describe('entery', () => {
  let teardownTexas: Texas | null = null
  afterEach(() => {
    try {
      teardownTexas?.reset()
    } catch {
      /* noop */
    }
    teardownTexas = null
  })

  test('game start and settle successfully', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'ycr' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'yt' })
    const p3 = texas.createPlayer({ id: 3, name: 'wyz' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.dealer.setButton(p1)

    const roleEv = texas.setPlayerRoles()
    expect(roleEv.length).toBe(1)
    expect(roleEv[0].type).toBe('RolesAssigned')
    expect(roleEv[0].payload.handId).toBe('h1')
    expect(roleEv[0].payload.seq).toBe(1)
    expect(
      roleEv[0].type === 'RolesAssigned' && roleEv[0].payload.players.length
    ).toBeGreaterThanOrEqual(2)

    teardownTexas = texas
    const dealEv = texas.dealCards()
    expect(dealEv.length).toBe(1)
    expect(dealEv[0].type).toBe('HoleCardsDealt')
    expect(dealEv[0].payload.handId).toBe('h1')
    expect(dealEv[0].payload.seq).toBe(2)
    const hole =
      dealEv[0].type === 'HoleCardsDealt' ? dealEv[0].payload.byUserId : {}
    expect(Object.keys(hole).length).toBeGreaterThanOrEqual(2)
    expect(
      Object.values(hole).every((h) => Array.isArray(h) && h.length === 2)
    ).toBe(true)

    const afterStart = [...texas.start(), ...texas.flushAllPendingFlowOps()]
    expect(texas.controller.currentHandId).toBe('h1')
    expect(
      afterStart.some(
        (e) =>
          'handId' in (e as { payload: { handId?: string } }).payload &&
          (e as { payload: { handId: string } }).payload.handId === 'h1'
      )
    ).toBe(true)

    expect(() => texas.setPlayerRoles()).toThrow('玩家位置已确认,请勿重复设置')
    expect(() => texas.start()).toThrow('游戏已经开始, 请勿重复开始游戏')

    texas.controller.end()
    texas.controller.settleRankingsThroughStage(StageEnum.RIVER)
    texas.settle()
    texas.reset()
    expect(p1.balance + p2.balance + p3.balance).toEqual(15_000)
  })

  test('setPlayerRoles allows short stack below big blind (NL short stack)', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.join(p2)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.dealer.setButton(texas.room.owner)
    p2.balance = 400

    const ev = texas.setPlayerRoles()
    expect(ev.some((e) => e.type === 'RolesAssigned')).toBe(true)
  })

  test('Texas.reArrangeRoles delegates to dealer', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.join(p2)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.setPlayerRoles()
    expect(() => texas.reArrangeRoles()).not.toThrow()
    teardownTexas = texas
  })

  test("setPlayerRoles('rearrange') after initial still emits RolesAssigned", () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.join(p2)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.setPlayerRoles('initial')
    const ev = texas.setPlayerRoles('rearrange')
    expect(ev.length).toBe(1)
    expect(ev[0].type).toBe('RolesAssigned')
    teardownTexas = texas
  })

  test('rotateRolesForNewHand after reset moves dealer button (2-handed)', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.join(p2)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.setPlayerRoles('initial')
    const beforeId = texas.dealer.button!.getUserInfo().id
    texas.reset()
    texas.rotateRolesForNewHand()
    expect(texas.room.status).toBe('seats_open')
    expect(texas.dealer.button!.getUserInfo().id).not.toBe(beforeId)
    teardownTexas = texas
  })

  test('PostBigBlind posts table BB for eligible non-actor with zero preflop contribution', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 9,
      initialChips: 10_000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    const p4 = texas.createPlayer({ id: 4, name: 'd' })
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.join(p4)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.room.seat(p4)
    texas.setPlayerRoles('initial')
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]

    const ap = texas.controller.activePlayer!
    const subject = texas.dealer.players.find(
      (p) => p !== ap && p.currentStageTotalAmount === 0
    )
    expect(subject).toBeDefined()
    const potBefore = texas.pool.totalAmount
    const handEv = texas.dispatchCommand({
      type: 'PostBigBlind',
      playerId: subject!.getUserInfo().id
    })
    const postedEv = handEv.find((e) => e.type === 'PostedBigBlind')
    expect(postedEv?.type).toBe('PostedBigBlind')
    if (postedEv?.type === 'PostedBigBlind') {
      expect(postedEv.payload.amount).toBe(500)
      expect(postedEv.payload.requested).toBe(500)
    }
    expect(texas.pool.totalAmount).toBe(potBefore + 500)
    teardownTexas = texas
  })

  test('PostBigBlind rejects for current activePlayer', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 9,
      initialChips: 10_000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    const p4 = texas.createPlayer({ id: 4, name: 'd' })
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.join(p4)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.room.seat(p4)
    texas.setPlayerRoles('initial')
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    const ap = texas.controller.activePlayer!
    let err: TexasError | null = null
    try {
      texas.dispatchCommand({
        type: 'PostBigBlind',
        playerId: ap.getUserInfo().id
      })
    } catch (e) {
      err = e as TexasError
    }
    expect(err?.code).toBe(TexasCoreErrorCode.CTRL_POST_BB_IS_ACTIVE_PLAYER)
    teardownTexas = texas
  })

  test('FoldDueToLeave: non-active player is rejected', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 9,
      initialChips: 10_000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    const p4 = texas.createPlayer({ id: 4, name: 'd' })
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.join(p4)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.room.seat(p4)
    texas.setPlayerRoles('initial')
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]

    const ap = texas.controller.activePlayer!
    const leaver = texas.dealer.players.find((p) => p !== ap)!
    expect(leaver.getStatus()).toBe('eligible')
    let err: TexasError | null = null
    try {
      texas.dispatchCommand({
        type: 'FoldDueToLeave',
        playerId: leaver.getUserInfo().id
      })
    } catch (e) {
      err = e as TexasError
    }
    expect(err?.code).toBe(TexasCoreErrorCode.PLAYER_DISPATCH_NOT_ACTOR)
    expect(leaver.getStatus()).toBe('eligible')
    expect(texas.controller.status).toBe('in_hand')
    teardownTexas = texas
  })

  test('FoldDueToLeave: active player yields TurnEnded reason leave', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 9,
      initialChips: 10_000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.setPlayerRoles('initial')
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    const ap = texas.controller.activePlayer!
    const ev = [
      ...texas.dispatchCommand({
        type: 'FoldDueToLeave',
        playerId: ap.getUserInfo().id
      }),
      ...texas.flushAllPendingFlowOps()
    ]
    const ended = ev.find((e) => e.type === 'TurnEnded')
    expect(
      ended &&
        ended.type === 'TurnEnded' &&
        ended.payload.userId === ap.getUserInfo().id &&
        ended.payload.reason === 'leave'
    ).toBe(true)
    teardownTexas = texas
  })

  test('FoldDueToLeave: heads-up non-active is rejected', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 9,
      initialChips: 10_000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.join(p2)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.setPlayerRoles('initial')
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    const ap = texas.controller.activePlayer!
    const other = texas.dealer.players.find((p) => p !== ap)!
    let err: TexasError | null = null
    try {
      texas.dispatchCommand({
        type: 'FoldDueToLeave',
        playerId: other.getUserInfo().id
      })
    } catch (e) {
      err = e as TexasError
    }
    expect(err?.code).toBe(TexasCoreErrorCode.PLAYER_DISPATCH_NOT_ACTOR)
    expect(texas.controller.status).toBe('in_hand')
    teardownTexas = texas
  })

  test('canFoldDueToLeave mirrors FoldDueToLeave preconditions', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 9,
      initialChips: 10_000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    const p4 = texas.createPlayer({ id: 4, name: 'd' })
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.join(p4)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.room.seat(p4)
    texas.setPlayerRoles('initial')
    expect(texas.canFoldDueToLeave(99999)).toBe(false)
    expect(texas.canFoldDueToLeave(texas.room.owner.getUserInfo().id)).toBe(
      false
    )
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    const ap = texas.controller.activePlayer!
    const passive = texas.dealer.players.find((p) => p !== ap)!
    expect(texas.canFoldDueToLeave(ap.getUserInfo().id)).toBe(true)
    expect(texas.canFoldDueToLeave(passive.getUserInfo().id)).toBe(false)
    teardownTexas = texas
  })

  test('dispatchCommand rejects non-actor; settle emits PotAwarded', async () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.dealer.setButton(p1)
    texas.setPlayerRoles()
    teardownTexas = texas
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]

    const actor = texas.controller.activePlayer!
    const notActor = texas.dealer.players.find((p) => p !== actor)!
    let dispatchErr: TexasError | null = null
    try {
      texas.dispatchCommand({
        type: 'Fold',
        playerId: notActor.getUserInfo().id
      })
    } catch (e) {
      dispatchErr = e as TexasError
    }
    expect(dispatchErr).toBeInstanceOf(TexasError)
    expect(dispatchErr!.code).toBe(TexasCoreErrorCode.PLAYER_DISPATCH_NOT_ACTOR)

    texas.controller.end()
    texas.controller.settleRankingsThroughStage(StageEnum.RIVER)
    const payEv = texas.settle()
    expect(payEv.some((e) => e.type === 'PotAwarded')).toBe(true)
    const pot = payEv.find((e) => e.type === 'PotAwarded')
    expect(
      pot && pot.type === 'PotAwarded' && pot.payload.allocations.length
    ).toBeGreaterThan(0)
  })

  test('CheckDueToTimeout yields TurnEnded reason timeout on flop', async () => {
    const texas = new Texas({
      lowestBetAmount: 1000,
      maximumCountOfPlayers: 7,
      initialChips: 50_000,
      user: { id: 1, name: 'a' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.seat(p2)
    texas.dealer.setButton(p1)
    texas.setPlayerRoles()
    teardownTexas = texas
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]

    const firstPf = texas.controller.activePlayer!
    void texas.dispatchCommand({
      type: 'Call',
      playerId: firstPf.getUserInfo().id
    })
    void texas.flushAllPendingFlowOps()
    const secondPf = texas.controller.activePlayer!
    void texas.dispatchCommand({
      type: 'Check',
      playerId: secondPf.getUserInfo().id
    })
    void texas.flushAllPendingFlowOps()

    expect(texas.controller.stage).toBe(StageEnum.FLOP)
    const firstOnFlop = texas.controller.activePlayer!
    expect(firstOnFlop).toBeDefined()

    const uid = firstOnFlop.getUserInfo().id
    const ev = texas.dispatchCommand({
      type: 'CheckDueToTimeout',
      playerId: uid
    })
    const turnEnded = ev.find(
      (e) =>
        e.type === 'TurnEnded' &&
        e.payload.userId === uid &&
        e.payload.reason === 'timeout'
    )
    expect(turnEnded).toBeDefined()
    const acted = ev.find(
      (e) =>
        e.type === 'PlayerActed' &&
        e.payload.userId === uid &&
        e.payload.actionType === ActionTypeEnum.CHECK
    )
    expect(acted).toBeDefined()
  })

  test('pendingFlowOps: TurnOffered only after flushPendingTurnHandoff', () => {
    try {
      const texas = new Texas({
        lowestBetAmount: 500,
        maximumCountOfPlayers: 7,
        initialChips: 5000,
        user: { id: 1, name: 'ycr' }
      })
      const p1 = texas.room.owner
      const p2 = texas.createPlayer({ id: 2, name: 'yt' })
      const p3 = texas.createPlayer({ id: 3, name: 'wyz' })
      texas.room.seat(p1)
      texas.room.join(p2)
      texas.room.join(p3)
      texas.room.seat(p2)
      texas.room.seat(p3)
      texas.dealer.setButton(p1)
      texas.setPlayerRoles()
      teardownTexas = texas
      texas.dealCards()
      const afterStart = texas.start()
      expect(afterStart.some((e) => e.type === 'TurnOffered')).toBe(false)
      expect(texas.getPendingFlowOps()).toEqual(['turn_handoff'])

      const afterFlush = texas.flushPendingTurnHandoff()
      expect(afterFlush.some((e) => e.type === 'TurnOffered')).toBe(true)
      expect(texas.getPendingFlowOps()).toEqual([])
    } finally {
      TexasEngineContext.reset()
    }
  })

  test('dispatchCommand rejects voluntary act before flushPendingTurnHandoff (no HTTP抢跑)', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.dealer.setButton(p1)
    texas.setPlayerRoles()
    teardownTexas = texas
    texas.dealCards()
    void texas.start()
    expect(texas.getPendingFlowOps()).toEqual(['turn_handoff'])

    const ap = texas.controller.activePlayer!
    let beforeFlushErr: TexasError | undefined
    try {
      texas.dispatchCommand({ type: 'Fold', playerId: ap.getUserInfo().id })
    } catch (e) {
      beforeFlushErr = e as TexasError
    }
    expect(beforeFlushErr?.code).toBe(
      TexasCoreErrorCode.PLAYER_DISPATCH_TURN_NOT_OFFERED
    )

    void texas.flushPendingTurnHandoff()
    expect(() =>
      texas.dispatchCommand({ type: 'Fold', playerId: ap.getUserInfo().id })
    ).not.toThrow()
  })
})
