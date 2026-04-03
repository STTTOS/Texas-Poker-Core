/** 用于与业务层 WS 节奏对齐的 pacing（在移交控制权 / 开表前等待） */
export const sleep = (ms: number) =>
  ms <= 0
    ? Promise.resolve()
    : new Promise<void>((resolve) => setTimeout(resolve, ms))

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
  let result: boolean = true

  map.forEach((value, key) => {
    result &&= callback(value, key)
  })
  return result
}
