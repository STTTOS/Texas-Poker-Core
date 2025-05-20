import { TexasErrorCode } from './constant'

class TexasError extends Error {
  code: TexasErrorCode
  constructor(code: TexasErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'Texas Error'
  }
}
export default TexasError
