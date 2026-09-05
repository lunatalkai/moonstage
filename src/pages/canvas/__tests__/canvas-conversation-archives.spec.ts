/**
 * 畫布的存檔面板：這張卡的對話清單（切換／改名／刪除／分叉／滿檔）。
 *
 * 兩層：純函式那層問「伺服器回的清單怎麼變成畫面上的列」（只列本角色由伺服器
 * 依 roleId 保證，客戶端負責把 roleId 送上去、把目前這段標出來、沒名字的給編號）；
 * 元件那層問「玩家按下去會發生什麼」——整列點是切換、鉛筆是就地改名、刪除鍵交出去
 * 由頁面二次確認、滿了就把提示與「去看存檔」畫出來。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  archiveRequestQuery,
  buildArchiveRows,
  isArchiveFull,
  nextArchiveAfterDelete,
} from '../canvas-archives'
import CanvasConversationList from '../components/canvas-conversation-list.vue'

const LABELS = {
  segment: (n: number) => `第 ${n} 段`,
  messages: (n: number) => `${n} 則訊息`,
}

const SERVER_LIST = [
  { conversationId: 'c-new', title: '', isCurrent: true, messageCount: 12, lastMessage: '最新的一句', createTime: '2026-09-04T10:00:00Z', lastUpdateTime: '2026-09-04T12:00:00Z' },
  { conversationId: 'c-mid', title: '分岔路', isCurrent: false, messageCount: 40, lastMessage: '中間', createTime: '2026-09-03T10:00:00Z', lastUpdateTime: '2026-09-03T12:00:00Z' },
  { conversationId: 'c-old', title: '', isCurrent: false, messageCount: 3, lastMessage: '', createTime: '2026-09-01T10:00:00Z', lastUpdateTime: '2026-09-01T12:00:00Z' },
]

describe('存檔清單：伺服器回的清單怎麼變成列', () => {
  it('請求帶的是這張卡的 roleId——清單只列本角色是伺服器依這個參數保證的', () => {
    expect(archiveRequestQuery('role-1')).toEqual({ roleId: 'role-1' })
  })

  it('有名字用名字，沒名字照建立順序編號；目前這段標出來；最後一句當摘要', () => {
    const rows = buildArchiveRows(SERVER_LIST, LABELS)
    expect(rows.map((r) => r.key)).toEqual(['c-new', 'c-mid', 'c-old'])
    expect(rows[0].name).toBe('第 3 段')
    expect(rows[0].current).toBe(true)
    expect(rows[0].summary).toBe('最新的一句')
    expect(rows[0].countText).toBe('12 則訊息')
    expect(rows[1].name).toBe('分岔路')
    expect(rows[1].title).toBe('分岔路')
    expect(rows[1].current).toBe(false)
    expect(rows[2].name).toBe('第 1 段')
  })

  it('壞掉的回應不炸：不是陣列就是空清單', () => {
    expect(buildArchiveRows(undefined as any, LABELS)).toEqual([])
    expect(buildArchiveRows({} as any, LABELS)).toEqual([])
  })

  it('滿檔看的是數量對上限', () => {
    expect(isArchiveFull(19, 20)).toBe(false)
    expect(isArchiveFull(20, 20)).toBe(true)
    expect(isArchiveFull(25, 20)).toBe(true)
    expect(isArchiveFull(0, 0)).toBe(false)
  })

  it('刪掉目前這段之後接手的是最新的另一段；沒有別段就是空', () => {
    const rows = buildArchiveRows(SERVER_LIST, LABELS)
    expect(nextArchiveAfterDelete(rows, 'c-new')).toBe('c-mid')
    expect(nextArchiveAfterDelete(rows, 'c-mid')).toBe('c-new')
    expect(nextArchiveAfterDelete(rows.slice(0, 1), 'c-new')).toBe('')
  })
})

function mountList(extra: Record<string, unknown> = {}) {
  return mount(CanvasConversationList, {
    props: {
      title: '存檔',
      countText: '3/20',
      currentLabel: '目前',
      closeText: '關閉',
      labels: { rename: '改名', delete: '刪除', done: '完成', cancel: '取消' },
      items: [
        { key: 'c-new', name: '第 3 段', summary: '最新的一句', time: '今天', countText: '12 則訊息', current: true },
        { key: 'c-mid', name: '分岔路', title: '分岔路', summary: '中間', time: '昨天', countText: '40 則訊息', current: false },
      ],
      ...extra,
    },
  })
}

describe('存檔面板：玩家按下去會發生什麼', () => {
  it('標題帶著 N/20；目前這段標「目前」且整列點不會切換；別段整列點就是切換', async () => {
    const wrapper = mountList()
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.cl-title')!.textContent).toContain('存檔')
    expect(el.querySelector('.cl-title')!.textContent).toContain('3/20')
    const rows = el.querySelectorAll<HTMLElement>('.cl-item')
    expect(rows.length).toBe(2)
    expect(rows[0].classList.contains('is-current')).toBe(true)
    expect(rows[0].querySelector('.cl-item-tag')!.textContent).toBe('目前')
    expect(rows[1].querySelector('.cl-item-summary')!.textContent).toBe('中間')
    rows[0].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick')).toBeUndefined()
    rows[1].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick')?.[0]).toEqual(['c-mid'])
  })

  it('鉛筆是就地改名：出現輸入框，Enter 把新名字交出去，改名時整列點不會切換', async () => {
    const wrapper = mountList()
    const el = wrapper.element as HTMLElement
    const rows = el.querySelectorAll<HTMLElement>('.cl-item')
    rows[1].querySelector<HTMLElement>('.cl-action-rename')!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick')).toBeUndefined()
    const input = rows[1].querySelector<HTMLInputElement>('.cl-rename-input')
    expect(input).not.toBeNull()
    expect(input!.value).toBe('分岔路')
    input!.value = '新的名字'
    input!.dispatchEvent(new Event('input'))
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('rename')?.[0]).toEqual(['c-mid', '新的名字'])
    // 交出去之後輸入框收起來
    expect(rows[1].querySelector('.cl-rename-input')).toBeNull()
  })

  it('改名時按 Esc 是放棄，不交出任何東西', async () => {
    const wrapper = mountList()
    const rows = (wrapper.element as HTMLElement).querySelectorAll<HTMLElement>('.cl-item')
    rows[0].querySelector<HTMLElement>('.cl-action-rename')!.click()
    await wrapper.vm.$nextTick()
    const input = rows[0].querySelector<HTMLInputElement>('.cl-rename-input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(rows[0].querySelector('.cl-rename-input')).toBeNull()
  })

  it('刪除鍵只把那一段交出去（二次確認在頁面），不會順手切換', async () => {
    const wrapper = mountList()
    const rows = (wrapper.element as HTMLElement).querySelectorAll<HTMLElement>('.cl-item')
    rows[1].querySelector<HTMLElement>('.cl-action-delete')!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('delete')?.[0]).toEqual(['c-mid'])
    expect(wrapper.emitted('pick')).toBeUndefined()
  })

  it('滿了就把提示畫出來；沒滿就不佔位', () => {
    const full = mountList({ full: true, fullText: '存檔已滿（20/20），刪掉一段再開。' }).element as HTMLElement
    expect(full.querySelector('.cl-full')!.textContent).toBe('存檔已滿（20/20），刪掉一段再開。')
    const notFull = mountList().element as HTMLElement
    expect(notFull.querySelector('.cl-full')).toBeNull()
  })

  it('舊的用法還在：只有 name／current 的列照樣畫得出來，空清單給一句話', () => {
    const el = mount(CanvasConversationList, {
      props: { items: [{ key: 'a', name: '甲', current: true }], emptyText: '還沒有存檔' },
    }).element as HTMLElement
    expect(el.querySelectorAll('.cl-item').length).toBe(1)
    const empty = mount(CanvasConversationList, { props: { items: [], emptyText: '還沒有存檔' } }).element as HTMLElement
    expect(empty.querySelector('.cl-empty')!.textContent).toBe('還沒有存檔')
  })
})

describe('存檔面板：改名輸入框不能寫成模板裡的 <input>', () => {
  it('uni-app 會把模板 <input> 換成沒有 .value 的外殼；輸入框要走 h() 建的 CanvasInput', () => {
    const src = readFileSync(resolve(__dirname, '../components/canvas-conversation-list.vue'), 'utf8')
    const template = src.slice(0, src.indexOf('<script'))
    expect(template).not.toMatch(/<input\b/)
    expect(template).not.toMatch(/<textarea\b/)
    expect(template).toMatch(/<CanvasInput\b/)
  })
})
