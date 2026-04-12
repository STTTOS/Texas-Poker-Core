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
  RoomStatus,
  default as Room,
  PlayerSeatStatus,
  type RoomCreateOptions
} from './Room'
import Controller, {
  Stage,
  StageEnum,
  HandLifecycle,
  type ShowdownPlayerEval
} from './Controller'
import {
  TexasEngineContext,
  type TexasTraceEvent,
  type TexasSimulationFlags,
  type TexasEngineGlobalOptions
} from '@/TexasEngineContext'
import {
  User,
  Role,
  Action,
  RoleEnum,
  ActionType,
  OnlineStatus,
  ActionTypeEnum,
  default as Player,
  type PlayerActionPolicy
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
  type PlayerActionPolicy,
  type TexasEngineGlobalOptions,
  type TexasSimulationFlags,
  type TexasTraceEvent,
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

export type { PreAction } from './gameContracts'
