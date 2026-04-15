/* eslint-disable @typescript-eslint/no-explicit-any */
// 此文件为游戏进程的模拟
// 循环运行, 尝试找出在实际运行中
// 出现的边缘情况
import Texas from './Texas'
import { TexasEngineContext } from './TexasEngineContext'

TexasEngineContext.configure({
  simulation: { resetDealerBeforeHandStart: true }
})

const texas = new Texas({
  lowestBetAmount: 500,
  maximumCountOfPlayers: 7,
  initialChips: 10000,
  user: { id: 1, name: 'ycr' }
})
// const p1 = texas.room.owner
const p2 = texas.createPlayer({ id: 2, name: 'yt' })
const p3 = texas.createPlayer({ id: 3, name: 'wyz' })
const p4 = texas.createPlayer({ id: 4, name: 'the Sen' })
const p5 = texas.createPlayer({ id: 5, name: 'wxl' })
texas.room.join(p2)
texas.room.join(p3)
texas.room.join(p4)
texas.room.join(p5)
texas.room.seat(texas.room.owner)
texas.room.seat(p2)
texas.room.seat(p3)
texas.room.seat(p4)
texas.room.seat(p5)

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
  texas.setPlayerRoles()
  texas.drainDomainEvents()
  while (count < 10) {
    try {
      texas.start()
      texas.flushAllPendingFlowOps()
      const ev = texas.drainDomainEvents()
      if (ev.some((e) => e.type === 'HandEnded')) end++
      await delay(50)
    } catch (error: any) {
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
