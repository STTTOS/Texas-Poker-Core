/* eslint-disable @typescript-eslint/no-unused-vars */
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
texas.dealer.setButton(p2)
texas.dealer.setOthers()

texas.controller.transferControlToNext(p1)
p1.bet(250)
p2.call()

// p1.check()
