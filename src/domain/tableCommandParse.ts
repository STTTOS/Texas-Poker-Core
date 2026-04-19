import type { TableCommand } from './tableCommand'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function invalidTableCommand(message: string): never {
  throw new Error(`Invalid TableCommand JSON: ${message}`)
}

function requireFiniteNumber(x: unknown, field: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    invalidTableCommand(`${field} must be a finite number`)
  }
  return x
}

function readPlayerId(cmd: Record<string, unknown>): number {
  return requireFiniteNumber(cmd.playerId, 'playerId')
}

/**
 * 将任意 JSON 反序列化后的值收窄为 {@link TableCommand}（用于 wish / 牌谱入口校验）。
 */
export function parseTableCommandFromUnknown(cmd: unknown): TableCommand {
  if (!isRecord(cmd)) invalidTableCommand('root must be an object')
  const t = cmd.type
  if (typeof t !== 'string') invalidTableCommand('type must be a string')
  switch (t) {
    case 'Fold':
    case 'Check':
    case 'Call':
    case 'AllIn':
    case 'FoldDueToTimeout':
    case 'FoldDueToLeave':
    case 'CheckDueToTimeout':
    case 'PostBigBlind':
      return { type: t, playerId: readPlayerId(cmd) }
    case 'Bet': {
      const playerId = readPlayerId(cmd)
      const amount = requireFiniteNumber(cmd.amount, 'amount')
      return { type: 'Bet', playerId, amount }
    }
    case 'Raise': {
      const playerId = readPlayerId(cmd)
      const additionalAmount = requireFiniteNumber(
        cmd.additionalAmount,
        'additionalAmount'
      )
      return { type: 'Raise', playerId, additionalAmount }
    }
    default:
      invalidTableCommand(`unknown type: ${t}`)
  }
}

/** 单行 JSON → `TableCommand`（UTF-8 文本，如 wish HTTP body）。 */
export function parseTableCommandFromJson(json: string): TableCommand {
  let root: unknown
  try {
    root = JSON.parse(json) as unknown
  } catch {
    invalidTableCommand('not valid JSON')
  }
  return parseTableCommandFromUnknown(root)
}
