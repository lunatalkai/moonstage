import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryDraftStore, getAuthorDraftStore, resetAuthorDraftStoreForTests } from '../author-draft-store'
import type { AuthorDraft } from '../author-draft'

function draft(id: string, updatedAt: number): AuthorDraft {
  return { id, name: id, source: 'mmd', rules: [], mountTrigger: '', mountLayer: 'over', immersive: false, opening: '', format: 'mmd-regex-list', createdAt: updatedAt, updatedAt }
}

describe('記憶體草稿庫', () => {
  it('存、取、列（新的在前）、刪', async () => {
    const store = createMemoryDraftStore()
    expect(store.persistent).toBe(false)
    await store.put(draft('a', 1))
    await store.put(draft('b', 2))
    expect((await store.list()).map((d) => d.id)).toEqual(['b', 'a'])
    expect((await store.get('a'))?.name).toBe('a')
    await store.remove('a')
    expect(await store.get('a')).toBeNull()
    expect(await store.list()).toHaveLength(1)
  })
})

describe('getAuthorDraftStore', () => {
  beforeEach(() => resetAuthorDraftStoreForTests())

  it('沒有 IndexedDB 時退到記憶體，而且同一個分頁共用同一份', async () => {
    const a = await getAuthorDraftStore(null)
    const b = await getAuthorDraftStore(null)
    expect(a.persistent).toBe(false)
    expect(a).toBe(b)
    await a.put(draft('x', 1))
    expect(await b.get('x')).not.toBeNull()
  })

  it('open() 直接丟例外（私密瀏覽）也退到記憶體，不讓入口頁炸掉', async () => {
    const throwing = { open() { throw new Error('SecurityError') } } as unknown as IDBFactory
    const store = await getAuthorDraftStore(throwing)
    expect(store.persistent).toBe(false)
  })

  it('open() 回錯誤事件也退到記憶體', async () => {
    const failing = {
      open() {
        const req: any = {}
        setTimeout(() => { req.error = new Error('QuotaExceeded'); req.onerror && req.onerror() }, 0)
        return req
      },
    } as unknown as IDBFactory
    const store = await getAuthorDraftStore(failing)
    expect(store.persistent).toBe(false)
  })
})
