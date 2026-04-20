import Texas from '@/Texas'
import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player/constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import {
  applyFoldOrCheckCommand,
  applyVoluntaryTableCommand,
  captureHandReduceProjection
} from './handReducer'

describe('handReducer (voluntary command path)', () => {
  let teardown: Texas | undefined

  afterEach(() => {
    teardown?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
    teardown = undefined
  })

  test('pending turn_handoff: projection has null voluntary actions', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
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
    texas.dealCards()
    void texas.start()
    expect(texas.getPendingFlowOps()).toEqual(['turn_handoff'])

    const proj = captureHandReduceProjection(texas)
    expect(proj.activeVoluntaryActions).toBeNull()
    expect(texas.controller.activePlayer).not.toBeNull()
  })

  test('after flushPendingTurnHandoff: Check on preflop second actor', () => {
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
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]

    const firstPf = texas.controller.activePlayer!
    const { events: callStep } = applyVoluntaryTableCommand(texas, {
      type: 'Call',
      playerId: firstPf.getUserInfo().id
    })
    expect(
      callStep.some(
        (e) =>
          e.type === 'PlayerActed' &&
          e.payload.userId === firstPf.getUserInfo().id &&
          e.payload.actionType === ActionTypeEnum.CALL
      )
    ).toBe(true)
    void texas.flushAllPendingFlowOps()

    const secondPf = texas.controller.activePlayer!
    const uid = secondPf.getUserInfo().id
    expect(captureHandReduceProjection(texas).activeVoluntaryActions).toContain(
      ActionTypeEnum.CHECK
    )

    const { events, projection } = applyFoldOrCheckCommand(texas, {
      type: 'Check',
      playerId: uid
    })

    expect(
      events.some(
        (e) =>
          e.type === 'PlayerActed' &&
          e.payload.userId === uid &&
          e.payload.actionType === ActionTypeEnum.CHECK
      )
    ).toBe(true)
    expect(projection.stage).toBe(StageEnum.PRE_FLOP)
  })

  test('Fold: active player folds out after turn offered', () => {
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
    texas.dealCards()
    void texas.start()
    void texas.flushPendingTurnHandoff()

    const ap = texas.controller.activePlayer!
    const apId = ap.getUserInfo().id
    expect(captureHandReduceProjection(texas).activeVoluntaryActions).toContain(
      ActionTypeEnum.FOLD
    )

    const { events, projection } = applyFoldOrCheckCommand(texas, {
      type: 'Fold',
      playerId: apId
    })

    expect(
      events.some(
        (e) =>
          e.type === 'PlayerActed' &&
          e.payload.userId === apId &&
          e.payload.actionType === ActionTypeEnum.FOLD
      )
    ).toBe(true)
    const row = projection.players.find((r) => r.userId === apId)
    expect(row?.status).toBe('out')
  })

  test('Fold by non-actor still throws (engine guard)', () => {
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
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]

    const actor = texas.controller.activePlayer!
    const notActor = texas.dealer.players.find((p) => p !== actor)!
    expect(() =>
      applyFoldOrCheckCommand(texas, {
        type: 'Fold',
        playerId: notActor.getUserInfo().id
      })
    ).toThrow(TexasError)
    try {
      applyFoldOrCheckCommand(texas, {
        type: 'Fold',
        playerId: notActor.getUserInfo().id
      })
    } catch (e) {
      expect(e).toBeInstanceOf(TexasError)
      expect((e as TexasError).code).toBe(
        TexasCoreErrorCode.PLAYER_DISPATCH_NOT_ACTOR
      )
    }
  })
})
