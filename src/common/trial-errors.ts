/**
 * 把試玩卡端點的錯誤回應翻成「作者看得懂的幾行」：哪一段、哪一條、多大、上限多大。
 * 這裡只產出 i18n key 與參數，不碰 t()，讓它可以單獨測。
 */
import type { AuthorDraft } from './author-draft'

export interface TrialProblemLine {
  key: string
  params?: Record<string, string | number>
}

export interface TrialProblem {
  titleKey: string
  lines: TrialProblemLine[]
  /** 伺服器那一句原文；有對應文案時當補充，沒有時就是主要說明 */
  serverMessage: string
  /** 修正後重送就好（限額、不支援）；否則是暫時性錯誤 */
  fixable: boolean
}

const kb = (n: number) => Math.round((n / 1024) * 10) / 10
const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10

function ruleName(draft: AuthorDraft | null, index: number, name: string): string {
  if (name) return name
  const rule = draft && draft.rules[index]
  return (rule && rule.name) || `#${index + 1}`
}

function limitLine(detail: any, draft: AuthorDraft | null): TrialProblemLine | null {
  const max = Number(detail.max) || 0
  const actual = Number(detail.actual) || 0
  const index = typeof detail.index === 'number' ? detail.index : -1
  switch (detail.reason) {
    case 'ruleReplace':
      return { key: 'openChat.trial.limitRule', params: { name: ruleName(draft, index, detail.name), actual: kb(actual), max: kb(max) } }
    case 'rulesTotal':
      return { key: 'openChat.trial.limitRulesTotal', params: { actual: kb(actual), max: kb(max) } }
    case 'entries':
      return { key: 'openChat.trial.limitEntries', params: { actual, max } }
    case 'entryContent':
      return { key: 'openChat.trial.limitEntry', params: { name: detail.name || `#${index + 1}`, actual, max } }
    case 'welcome':
      return { key: 'openChat.trial.limitWelcome', params: { actual, max } }
    case 'roleDesc':
      return { key: 'openChat.trial.limitIntro', params: { actual, max } }
    case 'roleDetailDesc':
      return { key: 'openChat.trial.limitDefinition', params: { actual, max } }
    case 'name':
      return { key: 'openChat.trial.limitName', params: { actual, max } }
    case 'body':
      return { key: 'openChat.trial.limitBody', params: { actual: mb(actual), max: mb(max) } }
  }
  return null
}

function unsupportedLine(detail: any, draft: AuthorDraft | null): TrialProblemLine | null {
  const index = typeof detail.index === 'number' ? detail.index : -1
  if (detail.section === 'authorAsset' && detail.field === 'mountLayer') {
    return { key: 'openChat.trial.unsupportedMountLayer', params: { value: String(detail.value || '') } }
  }
  if (detail.section === 'authorAsset' && detail.field === 'find') {
    return { key: 'openChat.trial.unsupportedRuleFind', params: { name: ruleName(draft, index, detail.name) } }
  }
  if (detail.section === 'worldbook' && detail.field === 'content') {
    return { key: 'openChat.trial.unsupportedEntryContent', params: { name: detail.name || `#${index + 1}` } }
  }
  return null
}

/**
 * status 與回應 body 進來，出去的是要顯示的幾行。認得的錯誤有專屬文案，
 * 認不得的就把伺服器那句原文當主要說明——總比「失敗」好。
 */
export function describeTrialFailure(status: number, data: any, draft: AuthorDraft | null): TrialProblem {
  const body = data && typeof data === 'object' ? data : {}
  const detail = body.detail && typeof body.detail === 'object' ? body.detail : {}
  const serverMessage = typeof body.message === 'string' ? body.message : (typeof body.error === 'string' ? body.error : '')
  const lines: TrialProblemLine[] = []
  let fixable = false

  if (status === 413 || body.error === 'trial_payload_too_large') {
    fixable = true
    const line = limitLine(detail, draft)
    lines.push(line || { key: 'openChat.trial.tooLarge' })
  } else if (body.error === 'trial_unsupported') {
    fixable = true
    const line = unsupportedLine(detail, draft)
    lines.push(line || { key: 'openChat.trial.unsupportedGeneric', params: { message: serverMessage || String(detail.reason || '') } })
  } else if (status === 503 || body.error === 'worldbook_unavailable') {
    lines.push({ key: 'openChat.trial.unavailable' })
  } else if (status === 400) {
    fixable = true
    lines.push({ key: 'openChat.trial.unsupportedGeneric', params: { message: serverMessage } })
  } else {
    lines.push({ key: 'openChat.trial.failed' })
  }
  return { titleKey: 'openChat.trial.problemTitle', lines, serverMessage, fixable }
}
