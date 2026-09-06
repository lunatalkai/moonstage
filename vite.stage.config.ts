/**
 * 舞台套件的 build（`npm run build:stage` → dist-stage/）。
 *
 * 跟 playground 的 vite.config.js 不同：這裡沒有 uni 編譯器。uni 編譯器替我們做的四件事在這裡自己做：
 *   1. `// #ifdef H5 … // #endif` 條件編譯 → 留 H5 的、拔其他平台的（stripUniConditional）。
 *   2. `<view>`／`<text>`／`<image>` → `<div>`／`<span>`／`<img>`（renameUniTags）。
 *   3. `Nrpx` → `calc(N * var(--ms-rpx))`，--ms-rpx 由 src/stage/rpx.ts 在執行時維護（postcss rpx）。
 *   4. `@dcloudio/uni-app` 的頁面鉤子 → src/stage/uni-app-shim.ts（alias）。
 * 另外把所有樣式 scope 在 .ms-stage 底下（含 :root／html／body → .ms-stage），宿主的頁面不會被舞台的
 * 全域樣式（uni.css 那些 reset）染到。
 *
 * vue／vue-i18n／pinia 由宿主提供（external）；vuex、markdown-it、opencc-js 等打進套件。
 */
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import type { Root as PostcssRoot, Plugin as PostcssPlugin } from 'postcss'

const STAGE_SCOPE = '.ms-stage'

/** 條件編譯：只認 H5（與 VUE3，因為本來就是 Vue 3）。 */
function stripUniConditional(): Plugin {
  const keep = (platforms: string) => /\b(H5|VUE3)\b/.test(platforms)
  const strip = (code: string): string => {
    // // #ifdef X … // #endif（單行註解形式，js／ts／<script>）
    code = code.replace(/[ \t]*\/\/[ \t]*#(ifdef|ifndef)[ \t]+([^\n]*)\n([\s\S]*?)[ \t]*\/\/[ \t]*#endif[^\n]*\n?/g, (_m, kind, platforms, body) => {
      const hit = keep(platforms)
      return (kind === 'ifdef' ? hit : !hit) ? body : ''
    })
    // /* #ifdef X */ … /* #endif */（css）
    code = code.replace(/\/\*[ \t]*#(ifdef|ifndef)[ \t]+([^*]*?)\*\/([\s\S]*?)\/\*[ \t]*#endif[ \t]*\*\//g, (_m, kind, platforms, body) => {
      const hit = keep(platforms)
      return (kind === 'ifdef' ? hit : !hit) ? body : ''
    })
    // <!-- #ifdef X --> … <!-- #endif -->（template）
    code = code.replace(/<!--[ \t]*#(ifdef|ifndef)[ \t]+([^>]*?)-->([\s\S]*?)<!--[ \t]*#endif[ \t]*-->/g, (_m, kind, platforms, body) => {
      const hit = keep(platforms)
      return (kind === 'ifdef' ? hit : !hit) ? body : ''
    })
    return code
  }
  return {
    name: 'moonstage:strip-uni-conditional',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.(vue|js|ts|css)(\?|$)/.test(id) || id.includes('node_modules')) return null
      if (!code.includes('#ifdef') && !code.includes('#ifndef')) return null
      return { code: strip(code), map: null }
    },
  }
}

/** uni 的基本標籤換成 HTML 標籤。 */
const UNI_TAG_MAP: Record<string, string> = { view: 'div', text: 'span', image: 'img', 'scroll-view': 'div', 'cover-view': 'div', 'cover-image': 'img' }
function renameUniTags(node: any) {
  if (node.type !== 1) return
  const to = UNI_TAG_MAP[node.tag]
  if (!to) return
  node.tag = to
  node.tagType = 0 // ELEMENT：不要被當成元件去解析
  if (to === 'img') {
    // uni 的 <image mode="…"> 沒有原生對應；src 保留即可
    node.props = (node.props || []).filter((p: any) => !(p.type === 6 && p.name === 'mode'))
  }
}

/** postcss：rpx → calc(N * var(--ms-rpx))；所有選擇器 scope 到 .ms-stage。 */
function stageCssPlugin(): PostcssPlugin {
  const RPX = /(-?\d*\.?\d+)rpx/g
  const scopeSelector = (sel: string): string => {
    const s = sel.trim()
    if (!s || s.startsWith(STAGE_SCOPE)) return s
    if (/^(:root|html|body)$/i.test(s)) return STAGE_SCOPE
    // html body .x／body .x → .ms-stage .x
    const stripped = s.replace(/^(html\s+)?body\s+/i, '').replace(/^html\s+/i, '')
    if (/^(html|body)\b/i.test(stripped)) return STAGE_SCOPE
    return `${STAGE_SCOPE} ${stripped}`
  }
  return {
    postcssPlugin: 'moonstage:stage-css',
    Once(root: PostcssRoot) {
      root.walkDecls((decl) => {
        if (decl.value.includes('rpx')) decl.value = decl.value.replace(RPX, (_m, n) => `calc(${n} * var(--ms-rpx))`)
      })
      root.walkRules((rule) => {
        const parent = rule.parent as any
        if (parent && parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return
        rule.selectors = rule.selectors.map(scopeSelector)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      stripUniConditional(),
      vue({ template: { compilerOptions: { nodeTransforms: [renameUniTags] } } }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@dcloudio/uni-app': path.resolve(__dirname, 'src/stage/uni-app-shim.ts'),
      },
    },
    define: {
      'process.env.UNI_PLATFORM': JSON.stringify('h5'),
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.VUE_APP_PLATFORM': JSON.stringify('h5'),
    },
    css: { postcss: { plugins: [stageCssPlugin()] } },
    build: {
      outDir: 'dist-stage',
      emptyOutDir: true,
      cssCodeSplit: false,
      sourcemap: false,
      lib: {
        entry: path.resolve(__dirname, 'src/stage/index.ts'),
        formats: ['es'],
        fileName: () => 'moonstage-stage.js',
        cssFileName: 'moonstage-stage',
      },
      rollupOptions: {
        external: ['vue', 'vue-i18n', 'pinia'],
        output: { assetFileNames: (info) => (info.name && info.name.endsWith('.css') ? 'moonstage-stage.css' : 'assets/[name]-[hash][extname]') },
      },
    },
    // 讓 config/env.js 的 requireEnv 在 build 時看得到 .env.production 的值
    envPrefix: ['VITE_'],
    logLevel: env.VITE_STAGE_LOG === 'info' ? 'info' : 'warn',
  }
})
