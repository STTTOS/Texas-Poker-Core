/**
 * 进程级引擎配置：trace、仿真开关等。
 * 应用启动时 `configure`，单元测试可 `reset` 或按需 `configure`。
 * 单桌参数（如 maximumCountOfPlayers）仍由 `Texas` / `Room` / `Dealer` 构造传入，不放在此上下文。
 * 进街/交权节奏不在此开关控制，由 `pendingFlowOps` 与业务消费 API 表达。
 */

export type TexasTraceEvent = {
  channel: 'player' | 'dealer' | 'controller' | 'pool'
  name: string
  data?: Record<string, unknown>
}

/** 与旧 PROJECT_ENV=dev 等行为对齐的可选仿真开关 */
export type TexasSimulationFlags = {
  /** balance setter 不生效 */
  ignoreBalanceSetter?: boolean
  /** player.reset() 后把 balance 写回内存旧值 */
  restoreBalanceOnPlayerReset?: boolean
  /** Controller.start 前对 dealer 执行 reset（旧 dev） */
  resetDealerBeforeHandStart?: boolean
  /** setOthers 在仅 1 人在环形桌时直接返回 */
  allowSingleSeatedPlayer?: boolean
  /** getControl → continue 立即走默认行动（旧 dev continue） */
  immediateDefaultActionOnTurn?: boolean
  /** takeDefaultAction 随机选合法行动（旧 dev） */
  randomPickOnDefaultAction?: boolean
}

export type TexasEngineGlobalOptions = {
  simulation?: TexasSimulationFlags
  trace?: (event: TexasTraceEvent) => void
}

const DEFAULT_GLOBAL: TexasEngineGlobalOptions = {}

export class TexasEngineContext {
  private static global: TexasEngineGlobalOptions = { ...DEFAULT_GLOBAL }

  static configure(patch: Partial<TexasEngineGlobalOptions>): void {
    if (patch.trace !== undefined) this.global.trace = patch.trace
    if (patch.simulation !== undefined) {
      this.global.simulation = {
        ...(this.global.simulation ?? {}),
        ...patch.simulation
      }
    }
  }

  static reset(): void {
    this.global = { ...DEFAULT_GLOBAL }
  }

  static get(): Readonly<TexasEngineGlobalOptions> {
    return this.global
  }

  static simulation(): TexasSimulationFlags {
    return this.global.simulation ?? {}
  }

  static emitTrace(event: TexasTraceEvent): void {
    this.global.trace?.(event)
  }
}
