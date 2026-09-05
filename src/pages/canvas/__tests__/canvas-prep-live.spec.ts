import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasMessage from '../components/canvas-message.vue'

/*
  Agent 模式等回覆時，這一輪那一列要畫整份準備軌跡（照 mobile）：
  每一步都留著、做過的壓暗、當下這步亮著。玩家唯一能判斷「有沒有在幹活」的
  依據就是這份一直在長的清單（owner 2026-09-04）。
*/
const BASE = { id: 'm9', mesid: 3, role: 'ai' as const, name: '角色', avatar: '', html: '', finished: false, loading: true, latest: true, swipes: null }

describe('等回覆時的準備軌跡', () => {
  it('有步驟時整份列出來，做過的壓暗、最後一步亮著，指示器不重複最後一步', () => {
    const el = mount(CanvasMessage, {
      props: { message: { ...BASE, loadingLabel: '', prepSteps: ['回想先前的劇情', '瀏覽這個故事的設定', '這個故事的設定中沒有相關的內容'] } },
    }).element as HTMLElement
    const lines = el.querySelectorAll('.lt-prep-live .lt-prep-live-line')
    expect(lines.length).toBe(3)
    expect(lines[0].classList.contains('is-past')).toBe(true)
    expect(lines[1].classList.contains('is-past')).toBe(true)
    expect(lines[2].classList.contains('is-past')).toBe(false)
    expect(lines[2].textContent).toContain('這個故事的設定中沒有相關的內容')
    expect(el.querySelector('.chat-typing-indicator')).not.toBeNull()
    expect(el.querySelector('.lt-bubble-body')).toBeNull()
  })

  it('沒有步驟（一般模式）時只有指示器，標籤照舊', () => {
    const el = mount(CanvasMessage, {
      props: { message: { ...BASE, loadingLabel: '正在回覆', prepSteps: null } },
    }).element as HTMLElement
    expect(el.querySelector('.lt-prep-live')).toBeNull()
    expect(el.querySelector('.chat-typing-indicator')?.textContent).toContain('正在回覆')
  })

  it('完成之後軌跡進可展開的準備過程面板，不消失', () => {
    const el = mount(CanvasMessage, {
      props: { message: { ...BASE, loading: false, finished: true, html: '<p>正文</p>', prepTrail: ['回想先前的劇情', '瀏覽角色目前的狀態'] } },
    }).element as HTMLElement
    expect(el.querySelector('.lt-prep-live')).toBeNull()
    const details = el.querySelector('details.lt-prep-trail')
    expect(details).not.toBeNull()
    expect(details!.querySelectorAll('.mes_reasoning > div').length).toBe(2)
  })
})
