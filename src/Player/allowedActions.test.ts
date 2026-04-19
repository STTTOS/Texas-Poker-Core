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
      isBigBlindPreFlopOption: false
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
})
