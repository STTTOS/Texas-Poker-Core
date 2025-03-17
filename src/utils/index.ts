export const getRandomInt = (min: number, max: number) => {
  if (max < min)
    throw new Error('unCaught logic error: max can not lower than min')

  return Math.floor(Math.random() * (max - min + 1)) + min
}

export const sum = (a: number, b: number) => a + b

export const filterMap = <T, K>(
  callback: (value: K, key: T) => boolean,
  map: Map<T, K>
) => {
  const result: Map<T, K> = new Map()

  map.forEach((value, key) => {
    if (callback(value, key)) {
      result.set(key, value)
    }
  })
  return result
}

export const everyMap = <T, K>(
  callback: (value: K, key: T) => boolean,
  map: Map<T, K>
) => {
  let result: boolean | undefined = undefined

  map.forEach((value, key) => {
    if (result === undefined) {
      result = callback(value, key)
    } else {
      result &&= callback(value, key)
    }
  })
  return result
}
