# Texas-Poker-Core

德州扑克核心功能, 包括房间初始化, 玩家加入, 初始化角色, 发牌, 洗牌, 控制游戏的进程, 比牌以及结算,奖池分配等功能

# 内测包注意事项

- 总是使用最新版本

```bash
npm i texas-poker-core@latest
```

# 使用手册 Usage

```ts
import { Texas } from 'texas-poker-core'

// 实例化Texas
const texas = new Texas({
  // 大盲注
  lowestBetAmount: 500,
  // 允许的最大玩家数量
  maximumCountOfPlayers: 7,
  // 是否允许观战, 如果房间玩家达到上限时, 此字段决定玩家是否还可以加入房间
  allowPlayersToWatch: true,
  // room owner info
  user: { id: 1, balance: 5000, name: 'ycr' },
  thinkingTime: 5
})
const p2 = texas.createPlayer({ id: 2, name: 'yt', balance: 10000 })
const p3 = texas.createPlayer({ id: 3, name: 'wyz', balance: 10000 })
const p4 = texas.createPlayer({ id: 4, name: 'sen', balance: 10000 })
texas.room.joinMany(p2, p3, p4)

// 玩家行动前触发的回调函数, 包括允许的行动列表, 行动玩家的id, 以及允许的下注范围
texas.onPreAction((preAction) => {})
// 玩家行动后触发的回调函数
// 可在此函数中完成数据上报行为
texas.onAction((action) => {})
// 游戏阶段变化触发的回调函数
texas.onNextStage((stageInfo) => {})
// 游戏结束时触发的回调函数
texas.onGameEnd((gameEndInfo) => {
  // 游戏结束后轮换庄家
  texas.dealer.changeButtonToNextPlayer()
  // 庄家变化后, 重新设置其他玩家的角色
  texas.dealer.setOthers()
  // 这里可以进行数据上报, 分配奖池, 更新用户的余额到数据库...

  // 操作完成后重置对局信息
  // 包括奖池, 底牌, 玩家手牌, 收回玩家的控制权...
  texas.reset()
  // 如果开启下一轮游戏, 只需再次调用`texas.start`即可
})
// 游戏进程中遇到错误触发的函数
texas.onError((texasError) => {})
// 房间初次创建时需调用, 确定各个玩家的角色
texas.ready()

// 开始游戏
// 大小盲默认下注, 可以通过texas.getDefaultBet获取默认下注信息
// 随后将控制权移交给小盲的下一位, 由具有行动权的玩家选择行动
// 会触发onPreAction回调, 可以在此方法中推送消息给客户端
texas.start()
```

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
