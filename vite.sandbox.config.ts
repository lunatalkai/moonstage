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
import path from 'node:path'

export default defineConfig({
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
        entryFileNames: 'sandbox.js',
        chunkFileNames: 'sandbox-[name].js',
        assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'sandbox.css' : 'assets/[name]-[hash][extname]'),
        // 殼只有一個進入點；不切 chunk，Worker 端只要記三個檔名。
        manualChunks: () => 'sandbox',
        inlineDynamicImports: false,
      },
    },
  },
  logLevel: 'warn',
})
