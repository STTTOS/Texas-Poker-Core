import { Poke } from "../Deck/constant";

type PlayerStatus = "unable-to-act" | "active" | "off-line";
type Action = "check" | "fold" | "raise" | "bet" | "call" | "all-in";
export interface User {
  id: number;
  balance: number;
}

export type Role =
  | "button"
  | "small-blind"
  | "big-blind"
  | `under-the-gun${number | ""}`
  | `middle-position${number | ""}`
  | "hi-jack"
  | "cut-off";

/**
 * 玩家
 */
export class Player {
  /**
   * 玩家当前所处的位置
   */
  #role?: Role;
  #userInfo: User;
  /**
   * 积分
   */
  #balance: number;
  #status: PlayerStatus = "active";
  /**
   * 默认的思考时间为30s
   */
  #countDownTime = 30;
  #action?: Action;
  /**
   * 最小下注金额
   */
  #lowestBeAmount: number;
  /**
   * 当前阶段的下注总额
   */
  #currentStageTotalAmount = 0;
  /**
   * 指针指向上一个玩家, 庄家位的`lastPlayer`为`null`
   */
  #lastPlayer: Player | null = null;
  #nextPlayer: Player | null = null;

  #isLast: boolean = false;
  /**
   * 玩家的手牌
   */
  #handPokes: Poke[] = [];

  constructor({
    lowestBeAmount,
    user,
    lastPlayer = null,
    nextPlayer = null,
  }: {
    lowestBeAmount: number;
    role?: Role;
    user: User;
    lastPlayer?: Player | null;
    nextPlayer?: Player | null;
    handPokes?: Poke[];
  }) {
    if (user.balance < lowestBeAmount) {
      throw new Error("筹码小于大盲注, 不可参与游戏");
    }
    this.#balance = user.balance;
    this.#lowestBeAmount = lowestBeAmount;
    this.#userInfo = user;
    this.#lastPlayer = lastPlayer;
    this.#nextPlayer = nextPlayer;
  }
  setNextPlayer(player: Player) {
    this.#nextPlayer = player;
  }

  getNextPlayer() {
    return this.#nextPlayer;
  }

  getLastPlayer() {
    return this.#lastPlayer;
  }
  setLastPlayer(player: Player) {
    this.#lastPlayer = player;
  }
  getIsLast() {
    return this.#isLast;
  }

  #changeActionStatus(action: Action) {
    this.#action = action;
  }

  setIsLast(value: boolean) {
    this.#isLast = value;
  }
  /**
   * @description 当前玩家采取的行动
   */
  takeAction(action: Action) {
    if (this.#status === "unable-to-act") {
      throw new Error("不可行动");
    }
    this.#action = action;
  }
  setRole(role: Role) {
    this.#role = role;
  }

  check() {
    if (!this.#getAllowedActions().includes("check"))
      throw new Error("不可过牌");

    this.#action = "check";
  }

  fold() {
    if (!this.#getAllowedActions().includes("fold"))
      throw new Error("不可弃牌");

    this.#action = "fold";
    this.#status = "unable-to-act";
  }

  // TODO: 需调用api直接支付
  bet(money: number) {
    if (!this.#getAllowedActions().includes("bet")) throw new Error("不可下注");

    if (money > this.#balance) {
      throw new Error("下注金额不可大于筹码总数");
    }
    if (money < this.#lowestBeAmount) {
      throw new Error("下注金额不可小于大盲注");
    }
    this.#action = "bet";
    this.#balance -= money;
    this.#currentStageTotalAmount += money;
  }

  // TODO: 需调用api直接支付
  raise(money: number, lastPlayer: Player) {
    if (!this.#getAllowedActions().includes("raise"))
      throw new Error("不可加注");

    if (money > this.#balance) {
      throw new Error("加注金额不可大于筹码总数");
    }
    if (
      money + this.#currentStageTotalAmount <=
      lastPlayer.#currentStageTotalAmount
    ) {
      throw Error("必须加注更多的金额");
    }
    this.#action = "raise";
    this.#balance -= money;
    this.#currentStageTotalAmount += money;
  }

  // TODO: 需调用api直接支付
  call() {
    if (!this.#getAllowedActions().includes("call"))
      throw new Error("不可跟注");

    // 需要找到上一个行动的玩家
    const player = this.returnLatestPlayerIf(
      (player) => player.#action !== "fold" && player.#action !== "check"
    )!;
    // TODO: 这里还有特殊情况
    const moneyShouldPay =
      player.#currentStageTotalAmount - this.#currentStageTotalAmount;
    if (moneyShouldPay < this.#balance) {
      throw new Error("跟注金额不可小于筹码总数");
    }
    this.#action = "call";
    this.#balance -= moneyShouldPay;
    this.#currentStageTotalAmount += moneyShouldPay;
  }

  // TODO: 需调用api直接支付
  /**
   * @description all-in跟上一个玩家的选择没有任何关系
   */
  allIn() {
    if (!this.#getAllowedActions().includes("all-in")) {
      throw new Error("不可全押");
    }

    this.#action = "all-in";
    this.#currentStageTotalAmount += this.#balance;
    this.#balance = 0;
    this.#status = "unable-to-act";
  }

  getAllowedActions() {
    return this.#getAllowedActions();
  }

  /**
   * @description 根据上一个玩家, 计算可以行动的行动列表
   * @param lastPlayer
   */
  #getAllowedActions(
    lastPlayer: Player | null = this.#lastPlayer
  ): Array<Action> {
    if (this.#status === "unable-to-act") return [];

    // 当前阶段第一位行动的玩家
    if (!lastPlayer) return ["bet", "all-in", "fold", "check"];

    if (lastPlayer.#action === "check")
      return ["all-in", "bet", "check", "fold"];

    if (lastPlayer.#action === "bet")
      return ["call", "raise", "all-in", "fold"];

    if (lastPlayer.#action === "raise")
      return ["call", "raise", "all-in", "fold"];

    // 需要根据指针找到最近采取行动的玩家
    if (lastPlayer.#action === "fold") {
      const player = this.returnLatestPlayerIf(
        (player) => player.#action !== "fold"
      );
      return this.#getAllowedActions(player);
    }

    if (lastPlayer.#action === "all-in")
      return ["call", "raise", "fold", "all-in"];

    // call
    return ["call", "raise", "fold", "all-in"];
  }

  returnLatestPlayerIf(filter: (player: Player) => boolean): Player | null {
    let current = this.#lastPlayer;
    while (current) {
      if (filter(current)) return current;
      current = current.#lastPlayer;
    }
    return null;
  }

  getAction() {
    return this.#action;
  }

  getBalance() {
    return this.#balance;
  }
  getRole() {
    return this.#role;
  }
  getUserInfo() {
    return this.#userInfo;
  }

  toString() {
    return `${JSON.stringify(this.#userInfo)}`;
  }
  log() {
    console.log(this.toString());
  }

  setHandPokes(pokes: Poke[]) {
    this.#handPokes = pokes;
  }
  getHandPokes() {
    return this.#handPokes;
  }
  // pay(money: number) {}

  earn(money: number) {}
}
// 庄家
// const p1 = new Player(200, "button", { id: 1, balance: 20000 }, null);
// const p2 = new Player(200, "small-blind", { id: 2, balance: 30000 }, p1);
// const p3 = new Player(200, "small-blind", { id: 3, balance: 5000 }, p2);
// const p4 = new Player(200, "under-the-gun1", { id: 3, balance: 5000 }, p3);

// p2.takeAction("fold");

// p1.takeAction("check");
// p3.takeAction("bet");
// p4.takeAction("bet");

// const l = p3.returnLatestPlayerIf((player) => player.getAction() !== "check");
// l?.log();
