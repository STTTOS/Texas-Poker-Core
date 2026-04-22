import type { PendingFlowOp } from '@/Controller'

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
        { kind: 'turn_handoff', toUserId: 2 }
      ] as PendingFlowOp[])
    ).toBe(false)
    expect(
      pendingFlowOpsAllowVoluntaryDispatch([
        { kind: 'stage_advance' },
        { kind: 'turn_handoff', toUserId: 3 }
      ] as PendingFlowOp[])
    ).toBe(false)
  })

  test('peek head', () => {
    expect(peekPendingFlowOp([])).toBeUndefined()
    expect(
      peekPendingFlowOp([
        { kind: 'stage_advance' },
        { kind: 'turn_handoff', toUserId: 3 }
      ] as PendingFlowOp[])
    ).toEqual({ kind: 'stage_advance' })
  })

  test('simulateDequeue matches head only', () => {
    const q = [
      { kind: 'stage_advance' },
      { kind: 'turn_handoff', toUserId: 5 }
    ] as PendingFlowOp[]
    const ok = simulateDequeuePendingHeadIfMatches(q, 'stage_advance')
    expect(ok.matched).toBe(true)
    expect(ok.queue).toEqual([{ kind: 'turn_handoff', toUserId: 5 }])

    const no = simulateDequeuePendingHeadIfMatches(q, 'turn_handoff')
    expect(no.matched).toBe(false)
    expect(no.queue).toEqual(q)
  })
})
