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
  resolveAllowedActions,
  type AllowedActionsContext,
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
  type AllowedActionsContext,
  resolveAllowedActions,
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
export {
  parseTableCommandFromJson,
  parseTableCommandFromUnknown
} from './domain/tableCommandParse'
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
  filterDomainEventsByHandId,
  reducePotFromDomainEvents,
  reduceLastTurnOfferedFromDomainEvents,
  reducePlayerActedTrailFromDomainEvents,
  reduceCommunityBoardFromDomainEvents,
  reduceLastHandEndedFromDomainEvents,
  reduceLastPotAwardedFromDomainEvents,
  reduceLastBlindsPostedFromDomainEvents,
  reduceLastStageAdvancedFromDomainEvents,
  reduceFirstHandStartedFromDomainEvents,
  reduceHandIdFromFirstHandStarted,
  reduceTurnEndedTrailFromDomainEvents,
  reduceLastPostedBigBlindFromDomainEvents,
  reduceLastRolesAssignedFromDomainEvents,
  reduceLastHoleCardsDealtFromDomainEvents,
  captureHandReduceProjection,
  applyVoluntaryTableCommand,
  applyFoldOrCheckCommand,
  isVoluntaryTableCommand,
  pendingFlowOpsAllowVoluntaryDispatch,
  peekPendingFlowOp,
  simulateDequeuePendingHeadIfMatches,
  captureSeatUserIdsInActionOrder,
  CANONICAL_TABLE_SESSION_JSON_SCHEMA_VERSION,
  cloneTableSnapshot,
  parseCanonicalTableSessionFromJson,
  reduceCanonicalTableSession,
  TABLE_STATE_V1_SCHEMA_VERSION,
  assertTableMatchesStateV1Snapshot,
  freezeTableStateV1FromLive,
  reduceCanonicalSessionToTableStateV1,
  applyTableCommandWithStateV1
} from './engine'
export type {
  TableSnapshot,
  TablePlayerSnapshot,
  BootstrapInstruction,
  CanonicalTableSession,
  CommandStepInstruction,
  ReduceCanonicalTableSessionResult,
  TableStateV1,
  ApplyTableCommandWithStateV1Result,
  ApplyTableCommandResult,
  BlindsPostedReadModel,
  HandEndedReadModel,
  HandStartedReadModel,
  HoleCardsDealtReadModel,
  PlayerActedEntry,
  PostedBigBlindReadModel,
  PotAwardedReadModel,
  PotContributionReadModel,
  RolesAssignedReadModel,
  StageAdvancedReadModel,
  TurnEndedEntry,
  TurnOfferReadModel,
  HandReduceProjection,
  FoldOrCheckTableCommand,
  VoluntaryTableCommand
} from './engine'

export type {
  PersistedDomainEventRow,
  DomainEventStore,
  DomainEventsCompositeReadModel,
  DomainEventTapeValidationIssue,
  VerifyCanonicalAgainstTapeResult,
  VerifyCanonicalDiffContext,
  VerifyEventSignature
} from './replay'
export {
  toPersistedDomainEventRows,
  createInMemoryDomainEventStore,
  domainEventsFromPersistedRows,
  appendPersistedRowsToNdjsonFileSync,
  readAllPersistedRowsFromNdjsonFileSync,
  createNdjsonFileDomainEventStore,
  projectCompositeReadModelFromNdjsonFileSync,
  validatePersistedDomainEventRows,
  assertPersistedDomainEventRows,
  summarizePersistedDomainEventRows,
  verifyCanonicalSessionAgainstPersistedRows,
  createAppendDomainEventsHandler,
  projectCompositeReadModel
} from './replay'

export type { PreAction } from './gameContracts'
