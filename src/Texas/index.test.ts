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

    texas.setPlayerRoles()
    const roleEv = texas.drainDomainEvents()
    expect(roleEv.length).toBe(1)
    expect(roleEv[0].type).toBe('RolesAssigned')
    expect(
      roleEv[0].type === 'RolesAssigned' && roleEv[0].payload.players.length
    ).toBeGreaterThanOrEqual(2)

    teardownTexas = texas
    texas.start()
    texas.flushAllPendingFlowOps()
    const afterStart = texas.drainDomainEvents()
    expect(texas.controller.currentHandId).toBe('h1')
    expect(
      afterStart.some(
        (e) =>
          'handId' in (e as { payload: { handId?: string } }).payload &&
          (e as { payload: { handId: string } }).payload.handId === 'h1'
      )
    ).toBe(true)

    texas.dealCards()
    const dealEv = texas.drainDomainEvents()
    expect(dealEv.length).toBe(1)
    expect(dealEv[0].type).toBe('HoleCardsDealt')
    const hole =
      dealEv[0].type === 'HoleCardsDealt' ? dealEv[0].payload.byUserId : {}
    expect(Object.keys(hole).length).toBeGreaterThanOrEqual(2)
    expect(
      Object.values(hole).every((h) => Array.isArray(h) && h.length === 2)
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

    texas.setPlayerRoles()
    const ev = texas.drainDomainEvents()
    expect(ev.some((e) => e.type === 'RolesAssigned')).toBe(true)
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
    texas.drainDomainEvents()
    teardownTexas = texas
    texas.start()
    texas.drainDomainEvents()
    texas.flushAllPendingFlowOps()
    texas.dealCards()
    texas.drainDomainEvents()

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
    texas.settle()
    const payEv = texas.drainDomainEvents()
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
    texas.drainDomainEvents()
    teardownTexas = texas
    texas.start()
    texas.drainDomainEvents()
    texas.flushAllPendingFlowOps()
    texas.dealCards()
    texas.drainDomainEvents()

    const firstPf = texas.controller.activePlayer!
    texas.dispatchCommand({
      type: 'Call',
      playerId: firstPf.getUserInfo().id
    })
    texas.drainDomainEvents()
    texas.flushAllPendingFlowOps()
    const secondPf = texas.controller.activePlayer!
    texas.dispatchCommand({
      type: 'Check',
      playerId: secondPf.getUserInfo().id
    })
    texas.drainDomainEvents()
    texas.flushAllPendingFlowOps()

    expect(texas.controller.stage).toBe(StageEnum.FLOP)
    const firstOnFlop = texas.controller.activePlayer!
    expect(firstOnFlop).toBeDefined()

    texas.dispatchCommand({
      type: 'CheckDueToTimeout',
      playerId: firstOnFlop.getUserInfo().id
    })
    const uid = firstOnFlop.getUserInfo().id
    const ev = texas.drainDomainEvents()
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
      texas.drainDomainEvents()
      teardownTexas = texas
      texas.start()
      const afterStart = texas.drainDomainEvents()
      expect(afterStart.some((e) => e.type === 'TurnOffered')).toBe(false)
      expect(texas.getPendingFlowOps()).toEqual(['turn_handoff'])

      texas.flushPendingTurnHandoff()
      const afterFlush = texas.drainDomainEvents()
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
    texas.drainDomainEvents()
    teardownTexas = texas
    texas.start()
    texas.drainDomainEvents()
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

    texas.flushPendingTurnHandoff()
    texas.drainDomainEvents()
    expect(() =>
      texas.dispatchCommand({ type: 'Fold', playerId: ap.getUserInfo().id })
    ).not.toThrow()
  })
})
