// 邊界 7（模型思考能力三檔聲明制）· adaptive 模型的「顯示思考過程」顯示層開關。
//
// 純顯示層偏好：不影響生成與計費（不進 chat-transport-ownership.ts 的
// CHAT_PAYLOAD_KEYS），本地裝置持久化即可，不需要 server 欄位。對照
// mobile/src/utils/thinking-display-pref.js 的同一份合約。預設 = 顯示（true）。

import { useStageHost } from '@/host/stage-host'

const STORAGE_KEY_PREFIX = 'lunatalkShowThinkingProcess_'

function storageKey(roleId: string): string {
  return STORAGE_KEY_PREFIX + roleId
}

export function getShowThinkingProcess(roleId?: string | null): boolean {
  if (!roleId) return true
  try {
    const raw = useStageHost().storage.get(storageKey(roleId))
    if (raw === '' || raw === undefined || raw === null) return true
    return raw !== 'false' && raw !== '0'
  } catch (e) {
    return true
  }
}

export function setShowThinkingProcess(roleId: string | null | undefined, value: boolean): void {
  if (!roleId) return
  try {
    useStageHost().storage.set(storageKey(roleId), String(value !== false))
  } catch (e) {
    console.warn('[thinking-display-pref] setShowThinkingProcess failed', e)
  }
}
