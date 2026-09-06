/**
 * 作者草稿的本機儲存。
 *
 * 走 IndexedDB：一份草稿可以有幾百條規則加上整段掛載 HTML，localStorage 的
 * 幾 MB 上限與同步序列化都不合適。開不了 IndexedDB（私密瀏覽、被封鎖）就退到
 * 記憶體——草稿當次可用、重新整理就沒了，`persistent` 讓入口頁能把這件事說清楚。
 */
import type { AuthorDraft } from './author-draft'
import { upgradeStoredDraft } from './author-draft'

const DB_NAME = 'moonstage-author-drafts'
const STORE = 'drafts'
const VERSION = 1

export interface AuthorDraftStore {
  /** false 表示現在只存在記憶體裡 */
  readonly persistent: boolean
  list(): Promise<AuthorDraft[]>
  get(id: string): Promise<AuthorDraft | null>
  put(draft: AuthorDraft): Promise<void>
  remove(id: string): Promise<void>
}

function byUpdatedDesc(a: AuthorDraft, b: AuthorDraft) {
  return (b.updatedAt || 0) - (a.updatedAt || 0)
}

export function createMemoryDraftStore(): AuthorDraftStore {
  const map = new Map<string, AuthorDraft>()
  return {
    persistent: false,
    async list() { return Array.from(map.values()).sort(byUpdatedDesc) },
    async get(id) { return map.get(id) || null },
    async put(draft) { map.set(draft.id, draft) },
    async remove(id) { map.delete(id) },
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest
    try {
      req = factory.open(DB_NAME, VERSION)
    } catch (e) {
      reject(e)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('blocked'))
  })
}

export function createIndexedDbDraftStore(db: IDBDatabase): AuthorDraftStore {
  function tx(mode: IDBTransactionMode) {
    return db.transaction(STORE, mode).objectStore(STORE)
  }
  return {
    persistent: true,
    async list() {
      const rows = await request(tx('readonly').getAll())
      return (rows as any[]).map(upgradeStoredDraft).sort(byUpdatedDesc)
    },
    async get(id) {
      const row = await request(tx('readonly').get(id))
      return row ? upgradeStoredDraft(row) : null
    },
    async put(draft) {
      await request(tx('readwrite').put(draft))
    },
    async remove(id) {
      await request(tx('readwrite').delete(id))
    },
  }
}

let shared: Promise<AuthorDraftStore> | null = null

/**
 * 取得這個瀏覽器的草稿庫。開 IndexedDB 失敗就退到記憶體，而且只退一次：
 * 同一個分頁裡兩個頁面拿到的是同一份記憶體，入口頁存的草稿畫布才找得到。
 */
export function getAuthorDraftStore(factory?: IDBFactory | null): Promise<AuthorDraftStore> {
  if (!shared) {
    const idb = factory === undefined ? (typeof indexedDB !== 'undefined' ? indexedDB : null) : factory
    shared = (idb ? openDatabase(idb).then(createIndexedDbDraftStore) : Promise.reject(new Error('no-indexeddb')))
      .catch(() => createMemoryDraftStore())
  }
  return shared
}

/** 測試用：忘掉共用的那份。 */
export function resetAuthorDraftStoreForTests() {
  shared = null
}
