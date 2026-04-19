import Room from '@/Room'
import Pool from '@/Pool'
import { Player } from '.'
import Dealer from '@/Dealer'
import Controller from '@/Controller'
import { resolveAllowedActions } from './allowedActions'
import { executeCall, executeFold, executeAllIn } from './handBettingActions'

describe('class Player', () => {
  let teardownController: Controller | null = null
  afterEach(() => {
    try {
      teardownController?.reset()
    } catch {
      /* reset 在部分状态下仍应可重复调用 */
    }
    teardownController = null
  })

  test('function allIn', () => {
    const dealer = new Dealer(1000)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const p1 = new Player({
      user: { id: 1, name: 'ycr' },
      initialChips: 18000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'yt' },
      initialChips: 5000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p3 = new Player({
      user: { id: 3, name: 'wyz' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      initialChips: 18000
    })
    room.seat(p1)

    room.join(p2)
    room.join(p3)
    room.seat(p2)
    room.seat(p3)
    // 与旧版 ready 前 setButton(p2) 后再轮换一致：庄家为 p3
    room.initialRoles(p3)
    teardownController = controller
    controller.start()
    controller.drainHandEvents()
    controller.drainPendingFlowOpsSync()

    executeCall(p3)
    controller.drainPendingFlowOpsSync()
    executeAllIn(p1)
    controller.drainPendingFlowOpsSync()
    executeAllIn(p2)
    controller.drainPendingFlowOpsSync()
    controller.end()

    expect(p1.balance).toEqual(0)
    expect(p2.balance).toEqual(0)
    expect(p3.balance).toEqual(9000)
  })

  describe('getRestrict', () => {
    test('多人局翻牌前：首人 min 为补齐到 BB；前位弃牌后下家按与场上最高注的差额', () => {
      const dealer = new Dealer(200)
      const pool = new Pool()
      const controller = new Controller(dealer, pool)
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 5000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
        initialChips: 5000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p3 = new Player({
        user: { id: 3, name: 'c' },
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
      room.join(p2)
      room.join(p3)
      room.seat(p2)
      room.seat(p3)
      room.initialRoles(p2)
      dealer.dealCards()
      teardownController = controller
      controller.start()
      controller.drainHandEvents()
      controller.drainPendingFlowOpsSync()

      const firstActor = controller.activePlayer!
      expect(firstActor.getRestrict().min).toBe(200)

      // 典型顺序：下一位为小盲，已下 100，场上最大仍为 BB 200 → 再补 100
      executeFold(firstActor)
      expect(controller.activePlayer!.getRestrict().min).toBe(100)
    })

    test('双人局翻牌前：按钮位（小盲）min 可为补齐差额（100）', async () => {
      const dealer = new Dealer(200)
      const pool = new Pool()
      const controller = new Controller(dealer, pool)
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 5000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
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
      room.join(p2)
      room.seat(p2)
      room.initialRoles(p2)
      dealer.dealCards()
      teardownController = controller
      controller.start()
      controller.drainHandEvents()
      controller.drainPendingFlowOpsSync()

      // 双人局按钮位先行动，min 可为补齐到 BB 的差额（100）
      expect(controller.activePlayer!.getRestrict().min).toBe(100)
    })

    test('min 为补齐到场上他人最大本轮下注：未下者与最高注之间的差额', () => {
      const dealer = new Dealer(1000)
      const pool = new Pool()
      const controller = new Controller(dealer, pool)
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 8000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
        initialChips: 8000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p3 = new Player({
        user: { id: 3, name: 'c' },
        initialChips: 8000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      dealer.join(p1)
      dealer.join(p2)
      dealer.join(p3)
      dealer.setButton(p1)

      // 他人最高本轮 1000；p3 尚未下，需补 1000
      p1.currentStageTotalAmount = 300
      p2.currentStageTotalAmount = 1000
      p3.currentStageTotalAmount = 0

      const r = p3.getRestrict()
      expect(r.max).toBe(8000)
      expect(r.min).toBe(1000)
    })

    test('他人本轮均无正下注时 min 为 lowestBetAmount', () => {
      const dealer = new Dealer(1000)
      const pool = new Pool()
      const controller = new Controller(dealer, pool)
      const lowest = dealer.lowestBetAmount
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 5000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
        initialChips: 5000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      dealer.join(p1)
      dealer.join(p2)
      dealer.setButton(p1)
      p1.currentStageTotalAmount = 0
      p2.currentStageTotalAmount = 0

      const r = p1.getRestrict()
      expect(r.max).toBe(5000)
      expect(r.min).toBe(lowest)
    })

    test('补齐额大于余额时 min 与 max 同为 balance', () => {
      const dealer = new Dealer(500)
      const pool = new Pool()
      const controller = new Controller(dealer, pool)
      const p1 = new Player({
        user: { id: 1, name: 'x' },
        initialChips: 350,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'y' },
        initialChips: 10_000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      dealer.join(p1)
      dealer.join(p2)
      dealer.setButton(p1)
      p1.currentStageTotalAmount = 0
      p2.currentStageTotalAmount = 2000

      const r = p1.getRestrict()
      expect(r.max).toBe(350)
      expect(r.min).toBe(350)
    })

    test('已部分跟注时 min 为与场上最高注的剩余差额', () => {
      const dealer = new Dealer(1000)
      const pool = new Pool()
      const controller = new Controller(dealer, pool)
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 8000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
        initialChips: 8000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      dealer.join(p1)
      dealer.join(p2)
      dealer.setButton(p1)
      p1.currentStageTotalAmount = 400
      p2.currentStageTotalAmount = 1000

      expect(p1.getRestrict().min).toBe(600)
    })
  })

  describe('getAllowedActionsContext', () => {
    test('resolveAllowedActions(context) matches getAllowedActions', () => {
      const dealer = new Dealer(1000)
      const pool = new Pool()
      const controller = new Controller(dealer, pool)
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 18_000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
        initialChips: 5000,
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
        initialChips: 18_000
      })
      room.seat(p1)
      room.join(p2)
      room.join(p3)
      room.seat(p2)
      room.seat(p3)
      room.initialRoles(p3)
      teardownController = controller
      controller.start()
      controller.drainHandEvents()
      controller.drainPendingFlowOpsSync()

      const probe = controller.activePlayer!
      expect(resolveAllowedActions(probe.getAllowedActionsContext())).toEqual(
        probe.getAllowedActions()
      )
    })
  })
})
