import Texas from '@/Texas'
import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player/constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import { applyVoluntaryTableCommand } from './handReducer'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

function headsUpStartedDealt(texas: Texas) {
  void [...texas.start(), ...texas.flushAllPendingFlowOps()]
  texas.dealCards()
}

describe('applyVoluntaryTableCommand', () => {
  let teardown: Texas | undefined

  afterEach(() => {
    teardown?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
    teardown = undefined
  })

  describe('Call', () => {
    test('preflop first actor: PlayerActed CALL and pot read model consistent', () => {
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
      headsUpStartedDealt(texas)

      const first = texas.controller.activePlayer!
      const uid = first.getUserInfo().id
      const { events, projection } = applyVoluntaryTableCommand(texas, {
        type: 'Call',
        playerId: uid
      })

      expect(
        events.some(
          (e) =>
            e.type === 'PlayerActed' &&
            e.payload.userId === uid &&
            e.payload.actionType === ActionTypeEnum.CALL
        )
      ).toBe(true)
      expect(texas.controller.stage).toBe(StageEnum.PRE_FLOP)
      expect(projection.stage).toBe(StageEnum.PRE_FLOP)
      expect(projection.activeVoluntaryActions).toBeNull()
    })

    test('preflop when stack only covers gap via all-in, Call is not allowed; AllIn succeeds', () => {
      const texas = new Texas({
        lowestBetAmount: 1000,
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
      headsUpStartedDealt(texas)

      const first = texas.controller.activePlayer!
      const uid = first.getUserInfo().id
      /** `balance + currentStageTotal <= maxOthers` 时仅 `ALL_IN|FOLD`，与 `resolveAllowedActions` 一致 */
      first.balance = 500

      expect(() =>
        applyVoluntaryTableCommand(texas, { type: 'Call', playerId: uid })
      ).toThrow(TexasError)
      try {
        applyVoluntaryTableCommand(texas, { type: 'Call', playerId: uid })
      } catch (e) {
        expect((e as TexasError).code).toBe(
          TexasCoreErrorCode.PLAYER_CANNOT_CALL
        )
      }

      const { events } = applyVoluntaryTableCommand(texas, {
        type: 'AllIn',
        playerId: uid
      })
      expect(
        events.some(
          (e) =>
            e.type === 'PlayerActed' &&
            e.payload.userId === uid &&
            e.payload.actionType === ActionTypeEnum.ALL_IN
        )
      ).toBe(true)
      expect(first.getStatus()).toBe('allIn')
    })

    test('non-actor Call throws PLAYER_DISPATCH_NOT_ACTOR', () => {
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
      headsUpStartedDealt(texas)

      const actor = texas.controller.activePlayer!
      const notActor = texas.dealer.players.find((p) => p !== actor)!
      expect(() =>
        applyVoluntaryTableCommand(texas, {
          type: 'Call',
          playerId: notActor.getUserInfo().id
        })
      ).toThrow(TexasError)
      try {
        applyVoluntaryTableCommand(texas, {
          type: 'Call',
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

  describe('Check / Fold', () => {
    test('Check after opponent Call: PlayerActed CHECK', () => {
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
      headsUpStartedDealt(texas)

      const first = texas.controller.activePlayer!
      void applyVoluntaryTableCommand(texas, {
        type: 'Call',
        playerId: first.getUserInfo().id
      })
      void texas.flushAllPendingFlowOps()

      const second = texas.controller.activePlayer!
      const uid2 = second.getUserInfo().id
      const { events } = applyVoluntaryTableCommand(texas, {
        type: 'Check',
        playerId: uid2
      })

      expect(
        events.some(
          (e) =>
            e.type === 'PlayerActed' &&
            e.payload.userId === uid2 &&
            e.payload.actionType === ActionTypeEnum.CHECK
        )
      ).toBe(true)
    })

    test('Fold by active player: status out', () => {
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
      headsUpStartedDealt(texas)

      const ap = texas.controller.activePlayer!
      const uid = ap.getUserInfo().id
      void texas.flushPendingTurnHandoff()

      const { events, projection } = applyVoluntaryTableCommand(texas, {
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
      expect(projection.players.find((r) => r.userId === uid)?.status).toBe(
        'out'
      )
    })
  })

  describe('Bet / Raise / AllIn', () => {
    test('after preflop check-through: Bet on flop then Raise', () => {
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
      headsUpStartedDealt(texas)

      const firstPf = texas.controller.activePlayer!
      void applyVoluntaryTableCommand(texas, {
        type: 'Call',
        playerId: firstPf.getUserInfo().id
      })
      void texas.flushAllPendingFlowOps()
      const secondPf = texas.controller.activePlayer!
      void applyVoluntaryTableCommand(texas, {
        type: 'Check',
        playerId: secondPf.getUserInfo().id
      })
      void texas.flushAllPendingFlowOps()

      expect(texas.controller.stage).toBe(StageEnum.FLOP)

      const opener = texas.controller.activePlayer!
      const openerId = opener.getUserInfo().id
      const betEv = applyVoluntaryTableCommand(texas, {
        type: 'Bet',
        playerId: openerId,
        amount: 2000
      }).events
      expect(
        betEv.some(
          (e) =>
            e.type === 'PlayerActed' &&
            e.payload.userId === openerId &&
            e.payload.actionType === ActionTypeEnum.BET
        )
      ).toBe(true)
      void texas.flushAllPendingFlowOps()

      const responder = texas.controller.activePlayer!
      const rid = responder.getUserInfo().id
      const raiseEv = applyVoluntaryTableCommand(texas, {
        type: 'Raise',
        playerId: rid,
        additionalAmount: 4000
      }).events
      expect(
        raiseEv.some(
          (e) =>
            e.type === 'PlayerActed' &&
            e.payload.userId === rid &&
            e.payload.actionType === ActionTypeEnum.RAISE
        )
      ).toBe(true)
    })

    test('AllIn by active player facing bet emits ALL_IN', () => {
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
      headsUpStartedDealt(texas)

      const first = texas.controller.activePlayer!
      void applyVoluntaryTableCommand(texas, {
        type: 'Call',
        playerId: first.getUserInfo().id
      })
      void texas.flushAllPendingFlowOps()
      const second = texas.controller.activePlayer!
      void applyVoluntaryTableCommand(texas, {
        type: 'Check',
        playerId: second.getUserInfo().id
      })
      void texas.flushAllPendingFlowOps()

      const opener = texas.controller.activePlayer!
      void applyVoluntaryTableCommand(texas, {
        type: 'Bet',
        playerId: opener.getUserInfo().id,
        amount: 3000
      })
      void texas.flushAllPendingFlowOps()

      const facing = texas.controller.activePlayer!
      const fid = facing.getUserInfo().id
      const { events } = applyVoluntaryTableCommand(texas, {
        type: 'AllIn',
        playerId: fid
      })

      expect(
        events.some(
          (e) =>
            e.type === 'PlayerActed' &&
            e.payload.userId === fid &&
            e.payload.actionType === ActionTypeEnum.ALL_IN
        )
      ).toBe(true)
    })
  })
})
