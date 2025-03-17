module.exports = {
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    // <rootDir>代表jest.config文件所在的根目录
    '@/(.*)$': '<rootDir>/src/$1'
  }
}
