function splitInlineThinkTags(content: string): { visibleContent: string; thinkingContent: string } {
  let thinkingContent = ''
  const visibleContent = content.replace(/<think(?:ing)?[^>]*>([\s\S]*?)<\/think(?:ing)?>/gi, (_, hidden) => {
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
