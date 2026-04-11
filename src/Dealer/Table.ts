import type { TexasErrorCallback } from '@/gameContracts'

import { Player } from '@/Player'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/**
 * 环形座位：入座/离座、head/last、庄家位标记（仅引用，不负责 BTN/SB/BB 语义分配）。
 * 非法入座/离座通过 `fail` 抛出 {@link TexasError}，与 Room / Dealer 层 fail-fast 一致。
 */
export class Table {
  #fail: TexasErrorCallback
  #count = 0
  #button: Player | null = null
  #head: Player | null = null
  #last: Player | null = null

  constructor(fail: TexasErrorCallback) {
    this.#fail = fail
  }

  get count() {
    return this.#count
  }

  get button() {
    return this.#button
  }

  /**
   * 设置庄家位标记（仅引用，不写角色枚举）。
   * 清空请用 {@link clearButtonSeat}，避免 `setButtonSeat(null)` 语义含糊。
   */
  setButtonSeat(player: Player) {
    this.#button = player
  }

  /** 清空庄家位标记（例如桌上已无玩家） */
  clearButtonSeat() {
    this.#button = null
  }

  get players() {
    return this.map((p) => p)
  }

  join(player: Player): void {
    if (this.has(player)) {
      return this.#fail(
        new TexasError(TexasCoreErrorCode.DEALER_TABLE_JOIN_DUPLICATE, {
          userId: player.id
        })
      )
    }

    this.#count++

    if (!this.#head) {
      this.#head = player
      this.#last = player
      return
    }

    player.setLastPlayer(this.#last)
    player.setNextPlayer(this.#head)
    this.#last?.setNextPlayer(player)
    this.#head?.setLastPlayer(player)

    this.#last = player
  }

  remove(player: Player): void {
    if (!this.has(player)) {
      return this.#fail(
        new TexasError(TexasCoreErrorCode.DEALER_TABLE_REMOVE_NOT_SEATED, {
          userId: player.id
        })
      )
    }

    if (this.#count === 1) {
      this.#head = null
      this.#last = null
      this.clearButtonSeat()
      this.#count = 0
      return
    }

    if (this.#head === player) {
      this.#head = player.getNextPlayer()
    }
    if (this.#button === player) {
      const nextBtn = player.getNextPlayer()
      if (nextBtn) this.setButtonSeat(nextBtn)
      else this.clearButtonSeat()
    }
    if (this.#last === player) {
      this.#last = player.getLastPlayer()
    }

    player.getLastPlayer()?.setNextPlayer(player.getNextPlayer())
    player.getNextPlayer()?.setLastPlayer(player.getLastPlayer())
    this.#count--
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
    return this.find((p) => p.id === userId)
  }

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
      if (callback(current)) return current
      current = current.getNextPlayer()
      count--
    }
    return null
  }

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
}
