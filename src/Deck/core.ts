/**
 * 牌力相关入口：按职责拆分为 `format` / `handEvaluation` / `handCompare` / `handCombinations`，本文件保持向后兼容的聚合导出。
 */
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
  getFiveCardsStrength
} from './handCompare'
export { getBestFiveCards, getBestPokesRankSignature } from './handCombinations'
