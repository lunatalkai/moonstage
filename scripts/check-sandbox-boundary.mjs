#!/usr/bin/env node
/**
 * 沙箱殼的分離性檢查：掃 dist-sandbox/ 的產物，出現宿主那一側的東西就失敗。
 *
 * 殼跑在跨源 iframe 裡，設計上「不發任何請求、不碰任何 token」——資料全由宿主 postMessage 餵。
 * 這條規則靠人記不住（有人 import 一個 util，util 再 import 請求層，殼就悄悄帶上 oauth 了），
 * 所以在 build 產物上量：這些字串在殼裡沒有任何合法出現的理由。
 *
 * 用法：npm run build:sandbox && node scripts/check-sandbox-boundary.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.cwd(), 'dist-sandbox')
const FORBIDDEN = [
  'open-oauth',
  'fui-request',
  'accessToken',
  'refreshToken',
  'Authorization',
  '/open/v1',
  'lunatalk.ai',
  'localStorage.getItem("hearthroom',
  'XMLHttpRequest',
  'fetch(',
]

if (!fs.existsSync(dir)) {
  console.error(`[sandbox-boundary] 找不到 ${dir}，先跑 npm run build:sandbox`)
  process.exit(1)
}

const files = fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f))
if (!files.length) {
  console.error('[sandbox-boundary] dist-sandbox/ 裡沒有 js/html 產物')
  process.exit(1)
}

let bad = 0
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8')
  for (const needle of FORBIDDEN) {
    const idx = text.indexOf(needle)
    if (idx === -1) continue
    bad++
    const around = text.slice(Math.max(0, idx - 60), idx + needle.length + 60).replace(/\s+/g, ' ')
    console.error(`[sandbox-boundary] ${file} 含「${needle}」：…${around}…`)
  }
}

// 殼可能跑在不透明源（origin 'null'）：module script 與 crossorigin 的 link 走 CORS，資源層沒加 CORS 標頭就整個被擋。
// 標籤必須是傳統 no-cors 載入（vite.sandbox.config.ts 的 classicScriptTags 負責改），這裡量產物守住。
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
for (const needle of ['type="module"', 'crossorigin', 'rel="modulepreload"']) {
  if (html.includes(needle)) {
    bad++
    console.error(`[sandbox-boundary] index.html 含「${needle}」：不透明源下會被 CORS 擋，殼必須用傳統 script/link 標籤`)
  }
}
if (!/<script defer src="\.\/sandbox\.js">/.test(html)) {
  bad++
  console.error('[sandbox-boundary] index.html 的殼腳本必須是 <script defer src="./sandbox.js">：傳統 script 在 <head> 裡不 defer 會在 body 建好前執行')
}

if (bad) {
  console.error(`[sandbox-boundary] ${bad} 處違規：殼不得帶宿主的請求層／憑證／API 位址，標籤不得走 CORS 模式`)
  process.exit(1)
}
console.log(`[sandbox-boundary] OK（${files.join(', ')}）`)
