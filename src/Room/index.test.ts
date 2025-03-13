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
      controller
    })
    const room = new Room(player, dealer)
    expect(room.getLowestBeAmount()).toEqual(200)
  })
  test('test function addPlayer', () => {
    // 创建房间
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const room = new Room(player, dealer)

    const lowestBetAmount = room.getLowestBeAmount()
    const p2 = new Player({
      user: { id: 2, balance: 20000 },
      lowestBetAmount,
      controller
    })
    const p3 = new Player({
      user: { id: 3, balance: 20000 },
      lowestBetAmount,
      controller
    })

    room.addPlayer(p2)
    room.addPlayer(p3)
    const shouldBeFalse = room.addPlayer(p3)

    expect(room.getPlayersInRoomCount()).toEqual(3)
    expect(shouldBeFalse).toBe(false)
  })
  test('test function removePlayer', () => {
    // 创建房间
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const room = new Room(player, dealer)

    const lowestBetAmount = room.getLowestBeAmount()
    const p2 = new Player({
      user: { id: 2, balance: 20000 },
      lowestBetAmount,
      controller
    })
    const p3 = new Player({
      user: { id: 3, balance: 20000 },
      lowestBetAmount,
      controller
    })
    room.addPlayer(p2)
    room.addPlayer(p3)
    room.removePlayer(p2)
    const removeAgain = room.removePlayer(p2)
    expect(room.getPlayersInRoomCount()).toEqual(2)
    expect(removeAgain).toBe(false)
  })
  test('test function seat', () => {
    const dealer = new Dealer(200)
    const controller = new Controller(dealer)
    const player = new Player({
      user: { id: 1, balance: 500 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const room = new Room(player, dealer)

    const lowestBetAmount = room.getLowestBeAmount()
    const p2 = new Player({
      user: { id: 2, balance: 20000 },
      lowestBetAmount,
      controller
    })
    const canNotBeSeat = room.seat(p2)
    expect(canNotBeSeat).toBe(false)

    room.setStatus('on')
    expect(room.addPlayer(p2)).toBe(false)
    expect(room.getPlayer(p2)).toEqual('hang')
    expect(room.getPlayersInRoomCount()).toEqual(2)

    room.setStatus('waiting')
    room.seat(p2)
    expect(room.getPlayersInRoomCount()).toEqual(2)
    expect(room.getPlayer(p2)).toEqual('on-set')
  })
})
