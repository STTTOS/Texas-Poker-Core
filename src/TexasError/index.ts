import {
  type TexasErrorCode,
  type TexasErrorPayload,
  formatTexasErrorMessage
} from './codes'

class TexasError extends Error {
  code: TexasErrorCode
  payload?: TexasErrorPayload

  constructor(code: TexasErrorCode, payload?: TexasErrorPayload) {
    super(formatTexasErrorMessage(code, payload))
    this.code = code
    this.payload = payload
    this.name = 'TexasError'
  }
}

export default TexasError
export type { TexasErrorCode, TexasErrorPayload }
export {
  TexasCoreErrorCode,
  formatTexasErrorMessage,
  getTexasErrorSeverity,
  isFatalTexasErrorCode
} from './codes'
export type { TexasErrorSeverity } from './codes'
export { texasErrorCategory, texasErrorMap } from './constant'
export type { TexasErrorCodeLegacy } from './constant'
