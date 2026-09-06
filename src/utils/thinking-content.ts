/**
 * 正文裡的思考區塊，折進「思考過程」摺疊框，不丟。
 *
 * think／thinking 之外，thought／review／tucao／mission_statement 與大寫的 Q／WF／REALIEZ
 * 也是社群預設常見的思維鏈寫法，中文的 思维链／思維鏈／思考过程／思考過程／思考／推理
 * 一樣（owner 2026-09-06：標準的思維鏈由我們處理；攤在正文玩家分不出哪段是思考）。
 * Q／WF／REALIEZ 只認大寫：小寫 <q> 是 HTML 的引用元素，是正文。MMD 的做法是不分
 * 大小寫整段刪掉，連 <q> 一起吃，那是它的 bug，不照抄。
 *
 * options.keep(name) 回 true 的標籤原樣留在正文——卡片自己有規則處理的就讓給卡片。
 */
const THINK_TAG_RE = /<(think(?:ing)?|thought|review|tucao|mission_statement|Q|WF|REALIEZ|思维链|思維鏈|思考过程|思考過程|思考|推理)(?:\s[^>]*)?>([\s\S]*?)<\/(?:\1|think(?:ing)?)\s*>/gi

export interface SplitThinkingOptions {
  /** 回 true 的標籤不折，原樣留在正文。 */
  keep?: (tagName: string) => boolean
}

function splitInlineThinkTags(content: string, options: SplitThinkingOptions = {}): { visibleContent: string; thinkingContent: string } {
  let thinkingContent = ''
  const visibleContent = content.replace(THINK_TAG_RE, (match: string, name: string, hidden: string) => {
    // Q／WF／REALIEZ 只認全大寫；<q> 是 HTML 引用元素，留在正文。
    if (/^(q|wf|realiez)$/i.test(name) && name !== name.toUpperCase()) return match
    if (options.keep && options.keep(name)) return match
    if (hidden) {
      thinkingContent += `${thinkingContent ? '\n' : ''}${String(hidden).trim()}`
    }
    return ''
  })
  return { visibleContent, thinkingContent: thinkingContent.trim() }
}

export function splitThinkingContent(rawContent: unknown, options: SplitThinkingOptions = {}): {
  visibleContent: string
  thinkingContent: string
  hasThinking: boolean
} {
  const content = String(rawContent || '')
  const split = splitInlineThinkTags(content, options)
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
