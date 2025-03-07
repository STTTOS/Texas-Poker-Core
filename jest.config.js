module.exports = {
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    // <rootDir>代表jest.config文件所在的根目录
    '@/(.*)$': '<rootDir>/src/$1'
  }
}
