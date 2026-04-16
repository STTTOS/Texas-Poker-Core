import type { PlayerDealerRing } from '@/playerSessionPorts'
import type { GameComponent, TexasErrorCallback } from '@/gameContracts'

import Deck from '@/Deck'
import { Table } from './Table'
import { Player } from '@/Player'
import { TableStakes } from '@/TableStakes'
import { DealerService } from './DealerService'

export { Table } from './Table'
export { DealerService } from './DealerService'

/**
 * 对外门面：组合 {@link Table}（座位环）与 {@link DealerService}（发牌与角色流程），保持原有 API。
 * 需要单独扩展座位逻辑或荷官逻辑时，可访问 `table` / `service`。
 */
class Dealer implements GameComponent, PlayerDealerRing<Player> {
  readonly #table: Table
  readonly #service: DealerService
  fail: TexasErrorCallback

  constructor(
    stakes: TableStakes | number,
    fail: TexasErrorCallback = (error) => {
      throw error
    },
    options?: { maxTablePlayers?: number }
  ) {
    this.fail = fail
    this.#table = new Table(this.fail)
    const deck = new Deck()
    const resolvedStakes =
      typeof stakes === 'number' ? new TableStakes(stakes) : stakes
    this.#service = new DealerService(
      this.#table,
      deck,
      resolvedStakes,
      this.fail,
      options
    )
  }

  /** 环形座位与遍历；不含发牌与角色业务规则 */
  get table() {
    return this.#table
  }

  /** 牌堆、角色、发牌、行动历史等 */
  get service() {
    return this.#service
  }

  get actionHistory() {
    return this.#service.actionHistory
  }

  get count() {
    return this.#table.count
  }

  get button() {
    return this.#table.button
  }

  get deck() {
    return this.#service.deck
  }

  /** 已发手牌与公牌（由 DealerService 内 DealtBoard 持有，与 52 张牌堆分离） */
  getPokes() {
    return this.#service.getPokes()
  }

  /** 该玩家在 {@link DealtBoard} 中对应座位的手牌（Player 不再私有缓存） */
  getHoleCardsForPlayer(player: Player) {
    return this.#service.getHoleCardsForPlayer(player)
  }

  get players() {
    return this.#table.players
  }

  get stakes() {
    return this.#service.stakes
  }

  /** 大盲注额；与 `stakes.bigBlind` 同义 */
  get lowestBetAmount() {
    return this.#service.lowestBetAmount
  }

  dealCards() {
    this.#service.dealCards()
  }

  addAction(player: Player) {
    this.#service.addAction(player)
  }

  initialRoles(buttonPlayer?: Player) {
    this.#service.initialRoles(buttonPlayer)
  }

  reArrangeRoles() {
    this.#service.reArrangeRoles()
  }

  rotateRolesForNewHand() {
    this.#service.rotateRolesForNewHand()
  }

  remove(player: Player): void {
    this.#table.remove(player)
    if (this.#table.count > 0 && this.#table.button) {
      this.#service.reArrangeRoles()
    }
  }

  /**
   * @param options.insertAfter 若给定，则新座位插在**该玩家顺时针下家**一侧（房规：插在 **BB 之后** 时传大盲位玩家）。
   */
  join(
    player: Player,
    options?: {
      insertAfter: Player
    }
  ): void {
    if (options?.insertAfter) {
      this.#table.joinAfter(options.insertAfter, player)
    } else {
      this.#table.join(player)
    }
    if (this.#table.button) this.#service.reArrangeRoles()
  }

  has(player: Player) {
    return this.#table.has(player)
  }

  hasById(userId: number) {
    return this.#table.hasById(userId)
  }

  get(player: Player) {
    return this.#table.get(player)
  }

  getById(userId: number) {
    return this.#table.getById(userId)
  }

  log() {
    this.#service.log()
  }

  getPlayersStillInGame() {
    return this.#service.getPlayersStillInGame()
  }

  changeButtonToNextPlayer() {
    this.#service.changeButtonToNextPlayer()
  }

  setButton(player: Player) {
    this.#service.setButton(player)
  }

  setOthers() {
    this.#service.setOthers()
  }

  getPlayersByActionSequence() {
    return this.#service.getPlayersByActionSequence()
  }

  forEach(callback: (p: Player, i: number) => void) {
    this.#table.forEach(callback)
  }

  map<T>(callback: (p: Player, i: number) => T): T[] {
    return this.#table.map(callback)
  }

  every(callback: (p: Player, i: number) => boolean): boolean {
    return this.#table.every(callback)
  }

  resetCurrentStageTotalAmount() {
    this.#service.resetCurrentStageTotalAmount()
  }

  resetActionsOfPlayers() {
    this.#service.resetActionsOfPlayers()
  }

  resetActionsHistory() {
    this.#service.resetActionsHistory()
  }

  reset() {
    this.#service.reset()
  }

  findReverse(callback: (p: Player) => boolean, from: Player | null) {
    return this.#table.findReverse(callback, from)
  }

  filter(callback: (p: Player, i: number) => boolean): Player[] {
    return this.#table.filter(callback)
  }

  find(callback: (p: Player) => boolean) {
    return this.#table.find(callback)
  }

  loop(callback: (p: Player, i: number) => void, startFrom?: Player | null) {
    this.#table.loop(callback, startFrom)
  }

  getTheFirstPlayerToAct(): Player | null {
    return this.#service.getTheFirstPlayerToAct()
  }

  getPlayersCanAct() {
    return this.#service.getPlayersCanAct()
  }
}

export default Dealer
