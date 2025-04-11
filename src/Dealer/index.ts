import Deck from '@/Deck'
import { getRandomInt } from '@/utils'
import { Role, Player } from '@/Player'
import { handPokeType } from '@/Deck/constant'
import { roleMap, playerRoleSetMap } from '@/Player/constant'
import {
  getWinners,
  getBestHand,
  formatterPoke,
  comparePresentation,
  getHandPresentation
} from '@/Deck/core'

/**
 * 荷官, 控制游戏进行
 */
class Dealer {
  #lowestBetAmount: number
  #deck: Deck
  /**
   * 存储庄家位的玩家id
   */
  // #buttonId: number

  #count = 0
  #button: Player | null = null
  #last: Player | null = null
  #head: Player | null = null

  // 记录最近一个玩家的操作记录
  #actionsHistory: Player[] = []
  // #rolesArranged = false

  constructor(lowestBetAmount: number) {
    this.#lowestBetAmount = lowestBetAmount

    this.#deck = new Deck()
  }

  get actionHistory() {
    return this.#actionsHistory
  }

  addAction(player: Player) {
    // 只需记录一圈的操作记录
    if (this.#actionsHistory.length === this.#count) {
      this.#actionsHistory.shift()
    }
    this.#actionsHistory.push(player)
  }
  get count() {
    return this.#count
  }

  get button() {
    return this.#button
  }

  dealCards() {
    if (!this.#button) throw new Error('庄家未指定, 无法发牌')

    console.log('玩家信息:')
    console.log(
      this.map(
        (player) => roleMap.get(player.getRole()!) + ': ' + player.toString()
      )
    )
    const { handPokes } = this.#deck.dealCards(this.getPlayersCount())
    this.loop((player, i) => {
      player.setHandPokes(handPokes[i])
    }, this.#button)
  }
  getDeck() {
    return this.#deck
  }
  getMaxPresentation() {
    const [max] = this.filter((player) => player.getStatus() !== 'out')
      .map((player) => player.getPresentation()!)
      .sort(comparePresentation)

    return max[0] as handPokeType
  }
  get players() {
    return this.map((p) => p)
  }

  getWinners() {
    return getWinners(this.players)
  }
  // 获取所有的最大牌型
  getMaxPokes() {
    // getBestHand()
    const result = this.filter((player) => player.getStatus() !== 'out').map(
      (player) => {
        const pokes = getBestHand(
          player.getHandPokes(),
          this.#deck.getPokes().commonPokes
        )
        return {
          presentation: getHandPresentation(pokes),
          pokes
        }
      }
    )
    const [max] = result.sort((a, b) =>
      comparePresentation(a.presentation, b.presentation)
    )
    return result
      .filter((item) => item.presentation === max.presentation)
      .map((item) => item.pokes)
  }

  getHeadPlayer() {
    return this.#head
  }

  getPreviousPlayers(callback: (p: Player) => boolean, from: Player) {
    const result: Player[] = []
    let count = this.#count
    let current: Player | null = from.getLastPlayer()

    while (current && count) {
      if (callback(current)) result.push(current)

      current = current.getLastPlayer()
      count--
    }
    return result
  }
  getLowestBetAmount() {
    return this.#lowestBetAmount
  }
  logPlayers() {
    console.log(
      '玩家信息: \n',
      this.map((player) => player.toString()).join('\n')
    )
  }

  setRoleToPlayers() {
    // this.#rolesArranged = true
    this.setButton()
    // if (process.env.PROJECT_ENV !== 'dev')
    this.setOthers()
  }
  /**
   * 暂停游戏
   */
  pause() {}

  /**
   * 结束游戏
   */
  end() {}

  /**
   * 计算各个玩家的最大牌力
   */
  settle() {
    this.forEach((player) => {
      player.setPresentation(
        getHandPresentation(
          getBestHand(player.getHandPokes(), this.#deck.getPokes().commonPokes)
        )
      )
    })
    console.log('底牌:', formatterPoke(this.#deck.getPokes().commonPokes))
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
    this.reArrangeRoles()
    return true
  }

  /**
   * 玩家加入 / 离开时重新分配角色
   */
  reArrangeRoles() {
    if (!this.#button) return

    const roles = playerRoleSetMap.get(this.#count)

    if (!roles) throw new Error('不支持的玩家人数对局')

    this.loop((player, i) => {
      player.setRole(roles[i])
    }, this.#button)
  }
  has(player: Player) {
    return !!this.find((p) => p === player)
  }

  log() {
    console.log(`玩家数量: ${this.getPlayersCount()}`)
    console.log('底牌:', formatterPoke(this.#deck.getPokes().commonPokes))
    this.forEach((player) => {
      const role = player.getRole()

      console.log(
        `${
          role ? roleMap.get(role) : 'unSettled'
        }:  ${player.toString()}; 手牌: ${formatterPoke(player.getHandPokes())}`
      )
    })
  }

  changeButtonToNextPlayer() {
    this.setButton(this.#button!.getNextPlayer()!)
    // this.setOthers()
  }

  /**
   * @description 如果未指定玩家, 则随机选取一位玩家当庄
   * @param player
   * @returns
   */
  setButton(player?: Player) {
    if (player) {
      player.setRole('button')
      this.#button = player
      return
    }
    if (this.#button) {
      this.changeButtonToNextPlayer()
      return
    }

    const count = this.getPlayersCount()
    const random = getRandomInt(0, count - 1)

    this.forEach((p, i) => {
      if (i === random) {
        p.setRole('button')
        this.#button = p
      }
    })
  }

  setOthers() {
    let count = this.#count
    if (process.env.PROJECT_ENV === 'dev' && count === 1) return

    if (count < 2 || count > 10) throw new Error(`暂不支持${count}人的对局`)

    const roles = playerRoleSetMap.get(count)!.slice(1)
    let role: Role
    let current = this.#button?.getNextPlayer()

    while (count - 1) {
      role = roles.shift()!
      if (role) current?.setRole(role)

      current = current?.getNextPlayer()
      count--
    }
  }

  /**
   * @description 获取当前阶段的最大下注额
   */
  getCurrentStageMaxBetAmount() {
    return Math.max(
      ...this.map((player) => player.getCurrentStageTotalAmount())
    )
  }
  getPlayersCount() {
    return this.#count
    // let count = 0
    // let current: Player | null = this.#head
    // const headId = current?.getUserInfo().id

    // while (current) {
    //   count++
    //   current = current.getNextPlayer()
    // }

    // return count
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
  getTotal

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

  resetActionsOfPlayers() {
    this.forEach((p) => p.resetAction())
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

  resetActionsHistory() {
    this.#actionsHistory = []
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

    // 翻牌前从大盲的下一位开始行动
    // 翻牌后从庄家的下一位开始行动
    // const start =
    //   stage === 'pre_flop'
    //     ? this.find(
    //         (player) => player.getRole() === 'big-blind'
    //       )?.getNextPlayer()
    //     : this.#button?.getNextPlayer()

    this.loop((p) => {
      if (!player && p.getStatus() === 'waiting') player = p
    }, this.#button?.getNextPlayer())
    return player
  }

  getPlayersCanAct() {
    return this.filter(
      (player) => player.getStatus() !== 'out' && player.getStatus() !== 'allIn'
    )
  }

  // every(callback: (p: Player, i: number) => boolean) {
  //   let result: boolean
  //   this.loop((p, i) => (result = true))

  //   return result
  // }
  // loopByTheGameController(
  //   callback: (p: Player, i: number, next: (player: Player | null) => void) => void
  // ) {
  //   let index = 0
  //   let current: Player | null | undefined = this.#button?.getNextPlayer()
  //   if (current) callback(current, index, () => this.#controller.transferControlToNext())

  // }
  init() {}
}

export default Dealer
