/**
 * 进程级引擎配置：仿真开关等（**不含**库内 trace；观测由业务对领域事件 / 指令自行记录）。
 * 应用启动时 `configure`，单元测试可 `reset` 或按需 `configure`。
 */

/** 进程级可选仿真开关（由 `Texas.configureEngine` / `TexasEngineContext.configure` 注入） */
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
}

const DEFAULT_GLOBAL: TexasEngineGlobalOptions = {}

export class TexasEngineContext {
  private static global: TexasEngineGlobalOptions = { ...DEFAULT_GLOBAL }

  static configure(patch: Partial<TexasEngineGlobalOptions>): void {
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
}
