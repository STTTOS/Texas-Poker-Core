import Room from '@/Room'
import Pool from '@/Pool'
import Dealer from '@/Dealer'
import { Player } from '@/Player'
import Controller, { StageEnum } from '.'
import { executeFold, executeAllIn } from '@/Player/handBettingActions'

describe('class Controller', () => {
  let teardownController: Controller | null = null
  afterEach(() => {
    try {
      teardownController?.reset()
    } catch {
      /* noop */
    }
    teardownController = null
  })

  test('function transferControl', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'yt' },
      initialChips: 5000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 5000
    })
    room.seat(p1)

    const p2 = new Player({
      user: { id: 2, name: 'ycr' },
      initialChips: 30000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p3 = new Player({
      user: { id: 3, name: 'wzy' },
      initialChips: 10000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })

    const p4 = new Player({
      user: { id: 4, name: 'zhong' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    room.join(p2)
    room.join(p3)
    room.join(p4)
    room.seat(p2)
    room.seat(p3)
    room.seat(p4)
    // 与旧版「先 setButton(p3) 再 ready 时无参 setButton 会轮换到下家」一致：庄家为 p4
    room.initialRoles(p4)

    teardownController = controller
    controller.start()
    controller.drainHandEvents()
    controller.drainPendingFlowOpsSync()
    room.getDealer().log()
    expect(controller.activePlayer === p3).toBe(true)
    // p1.log()
    executeAllIn(p3)
    controller.drainPendingFlowOpsSync()
    // p1.log()

    expect(controller.activePlayer === p4).toBe(true)
    // p2.log()
    executeAllIn(p4)
    controller.drainPendingFlowOpsSync()
    // p2.log()

    expect(controller.activePlayer === p1).toBe(true)
    // p3.log()
    executeAllIn(p1)
    controller.drainPendingFlowOpsSync()

    controller.end()
    // expect(p1.getBalance()).toEqual(0)
    // expect(p2.getBalance()).toEqual(10000)
    // expect(p3.getBalance()).toEqual(9000)
    // expect(p4.getBalance()).toEqual(0)
  })

  test('initial status is idle', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    expect(controller.status).toBe('idle')
  })

  test('takeActionInPreFlop emits PotUpdated after each blind (fine granularity)', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p3 = new Player({
      user: { id: 3, name: 'c' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 10_000
    })
    room.seat(p1)
    room.join(p2)
    room.join(p3)
    room.seat(p2)
    room.seat(p3)
    room.initialRoles(p1)
    dealer.dealCards()

    teardownController = controller
    controller.start()
    const ev = controller.drainHandEvents()

    const blindsIdx = ev.findIndex((e) => e.type === 'BlindsPosted')
    expect(blindsIdx).toBeGreaterThanOrEqual(0)
    const potBeforeBlinds = ev.filter(
      (e, i) => e.type === 'PotUpdated' && i < blindsIdx
    )
    expect(potBeforeBlinds.length).toBe(2)
    expect(
      potBeforeBlinds.every(
        (e) =>
          e.type === 'PotUpdated' &&
          e.payload.totalAmount > 0 &&
          e.payload.contributions.length > 0
      )
    ).toBe(true)
    expect(
      (
        potBeforeBlinds[1] as {
          type: 'PotUpdated'
          payload: { totalAmount: number }
        }
      ).payload.totalAmount
    ).toBeGreaterThanOrEqual(
      (
        potBeforeBlinds[0] as {
          type: 'PotUpdated'
          payload: { totalAmount: number }
        }
      ).payload.totalAmount
    )
  })

  test('short stack blind posts min(requested, balance)', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 10_000
    })
    room.seat(p1)
    room.join(p2)
    room.seat(p2)
    room.initialRoles(p2)
    dealer.dealCards()

    const sb = dealer.button!
    sb.balance = 300

    teardownController = controller
    controller.start()
    const ev = controller.drainHandEvents()
    controller.drainPendingFlowOpsSync()
    const blinds = ev.find(
      (e): e is Extract<typeof e, { type: 'BlindsPosted' }> =>
        e.type === 'BlindsPosted'
    )
    expect(blinds).toBeDefined()
    const sbPost = blinds!.payload.posts.find((p) => p.kind === 'sb')
    expect(sbPost?.amount).toBe(300)
    expect(pool.totalAmount).toBe(300 + dealer.stakes.bigBlind)
    const sbRow = controller.defaultBets.find(
      (d) => d.userId === sb.getUserInfo().id
    )
    expect(sbRow?.amount).toBe(300)
    expect(sbRow?.balance).toBe(0)
  })

  test('SB blind posts all-in stack: no transferControl until takeActionInPreFlop assigns first actor', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p3 = new Player({
      user: { id: 3, name: 'c' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 10_000
    })
    room.seat(p1)
    room.join(p2)
    room.join(p3)
    room.seat(p2)
    room.seat(p3)
    room.initialRoles(p1)
    dealer.dealCards()

    const button = dealer.button!
    const sb = button.getNextPlayer()!
    const bb = sb.getNextPlayer()!
    const firstToAct = bb.getNextPlayer()!
    sb.balance = 400

    teardownController = controller
    controller.start()
    controller.drainHandEvents()

    expect(controller.activePlayer).toBe(firstToAct)
    expect(controller.getPendingFlowOps()).toEqual(['turn_handoff'])
  })

  test('tryToEndGame: exclusive fold ends hand and emits HandEnded', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 10000
    })
    room.seat(p1)
    room.join(p2)
    room.seat(p2)
    room.initialRoles(p2)
    dealer.dealCards()

    teardownController = controller
    controller.start()
    controller.drainHandEvents()
    controller.drainPendingFlowOpsSync()
    executeFold(controller.activePlayer!)

    expect(controller.status).toBe('between_hands')
    const ev = controller.drainHandEvents()
    const ended = ev.find(
      (e): e is Extract<typeof e, { type: 'HandEnded' }> =>
        e.type === 'HandEnded'
    )
    expect(ended).toBeDefined()
    expect(ended!.payload.outcome).toBe('fold_win')
    expect(ended!.payload.bestPokes).toBeUndefined()
  })

  test('tryToEndGame: ends immediately when no one can act (all-in)', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 10000
    })
    room.seat(p1)
    room.join(p2)
    room.seat(p2)
    room.initialRoles(p2)
    dealer.dealCards()
    teardownController = controller
    controller.start()
    controller.drainHandEvents()

    while (controller.activePlayer) {
      controller.drainPendingFlowOpsSync()
      executeAllIn(controller.activePlayer)
    }
    controller.drainPendingFlowOpsSync()

    expect(controller.status).toBe('between_hands')
    const ev = controller.drainHandEvents()
    const runouts = ev.filter(
      (e) =>
        e.type === 'StageAdvanced' && e.payload.advanceKind === 'runout_reveal'
    )
    expect(runouts.length).toBe(3)
    const ended = ev.find(
      (e): e is Extract<typeof e, { type: 'HandEnded' }> =>
        e.type === 'HandEnded'
    )
    expect(ended).toBeDefined()
    expect(ended!.payload.endStage).toBe(StageEnum.RIVER)
    expect(ended!.payload.bestPokes).toBeDefined()
  })

  test('runout stages consumed by applyPendingStageAdvance', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 10000
    })
    room.seat(p1)
    room.join(p2)
    room.seat(p2)
    room.initialRoles(p2)
    dealer.dealCards()
    teardownController = controller
    controller.start()
    controller.drainHandEvents()

    while (controller.activePlayer) {
      controller.drainPendingFlowOpsSync()
      executeAllIn(controller.activePlayer)
    }

    expect(controller.status).toBe('in_hand')
    expect(controller.getPendingFlowOps()).toEqual([
      'stage_advance',
      'stage_advance',
      'stage_advance'
    ])

    controller.applyPendingStageAdvance()
    expect(
      controller.drainHandEvents().some((e) => e.type === 'StageAdvanced')
    ).toBe(true)
    controller.applyPendingStageAdvance()
    expect(
      controller.drainHandEvents().some((e) => e.type === 'StageAdvanced')
    ).toBe(true)
    controller.applyPendingStageAdvance()
    const lastBatch = controller.drainHandEvents()
    expect(
      lastBatch.some(
        (e): e is Extract<typeof e, { type: 'HandEnded' }> =>
          e.type === 'HandEnded'
      )
    ).toBe(true)

    expect(controller.status).toBe('between_hands')
    expect(controller.getPendingFlowOps()).toEqual([])
  })
})
