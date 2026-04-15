import type { TableStakes } from '@/TableStakes'
import type { GameComponent, TexasErrorCallback } from '@/gameContracts'

import Dealer from '@/Dealer'
import { Player } from '@/Player'
import TexasError, {
  TexasCoreErrorCode,
  type TexasErrorCode
} from '@/TexasError'

/** 座位/角色是否已由 `initialRoles` / `rotateRoles` 锁定；与 {@link Controller} 生命周期解耦 */
export type RoomStatus = 'seats_locked' | 'seats_open'
export type PlayerSeatStatus = 'hang' | 'on-set'

/** {@link Room.getMemberCounts} 返回值：在座、观战与合计 */
export type RoomMemberCounts = {
  onSeat: number
  hang: number
  total: number
}

export type RoomCreateOptions = {
  dealer: Dealer
  owner: Player
  /** 入座玩家默认起始筹码 */
  initialChips: number
  /** 房间内最大人数：`hang` + `on-set` 总和上限（须 ≤ 角色表支持人数，当前引擎支持 2–10） */
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
  #stakes: TableStakes
  #maximumCountOfPlayers: number
  /** 入座玩家默认起始筹码 */
  #initialChips: number
  #playersOnSet: Set<Player> = new Set()
  #playersHang: Set<Player> = new Set()
  // 存储于id => Player的实例
  #idToPlayerMap: Map<number, Player> = new Map()
  fail: TexasErrorCallback = (error) => {
    throw error
  }

  constructor(options: RoomCreateOptions) {
    const {
      dealer,
      owner,
      initialChips,
      maximumCountOfPlayers = 10,
      fail
    } = options
    this.#owner = owner
    this.#dealer = dealer
    this.#initialChips = initialChips
    this.#maximumCountOfPlayers = maximumCountOfPlayers
    if (fail) this.fail = fail

    this.#stakes = dealer.stakes
    this.join(owner)
  }

  get initialChips() {
    return this.#initialChips
  }
  set initialChips(value: number) {
    this.#initialChips = value
  }

  /** 仅当 `seats_open` 时通过；否则抛出给定错误码（设角色与座位结构变更复用同一谓词） */
  #assertSeatsOpen(code: TexasErrorCode) {
    if (this.#status !== 'seats_open') {
      return this.fail(new TexasError(code))
    }
  }

  #beforeSetRoles() {
    if (this.playersCountOnSeat < 2)
      return this.fail(
        new TexasError(TexasCoreErrorCode.ROOM_READY_MIN_SEATED, { min: 2 })
      )

    this.#assertSeatsOpen(TexasCoreErrorCode.ROOM_ALREADY_LOCKED)
  }

  /**
   * 初次进入游戏，锁定座位并分配角色。
   * @param buttonPlayer 可选，指定庄家；省略时由荷官随机。
   */
  initialRoles(buttonPlayer?: Player) {
    this.#beforeSetRoles()

    this.#dealer.initialRoles(buttonPlayer)
    this.lockSeats()
  }

  rotateRoles() {
    this.#beforeSetRoles()
    this.#dealer.rotateRolesForNewHand()
    this.lockSeats()
  }

  /** 与 `unlockSeats` 成对；`initialRoles` / `rotateRoles` 内部也会调用 */
  lockSeats() {
    this.#status = 'seats_locked'
  }

  /** 开放入座、离座、观战切换等；通常由 {@link Texas.reset} 在一手收尾后调用 */
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
      lowestBetAmount: this.#stakes.bigBlind,
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

  /** 在座 / 观战人数及合计（与 `maximumCountOfPlayers` 口径一致） */
  getMemberCounts(): RoomMemberCounts {
    const onSeat = this.playersCountOnSeat
    const hang = this.playersCountHang
    return { onSeat, hang, total: onSeat + hang }
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
    return this.#stakes.bigBlind
  }

  get stakes() {
    return this.#stakes
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

    if (this.totalPlayersCount >= this.#maximumCountOfPlayers) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.ROOM_JOIN_FULL, {
          max: this.#maximumCountOfPlayers
        })
      )
    }

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
   * @description 将观战席的玩家入座（须 `seats_open`）
   */
  seat(player?: Player) {
    this.#assertSeatsOpen(TexasCoreErrorCode.ROOM_SEATS_LOCKED_FOR_MUTATION)

    if (!player || !this.#idToPlayerMap.has(player.getUserInfo().id))
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_SEAT_NOT_MEMBER))

    if (this.getPlayerSeatStatus(player) === 'on-set')
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_SEAT_ALREADY))

    this.#playersHang.delete(player)
    this.#playersOnSet.add(player)
    this.#dealer.join(player)
  }

  seatById(userId: number) {
    const player = this.#idToPlayerMap.get(userId)
    this.seat(player)
  }

  watch(player?: Player) {
    this.#assertSeatsOpen(TexasCoreErrorCode.ROOM_SEATS_LOCKED_FOR_MUTATION)

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
   * @description 玩家退出房间。仅 **已入座**（`on-set`、在环上）时在 `seats_locked` 下会拦截；
   * 仅观战（`hang`）可随时离房，不触发锁座校验。
   * @param player
   */
  remove(player?: Player): number | null {
    if (!player || !this.#players.has(player))
      return this.fail(new TexasError(TexasCoreErrorCode.ROOM_LEAVE_NOT_MEMBER))

    const seatedAtRing = this.#playersOnSet.has(player)
    if (seatedAtRing) {
      this.#assertSeatsOpen(TexasCoreErrorCode.ROOM_SEATS_LOCKED_FOR_MUTATION)
    }

    // core 不负责房主转移策略：由业务层先 setOwner 再 remove
    if (player === this.#owner) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.ROOM_OWNER_LEAVE_BLOCKED)
      )
    }

    this.#idToPlayerMap.delete(player.getUserInfo().id)
    if (seatedAtRing) {
      this.#dealer.remove(player)
      this.#playersOnSet.delete(player)
    } else {
      this.#playersHang.delete(player)
    }
    return null
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
