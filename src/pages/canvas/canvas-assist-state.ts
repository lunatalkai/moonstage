/**
 * 幫答（.ai-assistant）的「換一句」判斷。
 *
 * 伺服器把這一輪生成過的那句留著（owner 2026-09-04）：不帶 regenerate 就拿回同一句、
 * 不扣點；帶 regenerate 才重新生成並扣點。前端要分辨的只有一件事——輸入框此刻是不是
 * 正裝著上一次幫答填進去、玩家沒改過的那句：
 *   - 是 → 玩家看著那句又按燈泡＝不滿意想換 → regenerate:true
 *   - 不是（輸入框空、玩家自己的字、改過的幫答）→ regenerate:false
 *
 * 抽成純函數是為了能直接測；canvas.vue 只負責記住上一次填進去的那句。
 */

/** 只剝首尾空白：玩家在句子裡改一個字就算他的字了，但 textarea 尾端的換行不算改。 */
function normalize(text: string): string {
  return typeof text === 'string' ? text.trim() : ''
}

export function shouldRegenerateAssist(composerContent: string, lastAssistReply: string): boolean {
  const last = normalize(lastAssistReply)
  if (!last) return false
  return normalize(composerContent) === last
}

export type AssistLabelKey = 'canvas.assist.tip' | 'canvas.assist.another'

export function assistLabelKey(composerContent: string, lastAssistReply: string): AssistLabelKey {
  return shouldRegenerateAssist(composerContent, lastAssistReply) ? 'canvas.assist.another' : 'canvas.assist.tip'
}
