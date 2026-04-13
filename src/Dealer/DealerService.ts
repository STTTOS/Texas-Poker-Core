import type { Table } from './Table'
import type { Poke } from '@/Deck/constant'
import type { TableStakes } from '@/TableStakes'
import type { GameComponent, TexasErrorCallback } from '@/gameContracts'

import Deck from '@/Deck'
import { getRandomInt } from '@/utils'
import { formatterPoke } from '@/Deck/core'
import { DealtBoard } from '@/Deck/DealtBoard'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import { roleMap, playerRoleSetMap } from '@/Player/constant'
import {
  Role,
  Player,
  RoleEnum,
  isPlayerEligibleForStreetBetting
} from '@/Player'

/**
 * 荷官侧流程：牌堆、角色分配、发牌、行动历史、桌面日志；依赖 {@link Table} 提供座位环与遍历。
 */
export class DealerService implements GameComponent {
  #table: Table
  #deck: Deck
  #dealtBoard: DealtBoard
  #stakes: TableStakes
  #maxTablePlayers: number
  #actionsHistory: Player[] = []
  fail: TexasErrorCallback

  constructor(
    table: Table,
    deck: Deck,
    stakes: TableStakes,
    fail: TexasErrorCallback = (error) => {
      throw error
    },
    options?: { maxTablePlayers?: number }
  ) {
    this.#table = table
    this.#deck = deck
    this.#dealtBoard = new DealtBoard()
    this.#stakes = stakes
    this.#maxTablePlayers = options?.maxTablePlayers ?? 10
    this.fail = fail
  }

  get actionHistory() {
    return this.#actionsHistory
  }

  get deck() {
    return this.#deck
  }

  /** 当前已发手牌与公牌快照（与牌堆对象分离） */
  getPokes() {
    return this.#dealtBoard.getPokes()
  }

  get stakes() {
    return this.#stakes
  }

  get lowestBetAmount() {
    return this.#stakes.bigBlind
  }

  dealCards() {
    if (!this.#table.button)
      return this.fail(new TexasError(TexasCoreErrorCode.DEALER_NO_BUTTON))

    TexasEngineContext.emitTrace({
      channel: 'dealer',
      name: 'deal_cards_players',
      data: {
        players: this.#table.map(
          (player) => roleMap.get(player.getRole()!) + ': ' + player.toString()
        )
      }
    })
    const snapshot = this.#deck.dealCards(this.#table.count)
    this.#dealtBoard.capture(snapshot)
  }

  /**
   * 手牌唯一数据源为 {@link DealtBoard}；下标与发牌顺序一致（从庄家下家起绕桌一圈）。
   */
  getHoleCardsForPlayer(player: Player): Poke[] {
    const { handPokes } = this.getPokes()
    if (!this.#table.button || handPokes.length === 0) return []

    let hole: Poke[] = []
    this.#table.loop((p, i) => {
      if (p === player) hole = handPokes[i] ?? []
    }, this.#table.button.getNextPlayer())
    return hole
  }

  addAction(player: Player) {
    if (this.#actionsHistory.length === this.#table.count) {
      this.#actionsHistory.shift()
    }
    this.#actionsHistory.push(player)
  }

  initialRoles(buttonPlayer?: Player) {
    if (buttonPlayer) {
      if (!this.#table.has(buttonPlayer))
        return this.fail(
          new TexasError(TexasCoreErrorCode.DEALER_BUTTON_HANDOFF_INVALID)
        )
      this.setButton(buttonPlayer)
    } else {
      this.#assignButtonAtRandom()
    }
    this.setOthers()
  }

  reArrangeRoles() {
    if (!this.#table.button)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_REARRANGE_NO_BUTTON)
      )

    const roles = playerRoleSetMap.get(this.#table.count)

    if (!roles)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_UNSUPPORTED_COUNT, {
          count: this.#table.count
        })
      )

    this.#table.loop((player, i) => {
      player.setRole(roles![i])
    }, this.#table.button)
  }

  rotateRolesForNewHand() {
    this.changeButtonToNextPlayer()
    this.setOthers()
  }

  /** @deprecated 请使用 {@link DealerService.initialRoles} */
  setRoles() {
    this.initialRoles()
  }

  log() {
    const lines: string[] = []
    lines.push(`玩家数量: ${this.#table.count}`)
    lines.push('底牌:' + formatterPoke(this.#dealtBoard.getPokes().commonPokes))
    this.#table.forEach((player) => {
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

  getPlayersStillInGame() {
    return this.#table.filter((player) => player.getStatus() !== 'out')
  }

  changeButtonToNextPlayer() {
    const next = this.#table.button?.getNextPlayer()
    if (!next)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_BUTTON_HANDOFF_INVALID)
      )

    this.setButton(next)
  }

  setButton(player: Player) {
    player.setRole(RoleEnum.BTN)
    this.#table.setButtonSeat(player)
  }

  #assignButtonAtRandom() {
    const count = this.#table.count
    if (count < 1)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_COUNT_OUT_OF_RANGE, {
          count
        })
      )

    const random = getRandomInt(0, count - 1)
    this.#table.forEach((p, i) => {
      if (i === random) this.setButton(p)
    })
  }

  setOthers() {
    if (!this.#table.button)
      return this.fail(
        new TexasError(TexasCoreErrorCode.DEALER_SET_OTHERS_NO_BUTTON)
      )

    let count = this.#table.count
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
    let current = this.#table.button.getNextPlayer()

    while (count - 1 && current) {
      role = roles.shift()!
      if (role) current.setRole(role)

      current = current.getNextPlayer()
      count--
    }
  }

  /** 从庄家下家起绕桌一圈的玩家顺序（与行动序一致） */
  getPlayersByActionSequence() {
    const players: Player[] = []
    this.#table.loop((player) => {
      players.push(player)
    })
    return players
  }

  resetCurrentStageTotalAmount() {
    this.#table.forEach((p) => p.resetCurrentStageTotalAmount())
  }

  resetActionsOfPlayers() {
    this.#table.forEach((p) => p.resetAction())
  }

  resetActionsHistory() {
    this.#actionsHistory = []
  }

  reset() {
    this.#dealtBoard.reset()
    this.resetActionsHistory()
    this.#table.forEach((player) => player.reset())
  }

  getTheFirstPlayerToAct(): Player | null {
    let player: Player | null = null

    this.#table.loop((p) => {
      if (!player && isPlayerEligibleForStreetBetting(p)) player = p
    }, this.#table.button?.getNextPlayer())
    return player
  }

  getPlayersCanAct() {
    return this.#table.filter((player) =>
      isPlayerEligibleForStreetBetting(player)
    )
  }
}
