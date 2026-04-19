import type { PendingFlowOpKind } from '@/Controller'

import {
  peekPendingFlowOp,
  pendingFlowOpsAllowVoluntaryDispatch
} from './pendingFlowReadModel'

describe('pendingFlowReadModel', () => {
  test('allow voluntary only when queue empty', () => {
    expect(pendingFlowOpsAllowVoluntaryDispatch([])).toBe(true)
    expect(
      pendingFlowOpsAllowVoluntaryDispatch([
        'turn_handoff'
      ] as PendingFlowOpKind[])
    ).toBe(false)
    expect(
      pendingFlowOpsAllowVoluntaryDispatch([
        'stage_advance',
        'turn_handoff'
      ] as PendingFlowOpKind[])
    ).toBe(false)
  })

  test('peek head', () => {
    expect(peekPendingFlowOp([])).toBeUndefined()
    expect(
      peekPendingFlowOp([
        'stage_advance',
        'turn_handoff'
      ] as PendingFlowOpKind[])
    ).toBe('stage_advance')
  })
})
