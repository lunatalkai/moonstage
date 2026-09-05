/**
 * 手帳模板的分享碼：貼碼→先看→存進我的模板；產生→複製／停止分享。
 *
 * 跟 mobile 的 NotepadTemplateSheet 是同一份行為（DESIGN.md §5.4）。這一支問的是
 * 玩家貼了碼之後會發生什麼：抄錯一個字當場說得出、對的碼才送出去、預覽與分享碼
 * 兩片各自開得起來、按鈕真的發事件。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import CanvasNotepad from '../components/canvas-notepad.vue'

const LABELS = {
  title: '手帳', subtitle: '', close: '關閉', save: '儲存', loading: '', loadFailed: '', retry: '',
  placeholder: '', waitingConversation: '', costNotice: '', overBy: '',
  templateEntry: '模板', templateApply: '套用', templateEmpty: '還沒有模板', templateUntitled: '未命名',
  templateSaveCurrent: '存成模板', templateShare: '分享', templateDelete: '刪除', templateDeleteConfirm: '刪掉？',
  codePlaceholder: '分享碼', codePreview: '查看', codeMalformed: '不完整', codeChecksum: '有一個字不對',
  cancel: '取消', importToLibrary: '存進我的模板', shareHint: '貼給別人', revoke: '停止分享', copyCode: '複製', done: '完成',
  copyFrom: '', copyEmpty: '', copyPick: '', copyOverwrite: '', copyOverwriteOk: '',
  untitled: '', discardTitle: '', discardOk: '', keepEditing: '',
}

import { validateShareCodeInput } from '../../../utils/share-code'

function goodCode(): string {
  // 從一組資料位算出校驗位：normalize 會保留使用者給的校驗位，validate 算出正確的那個。
  const data = 'ABCDEFGH'
  for (const ch of '0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U') {
    const v = validateShareCodeInput(`LT-NB-${data}${ch}`)
    if (v.status === 'ok') return v.canonical
  }
  throw new Error('no valid check symbol found')
}

function notepad(extra: Record<string, unknown> = {}) {
  return mount(CanvasNotepad, {
    props: { draft: '', templatesOpen: true, templates: [{ templateId: 't1', title: '骨架' }], labels: LABELS, ...extra },
  })
}

describe('手帳模板的分享碼', () => {
  it('還沒打字不出聲；形狀不對／抄錯一個字各有自己的提示，查看鍵停用', () => {
    const w = notepad()
    const el = w.element as HTMLElement
    expect(el.querySelector('.np-code-hint')!.hasAttribute('hidden')).toBe(true)
    expect(el.querySelector('.np-code-btn')!.classList.contains('is-disabled')).toBe(true)

    const w2 = notepad({ code: 'LT-NB-12' })
    expect(w2.element.querySelector('.np-code-hint')!.textContent).toBe('不完整')

    const good = goodCode()
    const wrongCheck = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A')
    const w3 = notepad({ code: wrongCheck })
    expect(w3.element.querySelector('.np-code-hint')!.textContent).toBe('有一個字不對')
    expect(w3.element.querySelector('.np-code-btn')!.classList.contains('is-disabled')).toBe(true)
  })

  it('對的碼：查看鍵可用，按下去送出標準形的碼', async () => {
    const good = goodCode()
    const w = notepad({ code: good.toLowerCase().replace(/-/g, ' ') })
    const btn = w.element.querySelector('.np-code-btn') as HTMLElement
    expect(btn.classList.contains('is-disabled')).toBe(false)
    await w.find('.np-code-btn').trigger('click')
    expect(w.emitted('preview-code')).toEqual([[good]])
  })

  it('輸入框是真的 input，打字往外報', async () => {
    const w = notepad()
    const input = w.find('input.np-code-input')
    expect(input.exists()).toBe(true)
    await input.setValue('LT-NB-1')
    expect(w.emitted('update:code')).toEqual([['LT-NB-1']])
  })

  it('預覽片：標題與內容看得到，存進我的模板／取消各自發事件；匯入中不重送', async () => {
    const w = notepad({ previewOpen: true, previewTitle: '宿舍規則', previewContent: '第一條…' })
    const el = w.element as HTMLElement
    expect(el.querySelector('.np-preview')!.hasAttribute('hidden')).toBe(false)
    expect(el.querySelector('.np-preview-title')!.textContent).toBe('宿舍規則')
    expect(el.querySelector('.np-preview-body')!.textContent).toBe('第一條…')
    await w.find('.np-preview-ok').trigger('click')
    await w.find('.np-preview-cancel').trigger('click')
    expect(w.emitted('confirm-import')).toHaveLength(1)
    expect(w.emitted('cancel-preview')).toHaveLength(1)

    const busy = notepad({ previewOpen: true, importing: true })
    await busy.find('.np-preview-ok').trigger('click')
    expect(busy.emitted('confirm-import')).toBeUndefined()
  })

  it('每個模板都能分享；分享片把碼亮出來，複製／停止分享／完成各自發事件', async () => {
    const w = notepad()
    await w.find('.np-template-share').trigger('click')
    expect(w.emitted('share-template')).toEqual([['t1']])

    const s = notepad({ shareOpen: true, shareCode: 'LT-NB-ABCDEFGHJ' })
    const el = s.element as HTMLElement
    expect(el.querySelector('.np-share')!.hasAttribute('hidden')).toBe(false)
    expect(el.querySelector('.np-share-code')!.textContent).toBe('LT-NB-ABCDEFGHJ')
    await s.find('.np-share-copy').trigger('click')
    await s.find('.np-share-revoke').trigger('click')
    await s.find('.np-share-close').trigger('click')
    expect(s.emitted('copy-share-code')).toHaveLength(1)
    expect(s.emitted('revoke-share')).toHaveLength(1)
    expect(s.emitted('close-share')).toHaveLength(1)
  })

  it('刪除先問一次，問句留在那一列上；確定才發事件', async () => {
    const w = notepad()
    expect(w.emitted('delete-template')).toBeUndefined()
    await w.find('.np-template-delete').trigger('click')
    expect(w.find('.np-template-delete-text').exists()).toBe(true)
    await w.find('.np-template-delete-cancel').trigger('click')
    expect(w.find('.np-template-delete-text').exists()).toBe(false)
    expect(w.emitted('delete-template')).toBeUndefined()
    await w.find('.np-template-delete').trigger('click')
    await w.find('.np-template-delete-ok').trigger('click')
    expect(w.emitted('delete-template')).toEqual([['t1']])
  })
})
