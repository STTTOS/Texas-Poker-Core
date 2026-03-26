/**
 * 按区间归类（便于网关/监控聚合）；具体文案以 `formatTexasErrorMessage` + payload 为准。
 */
export function texasErrorCategory(code: number): string {
  if (code >= 3100 && code < 3200) return 'room'
  if (code >= 3200 && code < 3300) return 'session'
  if (code >= 3300 && code < 3400) return 'controller'
  if (code >= 3400 && code < 3500) return 'player_action'
  if (code >= 3500 && code < 3600) return 'pool'
  if (code >= 3600 && code < 3700) return 'dealer'
  if (code >= 3900 && code < 4000) return 'internal'
  return 'unknown'
}

/** @deprecated 请使用 TexasCoreErrorCode + payload；保留仅为兼容旧引用 */
export const texasErrorMap = new Map<number, string>([
  [3101, 'room'],
  [3201, 'session'],
  [3301, 'controller'],
  [3401, 'player_action'],
  [3501, 'pool'],
  [3601, 'dealer'],
  [3901, 'internal']
])

export type TexasErrorCodeLegacy = number
