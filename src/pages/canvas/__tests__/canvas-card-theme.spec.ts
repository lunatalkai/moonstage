/**
 * 從作者的卡抽出「塊」的外觀（owner 2026-09-05：模型設定的選中態還是金色，卡片是紅色主題；
 * 準備過程與中斷卡單獨成塊時沒有卡片的描邊與底色）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeCardThemeVars, parseCssColor } from '../canvas-card-theme'

describe('從卡片量到的外觀', () => {
  it('BA 卡日間：氣泡藍邊、半透明白底、8px 圓角，快捷鍵藍邊 → 邊框、底色、主色都跟著來', () => {
    const vars = computeCardThemeVars({
      bubbleBorderColor: 'rgb(0, 174, 239)', bubbleBorderWidth: '2px', bubbleBorderStyle: 'solid',
      bubbleBackground: 'rgba(255, 255, 255, 0.5)', bubbleRadius: '8px', accentColor: 'rgb(0, 174, 239)',
    })
    expect(vars['--lt-canvas-block-border']).toBe('2px solid rgb(0, 174, 239)')
    expect(vars['--lt-canvas-block-bg']).toBe('rgba(255, 255, 255, 0.5)')
    expect(vars['--lt-canvas-block-radius']).toBe('8px')
    expect(vars['--lt-canvas-accent']).toBe('rgb(0, 174, 239)')
    expect(vars['--lt-canvas-accent-fg']).toBe('#FFFFFF')
    expect(vars['--lt-canvas-accent-bg']).toContain('rgb(0, 174, 239) 16%')
  })

  it('沒有邊框、透明底、灰色主色 → 一個都不給，留我們的預設', () => {
    const vars = computeCardThemeVars({
      bubbleBorderColor: 'rgba(0, 0, 0, 0)', bubbleBorderWidth: '0px', bubbleBorderStyle: 'none',
      bubbleBackground: 'rgba(0, 0, 0, 0)', bubbleRadius: '0px', accentColor: 'rgba(255, 255, 255, 0.1)',
    })
    expect(vars).toEqual({})
    expect(computeCardThemeVars({ accentColor: 'rgb(120, 120, 120)' })).toEqual({})
  })

  it('沒有快捷鍵可量時，主色退回氣泡的邊框色；亮色主色配深色字', () => {
    const vars = computeCardThemeVars({ bubbleBorderColor: 'rgb(245, 197, 66)', bubbleBorderWidth: '1px', bubbleBorderStyle: 'solid' })
    expect(vars['--lt-canvas-accent']).toBe('rgb(245, 197, 66)')
    expect(vars['--lt-canvas-accent-fg']).toBe('#0F1419')
  })

  it('看得懂三種寫法的顏色', () => {
    expect(parseCssColor('#f5c542')).toEqual({ r: 245, g: 197, b: 66, a: 1 })
    expect(parseCssColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 })
    expect(parseCssColor('transparent')).toBeNull()
  })
})

describe('主色挑鮮明的那個', () => {
  it('BA 卡夜間：快捷鍵暗紅、氣泡亮紅 → 主色是亮紅', () => {
    const vars = computeCardThemeVars({
      bubbleBorderColor: 'rgb(216, 75, 97)', bubbleBorderWidth: '2px', bubbleBorderStyle: 'solid',
      accentColor: 'rgb(100, 36, 50)',
    })
    expect(vars['--lt-canvas-accent']).toBe('rgb(216, 75, 97)')
  })
})

describe('彈層裡的變數全部從當下的字色調', () => {
  it('sheet-fg／panel-fg／panel-item-bg／placeholder 在 .u-popup__content 重定義', () => {
    const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
    const start = css.indexOf('.u-popup__content {')
    const block = css.slice(start, css.indexOf('}', start))
    for (const v of ['--lt-canvas-sheet-fg: currentColor', '--lt-canvas-panel-fg: currentColor', '--lt-canvas-panel-item-bg: color-mix(in srgb, currentColor', '--lt-canvas-placeholder-color: color-mix(in srgb, currentColor']) {
      expect(block, v).toContain(v)
    }
  })
})
