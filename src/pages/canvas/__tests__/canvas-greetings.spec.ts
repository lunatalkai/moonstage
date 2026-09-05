/**
 * 多條開場白。
 *
 * 兩件事要擋住：
 *   一、沒有替代開場白時不要畫出「第 1／1」那組箭頭——那是在告訴玩家有得選，
 *       而他點下去什麼都不會變。
 *   二、選了第幾條要真的跟著「開始對話」那一次請求走。伺服器是在那一刻建立
 *       對話並落下開場白的，晚一步就等於替玩家選了第一條。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import CanvasMessage from '../components/canvas-message.vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildGreetingList,
  hasAlternates,
  shouldDeferStart,
  stepGreeting,
  greetingIndexForStart,
  buildPrologueList,
  shouldShowPrologue,
  MAX_GREETINGS,
  MAX_PROLOGUE,
} from '../canvas-greetings'

const BASE = { mesid: 0, role: 'ai' as const, name: '示範角色', html: '<p>開場</p>', latest: true }

describe('開場白清單', () => {
  it('主開場白永遠排在第一條', () => {
    const list = buildGreetingList({ roleWelcome: '主', welcomeAlternates: ['甲', '乙'] })
    expect(list).toEqual(['主', '甲', '乙'])
  })

  it('舊版伺服器沒有這個欄位不是錯誤，當成空的', () => {
    expect(buildGreetingList({ roleWelcome: '主' })).toEqual(['主'])
    expect(buildGreetingList({})).toEqual([])
  })

  it('空字串的替代開場白不算一條', () => {
    expect(buildGreetingList({ roleWelcome: '主', welcomeAlternates: ['', '  ', '乙'] })).toEqual(['主', '乙'])
  })

  it('超過上限的截掉', () => {
    const many = Array.from({ length: 40 }, (_, i) => 'g' + i)
    expect(buildGreetingList({ roleWelcome: '主', welcomeAlternates: many })).toHaveLength(MAX_GREETINGS)
  })

  it('只有一條就沒得選', () => {
    expect(hasAlternates(['主'])).toBe(false)
    expect(hasAlternates(['主', '甲'])).toBe(true)
  })
})

describe('切換與開始對話', () => {
  it('到頭到尾就停住，不繞回去', () => {
    const state = { list: ['a', 'b', 'c'], index: 0 }
    expect(stepGreeting(state, -1)).toBe(0)
    expect(stepGreeting(state, 1)).toBe(1)
    state.index = 2
    expect(stepGreeting(state, 1)).toBe(2)
  })

  it('有得選才押後開對話；沒得選就照舊立刻開', () => {
    expect(shouldDeferStart(['主', '甲'])).toBe(true)
    expect(shouldDeferStart(['主'])).toBe(false)
    expect(shouldDeferStart([])).toBe(false)
  })

  it('開始對話帶的是選到的那一條；沒得選就不帶這個欄位', () => {
    expect(greetingIndexForStart({ list: ['主', '甲', '乙'], index: 2 })).toBe(2)
    expect(greetingIndexForStart({ list: ['主', '甲'], index: 0 })).toBe(0)
    // 舊版伺服器收到未知欄位不一定友善，沒得選就不要帶
    expect(greetingIndexForStart({ list: ['主'], index: 0 })).toBeUndefined()
  })
})

// 開場選項（MMD prologue）跟替代開場白是兩份資料、兩個機制。
// 2026-09-04 作者回報：把 MMD 的 prologue 當替代開場白匯入，玩家一點就把第一則訊息換掉；
// MMD 實測是「把那句話填進輸入框，由玩家送出」。
describe('開場選項（MMD prologue）', () => {
  it('從角色詳情的 prologue 讀；空字串不算、超過上限截掉', () => {
    expect(buildPrologueList({ prologue: ['老師早安', '', '  ', '今天要去哪'] })).toEqual(['老師早安', '今天要去哪'])
    const many = Array.from({ length: 40 }, (_, i) => 'p' + i)
    expect(buildPrologueList({ prologue: many })).toHaveLength(MAX_PROLOGUE)
  })

  it('舊版伺服器沒有這個欄位當空，不是錯誤', () => {
    expect(buildPrologueList({ roleWelcome: '主' })).toEqual([])
    expect(buildPrologueList(null)).toEqual([])
  })

  it('開場選項不進開場白清單：只有 alternates 才押後開對話', () => {
    const list = buildGreetingList({ roleWelcome: '主', prologue: ['甲', '乙'] })
    expect(list).toEqual(['主'])
    expect(shouldDeferStart(list)).toBe(false)
  })

  it('玩家還沒說過第一句就顯示；送出之後收起', () => {
    const prologue = ['甲']
    expect(shouldShowPrologue(prologue, [])).toBe(true)
    expect(shouldShowPrologue(prologue, [{ type: 0 }])).toBe(true)
    expect(shouldShowPrologue(prologue, [{ type: 0 }, { type: 1 }])).toBe(false)
    expect(shouldShowPrologue([], [{ type: 0 }])).toBe(false)
  })

  it('點一條是填輸入框，不是換開場白：頁面的處理函式不碰開場白狀態', () => {
    const page = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    const start = page.indexOf('function onProloguePick(')
    expect(start).toBeGreaterThan(-1)
    const body = page.slice(start, page.indexOf('\n}', start))
    expect(body).toContain('fillComposer(')
    expect(body).not.toContain('greeting.index')
    expect(body).not.toContain('renderGreetingPreview')
    expect(body).not.toContain('chatStart(')
    expect(body).not.toContain('onActionBtnClick')
  })
})

describe('切換的畫面', () => {
  it('有替代開場白時畫出箭頭與「第 k／n」', () => {
    const wrapper = mount(CanvasMessage, {
      props: { message: { ...BASE, swipes: { index: 1, total: 3 } } },
    })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.swipes-counter')!.textContent!.replace(/\s/g, '')).toBe('2/3')
    expect(el.querySelector('.swipe_left')).toBeTruthy()
    expect(el.querySelector('.swipe_right')).toBeTruthy()
    expect(el.querySelector('.swipeRightBlock')!.classList.contains('is-empty')).toBe(false)
  })

  it('點箭頭往哪邊走，說得出來', async () => {
    const wrapper = mount(CanvasMessage, {
      props: { message: { ...BASE, swipes: { index: 1, total: 3 } } },
    })
    ;(wrapper.element.querySelector('.swipe_right') as HTMLElement).click()
    ;(wrapper.element.querySelector('.swipe_left') as HTMLElement).click()
    expect(wrapper.emitted('swipe')).toEqual([[1], [-1]])
  })

  it('沒有替代開場白時整組收起——但節點仍然在，酒館主題抓得到', () => {
    const wrapper = mount(CanvasMessage, { props: { message: { ...BASE, swipes: null } } })
    const el = wrapper.element as HTMLElement
    const block = el.querySelector('.swipeRightBlock')!
    expect(block.classList.contains('is-empty')).toBe(true)
    expect(el.querySelector('.swipe_left')).toBeTruthy()
    expect(el.querySelector('.swipes-counter')!.textContent).toBe('')
  })

  it('只有一條時也不畫箭頭', () => {
    const wrapper = mount(CanvasMessage, {
      props: { message: { ...BASE, swipes: { index: 0, total: 1 } } },
    })
    expect((wrapper.element as HTMLElement).querySelector('.swipeRightBlock')!.classList.contains('is-empty')).toBe(true)
  })
})
