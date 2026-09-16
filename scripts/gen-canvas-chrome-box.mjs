#!/usr/bin/env node
/**
 * 從 canvas.css 產生 canvas-chrome-box.css：畫布「殼」（頂欄、輸入區、快捷鍵、＋面板、各彈層）
 * 的 margin／padding 在 @layer 外再宣告一次。
 *
 * 為什麼：canvas.css 整份在 @layer lt-base 裡，卡片注入的 <style> 不分層，永遠贏過層內規則——
 * 這是刻意的讓位。但很多 MMD 美化卡開頭一條 `* { margin: 0; padding: 0 }`，它在 MMD 上只清得掉
 * 作者自己的內容（MMD 的殼樣式不分層、靠特異性守住），到我們這裡卻把殼的每一個內距一起清掉：
 * 快捷鍵擠成一團、輸入區貼邊、模型面板的列全部黏死（2026-09-16 一張「精致美化」卡實測，
 * 殼裡 142 條 margin／padding 全被歸零，訊息層一條都沒事）。
 *
 * 做法：只搬 margin／padding（`*` 重置會碰的那兩組），只搬殼的規則（訊息層是作者內容的地盤，
 * 作者對 p／img 的重置本來就該贏，那些留在層內），保留原本的 @media 等包裹與先後順序，
 * 所以殼內部的層疊結果不變；跟卡片比的時候，特異性跟 MMD 的殼一樣是「一兩個 class」，
 * 卡片寫同名選擇器、插得比我們晚，照樣贏。
 *
 * 產出檔要進版控，規格會重跑產生器比對——改了 canvas.css 的殼內距就重跑：
 *   node scripts/gen-canvas-chrome-box.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SOURCE = path.resolve(here, '../src/pages/canvas/canvas.css')
export const OUTPUT = path.resolve(here, '../src/pages/canvas/canvas-chrome-box.css')

/** 訊息層：作者內容住在這裡，作者的重置在這裡本來就該贏，不搬。 */
export const MESSAGE_LAYER = /(\.mes\b|\.mes_|#chat\b|\.content\b|\.touch-scope|\.item\.Ai|\.msg-|\.prologue|lt-frontend|\bpre\b|\.avatar\b|\.ch_name|\.name_text|\.mesAvatar|\.swipe|\.extraMes|\.lt-msg-regen|\.lt-context-chip|\.select-box|\.mes_buttons|\.hover-pill|\.lt-typing|\.thinking|\.summary|\.stream|\.canvas-root\s*$|\.canvas-root\s*\{)/

const BOX_PROP = /^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/

export function generate(css) {
  const root = postcss.parse(css)
  const out = postcss.root()
  root.walkAtRules('layer', (layer) => {
    layer.walkRules((rule) => {
      if (rule.selectors.some((s) => MESSAGE_LAYER.test(s))) return
      const decls = []
      rule.each((node) => {
        if (node.type === 'decl' && BOX_PROP.test(node.prop) && !node.important) decls.push(node.clone())
      })
      if (!decls.length) return
      const twin = postcss.rule({ selector: rule.selector })
      decls.forEach((d) => twin.append(d))
      // 保留 @media 等包裹（layer 本身除外），順序照原檔
      let wrapper = twin
      let parent = rule.parent
      while (parent && parent !== layer) {
        if (parent.type === 'atrule') {
          const at = postcss.atRule({ name: parent.name, params: parent.params })
          at.append(wrapper)
          wrapper = at
        }
        parent = parent.parent
      }
      out.append(wrapper)
    })
  })
  const header = `/* 由 scripts/gen-canvas-chrome-box.mjs 從 canvas.css 產生，不要手改。
   殼的 margin／padding 在 @layer 外再宣告一次：卡片的 \`* { margin: 0; padding: 0 }\` 在 MMD 只清作者
   自己的內容，到這裡不能把殼一起清掉。為什麼與範圍見產生器檔頭。 */\n`
  return header + out.toString().trim() + '\n'
}

export function render() {
  return generate(fs.readFileSync(SOURCE, 'utf8'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render()
  fs.writeFileSync(OUTPUT, text)
  const rules = (text.match(/\{/g) || []).length
  console.log(`已寫入 ${path.relative(process.cwd(), OUTPUT)}（${rules} 個區塊）`)
}
