import { initialGame } from './main'

const texas = initialGame({
  lowestBetAmount: 250,
  allowPlayersToWatch: true,
  maximumCountOfPlayers: 5,
  user: { id: 1, name: 'ycr', balance: 5000 }
})
const p1 = texas.room.owner

const p2 = texas.createPlayer({ id: 2, name: 'yt', balance: 10000 })
const p3 = texas.createPlayer({ id: 3, name: 'wyz', balance: 10000 })
const p4 = texas.createPlayer({ id: 4, name: 'sen', balance: 10000 })
const p5 = texas.createPlayer({ id: 5, name: 'wxl', balance: 30000 })
texas.room.joinMany(p2, p3, p4, p5)
texas.dealer.setButton(p2)
texas.dealer.setOthers()

texas.controller.transferControlToNext(p3)
p3.bet(250)
p4.raise(500)
p5.raise(800)
p1.allIn()
p2.call()
p3.call()
p4.call()
p5.allIn()
p2.allIn()
p3.allIn()
p4.allIn()
