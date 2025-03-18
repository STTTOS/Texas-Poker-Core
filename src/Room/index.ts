import Dealer from '@/Dealer'
import { Player } from '@/Player'

type RoomStatus = 'on' | 'waiting'
// 房间
class Room {
  #status: RoomStatus = 'waiting'
  #dealer: Dealer
  #lowestBetAmount: number
  // 是否允许观战
  #allowView = true
  // TODO: 从常量里取
  #maxPlayerCount = 10
  #players: Map<Player, 'hang' | 'on-set'> = new Map()

  constructor(player: Player, dealer: Dealer) {
    this.#dealer = dealer

    const lowestBetAmount = dealer.getLowestBetAmount()
    this.#lowestBetAmount = lowestBetAmount
    this.addPlayer(player)
  }

  ready() {
    if (this.getPlayersOnSet() < 2)
      throw new Error('玩家数量小于2, 无法开始游戏')

    this.#dealer.start()
    this.#status = 'on'
  }

  /**
   * 将所有入座的玩家初始化
   */
  startGame() {
    if (this.getPlayersOnSet() < 2)
      throw new Error('玩家数量小于2, 无法开始游戏')

    this.#dealer.start()
    this.#status = 'on'
    // this.#dealer.settle()
  }

  settle() {
    this.#dealer.settle()
  }

  nextGame() {
    if (this.getPlayersOnSet() < 2)
      throw new Error('玩家数量小于2, 无法开始游戏')

    this.#dealer.start()
    this.#status = 'on'
    // this.#dealer.settle()
  }

  getDealer() {
    return this.#dealer
  }
  getLowestBeAmount() {
    return this.#lowestBetAmount
  }

  getPlayersOnSet() {
    return Array.from(this.#players.values()).filter(
      (item) => item === 'on-set'
    ).length
  }
  getPlayersCount() {
    return this.#players.size
  }

  getPlayersInRoomCount() {
    return this.#players.size
  }

  addPlayer(player: Player) {
    if (this.#players.has(player)) return false

    if (this.#lowestBetAmount !== player.getLowestBetAmount())
      throw new Error('最小下注金额异常, 无法加入对局')

    if (this.#status === 'on') {
      this.#players.set(player, 'hang')
      return false
    }
    // waiting
    if (this.getPlayersOnSet() === this.#maxPlayerCount) {
      this.#players.set(player, 'hang')
      return false
    }

    this.#players.set(player, 'on-set')
    this.#dealer.join(player)
    return true
  }
  /**
   * @description 将观战席的玩家入座
   */
  seat(player: Player) {
    if (!this.#players.has(player)) return false

    if (this.getPlayersOnSet() === this.#maxPlayerCount)
      throw new Error('位置已满,无法加入')

    this.#players.set(player, 'on-set')
    this.#dealer.join(player)
    return true
  }

  getPlayer(player: Player) {
    return this.#players.get(player)
  }
  setStatus(status: RoomStatus) {
    this.#status = status
  }

  removePlayer(player: Player | null) {
    if (!player || !this.#players.has(player)) return false

    this.#dealer.remove(player)
    this.#players.delete(player)
    this.checkIfCloseRoom()
    return true
  }

  /**
   * @description 如果所有玩家都退出了, 自动销毁
   */
  checkIfCloseRoom() {
    if (this.#players.size === 0) {
      // TODO
    }
  }
}

export default Room
