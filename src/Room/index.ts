import type { GameComponent, TexasErrorCallback } from '@/gameContracts'

import Dealer from '@/Dealer'
import { Player } from '@/Player'
import Controller from '@/Controller'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/** 座位/角色是否已由 `ready()` 锁定（原 ready / unReady） */
export type RoomStatus = 'seats_locked' | 'seats_open'
export type PlayerSeatStatus = 'hang' | 'on-set'

export type RoomCreateOptions = {
  dealer: Dealer
  owner: Player
  controller: Controller
  /** 入座玩家默认起始筹码 */
  initialChips: number
  /** 单桌最大入座人数（须 ≤ 角色表支持人数，当前引擎支持 2–10） */
  maximumCountOfPlayers?: number
  fail?: TexasErrorCallback
}

// 房间
class Room implements GameComponent {
  /**
   * 房间的创建者
   */
  #owner: Player
  #status: RoomStatus = 'seats_open'
  #dealer: Dealer
  #lowestBetAmount: number
  #maximumCountOfPlayers: number
  /** 入座玩家默认起始筹码 */
  #initialChips: number
  // #players: Map<Player, PlayerSeatStatus> = new Map()
  #playersOnSet: Set<Player> = new Set()
  #playersHang: Set<Player> = new Set()
  // 存储于id => Player的实例
  #idToPlayerMap: Map<number, Player> = new Map()
  #controller: Controller
  fail: TexasErrorCallback = (error) => {
    throw error
  }

  constructor(options: RoomCreateOptions) {
    const {
      dealer,
      owner,
      controller,
      initialChips,
      maximumCountOfPlayers = 10,
      fail
    } = options
    this.#owner = owner
    this.#dealer = dealer
    this.#controller = controller
    this.#initialChips = initialChips
    this.#maximumCountOfPlayers = maximumCountOfPlayers
    if (fail) this.fail = fail

    const lowestBetAmount = dealer.lowestBetAmount
    this.#lowestBetAmount = lowestBetAmount
    this.join(owner)
  }

  get initialChips() {
    return this.#initialChips
  }
  set initialChips(value: number) {
    this.#initialChips = value
  }

  #beforeSetRoles() {
    if (this.playersCountOnSeat < 2)
      return this.fail(
        new TexasError(TexasCoreErrorCode.ROOM_READY_MIN_SEATED, { min: 2 })
      )

    if (this.#status === 'seats_locked')
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_ALREADY_LOCKED))
  }

  /**
   * 初次进入游戏，锁定座位并分配角色。
   * @param buttonPlayer 可选，指定庄家；省略时由荷官随机。
   */
  initialRoles(buttonPlayer?: Player) {
    this.#beforeSetRoles()

    this.#dealer.initialRoles(buttonPlayer)
    this.#status = 'seats_locked'
  }

  rotateRoles() {
    this.#beforeSetRoles()
    this.#dealer.rotateRolesForNewHand()
    this.#status = 'seats_locked'
  }

  /**由业务层调用, 解锁座位 */
  unlockSeats() {
    this.#status = 'seats_open'
  }

  setOwnerById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)

    this.setOwner(player)
  }
  setOwner(player?: Player) {
    if (!player)
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_OWNER_REQUIRED))

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
      totalCount: this.#players.size,
      hangCount: this.playersCountHang,
      lowestBetAmount: this.#lowestBetAmount,
      onSeatCount: this.playersCountOnSeat,
      maximumCountOfPlayers: this.#maximumCountOfPlayers,
      owner: { ...this.#owner.getUserInfo(), balance: this.#owner.balance },
      initialChips: this.#initialChips
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
   * @description 玩家加入房间（观战席）；入座请调用 seat / seatById
   */
  join(player: Player) {
    if (this.#idToPlayerMap.has(player.getUserInfo().id))
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_DUPLICATE_JOIN))

    // join 只表示进入房间并进入观战席；是否入座由业务层策略决定。
    this.#playersHang.add(player)
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
    if (this.#controller.status !== 'idle')
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_SEAT_NOT_IDLE))

    if (!player || !this.#idToPlayerMap.has(player.getUserInfo().id))
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_SEAT_NOT_MEMBER))

    if (this.getPlayerSeatStatus(player) === 'on-set')
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_SEAT_ALREADY))

    if (this.playersCountOnSeat === this.#maximumCountOfPlayers)
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_SEAT_FULL))

    this.#playersHang.delete(player)
    this.#playersOnSet.add(player)
    this.#dealer.join(player)
  }

  seatById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    this.seat(player)
  }

  watch(player?: Player) {
    if (this.#controller.status !== 'idle')
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_WATCH_NOT_IDLE))

    if (!player || !this.#idToPlayerMap.has(player.getUserInfo().id))
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_WATCH_NOT_MEMBER))

    if (this.getPlayerSeatStatus(player) === 'hang')
      return this.fail(
        new TexasError(TexasCoreErrorCode.ROOM_WATCH_ALREADY_HANG)
      )

    this.#playersHang.add(player)
    this.#playersOnSet.delete(player)
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
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_LEAVE_NOT_MEMBER))

    // 未开局 / 已 reset（idle），或本手已结束待清理（hand_complete）时可离开；进行中不可
    if (
      this.#controller.status === 'idle' ||
      this.#controller.status === 'hand_complete'
    ) {
      // core 不负责房主转移策略：由业务层先 setOwner 再 remove
      if (player === this.#owner) {
        return this.fail(
          new TexasError(TexasCoreErrorCode.ROOM_OWNER_LEAVE_BLOCKED)
        )
      }

      const seatedAtRing = this.#playersOnSet.has(player)
      this.#idToPlayerMap.delete(player.getUserInfo().id)
      if (seatedAtRing) {
        this.#dealer.remove(player)
        this.#playersOnSet.delete(player)
      } else {
        this.#playersHang.delete(player)
      }
      return null
    }
    return this.fail(new TexasError(TexasCoreErrorCode.ROOM_LEAVE_GAME_ACTIVE))
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
    return !!player
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
