/**
 * 作者樣式政策：格式 → <style> 怎麼落地。唯一知道格式意味著什麼的地方；
 * 宿主頁與沙箱殼都只拿政策來套。
 */
import { describe, it, expect } from 'vitest'
import { stylePolicyFor, applyStylePolicy, applyStylePolicyToHtml, MESSAGE_SCOPE } from '../author-style-policy'

// 一張真實酒館卡的正文美化 <style> 的骨架：頁面級 body 規則 + 固定定位的偽元素 + 內容類別。
const PAGE_LEVEL_CSS = 'body{display:flex;justify-content:center;background:#fff}body::before{content:"";position:fixed;inset:0;background:radial-gradient(#f0f,#0ff)}.letter-container{max-width:680px}'

describe('政策表', () => {
  it('酒館 → 訊息層前綴；MMD → 原樣；沒宣告／不認得 → 當 MMD', () => {
    expect(stylePolicyFor('tavern')).toEqual({ scope: MESSAGE_SCOPE, fencedDocument: 'iframe' })
    expect(stylePolicyFor('mmd')).toEqual({ scope: null, fencedDocument: 'inline' })
    expect(stylePolicyFor(undefined)).toEqual({ scope: null, fencedDocument: 'inline' })
    expect(stylePolicyFor('')).toEqual({ scope: null, fencedDocument: 'inline' })
    expect(stylePolicyFor('whatever')).toEqual({ scope: null, fencedDocument: 'inline' })
  })
  it('伺服器欄位的別名也走同一張表', () => {
    expect(stylePolicyFor(' SillyTavern ')).toEqual({ scope: MESSAGE_SCOPE, fencedDocument: 'iframe' })
  })
})

describe('套用到 CSS', () => {
  it('酒館卡的頁面級規則跟原平台一樣不會碰到頁面：body 變成 `.mes_text body`（死規則），內容類別正常作用', () => {
    const out = applyStylePolicy(PAGE_LEVEL_CSS, stylePolicyFor('tavern'))
    expect(out).toContain('.mes_text body{display:flex')
    expect(out).toContain('.mes_text body::before{')
    expect(out).toContain('.mes_text .letter-container{max-width:680px}')
    // 不能再出現裸的 body 規則，也不能把 body 對映成訊息層本身（那樣 position:fixed 仍蓋住整個視口）
    expect(out).not.toMatch(/(^|\})body\b/)
    expect(out).not.toContain('.mes_text::before')
  })
  it('MMD 卡原樣', () => {
    expect(applyStylePolicy(PAGE_LEVEL_CSS, stylePolicyFor('mmd'))).toBe(PAGE_LEVEL_CSS)
  })
})

describe('套用到訊息 HTML', () => {
  const html = '<p>x</p><style>p{color:red}</style>'
  it('酒館：每個 <style> 都改寫、屬性保留', () => {
    expect(applyStylePolicyToHtml('<style data-a="1">a{}</style>' + html, stylePolicyFor('tavern')))
      .toBe('<style data-a="1">.mes_text a{}</style><p>x</p><style>.mes_text p{color:red}</style>')
  })
  it('程式碼圍欄裡的 <style> 是字面文字，不加前綴（那是要放進自己 iframe 的前端文件）', () => {
    const text = '```\n<!DOCTYPE html><style>body{display:flex}</style>\n```\n<style>p{}</style>'
    expect(applyStylePolicyToHtml(text, stylePolicyFor('tavern'))).toBe('```\n<!DOCTYPE html><style>body{display:flex}</style>\n```\n<style>.mes_text p{}</style>')
  })
  it('MMD：連掃描都不做，原字串回來', () => {
    expect(applyStylePolicyToHtml(html, stylePolicyFor('mmd'))).toBe(html)
  })
})
