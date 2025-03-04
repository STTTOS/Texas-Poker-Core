import { getBestPokesPresentation } from './core'
import { ranks, suits, type Poke, handPokeType } from './constant'

/**
 * 洗牌, 发牌
 */
class Deck {
  #deck: Poke[] = []
  /**
   * 玩家的手牌
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
    // this.#deck.sort(() => Math.random() - 0.5)
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
    const requiredCards = 2 * count + 8 // 手牌(2n) + 烧牌(3) + 公共牌(5)

    if (this.#deck.length < requiredCards) {
      this.#createShuffledDeck()
    }

    // 初始化玩家手牌数组
    const handPokes: Poke[][] = Array.from({ length: count }, () => [])

    // 按轮发牌（德州扑克标准顺序）
    for (let round = 0; round < 2; round++) {
      for (let player = 0; player < count; player++) {
        const card = this.#deck.shift()!
        handPokes[player].push(card)
      }
    }

    // 发公共牌（含烧牌）
    const burnAndTake = (count: number): Poke[] => {
      this.#deck.shift() // 烧牌
      return this.#deck.splice(0, count)
    }

    const flop = burnAndTake(3) // 翻牌
    const turn = burnAndTake(1) // 转牌
    const river = burnAndTake(1) // 河牌

    const commonPokes = [...flop, ...turn, ...river]
    this.#commonPokes = commonPokes
    this.#handPokes = handPokes

    return {
      handPokes,
      commonPokes
    }
  }

  getPokes() {
    return {
      handPokes: this.#handPokes,
      commonPokes: this.#commonPokes
    }
  }

  getMax() {
    const presentation = getBestPokesPresentation(
      this.#handPokes,
      this.#commonPokes
    )
    return {
      type: presentation[0] as handPokeType,
      value: presentation
    }
  }
}
export default Deck
