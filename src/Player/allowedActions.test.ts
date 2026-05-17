import { ActionTypeEnum } from './constant'
import { TexasCoreErrorCode } from '@/TexasError'
import {
  resolveAllowedActions,
  voluntaryActionDisallowError
} from './allowedActions'

describe('voluntaryActionDisallowError', () => {
  test('returns null when action is allowed', () => {
    const allowed = [ActionTypeEnum.CHECK, ActionTypeEnum.FOLD]
    expect(
      voluntaryActionDisallowError(
        allowed,
        ActionTypeEnum.CHECK,
        TexasCoreErrorCode.PLAYER_CANNOT_CHECK
      )
    ).toBeNull()
  })

  test('returns TexasError when action is missing', () => {
    const allowed = [ActionTypeEnum.FOLD, ActionTypeEnum.CALL]
    const err = voluntaryActionDisallowError(
      allowed,
      ActionTypeEnum.CHECK,
      TexasCoreErrorCode.PLAYER_CANNOT_CHECK
    )
    expect(err).not.toBeNull()
    expect(err!.code).toBe(TexasCoreErrorCode.PLAYER_CANNOT_CHECK)
  })
})

describe('resolveAllowedActions + voluntaryActionDisallowError', () => {
  test('fresh street: check is permitted and gate passes', () => {
    const ctx = {
      selfStatus: 'eligible' as const,
      selfBalance: 5000,
      selfCurrentStageTotal: 0,
      dealerActionHistory: [] as const,
      maxOthersStageBet: 0,
      isBigBlindPreFlopOption: false,
      isJoiningBlindPreFlopOption: false
    }
    const allowed = resolveAllowedActions(ctx)
    expect(
      voluntaryActionDisallowError(
        allowed,
        ActionTypeEnum.CHECK,
        TexasCoreErrorCode.PLAYER_CANNOT_CHECK
      )
    ).toBeNull()
  })

  test('after check: unmatched player cannot check (e.g. SB facing joining-BB check)', () => {
    const ctx = {
      selfStatus: 'eligible' as const,
      selfBalance: 4900,
      selfCurrentStageTotal: 100,
      dealerActionHistory: [
        {
          getAction: () => ({ type: ActionTypeEnum.CHECK }),
          getStatus: () => 'eligible',
          currentStageTotalAmount: 500
        }
      ] as const,
      maxOthersStageBet: 500,
      isBigBlindPreFlopOption: false,
      isJoiningBlindPreFlopOption: false
    }
    const allowed = resolveAllowedActions(ctx)
    expect(allowed).not.toContain(ActionTypeEnum.CHECK)
    expect(allowed).toContain(ActionTypeEnum.CALL)
    expect(allowed).toContain(ActionTypeEnum.FOLD)
  })

  test('after check with zero street total: next player may check', () => {
    const ctx = {
      selfStatus: 'eligible' as const,
      selfBalance: 5000,
      selfCurrentStageTotal: 0,
      dealerActionHistory: [
        {
          getAction: () => ({ type: ActionTypeEnum.CHECK }),
          getStatus: () => 'eligible',
          currentStageTotalAmount: 0
        }
      ] as const,
      maxOthersStageBet: 0,
      isBigBlindPreFlopOption: false,
      isJoiningBlindPreFlopOption: false
    }
    expect(resolveAllowedActions(ctx)).toContain(ActionTypeEnum.CHECK)
  })

  test('joining blind option: replace call with check when already matched', () => {
    const ctx = {
      selfStatus: 'eligible' as const,
      selfBalance: 5000,
      selfCurrentStageTotal: 500,
      dealerActionHistory: [
        {
          getAction: () => ({ type: ActionTypeEnum.BET }),
          getStatus: () => 'eligible',
          currentStageTotalAmount: 500
        }
      ] as const,
      maxOthersStageBet: 500,
      isBigBlindPreFlopOption: false,
      isJoiningBlindPreFlopOption: true
    }
    expect(resolveAllowedActions(ctx)).toEqual([
      ActionTypeEnum.CHECK,
      ActionTypeEnum.RAISE,
      ActionTypeEnum.FOLD,
      ActionTypeEnum.ALL_IN
    ])
  })
})
