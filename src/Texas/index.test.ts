import Texas from '@/Texas'
import { StageEnum } from '@/Controller'
import TexasError, {
  TexasCoreErrorCode,
  isFatalTexasErrorCode
} from '@/TexasError'

describe('entery', () => {
  let teardownTexas: Texas | null = null
  afterEach(() => {
    try {
      teardownTexas?.reset()
    } catch {
      /* noop */
    }
    teardownTexas = null
  })

  test('game start and settle successfully', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'ycr' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'yt' })
    const p3 = texas.createPlayer({ id: 3, name: 'wyz' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.dealer.setButton(p1)

    texas.setPlayerRoles()
    const roleEv = texas.drainDomainEvents()
    expect(roleEv.length).toBe(1)
    expect(roleEv[0].type).toBe('RolesAssigned')
    expect(
      roleEv[0].type === 'RolesAssigned' && roleEv[0].payload.players.length
    ).toBeGreaterThanOrEqual(2)

    teardownTexas = texas
    texas.start()
    texas.drainDomainEvents()

    texas.dealCards()
    const dealEv = texas.drainDomainEvents()
    expect(dealEv.length).toBe(1)
    expect(dealEv[0].type).toBe('HoleCardsDealt')
    const hole =
      dealEv[0].type === 'HoleCardsDealt' ? dealEv[0].payload.byUserId : {}
    expect(Object.keys(hole).length).toBeGreaterThanOrEqual(2)
    expect(
      Object.values(hole).every((h) => Array.isArray(h) && h.length === 2)
    ).toBe(true)

    expect(() => texas.setPlayerRoles()).toThrow('玩家位置已确认,请勿重复设置')
    expect(() => texas.start()).toThrow('游戏已经开始, 请勿重复开始游戏')

    texas.controller.end()
    texas.controller.settleRankingsThroughStage(StageEnum.RIVER)
    texas.settle()
    texas.reset()
    expect(p1.balance + p2.balance + p3.balance).toEqual(15_000)
  })

  test('setPlayerRoles throws fatal when a seated player balance is below big blind', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.join(p2)
    texas.room.seat(texas.room.owner)
    texas.room.seat(p2)
    texas.dealer.setButton(texas.room.owner)
    p2.balance = 400

    let err: TexasError | undefined
    try {
      texas.setPlayerRoles()
    } catch (e) {
      err = e as TexasError
    }
    expect(err).toBeInstanceOf(TexasError)
    expect(err!.message).toBe(
      '数据异常: 玩家 2 余额(400)不足大盲(500), 无法设置角色'
    )
    expect(err!.code).toBe(
      TexasCoreErrorCode.SESSION_SET_ROLES_BALANCE_BELOW_BB
    )
    expect(isFatalTexasErrorCode(err!.code)).toBe(true)
  })

  test('dispatchCommand rejects non-actor; settle emits PotAwarded', async () => {
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
    texas.drainDomainEvents()
    teardownTexas = texas
    texas.start()
    texas.drainDomainEvents()
    texas.dealCards()
    texas.drainDomainEvents()

    const actor = texas.controller.activePlayer!
    const notActor = texas.dealer.players.find((p) => p !== actor)!
    await expect(
      texas.dispatchCommand({
        type: 'Fold',
        playerId: notActor.getUserInfo().id
      })
    ).rejects.toMatchObject({
      code: TexasCoreErrorCode.PLAYER_DISPATCH_NOT_ACTOR
    })

    texas.controller.end()
    texas.controller.settleRankingsThroughStage(StageEnum.RIVER)
    texas.settle()
    const payEv = texas.drainDomainEvents()
    expect(payEv.some((e) => e.type === 'PotAwarded')).toBe(true)
    const pot = payEv.find((e) => e.type === 'PotAwarded')
    expect(
      pot && pot.type === 'PotAwarded' && pot.payload.allocations.length
    ).toBeGreaterThan(0)
  })
})
