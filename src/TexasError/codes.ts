/**
 * 错误码分段（建议业务按段做文案/i18n）：
 * 3100–3199 房间 / 座位
 * 3200–3299 会话（Texas 开局、结束）
 * 3300–3399 Controller
 * 3400–3499 玩家行动
 * 3500–3599 奖池
 * 3600–3699 Dealer / 发牌
 * 3900–3999 内部不变量 / 数据异常
 */

export const TexasCoreErrorCode = {
  ROOM_READY_MIN_SEATED: 3101,
  ROOM_ALREADY_LOCKED: 3102,
  ROOM_OWNER_REQUIRED: 3103,
  ROOM_DUPLICATE_JOIN: 3104,
  ROOM_SEAT_NOT_IDLE: 3105,
  ROOM_SEAT_NOT_MEMBER: 3106,
  ROOM_SEAT_ALREADY: 3107,
  ROOM_SEAT_FULL: 3108,
  ROOM_WATCH_NOT_IDLE: 3109,
  ROOM_WATCH_NOT_MEMBER: 3110,
  ROOM_WATCH_ALREADY_HANG: 3111,
  ROOM_LEAVE_NOT_MEMBER: 3112,
  ROOM_OWNER_LEAVE_BLOCKED: 3113,
  ROOM_LEAVE_GAME_ACTIVE: 3114,

  SESSION_START_MIN_SEATED: 3201,
  SESSION_START_SEATS_OPEN: 3202,
  SESSION_START_NOT_IDLE: 3203,
  SESSION_END_NOT_STARTED: 3204,
  /** 设置/轮换角色时桌上玩家筹码低于大盲（数据异常） */
  SESSION_SET_ROLES_BALANCE_BELOW_BB: 3205,
  /** dispatchCommand：桌上无此 userId */
  SESSION_DISPATCH_PLAYER_NOT_FOUND: 3206,

  CTRL_NO_PLAYER: 3300,
  CTRL_DUPLICATE_CONTROL: 3301,
  CTRL_NOT_PAUSED: 3302,
  CTRL_END_NOT_IN_HAND: 3303,
  CTRL_SB_BB_MISSING: 3305,
  CTRL_START_NO_ACTIVE: 3306,
  /** tryToEndGame：Dealer 人数不足 2，流程损坏 */
  CTRL_ENDGAME_INVARIANT_DEALER_LT_2: 3307,

  PLAYER_ACTION_INVALID: 3401,
  PLAYER_CANNOT_CHECK: 3402,
  PLAYER_CANNOT_FOLD: 3403,
  PLAYER_CANNOT_BET: 3404,
  PLAYER_BET_EXCEEDS_BALANCE: 3405,
  PLAYER_BET_BELOW_BB: 3406,
  PLAYER_CANNOT_RAISE: 3407,
  PLAYER_RAISE_EXCEEDS_BALANCE: 3408,
  PLAYER_RAISE_BELOW_BB: 3409,
  PLAYER_RAISE_NOT_INCREASE: 3410,
  PLAYER_CANNOT_CALL: 3411,
  PLAYER_CALL_INVALID_STATE: 3412,
  PLAYER_CALL_EXCEEDS_BALANCE: 3413,
  PLAYER_CALL_SHOULD_ALL_IN: 3414,
  PLAYER_CANNOT_ALL_IN: 3415,
  PLAYER_ALL_IN_INVALID: 3416,
  PLAYER_NOT_IN_HAND: 3417,
  PLAYER_NO_CONTROL: 3418,
  /** dispatchCommand：非当前行动方 */
  PLAYER_DISPATCH_NOT_ACTOR: 3419,

  POOL_NEGATIVE_AMOUNT: 3501,
  POOL_INSUFFICIENT_BALANCE: 3502,
  POOL_PAY_INVALID: 3503,
  POOL_WINNERS_INVALID: 3504,
  POOL_ALREADY_PAID: 3505,

  DEALER_NO_BUTTON: 3601,
  DEALER_UNSUPPORTED_COUNT: 3602,
  DEALER_BUTTON_HANDOFF_INVALID: 3603,
  DEALER_SET_OTHERS_NO_BUTTON: 3604,
  DEALER_COUNT_OUT_OF_RANGE: 3605,
  /** 入座变动后重排角色时庄家位未就绪 */
  DEALER_REARRANGE_NO_BUTTON: 3606,
  /** 玩家已在环形座位中，重复 join */
  DEALER_TABLE_JOIN_DUPLICATE: 3607,
  /** 玩家不在环形座位中，无法 remove */
  DEALER_TABLE_REMOVE_NOT_SEATED: 3608,

  INTERNAL_NO_NEXT_PLAYER: 3901
} as const

export type TexasErrorCode =
  (typeof TexasCoreErrorCode)[keyof typeof TexasCoreErrorCode]

export type TexasErrorPayload = Record<string, unknown>
export type TexasErrorSeverity = 'recoverable' | 'fatal'

/**
 * 错误严重程度分级（用于 server 侧错误路由）：
 * - recoverable: 业务校验失败/重复请求/时序不匹配，可仅拒绝当前动作
 * - fatal: 核心不变量或流程损坏，建议中止当前对局并广播异常
 */
export function getTexasErrorSeverity(
  code: TexasErrorCode
): TexasErrorSeverity {
  const fatalCodes = new Set<TexasErrorCode>([
    TexasCoreErrorCode.CTRL_SB_BB_MISSING,
    TexasCoreErrorCode.CTRL_START_NO_ACTIVE,
    TexasCoreErrorCode.CTRL_ENDGAME_INVARIANT_DEALER_LT_2,
    TexasCoreErrorCode.POOL_PAY_INVALID,
    TexasCoreErrorCode.INTERNAL_NO_NEXT_PLAYER,
    TexasCoreErrorCode.DEALER_BUTTON_HANDOFF_INVALID,
    TexasCoreErrorCode.SESSION_SET_ROLES_BALANCE_BELOW_BB
  ])

  if (fatalCodes.has(code)) return 'fatal'
  return 'recoverable'
}

export function isFatalTexasErrorCode(code: TexasErrorCode): boolean {
  return getTexasErrorSeverity(code) === 'fatal'
}

export function formatTexasErrorMessage(
  code: TexasErrorCode,
  payload?: TexasErrorPayload
): string {
  const p = payload ?? {}
  switch (code) {
    case TexasCoreErrorCode.ROOM_READY_MIN_SEATED:
      return `玩家数量小于${p.min ?? 2}, 无法进行游戏`
    case TexasCoreErrorCode.ROOM_ALREADY_LOCKED:
      return '玩家位置已确认,请勿重复设置'
    case TexasCoreErrorCode.ROOM_OWNER_REQUIRED:
      return '房主不可为空'
    case TexasCoreErrorCode.ROOM_DUPLICATE_JOIN:
      return '您已经在房间中,不可重复加入'
    case TexasCoreErrorCode.ROOM_SEAT_NOT_IDLE:
      return '游戏还未结束, 无法入座'
    case TexasCoreErrorCode.ROOM_SEAT_NOT_MEMBER:
      return '您不在房间中,无法入座'
    case TexasCoreErrorCode.ROOM_SEAT_ALREADY:
      return '您已在坐席中,请勿重复操作'
    case TexasCoreErrorCode.ROOM_SEAT_FULL:
      return '位置已满,无法加入坐席'
    case TexasCoreErrorCode.ROOM_WATCH_NOT_IDLE:
      return '游戏正在进行中, 无法加入观战席'
    case TexasCoreErrorCode.ROOM_WATCH_NOT_MEMBER:
      return '您不在房间中,无法观战'
    case TexasCoreErrorCode.ROOM_WATCH_ALREADY_HANG:
      return '您已在观战席中,请勿重复操作'
    case TexasCoreErrorCode.ROOM_LEAVE_NOT_MEMBER:
      return '您不在房间中,无法退出'
    case TexasCoreErrorCode.ROOM_OWNER_LEAVE_BLOCKED:
      return '房主不可退出,请先转移房主'
    case TexasCoreErrorCode.ROOM_LEAVE_GAME_ACTIVE:
      return '游戏进行中, 不可退出'

    case TexasCoreErrorCode.SESSION_START_MIN_SEATED:
      return '玩家数量不足, 无法开始游戏'
    case TexasCoreErrorCode.SESSION_START_SEATS_OPEN:
      return '玩家位置未确认, 无法进行游戏'
    case TexasCoreErrorCode.SESSION_START_NOT_IDLE:
      return '游戏已经开始, 请勿重复开始游戏'
    case TexasCoreErrorCode.SESSION_END_NOT_STARTED:
      return '游戏还未开始, 无法结束游戏'
    case TexasCoreErrorCode.SESSION_SET_ROLES_BALANCE_BELOW_BB:
      return `数据异常: 玩家 ${p.userId} 余额(${p.balance})不足大盲(${p.bigBlind}), 无法设置角色`
    case TexasCoreErrorCode.SESSION_DISPATCH_PLAYER_NOT_FOUND:
      return `玩家 ${p.playerId ?? '?'} 不在本桌，无法下发指令`

    case TexasCoreErrorCode.CTRL_NO_PLAYER:
      return '玩家不存在, 无法获得控制权'
    case TexasCoreErrorCode.CTRL_DUPLICATE_CONTROL:
      return '无法重复获得控制权'
    case TexasCoreErrorCode.CTRL_NOT_PAUSED:
      return '游戏不是暂停状态,无法继续'
    case TexasCoreErrorCode.CTRL_END_NOT_IN_HAND:
      return '游戏不在进行中, 无法结束'
    case TexasCoreErrorCode.CTRL_SB_BB_MISSING:
      return '游戏进程异常: 小盲或大盲玩家不存在'
    case TexasCoreErrorCode.CTRL_START_NO_ACTIVE:
      return '游戏进程异常'
    case TexasCoreErrorCode.CTRL_ENDGAME_INVARIANT_DEALER_LT_2:
      return `游戏进程异常: 进行中手牌 Dealer 人数不足 (${p.count ?? '?'})`

    case TexasCoreErrorCode.PLAYER_ACTION_INVALID:
      return String(p.detail ?? '玩家行为异常')
    case TexasCoreErrorCode.PLAYER_CANNOT_CHECK:
      return '不可过牌'
    case TexasCoreErrorCode.PLAYER_CANNOT_FOLD:
      return '不可弃牌'
    case TexasCoreErrorCode.PLAYER_CANNOT_BET:
      return '不可下注'
    case TexasCoreErrorCode.PLAYER_BET_EXCEEDS_BALANCE:
      return '下注金额不可大于筹码总数'
    case TexasCoreErrorCode.PLAYER_BET_BELOW_BB:
      return '下注金额不可小于大盲注'
    case TexasCoreErrorCode.PLAYER_CANNOT_RAISE:
      return '不可加注'
    case TexasCoreErrorCode.PLAYER_RAISE_EXCEEDS_BALANCE:
      return '加注金额不可大于余额'
    case TexasCoreErrorCode.PLAYER_RAISE_BELOW_BB:
      return '加注金额不可小于大盲注'
    case TexasCoreErrorCode.PLAYER_RAISE_NOT_INCREASE:
      return '必须加注更多的金额'
    case TexasCoreErrorCode.PLAYER_CANNOT_CALL:
      return '不可跟注'
    case TexasCoreErrorCode.PLAYER_CALL_INVALID_STATE:
      return `数据异常, 请手动下注, try to call: ${p.moneyShouldPay}, balance: ${p.balance}, maxBet: ${p.maxBet}`
    case TexasCoreErrorCode.PLAYER_CALL_EXCEEDS_BALANCE:
      return '跟注金额不可大于筹码总数'
    case TexasCoreErrorCode.PLAYER_CALL_SHOULD_ALL_IN:
      return '跟注金额等于筹码总数, 应该全押, 不该调用call方法'
    case TexasCoreErrorCode.PLAYER_CANNOT_ALL_IN:
      return '不可全押'
    case TexasCoreErrorCode.PLAYER_ALL_IN_INVALID:
      return `数据异常,请手动下注, try to allIn: ${p.moneyShouldPay}; balance: ${p.balance}`
    case TexasCoreErrorCode.PLAYER_NOT_IN_HAND:
      return '游戏不在进行中, 不可行动'
    case TexasCoreErrorCode.PLAYER_NO_CONTROL:
      return '没有控制权, 无法行动'
    case TexasCoreErrorCode.PLAYER_DISPATCH_NOT_ACTOR:
      return `当前行动方不是玩家 ${p.playerId ?? '?'}，拒绝指令`

    case TexasCoreErrorCode.POOL_NEGATIVE_AMOUNT:
      return '下注金额不可小于零'
    case TexasCoreErrorCode.POOL_INSUFFICIENT_BALANCE:
      return '玩家余额不足'
    case TexasCoreErrorCode.POOL_PAY_INVALID:
      return '支付发生错误, 数据异常'

    case TexasCoreErrorCode.DEALER_NO_BUTTON:
      return '庄家未指定, 无法发牌'
    case TexasCoreErrorCode.DEALER_UNSUPPORTED_COUNT:
      return '不支持的玩家人数对局'
    case TexasCoreErrorCode.DEALER_BUTTON_HANDOFF_INVALID:
      return '将庄家移交给不存在的玩家'
    case TexasCoreErrorCode.DEALER_SET_OTHERS_NO_BUTTON:
      return '未指定庄家, 无法设置其余玩家位置'
    case TexasCoreErrorCode.DEALER_REARRANGE_NO_BUTTON:
      return '未指定庄家, 无法重排座位角色'
    case TexasCoreErrorCode.DEALER_COUNT_OUT_OF_RANGE:
      return `暂不支持${p.count}人的对局`
    case TexasCoreErrorCode.DEALER_TABLE_JOIN_DUPLICATE:
      return `数据异常: 玩家 ${p.userId ?? '?'} 已在座位环中, 不可重复入座`
    case TexasCoreErrorCode.DEALER_TABLE_REMOVE_NOT_SEATED:
      return `数据异常: 玩家 ${p.userId ?? '?'} 不在座位环中, 无法离座`

    case TexasCoreErrorCode.INTERNAL_NO_NEXT_PLAYER:
      return '游戏发生异常, 将控制权移交给不存在的玩家'

    default:
      return `未知错误 (${code})`
  }
}
