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

export async function executeCheck(actor: Player): Promise<void> {
  actor.checkIfCanAct()
  if (!actor.getAllowedActions().includes(ActionTypeEnum.CHECK)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_CHECK))
  }

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.CHECK })
  actor.notifyDealerActionHistory()
  await actor.invokeOnActionCallback()
  tracePlayerAction('check', actor)
  await actor.completeBettingTurn()
}

export async function executeFold(actor: Player): Promise<void> {
  actor.checkIfCanAct()
  if (!actor.getAllowedActions().includes(ActionTypeEnum.FOLD)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_FOLD))
  }

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.FOLD })
  actor.setStatus('out')
  actor.notifyDealerActionHistory()
  await actor.invokeOnActionCallback()
  tracePlayerAction('fold', actor)
  await actor.completeBettingTurn()
}

export async function executeBet(
  actor: Player,
  chipAmount: number,
  preFlopDefaultAction = false
): Promise<number | void> {
  if (preFlopDefaultAction === false) actor.checkIfCanAct()

  if (
    !actor.getAllowedActions().includes(ActionTypeEnum.BET) &&
    !preFlopDefaultAction
  ) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_BET))
  }

  if (chipAmount > actor.balance) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_BET_EXCEEDS_BALANCE, {
        money: chipAmount,
        balance: actor.balance
      })
    )
  }
  if (chipAmount < actor.lowestBetAmount && !preFlopDefaultAction) {
    return actor.fail(
      new TexasError(TexasCoreErrorCode.PLAYER_BET_BELOW_BB, {
        money: chipAmount,
        lowestBetAmount: actor.lowestBetAmount
      })
    )
  }
  if (chipAmount === actor.balance) {
    return executeAllIn(actor)
  }

  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.BET,
    payload: { value: chipAmount }
  })
  actor.appendChipsToPot(chipAmount)
  tracePlayerAction('bet', actor, {
    money: chipAmount,
    balance: actor.balance
  })
  actor.notifyDealerActionHistory()

  await actor.invokeOnActionCallback(preFlopDefaultAction)
  if (!preFlopDefaultAction) await actor.completeBettingTurn()
  return chipAmount
}

export async function executeRaise(
  actor: Player,
  additionalChips: number
): Promise<void | number | undefined> {
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
    return await executeAllIn(actor)
  }

  actor.appendChipsToPot(additionalChips)
  actor.assignCurrentStreetAction({
    type: ActionTypeEnum.RAISE,
    payload: { value: additionalChips }
  })
  actor.notifyDealerActionHistory()
  await actor.invokeOnActionCallback()
  tracePlayerAction('raise', actor, { money: additionalChips })
  await actor.completeBettingTurn()
}

export async function executeCall(actor: Player): Promise<void> {
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
  await actor.invokeOnActionCallback()
  tracePlayerAction('call', actor, { moneyShouldPay: chipsToMatch })
  await actor.completeBettingTurn()
}

export async function executeAllIn(actor: Player): Promise<number | void> {
  actor.checkIfCanAct()
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
  await actor.invokeOnActionCallback()
  tracePlayerAction('all_in', actor, {
    moneyShouldPay: chipsToCommit,
    balance: actor.balance
  })
  await actor.completeBettingTurn()
  return chipsToCommit
}
