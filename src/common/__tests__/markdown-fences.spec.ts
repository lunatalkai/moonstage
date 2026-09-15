/** 程式碼圍欄裡的東西是字面文字：改訊息文字的處理一律繞過圍欄。 */
import { describe, it, expect } from 'vitest'
import { withFencesProtected } from '../markdown-fences'

const up = (s: string) => s.replace(/<style>/g, '<STYLE>')

describe('withFencesProtected', () => {
  it('圍欄外的照改，圍欄裡的原樣', () => {
    const text = '前<style>a</style>\n```\n<style>b</style>\n```\n後<style>c</style>'
    expect(withFencesProtected(text, up)).toBe('前<STYLE>a</style>\n```\n<style>b</style>\n```\n後<STYLE>c</style>')
  })
  it('沒收尾的圍欄算到字串結尾（串流中、或模型忘了關）', () => {
    const text = '```\n<!DOCTYPE html><style>x</style>\n正文'
    expect(withFencesProtected(text, up)).toBe(text)
  })
  it('~~~ 與標了語言的圍欄一樣算；圍欄開頭在字串第一行也算', () => {
    expect(withFencesProtected('~~~html\n<style>a</style>\n~~~\n<style>b</style>', up)).toBe('~~~html\n<style>a</style>\n~~~\n<STYLE>b</style>')
  })
  it('沒有圍欄就直接改整段', () => {
    expect(withFencesProtected('<style>a</style>', up)).toBe('<STYLE>a</style>')
  })
})
