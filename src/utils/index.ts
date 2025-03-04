export const getRandomInt = (min: number, max: number) => {
  if (max < min)
    throw new Error("unCaught logic error: max can not lower than min");

  return Math.floor(Math.random() * (max - min + 1)) + min;
};
