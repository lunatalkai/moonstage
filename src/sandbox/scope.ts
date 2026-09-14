/**
 * 訊息作用域：作者回呼裡的 `document.querySelector` 只看得到「當前這則氣泡」的內容。
 *
 * 為什麼：作者的腳本整卡只跑一次，但氣泡會一直長出來。作者在 `message:mount` 裡寫
 * `document.querySelector('.hello-btn')` 想拿的是「這一則」的按鈕；不收窄的話永遠拿到
 * 第一則的。所以平台改寫 `Document.prototype` 的五個查詢方法，配一個模組級游標：
 *
 *   - 游標有值（在某則氣泡的回呼裡）：先在游標氣泡裡找；氣泡根自己也算（Element 的
 *     querySelector 不含自身）。找不到再退回整份文件，但別的氣泡內部的節點不給。
 *   - 游標為空（回呼外、非同步之後）：就是一般的文件，什麼都查得到。舊頁寫法的卡靠
 *     `<img onerror>` 點火器從整份文件撿引擎片段（碧藍檔案那張的開局面板），藏起來它就啞了；
 *     MMD 新版契約只保證「回呼內收窄」，回呼外不藏是相容兩種寫法的做法。
 *   - 使用者事件（click／input／change／keydown）的捕獲階段自動把游標設成事件所在的
 *     氣泡，所以 inline handler 與 addEventListener 的回呼裡也是收窄的。
 *
 * 只改 Document.prototype；`document.body.querySelector` 這種 Element 級查詢不動——
 * 作者要查整頁就從 body 出發，這是原站的行為。
 */

export interface MessageScope {
  /** 在某則氣泡的作用域裡跑一段回呼；bubble 為 null 就是「回呼外」。 */
  run(bubble: Element | null, fn: () => void): void
  /** 目前的游標（測試用）。 */
  current(): Element | null
  /** 拆掉補丁（測試用）。 */
  uninstall(): void
}

const BODY_SELECTOR = '[data-chat="message-body"]'
const BUBBLE_SELECTOR = '[data-chat="message"]'
const GESTURE_EVENTS = ['click', 'input', 'change', 'keydown']

export function installMessageScope(doc: Document): MessageScope {
  const D = Object.getPrototypeOf(doc) as Document
  const native = {
    querySelector: D.querySelector,
    querySelectorAll: D.querySelectorAll,
    getElementById: D.getElementById,
    getElementsByClassName: D.getElementsByClassName,
    getElementsByTagName: D.getElementsByTagName,
  }
  let cursor: Element | null = null

  /** 節點在哪一則氣泡的正文裡（嚴格祖先）；不在任何氣泡裡就 null。 */
  const bodyOf = (node: Element | null): Element | null => {
    if (!node) return null
    const parent = node.parentElement
    return parent ? parent.closest(BODY_SELECTOR) : null
  }
  const allows = (node: Element | null): boolean => {
    if (!node || !cursor) return true
    const body = bodyOf(node)
    if (!body) return true
    return cursor.contains(body)
  }
  const inCursor = (sel: string): Element | null => {
    if (!cursor) return null
    if (cursor.matches(sel)) return cursor
    return cursor.querySelector(sel)
  }

  D.querySelector = function (this: Document, sel: string) {
    const hit = inCursor(sel)
    if (hit) return hit
    const found = native.querySelector.call(this, sel)
    return found && allows(found) ? found : null
  } as Document['querySelector']

  D.querySelectorAll = function (this: Document, sel: string) {
    const out: Element[] = []
    if (cursor) {
      if (cursor.matches(sel)) out.push(cursor)
      cursor.querySelectorAll(sel).forEach((el) => out.push(el))
    }
    native.querySelectorAll.call(this, sel).forEach((el) => {
      if (!out.includes(el) && allows(el)) out.push(el)
    })
    return out as unknown as NodeListOf<Element>
  } as Document['querySelectorAll']

  D.getElementById = function (this: Document, id: string) {
    const hit = inCursor(`[id="${String(id).replace(/"/g, '\\"')}"]`)
    if (hit) return hit as HTMLElement
    const found = native.getElementById.call(this, id)
    return found && allows(found) ? found : null
  }

  D.getElementsByClassName = function (this: Document, names: string) {
    const all = Array.from(native.getElementsByClassName.call(this, names))
    return all.filter((el) => allows(el)) as unknown as HTMLCollectionOf<Element>
  }

  D.getElementsByTagName = function (this: Document, name: string) {
    const all = Array.from(native.getElementsByTagName.call(this, name))
    return all.filter((el) => allows(el)) as unknown as HTMLCollectionOf<Element>
  } as Document['getElementsByTagName']

  // 使用者事件的捕獲階段：游標＝事件所在的氣泡；事件派送完就放掉。
  const onCapture = (e: Event) => {
    const target = e.target as Element | null
    const bubble = target && target.closest ? target.closest(BUBBLE_SELECTOR) : null
    if (!bubble) return
    const previous = cursor
    cursor = bubble
    // 派送在同一個 task 裡同步完成；下一個 macrotask 前放回去。
    setTimeout(() => { if (cursor === bubble) cursor = previous }, 0)
  }
  for (const name of GESTURE_EVENTS) doc.addEventListener(name, onCapture, true)

  return {
    run(bubble, fn) {
      const previous = cursor
      cursor = bubble
      try {
        fn()
      } finally {
        cursor = previous
      }
    },
    current: () => cursor,
    uninstall() {
      D.querySelector = native.querySelector
      D.querySelectorAll = native.querySelectorAll
      D.getElementById = native.getElementById
      D.getElementsByClassName = native.getElementsByClassName
      D.getElementsByTagName = native.getElementsByTagName
      for (const name of GESTURE_EVENTS) doc.removeEventListener(name, onCapture, true)
    },
  }
}
