/**
 * 正文裡的思考區塊，折進「思考過程」摺疊框，不丟。
 *
 * think／thinking 之外，thought／review／tucao／mission_statement 與大寫的 Q／WF／REALIEZ
 * 也是社群預設常見的思維鏈寫法（owner 2026-09-06：標準的思維鏈就由我們處理）。
 * Q／WF／REALIEZ 只認大寫：小寫 <q> 是 HTML 的引用元素，是正文。MMD 的做法是不分
 * 大小寫整段刪掉，連 <q> 一起吃，那是它的 bug，不照抄。
 */
const THINK_TAG_RE = /<(think(?:ing)?|thought|review|tucao|mission_statement|Q|WF|REALIEZ)(?:\s[^>]*)?>([\s\S]*?)<\/(?:\1|think(?:ing)?)\s*>/gi

function splitInlineThinkTags(content: string): { visibleContent: string; thinkingContent: string } {
  let thinkingContent = ''
  const visibleContent = content.replace(THINK_TAG_RE, (match: string, name: string, hidden: string) => {
    // Q／WF／REALIEZ 只認全大寫；<q> 是 HTML 引用元素，留在正文。
    if (/^(q|wf|realiez)$/i.test(name) && name !== name.toUpperCase()) return match
    if (hidden) {
      thinkingContent += `${thinkingContent ? '\n' : ''}${String(hidden).trim()}`
    }
    return ''
  })
  return { visibleContent, thinkingContent: thinkingContent.trim() }
}

export function splitThinkingContent(rawContent: unknown): {
  visibleContent: string
  thinkingContent: string
  hasThinking: boolean
} {
  const content = String(rawContent || '')
  const split = splitInlineThinkTags(content)
  return {
    visibleContent: split.visibleContent,
    thinkingContent: split.thinkingContent,
    hasThinking: split.thinkingContent.length > 0,
  }
}

export function hasRenderableAssistantOutput(body: unknown, thinking: unknown): boolean {
  return String(body ?? '').trim().length > 0 || String(thinking ?? '').trim().length > 0
}

export function resolvePendingThinkingCollapsed(
  talkList: Array<{ type?: number; chatFinish?: boolean; thinkingCollapsed?: boolean }> | undefined,
  fallbackCollapsed: boolean | undefined,
): boolean {
  const fallback = fallbackCollapsed !== false
  if (!Array.isArray(talkList) || talkList.length === 0) return fallback
  const last = talkList[talkList.length - 1]
  if (last && last.type === 0 && last.chatFinish !== true && last.thinkingCollapsed === false) {
    return false
  }
  return fallback
}
