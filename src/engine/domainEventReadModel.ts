import type { Role } from '@/Player/constant'
import type { Stage } from '@/Controller/stage'
import type { ActionTypeEnum } from '@/Player/constant'
import type { Poke, RankCategory, RankSignature } from '@/Deck/constant'
import type {
  HandDomainEvent,
  TurnEndedReason,
  TexasDomainEvent
} from '@/domain/handDomainEvents'

/** 将多段事件批（如 `dispatchCommand` + 若干 `flush*`）按顺序拼成一条磁带（新数组）。 */
export function flatConcatDomainEvents(
  parts: readonly (readonly TexasDomainEvent[])[]
): TexasDomainEvent[] {
  const out: TexasDomainEvent[] = []
  for (const batch of parts) {
    out.push(...batch)
  }
  return out
}

/** 按 `handId` 过滤本手完整磁带（含分配角色、发洞牌与街道事件）。 */
export function filterDomainEventsByHandId(
  events: readonly TexasDomainEvent[],
  handId: string
): TexasDomainEvent[] {
  const out: TexasDomainEvent[] = []
  for (const e of events) {
    if ((e as HandDomainEvent).payload.handId === handId) {
      out.push(e)
    }
  }
  return out
}

/**
 * 由领域事件投影的中央池读模型（仅消费 `PotUpdated` 事实；与 {@link Pool} 展示口径对齐的起点）。
 * 纯函数、零 I/O，供回放 / 机器人 / 与 `TableSnapshot` 对拍。
 */
export type PotContributionReadModel = Readonly<{
  totalAmount: number
  contributions: ReadonlyArray<Readonly<{ userId: number; amount: number }>>
}>

const emptyPot: PotContributionReadModel = {
  totalAmount: 0,
  contributions: []
}

/** 顺序扫描，**保留最后一次** `PotUpdated`（引擎每步入池后发出的权威快照）。 */
export function reducePotFromDomainEvents(
  events: readonly TexasDomainEvent[]
): PotContributionReadModel {
  let last = emptyPot
  for (const e of events) {
    if (e.type === 'PotUpdated') {
      const { totalAmount, contributions } = e.payload
      last = {
        totalAmount,
        contributions: contributions.map((c) => ({
          userId: c.userId,
          amount: c.amount
        }))
      }
    }
  }
  return last
}

/**
 * 本批事件里**最后一次** `TurnOffered`（与「当前轮到谁思考」展示对齐；不含 pacing 延迟本身）。
 */
export type TurnOfferReadModel = Readonly<{
  userId: number
  street: Stage
  allowedActions: readonly ActionTypeEnum[]
}>

export function reduceLastTurnOfferedFromDomainEvents(
  events: readonly TexasDomainEvent[]
): TurnOfferReadModel | null {
  let last: TurnOfferReadModel | null = null
  for (const e of events) {
    if (e.type === 'TurnOffered') {
      const { userId, street, allowedActions } = e.payload
      last = {
        userId,
        street,
        allowedActions: [...allowedActions]
      }
    }
  }
  return last
}

/** 本批 `PlayerActed` 按 `seq` 升序（便于与磁带 / 快照对拍）。 */
export type PlayerActedEntry = Readonly<{
  seq: number
  userId: number
  street: Stage
  actionType: ActionTypeEnum
  amount?: number
}>

export function reducePlayerActedTrailFromDomainEvents(
  events: readonly TexasDomainEvent[]
): readonly PlayerActedEntry[] {
  const acts: PlayerActedEntry[] = []
  for (const e of events) {
    if (e.type === 'PlayerActed') {
      const { seq, userId, street, actionType, amount } = e.payload
      acts.push({ seq, userId, street, actionType, amount })
    }
  }
  acts.sort((a, b) => a.seq - b.seq)
  return acts
}

/**
 * 按 `StageAdvanced` 出现顺序拼接 `pokesRevealedThisStep`（与公牌展示进度一致）。
 */
export function reduceCommunityBoardFromDomainEvents(
  events: readonly TexasDomainEvent[]
): readonly Poke[] {
  const board: Poke[] = []
  for (const e of events) {
    if (e.type === 'StageAdvanced') {
      board.push(...e.payload.pokesRevealedThisStep)
    }
  }
  return board
}

/** 本批中**最后一条** `HandEnded` 的展示向字段（重放 UI / 对拍）。 */
export type HandEndedReadModel = Readonly<{
  handId: string
  seq: number
  outcome: 'showdown' | 'fold_win'
  pokesRevealed: readonly Poke[]
  endStage: Stage
  showHandPokes: boolean
  bestPokes?: readonly (readonly Poke[])[]
  bestRankCategory?: RankCategory
  bestRankSignature?: RankSignature
  bestRankStrength?: number
}>

export function reduceLastHandEndedFromDomainEvents(
  events: readonly TexasDomainEvent[]
): HandEndedReadModel | null {
  let last: HandEndedReadModel | null = null
  for (const e of events) {
    if (e.type === 'HandEnded') {
      const p = e.payload
      last = {
        handId: p.handId,
        seq: p.seq,
        outcome: p.outcome,
        pokesRevealed: p.pokesRevealed,
        endStage: p.endStage,
        showHandPokes: p.showHandPokes,
        bestPokes: p.bestPokes,
        bestRankCategory: p.bestRankCategory,
        bestRankSignature: p.bestRankSignature,
        bestRankStrength: p.bestRankStrength
      }
    }
  }
  return last
}

/** 本批中**最后一条** `PotAwarded`（结算分配快照）。 */
export type PotAwardedReadModel = Readonly<{
  handId: string
  seq: number
  potTotal: number
  allocations: ReadonlyArray<Readonly<{ userId: number; amount: number }>>
}>

export function reduceLastPotAwardedFromDomainEvents(
  events: readonly TexasDomainEvent[]
): PotAwardedReadModel | null {
  let last: PotAwardedReadModel | null = null
  for (const e of events) {
    if (e.type === 'PotAwarded') {
      const p = e.payload
      last = {
        handId: p.handId,
        seq: p.seq,
        potTotal: p.potTotal,
        allocations: p.allocations.map((a) => ({
          userId: a.userId,
          amount: a.amount
        }))
      }
    }
  }
  return last
}

/** 本批中**最后一条** `BlindsPosted`（盲注汇总行）。 */
export type BlindsPostedReadModel = Readonly<{
  handId: string
  seq: number
  posts: ReadonlyArray<
    Readonly<{ userId: number; amount: number; kind: 'sb' | 'bb' }>
  >
}>

export function reduceLastBlindsPostedFromDomainEvents(
  events: readonly TexasDomainEvent[]
): BlindsPostedReadModel | null {
  let last: BlindsPostedReadModel | null = null
  for (const e of events) {
    if (e.type === 'BlindsPosted') {
      const p = e.payload
      last = {
        handId: p.handId,
        seq: p.seq,
        posts: p.posts.map((x) => ({
          userId: x.userId,
          amount: x.amount,
          kind: x.kind
        }))
      }
    }
  }
  return last
}

/** 本批中**最后一条** `StageAdvanced`（进街 / 发公牌进度）。 */
export type StageAdvancedReadModel = Readonly<{
  handId: string
  seq: number
  fromStage: Stage
  toStage: Stage
  advanceKind: 'betting_round_complete' | 'runout_reveal'
}>

export function reduceLastStageAdvancedFromDomainEvents(
  events: readonly TexasDomainEvent[]
): StageAdvancedReadModel | null {
  let last: StageAdvancedReadModel | null = null
  for (const e of events) {
    if (e.type === 'StageAdvanced') {
      const p = e.payload
      last = {
        handId: p.handId,
        seq: p.seq,
        fromStage: p.fromStage,
        toStage: p.toStage,
        advanceKind: p.advanceKind
      }
    }
  }
  return last
}

/** 磁带中首条 `HandStarted`（本手锚点）。 */
export type HandStartedReadModel = Readonly<{
  handId: string
  seq: number
}>

export function reduceFirstHandStartedFromDomainEvents(
  events: readonly TexasDomainEvent[]
): HandStartedReadModel | null {
  for (const e of events) {
    if (e.type === 'HandStarted') {
      return { handId: e.payload.handId, seq: e.payload.seq }
    }
  }
  return null
}

/** 磁带中首条 `HandStarted` 的 `handId`（{@link reduceFirstHandStartedFromDomainEvents} 的便捷别名）。 */
export function reduceHandIdFromFirstHandStarted(
  events: readonly TexasDomainEvent[]
): string | null {
  return reduceFirstHandStartedFromDomainEvents(events)?.handId ?? null
}

/** 本批 `TurnEnded` 按 `seq` 升序。 */
export type TurnEndedEntry = Readonly<{
  seq: number
  userId: number
  reason: TurnEndedReason
}>

export function reduceTurnEndedTrailFromDomainEvents(
  events: readonly TexasDomainEvent[]
): readonly TurnEndedEntry[] {
  const rows: TurnEndedEntry[] = []
  for (const e of events) {
    if (e.type === 'TurnEnded') {
      const { seq, userId, reason } = e.payload
      rows.push({ seq, userId, reason })
    }
  }
  rows.sort((a, b) => a.seq - b.seq)
  return rows
}

/** 本批中**最后一条** `PostedJoiningBigBlinds` 且 `posts` 非空时，取其 `posts` 末项（`PostBigBlind` 为单元素；批量开局为多行汇总）。`posts` 为空的事件跳过。 */
export type PostedBigBlindReadModel = Readonly<{
  handId: string
  seq: number
  userId: number
  amount: number
  requested: number
}>

export function reduceLastPostedBigBlindFromDomainEvents(
  events: readonly TexasDomainEvent[]
): PostedBigBlindReadModel | null {
  let last: PostedBigBlindReadModel | null = null
  for (const e of events) {
    if (e.type === 'PostedJoiningBigBlinds') {
      const posts = e.payload.posts
      if (posts.length === 0) continue
      const p = posts[posts.length - 1]!
      const meta = e.payload
      last = {
        handId: meta.handId,
        seq: meta.seq,
        userId: p.userId,
        amount: p.amount,
        requested: p.requested
      }
    }
  }
  return last
}

/** 本批中**最后一条** `RolesAssigned`（定庄/角色表）。 */
export type RolesAssignedReadModel = Readonly<{
  handId: string
  seq: number
  players: ReadonlyArray<
    Readonly<{
      userId: number
      name: string
      role: Role
      actionIndex: number
    }>
  >
}>

export function reduceLastRolesAssignedFromDomainEvents(
  events: readonly TexasDomainEvent[]
): RolesAssignedReadModel | null {
  let last: RolesAssignedReadModel | null = null
  for (const e of events) {
    if (e.type === 'RolesAssigned') {
      const p = e.payload
      last = {
        handId: p.handId,
        seq: p.seq,
        players: p.players.map((x) => ({
          userId: x.userId,
          name: x.name,
          role: x.role,
          actionIndex: x.actionIndex
        }))
      }
    }
  }
  return last
}

/** 本批中**最后一条** `HoleCardsDealt`（发手牌快照；出站前仍须按 viewer 过滤）。 */
export type HoleCardsDealtReadModel = Readonly<{
  handId: string
  seq: number
  byUserId: Readonly<Record<number, readonly Poke[]>>
}>

export function reduceLastHoleCardsDealtFromDomainEvents(
  events: readonly TexasDomainEvent[]
): HoleCardsDealtReadModel | null {
  let last: HoleCardsDealtReadModel | null = null
  for (const e of events) {
    if (e.type === 'HoleCardsDealt') {
      const { handId, seq, byUserId } = e.payload
      const copy: Record<number, readonly Poke[]> = {}
      for (const [uid, pokes] of Object.entries(byUserId)) {
        copy[Number(uid)] = [...pokes]
      }
      last = { handId, seq, byUserId: copy }
    }
  }
  return last
}
