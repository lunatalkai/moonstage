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

  it('折進思考框的還有 thought／review／tucao／mission_statement 與大寫的 Q／WF／REALIEZ（owner 2026-09-06：這些是標準的思維鏈寫法，折起來不丟）', () => {
    const split = splitThinkingContent('<thought>先想</thought>正文<Q>問自己</Q><review>回顧</review><WF>w</WF><REALIEZ>r</REALIEZ><tucao>吐槽</tucao><mission_statement>m</mission_statement>')
    expect(split.visibleContent).toBe('正文')
    expect(split.thinkingContent).toBe('先想\n問自己\n回顧\nw\nr\n吐槽\nm')
  })

  it('HTML 的 <q> 引用元素不是思考：小寫 q 原樣留在正文（MMD 不分大小寫會把它吃掉，那是它的 bug）', () => {
    const split = splitThinkingContent('她說<q>引用</q>。<Thought>大小寫混的也算</Thought>')
    expect(split.visibleContent).toBe('她說<q>引用</q>。')
    expect(split.thinkingContent).toBe('大小寫混的也算')
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
