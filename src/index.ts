import type {
  StreetPotSink,
  PlayerDealerRing,
  PlayerHandSession,
  PlayerStreetBetLedger
} from './playerSessionPorts'

import Texas from './Texas'
import { default as Deck } from './Deck'
import { formatterPoke } from './Deck/core'
import { TableStakes } from './TableStakes'
import { CurrentHand } from './Hand/CurrentHand'
import { stageMap } from './Controller/constants'
import Dealer, { Table, DealerService } from './Dealer'
import { StreetBetLedger } from './Pool/StreetBetLedger'
import { roleMap, ActionTypeMap } from './Player/constant'
import { DealtBoard, type DealSnapshot } from './Deck/DealtBoard'
import {
  TexasEngineContext,
  type TexasSimulationFlags,
  type TexasEngineGlobalOptions
} from '@/TexasEngineContext'
import {
  RoomStatus,
  default as Room,
  PlayerSeatStatus,
  type RoomMemberCounts,
  type RoomCreateOptions
} from './Room'
import Controller, {
  Stage,
  StageEnum,
  HandLifecycle,
  type PendingFlowOpKind,
  type ShowdownPlayerEval
} from './Controller'
import {
  User,
  Role,
  Action,
  RoleEnum,
  ActionType,
  OnlineStatus,
  ActionTypeEnum,
  type PlayerStatus,
  default as Player,
  isPlayerEligibleForStreetBetting
} from './Player'
import TexasError, {
  texasErrorMap,
  TexasCoreErrorCode,
  texasErrorCategory,
  type TexasErrorCode,
  getTexasErrorSeverity,
  isFatalTexasErrorCode,
  type TexasErrorPayload,
  type TexasErrorSeverity,
  formatTexasErrorMessage,
  type TexasErrorCodeLegacy
} from '@/TexasError'

export * from './Deck/constant'
export {
  getBestPokesRankSignature,
  compareRankSignature,
  getFiveCardsStrength,
  getStrengthFromRankSignature,
  getFiveCardCombinationIndices
} from './Deck/core'
export {
  Player,
  User,
  ActionType,
  ActionTypeEnum,
  Role,
  RoleEnum,
  Action,
  roleMap,
  ActionTypeMap,
  Stage,
  StageEnum,
  HandLifecycle,
  type ShowdownPlayerEval,
  type PendingFlowOpKind,
  TableStakes,
  type PlayerDealerRing,
  type PlayerHandSession,
  type PlayerStreetBetLedger,
  type StreetPotSink,
  StreetBetLedger,
  stageMap,
  Controller,
  Dealer,
  Table,
  DealerService,
  Deck,
  DealtBoard,
  type DealSnapshot,
  Room,
  RoomStatus,
  PlayerSeatStatus,
  type RoomCreateOptions,
  type RoomMemberCounts,
  formatterPoke,
  TexasError,
  TexasErrorCode,
  TexasErrorPayload,
  TexasErrorSeverity,
  TexasCoreErrorCode,
  formatTexasErrorMessage,
  getTexasErrorSeverity,
  isFatalTexasErrorCode,
  texasErrorMap,
  texasErrorCategory,
  TexasEngineContext,
  Texas,
  OnlineStatus,
  type PlayerStatus,
  isPlayerEligibleForStreetBetting,
  type TexasEngineGlobalOptions,
  type TexasSimulationFlags,
  /** @deprecated 旧版宽泛 code 类型，请逐步迁移到 TexasErrorCode */
  type TexasErrorCodeLegacy,
  CurrentHand
}

export type {
  TexasDomainEvent,
  HandDomainEvent,
  SessionDomainEvent,
  CreateRoomInputArgs
} from './Texas'

export type { TableCommand } from './domain/tableCommand'
export type { TurnEndedReason, HandEventMeta } from './domain/handDomainEvents'

export type {
  OrchestrationCtx,
  DomainEventHandler
} from './orchestration/interpret'
export { interpret } from './orchestration/interpret'
export {
  createDefaultPipelineHandlers,
  defaultPipelineOrdered
} from './orchestration/defaultPipeline'

export {
  dispatchCommandAndInterpret,
  interpretTableEvents,
  flushAllPendingFlowOpsAndInterpret,
  captureTableSnapshot,
  applyTableCommand,
  applyTableCommandThenFlushAllPendingFlowOps,
  flatConcatDomainEvents,
  reducePotFromDomainEvents,
  reduceLastTurnOfferedFromDomainEvents,
  reducePlayerActedTrailFromDomainEvents,
  reduceCommunityBoardFromDomainEvents,
  reduceLastHandEndedFromDomainEvents,
  reduceLastPotAwardedFromDomainEvents,
  reduceLastBlindsPostedFromDomainEvents,
  reduceLastStageAdvancedFromDomainEvents,
  reduceHandIdFromFirstHandStarted,
  captureHandReduceProjection,
  applyFoldOrCheckCommand
} from './engine'
export type {
  TableSnapshot,
  TablePlayerSnapshot,
  ApplyTableCommandResult,
  BlindsPostedReadModel,
  HandEndedReadModel,
  PlayerActedEntry,
  PotAwardedReadModel,
  PotContributionReadModel,
  StageAdvancedReadModel,
  TurnOfferReadModel,
  HandReduceProjection,
  FoldOrCheckTableCommand
} from './engine'

export type { PersistedDomainEventRow, DomainEventStore } from './replay'
export {
  toPersistedDomainEventRows,
  createInMemoryDomainEventStore
} from './replay'

export type { PreAction } from './gameContracts'
