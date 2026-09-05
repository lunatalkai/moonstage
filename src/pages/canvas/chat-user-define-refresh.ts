const PENDING_USER_DEFINE_MAX_AGE_MS = 10_000

// 只投影「聊天頁自己畫得出來、且子頁改得動」的欄位。多投影一個是多一份要跟
// server 對帳的樂觀值，少投影一個則是使用者回到聊天頁那一刻看到舊值。
//
// 語音兩格是後加的：氣泡播放鈕的顯示條件直接讀 roleSpeech，不在名單裡的話，
// 在對話設定選好語音回來，鈕要等背景重讀才出現——而取消語音那條連重讀都救不
// 回（getUserDefine 對空值曾經有截斷）。
const PROJECTED_FIELDS = [
  'selectModel',
  'selectModelName',
  'thinkingDepth',
  'context',
  'autoCompactEnabled',
  'showThinkingProcess',
  'roleSpeech',
  'speechSpeed',
] as const

type ProjectedField = typeof PROJECTED_FIELDS[number]

export type PendingUserDefineRefresh = {
  ts: number
  roleId?: string
} & Partial<Record<ProjectedField, unknown>>

export function createPendingUserDefineRefresh(
  source: Record<string, unknown>,
  now = Date.now(),
): string {
  const pending: PendingUserDefineRefresh = {
    ts: now,
    roleId: String(source.roleId || ''),
  }
  for (const field of PROJECTED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      pending[field] = source[field]
    }
  }
  return JSON.stringify(pending)
}

export function parsePendingUserDefineRefresh(
  raw: string | null,
  now = Date.now(),
): PendingUserDefineRefresh | null {
  if (!raw) return null

  let pending: PendingUserDefineRefresh
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'number') {
      pending = { ts: parsed }
    } else if (parsed && typeof parsed === 'object') {
      pending = parsed as PendingUserDefineRefresh
    } else {
      return null
    }
  } catch {
    const legacyTimestamp = Number(raw)
    if (!Number.isFinite(legacyTimestamp)) return null
    pending = { ts: legacyTimestamp }
  }

  if (!Number.isFinite(pending.ts) || now - pending.ts > PENDING_USER_DEFINE_MAX_AGE_MS) {
    return null
  }
  return pending
}

export function applyPendingUserDefineRefresh(
  target: Record<string, unknown>,
  pending: PendingUserDefineRefresh | null,
  expectedRoleId: string,
): boolean {
  if (!pending || !pending.roleId || pending.roleId !== expectedRoleId) return false

  let applied = false
  for (const field of PROJECTED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(pending, field)) {
      target[field] = pending[field]
      applied = true
    }
  }
  return applied
}
