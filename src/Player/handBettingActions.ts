import type { Player } from './index'

import { ActionTypeEnum } from './constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/**
 * 街道下注动作的执行细节（校验、记池、荷官历史、trace、回调顺序）。
 * `Texas#dispatchCommand` / 仿真路径委托至此；盲注由 Controller 调 `executeBet(..., preFlopDefaultAction)`。
 */

/** 透传至 {@link Player.checkIfCanAct}；仅超时代指令需 `skipTurnOfferRequirement`。 */
export type ActValidationOptions = {
  skipTurnOfferRequirement?: boolean
}

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

export function executeCheck(actor: Player, act?: ActValidationOptions): void {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()
  if (!allowed.includes(ActionTypeEnum.CHECK)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_CHECK))
  }

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.CHECK })
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: false })
  tracePlayerAction('check', actor)
  actor.completeBettingTurn()
}

export function executeFold(actor: Player, act?: ActValidationOptions): void {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()
  if (!allowed.includes(ActionTypeEnum.FOLD)) {
    return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_FOLD))
  }

  actor.assignCurrentStreetAction({ type: ActionTypeEnum.FOLD })
  actor.setStatus('out')
  actor.notifyDealerActionHistory()
  actor.notifyActionCommitted({ emitPot: false })
  tracePlayerAction('fold', actor)
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
  tracePlayerAction('fold_leave_passive', actor)

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
  if (!preFlopDefaultAction) {
    actor.checkIfCanAct(act)
    const allowed = actor.getAllowedActions()
    if (!allowed.includes(ActionTypeEnum.BET)) {
      return actor.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_BET))
    }
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
    return executeAllIn(actor, skipDomainEvents, preFlopDefaultAction, act)
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
  additionalChips: number,
  act?: ActValidationOptions
): void | number | undefined {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()

  const maxOthersStageBet = actor.getMaxOthersStageBet()

  if (!allowed.includes(ActionTypeEnum.RAISE)) {
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
    return executeAllIn(actor, false, false, act)
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

export function executeCall(actor: Player, act?: ActValidationOptions): void {
  actor.checkIfCanAct(act)
  const allowed = actor.getAllowedActions()
  if (!allowed.includes(ActionTypeEnum.CALL)) {
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
  if (!allowed.includes(ActionTypeEnum.ALL_IN)) {
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
  if (!skipTurnValidation) {
    actor.completeBettingTurn()
  }
  return chipsToCommit
}
