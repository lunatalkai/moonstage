const MANUAL_EDIT_CLAIM_KEY = 'lunatalk:chat:manual-edit:last-request'
const fallbackClaims = new Set()

export function createManualEditRequestId(
  now = () => Date.now(),
  random = () => Math.random(),
) {
  return `manual-edit-${now()}-${random().toString(36).slice(2, 10)}`
}

export function claimManualEditRequest(payload, storage) {
  const requestId = String(payload?.requestId || '').trim()
  if (!requestId) return true

  let claimStorage = storage
  if (!claimStorage) {
    try {
      claimStorage = globalThis.sessionStorage
    } catch (_) {
      claimStorage = null
    }
  }

  if (claimStorage?.getItem && claimStorage?.setItem) {
    try {
      if (claimStorage.getItem(MANUAL_EDIT_CLAIM_KEY) === requestId) return false
      claimStorage.setItem(MANUAL_EDIT_CLAIM_KEY, requestId)
      return true
    } catch (_) {
      // Storage can be unavailable in privacy modes; use the in-memory guard.
    }
  }

  if (fallbackClaims.has(requestId)) return false
  fallbackClaims.add(requestId)
  if (fallbackClaims.size > 64) {
    fallbackClaims.delete(fallbackClaims.values().next().value)
  }
  return true
}
