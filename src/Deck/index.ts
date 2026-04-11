import { ranks, suits, type Poke } from './constant'

/**
 * 牌堆与发牌流程：生成 52 张牌、洗牌、按德州规则发手牌与公牌（含烧牌），并缓存上一手发牌结果供查询。
 * 牌力/牌型比较在 `./core` 纯函数中完成，本类不承载评估逻辑。
 */
class Deck {
  #deck: Poke[] = []
  /**
   * 各玩家的手牌（每人 2 张）
   */
  #handPokes: Array<Poke[]> = []
  /**
   * 公共牌
   */
  #commonPokes: Poke[] = []

  constructor() {
    this.#createShuffledDeck()
  }

  #createDeck() {
    const pokes = new Array(suits.length * ranks.length)
      .fill(0)
      .map(
        (_, i) =>
          `${suits[Math.floor(i / ranks.length)]}${
            ranks[i % ranks.length]
          }` as Poke
      )
    this.#deck = pokes
  }

  #shuffle() {
    for (let i = this.#deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.#deck[i], this.#deck[j]] = [this.#deck[j], this.#deck[i]]
    }
  }

  reset() {
    this.#commonPokes = []
    this.#handPokes = []
  }

  shuffle() {
    this.#shuffle()
  }

  #createShuffledDeck() {
    this.#createDeck()
    this.#shuffle()
  }

  /**
   * @description 给玩家发牌
   * @param count 玩家数量
   * @returns
   */
  dealCards(count: number) {
    this.#shuffle()
    /**
     * 后续有烧牌的操作, 不影响原数组
     */
    const deck = [...this.#deck]

    // 初始化玩家手牌数组
    const handPokes: Poke[][] = Array.from({ length: count }, () => [])

    // 按轮发牌（德州扑克标准顺序）
    for (let round = 0; round < 2; round++) {
      for (let player = 0; player < count; player++) {
        const card = deck.shift()!
        handPokes[player].push(card)
      }
    }

    // 发公共牌（含烧牌）
    const burnAndTake = (count: number): Poke[] => {
      // 烧牌
      deck.shift()
      return deck.splice(0, count)
    }

    // 翻牌
    const flop = burnAndTake(3)
    // 转牌
    const turn = burnAndTake(1)
    // 河牌
    const river = burnAndTake(1)

    const commonPokes = [...flop, ...turn, ...river]
    this.#commonPokes = commonPokes
    this.#handPokes = handPokes

    return {
      handPokes,
      commonPokes
    }
  }

  // 获取公牌以及玩家的手牌
  getPokes() {
    return {
      handPokes: this.#handPokes,
      commonPokes: this.#commonPokes
    }
  }

  // 获取所有牌
  getCards() {
    return this.#deck
  }
}
export default Deck
