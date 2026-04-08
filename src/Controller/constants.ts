import { StageEnum } from '.'

export const stageMap = new Map<StageEnum, string>([
  [StageEnum.PRE_FLOP, '翻牌前'],
  [StageEnum.FLOP, '翻牌圈'],
  [StageEnum.TURN, '转牌圈'],
  [StageEnum.RIVER, '河牌圈']
])
