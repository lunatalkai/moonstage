import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, unref } from 'vue'
import { mount } from '@vue/test-utils'
import CanvasMessage from '../components/canvas-message.vue'
import { contextUsageDisplayForRow } from '../canvas-context-usage'
import { findOperationCandidate } from '../chat-operation-ui-state'
import {
  normalizeChatOperationStatus, shouldApplyOperationStatus,
  mergeOperationStatusIntoStreamEntry, isChatOperationTerminal, projectionFinishReason,
} from '../chat-transport-ownership'

// Execute the actual canvas completion handlers, not a reimplementation of their
// behavior. History stays pending: the new reply must expose usage before reload.
const canvas = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')
const handlers = canvas.slice(canvas.indexOf('function operationKindFromServer('),
  canvas.indexOf('\nfunction ', canvas.indexOf('function handleOperationStatusEvent(') + 1))
const js = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function harness() {
  const row = ref<any>({ id: 'pending-ai', operationBubbleId: 'pending-ai', type: 0,
    content: 'Synthetic reply', chatLoading: true, chatFinish: false })
  const getHistoryMsg = vi.fn(() => new Promise(() => {}))
  const clearStreamState = vi.fn()
  const bindings: Record<string, any> = {
    pendingChatTurn: { aiBubbleId: 'pending-ai', operationId: 'op-1', operationState: 'generating', operationVersion: 1 },
    conversationId: ref('conv-1'), talkList: ref([row.value]), unref,
    normalizeChatOperationStatus, shouldApplyOperationStatus,
    mergeOperationStatusIntoStreamEntry, isChatOperationTerminal, projectionFinishReason,
    findOperationCandidate, readLsEntry: () => null, writeLsEntry: vi.fn(),
    chatTransport: { noteServerStreamProgress: vi.fn() }, STREAM_ENTRY_VERSION: 1,
    hasRenderableAssistantOutput: (body: string) => !!body,
    commitPendingChatOperationAfterVisibleDone: vi.fn(),
    clearStreamCache: vi.fn(), clearStreamState, removeOrphanPlaceholder: vi.fn(),
    closeWebSocket: vi.fn(), bumpConversationGeneration: vi.fn(),
    ajax: ref({ flag: false, page: 2 }), getHistoryMsg,
  }
  for (const key of ['lastFinishReason', 'tempContent', 'replyContent', 'thinkingContent',
    'pendingMessageMeta', 'currentChatId', 'pendingResendPayload', 'isResumeInitial', 'userStopRequested']) {
    bindings[key] = ref('')
  }
  const handle = new Function(...Object.keys(bindings), js + '\nreturn handleOperationStatusEvent;')(...Object.values(bindings))
  const view = mount(defineComponent({ setup() {
    const message = computed(() => ({ id: 'reply', mesid: 1, role: 'ai', name: 'Test', avatar: '',
      html: row.value.content, finished: row.value.chatFinish, latest: true,
      contextUsage: contextUsageDisplayForRow(row.value, null, (key: string) => key) }))
    return () => h(CanvasMessage, { message: message.value as any })
  } }))
  return { handle, view, row, getHistoryMsg, clearStreamState }
}

const terminal = { operationId: 'op-1', conversationId: 'conv-1', kind: 'send',
  state: 'completed', version: 2, assistantChatId: 'reply-1', outputDisposition: 'adopted',
  hasContextUsage: true, model: 'test-model',
  contextUsage: { inputTokens: 200, outputTokens: 30, cachedTokens: 20, cacheWriteTokens: 0 } }

describe('context usage on the newly completed reply', () => {
  it.each(['stream', 'polled', 'wrapped'] as const)('%s completion exposes the button without history or page reload', async (path) => {
    const app = harness()
    expect(app.view.find('[data-lt="context-usage"]').exists()).toBe(false)
    const event = path === 'polled' ? normalizeChatOperationStatus(terminal)
      : path === 'wrapped' ? { schemaVersion: 'outcome_v1', operation: terminal } : terminal
    expect(() => app.handle(event)).not.toThrow()
    await nextTick()
    expect(app.row.value).toMatchObject({ chatFinish: true, chatLoading: false,
      hasContextUsage: true, inputTokens: 200, chatId: 'reply-1', model: 'test-model' })
    const button = app.view.find('[data-lt="context-usage"]')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    expect(app.view.findComponent(CanvasMessage).emitted('action')?.[0]).toEqual(['context-usage'])
    expect(app.clearStreamState).toHaveBeenCalledOnce()
    expect(app.getHistoryMsg).toHaveBeenCalledOnce()
    app.view.unmount()
  })

  it('keeps usage through repeated normalization without inventing missing counts', () => {
    expect(normalizeChatOperationStatus(normalizeChatOperationStatus(terminal))).toMatchObject({
      hasContextUsage: true, model: 'test-model', contextUsage: terminal.contextUsage,
    })
    expect(normalizeChatOperationStatus({ ...terminal, contextUsage: null })?.contextUsage).toBeUndefined()
  })
})
