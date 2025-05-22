import Player from '@/Player'

/**
 * @description 分配奖池时, 会出现3个人分配2000奖池, 导致除不尽的情况
 * 系统会将无法整数分配的奖池, 随机分配给玩家, 比如说 666 667 667
 */
const allocatePoolByInt = (
  players: Player[],
  totalAmount: number
): Array<{ player: Player; amount: number }> => {
  const { length: count } = players
  const restAmount = totalAmount % count
  // 整除后分配的金额
  const minAmount = Math.floor(totalAmount / count)
  // 哪些玩家需要额外分得1积分
  const playerIdsToReciveRestAmount = [...players]
    .sort(() => 0.5 - Math.random())
    .slice(0, restAmount)
    .map((player) => player.id)

  return players.map((player) => {
    return {
      player,
      amount: playerIdsToReciveRestAmount.includes(player.id)
        ? minAmount + 1
        : minAmount
    }
  })
}
export default allocatePoolByInt
