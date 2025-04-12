/* eslint-disable @typescript-eslint/no-unused-vars */
// 此文件为模拟玩家行为
// 通过日志复刻玩家的操作记录
// 尝试找出问题根源
import { initialGame } from './main'

const texas = initialGame({
  lowestBetAmount: 100,
  allowPlayersToWatch: true,
  maximumCountOfPlayers: 5,
  user: { id: 1, name: 'ycr', balance: 5000 },
  thinkingTime: 5
})
const p1 = texas.room.owner

const p2 = texas.createPlayer({ id: 2, name: 'yt', balance: 10000 })
const p3 = texas.createPlayer({ id: 3, name: 'wyz', balance: 10000 })
const p4 = texas.createPlayer({ id: 4, name: 'sen', balance: 10000 })
const p5 = texas.createPlayer({ id: 5, name: 'wxl', balance: 30000 })
texas.room.joinMany(p2)

// 手动设置庄家位置
texas.dealer.setButton(p2)
texas.dealer.setOthers()

texas.controller.transferControlTo(p1)
// ----
// 模拟下注行为
p1.bet(250)
p2.call()
