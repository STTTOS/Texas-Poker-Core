import type { PendingFlowOpKind } from '@/Controller'

import {
  peekPendingFlowOp,
  simulateDequeuePendingHeadIfMatches,
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

  test('simulateDequeue matches head only', () => {
    const q = ['stage_advance', 'turn_handoff'] as PendingFlowOpKind[]
    const ok = simulateDequeuePendingHeadIfMatches(q, 'stage_advance')
    expect(ok.matched).toBe(true)
    expect(ok.queue).toEqual(['turn_handoff'])

    const no = simulateDequeuePendingHeadIfMatches(q, 'turn_handoff')
    expect(no.matched).toBe(false)
    expect(no.queue).toEqual(q)
  })
})
