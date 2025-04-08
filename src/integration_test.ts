/* eslint-disable @typescript-eslint/no-explicit-any */

// 此文件为游戏进程的模拟
// 循环运行, 尝试找出在实际运行中
// 出现的边缘请款
import { initialGame } from './main'

const texas = initialGame({
  lowestBetAmount: 500,
  maximumCountOfPlayers: 7,
  allowPlayersToWatch: true,
  user: { id: 1, balance: 5000, name: 'ycr' }
})
// const p1 = texas.room.owner
const p2 = texas.createPlayer({ id: 2, balance: 10_000, name: 'yt' })
const p3 = texas.createPlayer({ id: 3, balance: 10_000, name: 'wyz' })
const p4 = texas.createPlayer({ id: 4, balance: 10_000, name: 'the Sen' })
const p5 = texas.createPlayer({ id: 5, balance: 30_000, name: 'wxl' })
texas.room.join(p2)
texas.room.join(p3)
texas.room.join(p4)
texas.room.join(p5)

const delay = (ms = 1000) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(0)
    }, ms)
  })
}

let count = 0
let end = 0
let errorCount = 0
const errorInfo: string[] = []
async function test() {
  texas.ready()
  texas.onGameEnd(() => {
    end ++
  })
  while (count < 10) {
    try {
      texas.start()
      await delay(50)
    } catch(error: any) {
      errorCount++
      errorInfo.push(error.message)
    } finally {
      count++
    }
  }
  console.log(`模拟运行${count}次, 失败: ${errorCount}次`)
  console.log('游戏正常结束:', end)
  console.log(errorInfo.join(','))
}
test()
