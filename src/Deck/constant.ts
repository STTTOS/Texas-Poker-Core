export const suits = ['h', 's', 'd', 'c'] as const
export const ranks = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  't',
  'j',
  'q',
  'k',
  'a'
] as const

/**
 * h: 红心
 * s: 黑桃
 * d: 方块
 * c: 梅花
 */
export type Suit = (typeof suits)[number]
// 大小
export type Rank = (typeof ranks)[number]
/**
 * 扑克牌的存储 比如h2, h8
 */
export type Poke = `${Suit}${Rank}`

/**
 * 2 + 5 一共7张牌的组合
 */
export type HandPoke = Poke[]
/**牌型枚举 */
export type handPokeType =
  /*
   * 皇家同花顺
   */
  | 'z'
  /*
   * 同花顺
   */
  | 'y'
  /*
   * 四条
   */
  | 'x'
  /*
   * 葫芦
   */
  | 'w'
  /*
   * 同花
   */
  | 'v'
  /*
   * 顺子
   */
  | 'u'
  /*
   * 三条
   */
  | 't'
  /*
   * 两对
   */
  | 's'
  /*
   * 一对
   */
  | 'r'
  /*
   * 高牌
   */
  | 'q'

/**
 * 花色format map
 */
export const suitsMap = new Map<Suit, string>([
  /*
   * hearts, spades, Diamonds, Clubs
   */
  ['h', '♥'],
  ['s', '♠'],
  ['d', '♦️'],
  ['c', '♣']
])
// 牌型枚举中文映射
export const handPokeMap = new Map<handPokeType, string>([
  ['z', '皇家同花顺'],
  ['y', '同花顺'],
  ['x', '四条'],
  ['w', '葫芦'],
  ['v', '同花'],
  ['u', '顺子'],
  ['t', '三条'],
  ['s', '两对'],
  ['r', '一对'],
  ['q', '高牌']
])

// 牌面值的大小映射 2~A => 2~14
export const rankMap = (input: Rank) => {
  if (input === 't') return 10
  if (input === 'j') return 11
  if (input === 'q') return 12
  if (input === 'k') return 13
  if (input === 'a') return 14

  return Number(input)
}

export const comboIndices = [
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 5],
  [0, 1, 2, 3, 6],
  [0, 1, 2, 4, 5],
  [0, 1, 2, 4, 6],
  [0, 1, 2, 5, 6],
  [0, 1, 3, 4, 5],
  [0, 1, 3, 4, 6],
  [0, 1, 3, 5, 6],
  [0, 1, 4, 5, 6],
  [0, 2, 3, 4, 5],
  [0, 2, 3, 4, 6],
  [0, 2, 3, 5, 6],
  [0, 2, 4, 5, 6],
  [0, 3, 4, 5, 6],
  [1, 2, 3, 4, 5],
  [1, 2, 3, 4, 6],
  [1, 2, 3, 5, 6],
  [1, 2, 4, 5, 6],
  [1, 3, 4, 5, 6],
  [2, 3, 4, 5, 6]
]
