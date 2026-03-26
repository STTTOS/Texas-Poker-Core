## Why

项目代码已经具备完整对局能力，但内部架构知识目前分散在代码与测试里，缺少一个“可持续演进”的架构说明。
这会导致：

- 新人/未来自己理解成本高
- 命名与边界容易漂移（例如 hand vs five cards、rankSignature/strength 等）
- 关键不变式（invariants）与时序关系不清晰，排查问题困难

## What changes

在 `openspec/changes/architecture-overview/` 中新增一套“内部架构梳理”产物：

- `design.md`：主流程时序（包含 PreAction/onAction 回调链路）、状态机、模块职责边界、不变式
- `specs/*/spec.md`：按模块记录可验证的契约（WHEN/THEN）
- `tasks.md`：后续持续完善/对齐代码的任务清单

## Non-goals

- 不在本次梳理中改变业务逻辑或重构模块（除非为了让架构说明可验证而必须修正明显不一致）
- 不把外部使用说明（README 风格）作为主目标，本次以内部架构为主
