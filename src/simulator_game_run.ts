/* eslint-disable @typescript-eslint/no-unused-vars */
// 此文件为模拟玩家行为
// 通过日志复刻玩家的操作记录
// 尝试找出问题根源
import Texas from './Texas'
import TexasError from './TexasError'

const texas = new Texas({
  lowestBetAmount: 500,
  maximumCountOfPlayers: 5,
  initialChips: 10000,
  user: { id: 1, name: 'ycr' },
  thinkingTime: 1
})
const p1 = texas.room.owner

const p2 = texas.createPlayer({ id: 2, name: 'yt' })
const p3 = texas.createPlayer({ id: 3, name: 'wyz' })
const p4 = texas.createPlayer({ id: 4, name: 'sen' })
const p5 = texas.createPlayer({ id: 5, name: 'wxl' })
texas.room.joinMany(p2, p3, p4, p5)
texas.room.seat(p1)
texas.room.seat(p2)
texas.room.seat(p3)
texas.room.seat(p4)
texas.room.seat(p5)

// 手动设置庄家位置
texas.dealer.setButton(p4)
texas.dealer.setOthers()
texas.dealer.log()
texas.onError((error) => {
  console.log('错误信息')
  console.log(error)
})

// texas.controller.transferControlTo(p1)
// ----
// 模拟下注行为
async function test() {
  await texas.controller.start()

  await p2.raise(800)
  await p3.call()
  await p4.call()
  await p5.call()
  // texas.controller.end()
}
test()
