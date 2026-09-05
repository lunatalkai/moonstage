import { describe, expect, it } from 'vitest'
import {
  hasRenderableAssistantOutput,
  resolvePendingThinkingCollapsed,
  splitThinkingContent,
} from './thinking-content'

describe('thinking-content', () => {
  it('separates raw think tags from visible chat content', () => {
    const split = splitThinkingContent('<think>reasoning\nmemory</think>正式回覆')

    expect(split.visibleContent).toBe('正式回覆')
    expect(split.thinkingContent).toBe('reasoning\nmemory')
    expect(split.hasThinking).toBe(true)
  })

  it('leaves ordinary content unchanged', () => {
    const split = splitThinkingContent('普通回覆')

    expect(split.visibleContent).toBe('普通回覆')
    expect(split.thinkingContent).toBe('')
    expect(split.hasThinking).toBe(false)
  })

  it('preserves expanded pending thinking panels during streaming replacement', () => {
    const list = [
      { type: 1, content: 'user' },
      { type: 0, chatFinish: false, thinkingCollapsed: false },
    ]

    expect(resolvePendingThinkingCollapsed(list, true)).toBe(false)
    expect(resolvePendingThinkingCollapsed([{ type: 0, chatFinish: false, thinkingCollapsed: true }], true)).toBe(true)
    expect(resolvePendingThinkingCollapsed([{ type: 0, chatFinish: true, thinkingCollapsed: false }], true)).toBe(true)
    expect(resolvePendingThinkingCollapsed([], false)).toBe(false)
  })

  it('treats either final body or thinking as renderable assistant output', () => {
    expect(hasRenderableAssistantOutput('final body', '')).toBe(true)
    expect(hasRenderableAssistantOutput('', 'visible reasoning')).toBe(true)
    expect(hasRenderableAssistantOutput(undefined, '  visible reasoning  ')).toBe(true)
  })

  it('keeps empty and legacy-missing output non-renderable', () => {
    expect(hasRenderableAssistantOutput('', '')).toBe(false)
    expect(hasRenderableAssistantOutput(' \n ', '\t')).toBe(false)
    expect(hasRenderableAssistantOutput(undefined, undefined)).toBe(false)
  })
})
