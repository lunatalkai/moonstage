/**
 * 殼裡的面板與訊息選單：用標準播放器的元件（canvas-popup／canvas-persona／…／canvas-message-menu）畫，
 * 資料由宿主的 panels 訊息送來、面板上的事件用 panel.ui 交回宿主做。一般卡與沙箱卡的面板長得一樣，
 * 作者對面板寫的美化兩邊都套得上。模型選擇不在這裡（留在宿主）。
 *
 * 面板裡可以打字的欄位（草稿、編輯中的字、分享碼）由殼自己持有一份：每個字都往返宿主一趟會讓游標亂跳。
 * 宿主送來的值跟上次送出去的一樣就當回音、留殼裡那份；不一樣（宿主清掉了、換了內容）就採宿主的。
 */
import { createApp, h, reactive, type App, type Component } from 'vue'
import CanvasPopup from '@/pages/canvas/components/canvas-popup.vue'
import CanvasMessageMenu from '@/pages/canvas/components/canvas-message-menu.vue'
import CanvasConversationList from '@/pages/canvas/components/canvas-conversation-list.vue'
import CanvasModify from '@/pages/canvas/components/canvas-modify.vue'
import CanvasPersona from '@/pages/canvas/components/canvas-persona.vue'
import CanvasDirectives from '@/pages/canvas/components/canvas-directives.vue'
import CanvasNotepad from '@/pages/canvas/components/canvas-notepad.vue'
import CanvasContextBreakdown from '@/pages/canvas/components/canvas-context-breakdown.vue'
import CanvasMemory from '@/pages/canvas/components/canvas-memory.vue'
import CanvasConfirm from '@/pages/canvas/components/canvas-confirm.vue'
import type { PanelsState } from '../protocol'

const COMPONENTS: Record<string, Component> = {
  conversations: CanvasConversationList,
  background: CanvasModify,
  font: CanvasModify,
  persona: CanvasPersona,
  directives: CanvasDirectives,
  notepad: CanvasNotepad,
  'context-breakdown': CanvasContextBreakdown,
  memory: CanvasMemory,
  confirm: CanvasConfirm,
}

/** 各面板會發的事件（跟元件的 defineEmits 一致），全部轉給宿主。 */
const EVENTS: Record<string, string[]> = {
  conversations: ['pick', 'rename', 'delete', 'new', 'close'],
  background: ['pick'],
  font: ['pick'],
  persona: ['save', 'close'],
  directives: ['add', 'edit', 'save-edit', 'cancel-edit', 'ask-delete', 'confirm-delete', 'cancel-delete', 'retry', 'close', 'update:draft', 'update:editing-text'],
  notepad: ['save', 'retry', 'close', 'toggle-templates', 'apply-template', 'save-template', 'update:code', 'preview-code', 'cancel-preview', 'confirm-import', 'share-template', 'delete-template', 'copy-share-code', 'revoke-share', 'close-share', 'toggle-copy', 'copy-from', 'update:draft'],
  'context-breakdown': ['close', 'retry', 'select', 'toggle-mod-details'],
  memory: ['close', 'retry', 'delete', 'toggle-expand'],
  confirm: ['ok', 'cancel'],
}

/** 殼自己持有的可打字欄位：事件名 → 屬性名。 */
const LOCAL_FIELDS: Record<string, string> = { 'update:draft': 'draft', 'update:editing-text': 'editingText', 'update:code': 'code' }

const emitKey = (event: string) => 'on' + event.split(/[:-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')

export interface PanelsDeps {
  mount: HTMLElement
  send(panel: string, event: string, args: unknown[]): void
}

export interface PanelsController {
  set(state: PanelsState): void
  unmount(): void
}

const EMPTY: PanelsState = { sheet: '', title: '', closeLabel: '', props: {}, menu: { open: false, editing: false, draft: '', message: null, actions: [], labels: { cancel: 'Cancel', confirm: 'OK' }, anchor: null } }

export function createPanels(deps: PanelsDeps): PanelsController {
  const state = reactive<{ current: PanelsState }>({ current: EMPTY })
  const drafts = reactive<Record<string, string>>({})
  const lastSent: Record<string, string> = {}
  const menuDraft = reactive<{ value: string | null; lastSent: string | null }>({ value: null, lastSent: null })

  const handlersFor = (sheet: string) => {
    const out: Record<string, unknown> = {}
    for (const ev of EVENTS[sheet] || []) {
      out[emitKey(ev)] = (...args: unknown[]) => {
        const field = LOCAL_FIELDS[ev]
        if (field) { drafts[`${sheet}.${field}`] = String(args[0] ?? ''); lastSent[`${sheet}.${field}`] = String(args[0] ?? '') }
        deps.send(sheet, ev, args)
      }
    }
    return out
  }

  const propsFor = (sheet: string) => {
    const base = { ...(state.current.props || {}) }
    for (const key of Object.keys(drafts)) {
      const [s, field] = key.split('.')
      if (s === sheet) base[field] = drafts[key]
    }
    return base
  }

  const app: App = createApp({
    render: () => {
      const cur = state.current
      const sheet = cur.sheet
      const comp = COMPONENTS[sheet]
      const menu = cur.menu
      const menuNode = h(CanvasMessageMenu as unknown as Parameters<typeof h>[0], {
        open: menu.open, editing: menu.editing, draft: menuDraft.value != null ? menuDraft.value : menu.draft, message: menu.message, actions: menu.actions, labels: menu.labels, anchor: menu.anchor,
        'onUpdate:draft': (v: string) => { menuDraft.value = v; menuDraft.lastSent = v; deps.send('menu', 'update:draft', [v]) },
        onPick: (key: string) => deps.send('menu', 'pick', [key]),
        onClose: () => deps.send('menu', 'close', []),
        onCancelEdit: () => deps.send('menu', 'cancel-edit', []),
        onConfirmEdit: () => deps.send('menu', 'confirm-edit', []),
      } as Record<string, unknown>)
      const popupNode = h(CanvasPopup as unknown as Parameters<typeof h>[0], {
        open: !!comp, title: cur.title, closeLabel: cur.closeLabel, heading: !!cur.heading,
        onClose: () => deps.send('popup', 'close', []),
      } as Record<string, unknown>, comp ? { default: () => h(comp as Parameters<typeof h>[0], { ...propsFor(sheet), ...handlersFor(sheet) } as Record<string, unknown>) } : undefined)
      return [menuNode, popupNode]
    },
  })
  app.config.warnHandler = () => {}
  app.mount(deps.mount)

  return {
    set(next) {
      // 回音判定：宿主的值等於上次送出的就保留殼裡的草稿；不同就採宿主的
      for (const key of Object.keys(drafts)) {
        const [s, field] = key.split('.')
        const hostValue = s === next.sheet ? String((next.props || {})[field] ?? '') : null
        if (hostValue == null || hostValue !== lastSent[key]) { delete drafts[key]; delete lastSent[key] }
      }
      if (menuDraft.value != null && next.menu.draft !== menuDraft.lastSent) { menuDraft.value = null; menuDraft.lastSent = null }
      if (!next.menu.open) { menuDraft.value = null; menuDraft.lastSent = null }
      state.current = next
    },
    unmount() { try { app.unmount() } catch { /* 已經拆掉 */ } },
  }
}
