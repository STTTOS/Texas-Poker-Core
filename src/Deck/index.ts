import { type Poke } from './constant'
import { createStandardDeckPokes } from './standardDeck'

/**
 * 52 张牌堆：生成、洗牌、按德州规则发手牌与公牌（含烧牌）。
 * 发牌结果由调用方写入 {@link DealtBoard}，本类不缓存手牌/公牌。
 */
class Deck {
  #deck: Poke[] = []

  constructor() {
    this.#createShuffledDeck()
  }

  #createDeck() {
    this.#deck = createStandardDeckPokes()
  }

  #shuffle() {
    for (let i = this.#deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.#deck[i], this.#deck[j]] = [this.#deck[j], this.#deck[i]]
    }
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
   */
  dealCards(count: number): { handPokes: Poke[][]; commonPokes: Poke[] } {
    this.#shuffle()
    const deck = [...this.#deck]

    const handPokes: Poke[][] = Array.from({ length: count }, () => [])

    for (let round = 0; round < 2; round++) {
      for (let player = 0; player < count; player++) {
        const card = deck.shift()!
        handPokes[player].push(card)
      }
    }

    const burnAndTake = (take: number): Poke[] => {
      deck.shift()
      return deck.splice(0, take)
    }

    const flop = burnAndTake(3)
    const turn = burnAndTake(1)
    const river = burnAndTake(1)

    const commonPokes = [...flop, ...turn, ...river]

    return {
      handPokes,
      commonPokes
    }
  }

  getCards() {
    return this.#deck
  }
}
export default Deck
