/** 公共牌推进阶段；独立文件避免 Player ↔ Controller 循环依赖 */
export enum StageEnum {
  PRE_FLOP = 'pre_flop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river'
}

export type Stage = StageEnum

export const STAGE_ORDER: Stage[] = [
  StageEnum.PRE_FLOP,
  StageEnum.FLOP,
  StageEnum.TURN,
  StageEnum.RIVER
]
