import Room from '.'
import Dealer from '@/Dealer'
import { Player } from '../Player'
import Controller from '@/Controller'

describe('Room', () => {
  test('init room successfully', () => {
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const room = new Room(dealer, player)
    expect(room.lowestBetAmount).toEqual(200)
  })
  test('test function join', () => {
    // 创建房间
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const room = new Room(dealer, player)
    const lowestBetAmount = room.lowestBetAmount
    const p2 = new Player({
      user: { id: 2, balance: 20000 },
      lowestBetAmount,
      controller,
      dealer
    })
    const p3 = new Player({
      user: { id: 3, balance: 20000 },
      lowestBetAmount,
      controller,
      dealer
    })

    room.join(p2)
    room.join(p3)
    expect(room.totalPlayersCount).toEqual(3)
    expect(() => room.join(p3)).toThrow('您已经在房间中,不可重复加入')
  })
  test('test function removePlayer', () => {
    // 创建房间
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const room = new Room(dealer, player)

    const lowestBetAmount = room.lowestBetAmount
    const p2 = new Player({
      user: { id: 2, balance: 20000 },
      lowestBetAmount,
      controller,
      dealer
    })
    const p3 = new Player({
      user: { id: 3, balance: 20000 },
      lowestBetAmount,
      controller,
      dealer
    })
    room.join(p2)
    room.join(p3)
    room.remove(p2)
    expect(room.totalPlayersCount).toEqual(2)
  })
  test('test function seat', () => {
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const room = new Room(dealer, player, true, 1)

    const lowestBetAmount = room.lowestBetAmount
    const p2 = new Player({
      user: { id: 2, balance: 20000 },
      lowestBetAmount,
      controller,
      dealer
    })
    expect(() => room.seat(p2)).toThrow('您不在房间中,无法入座')

    expect(() => room.seat(player)).toThrow('您已在坐席中,请勿重复操作')

    room.join(p2)
    expect(() => room.seat(p2)).toThrow('位置已满,无法加入坐席')
  })
  test('test function has', () => {
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const room = new Room(dealer, player)

    expect(room.has(player.getUserInfo().id)).toEqual(true)
  })
})
