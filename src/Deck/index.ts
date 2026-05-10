import { type Poke } from './constant'
import { createStandardDeckPokes } from './standardDeck'

const TWO_POW_32 = 0x1_0000_0000

/**
 * 均匀整数 `j` 满足 `0 <= j < n`（用于 Fisher–Yates 时 `n = maxInclusive + 1`）。
 * - **生产 / RN**：`crypto.getRandomValues` + 拒绝采样，避免 `uint32 % n` 的 modulo bias；比 `Math.random` 更不可预测。
 * - **Jest**：`NODE_ENV === 'test'` 时只用 `Math.random`，以便 `jest.spyOn(Math, 'random')` 固定发牌序（golden / imperative 对拍）。
 *
 * 更稳妥的架构化做法是构造 `Deck` 时注入 `() => number` 或 `randomInt(max)`；当前以零配置为先。
 */
function randomIntBelow(n: number): number {
  if (n <= 0) {
    throw new Error(`Deck shuffle: invalid range n=${n}`)
  }
  const inJestTest =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
  if (!inJestTest) {
    const c = globalThis.crypto
    if (c?.getRandomValues) {
      const limit = TWO_POW_32 - (TWO_POW_32 % n)
      const buf = new Uint32Array(1)
      let v: number
      do {
        c.getRandomValues(buf)
        v = buf[0]!
      } while (v >= limit)
      return v % n
    }
  }
  return Math.floor(Math.random() * n)
}

function randomIntInclusive(maxInclusive: number): number {
  return randomIntBelow(maxInclusive + 1)
}

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

  /** Fisher–Yates；索引用 `crypto.getRandomValues`（若可用），否则回退 `Math.random`。 */
  #shuffle() {
    for (let i = this.#deck.length - 1; i > 0; i--) {
      const j = randomIntInclusive(i)
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
