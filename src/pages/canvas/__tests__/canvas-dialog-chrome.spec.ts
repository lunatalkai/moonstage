/**
 * 彈層的標準外框：左上標題、右上一顆關閉鍵、底部一列動作鍵。
 *
 * 在這之前每一片各畫各的：用戶人設的取消／確定在標題列兩側、長期指令的「添加」在
 * 右上、永久記憶跟殼各一顆 ×（owner 2026-09-06 截圖）。這裡釘住三件事：
 * 殼上那顆 × 是唯一的關閉鍵、動作鍵在底部、一次性確認有標題。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CanvasPopup from '../components/canvas-popup.vue'
import CanvasPersona from '../components/canvas-persona.vue'
import CanvasDirectives from '../components/canvas-directives.vue'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
const chrome = css.slice(css.indexOf('/* ── 彈層的標準外框'))

describe('彈層的標準外框', () => {
  it('殼只在 heading 時畫標題；一次性確認靠它', () => {
    const plain = mount(CanvasPopup, { props: { open: true, title: '新的對話' } })
    expect(plain.find('.lt-dialog-title').exists()).toBe(false)
    const headed = mount(CanvasPopup, { props: { open: true, title: '新的對話', heading: true } })
    expect(headed.find('.lt-dialog-title').text()).toBe('新的對話')
    // 關閉鍵是圖示，不是一個「×」字
    expect(headed.find('.u-popup__content__close svg').exists()).toBe(true)
  })

  it('各片自己的 × 全部收起，殼上那顆不再因為裡面有 × 而藏起來', () => {
    expect(chrome).toMatch(/\.mp-close,\s*\.np-close,\s*\.mem-close,\s*\.cb-close,\s*\.custom-instruction-scope \.close-btn \{\s*display: none;/)
    expect(css).not.toMatch(/:has\([^)]*\) \.u-popup__content__close/)
  })

  it('用戶人設的取消／保存在底部的 .bottom，標題列只剩標題', () => {
    const w = mount(CanvasPersona, {
      props: {
        labels: {
          title: '用戶人設', cancel: '取消', save: '確定', nameLabel: '', namePlaceholder: '', sexLabel: '',
          defineLabel: '', definePlaceholder: '', sandboxLabel: '', sandboxHint: '', advanced: '',
          jailbreakLabel: '', jailbreakHint: '', jailbreakReset: '',
        },
        sexOptions: [], sandboxOptions: [],
      },
    })
    expect(w.find('.header-scope .header-box .page-title').exists()).toBe(true)
    expect(w.find('.header-scope .complete-btn').exists()).toBe(false)
    expect(w.find('.bottom .icon-back').exists()).toBe(true)
    expect(w.find('.bottom .complete-btn').exists()).toBe(true)
  })

  it('長期指令的「添加」跟輸入區同一區、在底部', () => {
    const w = mount(CanvasDirectives, {
      props: {
        labels: {
          title: '長期指令', close: '關閉', add: '添加', edit: '', delete: '', deleteConfirmShort: '', save: '', cancel: '',
          empty: '', loading: '', loadFailed: '', retry: '', addPlaceholder: '',
        },
      },
    })
    expect(w.find('.header-scope .btn-scope').exists()).toBe(false)
    expect(w.find('.edit-scope .btn-scope .add-btn').text()).toBe('添加')
  })

  it('這一節放在 layer 的最後：同特異度靠順序蓋過各片自己的規則', () => {
    const memoryAt = css.indexOf('/* ── AI 筆記／永久記憶')
    const mobileAt = css.indexOf('/* ── 手機')
    const chromeAt = css.indexOf('/* ── 彈層的標準外框')
    expect(chromeAt).toBeGreaterThan(memoryAt)
    expect(chromeAt).toBeGreaterThan(mobileAt)
  })
})
