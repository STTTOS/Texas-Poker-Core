# Texas-Poker-Core

无服务、无持久化的 **德州扑克（Texas Hold’em）对局引擎**：房间与座位、盲注与角色、发牌、行动轮次、阶段推进、摊牌比牌、奖池与边池分配等规则均在库内完成。  
**不包含**：账号系统、WebSocket/HTTP、数据库、匹配、UI；这些由业务层接入 `Texas` / `Room` / `Player` 的 API 与回调实现。

- **入口类**：`Texas` — 组装 `Pool`、`Dealer`、`Controller`、`Room`，并提供会话级方法。
- **错误模型**：规则或状态不满足时通过 `TexasError`（`TexasCoreErrorCode`）**fail-fast**；可用 `onError` 先记录再抛出。
- **可选节奏钩子**：构造 `Texas` 时传入 `beforeStageAdvance` / `beforeNextPlayerTurn`，在阶段切换、轮到下家前 `await`（例如发 WS、动画、`sleep`）。

---

## 安装与构建

```bash
npm install texas-poker-core
# 或 pnpm / yarn
```

类型定义见包内 `types/`；本地开发见仓库 `package.json` 中的 `build`、`test` 脚本。

---

## 核心对象一览

| 对象         | 职责                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `Texas`      | 创建一桌、注册监听、`setPlayerRoles` / `dealCards` / `start` / `settle` / `reset` 等会话流程                                      |
| `Room`       | 成员加入/观战/入座/离座、`initialRoles`（末 `lockSeats`）/ `rotateRoles`（不锁座）、`RoomStatus`（`seats_open` / `seats_locked`） |
| `Dealer`     | 盲注、庄家、角色顺序、发牌、行动历史（通常不直接给业务大量调用，多经 `Texas` / `Room`）                                           |
| `Controller` | 一手牌生命周期 `HandLifecycle`、当前街 `stage`、活跃玩家 `activePlayer`、阶段推进与终局                                           |
| `Pool`       | 奖池与支付（`texas.settle()` 时 `pool.pay()`）                                                                                    |
| `Player`     | 单个座位的筹码、手牌、行动 `check` / `bet` / `call` / `raise` / `fold` / `allIn` 与 `getControl`                                  |

---

## `HandLifecycle`（控制器状态）

与「房间是否锁座」不同，这是 **当前这一手** 在引擎里的阶段：

| 状态             | 含义                                                       |
| ---------------- | ---------------------------------------------------------- |
| `idle`           | 无进行中的手牌；**上一手已 `reset` 后**、下一手 `start` 前 |
| `in_hand`        | 本手进行中                                                 |
| `in_hand_paused` | 暂停                                                       |
| `between_hands`  | 本手已结束，**尚未** `reset`；可做摊牌展示、结算入库等     |
| `aborted`        | 预留                                                       |

**开下一手**：`Texas.start()` 要求 `controller.status === 'idle'` 且 **`Room.status === 'seats_locked'`**，因此本手结束后需先 `texas.settle()`（按需）、再 `texas.reset()`（会 `unlockSeats`），再按需 `texas.rotateRolesForNewHand()`（**仅移庄、不锁座**）；局间可 `seat`/`remove` 并 `reArrangeRoles()`；**下一手开盘前**（如倒计时 2s）由业务 `texas.lockSeats()`，再 `setPlayerRoles('rearrange')`（若需 `RolesAssigned`）、`dealCards()`、`start()`。  
**离座 / 入座**：`Room.seat` / `watch` / `remove`（已入座者）仅在 `Room.status === 'seats_open'` 时允许（**`initialRoles` 末会锁座**；**`rotateRoles` 不锁座**；**`Texas.reset()` 会 `unlockSeats()`**；下一手前再由业务 **`lockSeats()`**）。

---

## 典型对局流程（使用手册）

以下为常见顺序；具体校验与错误码以运行时 `TexasError` 为准。

### 1. 创建牌桌

```ts
import { Texas } from 'texas-poker-core'

const texas = new Texas({
  user: { id: 1, name: '房主' },
  lowestBetAmount: 20,
  maximumCountOfPlayers: 9,
  initialChips: 2000,
  // 可选：与 WS/动画对齐
  beforeNextPlayerTurn: async () => {
    /* await sleep(...) */
  },
  beforeStageAdvance: async () => {
    /* ... */
  }
})

texas.onError((err) => {
  // 日志、监控；随后仍会 throw
})
```

### 2. 注册用户与入座

```ts
const p2 = texas.createPlayer({ id: 2, name: '玩家2' })
texas.room.join(p2)
texas.room.seat(p2)
// join = 进房（默认观战席）；seat = 上桌，且要求房间 seats_open（一手收尾 reset 后）
```

### 3. 锁座、分配角色、发牌

```ts
texas.setPlayerRoles('initial') // 首局：Room.initialRoles（定庄+setOthers+锁座）；或 'rearrange'（仅 reArrangeRoles，须已有庄）
texas.dealCards()
// 上述会触发 onRolesAssigned / onDealCards（若已注册）
// 批量 seat/remove 后：入座/离环时 Dealer 已各调过 reArrangeRoles；若仍希望「最后一次再推角色」，可再调 texas.reArrangeRoles()（不写入 RolesAssigned 缓冲，需自行读 dealer 上各席 role）
```

### 4. 开始本手

```ts
// 要求：至少两人 on-set、房间 seats_locked、controller.idle
await texas.start()
// 内部会下盲注并移交控制权到第一个行动玩家
```

### 5. 轮到谁行动

当前行动玩家：`texas.controller.activePlayer`。  
该玩家可调用（均为 `async`，内部会校验合法行动并可能推进阶段/终局）：

- `check()` / `bet(amount)` / `call()` / `raise(amount)` / `fold()` / `allIn()`

行动前可给每个玩家注册 `onPreAction`，用于推送「允许行动列表、加注区间」等（见下文监听）。

### 6. 本手结束与清理

终局时 `Controller` 会触发 `onGameEnd`（若已注册）。  
之后业务侧通常：

```ts
texas.settle() // pool.pay()，按引擎规则分配边池
texas.reset() // pool + dealer + controller 清理，controller → idle，并 unlockSeats
// 下一手（示意）：reset(unlock) → rotateRolesForNewHand(移庄) → …局间 seat/reArrange… → lockSeats → setPlayerRoles('rearrange')? → dealCards → start()
```

---

## 监听与回调（Texas）

| 方法              | 说明                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `onError`         | 任意 `fail` / `TexasError` 抛出前回调                                    |
| `onRolesAssigned` | `setPlayerRoles` 成功后，携带 `userId` / `role` / `actionIndex`          |
| `onDealCards`     | `dealCards` 成功后，各玩家手牌（业务可据此推送私密牌）                   |
| `onPreAction`     | 轮到玩家行动前（注册到所有当前 `Player`）                                |
| `onAction`        | 玩家完成一次合法行动后（写库、广播；默认盲注行为可能不触发，以实现为准） |
| `onGameStart`     | 本手 `controller.start()` 内、盲注与首回合开始前                         |
| `onGameEnd`       | 一手结束，携带公牌、摊牌信息、`pokesRevealed` 等                         |
| `onNextStage`     | 翻牌 / 转牌 / 河牌等阶段推进，携带本段新亮公牌                           |

`Player` 上另有 `onPreAction` / `onAction`，适合按人注册。

---

## Room 常用 API

- `join` / `joinMany`：进房（观战席）；人数达 `maximumCountOfPlayers`（`hang`+`on-set` 合计）时拒绝
- `seat` / `seatById`：上桌（须 `seats_open`）
- `watch` / `watchById`：回观战（须 `seats_open`）
- `remove` / `removeById`：离房；**仅观战（`hang`）锁座时也可离房**；**已入座**须 `seats_open`（**房主需业务先 `setOwner` 再 remove**）
- `initialRoles`：定庄 + 盲位并 **lockSeats**；`rotateRoles`：局间移庄，**不** lock（下一手前由业务 `lockSeats`）
- `lockSeats` / `unlockSeats`：显式锁/解锁（`Texas.reset()` 会在一手收尾后 `unlockSeats`）
- `setOwner` / `setOwnerById` / `getBaseInfo` / `getPlayerById` / `getPlayersBySeatStatus` 等

---

## 引擎与调试

```ts
Texas.configureEngine({
  // trace、仿真开关等，见 TexasEngineGlobalOptions
})
Texas.resetEngineContext()
```

导出中还包含牌型/阶段/行动枚举与工具函数（如 `formatterPoke`、`StageEnum`、`ActionTypeEnum`、`isFatalTexasErrorCode` 等），便于与业务错误分级、持久化字段对齐。

---

## 更多文档

- 架构与事件化演进思路：`docs/architecture-events-orchestration.md`、`docs/roadmap-command-event-interpreter.md`

---

# 发布记录

## 1.0.11

保留 types 声明文件中的注释

## 1.0.12

导出其他类成员以及一些类型定义

## 1.0.13

将导出语句移动到 index 文件中

## 1.0.15

readme 中增加 api 文档地址

## 1.0.16

导出 action, role 相关的 type 以及 enum

## 1.0.17

上传忘记构建的内容

## 1.0.18

增加 User 类型字段

## 1.0.19

class Room 增加 function

## 1.0.21

room 增加方法 getPlayerById

## 1.0.22

class room 修改方法 getPlayerById 的返回值类型

## 1.0.23

完善 room api

## 1.0.24

test

## 1.0.25

test again

## 1.0.26

somthing went wrong

## 1.0.30

...

## 1.0.31

修复重复加入房间的问题

## 1.0.32

...

## 1.0.33

fix

## 1.0.34

修复 getUserInfo

## 1.0.39

调整 Room 的部分 api

## 1.0.40

add room => getPlayersBySeatStatus

## 1.0.41

add room => change the return type of getPlayersBySeatStatus to array

## 1.0.42

增加 log 信息

## 1.1.1

room.remove

## 1.1.2

main.end

## 1.1.3

人数小于 2 无法开始

## 1.1.4

reset room status

## 1.1.5

type Suit js Doc

## 1.1.6

导出扑克牌花色 type, map

## 1.1.7

...

## 1.1.8

修复一些问题

## 1.1.9

api change

## 1.1.10

新增游戏结束事件, 阶段推进事件

## 1.1.11

修复一些问题

## 1.1.12

无法找到版本问题

## 1.1.13

修复很多问题

## 1.1.14

模拟集成测试

## 1.1.15

修复默认下注行为的推送

## 1.1.16

修复很多问题

## 1.1.18

修复问题

## 1.1.19

修复问题

## 1.1.20

调整 api

## 1.1.21

增加一些事件监听方法

## 1.1.22

change api

## 1.1.23

change api

## 1.1.24

修复 onAction 的回调参数

## 1.1.25

增加 texas.reset api

## 1.1.26

修改 pool 值不同步的问题

## 1.1.26

修改 pool 值不同步的问题

## 1.1.27

解决玩家入座/离席时导致的玩家 role 未更新的问题

## 1.1.28

超时默认行为的记录

## 1.1.29

增加部分行为 可行动前的校验

## 1.1.30

手动重置游戏状态

## 1.1.31

增加 Log 日志

## 1.1.32

增加翻牌圈的参数 => onAction

## 1.1.33

增加 stage map 的导出

## 1.1.33

增加 stage map 的导出

## 1.1.34

修改导出方式

## 1.1.35

增加 poke formatter 导出

## 1.1.36

修复问题

## 1.1.37

修复许多问题

## 1.1.38

默认下注行为不触发回调

## 1.1.38

默认下注行为不触发回调

## 1.1.39

修复问题

## 1.1.39

修复问题

## 1.1.40

删除不必要的逻辑

## 1.1.41

重构 api

## 1.1.42

class 不使用 public 语法

## 1.1.43

玩家行动完后移交控制权

## 1.1.44

bufix

## 1.1.45

将游戏进程 main 函数封装为类

## 1.1.46

抛出错误时, 需要在 texas 实例上感知

## 1.1.47

推送最新版本

## 1.1.48

修复 player.actionble 判断错误

## 1.2.1

完善 texas.start 逻辑

## 1.2.2

完善 player.checkIfCanAct 的逻辑

## 1.2.3

测试 ncu

## 1.2.5

补充使用文档

## 1.2.6

修复行动前下注金额错误计算逻辑

## 1.2.7

不使用 core.js

## 1.2.8

增加 deck.core 下部分函数导出

## 1.2.9

使用枚举值重构 action&stage; 调整 presentation 的计算方式, 增加转换 Int 的方法, 便于以后数据库索引

## 1.3.0

## 1.3.1

重命名不合理的变量名称, 以防后期使用使混淆

## 1.3.2

新增角色枚举

## 1.4.1

重命名变量

## 1.4.2

分离职责到业务层

## 1.4.3

导出 fatal code 判断方法

## 1.4.4

增加一些单元测试

## 1.4.5

修正结算规则, 以摊开的公共牌数量为准

## 1.4.6

修复结算时的底牌计算错误&role-assign 增加 actionIndex 字段

## 1.4.7

增加类型到处

## 1.4.8

texas 实例新增 beforeStageAdvance,beforeNextPlayerTurn

## 1.4.9

修复 min,max 逻辑错误

## 1.4.10

增加新一轮重拍角色方法

## 1.4.11

修改游戏结算时的逻辑遗漏

## 1.4.12

修复 wager 局后未清空的问题

## 1.4.13

gameEnd 事件增加 pokesRevealed 字段用于入库

## 1.4.14

fix: 修复结算金额分配异常

## 1.4.15

允许玩家全押时下注所有筹码

## 1.4.16

允许玩家全押时下注所有筹码

## 1.4.17

对局一结束就允许离开

## 1.4.18

更新使用文档

## 1.4.19

修复 player reset 字段遗漏

## 1.4.21

引入领域事件&增加回放功能

## 1.4.22

增加外部设置玩家手牌&结算信息的方法

## 1.4.24

- `HandEnded` / `HandSettlement` 快照增加 `bestRankSignature`，与桌上最强 `bestPokes[0]` 对齐
- 导出 `rankSignatureToDisplayGroups`；顺子 wheel 在 `rankSignatureToRanks` 中 A 置于末位

## 1.4.25

- 导出 `createStandardDeckPokes`，生成标准 52 张牌（与 `Deck` 建牌顺序一致）

## 1.4.26

- 版本发布

## 1.4.27

reject modulo bias

## 1.4.28

贴盲与 game start 原子化
