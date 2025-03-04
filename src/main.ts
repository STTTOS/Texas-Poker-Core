import Dealer from './Dealer'

// 测试发牌的误差率
function errorRateOfDealingCards(count = 0) {
  let h = 0
  console.time('simulate')
  while (count < 100_000) {
    count++
    console.log(count)
    const dealer = new Dealer({ id: 1, balance: 500 }, 200)

    dealer.start()
    if (dealer.getDeck().getMax().type === 'q') {
      h++
    }
  }
  console.timeEnd('simulate')
  const offsetRate = (Math.abs(h / count - 0.174) / 0.174) * 100
  console.log(offsetRate, '%')
}
errorRateOfDealingCards()
