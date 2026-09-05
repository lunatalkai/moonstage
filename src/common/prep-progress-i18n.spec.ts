import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 伺服器只送「資源類別」，不送文字。
// 五語文案是前端資產，所以每加一個類別就有兩件事要做：resName 要認得它，五個語系
// 都要有字。少做任何一件，畫面不會壞——只會退回「正在查『某某』」而說不出那是什麼，
// 使用者付了錢卻看不出模型在動什麼。2026-08-05 新增玩法模組資源時就是這樣漏的。
//
// 這份清單是伺服器那五個 preReplyResource* 常數的鏡像。新增類別時三處一起改：
// 伺服器常數、這份清單、兩端的 locale 與 resName。
const RESOURCE_CATEGORIES = ['setting', 'note', 'shared', 'past', 'draft', 'mod', 'requirement'] as const

const LOCALES = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'] as const

// 刻意放在 common/ 而不是 pages/：pages 樹會被逐語言複製一份，spec 跟著複製過去之後
// 相對路徑會解到 src/<lang>/ 而不是專案根，整批紅。
const root = join(__dirname, '..', '..')

function localeStrings(locale: string): Record<string, string> {
  return JSON.parse(readFileSync(join(root, 'src', 'locale', `${locale}.json`), 'utf8'))
}

describe('準備進度的資源文案', () => {
  it('每個資源類別在五個語系都有字，而且不是空的', () => {
    for (const locale of LOCALES) {
      const strings = localeStrings(locale)
      for (const category of RESOURCE_CATEGORIES) {
        const key = `multiPass.prepRes${category[0].toUpperCase()}${category.slice(1)}`
        expect(strings[key], `${locale} 缺少 ${key}`).toBeTruthy()
      }
    }
  })

  it('chat 頁的 resName 認得每一個資源類別', () => {
    const source = readFileSync(join(root, 'src', 'pages', 'canvas', 'canvas.vue'), 'utf8')
    const map = source.slice(source.indexOf('const resName = {'))
    for (const category of RESOURCE_CATEGORIES) {
      expect(map, `resName 沒有 ${category}`).toContain(`${category}: t('multiPass.prepRes`)
    }
  })

  it('文案不得夾帶內部識別符', () => {
    // 守的是**識別符**外洩，不是碰巧同字的普通名詞：英文的 "the shared notepad"
    // 完全合格——記事本這個功能對使用者本來就叫 notepad。所以這裡只列不可能
    // 出現在使用者文案裡的內部 token，另外擋 snake_case 這種一看就是代碼的形狀。
    const forbidden = ['gaplane', 'preptrail', 'prereply', 'multipass']
    for (const locale of LOCALES) {
      const strings = localeStrings(locale)
      for (const category of RESOURCE_CATEGORIES) {
        const key = `multiPass.prepRes${category[0].toUpperCase()}${category.slice(1)}`
        const value = String(strings[key] || '')
        for (const word of forbidden) {
          expect(value.toLowerCase(), `${locale}/${key} 夾帶了內部名 ${word}`).not.toContain(word)
        }
        expect(value, `${locale}/${key} 看起來像代碼識別符`).not.toMatch(/[a-z]+_[a-z]+/i)
      }
    }
  })
})
