import Room from '.'
import Pool from '@/Pool'
import Dealer from '@/Dealer'
import { Player } from '../Player'
import Controller from '@/Controller'

const roomOpts = (
  dealer: Dealer,
  owner: Player,
  extra?: Partial<{ initialChips: number; maximumCountOfPlayers: number }>
) => ({
  dealer,
  owner,
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
    const room = new Room(roomOpts(dealer, player))
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
    const room = new Room(roomOpts(dealer, player))
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
    expect(room.getMemberCounts()).toEqual({ onSeat: 0, hang: 3, total: 3 })
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
    const room = new Room(roomOpts(dealer, player))

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

    expect(() => room.join(p2)).toThrow('房间人数已满')
  })
  test('join rejects when hang+on-set reaches maximumCountOfPlayers', () => {
    const dealer = new Dealer(200)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    const owner = new Player({
      user: { id: 1, name: '1' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    const room = new Room({
      dealer,
      owner,
      initialChips: 500,
      maximumCountOfPlayers: 2
    })
    const p2 = new Player({
      user: { id: 2, name: '2' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    room.join(p2)
    expect(room.totalPlayersCount).toBe(2)
    const p3 = new Player({
      user: { id: 3, name: '3' },
      initialChips: 500,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    expect(() => room.join(p3)).toThrow('房间人数已满')
  })

  test('seat and watch reject when seats_locked', () => {
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
    const room = new Room(roomOpts(dealer, player))
    const p2 = new Player({
      user: { id: 2, name: '2' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    room.join(p2)
    room.seat(player)
    room.seat(p2)
    room.initialRoles(player)

    const p3 = new Player({
      user: { id: 3, name: '3' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    room.join(p3)
    expect(() => room.seat(p3)).toThrow('座位已锁定')
    expect(() => room.watch(player)).toThrow('座位已锁定')
  })

  test('hang member may remove while seats_locked; seated may not', () => {
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
    const room = new Room(roomOpts(dealer, player))
    const p2 = new Player({
      user: { id: 2, name: '2' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    room.join(p2)
    room.seat(player)
    room.seat(p2)
    room.initialRoles(player)

    const spectator = new Player({
      user: { id: 99, name: 'spec' },
      initialChips: 20000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    room.join(spectator)
    room.setOwner(p2)
    room.remove(spectator)
    expect(room.has(99)).toBe(false)

    expect(() => room.remove(player)).toThrow('座位已锁定')
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
    const room = new Room(roomOpts(dealer, player))

    expect(room.has(player.getUserInfo().id)).toEqual(true)
  })
})
