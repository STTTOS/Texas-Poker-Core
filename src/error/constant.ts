export const texasErrorMap = new Map([
  [2000, '游戏进程异常'],
  [2001, '游戏数据异常'],
  // [2002, '加入游戏异常'],
  [2003, '玩家行为异常'],
  [2100, '其他异常']
] as const)

export type TexasErrorCode = Parameters<typeof texasErrorMap.get>[0]
