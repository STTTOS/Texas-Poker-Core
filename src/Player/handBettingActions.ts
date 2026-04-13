import type { Player } from './index'

import { ActionTypeEnum } from './constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/**
 * 街道下注动作的执行细节（校验、记池、荷官历史、trace、回调顺序）。
 * `Player` 对外 API 委托至此，便于单测与扩展盲注/ante 等规则。
 */

function tracePlayerAction(
  name: string,
  actor: Player,
  extra?: Record<string, unknown>
) {
  const { id, name: userName } = actor.getUserInfo()
  TexasEngineContext.emitTrace({
    channel: 'player',
    name,
    data: { userId: id, name: userName, ...extra }
  })
}

export function executeCheck(actor: Player): void {
  actor.checkIfCanAct()
  if (!actor.getAllowedActions().includes(ActionTypeEnum.CHECK)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_CHECK))
  }

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.CHECK })
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: false })
  tracePlayerAction('check', actor)
  actor.completeBettingTurn()
}

export function executeFold(actor: Player): void {
  actor.checkIfCanAct()
  if (!actor.getAllowedActions().includes(ActionTypeEnum.FOLD)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_FOLD))
  }

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.FOLD })
  actor.setStatus('out')
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: false })
  tracePlayerAction('fold', actor)
  actor.completeBettingTurn()
}

/** `skipDomainEvents`：盲注路径为 true，由 `BlindsPosted` 表达，不发 `PlayerActed`。 */
export function executeBet(
  actor: Player,
  chipAmount: number,
  preFlopDefaultAction = false,
  skipDomainEvents = false
): number | void {
  if (preFlopDefaultAction === false) actor.checkIfCanAct()

  if (
    !actor.getAllowedActions().includes(ActionTypeEnum.BET) &&
    !preFlopDefaultAction
  ) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_BET))
  }

  if (!preFlopDefaultAction && chipAmount > actor.balance) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_BET_EXCEEDS_BALANCE, {
        money: chipAmount,
        balance: actor.balance
      })
    )
  }

  /** 盲注允许「不足额」：实际下注入池为 min(规定盲注, 当前余额)。自愿下注仍走上方超额校验。 */
  const committed = preFlopDefaultAction
    ? Math.min(chipAmount, actor.balance)
    : chipAmount

  if (committed < actor.lowestBetAmount && !preFlopDefaultAction) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_BET_BELOW_BB, {
        money: committed,
        lowestBetAmount: actor.lowestBetAmount
      })
    )
  }
  if (committed === actor.balance) {
    return executeAllIn(actor, skipDomainEvents, preFlopDefaultAction)
  }

  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.BET,
    payload: { value: committed }
  })
  actor.appendChipsToPot(committed)
  tracePlayerAction('bet', actor, {
    money: committed,
    balance: actor.balance
  })
  actor.notifyDealerActionHistory()

  if (!skipDomainEvents) {
    actor.notifyActionCommitted({ emitPot: true })
  }
  if (!preFlopDefaultAction) actor.completeBettingTurn()
  return committed
}

export function executeRaise(
  actor: Player,
  additionalChips: number
): void | number | undefined {
  actor.checkIfCanAct()

  const maxOthersStageBet = actor.getMaxOthersStageBet()

  if (!actor.getAllowedActions().includes(ActionTypeEnum.RAISE)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_RAISE))
  }

  if (additionalChips > actor.balance) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_RAISE_EXCEEDS_BALANCE, {
        money: additionalChips,
        balance: actor.balance
      })
    )
  }
  if (additionalChips < actor.lowestBetAmount) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_RAISE_BELOW_BB, {
        money: additionalChips,
        lowestBetAmount: actor.lowestBetAmount
      })
    )
  }

  const attemptedStreetTotal = additionalChips + actor.currentStageTotalAmount
  if (attemptedStreetTotal <= maxOthersStageBet) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_RAISE_NOT_INCREASE, {
        maxBetAmount: maxOthersStageBet,
        attemptedTotal: attemptedStreetTotal
      })
    )
  }
  if (additionalChips === actor.balance) {
    return executeAllIn(actor)
  }

  actor.appendChipsToPot(additionalChips)
  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.RAISE,
    payload: { value: additionalChips }
  })
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: true })
  tracePlayerAction('raise', actor, { money: additionalChips })
  actor.completeBettingTurn()
}

export function executeCall(actor: Player): void {
  actor.checkIfCanAct()
  if (!actor.getAllowedActions().includes(ActionTypeEnum.CALL)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_CALL))
  }

  const maxOthersStageBet = actor.getOthersMaxBetAmountAtCurrentStage()
  const chipsToMatch = maxOthersStageBet - actor.currentStageTotalAmount
  if (chipsToMatch <= 0) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_CALL_INVALID_STATE, {
        moneyShouldPay: chipsToMatch,
        balance: actor.balance,
        maxBet: maxOthersStageBet
      })
    )
  }
  if (chipsToMatch > actor.balance) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_CALL_EXCEEDS_BALANCE, {
        moneyShouldPay: chipsToMatch,
        balance: actor.balance
      })
    )
  }
  if (chipsToMatch === actor.balance) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_CALL_SHOULD_ALL_IN)
    )
  }

  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.CALL,
    payload: { value: chipsToMatch }
  })
  actor.appendChipsToPot(chipsToMatch)
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: true })
  tracePlayerAction('call', actor, { moneyShouldPay: chipsToMatch })
  actor.completeBettingTurn()
}

/** `skipTurnValidation`：与盲注 `executeBet(..., preFlopDefaultAction)` 一致，贴盲阶段 `activePlayer` 尚未就位。 */
export function executeAllIn(
  actor: Player,
  skipDomainEvents = false,
  skipTurnValidation = false
): number | void {
  if (!skipTurnValidation) actor.checkIfCanAct()
  if (!actor.getAllowedActions().includes(ActionTypeEnum.ALL_IN)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_ALL_IN))
  }

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
  tracePlayerAction('all_in', actor, {
    moneyShouldPay: chipsToCommit,
    balance: actor.balance
  })
  actor.completeBettingTurn()
  return chipsToCommit
}
