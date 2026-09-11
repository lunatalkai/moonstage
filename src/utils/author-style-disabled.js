/**
 * 作者內容裡寫了 `<style disabled>` 的樣式塊，掛上去時真的關掉。
 *
 * 瀏覽器不認 <style> 的 disabled「屬性」，只認 `.disabled` 屬性值：寫在標籤上的
 * disabled 一律無效，樣式照常生效。作者寫它的意思很清楚——這塊預設是關的、由他的
 * 腳本之後開關（例如日夜主題兩塊各一個 <style>，腳本按玩家設定切）。那支腳本在
 * 別的平台會跑，到了我們這裡常因為它先檢查了對方平台的網址或節點就整段不跑；
 * 於是「預設關」的夜間樣式一直開著，把日間變數整批蓋掉，頁面顏色跟作者在原平台
 * 看到的不一樣（2026-09-11 社群站用戶回報「美化背景不一致」）。
 *
 * 這裡只做一件事：把屬性翻譯成瀏覽器認得的那個值。作者腳本之後要開要關，照它的。
 * 零 import 的純 DOM 模組，掛載層與訊息氣泡兩條路都用同一份。
 */
function applyDisabledStyleAttr(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0
  const list = root.querySelectorAll('style[disabled]')
  let n = 0
  for (let i = 0; i < list.length; i++) {
    const el = list[i]
    if (el.disabled) continue
    el.disabled = true
    n++
  }
  // root 自己就是那個 <style> 的情況（搬到 head 時逐顆處理）
  if (root.tagName === 'STYLE' && root.hasAttribute('disabled') && !root.disabled) {
    root.disabled = true
    n++
  }
  return n
}

export { applyDisabledStyleAttr }
