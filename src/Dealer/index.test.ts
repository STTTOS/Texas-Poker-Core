import Dealer from '.'
import Pool from '@/Pool'
import { Player, RoleEnum } from '@/Player'
import Controller, { StageEnum } from '@/Controller'

describe('dealer', () => {
  test('reArrangeRoles throws when button is not set', () => {
    const dealer = new Dealer(200)
    expect(() => dealer.reArrangeRoles()).toThrow(
      '未指定庄家, 无法重排座位角色'
    )
  })

  test('join after BB inserts newcomer between BB and former UTG', () => {
    const dealer = new Dealer(200)
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
    dealer.join(p1)
    dealer.join(p2)
    dealer.setButton(p1)
    dealer.setOthers()
    const bb = dealer.find((p) => p.getRole() === RoleEnum.BB)!
    const beforeNext = bb.getNextPlayer()!

    const p3 = new Player({
      user: { id: 3, name: 'c' },
      initialChips: 10_000,
      stakes: dealer.stakes,
      handSession: controller,
      dealerRing: dealer,
      pot: pool
    })
    dealer.join(p3, { insertAfter: bb })

    expect(bb.getNextPlayer()).toBe(p3)
    expect(p3.getNextPlayer()).toBe(beforeNext)
    expect(p3.getLastPlayer()).toBe(bb)
  })

  test('Game init successfully', () => {
    const dealer = new Dealer(200)
    const pool = new Pool()
    const controller = new Controller(dealer, pool)
    dealer.join(
      new Player({
        user: { id: 2, name: '2' },
        initialChips: 40000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
    )
    dealer.join(
      new Player({
        user: { id: 3, name: '3' },
        initialChips: 40000,
        stakes: dealer.stakes,
        handSession: controller,
        dealerRing: dealer,
        pot: pool
      })
    )
    dealer.setRoles()
    dealer.dealCards()
    controller.settleRankingsThroughStage(StageEnum.RIVER)

    expect(dealer.deck.getCards().length).toEqual(52)
    expect(dealer.getPokes().commonPokes.length).toEqual(5)
    expect(dealer.getPokes().handPokes.length).toEqual(2)
    expect(dealer.count).toEqual(2)
    expect(dealer.lowestBetAmount).toEqual(200)
  })
})
