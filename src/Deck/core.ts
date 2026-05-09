/**
 * 牌力相关入口：按职责拆分为 `format` / `handEvaluation` / `handCompare` / `handCombinations`，本文件保持向后兼容的聚合导出。
 */
export { createStandardDeckPokes } from './standardDeck'
export { formatterPoke } from './format'
export {
  isStraight,
  getFiveCardCombinationIndices,
  allFiveCardHandsFromPool,
  getFiveCardsRankSignature
} from './handEvaluation'
export {
  compareFn,
  compareRankSignature,
  getStrengthFromRankSignature,
  getFiveCardsStrength,
  rankSignatureToRanks,
  rankSignatureToDisplayGroups
} from './handCompare'
export type { RankSignatureDisplayGroup } from './handCompare'
export { getBestFiveCards, getBestPokesRankSignature } from './handCombinations'
