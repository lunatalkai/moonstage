import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { buildDevProxy } from './build/dev-proxy.js'

// uni-h5-vite 的 chunkFileNames 按「facade 模块相对 src 的目录」拍平命名（`/`→`-`），
// node_modules 里的动态 import chunk 会得到 `..-node_modules-*` 这种以 `.` 开头的文件名；
// Rollup 见 specifier 以 `.` 开头就不再补 `./`，浏览器把它当裸模块标识符拒绝解析
// （线上事故：动态载入的第三方 chunk 全数失败）。
// uni 的插件 config 在合并时覆盖用户 output 配置，所以只能在 outputOptions 钩子里
// 包裹它的函数，把文件名开头的 `.`/`-` 清洗掉。
function sanitizeChunkFileNames() {
  return {
    name: 'lunatalk:sanitize-chunk-file-names',
    enforce: 'post',
    outputOptions(options) {
      const orig = options.chunkFileNames
      options.chunkFileNames = (chunkInfo) => {
        const pattern = typeof orig === 'function' ? orig(chunkInfo) : (orig || 'assets/[name].[hash].js')
        const i = pattern.lastIndexOf('/')
        const dir = pattern.slice(0, i + 1)
        const base = pattern.slice(i + 1).replace(/^[.-]+/, '')
        return dir + base
      }
      return options
    },
  }
}

// https://vitejs.dev/config/
// 用函數形式是為了拿到 mode 並 loadEnv：dev proxy 的 target 由 .env 決定，
// 個人差異走 .env.local，不必改設定檔（改了也會誤提交）。
// 第三個參數傳空字串＝載入所有變數，不限 VITE_ 前綴——DEV_PROXY_* 只在建構期
// 使用，不該被注入到客戶端程式碼。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [
    uni(),
    sanitizeChunkFileNames(),
  ],
  build: {
    rollupOptions: {
      output: {
        // 修复动态 import 的 chunk 命名，避免路径解析问题
        chunkFileNames: 'assets/[name]-[hash].js',
      }
    }
  },
  server: {
    port: Number(env.DEV_PORT) || 8800,
    // 开发模式禁用浏览器缓存，避免打开页面先显示旧版本需要强刷的问题
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    // proxy 設定與各 target 的預設值見 build/dev-proxy.js。
    // 個人差異寫 .env.local（不進版控），不要改預設值。
    proxy: buildDevProxy(env),
  }
  }
})
