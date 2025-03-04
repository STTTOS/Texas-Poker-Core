import { Role } from "./index";

const twoPlayer: Role[] = ["button", "big-blind"];
const threePlayer: Role[] = ["button", "small-blind", "big-blind"];
const fourPlayer: Role[] = threePlayer.concat("under-the-gun");
const fivePlayer: Role[] = fourPlayer.concat("middle-position");
const sixPlayer: Role[] = fivePlayer.concat("cut-off");

const sevenPlayer: Role[] = [
  ...sixPlayer.slice(0, -1),
  "hi-jack",
  ...sixPlayer.slice(-1),
];
const eightPlayer: Role[] = [
  ...sevenPlayer.slice(0, 5),
  "middle-position1",
  ...sevenPlayer.slice(5),
];
const ninePlayer: Role[] = [
  ...eightPlayer.slice(0, 4),
  "under-the-gun1",
  ...eightPlayer.slice(4),
];

const tenPlayer: Role[] = [
  ...ninePlayer.slice(0, 5),
  "under-the-gun2",
  ...ninePlayer.slice(5),
];

export const roleMap = new Map<Role, string>([
  ["button", "庄家"],
  ["small-blind", "小盲"],
  ["big-blind", "大盲"],
  ["middle-position", "中位"],
  ["middle-position1", "中位+1"],
  ["middle-position2", "中位+2"],
  ["under-the-gun", "枪口"],
  ["under-the-gun1", "枪口+1"],
  ["under-the-gun2", "枪口+2"],
  ["hi-jack", "高劫持"],
  ["cut-off", "关煞"],
]);
const playerRoleSetMap = new Map<number, Role[]>([
  [2, twoPlayer],
  [3, threePlayer],
  [4, fourPlayer],
  [5, fivePlayer],
  [6, sixPlayer],
  [7, sevenPlayer],
  [8, eightPlayer],
  [9, ninePlayer],
  [10, tenPlayer],
]);
export { playerRoleSetMap };
