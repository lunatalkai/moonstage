import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
  Agent 暫停（進度已保留）之後，訊息底下的系統氣泡與輸入區那顆鍵做的必須是同一件事：
  把那一輪接著跑（retry_generation + 續跑來源），不是在回覆後面接著寫。

  owner 2026-09-04 回報：暫停後氣泡彈「繼續說」，按了伺服器回「還有沒完成的操作」。
*/
const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')

function slice(start: string, end: string): string {
  const a = vue.indexOf(start)
  expect(a, `找不到 ${start}`).toBeGreaterThan(-1)
  const b = vue.indexOf(end, a + start.length)
  expect(b, `找不到 ${end}`).toBeGreaterThan(-1)
  return vue.slice(a, b)
}

describe('Agent 暫停後的「繼續」', () => {
  it('輸入區那顆鍵與系統氣泡走同一個續跑函式', () => {
    const helper = slice('function resumeAgentOperation(): boolean {', 'function onActionBtnClick() {')
    expect(helper).toContain('findResumableAgentOperation(unref(knownOperations))')
    expect(helper).toContain("requestedOperationKindOverride = 'retry_generation'")
    expect(helper).toContain('resumeFromOperationIdOverride = target.operationId')
    const btn = slice('function onActionBtnClick() {', 'function sendStop() {')
    expect(btn).toMatch(/if \(state === 'continue'\) \{\s*resumeAgentOperation\(\);\s*return;/)
    const cta = slice('function onSystemMsgCta(action, item, index) {', '// Old history has no operation lineage.')
    expect(cta).toContain("(action === 'continue' || action === 'retry_continue') && resumeAgentOperation()")
  })

  it('有可續跑的那一輪時，氣泡上的字是「繼續（接著跑）」而不是「繼續說」', () => {
    const label = slice('function getSystemMsgCtaLabel(', 'function getSystemMsgCta(')
    expect(label).toContain("findResumableAgentOperation(unref(knownOperations))) return t('multiPass.continueAction')")
    expect(label).toContain("t('chat.say_continue')")
  })
})
