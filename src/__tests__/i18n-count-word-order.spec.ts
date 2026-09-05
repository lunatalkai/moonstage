import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'

import en from '../locale/en.json'
import zhHans from '../locale/zh-Hans.json'
import zhHant from '../locale/zh-Hant.json'
import ja from '../locale/ja.json'
import ko from '../locale/ko.json'

const messages: Record<string, any> = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, ko }
const LOCALES = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko']

// 走 production 同一顆 vue-i18n：模板用的是 t(key, { n }, count)
const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages })
const render = (locale: string, key: string, n: number) => {
  i18n.global.locale.value = locale as any
  return i18n.global.t(key, { n }, n)
}

describe('數量詞語序 · desktop 實際渲染結果', () => {
  it('worldbook.entriesCount 韓語是「名詞 + 數字 + 單位」', () => {
    expect(render('ko', 'worldbook.entriesCount', 39)).toBe('항목 39개')
    expect(render('ja', 'worldbook.entriesCount', 39)).toBe('39件のエントリー')
    expect(render('zh-Hant', 'worldbook.entriesCount', 39)).toBe('39 個條目')
    expect(render('zh-Hans', 'worldbook.entriesCount', 39)).toBe('39 个条目')
  })

  it('worldbook.entriesCount 英語單複數正確', () => {
    expect(render('en', 'worldbook.entriesCount', 1)).toBe('1 entry')
    expect(render('en', 'worldbook.entriesCount', 39)).toBe('39 entries')
    expect(render('en', 'worldbook.entriesCount', 0)).toBe('0 entries')
  })

  it('worldbook.usesCount / followersCount 韓語語序', () => {
    expect(render('ko', 'worldbook.usesCount', 12)).toBe('사용 12회')
    expect(render('ko', 'worldbook.followersCount', 8)).toBe('팔로워 8명')
    expect(render('en', 'worldbook.usesCount', 1)).toBe('1 use')
    expect(render('en', 'worldbook.followersCount', 8)).toBe('8 followers')
  })

  it('worldbook.entries/uses/followers 仍是可獨立使用的純標籤', () => {
    for (const l of LOCALES) {
      for (const k of ['worldbook.entries', 'worldbook.uses', 'worldbook.followers']) {
        expect(messages[l][k]).toBe(String(messages[l][k]).trim())
        expect(messages[l][k]).not.toMatch(/\{n\}/)
      }
    }
  })

  it('mine.analytics 卡片數韓語是 카드 N개', () => {
    expect(render('ko', 'mine.analytics.cardCountLabel', 1)).toBe('카드 1개')
    expect(render('ko', 'mine.analytics.blueOceanCards', 3)).toBe('카드 3개')
    expect(render('en', 'mine.analytics.cardCountLabel', 1)).toBe('1 card')
    expect(render('en', 'mine.analytics.cardCountLabel', 3)).toBe('3 cards')
    expect(render('ja', 'mine.analytics.cardCountLabel', 3)).toBe('3枚のカード')
  })

  it('story.detail.plays 韓語是 플레이 N회', () => {
    expect(render('ko', 'story.detail.plays', 12)).toBe('플레이 12회')
    expect(render('en', 'story.detail.plays', 1)).toBe('1 play')
    expect(render('en', 'story.detail.plays', 12)).toBe('12 plays')
  })

  it('chat.memoryRecords 韓語是 기억 N개', () => {
    expect(render('ko', 'chat.memoryRecords', 12)).toBe('기억 12개')
    expect(render('en', 'chat.memoryRecords', 1)).toBe('1 memory record')
    expect(render('en', 'chat.memoryRecords', 12)).toBe('12 memory records')
  })

  it('search 計數語序', () => {
    expect(render('ko', 'search.characters_count', 39)).toBe('캐릭터 39명')
    expect(render('ko', 'search.chats_count', 12)).toBe('대화 12회')
    expect(render('en', 'search.characters_count', 1)).toBe('1 character')
    expect(render('en', 'search.chats_count', 12)).toBe('12 chats')
  })

  it('voiceSquare.items 數字與單位不留空格', () => {
    expect(render('ko', 'voiceSquare.items', 12)).toBe('12개')
    expect(render('en', 'voiceSquare.items', 1)).toBe('1 voice')
    expect(render('en', 'voiceSquare.items', 12)).toBe('12 voices')
  })

  it('modelSelect.quotaLeft 與 sc.rolesCount', () => {
    expect(render('ko', 'modelSelect.quotaLeft', 3)).toBe('3회 사용 가능')
    expect(render('ko', 'sc.rolesCount', 3)).toBe('총 3명')
    expect(render('en', 'sc.rolesCount', 3)).toBe('Total 3')
  })

  // sc.entries / sc.stages 目前只有 mobile 在用，desktop 這份保持同值同語意（避免兩端再分叉）
  it('sc.entries / sc.stages 與 mobile 保持同一參數化形式', () => {
    expect(render('ko', 'sc.entries', 39)).toBe('항목 39개')
    expect(render('ko', 'sc.stages', 3)).toBe('3단계')
    expect(render('en', 'sc.entries', 1)).toBe('1 entry')
    expect(render('en', 'sc.stages', 3)).toBe('3 stages')
  })

  it('五語齊全：本次新增/改造的 key 每個語言都有 {n}', () => {
    const keys = [
      'worldbook.entriesCount', 'worldbook.usesCount', 'worldbook.followersCount',
      'mine.analytics.cardCountLabel', 'mine.analytics.blueOceanCards',
      'story.detail.plays', 'chat.memoryRecords',
      'search.characters_count', 'search.chats_count',
      'voiceSquare.items', 'modelSelect.quotaLeft', 'sc.rolesCount',
    ]
    for (const l of LOCALES) {
      for (const k of keys) {
        expect(typeof messages[l][k]).toBe('string')
        expect(messages[l][k]).toContain('{n}')
      }
    }
  })

  it('mine.analytics.weeksAgo 數字與單位「주」不留空格', () => {
    expect(render('ko', 'mine.analytics.weeksAgo', 12)).toBe('12주 전')
    expect(render('en', 'mine.analytics.weeksAgo', 1)).toBe('1 week ago')
    expect(render('en', 'mine.analytics.weeksAgo', 12)).toBe('12 weeks ago')
  })

  // ---- 第三批 ----
  it('desktop trailing bare noun 已改語序', () => {
    expect(render('ko', 'mine.checkRole.talks', 120)).toBe('채팅 120회')
    expect(render('ko', 'mine.checkRole.followers', 8)).toBe('팔로워 8명')
    expect(render('ko', 'story.detail.characters', 5)).toBe('캐릭터 5명')
    expect(render('ko', 'campaign.invitesCount', 5)).toBe('초대 5명')
    expect(render('en', 'mine.checkRole.talks', 1)).toBe('1 chat')
    expect(render('en', 'story.detail.characters', 5)).toBe('5 characters')
  })

  it('campaign.invites / chat.follow / mine.fans 仍是純 label', () => {
    for (const k of ['campaign.invites', 'chat.follow', 'mine.fans']) {
      expect(messages.ko[k]).not.toContain('{n}')
    }
    expect(messages.en['chat.follow']).toBe('Follow')
  })

  it('只有英語使用 | 複數分支', () => {
    const keys = ['worldbook.entriesCount', 'worldbook.usesCount', 'worldbook.followersCount',
      'mine.analytics.cardCountLabel', 'story.detail.plays', 'chat.memoryRecords',
      'search.characters_count', 'voiceSquare.items']
    for (const k of keys) {
      expect(messages.en[k]).toContain('|')
      for (const l of ['zh-Hans', 'zh-Hant', 'ja', 'ko']) {
        expect(messages[l][k]).not.toContain('|')
      }
    }
  })
})
