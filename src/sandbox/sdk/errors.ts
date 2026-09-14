/**
 * sdk 的錯誤碼。作者的程式碼用 `err.code` 分支，所以名字逐字固定。
 */
export const SDK_ERROR_CODES = [
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'INVALID_ARGS',
  'HOST_DENIED',
  'NETWORK',
  'NOT_SUPPORTED',
  'BUSY',
  'UNKNOWN_CAPABILITY',
] as const

export type SdkErrorCode = (typeof SDK_ERROR_CODES)[number]

export class SdkError extends Error {
  readonly code: SdkErrorCode
  constructor(code: SdkErrorCode, message?: string) {
    super(message || code)
    this.name = 'SdkError'
    this.code = code
  }
}

export function isSdkError(e: unknown): e is SdkError {
  return e instanceof SdkError || (!!e && typeof e === 'object' && (e as { name?: string }).name === 'SdkError' && typeof (e as { code?: unknown }).code === 'string')
}

/** 宿主回的錯誤形狀 → SdkError。宿主給的碼不在名單裡就當 NETWORK（請求出去了但沒成）。 */
export function sdkErrorFromHost(err: { code?: string; message?: string } | undefined): SdkError {
  const code = err && (SDK_ERROR_CODES as readonly string[]).includes(String(err.code)) ? (err!.code as SdkErrorCode) : 'NETWORK'
  return new SdkError(code, err && err.message)
}
