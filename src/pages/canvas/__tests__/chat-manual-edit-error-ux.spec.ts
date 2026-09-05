import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/*
  手動編輯一則 AI 回覆失敗時，玩家看到的是什麼。

  這一支原本橫跨兩個檔：編輯在另一個頁面上做完，再把結果派回這一頁。那個頁面
  沒有了——編輯就在訊息選單裡做完（`onMenuConfirmEdit` → `sureRewrite`），
  所以守的東西全部收在這一頁裡。要守的事情本身沒變：
  失敗要變成一則說得出原因的系統訊息，不能把伺服器的原文丟給玩家看；
  送出中不能再送第二次。
*/
const chatSource = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')

function sourceBetween(source: string, start: string, end: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return source.slice(from, to)
}

describe('manual AI edit failure UX', () => {
  it('projects typed target failures into one SystemMessage and never exposes the raw server error', () => {
    const sureRewrite = sourceBetween(chatSource, 'const sureRewrite', '// 重新生成誤觸保護')

    expect(sureRewrite).toContain('manualEditSubmitting')
    expect(sureRewrite).toContain('errorCode')
    expect(sureRewrite).toContain('resolveChatErrorTypeFromFailure')
    expect(sureRewrite).toContain('appendChatErrorBubble')
    expect(sureRewrite).not.toContain('message.error(res.data.error)')
  })

  it('offers a refresh-history CTA for stale or replaced targets', () => {
    expect(chatSource).toContain("'rewrite_target_not_latest': 'model-error'")
    expect(chatSource).toContain("'rewrite_target_invalid': 'model-error'")
    expect(chatSource).toContain("action === 'refresh_history'")
    expect(chatSource).toContain("return 'refresh_history'")
  })

  it('prevents double submission — the guard lives with the only editor there is now', () => {
    expect(chatSource).toContain('const manualEditSubmitting = ref(false)')
    const sureRewrite = sourceBetween(chatSource, 'const sureRewrite', '// 重新生成誤觸保護')
    expect(sureRewrite).toContain('if (manualEditSubmitting.value) return;')
    expect(sureRewrite).toContain('manualEditSubmitting.value = true;')
    expect(sureRewrite).toContain('manualEditSubmitting.value = false;')
  })

  it('編輯與重寫都在訊息選單裡完成，不再換頁', () => {
    expect(chatSource).not.toContain('pages/chat/rewrite')
    expect(chatSource).not.toContain("uni.$on('handRewrite'")
    expect(chatSource).toContain('function onMenuConfirmEdit()')
  })
})
