export type ThinkingDeadlineFn = () => void | Promise<void>

/**
 * 思考倒计时：与「允许哪些行动」无关，单独封装便于测试与替换实现。
 */
export class PlayerTurnTiming {
  #timer: NodeJS.Timeout | null = null
  #thinkingDeadlineMs: number | null = null
  #countDownTime: number

  constructor(
    private readonly thinkingTimeSec: number,
    private readonly onDeadline: ThinkingDeadlineFn
  ) {
    this.#countDownTime = thinkingTimeSec
  }

  get countDownTime() {
    return this.#countDownTime
  }

  clear() {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    this.#thinkingDeadlineMs = null
    this.#countDownTime = this.thinkingTimeSec
  }

  #scheduleTick() {
    if (this.#thinkingDeadlineMs == null) return

    const msLeft = this.#thinkingDeadlineMs - Date.now()
    if (msLeft <= 0) {
      this.#countDownTime = 0
      this.#timer = null
      this.#thinkingDeadlineMs = null
      void Promise.resolve(this.onDeadline()).catch(() => {})
      return
    }

    this.#countDownTime = Math.ceil(msLeft / 1000)
    const nextDelay = Math.min(1000, msLeft)
    this.#timer = setTimeout(() => this.#scheduleTick(), nextDelay)
  }

  /** 若尚未启动计时，则从当前时刻起算思考截止 */
  resumeCountdownIfNeeded() {
    if (!this.#timer) {
      this.#thinkingDeadlineMs = Date.now() + this.thinkingTimeSec * 1000
      this.#scheduleTick()
    }
  }
}
