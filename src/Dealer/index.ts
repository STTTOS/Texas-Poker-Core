import Deck from '@/Deck'
import { getRandomInt } from '@/utils'
import { Role, Player } from '@/Player'
import { handPokeMap, handPokeType } from '@/Deck/constant'
import { roleMap, playerRoleSetMap } from '@/Player/constant'
import { formatter, getBestPokesPresentation } from '@/Deck/core'

interface SidePool {
  amount: number
  players: Player[]
}
type GameStatus = 'waiting' | 'in-progress'
/**
 * 荷官, 控制游戏进行
 */
class Dealer {
  #status: GameStatus = 'waiting'
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
  /**
   * 存储玩家信息
   */
  #positions: Player[] = []
  /**
   * 主池
   */
  #mainPool = 0
  /**
   * 边池可能会形成多个
   */
  #sidePools: SidePool[] = []

  constructor(lowestBetAmount: number) {
    this.#lowestBetAmount = lowestBetAmount
    // this.#buttonId = user.id

    this.#deck = new Deck()
  }

  /**
   * 开始游戏
   */
  start() {
    this.setRoleToPlayers()
    this.dealCards()
  }

  dealCards() {
    const { handPokes } = this.#deck.dealCards(this.getPlayersCount())
    this.loop((player, i) => {
      player.setHandPokes(handPokes[i])
    })
  }
  getDeck() {
    return this.#deck
  }

  getHeadPlayer() {
    return this.#head
  }

  getLowestBetAmount() {
    return this.#lowestBetAmount
  }
  setRoleToPlayers() {
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
   * 根据当前的牌局给各个玩家结算, 将底池和边池分给对应的赢家, 并调用api
   */
  settle() {
    const maxPresentation = getBestPokesPresentation(
      this.map((player) => player.getHandPokes()),
      this.#deck.getPokes().commonPokes
    )
    console.log(maxPresentation)

    const winners = this.filter((player) => {
      return (
        getBestPokesPresentation(
          [player.getHandPokes()],
          this.#deck.getPokes().commonPokes
        ) === maxPresentation
      )
    })
    this.log()
    console.log('底牌:', formatter(this.#deck.getPokes().commonPokes))
    console.log('赢家:')

    winners.forEach((winner) => {
      const presentation = getBestPokesPresentation(
        [winner.getHandPokes()],
        this.#deck.getPokes().commonPokes
      )
      console.log(
        ` ${handPokeMap.get(
          presentation[0] as handPokeType
        )}, ${winner.toString()},手牌: ${formatter(winner.getHandPokes())}`
      )
    })
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
    return true
  }

  join(player: Player) {
    if (this.has(player)) return false
    this.#count++

    // this.#head.setLastPlayer(player)

    // const player = new Player({
    //   user,
    //   lowestBeAmount: this.#lowestBetAmount,
    //   nextPlayer: this.#head
    // })

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
    return true
  }

  has(player: Player) {
    return !!this.find((p) => p === player)
  }

  log() {
    console.log(`玩家数量: ${this.getPlayersCount()}`)
    this.forEach((player) => {
      const role = player.getRole()

      console.log(
        `${
          role ? roleMap.get(role) : 'unSettled'
        }:  ${player.toString()}; 手牌: ${formatter(player.getHandPokes())}`
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

  map<T>(callback: (p: Player, i: number) => T): T[] {
    const result: T[] = []
    this.forEach((player, i) => {
      result.push(callback(player, i))
    })
    return result
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
   * @description 从指定的玩家开始, 默认从庄家, 遍历一轮
   * @param callback
   * @param startFrom
   */
  loop(
    callback: (p: Player, i: number) => void,
    startFrom: Player | null = this.#button
  ) {
    let index = 0
    let current: Player | null = startFrom
    let count = this.#count

    while (count && current) {
      if (current) callback(current, index)

      index++
      count--
      current = current.getNextPlayer()
    }
  }
  init() {}
}
export default Dealer
