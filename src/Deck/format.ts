import { Poke, Suit, suitsMap } from './constant'

/**
 * 展示用：将 Poke 格式化为可读字符串（与牌力计算无关）。
 */
export const formatterPoke = (input: Poke[]) => {
  return input
    .map((item) => `${suitsMap.get(item[0] as Suit)}${item[1].toUpperCase()}`)
    .join(',')
}
