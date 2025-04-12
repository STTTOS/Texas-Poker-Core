import { TexasErrorCode } from './constant'

class TexasError extends Error {
  constructor(public code: TexasErrorCode, public message: string) {
    super(message)
    this.name = 'Texas Error'
  }
}
export default TexasError
