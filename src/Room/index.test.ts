import Room from '.'
import Pool from '@/Pool'
import Dealer from '@/Dealer'
import { Player } from '../Player'
import Controller from '@/Controller'

const roomOpts = (
  dealer: Dealer,
  owner: Player,
  controller: Controller,
  extra?: Partial<{ initialChips: number; maximumCountOfPlayers: number }>
) => ({
  dealer,
  owner,
  controller,
  initialChips: extra?.initialChips ?? 500,
  maximumCountOfPlayers: extra?.maximumCountOfPlayers
})

describe('Room', () => {
  test('init room successfully', () => {
    const dealer = new Dealer(200)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const player = new Player({
      user: { id: 1, name: '1' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room(roomOpts(dealer, player, controller))
    expect(room.lowestBetAmount).toEqual(200)
  })
  test('test function join', () => {
    const dealer = new Dealer(200)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const player = new Player({
      user: { id: 1, name: '1' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room(roomOpts(dealer, player, controller))
    const p2 = new Player({
      user: { id: 2, name: '2' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p3 = new Player({
      user: { id: 3, name: '3' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })

    room.join(p2)
    room.join(p3)
    expect(room.totalPlayersCount).toEqual(3)
    expect(() => room.join(p3)).toThrow('您已经在房间中,不可重复加入')
  })
  test('test function removePlayer', () => {
    const dealer = new Dealer(200)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const player = new Player({
      user: { id: 1, name: '1' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room(roomOpts(dealer, player, controller))

    const p2 = new Player({
      user: { id: 2, name: '2' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const p3 = new Player({
      user: { id: 3, name: '3' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    room.join(p2)
    room.join(p3)
    room.setOwner(p2)
    room.remove(player)
    expect(room.totalPlayersCount).toEqual(2)
  })
  test('test function seat', () => {
    const dealer = new Dealer(200)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const player = new Player({
      user: { id: 1, name: '1' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner: player,
      controller,
      initialChips: 500,
      maximumCountOfPlayers: 1
    })

    const p2 = new Player({
      user: { id: 2, name: '2' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    expect(() => room.seat(p2)).toThrow('您不在房间中,无法入座')

    room.seat(player)
    expect(() => room.seat(player)).toThrow('您已在坐席中,请勿重复操作')

    room.join(p2)
    expect(() => room.seat(p2)).toThrow('位置已满,无法加入坐席')
  })
  test('test function has', () => {
    const dealer = new Dealer(200)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const player = new Player({
      user: { id: 1, name: '1' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room(roomOpts(dealer, player, controller))

    expect(room.has(player.getUserInfo().id)).toEqual(true)
  })
})
