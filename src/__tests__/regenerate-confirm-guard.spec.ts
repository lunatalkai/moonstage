// 施工單：重新生成按鈕誤觸保護（desktop）
//
// 背景：staff 在社群頻道點名「重新生成」按鈕易誤觸，誤觸＝當前回覆被替換、
// 可能觸發劇情回溯，屬破壞性操作卻無任何確認。本工單在「已有完整回覆再重新
// 生成」的路徑（AI 訊息操作列的「重說」按鈕）前插入輕量確認；「失敗態重試」
// CTA（onSystemMsgCta 的 retry 分支）維持原樣不加確認——那裡本來就沒有內容
// 可失去，加確認只是摩擦。
//
// 確認元件鐵律（owner 急件修正）：禁止用 uni 原生 uni.showModal，必須沿用
// chat.vue 既有的 Modal.confirm（ant-design-vue，已 import 於本檔頂部），
// 跟刪除／回溯用的是同一套（見 removeSidebarItem 上方的刪除確認、
// bubbleBoxItemClick value == '2' / '3' 兩處既有調用）。
//
// chat.vue 是巨大的 <script setup> SFC，含大量只有真機/瀏覽器 runtime 才有
// 的全域依賴，無法在 vitest 下直接 mount，沿用 mobile 既有 source-text
// slicing 慣例鎖定行為契約。
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')
const readChat = () => fs.readFileSync(path.join(root, 'src/pages/canvas/canvas.vue'), 'utf8')

const sliceBetween = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('desktop chat.vue · 重新生成誤觸保護', () => {
  // 入口從常駐工具列搬到訊息選單（手機長按、桌機三個點呼出同一份），
  // 但「重新生成前先確認」這條不變：那是破壞性操作。
  it('訊息選單的「重說」走 confirmReiteration，不直接呼叫 doReiteration', () => {
    const chat = readChat()
    const pick = sliceBetween(chat, 'function onMenuPick(key: string)', 'function onMessageAction')

    expect(pick).toContain('confirmReiteration(index)')
    expect(pick).not.toContain('doReiteration(index)')
  })

  it('confirmReiteration 用專案既有的 Modal.confirm（ant-design-vue，非 uni.showModal），確認後才呼叫 doReiteration', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function confirmReiteration(index)', 'const doReiteration = (index) => {')

    expect(fn).toContain('Modal.confirm(')
    expect(fn).toContain("t('chat.regenerateConfirmation')")
    expect(fn).toMatch(/onOk\(\)\s*\{[\s\S]*doReiteration\(index\)/)
  })

  it('取消不產生任何副作用：confirmReiteration 只在 onOk 裡呼叫 doReiteration，onCancel 是空操作', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function confirmReiteration(index)', 'const doReiteration = (index) => {')

    expect(fn).toMatch(/onCancel\(\)\s*\{\s*\}/)
    // Modal.confirm 呼叫本身之前不應該有任何 talkList / send 副作用
    const beforeModalConfirm = fn.slice(0, fn.indexOf('Modal.confirm('))
    expect(beforeModalConfirm).not.toContain('talkList.value')
    expect(beforeModalConfirm).not.toContain('send()')
  })

  it('回歸：失敗態重試 CTA（onSystemMsgCta 的 retry 分支）維持不加確認，仍直接呼叫 doReiteration', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function onSystemMsgCta(action, item, index)', 'function backwardStorageKey')

    expect(fn).toMatch(/action === 'retry'[\s\S]*doReiteration\(index\)/)
    expect(fn).not.toContain('confirmReiteration(index)')
  })

  it('五語 locale 都有 chat.regenerateConfirmation key', () => {
    const files = ['en.json', 'zh-Hant.json', 'zh-Hans.json', 'ja.json', 'ko.json']
    files.forEach((file) => {
      const content = fs.readFileSync(path.join(root, 'src/locale', file), 'utf8')
      expect(content).toContain('"chat.regenerateConfirmation"')
    })
  })
})
