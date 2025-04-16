import { omit } from 'ramda'

import Dealer from '@/Dealer'
import TexasError from '@/error'
import { Player } from '@/Player'
import Controller from '@/Controller'
import { GameComponent, TexasErrorCallback } from '@/Texas'

export type RoomStatus = 'ready' | 'unReady'
export type PlayerSeatStatus = 'hang' | 'on-set'
// 房间
class Room implements GameComponent {
  /**
   * 房间为 公开 / 私密; 如果是私密房间, 只可以受邀进入
   */
  #private = false
  /**
   * 房间秘钥, 仅匹配后(通过分享)才可加入
   */
  #privateKey?: string
  /**
   * 房间的创建者
   */
  #owner: Player
  #status: RoomStatus = 'unReady'
  #dealer: Dealer
  #lowestBetAmount: number
  // 是否允许观战
  #allowPlayersToWatch: boolean
  #maximumCountOfPlayers: number
  // #players: Map<Player, PlayerSeatStatus> = new Map()
  #playersOnSet: Set<Player> = new Set()
  #playersHang: Set<Player> = new Set()
  // 存储于id => Player的实例
  #idToPlayerMap: Map<number, Player> = new Map()
  #controller: Controller
  reportError: TexasErrorCallback = (error) => {
    throw error
  }

  constructor(
    dealer: Dealer,
    player: Player,
    controller: Controller,
    allowPlayersToWatch = true,
    maximumCountOfPlayers = 10,
    reportError: TexasErrorCallback = (error) => {
      throw error
    }
  ) {
    this.#owner = player
    this.#dealer = dealer
    this.#controller = controller
    this.#allowPlayersToWatch = allowPlayersToWatch
    this.#maximumCountOfPlayers = maximumCountOfPlayers
    this.reportError = reportError

    const lowestBetAmount = dealer.lowestBetAmount
    this.#lowestBetAmount = lowestBetAmount
    this.join(player)
  }

  ready() {
    if (this.playersCountOnSeat < 2)
      this.reportError(new TexasError(2000, '玩家数量小于2, 无法进行游戏'))

    if (this.#status === 'ready')
      this.reportError(new TexasError(2100, '玩家位置已确认,请勿重复设置'))

    this.#dealer.setRoles()
    this.#status = 'ready'
  }

  setOwnerById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)

    this.setOwner(player)
  }
  setOwner(player?: Player) {
    if (!player) this.reportError(new TexasError(2000, '房主不可为空'))

    this.#owner = player
  }

  get owner() {
    return this.#owner
  }

  /**
   * 获取房间的基本信息
   */
  getBaseInfo() {
    return {
      status: this.#status,
      private: this.#private,
      totalCount: this.#players.size,
      hangCount: this.playersCountHang,
      lowestBetAmount: this.#lowestBetAmount,
      onSeatCount: this.playersCountOnSeat,
      allowPlayersToWatch: this.#allowPlayersToWatch,
      maximumCountOfPlayers: this.#maximumCountOfPlayers,
      owner: omit(['balance'], this.#owner.getUserInfo())
    }
  }

  getAllPlayers() {
    return Array.from(this.#players.values())
  }

  get #players() {
    return new Set([...this.#playersOnSet, ...this.#playersHang])
  }

  get totalPlayersCount() {
    return this.playersCountHang + this.playersCountOnSeat
  }
  get playersCountOnSeat() {
    return this.#playersOnSet.size
  }
  get playersCountHang() {
    return this.#playersHang.size
  }

  getPlayersBySeatStatus(status: PlayerSeatStatus) {
    return Array.from(
      status === 'on-set' ? this.#playersOnSet : this.#playersHang
    )
  }
  /**
   * @description 根据id返回player实例 以及 用户是否在桌上/观战席
   * @param userId
   * @returns
   */
  getPlayerById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    return player
  }
  getDealer() {
    return this.#dealer
  }
  get lowestBetAmount() {
    return this.#lowestBetAmount
  }

  joinMany(...players: Player[]) {
    players.forEach((player) => this.join(player))
  }

  /**
   * @description 玩家加入房间, 如果位置还够, 会自动入座
   * @param player
   * @returns
   */
  join(player: Player, key?: string) {
    if (this.#idToPlayerMap.has(player.getUserInfo().id))
      this.reportError(new TexasError(2003, '您已经在房间中,不可重复加入'))

    if (this.#private && this.#privateKey !== key)
      this.reportError(new TexasError(2003, '私密房间不可加入'))

    if (
      !this.#allowPlayersToWatch &&
      this.playersCountOnSeat === this.#maximumCountOfPlayers
    )
      this.reportError(
        new TexasError(2003, '房间设置了不可观战,并且玩家已满,不可加入')
      )

    if (
      !this.#allowPlayersToWatch &&
      player.lowestBetAmount < this.#lowestBetAmount
    )
      this.reportError(
        new TexasError(
          2003,
          '房间设置了不可观战, 并且您的余额小于房间的最底下注,无法加入'
        )
      )

    const seatStatus: PlayerSeatStatus =
      this.playersCountOnSeat === this.#maximumCountOfPlayers
        ? 'hang'
        : 'on-set'

    if (seatStatus === 'hang') {
      this.#playersHang.add(player)
    } else {
      this.#dealer.join(player)
      this.#playersOnSet.add(player)
    }
    this.#idToPlayerMap.set(player.getUserInfo().id, player)
  }

  getPlayerSeatStatus(player: Player) {
    if (this.#playersOnSet.has(player)) return 'on-set'
    return 'hang'
  }
  getPlayerSeatStatusById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    if (!player) return null

    return this.getPlayerSeatStatus(player)
  }
  /**
   * @description 将观战席的玩家入座
   */
  seat(player?: Player) {
    if (!player || !this.#idToPlayerMap.has(player.getUserInfo().id))
      this.reportError(new TexasError(2003, '您不在房间中,无法入座'))

    if (this.getPlayerSeatStatus(player) === 'on-set')
      this.reportError(new TexasError(2003, '您已在坐席中,请勿重复操作'))

    if (this.playersCountOnSeat === this.#maximumCountOfPlayers)
      this.reportError(new TexasError(2003, '位置已满,无法加入坐席'))

    this.#playersOnSet.add(player)
    this.#dealer.join(player)
  }

  seatById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    this.seat(player)
  }

  watch(player?: Player) {
    if (!player || !this.#idToPlayerMap.has(player.getUserInfo().id))
      this.reportError(new TexasError(2003, '您不在房间中,无法观战'))

    if (this.getPlayerSeatStatus(player) === 'hang')
      this.reportError(new TexasError(2003, '您已再观战席中,请勿重复操作'))

    this.#playersHang.add(player)
    this.#dealer.remove(player)
  }

  watchById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    this.watch(player)
  }

  /**
   * @description 玩家退出房间
   * @param player
   */
  remove(player?: Player): number | null {
    if (!player || !this.#players.has(player))
      this.reportError(new TexasError(2003, '您不在房间中,无法退出'))

    // 在游戏没开始时离开
    if (this.#controller.status === 'waiting') {
      this.#idToPlayerMap.delete(player.getUserInfo().id)
      this.#dealer.remove(player)
      if (this.getPlayerSeatStatus(player) === 'hang') {
        this.#playersHang.delete(player)
      } else {
        this.#playersOnSet.delete(player)
      }

      const newOwner = player.getNextPlayer()
      if (!newOwner) return null

      this.setOwner(newOwner)
      return newOwner.getUserInfo().id
    }
    this.reportError(new TexasError(2003, '游戏进行中, 不可退出'))
  }

  removeById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    return this.remove(player)
  }

  get status() {
    return this.#status
  }

  has(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    return !!player && this.#players.has(player)
  }

  setStatus(status: RoomStatus) {
    this.#status = status
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
