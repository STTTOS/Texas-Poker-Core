## 1. Architecture docs (this change)

- [ ] 填充 `specs/texas/spec.md`：Texas 对外 API、事件回调、生命周期契约
- [ ] 填充 `specs/room/spec.md`：join/seat/watch/remove、initialChips、私密房间、上限人数
- [ ] 填充 `specs/dealer/spec.md`：角色分配、发牌、结算前计算字段、遍历规则
- [ ] 填充 `specs/controller/spec.md`：阶段推进、行动权、结束条件、异常状态
- [ ] 填充 `specs/pool/spec.md`：下注记录、边池、pay() 分配与守恒
- [ ] 填充 `specs/deck/spec.md`：RankSignature/RankCategory/rankStrength 的比较与一致性

## 2. Verification

- [ ] 补充一张“关键字段流向表”（initialChips→Player.balance→Pool.pay→balance）
- [ ] 从 `src/index.ts` 归纳“公开 API 表”与模块职责边界

## 3. Follow-ups (optional)

- [ ] 将 `design.md` 的不变式与测试用例一一对齐（每条 invariant 至少一个 test）
- [ ] 若发现架构说明与代码实现不一致：单独开 change 做修正（避免混在本 change）
