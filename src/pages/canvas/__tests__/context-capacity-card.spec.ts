import fs from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatSystemMessage from '../../../components/chat-system-message/chat-system-message.vue'
import { resolveChatErrorPresentation } from '../../../utils/chat-error-message'
import zh from '../../../locale/zh-Hant.json'

// Exercise the actual inline presentation functions, not a parallel mapping.
const source = fs.readFileSync('src/pages/canvas/canvas.vue', 'utf8')
const t = (key: string) => (zh as Record<string, string>)[key] || key
function renderValue(name: string, reason: string) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\nfunction ', start + 1)
  return new Function('t', `${source.slice(start, end)}; return ${name};`)(t)(reason)
}

describe('capacity rejection card', () => {
  it('shows capacity guidance instead of a network failure and offers no blind retry', () => {
    const reason = resolveChatErrorPresentation('context_capacity_exceeded', t).finishReason
    const card = mount(ChatSystemMessage, { props: {
      kind: renderValue('getSystemMsgKind', reason),
      label: renderValue('getSystemMsgLabel', reason),
      sub: renderValue('getSystemMsgSub', reason),
      cta: '',
    } })
    expect(card.text()).toContain('容量')
    expect(card.text()).toContain('縮短這次訊息')
    expect(card.text()).toContain('既有對話已保留')
    expect(card.text()).not.toContain('連線失敗')
    expect(card.find('.sys-cta').exists()).toBe(false)
  })
})
