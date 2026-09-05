/**
 * 浮層落點：貼著呼出點、永遠在視窗裡。
 */
import { describe, it, expect } from 'vitest'
import { placeMessageMenu, pointFromEvent } from '../canvas-menu-position'

const VIEW = { viewportWidth: 390, viewportHeight: 844 }
const MENU = { menuWidth: 240, menuHeight: 260 }

function within(p: { left: number; top: number }, w: number, h: number) {
  expect(p.left).toBeGreaterThanOrEqual(0)
  expect(p.top).toBeGreaterThanOrEqual(0)
  expect(p.left + w).toBeLessThanOrEqual(VIEW.viewportWidth)
  expect(p.top + h).toBeLessThanOrEqual(VIEW.viewportHeight)
}

describe('長按（偏上）', () => {
  it('手指在畫面下半：浮層開在手指上方', () => {
    const p = placeMessageMenu({ ...VIEW, ...MENU, x: 200, y: 600, prefer: 'above' })
    expect(p.placement).toBe('above')
    expect(p.top + MENU.menuHeight).toBeLessThan(600)
    within(p, MENU.menuWidth, MENU.menuHeight)
  })

  it('手指離頂太近：翻到手指下方', () => {
    const p = placeMessageMenu({ ...VIEW, ...MENU, x: 200, y: 120, prefer: 'above' })
    expect(p.placement).toBe('below')
    expect(p.top).toBeGreaterThan(120)
    within(p, MENU.menuWidth, MENU.menuHeight)
  })

  it('手指貼著左緣：浮層不會被切到畫面外', () => {
    const p = placeMessageMenu({ ...VIEW, ...MENU, x: 6, y: 600, prefer: 'above' })
    within(p, MENU.menuWidth, MENU.menuHeight)
  })

  it('手指貼著右緣：浮層不會被切到畫面外', () => {
    const p = placeMessageMenu({ ...VIEW, ...MENU, x: 386, y: 600, prefer: 'above' })
    within(p, MENU.menuWidth, MENU.menuHeight)
  })

  it('浮層比上下剩餘空間都高：貼邊塞進視窗，不超出', () => {
    const p = placeMessageMenu({ ...VIEW, menuWidth: 240, menuHeight: 800, x: 200, y: 420, prefer: 'above' })
    within(p, 240, 800)
  })
})

describe('桌機 ⋯ 按鈕（偏下）', () => {
  const DESKTOP = { viewportWidth: 1280, viewportHeight: 800 }

  it('按鈕在畫面上半：浮層開在按鈕正下方、左緣對齊按鈕', () => {
    const p = placeMessageMenu({ ...DESKTOP, ...MENU, x: 300, y: 200, anchorHeight: 22, prefer: 'below', align: 'start' })
    expect(p.placement).toBe('below')
    expect(p.top).toBeGreaterThanOrEqual(200 + 22)
    expect(p.left).toBe(300)
  })

  it('按鈕貼近底部：翻到按鈕上方', () => {
    const p = placeMessageMenu({ ...DESKTOP, ...MENU, x: 300, y: 760, anchorHeight: 22, prefer: 'below', align: 'start' })
    expect(p.placement).toBe('above')
    expect(p.top + MENU.menuHeight).toBeLessThanOrEqual(760)
    expect(p.top).toBeGreaterThanOrEqual(0)
  })

  it('按鈕在右緣：浮層往左收，不超出視窗', () => {
    const p = placeMessageMenu({ ...DESKTOP, ...MENU, x: 1200, y: 200, anchorHeight: 22, prefer: 'below', align: 'start' })
    expect(p.left + MENU.menuWidth).toBeLessThanOrEqual(1280)
  })
})

describe('取呼出點', () => {
  it('觸控事件取第一根手指', () => {
    expect(pointFromEvent({ touches: [{ clientX: 10, clientY: 20 }] })).toEqual({ x: 10, y: 20 })
  })
  it('滑鼠事件取 clientX/Y', () => {
    expect(pointFromEvent({ clientX: 3, clientY: 4 })).toEqual({ x: 3, y: 4 })
  })
  it('沒有座標就回 null', () => {
    expect(pointFromEvent({})).toBeNull()
    expect(pointFromEvent(null)).toBeNull()
  })
})
