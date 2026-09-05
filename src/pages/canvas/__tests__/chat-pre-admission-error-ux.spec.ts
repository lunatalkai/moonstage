import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const chat = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')

describe('pre-admission chat error UX', () => {
  it('surfaces the exact application error once as a persistent bubble', () => {
    expect(chat).toContain('function appendChatErrorBubble(')
    expect(chat).toContain('resolveChatErrorPresentation(errorType, t)')

    const start = chat.indexOf('function settleConfirmedPreAdmissionFailure(')
    const end = chat.indexOf('function settleFrozenLegacyStreamError(', start)
    const settle = chat.slice(start, end)
    expect(settle).toContain(
      'appendChatErrorBubble(errorType, errorMessage, operationProjection)',
    )
    expect(settle).not.toContain('message.error(errorMessage)')
  })

  it('does not emit a generic draft warning before the exact error bubble', () => {
    expect(chat).toContain('recoverPendingChatTurnBeforeAccepted(false)')
    expect(chat).not.toContain('💎 立即充值')
    expect(chat).not.toContain('class="msg-error-cta"')
  })

  it('renders typed zero-output errors only through the existing SystemMessage bubble', () => {
    expect(chat).toContain("'insufficient_credits': 'quota'")
    expect(chat).toContain("'quota_exhausted': 'quota'")
    expect(chat).toContain('systemOnly: true')
    // 開放客戶端沒有付費端點（docs/open-api-v1.md），所以餘額不足只留誠實的
    // 錯誤卡：kind／標題照舊，副標說清楚該去哪處理，不再給導購 CTA——按了會落空。
    expect(chat).toContain("'insufficient_credits': t('chat.manageOnLunaTalk')")
    expect(chat).toContain("'quota_exhausted':  t('chat.manageOnLunaTalk')")
    expect(chat).not.toContain("'open_vip'")
    expect(chat).not.toContain("'open_checkin'")
    expect(chat).toContain("!['resume_unavailable', 'compact_no_input'].includes(item.finishReason)")
    expect(chat).toContain('removeOrphanPlaceholder();')
    expect(fs.readFileSync(path.resolve(__dirname, '../components/canvas-message.vue'), 'utf8')).toContain('<ChatTypingIndicator')
    // 等回覆的那一列由狀態旗標驅動指示器，不是另外一顆載入動畫元件。
    expect(chat).toContain('loading: !!item.chatLoading')
    expect(chat).not.toContain('fui-load-ani')
  })
})
