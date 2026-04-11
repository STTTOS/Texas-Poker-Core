import type { Poke } from './constant'

export type DealSnapshot = { handPokes: Poke[][]; commonPokes: Poke[] }

/**
 * 上一手发牌结果（手牌矩阵 + 公牌），与 52 张牌堆 {@link Deck} 解耦。
 */
export class DealtBoard {
  #handPokes: Poke[][] = []
  #commonPokes: Poke[] = []

  capture(snapshot: DealSnapshot) {
    this.#handPokes = snapshot.handPokes
    this.#commonPokes = snapshot.commonPokes
  }

  reset() {
    this.#handPokes = []
    this.#commonPokes = []
  }

  getPokes(): DealSnapshot {
    return {
      handPokes: this.#handPokes,
      commonPokes: this.#commonPokes
    }
  }
}
