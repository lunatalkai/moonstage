import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import ChatTypingIndicator from './chat-typing-indicator.vue'

describe('ChatTypingIndicator', () => {
  it('renders a compact, accessible three-dot reply status', () => {
    const wrapper = mount(ChatTypingIndicator, {
      props: { label: 'Replying' },
    })

    expect(wrapper.get('.chat-typing-indicator').attributes()).toMatchObject({
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      'aria-label': 'Replying',
    })
    expect(wrapper.findAll('.typing-dot')).toHaveLength(3)
    expect(wrapper.get('.typing-label').text()).toBe('Replying')
    expect(wrapper.html()).not.toContain('fui-load-ani')
  })

  it('keeps the typing placeholder free of assistant identity and message actions', () => {
    const chatSource = fs.readFileSync(
      path.resolve(__dirname, '../../pages/canvas/canvas.vue'),
      'utf8',
    )

    const message = fs.readFileSync(
      path.resolve(__dirname, '../../pages/canvas/components/canvas-message.vue'),
      'utf8',
    )
    const css = fs.readFileSync(
      path.resolve(__dirname, '../../pages/canvas/canvas.css'),
      'utf8',
    )
    // 那顆氣泡還不是一則訊息：不掛名字、不掛動作
    expect(message).toContain("'is-loading': message.loading")
    expect(css).toMatch(/\.mes\.is-loading \.ch_name,\s*\n\s*\.mes\.is-loading \.select-box \{\s*\n\s*display: none;/)
    expect(chatSource).toContain('loading: !!item.chatLoading')
    // 等回覆的那一列點不出選單：還沒說出口的話沒有可以做的事。
    expect(chatSource).toContain('if (!item || item.chatLoading) return')
    expect(message).toContain('v-if="message.loading"')
  })
})
