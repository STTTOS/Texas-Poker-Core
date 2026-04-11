import type { GameComponent, TexasErrorCallback } from '@/gameContracts'

import Deck from '@/Deck'
import { getRandomInt } from '@/utils'
import { Role, Player, RoleEnum } from '@/Player'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import { roleMap, playerRoleSetMap } from '@/Player/constant'
import {
  getWinners,
  formatterPoke,
  getBestRankCategory as resolveTableBestRankCategory
} from '@/Deck/core'

/**
 * 牌桌与座位：环形玩家链、入座/离座、庄家与盲注位角色、发牌调度、桌面快照日志。
 * 牌型评估请用 `Deck/core` 纯函数或本类对 `getPokes()` 的封装，而非在 `Deck` 内实现业务语义。
 */
class Dealer implements GameComponent {
  #lowestBetAmount: number
  #maxTablePlayers: number
  #deck: Deck
  #count = 0
  #button: Player | null = null
  #last: Player | null = null
  #head: Player | null = null
  fail: TexasErrorCallback

  // 记录最近一个玩家的操作记录
  #actionsHistory: Player[] = []

  constructor(
    lowestBetAmount: number,
    fail: TexasErrorCallback = (error) => {
      throw error
    },
    options?: { maxTablePlayers?: number }
  ) {
    this.#lowestBetAmount = lowestBetAmount
    this.#maxTablePlayers = options?.maxTablePlayers ?? 10
    this.#deck = new Deck()
    this.fail = fail
  }

  get actionHistory() {
    return this.#actionsHistory
  }

  get count() {
    return this.#count
  }

  get button() {
    return this.#button
  }

  get deck() {
    return this.#deck
  }

  get players() {
    return this.map((p) => p)
  }

  get winners() {
    return getWinners(this.players)
  }

  get lowestBetAmount() {
    return this.#lowestBetAmount
  }

  dealCards() {
    if (!this.#button)
      return this.fail(new TexasError(TexasCoreErrorCode.DEALER_NO_BUTTON))

    TexasEngineContext.emitTrace({
      channel: 'dealer',
      name: 'deal_cards_players',
      data: {
        players: this.map(
          (player) => roleMap.get(player.getRole()!) + ': ' + player.toString()
        )
      }
    })
    const { handPokes } = this.#deck.dealCards(this.#count)
    this.loop((player, i) => {
      player.setHandPokes(handPokes[i])
    }, this.#button.getNextPlayer())
  }

  addAction(player: Player) {
    // 只需记录一圈的操作记录
    if (this.#actionsHistory.length === this.#count) {
      this.#actionsHistory.shift()
    }
    this.#actionsHistory.push(player)
  }

  /**
   * @description 获取最大牌型 category（首字符）
   */
  getBestRankCategory() {
    const { handPokes, commonPokes } = this.#deck.getPokes()
    return resolveTableBestRankCategory(handPokes, commonPokes)
  }

  /** 获取场上最大的牌型组合（可能多玩家并列） */
  getTableBestFiveCards() {
    const maxRankStrength = Math.max(
      ...this.map((player) => player.rankStrength)
    )

    return this.filter((player) => player.getStatus() !== 'out')
      .map(({ rankStrength, bestFiveCards }) => ({
        rankStrength,
        bestFiveCards
      }))
      .filter(
        ({ rankStrength, bestFiveCards }) =>
          rankStrength === maxRankStrength && !!bestFiveCards
      )
      .map((item) => item.bestFiveCards)
  }

  logPlayers() {
    TexasEngineContext.emitTrace({
      channel: 'dealer',
      name: 'log_players',
      data: { lines: this.map((player) => player.toString()) }
    })
  }

  /**
   * 游戏开局（首局）：指定或随机庄家，再按当前人数分配其余座位角色。
   * @param buttonPlayer 指定庄家（须在桌上）；省略时随机一位当庄。
   */
  initialRoles(buttonPlayer?: Player) {
    if (buttonPlayer) {
      if (!this.has(buttonPlayer))
        return this.fail(
          new TexasError(TexasCoreErrorCode.DEALER_BUTTON_HANDOFF_INVALID)
        )
      this.setButton(buttonPlayer)
    } else {
      this.#assignButtonAtRandom()
    }
    this.setOthers()
  }

  /**
   * 玩家加入 / 离开环形桌后，按当前庄家位整圈重分配角色（须已存在庄家）。
   */
  reArrangeRoles() {
    if (!this.#button)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_REARRANGE_NO_BUTTON)
      )

    const roles = playerRoleSetMap.get(this.#count)

    if (!roles)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_UNSUPPORTED_COUNT, {
          count: this.#count
        })
      )

    this.loop((player, i) => {
      player.setRole(roles![i])
    }, this.#button)
  }

  /**
   * 新一手开始前轮换座位：庄家顺时针下移一位，再按新庄家重算 SB/BB 等。
   */
  rotateRolesForNewHand() {
    this.changeButtonToNextPlayer()
    this.setOthers()
  }

  /**
   * @deprecated 请使用 {@link Dealer.initialRoles}
   */
  setRoles() {
    this.initialRoles()
  }

  remove(player: Player) {
    if (!this.has(player)) return false

    // 移除后没有玩家了
    if (this.#count === 1) {
      this.#head = null
      this.#last = null
      this.#button = null
      this.#count = 0
      return true
    }

    if (this.#head === player) {
      this.#head = player.getNextPlayer()
    }
    if (this.#button === player) {
      this.#button = player.getNextPlayer()
    }
    if (this.#last === player) {
      this.#last = player.getLastPlayer()
    }

    // 将上一个玩家的next player设置为当前玩家的next player
    player.getLastPlayer()?.setNextPlayer(player.getNextPlayer())
    // 将下一个玩家的last player 设置为当前玩家的last player
    player.getNextPlayer()?.setLastPlayer(player.getLastPlayer())
    this.#count--

    this.reArrangeRoles()
    return true
  }

  join(player: Player) {
    if (this.has(player)) return false
    this.#count++

    if (!this.#head) {
      this.#head = player
      this.#last = player
      return true
    }

    player.setLastPlayer(this.#last)
    player.setNextPlayer(this.#head)
    this.#last?.setNextPlayer(player)
    this.#head?.setLastPlayer(player)

    this.#last = player
    if (this.#button) this.reArrangeRoles()
    return true
  }

  has(player: Player) {
    return !!this.get(player)
  }

  hasById(userId: number) {
    return !!this.getById(userId)
  }

  get(player: Player) {
    return this.find((target) => target === player)
  }

  getById(userId: number) {
    return this.find((player) => player.id === userId)
  }

  log() {
    const lines: string[] = []
    lines.push(`玩家数量: ${this.#count}`)
    lines.push('底牌:' + formatterPoke(this.#deck.getPokes().commonPokes))
    this.forEach((player) => {
      const role = player.getRole()
      lines.push(
        `${
          role ? roleMap.get(role) : 'unSettled'
        }:  ${player.toString()}; 手牌: ${formatterPoke(player.getHandPokes())}`
      )
    })
    TexasEngineContext.emitTrace({
      channel: 'dealer',
      name: 'table_snapshot',
      data: { lines }
    })
  }

  /** 获取未弃牌玩家 */
  getPlayersStillInGame() {
    return this.filter((player) => player.getStatus() !== 'out')
  }

  /** 将庄家移交给下一位玩家（仅更新庄家位，不刷新其余座位；新一局请用 {@link rotateRolesForNewHand}） */
  changeButtonToNextPlayer() {
    const next = this.#button?.getNextPlayer()
    if (!next)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_BUTTON_HANDOFF_INVALID)
      )

    this.setButton(next)
  }

  /** 指定玩家为庄家（仅设 BTN 与内部引用；其余角色请配合 {@link setOthers} 或 {@link reArrangeRoles}） */
  setButton(player: Player) {
    player.setRole(RoleEnum.BTN)
    this.#button = player
  }

  #assignButtonAtRandom() {
    const count = this.#count
    if (count < 1)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_COUNT_OUT_OF_RANGE, {
          count
        })
      )

    const random = getRandomInt(0, count - 1)
    this.forEach((p, i) => {
      if (i === random) this.setButton(p)
    })
  }

  /**
   * @description 设置除了庄家位之外的其他玩家的位置
   * @returns
   */
  setOthers() {
    if (!this.#button)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_SET_OTHERS_NO_BUTTON)
      )

    let count = this.#count
    if (TexasEngineContext.simulation().allowSingleSeatedPlayer && count === 1)
      return

    if (count < 2 || count > this.#maxTablePlayers)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_COUNT_OUT_OF_RANGE, {
          count
        })
      )

    const roles = playerRoleSetMap.get(count)!.slice(1)
    let role: Role
    let current = this.#button.getNextPlayer()

    while (count - 1 && current) {
      role = roles.shift()!
      if (role) current.setRole(role)

      current = current.getNextPlayer()
      count--
    }
  }

  /**
   * @description 获取当前阶段的最大下注额
   */
  getCurrentStageMaxBetAmount() {
    return Math.max(...this.map((player) => player.lowestBetAmount))
  }

  getPlayersByActionSequence() {
    const playes: Player[] = []
    this.loop((player) => {
      playes.push(player)
    })
    return playes
  }

  /**
   * @description 从head玩家开始遍历
   */
  forEach(callback: (p: Player, i: number) => void) {
    let index = 0
    let count = this.#count
    let current: Player | null = this.#head

    while (count && current) {
      callback(current, index)
      current = current.getNextPlayer()
      index++
      count--
    }
  }

  map<T>(callback: (p: Player, i: number) => T): T[] {
    const result: T[] = []
    this.forEach((player, i) => {
      result.push(callback(player, i))
    })
    return result
  }

  every(callback: (p: Player, i: number) => boolean): boolean {
    let result: boolean
    this.forEach((player, i) => {
      const value = callback(player, i)
      if (result === undefined) result = value
      else result = result && value
    })
    return result!
  }

  /**
   * @description 重置每个玩家当前阶段的下注额
   */
  resetCurrentStageTotalAmount() {
    this.forEach((p) => p.resetCurrentStageTotalAmount())
  }

  /**
   * @description 重置每个玩家的action记录
   */
  resetActionsOfPlayers() {
    this.forEach((p) => p.resetAction())
  }

  resetActionsHistory() {
    this.#actionsHistory = []
  }
  /**
   * @description 重置玩家的`action`,当前阶段下注额, 手牌, 手牌牌力信息, 底牌等信息
   * 在游戏结束后调用
   */
  reset() {
    this.#deck.reset()
    this.resetActionsHistory()
    this.forEach((player) => player.reset())
  }

  // 反向遍历
  findReverse(callback: (p: Player) => boolean, from: Player | null) {
    let count = this.#count
    let current: Player | null = from

    while (current && count) {
      if (callback(current)) return current

      current = current.getLastPlayer()
      count--
    }
    return null
  }

  filter(callback: (p: Player, i: number) => boolean): Player[] {
    const result: Player[] = []
    this.forEach((player, i) => {
      if (callback(player, i)) result.push(player)
    })
    return result
  }

  find(callback: (p: Player) => boolean) {
    let count = this.#count
    let current: Player | null = this.#head

    while (current && count) {
      // current.log()
      if (callback(current)) return current
      current = current.getNextPlayer()
      count--
    }
    return null
  }

  /**
   * @description 从指定的玩家开始, 默认从庄家的下一位, 遍历一轮
   * @param callback
   * @param startFrom
   */
  loop(
    callback: (p: Player, i: number) => void,
    startFrom: Player | null | undefined = this.#button?.getNextPlayer()
  ) {
    let index = 0
    let current: Player | null | undefined = startFrom
    let count = this.#count

    while (count && current) {
      if (current) callback(current, index)

      index++
      count--
      current = current.getNextPlayer()
    }
  }

  /**
   * @description 从庄家的下一个玩家开始遍历, 获取第一个可以行动的玩家
   */
  getTheFirstPlayerToAct(): Player | null {
    let player: Player | null = null

    this.loop((p) => {
      if (!player && p.getStatus() === 'waiting') player = p
    }, this.#button?.getNextPlayer())
    return player
  }

  /**
   * @description 获取可以行动的玩家列表 排除弃牌 和 全押的玩家
   * @returns
   */
  getPlayersCanAct() {
    return this.filter(
      (player) => player.getStatus() !== 'out' && player.getStatus() !== 'allIn'
    )
  }
}

export default Dealer
