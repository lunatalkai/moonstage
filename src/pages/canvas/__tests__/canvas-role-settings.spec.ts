/**
 * 遊玩設定的讀與寫。
 *
 * 兩件事這裡守死：讀進來的形狀不再猜（伺服器回的是設定物件本身，不是包一層），
 * 以及寫出去只帶動到的欄位——整包送出會蓋掉玩家在別處存好的值。
 */
import { describe, it, expect } from 'vitest'

import {
  ROLE_SETTING_KEYS,
  ROLE_SETTINGS_DEFAULTS,
  USER_SEX_VALUES,
  SANDBOX_LEVELS,
  readRoleSettings,
  diffRoleSettings,
  buildRoleSettingsSavePayload,
} from '../canvas-role-settings'

describe('讀伺服器的遊玩設定', () => {
  it('直接讀設定物件本身，不去找 prefs 那一層', () => {
    const read = readRoleSettings({
      userName: '小明',
      userSex: 'man',
      userDefine: '一個路過的人',
      selectModel: 'relay-claude-sonnet-4-5-ripple',
      context: 3,
      thinkingDepth: 'high',
      jailbreak: '',
      defaultJailbreak: '系統預設',
      roleSpeech: 'zh-CN-XiaoxiaoNeural',
    })
    expect(read.userName).toBe('小明')
    expect(read.selectModel).toBe('relay-claude-sonnet-4-5-ripple')
    expect(read.context).toBe(3)
    expect(read.thinkingDepth).toBe('high')
  })

  it('沒設過性別時就是沒設過——不替玩家猜一個預設值', () => {
    expect(readRoleSettings({ userSex: '' }).userSex).toBe('')
    expect(ROLE_SETTINGS_DEFAULTS.userSex).toBe('')
  })

  it('性別代號沿用既有存量值', () => {
    expect(USER_SEX_VALUES).toEqual(['man', 'women', 'other'])
  })

  it('虛構框架由弱到強——它是一條強度軸，不是一組並列選項', () => {
    expect(SANDBOX_LEVELS).toEqual(['light', 'standard', 'immersive', 'deep'])
  })

  it('沒設過虛構框架與破限詞就是空的：空字串代表「跟著預設」，不是一個值', () => {
    const read = readRoleSettings({ sandboxLevel: '', jailbreak: '' })
    expect(read.sandboxLevel).toBe('')
    expect(read.jailbreak).toBe('')
  })


  it('舊資料的 context 是 0，換成第一檔——0 沒有對應的檔位可以標亮', () => {
    expect(readRoleSettings({ context: 0 }).context).toBe(1)
    expect(readRoleSettings({}).context).toBe(1)
  })

  it('缺欄位或 null 都讀成空字串，不讓 undefined 流進畫面', () => {
    const read = readRoleSettings({ userName: null })
    expect(read.userName).toBe('')
    expect(read.userDefine).toBe('')
  })
})

describe('只送動到的欄位', () => {
  const snapshot = {
    userName: '小明',
    userSex: 'man',
    userDefine: '一個路過的人',
    selectModel: 'relay-claude-sonnet-4-5-ripple',
    context: 1,
    thinkingDepth: '',
    sandboxLevel: '',
    jailbreak: '',
  }

  it('什麼都沒動就回 null——連請求都不該發', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot })).toBe(null)
    expect(buildRoleSettingsSavePayload('r1', snapshot, { ...snapshot })).toBe(null)
  })

  it('只動一格就只送那一格', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot, context: 3 })).toEqual({ context: 3 })
  })

  it('把自我介紹整段刪掉要真的送一個空字串過去', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot, userDefine: '' })).toEqual({ userDefine: '' })
  })

  it('虛構框架與破限詞跟其他欄位一樣，只在真的動到時才送', () => {
    expect(diffRoleSettings(snapshot, { ...snapshot, sandboxLevel: 'deep' }))
      .toEqual({ sandboxLevel: 'deep' })
    // 把破限詞清空是一個真的動作（回到預設），要送一個空字串過去
    expect(diffRoleSettings({ ...snapshot, jailbreak: '自訂' }, { ...snapshot, jailbreak: '' }))
      .toEqual({ jailbreak: '' })
  })

  it('沒帶進來的鍵完全不出現在送出的內容裡', () => {
    const payload = buildRoleSettingsSavePayload('r1', snapshot, { context: 5 })
    expect(payload).toEqual({ roleId: 'r1', context: 5 })
  })

  it('伺服器回的其他欄位不會被順手送回去', () => {
    const changed = diffRoleSettings(snapshot, {
      ...snapshot,
      userName: '小華',
      // 這一頁不碰的欄位
      roleSpeech: 'x',
      talkExample: [],
    } as any)
    expect(changed).toEqual({ userName: '小華' })
  })

  it('沒有卡片編號就不送', () => {
    expect(buildRoleSettingsSavePayload('', snapshot, { ...snapshot, context: 3 })).toBe(null)
  })

  it('這一頁只認這幾個欄位', () => {
    expect(ROLE_SETTING_KEYS).toEqual([
      'userName', 'userSex', 'userDefine', 'selectModel', 'context', 'thinkingDepth',
      'sandboxLevel', 'jailbreak',
    ])
  })

  it('context 送出去是數字，不是字串', () => {
    const changed = diffRoleSettings(snapshot, { context: '5' } as any)
    expect(changed).toEqual({ context: 5 })
    expect(typeof (changed as any).context).toBe('number')
  })
})
