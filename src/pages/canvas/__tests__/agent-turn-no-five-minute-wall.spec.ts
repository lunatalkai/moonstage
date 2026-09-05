import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  createPendingStreamEntry,
  decideStreamResume,
  markStreamEntryAccepted,
  mergeOperationStatusIntoStreamEntry,
  mergeStreamMetaIntoPendingEntry,
  isChatOperationVisibleOutcomeExpired,
  normalizeChatOperationStatus,
  resolveAgentTurnForOwnership,
} from '../chat-transport-ownership'

const OWNERSHIP_SRC = readFileSync(
  resolve(__dirname, '../chat-transport-ownership.ts'),
  'utf8',
)

const CHAT_VUE = readFileSync(
  resolve(__dirname, '../canvas.vue'),
  'utf8',
)

// 五分鐘那條上界是給普通 one-shot 的：送出去五分鐘還沒有可見結果，繼續扣著
// 使用者更糟，所以誠實放手。
//
// Agent 一輪打三到五次模型，跑六分鐘、十分鐘都是正常的。同一條上界套上去，
// 使用者看到的是「還在跑的那一輪突然消失」，而後端其實好好的——而且基準優先
// 用伺服器的 acceptedAt，所以重整回來只要已經超過五分鐘就當場放手。
describe('agent 輪次不套 one-shot 的五分鐘上界', () => {
  const acceptedAt = Date.parse('2026-08-09T12:00:00Z')
  const sixMinutesLater = acceptedAt + 6 * 60 * 1000

  it('普通輪次超過五分鐘仍然放手', () => {
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt,
      now: sixMinutesLater,
    })).toBe(true)
  })

  it('agent 輪次不因總年齡到期', () => {
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt,
      now: sixMinutesLater,
      agentTurn: true,
    })).toBe(false)
  })

  it('agentTurn 不是 true 的一律照舊', () => {
    for (const agentTurn of [undefined, false]) {
      expect(isChatOperationVisibleOutcomeExpired({
        acceptedAt,
        now: sixMinutesLater,
        agentTurn,
      })).toBe(true)
    }
  })
})

// 伺服器把這一輪被接受當下凍結的模式投影出來。舊伺服器不帶這個欄位，
// 必須留 undefined 讓呼叫端退回本地判斷——當成 false 的話，冷啟動之後
// agent 輪次又會被套上五分鐘上界。
describe('operation status 帶回權威的 agentTurn', () => {
  const base = {
    schemaVersion: 'outcome_v1',
    operation: { operationId: 'operation-1', state: 'accepted', kind: 'send' },
  }

  it('伺服器說 true 就是 true', () => {
    const status = normalizeChatOperationStatus({
      ...base,
      operation: { ...base.operation, agentTurn: true },
    })
    expect(status?.agentTurn).toBe(true)
  })

  it('伺服器說 false 就是 false', () => {
    const status = normalizeChatOperationStatus({
      ...base,
      operation: { ...base.operation, agentTurn: false },
    })
    expect(status?.agentTurn).toBe(false)
  })

  it('舊伺服器沒帶就留 undefined，不得當成 false', () => {
    const status = normalizeChatOperationStatus(base)
    expect(status?.agentTurn).toBeUndefined()
  })
})

// 判斷函式正確沒有用——真正會讓 bug 活下來的是呼叫端沒把 agentTurn 傳進去。
// 那種漏法是靜默的：沒有錯誤、沒有日誌，只是上界照樣生效。
describe('呼叫端必須真的把 agentTurn 傳進判斷', () => {
  it('每一處 isChatOperationVisibleOutcomeExpired 都帶 agentTurn', () => {
    const calls = CHAT_VUE.split('isChatOperationVisibleOutcomeExpired({').slice(1)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.slice(0, call.indexOf('})'))).toContain('agentTurn:')
    }
  })

  it('五分鐘的安撫放棄計時器不套在 agent 上', () => {
    const enterSlowWait = CHAT_VUE.slice(
      CHAT_VUE.indexOf('function enterSlowWait('),
      CHAT_VUE.indexOf('function exitSlowWait('),
    )
    expect(enterSlowWait).toContain('SLOW_WAIT_GIVE_UP_MS')
    expect(enterSlowWait).toContain('resolveAgentTurnForOwnership')
  })
})

// 伺服器的 agentTurn 是 **dispatch 階段**才寫進 billingSnapshot 的
// （router/chat_operation_lifecycle.go：「Agent mode is a dispatch-stage fact」）。
// 也就是說 state=accepted 的整個準備階段——正好是這個 bug 唯一發生的窗口——
// 伺服器一律回 false。
//
// 所以它只能當**正向補充訊號**：任何一邊說 true 就是 true，伺服器的 false
// 不得覆蓋本地已知的事實。寫成「伺服器優先」的話，修法在關鍵窗口整段失效。
describe('agentTurn 的判定：任一來源說 true 就是 true', () => {
  it('伺服器說 true', () => {
    expect(resolveAgentTurnForOwnership({ status: { agentTurn: true } })).toBe(true)
  })

  it('本機說 true，伺服器還沒到 dispatch 所以說 false —— 仍然是 true', () => {
    expect(resolveAgentTurnForOwnership({
      status: { agentTurn: false },
      localAgentTurn: true,
    })).toBe(true)
  })

  it('持久化的那一筆說 true（重整之後唯一還在的事實）', () => {
    expect(resolveAgentTurnForOwnership({ entry: { agentTurn: true } })).toBe(true)
  })

  it('三個來源都沒說 true 才是 false', () => {
    expect(resolveAgentTurnForOwnership({})).toBe(false)
    expect(resolveAgentTurnForOwnership({
      status: { agentTurn: false },
      entry: { agentTurn: false },
      localAgentTurn: false,
    })).toBe(false)
  })
})

// 重新整理走的是 decideStreamResume,它只看持久化的那一筆。這條路上的 expired
// 判定先前完全沒有 agent 分流,而消費端拿到 expired 就直接釋放 ownership、
// 不做任何權威核對——「刷新回來 agent 就停了」正是從這裡過去的。
describe('掛載/重整那條路也要分流', () => {
  const old = Date.now() - 6 * 60 * 1000
  const payload = {
    conversationId: 'conversation-1',
    accountId: 'account-1',
    message: 'hi',
    model: 'claude',
    clientOperationId: 'client-operation-1',
    supportsOperationOutcome: true,
  }

  it('agent 的殘留紀錄不判過期', () => {
    const decision: any = decideStreamResume(
      { ...createPendingStreamEntry(payload, old), agentTurn: true },
      Date.now(),
    )
    expect(decision?.kind).toBe('byClientOperationId')
    expect(decision.expired).toBe(false)
  })

  it('普通輪次的殘留紀錄照舊判過期', () => {
    const decision: any = decideStreamResume(
      createPendingStreamEntry(payload, old),
      Date.now(),
    )
    expect(decision?.kind).toBe('byClientOperationId')
    expect(decision.expired).toBe(true)
  })
})

// 呼叫端契約的掃描面要涵蓋兩個檔案。先前只掃 chat.vue,於是
// chat-transport-ownership.ts 裡那三處漏帶 agentTurn 的呼叫從縫裡過去了。
describe('呼叫端契約:兩個檔案都要掃', () => {
  it('chat-transport-ownership.ts 裡的呼叫也都帶 agentTurn', () => {
    const calls = OWNERSHIP_SRC.split('isChatOperationVisibleOutcomeExpired({').slice(1)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.slice(0, call.indexOf('})'))).toContain('agentTurn')
    }
  })
})

// 送出當下是唯一知道「這一輪是 agent」的時刻,而重整之後只剩持久化那一筆。
// 沒把它寫進去,掛載路徑就永遠無從得知。
describe('送出時要把 agentTurn 持久化', () => {
  it('寫入 LS 的那一筆帶著 agentTurn', () => {
    expect(CHAT_VUE).toMatch(/writeLsEntry\(\{[\s\S]{0,200}agentTurn/)
  })
})

// 送出後一秒內這一筆就會被 accepted／streamMeta／operation status 依序改寫。
// 那幾支是用白名單**重建**物件的，不是 `...current` 展開——agentTurn 只要
// 沒被逐一帶過去就會在這裡靜默消失，而重整之後它是掛載路徑唯一的依據。
//
// 這條是瀏覽器實測抓到的：LS 裡的 entry 確實沒有 agentTurn，因為
// markStreamEntryAccepted 把它丟了。純函式測試看不到，因為它們沒走這條轉換。
describe('agentTurn 必須撐過整條 entry 改寫鏈', () => {
  const seed = () => ({
    ...createPendingStreamEntry({
      conversationId: 'conversation-1',
      accountId: 'account-1',
      message: 'hi',
      model: 'claude',
      clientOperationId: 'client-operation-1',
      supportsOperationOutcome: true,
    }, Date.now()),
    agentTurn: true,
  })

  it('markStreamEntryAccepted 之後還在', () => {
    const next: any = markStreamEntryAccepted(seed(), {
      streamId: 'stream-1', lastEventId: 3, now: Date.now(),
    })
    expect(next.agentTurn).toBe(true)
  })

  it('mergeStreamMetaIntoPendingEntry 之後還在', () => {
    const next: any = mergeStreamMetaIntoPendingEntry(seed(), {
      streamId: 'stream-1', lastEventId: 1, now: Date.now(),
    })
    expect(next.agentTurn).toBe(true)
  })

  it('mergeOperationStatusIntoStreamEntry 之後還在（伺服器說 false 也不得覆蓋）', () => {
    const next: any = mergeOperationStatusIntoStreamEntry(seed(), {
      schemaVersion: 'outcome_v1',
      operation: {
        operationId: 'operation-1',
        state: 'accepted',
        kind: 'send',
        agentTurn: false,
      },
    }, Date.now())
    expect(next.agentTurn).toBe(true)
  })

  it('普通輪次不會因為這條鏈莫名變成 agent', () => {
    const plain = createPendingStreamEntry({
      conversationId: 'conversation-1',
      accountId: 'account-1',
      message: 'hi',
      model: 'claude',
      clientOperationId: 'client-operation-1',
      supportsOperationOutcome: true,
    }, Date.now())
    const next: any = markStreamEntryAccepted(plain, {
      streamId: 'stream-1', lastEventId: 3, now: Date.now(),
    })
    expect(next.agentTurn).not.toBe(true)
  })
})
