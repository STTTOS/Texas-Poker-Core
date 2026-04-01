import Room from '@/Room'
import Pool from '@/Pool'
import Dealer from '@/Dealer'
import { Player } from '@/Player'
import Controller, { StageEnum } from '.'

describe('class Controller', () => {
  test('function transferControl', async () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    const pool = new Pool()
    const p1 = new Player({
      user: { id: 1, name: 'yt' },
      initialChips: 5000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      controller,
      initialChips: 5000
    })
    room.seat(p1)

    const p2 = new Player({
      lowestBetAmount: 1000,
      user: { id: 2, name: 'ycr' },
      initialChips: 30000,
      controller,
      dealer,
      pool
    })
    const p3 = new Player({
      lowestBetAmount: 1000,
      user: { id: 3, name: 'wzy' },
      initialChips: 10000,
      controller,
      dealer,
      pool
    })

    const p4 = new Player({
      lowestBetAmount: 1000,
      user: { id: 4, name: 'zhong' },
      initialChips: 20000,
      controller,
      dealer,
      pool
    })
    room.join(p2)
    room.join(p3)
    room.join(p4)
    room.seat(p2)
    room.seat(p3)
    room.seat(p4)
    room.getDealer().setButton(p3)
    // 发牌, 分配角色
    room.ready()

    await controller.start()
    room.getDealer().log()
    expect(controller.activePlayer === p3).toBe(true)
    // p1.log()
    await p3.allIn()
    // p1.log()

    expect(controller.activePlayer === p4).toBe(true)
    // p2.log()
    await p4.allIn()
    // p2.log()

    expect(controller.activePlayer === p1).toBe(true)
    // p3.log()
    await p1.allIn()

    controller.end()
    // expect(p1.getBalance()).toEqual(0)
    // expect(p2.getBalance()).toEqual(10000)
    // expect(p3.getBalance()).toEqual(9000)
    // expect(p4.getBalance()).toEqual(0)
  })

  test('initial status is idle', () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    expect(controller.status).toBe('idle')
  })

  test('tryToEndGame: exclusive fold ends hand and invokes onGameEnd', async () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    const pool = new Pool()
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      controller,
      initialChips: 10000
    })
    room.seat(p1)
    room.join(p2)
    room.seat(p2)
    dealer.setButton(p1)
    room.ready()
    dealer.dealCards()

    const onEnd = jest.fn()
    controller.onGameEnd(onEnd)
    await controller.start()
    await controller.activePlayer!.fold()

    expect(controller.status).toBe('hand_complete')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd.mock.calls[0][0].bestPokes).toBeUndefined()
    expect(onEnd.mock.calls[0][0].bestRankCategory).toBeUndefined()
  })

  test('tryToEndGame: ends immediately when no one can act (all-in)', async () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    const pool = new Pool()
    const onEnd = jest.fn()
    controller.onGameEnd(onEnd)
    const p1 = new Player({
      user: { id: 1, name: 'a' },
      initialChips: 10000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'b' },
      initialChips: 10000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      controller,
      initialChips: 10000
    })
    room.seat(p1)
    room.join(p2)
    room.seat(p2)
    dealer.setButton(p1)
    room.ready()
    dealer.dealCards()
    await controller.start()

    while (controller.activePlayer) {
      await controller.activePlayer.allIn()
    }

    expect(controller.status).toBe('hand_complete')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd.mock.calls[0][0].endStage).toBe(StageEnum.RIVER)
    expect(onEnd.mock.calls[0][0].bestPokes).toBeDefined()
  })
})
