module.export = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current'
          // 支持最新的浏览器
          // browsers: '> 0.25%'
        },
        // 根据使用的特性引入 polyfills
        useBuiltIns: 'usage',
        // 指定 core-js 版本
        corejs: { version: 3, proposals: true }
      }
    ],
    '@babel/preset-typescript'
  ]
}
