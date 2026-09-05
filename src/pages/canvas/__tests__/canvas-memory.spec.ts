/**
 * AI 筆記／永久記憶彈窗——mobile 那一頁搬到畫布之後，玩家看得到的東西還在不在。
 *
 * 元件不打 API：資料由頁面餵進來，文案也由頁面翻好餵進來，這裡只問畫出來的東西：
 * 列表、來源標籤、相對時間、長內容收行與展開、刪除事件、空／載入／失敗三態，
 * 以及這一片吃不吃得到作者的美化（樣式不寫死色碼、不寫 margin）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import CanvasMemory from '../components/canvas-memory.vue'
import {
  applyMemoryDeleteResponse,
  isAgentMemoryAtom,
  isLongMemoryAtom,
  memoryRelativeTime,
  normalizeMemoryAtoms,
  sortMemoryAtoms,
} from '../canvas-memory'

const LABELS = {
  title: 'AI 記事本',
  subtitle: '角色自己記的，無法關閉。',
  close: '關閉',
  loading: '載入中',
  loadFailed: '讀不到',
  retry: '重試',
  empty: '角色還沒記下任何事。',
  delete: '刪除',
  expand: '展開',
  collapse: '收起',
  sourceAgent: '角色記的',
  sourceAuto: '自動整理',
  time: { now: '剛剛', min: '分鐘前', hour: '小時前', day: '天前', month: '月前' },
}

const LONG = '這是一條很長的進度總結，'.repeat(12)

const ATOMS = [
  { atomId: 'a1', atomValue: '玩家叫小明', importance: 0.5, createTime: new Date(Date.now() - 3 * 60000).toISOString(), sourceOperation: 'agent_notebook' },
  { atomId: 'a2', atomValue: LONG, importance: 0.9, createTime: new Date(Date.now() - 2 * 3600000).toISOString() },
]

function memory(extra: Record<string, unknown> = {}) {
  return mount(CanvasMemory, { props: { atoms: ATOMS, labels: LABELS, ...extra } })
}

describe('記憶：純函式', () => {
  it('依重要度由高到低排，不動原陣列', () => {
    const sorted = sortMemoryAtoms(ATOMS)
    expect(sorted.map((a) => a.atomId)).toEqual(['a2', 'a1'])
    expect(ATOMS[0].atomId).toBe('a1')
  })

  it('伺服器回的是裸陣列或 {atoms:[...]} 都吃得下；壞資料回空', () => {
    expect(normalizeMemoryAtoms(ATOMS).length).toBe(2)
    expect(normalizeMemoryAtoms({ atoms: ATOMS }).length).toBe(2)
    expect(normalizeMemoryAtoms(null)).toEqual([])
    expect(normalizeMemoryAtoms('x')).toEqual([])
    // 沒有 atomId 的列畫不出 key，也刪不掉，直接丟掉
    expect(normalizeMemoryAtoms([{ atomValue: 'x' }, ATOMS[0]]).length).toBe(1)
  })

  it('來源由伺服器宣告；沒標的舊資料一律當自動整理', () => {
    expect(isAgentMemoryAtom(ATOMS[0])).toBe(true)
    expect(isAgentMemoryAtom(ATOMS[1])).toBe(false)
    expect(isAgentMemoryAtom(null)).toBe(false)
  })

  it('超過 90 字才算長', () => {
    expect(isLongMemoryAtom(ATOMS[0])).toBe(false)
    expect(isLongMemoryAtom(ATOMS[1])).toBe(true)
    expect(isLongMemoryAtom({ atomId: 'x', atomValue: 'a'.repeat(90) })).toBe(false)
    expect(isLongMemoryAtom({ atomId: 'x', atomValue: 'a'.repeat(91) })).toBe(true)
  })

  it('相對時間跟 mobile 同一套口徑', () => {
    const now = Date.now()
    const t = LABELS.time
    expect(memoryRelativeTime('', t, now)).toBe('')
    expect(memoryRelativeTime(new Date(now - 10000).toISOString(), t, now)).toBe('剛剛')
    expect(memoryRelativeTime(new Date(now - 5 * 60000).toISOString(), t, now)).toBe('5分鐘前')
    expect(memoryRelativeTime(new Date(now - 3 * 3600000).toISOString(), t, now)).toBe('3小時前')
    expect(memoryRelativeTime(new Date(now - 2 * 86400000).toISOString(), t, now)).toBe('2天前')
    expect(memoryRelativeTime(new Date(now - 65 * 86400000).toISOString(), t, now)).toBe('2月前')
    // 伺服器時間跑在前面：不顯示負數
    expect(memoryRelativeTime(new Date(now + 60000).toISOString(), t, now)).toBe('剛剛')
  })

  it('刪除回應：2xx 且 ok=true 才從清單拿掉，否則丟錯', () => {
    expect(applyMemoryDeleteResponse(ATOMS, 'a1', { statusCode: 200, data: { ok: true } }).map((a) => a.atomId)).toEqual(['a2'])
    expect(() => applyMemoryDeleteResponse(ATOMS, 'a1', { statusCode: 200, data: {} })).toThrow()
    expect(() => applyMemoryDeleteResponse(ATOMS, 'a1', { statusCode: 404, data: { ok: true } })).toThrow()
  })
})

describe('記憶：畫出來的東西', () => {
  it('每一條有來源標籤、相對時間與內容；重要度高的在前', () => {
    const wrapper = memory()
    const el = wrapper.element as HTMLElement
    const cards = el.querySelectorAll('.mem-card')
    expect(cards.length).toBe(2)
    expect(cards[0].getAttribute('data-atom-id')).toBe('a2')
    expect(cards[1].querySelector('.mem-source')!.textContent).toContain('角色記的')
    expect(cards[1].querySelector('.mem-source')!.classList.contains('is-agent')).toBe(true)
    expect(cards[0].querySelector('.mem-source')!.classList.contains('is-auto')).toBe(true)
    expect(cards[1].querySelector('.mem-time')!.textContent).toBe('3分鐘前')
    expect(cards[1].querySelector('.mem-value')!.textContent).toBe('玩家叫小明')
    wrapper.unmount()
  })

  it('長內容預設收行、有「展開」；短內容沒有展開鍵', () => {
    const wrapper = memory()
    const el = wrapper.element as HTMLElement
    const long = el.querySelector('.mem-card[data-atom-id="a2"]')!
    const short = el.querySelector('.mem-card[data-atom-id="a1"]')!
    expect(long.querySelector('.mem-value')!.classList.contains('is-clamped')).toBe(true)
    expect(long.querySelector('.mem-expand')).toBeTruthy()
    expect(long.querySelector('.mem-expand')!.textContent).toContain('展開')
    expect(short.querySelector('.mem-expand')).toBeNull()
    wrapper.unmount()
  })

  it('展開是頁面的狀態：按了發 toggle-expand，展開後不再收行、鍵變「收起」', async () => {
    const wrapper = memory()
    const el = wrapper.element as HTMLElement
    el.querySelector<HTMLElement>('.mem-card[data-atom-id="a2"] .mem-expand')!.click()
    expect(wrapper.emitted('toggle-expand')?.[0]).toEqual(['a2'])
    await wrapper.setProps({ expandedIds: { a2: true } })
    const long = (wrapper.element as HTMLElement).querySelector('.mem-card[data-atom-id="a2"]')!
    expect(long.querySelector('.mem-value')!.classList.contains('is-clamped')).toBe(false)
    expect(long.querySelector('.mem-expand')!.textContent).toContain('收起')
    wrapper.unmount()
  })

  it('刪除鍵發 delete 帶 atomId；確認由頁面用畫布自己的確認框問', () => {
    const wrapper = memory()
    const el = wrapper.element as HTMLElement
    el.querySelector<HTMLElement>('.mem-card[data-atom-id="a1"] .mem-delete')!.click()
    expect(wrapper.emitted('delete')?.[0]).toEqual(['a1'])
    wrapper.unmount()
  })

  it('正在刪的那一條鍵不能再按', () => {
    const wrapper = memory({ deletingId: 'a1' })
    const el = wrapper.element as HTMLElement
    const btn = el.querySelector<HTMLElement>('.mem-card[data-atom-id="a1"] .mem-delete')!
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    btn.click()
    expect(wrapper.emitted('delete')).toBeUndefined()
    wrapper.unmount()
  })

  it('載入中：骨架，不畫空態', () => {
    const wrapper = memory({ atoms: [], loading: true })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.mem-loading')).toBeTruthy()
    expect(el.querySelector('.mem-empty')).toBeNull()
    wrapper.unmount()
  })

  it('空：一句話講為什麼是空的', () => {
    const wrapper = memory({ atoms: [] })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.mem-empty')!.textContent).toContain('角色還沒記下任何事')
    expect(el.querySelector('.mem-loading')).toBeNull()
    wrapper.unmount()
  })

  it('失敗：講清楚＋重試鍵發 retry', () => {
    const wrapper = memory({ atoms: [], loadFailed: true })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.mem-error')!.textContent).toContain('讀不到')
    el.querySelector<HTMLElement>('.mem-retry')!.click()
    expect(wrapper.emitted('retry')?.length).toBe(1)
    wrapper.unmount()
  })

  it('標題與副標由頁面決定（Agent 開著是 AI 記事本，沒開是永久記憶）；關閉鍵發 close', () => {
    const wrapper = memory()
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.mem-title')!.textContent).toBe('AI 記事本')
    expect(el.querySelector('.mem-subtitle')!.textContent).toBe('角色自己記的，無法關閉。')
    el.querySelector<HTMLElement>('.mem-close')!.click()
    expect(wrapper.emitted('close')?.length).toBe(1)
    wrapper.unmount()
  })
})

describe('記憶：吃得到作者的美化', () => {
  const source = readFileSync(resolve(__dirname, '../components/canvas-memory.vue'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

  it('元件沒有自己的 <style>，樣式全在 canvas.css 的 layer 裡', () => {
    expect(source).not.toContain('<style')
    const start = css.indexOf('.memory-scope')
    expect(start).toBeGreaterThan(css.indexOf('@layer lt-base'))
  })

  it('只用瀏覽器原生標籤', () => {
    const template = source.slice(0, source.indexOf('<script'))
    for (const tag of ['view', 'text', 'image', 'textarea', 'input', 'scroll-view', 'button', 'navigator']) {
      expect(template).not.toMatch(new RegExp(`<${tag}[\\s/>]`))
    }
  })

  it('這一段不寫 margin、不寫 !important、不寫任何色碼、不用深色預設變數——底色與邊框都從文字色調出來', () => {
    const start = css.indexOf('/* ── AI 筆記／永久記憶')
    const end = css.indexOf('/* ── 手機')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const block = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(block).not.toMatch(/(^|[^-])margin(-\w+)?\s*:/)
    expect(block).not.toMatch(/!\s*important/)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/rgba?\(/)
    expect(block).not.toContain('--lt-canvas-sheet-bg')
    expect(block).not.toContain('--lt-canvas-accent')
    // 字色一律繼承殼的文字色
    expect(block).toMatch(/\.memory-scope \{[^}]*color: inherit/)
    // 底色與邊框從 currentColor 調
    expect(block).toMatch(/color-mix\(in srgb, currentColor/)
  })

  it('觸屏上刪除鍵視覺降權（用 pointer: coarse 判斷，不用寬度）', () => {
    const start = css.indexOf('/* ── AI 筆記／永久記憶')
    const end = css.indexOf('/* ── 手機')
    const block = css.slice(start, end)
    expect(block).toMatch(/@media \(pointer: coarse\)[\s\S]*\.mem-delete/)
  })
})
