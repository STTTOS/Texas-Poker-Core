import { ranks, suits, type Poke } from './constant'

/**
 * 生成标准 52 张牌（无洗牌）。
 * 顺序与 `Deck` 内部建牌一致：按 `suits` 顺序，每种花色内 `ranks` 从 2 到 a（如 `h2`…`ha`，再 `s2`…）。
 */
export function createStandardDeckPokes(): Poke[] {
  const n = suits.length * ranks.length
  const out: Poke[] = new Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = `${suits[Math.floor(i / ranks.length)]}${
      ranks[i % ranks.length]
    }` as Poke
  }
  return out
}
