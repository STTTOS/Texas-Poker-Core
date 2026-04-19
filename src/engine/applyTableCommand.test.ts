import Texas from '@/Texas'
import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player/constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import {
  applyTableCommand,
  applyTableCommandThenFlushAllPendingFlowOps
} from './applyTableCommand'
import {
  flatConcatDomainEvents,
  reducePotFromDomainEvents,
  reduceHandIdFromFirstHandStarted,
  reduceLastHandEndedFromDomainEvents,
  reduceCommunityBoardFromDomainEvents,
  reduceLastPotAwardedFromDomainEvents,
  reduceTurnEndedTrailFromDomainEvents,
  reduceLastTurnOfferedFromDomainEvents,
  reduceLastBlindsPostedFromDomainEvents,
  reducePlayerActedTrailFromDomainEvents,
  reduceLastRolesAssignedFromDomainEvents,
  reduceLastStageAdvancedFromDomainEvents
} from './domainEventReadModel'

describe('applyTableCommand (facade toward apply state and events)', () => {
  let teardown: Texas | undefined

  afterEach(() => {
    teardown?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
    teardown = undefined
  })

  test('returns events and snapshotAfter without extra I/O', () => {
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
    teardown = texas
    void texas.start()
    void texas.flushPendingTurnHandoff()

    const ap = texas.controller.activePlayer!
    const uid = ap.getUserInfo().id
    const { events, snapshotAfter } = applyTableCommand(texas, {
      type: 'Fold',
      playerId: uid
    })

    expect(
      events.some(
        (e) =>
          e.type === 'PlayerActed' &&
          e.payload.userId === uid &&
          e.payload.actionType === ActionTypeEnum.FOLD
      )
    ).toBe(true)
    const row = snapshotAfter.players.find((r) => r.userId === uid)
    expect(row?.status).toBe('out')
  })

  test('PotUpdated projection matches snapshot pot (events vs read model)', () => {
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
    teardown = texas
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    texas.dealCards()

    const first = texas.controller.activePlayer!
    const { events, snapshotAfter } = applyTableCommand(texas, {
      type: 'Call',
      playerId: first.getUserInfo().id
    })

    expect(events.some((e) => e.type === 'PotUpdated')).toBe(true)
    expect(texas.controller.stage).toBe(StageEnum.PRE_FLOP)
    const fromEvents = reducePotFromDomainEvents(events)
    expect(fromEvents.totalAmount).toBe(snapshotAfter.potTotal)
    const key = (c: Readonly<{ userId: number; amount: number }>) =>
      `${c.userId}:${c.amount}`
    expect(new Set(fromEvents.contributions.map(key))).toEqual(
      new Set(snapshotAfter.contributions.map(key))
    )
  })

  test('TurnOffered read model matches engine active player after Call + handoff', () => {
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
    teardown = texas
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    texas.dealCards()

    const first = texas.controller.activePlayer!
    const { events: stepEvents } = applyTableCommand(texas, {
      type: 'Call',
      playerId: first.getUserInfo().id
    })
    const handoffEvents = texas.flushPendingTurnHandoff()
    const combined = [...stepEvents, ...handoffEvents]

    const turn = reduceLastTurnOfferedFromDomainEvents(combined)
    const ap = texas.controller.activePlayer
    expect(turn).not.toBeNull()
    expect(ap).not.toBeNull()
    expect(turn!.userId).toBe(ap!.getUserInfo().id)
  })

  test('board + voluntary trail from events match engine after preflop check-through', () => {
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
    teardown = texas
    const prefix = flatConcatDomainEvents([
      [...texas.start(), ...texas.flushAllPendingFlowOps()],
      texas.dealCards()
    ])

    const firstPf = texas.controller.activePlayer!
    const eCall = applyTableCommand(texas, {
      type: 'Call',
      playerId: firstPf.getUserInfo().id
    }).events
    const fCall = texas.flushAllPendingFlowOps()
    const secondPf = texas.controller.activePlayer!
    const eCheck = applyTableCommand(texas, {
      type: 'Check',
      playerId: secondPf.getUserInfo().id
    }).events
    const fCheck = texas.flushAllPendingFlowOps()

    const all = flatConcatDomainEvents([prefix, eCall, fCall, eCheck, fCheck])
    expect(texas.controller.stage).toBe(StageEnum.FLOP)

    expect(reduceHandIdFromFirstHandStarted(all)).toBe(
      texas.controller.currentHandId
    )
    expect(
      reduceLastStageAdvancedFromDomainEvents(all)?.boardThroughStageAfter
    ).toBe(StageEnum.FLOP)

    const board = reduceCommunityBoardFromDomainEvents(all)
    expect(board).toEqual(texas.controller.getRevealedPokes())

    const trail = reducePlayerActedTrailFromDomainEvents(all)
    expect(trail.length).toBeGreaterThanOrEqual(2)
    expect(trail.some((t) => t.actionType === ActionTypeEnum.CALL)).toBe(true)
    expect(trail.some((t) => t.actionType === ActionTypeEnum.CHECK)).toBe(true)
  })

  test('flatConcat + HandEnded read model on HU FoldDueToLeave fold_win', () => {
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
    teardown = texas
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    const ap = texas.controller.activePlayer!
    const other = texas.dealer.players.find((p) => p !== ap)!
    const step = applyTableCommand(texas, {
      type: 'FoldDueToLeave',
      playerId: other.getUserInfo().id
    }).events
    const flushed = texas.flushAllPendingFlowOps()
    const tape = flatConcatDomainEvents([step, flushed])

    const ended = reduceLastHandEndedFromDomainEvents(tape)
    expect(texas.controller.status).toBe('between_hands')
    expect(ended?.outcome).toBe('fold_win')
    expect(
      reduceTurnEndedTrailFromDomainEvents(tape).some(
        (t) => t.reason === 'leave'
      )
    ).toBe(true)
  })

  test('reduceLastRolesAssignedFromDomainEvents on setPlayerRoles tape', () => {
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
    teardown = texas
    const tape = texas.setPlayerRoles()
    const r = reduceLastRolesAssignedFromDomainEvents(tape)
    expect(r?.players.length).toBeGreaterThanOrEqual(2)
  })

  test('reduceLastPotAwardedFromDomainEvents matches settle() PotAwarded', () => {
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
    teardown = texas
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    texas.dealCards()

    texas.controller.end()
    texas.controller.settleRankingsThroughStage(StageEnum.RIVER)
    const payEv = texas.settle()
    const raw = payEv.find((e) => e.type === 'PotAwarded')
    if (!raw || raw.type !== 'PotAwarded') {
      throw new Error('expected PotAwarded from settle')
    }
    const fromReducer = reduceLastPotAwardedFromDomainEvents(payEv)
    expect(fromReducer?.potTotal).toBe(raw.payload.potTotal)
    const key = (c: Readonly<{ userId: number; amount: number }>) =>
      `${c.userId}:${c.amount}`
    expect(new Set(fromReducer!.allocations.map(key))).toEqual(
      new Set(raw.payload.allocations.map(key))
    )
  })

  test('applyTableCommandThenFlushAllPendingFlowOps emits TurnOffered after Call', () => {
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
    teardown = texas
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    texas.dealCards()

    const first = texas.controller.activePlayer!
    const { events } = applyTableCommandThenFlushAllPendingFlowOps(texas, {
      type: 'Call',
      playerId: first.getUserInfo().id
    })
    expect(events.some((e) => e.type === 'TurnOffered')).toBe(true)
  })

  test('applyTableCommandThenFlushAllPendingFlowOps leaves no pending flow ops', () => {
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
    teardown = texas
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    texas.dealCards()

    const first = texas.controller.activePlayer!
    const { snapshotAfter } = applyTableCommandThenFlushAllPendingFlowOps(
      texas,
      { type: 'Call', playerId: first.getUserInfo().id }
    )
    expect(snapshotAfter.pendingFlowOps).toEqual([])
  })

  test('reduceLastBlindsPostedFromDomainEvents on start tape', () => {
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
    teardown = texas
    const tape = flatConcatDomainEvents([
      [...texas.start(), ...texas.flushAllPendingFlowOps()]
    ])
    const b = reduceLastBlindsPostedFromDomainEvents(tape)
    expect(b).not.toBeNull()
    expect(b!.posts.length).toBeGreaterThan(0)
  })
})
