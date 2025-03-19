// 此文件用于向npm推送
import { spawn } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

import { version as oldVersion } from './package.json'

/**
 * @description 增加/降低版本号
 * @param version
 * @param type
 * @returns
 */
const updateVersion = (version: string, type: 'up' | 'down') => {
  const lastVersionNumber =
    Number(version.split('.').pop()) + (type === 'up' ? 1 : -1)

  return version
    .split('.')
    .slice(0, -1)
    .concat(lastVersionNumber.toString())
    .join('.')
}

/**
 * @description 读取package.json文件中的version, 并增加一个版本
 * @param callback
 * @returns
 */
const replaceVersion = (callback: (version: string) => string) => {
  const inputStr = readFileSync('./package.json').toString()

  let newVersion: string = oldVersion
  const replaced = inputStr.replace(
    /("version":\s*")(.*?)(")/,
    (_, key, version, end) => {
      newVersion = callback(version)
      const result = `${key}${newVersion}${end}`
      return result
    }
  )
  writeFileSync('./package.json', replaced)
  return newVersion
}

// 去掉前两个元素：node 和脚本名称
const args = process.argv.slice(2)

// 确保至少有一个参数
if (args.length === 0) {
  console.error('请描述此次发版的内容, 比如: pnpm run push "更新了一些内容..."')
  process.exit(1)
}
const newVersion = replaceVersion((version) => updateVersion(version, 'up'))
const child = spawn('npm', ['publish'], { stdio: 'ignore' })
const message = args[0]
const readme = readFileSync('./README.md').toString()
writeFileSync('./README.md', readme + `\n## ${newVersion}\n${message}`)

child.on('error', (error) => {
  replaceVersion((version) => updateVersion(version, 'down'))
  console.error(`执行错误: ${error.message}`)
})

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`包成功发布，version: ${oldVersion} => ${newVersion}`)
  } else {
    replaceVersion((version) => updateVersion(version, 'down'))
    console.error('命令执行异常')
  }
})
