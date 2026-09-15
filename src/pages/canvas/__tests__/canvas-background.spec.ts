/**
 * 舞台背景的解析。
 *
 * 由來（owner 2026-09-10）：一張 MMD 卡在 sexyai.ai 上有背景，搬到畫布整片是空的。
 * 抓對方線上的聊天頁看，背景層綁的是：
 *
 *   background: url( roleInfo.backgroundUrl ? roleInfo.backgroundUrl : roleInfo.imageUrl )
 *              center center / auto 100%
 *
 * 兩級回退，而且兩級都是卡片自帶的，跟玩家偏好無關——MMD 在這一層根本沒有「玩家
 * 自選背景」這回事。我們原本只認玩家設過的那一張，沒設就是空，等於少了整整兩級。
 *
 * 玩家的「重置背景圖」要留著，所以它不能再存空字串：偏好讀取會把「沒設過」與
 * 「設成空」一起塌成空字串，兩者分不開。主動重置改存一個哨兵值，空字串就還原成
 * 它本來的意思——沒設過，照卡片走。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveStageBackground } from '../canvas-background'

const ROLE = { roleBackground: 'https://cdn/bg.jpg', roleAvatar: 'https://cdn/avatar.jpg' }

describe('resolveStageBackground', () => {
  it('玩家選過就用玩家的', () => {
    expect(resolveStageBackground({ playerChoice: 'https://cdn/mine.jpg', ...ROLE })).toBe('https://cdn/mine.jpg')
  })

  it('玩家沒設過（空字串）退到卡片的背景圖', () => {
    expect(resolveStageBackground({ playerChoice: '', ...ROLE })).toBe('https://cdn/bg.jpg')
  })

  it('卡片沒有背景圖時再退到卡片的形象圖，跟 MMD 同一級', () => {
    expect(resolveStageBackground({ playerChoice: '', roleBackground: '', roleAvatar: 'https://cdn/avatar.jpg' }))
      .toBe('https://cdn/avatar.jpg')
  })

  it('玩家主動重置＝真的不要背景，不再往下退', () => {
    expect(resolveStageBackground({ playerChoice: '', backgroundOff: true, ...ROLE })).toBe('')
  })

  it('兩級都沒有就是空的', () => {
    expect(resolveStageBackground({ playerChoice: '', roleBackground: '', roleAvatar: '' })).toBe('')
  })

  it('缺欄位不炸', () => {
    expect(resolveStageBackground({} as any)).toBe('')
    expect(resolveStageBackground({ playerChoice: null, roleBackground: undefined, roleAvatar: null } as any)).toBe('')
  })
})

describe('關掉背景不靠往 backgroundUrl 塞特殊字串', () => {
  it('backgroundUrl 只放網址或空字串——那份偏好跟主站共用，塞哨兵會漏過去', () => {
    const src = readFileSync(resolve(__dirname, '../canvas-background.ts'), 'utf8')
    expect(src).not.toMatch(/BACKGROUND_NONE|__lt_none__/)
  })
})

/**
 * 新的偏好鍵要真的被讀回來：偏好讀取只填 PLAY_PREFERENCE_DEFAULTS 列出的鍵，
 * 漏登記就永遠是 undefined，「不要背景」按下去下次進來又回來了。
 */
describe('backgroundOff 有登記進偏好讀取', () => {
  const mixin = readFileSync(resolve(__dirname, '../../../mixins/UserDefine.js'), 'utf8')
  const defaults = mixin.slice(mixin.indexOf('PLAY_PREFERENCE_DEFAULTS = {'))

  it('列在 PLAY_PREFERENCE_DEFAULTS 裡', () => {
    expect(defaults.slice(0, defaults.indexOf('}'))).toMatch(/backgroundOff:\s*false/)
  })

  it('預設是 false —— 沒設過的玩家要拿到卡片的背景，不是空白', () => {
    expect(defaults.slice(0, defaults.indexOf('}'))).not.toMatch(/backgroundOff:\s*true/)
  })
})

/**
 * 橫式背景（選填，2026-09-15）：直橫兩張各自解析，玩家自選那張兩個方向共用，
 * 關掉背景兩張全關。橫圖沒有就回空，由 CSS 退回直圖——這裡不做二級回退，
 * 否則「玩家設過直圖偏好」會被卡片橫圖蓋掉。
 */
import { resolveStageLandscapeBackground } from '../canvas-background'

describe('resolveStageLandscapeBackground', () => {
  const ROLE_L = { ...ROLE, roleBackgroundLandscape: 'https://cdn/bg-l.jpg' }

  it('玩家選過就用玩家的（兩個方向共用同一張）', () => {
    expect(resolveStageLandscapeBackground({ playerChoice: 'https://cdn/mine.jpg', ...ROLE_L })).toBe('https://cdn/mine.jpg')
  })

  it('玩家沒設過退到卡片的橫式背景', () => {
    expect(resolveStageLandscapeBackground({ playerChoice: '', ...ROLE_L })).toBe('https://cdn/bg-l.jpg')
  })

  it('卡片沒有橫圖就回空，交給 CSS 退回直圖，不退到形象圖', () => {
    expect(resolveStageLandscapeBackground({ playerChoice: '', ...ROLE })).toBe('')
  })

  it('關掉背景兩張全關', () => {
    expect(resolveStageLandscapeBackground({ playerChoice: '', backgroundOff: true, ...ROLE_L })).toBe('')
  })

  it('缺欄位不炸', () => {
    expect(resolveStageLandscapeBackground({} as any)).toBe('')
  })
})
