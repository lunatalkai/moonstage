/**
 * 沙箱殼的 build（`npm run build:sandbox` → dist-sandbox/）。
 *
 * 殼是一個獨立頁面（index.html + sandbox.js + sandbox.css），跑在跨源 iframe 裡，不依賴宿主；
 * 所以這裡沒有 uni 編譯器、沒有 vue、沒有 external——所有東西打進同一個檔。輸出檔名固定，
 * 站台的 Worker 才能直接對應路徑；快取失效靠站台自己的部署版本號。
 *
 * build 完 `npm run check:sandbox-boundary` 會掃產物：出現宿主的請求層／oauth／token 字樣就失敗。
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

/**
 * 殼可能跑在不透明源（iframe 沒給 allow-same-origin，origin 為 'null'）：module script 與帶 crossorigin 的
 * <link> 一律走 CORS 模式，資源層沒回 Access-Control-Allow-Origin 就整個被擋。所以殼的腳本打成 IIFE、
 * 標籤去掉 type="module" 與 crossorigin，用傳統 no-cors 方式載入，哪個站台都不必為它加 CORS 標頭。
 * check-sandbox-boundary 會掃產物的 index.html，出現這兩個屬性就失敗。
 */
const classicScriptTags = {
  name: 'sandbox-classic-script-tags',
  transformIndexHtml: {
    order: 'post' as const,
    handler: (html: string) =>
      html
        // module script 本來就延後執行；換成傳統 script 後要補 defer，否則在 <head> 裡跑時 body 還不存在。
        .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
        .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href='),
  },
}

export default defineConfig({
  // 殼裡的訊息區用標準播放器的 Vue 元件（canvas-message.vue）：同一份 DOM 與樣式，一般卡與沙箱卡長得一樣。
  plugins: [vue(), classicScriptTags],
  root: path.resolve(__dirname, 'src/sandbox'),
  base: './',
  publicDir: false,
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-sandbox'),
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    modulePreload: false,
    assetsInlineLimit: 512 * 1024,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/sandbox/index.html'),
      output: {
        // 傳統腳本（見上），單一進入點、不切 chunk：Worker 端只要記三個檔名。
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'sandbox.js',
        assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'sandbox.css' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
  logLevel: 'warn',
})
