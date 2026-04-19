import type { Player } from './index'

import { ActionTypeEnum } from './constant'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import { voluntaryActionDisallowError } from './allowedActions'
import { resolveCallChipsOrError } from './resolveCallChipsOrError'
import { resolveRaiseAdditionalOrError } from './resolveRaiseAdditionalOrError'
import { resolveVoluntaryBetChipOrError } from './resolveVoluntaryBetChipOrError'

/**
 * 街道下注动作的执行细节（校验、记池、荷官行动历史、领域事件顺序）。
 * `Texas#dispatchCommand` / 仿真路径委托至此；盲注由 Controller 调 `executeBet(..., preFlopDefaultAction)`。
 */

/** 透传至 {@link Player.checkIfCanAct}；仅超时代指令需 `skipTurnOfferRequirement`。 */
export type ActValidationOptions = {
  skipTurnOfferRequirement?: boolean
}

export function executeCheck(actor: Player, act?: ActValidationOptions): void {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()
  const denyCheck = voluntaryActionDisallowError(
    allowed,
    ActionTypeEnum.CHECK,
    TexasCoreErrorCode.PLAYER_CANNOT_CHECK
  )
  if (denyCheck) return actor.fail(denyCheck)

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.CHECK })
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: false })
  actor.completeBettingTurn()
}

export function executeFold(actor: Player, act?: ActValidationOptions): void {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()
  const denyFold = voluntaryActionDisallowError(
    allowed,
    ActionTypeEnum.FOLD,
    TexasCoreErrorCode.PLAYER_CANNOT_FOLD
  )
  if (denyFold) return actor.fail(denyFold)

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.FOLD })
  actor.setStatus('out')
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: false })
  actor.completeBettingTurn()
}

/**
 * 非当前行动方离场弃牌：不交 `completeBettingTurn`；随后 `tryHandSessionEndGame()` 以捕捉独赢等。
 */
export function executeFoldDueToLeavePassive(actor: Player): void {
  if (actor.handLifecycle !== 'in_hand') {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_NOT_IN_HAND))
  }
  const st = actor.getStatus()
  if (st === 'out') {
    return
  }
  if (st === 'allIn') {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_FOLD))
  }

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.FOLD })
  actor.setStatus('out')
  actor.notifyDealerActionHistory()
  actor.notifyPassiveFoldLeaveCommitted()
  void actor.tryHandSessionEndGame()
}

/** `skipDomainEvents`：盲注路径为 true，不发 `PlayerActed`；池面由 `Controller` 在每次 `#postBlind` 后发 `PotUpdated`（细粒度），再以 `BlindsPosted` 汇总。 */
export function executeBet(
  actor: Player,
  chipAmount: number,
  preFlopDefaultAction = false,
  skipDomainEvents = false,
  act?: ActValidationOptions
): number | void {
  let committed: number
  if (!preFlopDefaultAction) {
    actor.checkIfCanAct(act)
    const allowed = actor.getAllowedActions()
    const denyBet = voluntaryActionDisallowError(
      allowed,
      ActionTypeEnum.BET,
      TexasCoreErrorCode.PLAYER_CANNOT_BET
    )
    if (denyBet) return actor.fail(denyBet)

    const betSizing = resolveVoluntaryBetChipOrError({
      chipAmount,
      selfBalance: actor.balance,
      lowestBetAmount: actor.lowestBetAmount
    })
    if (!betSizing.ok) return actor.fail(betSizing.error)
    committed = betSizing.committed
  } else {
    /** 盲注允许「不足额」：实际下注入池为 min(规定盲注, 当前余额)。 */
    committed = Math.min(chipAmount, actor.balance)
  }
  if (committed === actor.balance) {
    return executeAllIn(actor, skipDomainEvents, preFlopDefaultAction, act)
  }

  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.BET,
    payload: { value: committed }
  })
  actor.appendChipsToPot(committed)
  actor.notifyDealerActionHistory()

  if (!skipDomainEvents) {
    actor.notifyActionCommitted({ emitPot: true })
  }
  if (!preFlopDefaultAction) actor.completeBettingTurn()
  return committed
}

export function executeRaise(
  actor: Player,
  additionalChips: number,
  act?: ActValidationOptions
): void | number | undefined {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()

  const maxOthersStageBet = actor.getMaxOthersStageBet()

  const denyRaise = voluntaryActionDisallowError(
    allowed,
    ActionTypeEnum.RAISE,
    TexasCoreErrorCode.PLAYER_CANNOT_RAISE
  )
  if (denyRaise) return actor.fail(denyRaise)

  const raiseGate = resolveRaiseAdditionalOrError({
    additionalChips,
    selfBalance: actor.balance,
    lowestBetAmount: actor.lowestBetAmount,
    selfCurrentStageTotal: actor.currentStageTotalAmount,
    maxOthersStageBet
  })
  if (!raiseGate.ok) return actor.fail(raiseGate.error)

  if (additionalChips === actor.balance) {
    return executeAllIn(actor, false, false, act)
  }

  actor.appendChipsToPot(additionalChips)
  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.RAISE,
    payload: { value: additionalChips }
  })
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: true })
  actor.completeBettingTurn()
}

export function executeCall(actor: Player, act?: ActValidationOptions): void {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()
  const denyCall = voluntaryActionDisallowError(
    allowed,
    ActionTypeEnum.CALL,
    TexasCoreErrorCode.PLAYER_CANNOT_CALL
  )
  if (denyCall) return actor.fail(denyCall)

  const maxOthersStageBet = actor.getOthersMaxBetAmountAtCurrentStage()
  const callSizing = resolveCallChipsOrError({
    maxOthersStageBet,
    selfCurrentStageTotal: actor.currentStageTotalAmount,
    selfBalance: actor.balance
  })
  if (!callSizing.ok) return actor.fail(callSizing.error)
  const chipsToMatch = callSizing.chipsToMatch

  /** 与 {@link executeBet} / {@link executeRaise} 一致：清台进池走全下语义（事件为 ALL_IN、`status: allIn`）。 */
  if (chipsToMatch === actor.balance) {
    void executeAllIn(actor, false, false, act)
    return
  }

  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.CALL,
    payload: { value: chipsToMatch }
  })
  actor.appendChipsToPot(chipsToMatch)
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: true })
  actor.completeBettingTurn()
}

/**
 * `skipTurnValidation`：与盲注 `executeBet(..., preFlopDefaultAction)` 一致——贴盲阶段 `activePlayer` 尚未就位，
 * 且 **不得** `completeBettingTurn`（交权由 `takeActionInPreFlop` 末尾统一 `transferControlTo`）。
 */
export function executeAllIn(
  actor: Player,
  skipDomainEvents = false,
  skipTurnValidation = false,
  act?: ActValidationOptions
): number | void {
  if (!skipTurnValidation) {
    actor.checkIfCanAct(act)
  }
  const allowed = actor.getAllowedActions()
  const denyAllIn = voluntaryActionDisallowError(
    allowed,
    ActionTypeEnum.ALL_IN,
    TexasCoreErrorCode.PLAYER_CANNOT_ALL_IN
  )
  if (denyAllIn) return actor.fail(denyAllIn)

  const chipsToCommit = actor.balance
  if (chipsToCommit <= 0) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_ALL_IN_INVALID, {
        moneyShouldPay: chipsToCommit,
        balance: actor.balance
      })
    )
  }

  actor.appendChipsToPot(chipsToCommit)
  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.ALL_IN,
    payload: { value: chipsToCommit }
  })
  actor.setStatus('allIn')
  actor.notifyDealerActionHistory()
  if (!skipDomainEvents) {
    actor.notifyActionCommitted({ emitPot: true })
  }
  if (!skipTurnValidation) {
    actor.completeBettingTurn()
  }
  return chipsToCommit
}
