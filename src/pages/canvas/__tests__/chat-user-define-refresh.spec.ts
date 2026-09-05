import { describe, expect, it } from 'vitest'

import {
  applyPendingUserDefineRefresh,
  createPendingUserDefineRefresh,
  parsePendingUserDefineRefresh,
} from '../chat-user-define-refresh'

describe('chat model selection return refresh', () => {
  it('immediately projects the saved model payload while the background refresh is in flight', () => {
    const raw = createPendingUserDefineRefresh({
      roleId: 'role-a',
      selectModel: 'BaseBot',
      selectModelName: 'BaseBot',
      thinkingDepth: '',
      context: 2,
      autoCompactEnabled: true,
      showThinkingProcess: false,
    }, 1_000)

    const pending = parsePendingUserDefineRefresh(raw, 1_500)
    const target = {
      roleId: 'role-a',
      selectModel: 'relay-claude-sonnet-4-5',
      selectModelName: 'relay-claude-sonnet-4-5',
      thinkingDepth: 'high',
      context: 1,
      autoCompactEnabled: false,
      showThinkingProcess: true,
    }

    expect(applyPendingUserDefineRefresh(target, pending, 'role-a')).toBe(true)
    expect(target).toMatchObject({
      selectModel: 'BaseBot',
      selectModelName: 'BaseBot',
      thinkingDepth: '',
      context: 2,
      autoCompactEnabled: true,
      showThinkingProcess: false,
    })
  })

  it('rejects stale or cross-role payloads without changing the active chat', () => {
    const raw = createPendingUserDefineRefresh({
      roleId: 'role-a',
      selectModel: 'BaseBot',
      selectModelName: 'BaseBot',
    }, 1_000)
    const target = { roleId: 'role-b', selectModel: 'paid-model' }

    expect(parsePendingUserDefineRefresh(raw, 12_000)).toBeNull()

    const fresh = parsePendingUserDefineRefresh(raw, 2_000)
    expect(applyPendingUserDefineRefresh(target, fresh, 'role-b')).toBe(false)
    expect(target.selectModel).toBe('paid-model')
  })

  // 語音是 chatSetting 存檔後聊天頁唯一「看得出來有沒有更新」的欄位——播放鈕
  // 的顯示條件直接讀 formData.roleSpeech。它不在投影名單裡的話，回到聊天頁的
  // 那一瞬間鈕還是舊的；更糟的是取消語音那條：背景重讀的 getUserDefine 對空
  // 值有截斷（見 UserDefine.voice-reread.spec.js），空值永遠追不回來。
  it('projects the voice settings so the chat bubble control reflects the save immediately', () => {
    const raw = createPendingUserDefineRefresh({
      roleId: 'role-a',
      roleSpeech: 'preset-female-mature',
      speechSpeed: 1.2,
    }, 1_000)

    const pending = parsePendingUserDefineRefresh(raw, 1_500)
    const target = { roleId: 'role-a', roleSpeech: '', speechSpeed: 1 }

    expect(applyPendingUserDefineRefresh(target, pending, 'role-a')).toBe(true)
    expect(target).toMatchObject({ roleSpeech: 'preset-female-mature', speechSpeed: 1.2 })
  })

  it('projects a cleared voice as cleared instead of leaving the old one behind', () => {
    const raw = createPendingUserDefineRefresh({
      roleId: 'role-a',
      roleSpeech: '',
      speechSpeed: 1,
    }, 1_000)

    const pending = parsePendingUserDefineRefresh(raw, 1_500)
    const target = { roleId: 'role-a', roleSpeech: 'preset-female-mature', speechSpeed: 1.2 }

    expect(applyPendingUserDefineRefresh(target, pending, 'role-a')).toBe(true)
    expect(target.roleSpeech).toBe('')
  })

  it('keeps the legacy timestamp-only marker compatible as a refetch signal', () => {
    const pending = parsePendingUserDefineRefresh('1000', 1_500)

    expect(pending).toEqual({ ts: 1_000 })
    expect(applyPendingUserDefineRefresh({}, pending, 'role-a')).toBe(false)
  })
})
