/**
 * 「這則回覆的組成」彈窗——mobile 那份搬到畫布之後，玩家看得到的東西還在不在。
 *
 * 元件不打 API：資料由頁面整理好餵進來，所以這裡直接餵伺服器回的那種 JSON，
 * 從正規化一路驗到畫出來的列。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import CanvasContextBreakdown from '../components/canvas-context-breakdown.vue'
import {
  BREAKDOWN_META,
  buildPromptDonutSegments,
  createPromptDiagnosticsRequestGate,
  normalizeServerReport,
  promptBreakdownItemSelectable,
  resolvePromptBreakdownActiveItem,
} from '../canvas-context-breakdown'

const ITEM_LABELS: Record<string, string> = {
  system: '系統與策略',
  roleCard: '角色卡',
  mod: 'MOD',
  notepad: '手帳',
  directive: '長期指令',
  userProfile: '使用者設定',
  summary: '劇情總結',
  history: '歷史對話',
  worldbook: '世界書召回',
  memory: '記憶錨點',
  currentInput: '目前輸入',
}

const LABELS = {
  title: '這則回覆的組成',
  subtitle: '依最近一次完成的回覆估算',
  close: '關閉',
  retry: '重試',
  loadFailed: '讀不到',
  unsupportedModel: '目前的模型不支援',
  notReady: '完成一輪回覆後可查看',
  totalTokens: '估算 Token',
  totalChars: '字元',
  tokenUnit: 'Tokens',
  pointUnit: '點',
  unavailable: '尚無資料',
  billingTotal: '本輪消耗',
  inputPoints: '輸入',
  cacheReadPoints: '快取讀取',
  outputPoints: '輸出',
  cacheHitRateFull: '快取命中率',
  localEstimateNote: '本機估算，實際用量可能不同。',
  expandModDetails: '展開各 MOD 用量',
  collapseModDetails: '收起各 MOD 用量',
  modDetailsUnavailable: 'MOD 明細暫時無法顯示',
  modDetailsLegacy: '下一次回覆後可看 MOD 明細',
  items: ITEM_LABELS,
  sources: (n: number) => `${n} 項來源`,
  modsUsed: (n: number) => `本輪使用 ${n} 個 MOD`,
}

/** 伺服器 breakdownVersion=2 的回覆長這樣（連 model 這種內部欄位一起帶著，看它會不會漏出來）。 */
function serverReport(overrides: Record<string, unknown> = {}) {
  const usage = (chars: number, tokens: number) => ({ charCount: chars, estimatedTokens: tokens })
  return {
    schemaVersion: 2,
    supported: true,
    status: 'ok',
    conversationId: 'conv-1',
    roleId: 'role-1',
    model: 'secret-model-name',
    turnIndex: 7,
    items: [
      { key: 'system', labelKey: 'promptBreakdown.system', color: '#60A5FA', available: true, sourceCount: 3, charCount: 1200, estimatedTokens: 300, percent: 30 },
      { key: 'roleCard', labelKey: 'promptBreakdown.roleCard', color: '#F5C542', available: true, sourceCount: 1, charCount: 800, estimatedTokens: 200, percent: 20 },
      {
        key: 'mod', labelKey: 'promptBreakdown.mod', color: '#465CFF', available: true, sourceCount: 2, charCount: 400, estimatedTokens: 100, percent: 10,
        detailsAvailable: true, totalDetailCount: 2,
        positions: { mainPrompt: usage(300, 75), prefixRules: usage(50, 12), suffixRules: usage(50, 13) },
        runtimeSupport: usage(0, 0), sharedOverhead: usage(0, 0),
        details: [
          {
            modId: 'mod-a', enabledVersion: '1', name: '甲', nameEn: 'Alpha', nameJa: '', nameKo: '',
            charCount: 250, estimatedTokens: 60, percent: 60,
            positions: { mainPrompt: usage(200, 50), prefixRules: usage(25, 5), suffixRules: usage(25, 5) },
            runtimeSupport: usage(0, 0), sharedOverhead: usage(0, 0),
          },
          {
            modId: 'mod-b', enabledVersion: '2', name: '乙', nameEn: 'Beta', nameJa: '', nameKo: '',
            charCount: 150, estimatedTokens: 40, percent: 40,
            positions: { mainPrompt: usage(100, 25), prefixRules: usage(25, 7), suffixRules: usage(25, 8) },
            runtimeSupport: usage(0, 0), sharedOverhead: usage(0, 0),
          },
        ],
      },
      { key: 'notepad', labelKey: 'promptBreakdown.notepad', color: '#84CC16', available: true, sourceCount: 1, charCount: 200, estimatedTokens: 50, percent: 5 },
      { key: 'directive', labelKey: 'promptBreakdown.directive', color: '#DB2777', available: true, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0 },
      { key: 'userProfile', labelKey: 'promptBreakdown.userProfile', color: '#34D399', available: true, sourceCount: 1, charCount: 100, estimatedTokens: 25, percent: 3 },
      { key: 'summary', labelKey: 'promptBreakdown.summary', color: '#A78BFA', available: true, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0 },
      { key: 'history', labelKey: 'promptBreakdown.history', color: '#FB7185', available: true, sourceCount: 12, charCount: 1000, estimatedTokens: 250, percent: 25 },
      { key: 'worldbook', labelKey: 'promptBreakdown.worldbook', color: '#22D3EE', available: false, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0 },
      { key: 'memory', labelKey: 'promptBreakdown.memory', color: '#F97316', available: true, sourceCount: 2, charCount: 160, estimatedTokens: 40, percent: 4 },
      { key: 'currentInput', labelKey: 'promptBreakdown.currentInput', color: '#C084FC', available: true, sourceCount: 1, charCount: 120, estimatedTokens: 30, percent: 3 },
    ],
    total: { charCount: 3980, estimatedTokens: 995 },
    cache: { available: true, hitRate: 80, inputTokens: 1000, readTokens: 800, writeTokens: 0 },
    billing: { available: true, totalPoints: 42, inputPoints: 10, cacheReadPoints: 2, outputPoints: 30, cacheHitRate: 80 },
    ...overrides,
  }
}

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(CanvasContextBreakdown, { props: { labels: LABELS, ...props } })
}

describe('組成：伺服器回覆正規化', () => {
  it('十一個桶照固定順序列出，百分比與 token 對得上伺服器', () => {
    const report = normalizeServerReport(serverReport())!
    expect(report.items.map((i) => i.key)).toEqual(BREAKDOWN_META.map((m) => m.key))
    const byKey = Object.fromEntries(report.items.map((i) => [i.key, i]))
    expect(byKey.system.percent).toBe(30)
    expect(byKey.system.estimatedTokens).toBe(300)
    expect(byKey.history.percent).toBe(25)
    expect(byKey.worldbook.available).toBe(false)
    expect(report.total.estimatedTokens).toBe(995)
    expect(report.billing.totalPoints).toBe(42)
    expect(report.billing.cacheHitRate).toBe(80)
  })

  it('內部欄位不出正規化結果：model／roleId／turnIndex 一個都不留', () => {
    const report = normalizeServerReport(serverReport()) as any
    expect(report).not.toHaveProperty('model')
    expect(report).not.toHaveProperty('roleId')
    expect(report).not.toHaveProperty('turnIndex')
    expect(report.conversationId).toBe('conv-1')
  })

  it('MOD 明細加總對得上才放出來；對不上就標成 invalid_detail 不畫', () => {
    const ok = normalizeServerReport(serverReport())!
    const mod = ok.items.find((i) => i.key === 'mod')!
    expect(mod.detailsAvailable).toBe(true)
    expect(mod.details.map((d) => d.modId)).toEqual(['mod-a', 'mod-b'])

    const broken = serverReport()
    ;(broken.items[2] as any).details[0].estimatedTokens = 999
    const bad = normalizeServerReport(broken)!
    const badMod = bad.items.find((i) => i.key === 'mod')!
    expect(badMod.detailsAvailable).toBe(false)
    expect(badMod.detailsUnavailableReason).toBe('invalid_detail')
  })

  it('伺服器沒給百分比時自己分配，加起來剛好 100', () => {
    const raw = serverReport()
    raw.items.forEach((i: any) => { i.percent = 0 })
    const report = normalizeServerReport(raw)!
    expect(report.items.reduce((sum, i) => sum + i.percent, 0)).toBe(100)
  })

  it('不支援的模型：所有桶歸零、supported=false', () => {
    const report = normalizeServerReport(serverReport({ supported: false, status: 'unsupportedModel' }))!
    expect(report.supported).toBe(false)
    expect(report.status).toBe('unsupportedModel')
    expect(report.items.every((i) => i.estimatedTokens === 0 && i.percent === 0)).toBe(true)
  })

  it('圓環只畫有 token 的桶，最後一段收在 360 度，選中的那段外推', () => {
    const report = normalizeServerReport(serverReport())!
    const segments = buildPromptDonutSegments(report.items, 'history')
    expect(segments.map((s) => s.key)).toEqual(['system', 'roleCard', 'mod', 'notepad', 'userProfile', 'history', 'memory', 'currentInput'])
    expect(segments.find((s) => s.key === 'history')!.isActive).toBe(true)
    expect(segments.find((s) => s.key === 'history')!.transform).toContain('translate')
    expect(segments.find((s) => s.key === 'system')!.transform).toBe('')
  })

  it('可選的桶：有 token、或是有明細的 MOD；預設選第一個可選的', () => {
    const report = normalizeServerReport(serverReport())!
    expect(promptBreakdownItemSelectable(report.items.find((i) => i.key === 'directive')!)).toBe(false)
    expect(promptBreakdownItemSelectable(report.items.find((i) => i.key === 'worldbook')!)).toBe(false)
    expect(resolvePromptBreakdownActiveItem(report.items, '').key).toBe('system')
    expect(resolvePromptBreakdownActiveItem(report.items, 'directive').key).toBe('system')
    expect(resolvePromptBreakdownActiveItem(report.items, 'mod').key).toBe('mod')
  })

  it('請求閘：同一段對話進行中不重複發，換對話就作廢舊的', () => {
    const gate = createPromptDiagnosticsRequestGate()
    const first = gate.begin('conv-1')
    expect(first).toBeTruthy()
    expect(gate.begin('conv-1')).toBeNull()
    expect(gate.isCurrent(first)).toBe(true)
    gate.invalidate()
    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.finish(first)).toBe(false)
  })
})

describe('組成：彈窗畫出來的東西', () => {
  it('每個桶一列，列上有名字、token 與百分比；沒資料的桶標成不可用', () => {
    const wrapper = mountSheet({ report: normalizeServerReport(serverReport()) })
    const el = wrapper.element as HTMLElement
    const rows = Array.from(el.querySelectorAll('.cb-row'))
    expect(rows.length).toBe(BREAKDOWN_META.length)
    const titles = rows.map((r) => r.querySelector('.cb-row-title')!.textContent)
    expect(titles).toEqual(BREAKDOWN_META.map((m) => ITEM_LABELS[m.key]))
    const system = rows[0]
    expect(system.querySelector('.cb-row-tokens')!.textContent).toContain('300')
    expect(system.querySelector('.cb-row-percent')!.textContent).toBe('30%')
    const worldbook = rows.find((r) => r.querySelector('.cb-row-title')!.textContent === '世界書召回')!
    expect(worldbook.classList.contains('is-unavailable')).toBe(true)
    expect(worldbook.querySelector('.cb-row-sub')!.textContent).toBe('尚無資料')
    // 圓環中央是選中那桶的數字
    expect(el.querySelector('.cb-donut-value')!.textContent).toBe('300')
    expect(el.querySelector('.cb-donut-label')!.textContent).toBe('系統與策略')
    expect(el.querySelector('.cb-donut-percent')!.textContent).toBe('30%')
    // 總計與計費
    expect(el.querySelectorAll('.cb-metric-value')[0].textContent).toBe('995')
    expect(el.querySelectorAll('.cb-metric-value')[1].textContent).toBe('3,980')
    expect(el.querySelector('.cb-billing-total-value')!.textContent).toContain('42')
    expect(el.querySelector('.cb-billing-hit')!.textContent).toContain('80%')
    // 內部欄位不出現在畫面上
    expect(el.textContent).not.toContain('secret-model-name')
    wrapper.unmount()
  })

  it('點一列把 key 交出去；不可選的列點了不會發', async () => {
    const wrapper = mountSheet({ report: normalizeServerReport(serverReport()) })
    const rows = Array.from((wrapper.element as HTMLElement).querySelectorAll<HTMLElement>('.cb-row'))
    rows.find((r) => r.querySelector('.cb-row-title')!.textContent === '歷史對話')!.click()
    expect(wrapper.emitted('select')).toEqual([['history']])
    rows.find((r) => r.querySelector('.cb-row-title')!.textContent === '長期指令')!.click()
    expect(wrapper.emitted('select')!.length).toBe(1)
    wrapper.unmount()
  })

  it('選中 MOD 時可以展開明細，每個 MOD 一列、名字跟著語言走', async () => {
    const wrapper = mountSheet({ report: normalizeServerReport(serverReport()), activeKey: 'mod', modDetailsExpanded: true, locale: 'en' })
    const el = wrapper.element as HTMLElement
    const names = Array.from(el.querySelectorAll('.cb-mod-detail-name')).map((n) => n.textContent)
    expect(names).toEqual(['Alpha', 'Beta'])
    expect(el.querySelector('.cb-mod-subtitle')!.textContent).toBe('本輪使用 2 個 MOD')
    el.querySelector<HTMLElement>('.cb-mod-head')!.click()
    expect(wrapper.emitted('toggle-mod-details')?.length).toBe(1)
    wrapper.unmount()
  })

  it('載入中：骨架，沒有列', () => {
    const el = mountSheet({ loading: true }).element as HTMLElement
    expect(el.querySelector('.cb-loading')).toBeTruthy()
    expect(el.querySelectorAll('.cb-row').length).toBe(0)
  })

  it('讀不到：一句話加重試，按了發 retry', async () => {
    const wrapper = mountSheet({ loadFailed: true })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.cb-empty-text')!.textContent).toBe('讀不到')
    el.querySelector<HTMLElement>('.cb-retry')!.click()
    expect(wrapper.emitted('retry')?.length).toBe(1)
    wrapper.unmount()
  })

  it('不支援的模型：明確空狀態，不畫全 0 的圓環', () => {
    const el = mountSheet({ report: normalizeServerReport(serverReport({ supported: false, status: 'unsupportedModel' })) }).element as HTMLElement
    expect(el.querySelector('.cb-empty-text')!.textContent).toBe('目前的模型不支援')
    expect(el.querySelector('.cb-donut')).toBeNull()
    expect(el.querySelector('.cb-subtitle')!.textContent).toBe('目前的模型不支援')
  })

  it('還沒完成一輪：副標寫「完成一輪回覆後可查看」，桶全 0 但列還在', () => {
    const raw = serverReport({ status: 'notReady', total: { charCount: 0, estimatedTokens: 0 }, billing: { available: false } })
    raw.items.forEach((i: any) => { i.estimatedTokens = 0; i.charCount = 0; i.percent = 0; i.sourceCount = 0 })
    const el = mountSheet({ report: normalizeServerReport(raw) }).element as HTMLElement
    expect(el.querySelector('.cb-subtitle')!.textContent).toBe('完成一輪回覆後可查看')
    expect(el.querySelectorAll('.cb-row').length).toBe(BREAKDOWN_META.length)
    expect(el.querySelector('.cb-billing-total-value')!.textContent).toBe('尚無資料')
  })

  it('關閉鍵發 close', async () => {
    const wrapper = mountSheet({ report: normalizeServerReport(serverReport()) })
    ;(wrapper.element as HTMLElement).querySelector<HTMLElement>('.cb-close')!.click()
    expect(wrapper.emitted('close')?.length).toBe(1)
    wrapper.unmount()
  })
})

describe('組成：吃得到作者的美化', () => {
  const source = readFileSync(resolve(__dirname, '../components/canvas-context-breakdown.vue'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

  it('元件沒有自己的 <style>，樣式全在 canvas.css 的 layer 裡', () => {
    expect(source).not.toContain('<style')
    const start = css.indexOf('.context-breakdown-scope')
    expect(start).toBeGreaterThan(css.indexOf('@layer lt-base'))
  })

  it('只用瀏覽器原生標籤', () => {
    const template = source.slice(0, source.indexOf('<script'))
    for (const tag of ['view', 'text', 'image', 'textarea', 'input', 'scroll-view', 'button', 'navigator']) {
      expect(template).not.toMatch(new RegExp(`<${tag}[\\s/>]`))
    }
  })

  it('這一段不寫 margin、不寫死深色底與灰字——底色與字色都從卡片的文字色調出來', () => {
    const start = css.indexOf('/* ── 這則回覆的組成')
    const end = css.indexOf('/* ── 手機')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const block = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(block).not.toMatch(/(^|[^-])margin(-\w+)?\s*:/)
    expect(block).not.toMatch(/!\s*important/)
    // 只有圓環分段用語意色（來自資料的 inline fill），樣式本身不寫任何色碼
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/rgba?\(/)
  })
})
