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

if (bad) {
  console.error(`[sandbox-boundary] ${bad} 處違規：殼不得帶宿主的請求層／憑證／API 位址`)
  process.exit(1)
}
console.log(`[sandbox-boundary] OK（${files.join(', ')}）`)
