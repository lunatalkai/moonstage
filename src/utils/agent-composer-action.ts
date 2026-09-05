/**
 * 輸入框底下那顆按鈕該是什麼。
 *
 * 產品邊界（owner 2026-08-08）：**agent 沒收尾時，底下沒有「發送」。**
 * 跑著是停止，暫停是繼續。上一輪還沒結束就送新訊息，在 agent 模式下是沒有意義的
 * 操作——而「繼續」不帶輸入框的字，它只是讓那一輪跑完。
 *
 * 放棄不在這裡：使用者按停止之後不按繼續、改用既有的「回溯」把那一輪拿掉，
 * 就恢復成一般發送。刻意不新增放棄鍵——放棄用的是既有功能。
 */
export type AgentComposerAction = 'send' | 'stop' | 'continue'

interface AgentOperationLike {
  operationId?: string
  reasonCode?: string
  sourceChatId?: string
}

interface ChatRowLike {
  type?: number
  id?: string | number
  chatId?: string | number
  content?: string
}

export interface AgentResumeTarget {
  operationId: string
  chatId: string
  message: string
}

/**
 * 伺服器對「中斷但進度已保留」的原因碼。
 *
 * 只有這個碼代表「有東西可以續」。其他 pre-provider 失敗沒有東西可續，硬給
 * 繼續鍵會讓使用者按下去拿到一份空的斷點——按了沒反應比沒有按鈕更糟。
 */
const AGENT_PROGRESS_PRESERVED = 'agent_progress_preserved'

/**
 * 找出可以續跑的那一輪。
 *
 * **只看最後一輪，不往回找。**
 *
 * 中斷的那一輪一定是最後一輪——它沒收尾，後面不會再有新的輪次。反過來說，
 * 如果它後面還有別的輪次，代表這段對話已經往前走了，那一輪的斷點就不再適用。
 *
 * 第一版是往回掃整段歷史，只要找到任何一個就回傳。線上回歸（owner 2026-08-08
 * 回報）：一段用過 agent 的對話裡，中斷過的舊輪次會越積越多，於是按鈕**永遠**
 * 卡在「繼續」——使用者打字送出時走的是續跑舊操作的路徑，沒有準備流水帳、
 * 沒有結果，按停止還把訊息一起帶走。
 */
export function findResumableAgentOperation<T extends AgentOperationLike>(
  operations: T[] | undefined,
): T | undefined {
  if (!Array.isArray(operations) || operations.length === 0) return undefined
  const last = operations[operations.length - 1]
  if (last && last.reasonCode === AGENT_PROGRESS_PRESERVED) return last
  return undefined
}

export function resolveAgentComposerAction(input: {
  streamActive?: boolean
  operations?: AgentOperationLike[]
}): AgentComposerAction {
  // 生成中優先：同時成立時使用者要的是停止，不是繼續一個已經在跑的東西。
  if (input && input.streamActive) return 'stop'
  if (findResumableAgentOperation(input && input.operations)) return 'continue'
  return 'send'
}

/**
 * 續跑要指向哪一則。
 *
 * 「繼續」不是送新訊息，是把同一輪跑完，所以它重用**那則還沒被回答的使用者
 * 訊息**——伺服器的 retry_generation 契約正是這個語意，而它的相容舊投影是
 * rewrite=true。少了目標，整輪會在准入被擋掉：連線兩百多毫秒就關，畫面上
 * 只剩一個永遠不動的「正在回覆」（owner 2026-08-08 在 mobile 實測）。
 *
 * 目標優先用伺服器給的來源訊息；沒有就退回畫面上最後那則使用者訊息（既有的
 * 重試路徑用的就是它）。兩邊都湊不出來就不要送——寧可按鈕沒反應，也不要
 * 假裝在跑。
 */
export function resolveAgentResumeTarget(
  operation: AgentOperationLike | undefined,
  talkList: ChatRowLike[] | undefined,
): AgentResumeTarget | undefined {
  if (!operation || !operation.operationId) return undefined
  let chatId = String(operation.sourceChatId == null ? '' : operation.sourceChatId).trim()
  let message = ''
  if (Array.isArray(talkList)) {
    for (let i = talkList.length - 1; i >= 0; i--) {
      const row = talkList[i]
      if (!row || row.type !== 1) continue
      if (!chatId) chatId = String(row.chatId || row.id || '').trim()
      message = String(row.content == null ? '' : row.content)
      break
    }
  }
  if (!chatId) return undefined
  return { operationId: operation.operationId, chatId, message }
}
