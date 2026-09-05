// 施工單：聊天失敗態可操作性（卡死鏈 C 腿收尾）· C2 desktop
//
// Port mobile 的 <chat-system-message> 卡片機制到 desktop：
// mobile/src/components/chat-system-message/chat-system-message.vue 已有
// kind→視覺（tone/color/icon）+ CTA 契約，desktop 目前完全沒有這個機制
// （只有 truncation-hint 純文字警告 + user-stop-hint，都沒有 CTA）。
//
// 這份測試鎖定 desktop 版元件跟 mobile 版同一份契約：
//   - kind → tone（failure/notice/info）分類一致，包含新加的 compact-retryable
//   - label/sub/cta 三個 prop 原樣顯示，不吃掉
//   - CTA 點擊 emit ('cta', action)，action 依 kind 對應 retry/continue
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatSystemMessage from './chat-system-message.vue'

function mountCard(props: Record<string, any>) {
  return mount(ChatSystemMessage, { props })
}

describe('ChatSystemMessage (desktop port)', () => {
  it('renders failure tone for model-error (mobile 既有 kind，先驗證 port 沒漏)', () => {
    const wrapper = mountCard({ kind: 'model-error', label: '連線失敗', sub: '', cta: '重試' })
    expect(wrapper.classes()).toContain('sys-tone-failure')
    expect(wrapper.find('.sys-kind-model-error').exists()).toBe(true)
  })

  it('renders notice tone for length-cap with continue CTA action', () => {
    const wrapper = mountCard({ kind: 'length-cap', label: '達到上限', sub: '', cta: '繼續' })
    expect(wrapper.classes()).toContain('sys-tone-notice')
    const cta = wrapper.find('.sys-cta')
    cta.trigger('click')
    expect(wrapper.emitted('cta')?.[0]).toEqual(['continue'])
  })

  it('renders credit exhaustion as the existing notice card with an exact top-up action', async () => {
    const wrapper = mountCard({
      kind: 'quota',
      label: 'Not enough credits',
      sub: '',
      cta: 'Top up credits',
      ctaAction: 'open_vip',
    })
    expect(wrapper.classes()).toContain('sys-tone-notice')
    expect(wrapper.find('.sys-kind-quota').exists()).toBe(true)
    expect(wrapper.find('.sys-quota-icon').exists()).toBe(true)
    await wrapper.find('.sys-cta').trigger('click')
    expect(wrapper.emitted('cta')?.[0]).toEqual(['open_vip'])
  })

  it('renders failure tone + retry CTA for the new compact-retryable kind', () => {
    const wrapper = mountCard({
      kind: 'compact-retryable',
      label: '記錄失敗',
      sub: '記憶整理未完成，對話已恢復，請再發送一次',
      cta: '重試',
    })
    expect(wrapper.classes()).toContain('sys-tone-failure')
    expect(wrapper.classes()).not.toContain('sys-tone-notice')
    expect(wrapper.find('.sys-kind-compact-retryable').exists()).toBe(true)
    expect(wrapper.find('.sys-label').text()).toBe('記錄失敗')
    expect(wrapper.find('.sys-sub-text').text()).toBe('記憶整理未完成，對話已恢復，請再發送一次')

    const cta = wrapper.find('.sys-cta')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('重試')
    cta.trigger('click')
    expect(wrapper.emitted('cta')?.[0]).toEqual(['retry'])
  })

  it('does not fall back to "stopped" kind meta for compact-retryable (needs its own KIND_META entry)', () => {
    const wrapper = mountCard({ kind: 'compact-retryable', label: 'x', sub: '', cta: '重試' })
    // stopped 是 notice tone，compact-retryable 必須是 failure tone，
    // 若沒有專屬 KIND_META entry 會誤 fallback 成 stopped 的樣式
    expect(wrapper.classes()).not.toContain('sys-tone-notice')
  })

  it('covers every mobile failure kind so desktop does not silently drop a category', () => {
    const failureKinds = ['model-error', 'network-error', 'server-error', 'rate-limit', 'filtered', 'compact-retryable']
    for (const kind of failureKinds) {
      const wrapper = mountCard({ kind, label: 'x', sub: '', cta: '重試' })
      expect(wrapper.classes(), `kind=${kind} should be failure tone`).toContain('sys-tone-failure')
    }
  })

  it('hides the CTA element when no cta prop is passed (e.g. compact_no_input pure text stays outside this component)', () => {
    const wrapper = mountCard({ kind: 'model-error', label: 'x', sub: '', cta: '' })
    expect(wrapper.find('.sys-cta').exists()).toBe(false)
  })

  it('emits the exact capable server action instead of deriving it from the visual kind', async () => {
    const wrapper = mountCard({
      kind: 'server-error',
      label: 'Rewrite failed',
      sub: '',
      cta: 'Retry',
      ctaAction: 'retry_rewrite',
    })

    await wrapper.find('.sys-cta').trigger('click')
    expect(wrapper.emitted('cta')?.[0]).toEqual(['retry_rewrite'])
  })

  it('renders every capable server CTA and emits each exact action', async () => {
    const wrapper = mountCard({
      kind: 'model-error',
      label: 'No final answer',
      sub: '',
      cta: '',
      ctas: [
        { label: 'Retry', action: 'retry' },
        { label: 'Switch model', action: 'switch_model' },
      ],
    })

    const actions = wrapper.findAll('.sys-cta')
    expect(actions).toHaveLength(2)
    expect(actions[0].text()).toContain('Retry')
    expect(actions[1].text()).toContain('Switch model')

    await actions[0].trigger('click')
    await actions[1].trigger('click')
    expect(wrapper.emitted('cta')).toEqual([
      ['retry'],
      ['switch_model'],
    ])
  })

  it('announces terminal cards and makes every exact CTA keyboard and screen-reader accessible', async () => {
    const wrapper = mountCard({
      kind: 'model-error',
      label: 'No final answer',
      sub: '',
      cta: '',
      ctas: [
        { label: 'Retry', action: 'retry' },
        { label: 'Switch model', action: 'switch_model' },
      ],
    })

    expect(wrapper.find('.sys-msg-card').attributes()).toMatchObject({
      role: 'alert',
      'aria-live': 'assertive',
      'aria-atomic': 'true',
    })
    const actions = wrapper.findAll('.sys-cta')
    expect(actions[0].attributes()).toMatchObject({
      role: 'button',
      tabindex: '0',
      'aria-label': 'Retry',
    })
    expect(actions[1].attributes()).toMatchObject({
      role: 'button',
      tabindex: '0',
      'aria-label': 'Switch model',
    })

    await actions[0].trigger('keydown', { key: 'Enter' })
    await actions[1].trigger('keydown', { key: ' ' })
    await actions[1].trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cta')).toEqual([
      ['retry'],
      ['switch_model'],
    ])
  })
})
