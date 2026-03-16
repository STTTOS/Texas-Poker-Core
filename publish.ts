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
function rollback(appendText: string) {
  replaceVersion((version) => updateVersion(version, 'down'))
  const readme = readFileSync('./README.md').toString()
  writeFileSync('./README.md', readme.replace(appendText, ''))
}

// 去掉前两个元素：node 和脚本名称
const args = process.argv.slice(2)

// 确保至少有一个参数
if (args.length === 0) {
  console.error('请描述此次发版的内容, 比如: pnpm run push "更新了一些内容..."')
  process.exit(1)
}
// 先构建（stdio: 'inherit' 让构建输出与错误直接显示在终端）
const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' })

build.on('error', (err) => {
  console.error('构建命令执行失败:', err.message)
  process.exit(1)
})

build.on('exit', (code) => {
  if (code !== 0) {
    console.error('构建失败, 请根据上方输出排查后重试')
    process.exit(code ?? 1)
  }

  const newVersion = replaceVersion((version) => updateVersion(version, 'up'))
  const message = args[0]
  const readme = readFileSync('./README.md').toString()
  const appendText = `\n## ${newVersion}\n${message}`
  writeFileSync('./README.md', readme + appendText)

  // stdio: 'inherit' 让 npm publish 的确认/OTP 等提示能显示并能接收用户输入
  const publish = spawn('npm', ['publish'], { stdio: 'inherit' })
  publish.on('error', (err) => {
    rollback(appendText)
    console.error('发布命令执行失败:', err.message)
    process.exit(1)
  })

  publish.on('exit', (code) => {
    if (code === 0) {
      console.log(`包成功发布，version: ${oldVersion} => ${newVersion}`)
    } else {
      rollback(appendText)
      console.error(
        '发布未成功(code=%s)。请检查: npm login、网络、或是否需在终端确认/输入 OTP',
        code
      )
      process.exit(code ?? 1)
    }
  })
})
