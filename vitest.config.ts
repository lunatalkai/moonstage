import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

// 可信集 skip 口徑的單一事實來源 = scripts/gates.json 的
// known_failures.vitest_suites。登記/清除債務 = 改 gates.json，
// 本設定與 test-offline.sh、CI 自動同步；修復後從 ledger 移除即回可信集。
// （對照 mobile scripts/test-offline.sh 的 KNOWN_RED_SUITES 機制）
function knownRedVitestPatterns(): string[] {
  try {
    const gates = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, 'scripts/gates.json'), 'utf8'),
    )
    const suites = gates?.known_failures?.vitest_suites
    if (!Array.isArray(suites)) return []
    return suites.map((s: { pattern: string }) => s.pattern).filter(Boolean)
  } catch {
    return []
  }
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,js}'],
    // configDefaults.exclude 保留 vitest 內建排除（node_modules / dist / …），
    // 再疊加 gates.json 登記的已知紅套件。
    exclude: [...configDefaults.exclude, ...knownRedVitestPatterns()],
    setupFiles: ['vitest.setup.ts'],
  },
})
