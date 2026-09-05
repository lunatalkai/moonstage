/**
 * 底部功能面板與彈層的狀態機。
 *
 * 為什麼是純函式：這一組的規則（誰關掉誰、ESC 先關哪一層、面板跟輸入區展開態
 * 互不相干）在元件裡會散成一堆 if，而每一條都是玩家按下去才發現不對的那種。
 */
import { describe, it, expect } from 'vitest'
import {
  createPanelState,
  toggleMore,
  closeMore,
  openSheet,
  closeSheet,
  onEscape,
  isAnyOverlayOpen,
} from '../canvas-panel-state'

describe('功能面板狀態機', () => {
  it('一開始兩層都是關的', () => {
    const s = createPanelState()
    expect(s.more).toBe(false)
    expect(s.sheet).toBe('')
    expect(isAnyOverlayOpen(s)).toBe(false)
  })

  it('＋ 是切換：按一下開、再按一下關', () => {
    let s = createPanelState()
    s = toggleMore(s)
    expect(s.more).toBe(true)
    s = toggleMore(s)
    expect(s.more).toBe(false)
  })

  it('開彈層會把面板收起來——兩層疊在一起玩家會看不出剛剛點到什麼', () => {
    let s = toggleMore(createPanelState())
    s = openSheet(s, 'model')
    expect(s.more).toBe(false)
    expect(s.sheet).toBe('model')
  })

  it('同時只有一個彈層：開第二個就換掉第一個', () => {
    let s = openSheet(createPanelState(), 'model')
    s = openSheet(s, 'conversations')
    expect(s.sheet).toBe('conversations')
  })

  it('關彈層不會順手把面板打開', () => {
    let s = openSheet(createPanelState(), 'model')
    s = closeSheet(s)
    expect(s.sheet).toBe('')
    expect(s.more).toBe(false)
  })

  it('ESC 先關彈層，再按才關面板', () => {
    let s = toggleMore(createPanelState())
    s = openSheet(s, 'confirm')
    // openSheet 已經收了面板，這裡把它再打開模擬「面板開著又開了彈層」的殘留
    s = { ...s, more: true }
    s = onEscape(s)
    expect(s.sheet).toBe('')
    expect(s.more).toBe(true)
    s = onEscape(s)
    expect(s.more).toBe(false)
  })

  it('兩層都關著時 ESC 什麼都不做（不要吃掉卡片自己的 ESC）', () => {
    const s = createPanelState()
    expect(onEscape(s)).toEqual(s)
  })

  it('closeMore 只動面板', () => {
    let s = openSheet(toggleMore(createPanelState()), 'model')
    s = { ...s, more: true }
    s = closeMore(s)
    expect(s.more).toBe(false)
    expect(s.sheet).toBe('model')
  })

  it('狀態是不可變的：原本那份不會被改掉', () => {
    const s = createPanelState()
    const next = toggleMore(s)
    expect(s.more).toBe(false)
    expect(next).not.toBe(s)
  })
})
