import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 工單 #41-F1-4：刪除通用「繼續說」入口（desktop）
//
// 產品理由：繼續的合法語意=「沒說完接著說」，已由截斷/停止情境卡（length /
// context_overflow / pause_turn → SystemMsg CTA「繼續」)承載。通用按鈕
// （AI 訊息 action-buttons 工具列）語意含糊，且是 contine 旗標污染鏈的暴露
// 面之一，owner 定案移除。desktop 的長按選單（bubbleBoxItems）本來就沒有
// 通用「繼續」項，不需要動。
//
// 保留：doContinue(item, index) 函式本身（SystemMsg CTA 還在用）、onSystemMsgCta 的
// 'continue' 分支、getSystemMsgCta 對 chat.say_continue 文案 key 的引用。
const root = process.cwd()
const readChat = () => fs.readFileSync(path.join(root, 'src/pages/canvas/canvas.vue'), 'utf8')

describe('刪除通用「繼續說」入口（工單 #41-F1-4 · desktop）', () => {
  it('AI 訊息 action-buttons 工具列不再有通用「繼續」按鈕', () => {
    const chat = readChat()
    // 動作入口在訊息選單裡（兩端同一份清單，只有呼出方式不同）。
    const barStart = chat.indexOf('const menuActions = computed')
    expect(barStart).toBeGreaterThanOrEqual(0)
    const barEnd = chat.indexOf('function openMessageMenu', barStart)
    const bar = chat.slice(barStart, barEnd)

    // 測試語義變更（重新生成誤觸保護工單）：舊預期是 action-buttons 工具列的
    // 「重說」按鈕直接呼叫 doReiteration(index)；新預期是先過
    // confirmReiteration(index) 二次確認（Modal.confirm）再呼叫 doReiteration，
    // 原因見 src/__tests__/regenerate-confirm-guard.spec.ts。
    //
    // 測試語義再變更（訊息動作列，owner 2026-09-04）：重新生成不再住在「⋯」清單裡，
    // 而是常駐在每則最新 AI 氣泡底下那一列（canvas-message.vue 的
    // [data-lt="message-regenerate"]，送 action 'rewrite'），由 onMenuPick 的
    // 'rewrite' 分支接到 confirmReiteration。此處驗證「重新生成入口仍在、
    // 通用繼續按鈕仍不存在」；「繼續」只在那一輪沒收尾時出現（canContinueFromIndex）。
    const messageRow = fs.readFileSync(path.join(root, 'src/pages/canvas/components/canvas-message.vue'), 'utf8')
    expect(messageRow).toContain('data-lt="message-regenerate"')
    expect(messageRow).toContain("$emit('action', 'rewrite')")
    const pickStart = chat.indexOf('function onMenuPick')
    const pick = chat.slice(pickStart, chat.indexOf('function onMessageAction', pickStart))
    expect(pick).toMatch(/case 'rewrite':[\s\S]*confirmReiteration\(index\)/)
    expect(bar).not.toContain("t('chat.say_continue')")
    expect(bar).toContain('canContinueFromIndex(index)')
  })

  it('doContinue(item, index) 函式本身保留（SystemMsg 截斷情境卡的「繼續」CTA 還在用）', () => {
    const chat = readChat()

    expect(chat).toContain('const doContinue = (item, index) =>')
    expect(chat).toMatch(/function onSystemMsgCta\(action, item, index\)\s*\{[\s\S]*action === 'continue'[\s\S]*doContinue\(item, index\)/)
  })
})
