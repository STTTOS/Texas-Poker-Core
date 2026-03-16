/** 座位角色枚举 */
export enum RoleEnum {
  /** 庄家/按钮 */
  BTN = 'btn',
  /** 小盲 */
  SB = 'sb',
  /** 大盲 */
  BB = 'bb',
  /** 枪口 */
  UTG = 'utg',
  /** 枪口+1 */
  UTG1 = 'utg1',
  /** 枪口+2（10 人桌） */
  UTG2 = 'utg2',
  /** 中位 */
  MP = 'mp',
  /** Lojack（10 人桌） */
  LJ = 'lj',
  /** 劫持位 */
  HJ = 'hj',
  /** 关煞位 */
  CO = 'co'
}

export type Role = RoleEnum

const twoPlayer: Role[] = [RoleEnum.BTN, RoleEnum.BB]
const threePlayer: Role[] = [RoleEnum.BTN, RoleEnum.SB, RoleEnum.BB]
const fourPlayer: Role[] = threePlayer.concat(RoleEnum.UTG)
const fivePlayer: Role[] = fourPlayer.concat(RoleEnum.MP)
const sixPlayer: Role[] = fivePlayer.concat(RoleEnum.CO)

const sevenPlayer: Role[] = [
  ...sixPlayer.slice(0, -1),
  RoleEnum.HJ,
  ...sixPlayer.slice(-1)
]
const eightPlayer: Role[] = [
  ...sevenPlayer.slice(0, 5),
  RoleEnum.LJ,
  ...sevenPlayer.slice(5)
]
const ninePlayer: Role[] = [
  ...eightPlayer.slice(0, 4),
  RoleEnum.UTG1,
  ...eightPlayer.slice(4)
]

const tenPlayer: Role[] = [
  ...ninePlayer.slice(0, 5),
  RoleEnum.UTG2,
  ...ninePlayer.slice(5)
]

export enum ActionTypeEnum {
  CALL = 'call',
  CHECK = 'check',
  FOLD = 'fold',
  RAISE = 'raise',
  ALL_IN = 'allIn',
  BET = 'bet'
}

export const ActionTypeMap = new Map<ActionTypeEnum, string>([
  [ActionTypeEnum.CALL, '跟注'],
  [ActionTypeEnum.CHECK, '过牌'],
  [ActionTypeEnum.FOLD, '弃牌'],
  [ActionTypeEnum.RAISE, '加注'],
  [ActionTypeEnum.ALL_IN, 'All In'],
  [ActionTypeEnum.BET, '下注']
])

export const roleMap = new Map<Role, string>([
  [RoleEnum.BTN, '庄家'],
  [RoleEnum.SB, '小盲'],
  [RoleEnum.BB, '大盲'],
  [RoleEnum.UTG, '枪口'],
  [RoleEnum.UTG1, '枪口+1'],
  [RoleEnum.UTG2, '枪口+2'],
  [RoleEnum.MP, '中位'],
  [RoleEnum.LJ, 'Lojack'],
  [RoleEnum.HJ, '劫持位'],
  [RoleEnum.CO, '关煞']
])

const playerRoleSetMap = new Map<number, Role[]>([
  [1, [RoleEnum.BTN]],
  [2, twoPlayer],
  [3, threePlayer],
  [4, fourPlayer],
  [5, fivePlayer],
  [6, sixPlayer],
  [7, sevenPlayer],
  [8, eightPlayer],
  [9, ninePlayer],
  [10, tenPlayer]
])
export { playerRoleSetMap }
