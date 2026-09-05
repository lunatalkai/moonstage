import { describe, it, expect } from 'vitest'
import { findResumableAgentOperation, resolveAgentComposerAction } from './agent-composer-action'

const resumable = {
  operationId: 'op-1',
  reasonCode: 'agent_progress_preserved',
  assistantChatId: null,
  sourceChatId: 'user-1',
}

describe('findResumableAgentOperation', () => {
  it('認得「中斷但進度已保留」的那一輪', () => {
    expect(findResumableAgentOperation([resumable])?.operationId).toBe('op-1')
  })

  // 其他 pre-provider 失敗沒有東西可續，硬給繼續鍵會讓使用者按下去拿到一份
  // 空的斷點——按了沒反應比沒有按鈕更糟。
  it('不把其他失敗原因當成可續跑', () => {
    expect(findResumableAgentOperation([
      { operationId: 'op-2', reasonCode: 'pre_provider_worldbook' },
    ])).toBeUndefined()
  })

  it('沒有 operations 時回 undefined', () => {
    expect(findResumableAgentOperation(undefined)).toBeUndefined()
    expect(findResumableAgentOperation([])).toBeUndefined()
  })

  // 同一段對話可能有多輪被中斷過。要接的是最後那一輪——早先那些已經被後面的
  // 對話推進蓋過去了，續跑它們會把模型帶回舊的前提。
  it('多輪可續時取最後一輪', () => {
    const older = { ...resumable, operationId: 'op-old' }
    expect(findResumableAgentOperation([older, resumable])?.operationId).toBe('op-1')
  })
})

describe('resolveAgentComposerAction', () => {
  // agent 沒收尾時底下沒有「發送」。跑著只能停止,暫停只能繼續——
  // 上一輪還沒結束就送新訊息,在 agent 模式下是沒有意義的操作。
  it('生成中是停止', () => {
    expect(resolveAgentComposerAction({ streamActive: true, operations: [resumable] })).toBe('stop')
  })

  it('中斷且可續跑時是繼續', () => {
    expect(resolveAgentComposerAction({ streamActive: false, operations: [resumable] })).toBe('continue')
  })

  it('沒有未收尾的輪次時是一般發送', () => {
    expect(resolveAgentComposerAction({ streamActive: false, operations: [] })).toBe('send')
  })

  // 生成中優先於可續跑:同時成立時使用者要的是停止,不是繼續一個已經在跑的東西。
  it('生成中優先於可續跑', () => {
    expect(resolveAgentComposerAction({ streamActive: true, operations: [resumable] })).toBe('stop')
  })
})

describe('findResumableAgentOperation — 只認隊尾', () => {
  // **只有最新那一輪還沒收尾時才給繼續。**
  //
  // 線上回歸(owner 2026-08-08 回報):第一版只要整段歷史裡有任何一個「進度已保留」
  // 的操作就回傳,而一段用過 agent 的對話裡那種舊輪次會越積越多。結果按鈕永遠
  // 卡在「繼續」,使用者打字送出時走的是續跑舊操作的路徑——沒有準備流水帳、
  // 沒有結果、按停止還把訊息一起帶走。
  //
  // 中斷的那一輪一定是最後一輪:它沒收尾,後面不會有新的輪次。所以只看最後一個。
  it('中斷的輪次後面又有新輪次時，不給繼續', () => {
    const older = { operationId: 'op-old', reasonCode: 'agent_progress_preserved' }
    const newer = { operationId: 'op-new', reasonCode: 'temporary_failure' }
    expect(findResumableAgentOperation([older, newer])).toBeUndefined()
  })

  it('中斷的輪次就是最後一輪時，給繼續', () => {
    const older = { operationId: 'op-old', reasonCode: 'temporary_failure' }
    const newest = { operationId: 'op-new', reasonCode: 'agent_progress_preserved' }
    expect(findResumableAgentOperation([older, newest])?.operationId).toBe('op-new')
  })

  // 後面接了一輪正常完成的,更不該給繼續。
  it('後面已經有成功的輪次時，不給繼續', () => {
    expect(findResumableAgentOperation([
      { operationId: 'op-old', reasonCode: 'agent_progress_preserved' },
      { operationId: 'op-done', reasonCode: '' },
    ])).toBeUndefined()
  })
})
