import type { Poke } from '@/Deck/constant'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'
import type {
  TurnEndedEntry,
  PlayerActedEntry,
  HandEndedReadModel,
  TurnOfferReadModel,
  PotAwardedReadModel,
  HandStartedReadModel,
  BlindsPostedReadModel,
  RolesAssignedReadModel,
  StageAdvancedReadModel,
  HoleCardsDealtReadModel,
  PostedBigBlindReadModel,
  PotContributionReadModel
} from '@/engine/domainEventReadModel'

import {
  reducePotFromDomainEvents,
  reduceLastHandEndedFromDomainEvents,
  reduceCommunityBoardFromDomainEvents,
  reduceLastPotAwardedFromDomainEvents,
  reduceTurnEndedTrailFromDomainEvents,
  reduceLastTurnOfferedFromDomainEvents,
  reduceFirstHandStartedFromDomainEvents,
  reduceLastBlindsPostedFromDomainEvents,
  reducePlayerActedTrailFromDomainEvents,
  reduceLastRolesAssignedFromDomainEvents,
  reduceLastStageAdvancedFromDomainEvents,
  reduceLastHoleCardsDealtFromDomainEvents,
  reduceLastPostedBigBlindFromDomainEvents
} from '@/engine/domainEventReadModel'

/**
 * 单条磁带上的**只读复合投影**（阶段 6 向 `reduce(apply)` 过渡的读侧聚合；**非**完整状态机）。
 * 供回放对拍、机器人读盘、接入方一条 API 取多视角。
 */
export type DomainEventsCompositeReadModel = Readonly<{
  firstHandStarted: HandStartedReadModel | null
  lastRolesAssigned: RolesAssignedReadModel | null
  lastBlindsPosted: BlindsPostedReadModel | null
  lastHoleCardsDealt: HoleCardsDealtReadModel | null
  pot: PotContributionReadModel
  communityBoard: readonly Poke[]
  lastStageAdvanced: StageAdvancedReadModel | null
  lastTurnOffered: TurnOfferReadModel | null
  playerActedTrail: readonly PlayerActedEntry[]
  turnEndedTrail: readonly TurnEndedEntry[]
  lastPostedBigBlind: PostedBigBlindReadModel | null
  lastHandEnded: HandEndedReadModel | null
  lastPotAwarded: PotAwardedReadModel | null
}>

export function projectCompositeReadModel(
  events: readonly TexasDomainEvent[]
): DomainEventsCompositeReadModel {
  return {
    firstHandStarted: reduceFirstHandStartedFromDomainEvents(events),
    lastRolesAssigned: reduceLastRolesAssignedFromDomainEvents(events),
    lastBlindsPosted: reduceLastBlindsPostedFromDomainEvents(events),
    lastHoleCardsDealt: reduceLastHoleCardsDealtFromDomainEvents(events),
    pot: reducePotFromDomainEvents(events),
    communityBoard: reduceCommunityBoardFromDomainEvents(events),
    lastStageAdvanced: reduceLastStageAdvancedFromDomainEvents(events),
    lastTurnOffered: reduceLastTurnOfferedFromDomainEvents(events),
    playerActedTrail: reducePlayerActedTrailFromDomainEvents(events),
    turnEndedTrail: reduceTurnEndedTrailFromDomainEvents(events),
    lastPostedBigBlind: reduceLastPostedBigBlindFromDomainEvents(events),
    lastHandEnded: reduceLastHandEndedFromDomainEvents(events),
    lastPotAwarded: reduceLastPotAwardedFromDomainEvents(events)
  }
}
