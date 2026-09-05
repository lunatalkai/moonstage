import { describe, it, expect } from 'vitest'
import { importAuthorDraft, draftToAuthorAsset, DraftImportError, stripFileExtension } from '../author-draft'

describe('importAuthorDraft', () => {
  it('認得 MMD 的正則清單 API 回包（regex/content 欄位，/pattern/flags 字串原樣保留）', () => {
    const text = JSON.stringify({
      code: 200,
      data: [
        { id: 10, roleId: 1, name: '狀態欄', regex: '/<hud>([\\s\\S]*?)<\\/hud>/g', content: '<div class="hud">$1</div>', version: 0, regexSort: 1 },
        { id: 11, roleId: 1, name: '', regex: 'plain', content: 'text' },
      ],
    })
    const d = importAuthorDraft(text, 'ba')
    expect(d.format).toBe('mmd-regex-list')
    expect(d.source).toBe('mmd')
    expect(d.name).toBe('ba')
    expect(d.rules).toHaveLength(2)
    expect(d.rules[0]).toMatchObject({ id: 10, name: '狀態欄', find: '/<hud>([\\s\\S]*?)<\\/hud>/g', replace: '<div class="hud">$1</div>', enabled: true })
    expect(d.rules[1].name).toBe('#2')
  })

  it('認得裸陣列形式的 MMD 清單', () => {
    const d = importAuthorDraft(JSON.stringify([{ name: 'a', regex: '/x/g', content: 'y' }]))
    expect(d.format).toBe('mmd-regex-list')
    expect(d.rules[0].find).toBe('/x/g')
  })

  it('認得 MMD 匯入酬載：rules + statusbar + pageDepth + welcome', () => {
    const d = importAuthorDraft(JSON.stringify({
      roleName: '基沃托斯', welcome: '<zzt>導覽</zzt>', statusbar: '<ba-init>', pageDepth: 'top',
      rules: [{ id: 1, name: 'r', find: '/<ba-init>/g', replace: '<b>hud</b>' }],
    }))
    expect(d.format).toBe('mmd-payload')
    expect(d.name).toBe('基沃托斯')
    expect(d.mountTrigger).toBe('<ba-init>')
    expect(d.mountLayer).toBe('over')
    expect(d.opening).toBe('<zzt>導覽</zzt>')
    expect(d.rules[0]).toMatchObject({ find: '/<ba-init>/g', replace: '<b>hud</b>' })
  })

  it('認得 MMD 的匯出檔：頂層 regex_scripts（酒館欄位名）+ statusbar + beginning + pageDepth 數字', () => {
    const d = importAuthorDraft(JSON.stringify({
      pageDepth: 2,
      statusbar: '【網頁美化】【狀態欄點火】',
      beginning: '第一句開場',
      regex_scripts: [
        { id: 1, scriptName: '網頁美化', findRegex: '/【網頁美化】/g', replaceString: '<style>.kg{}</style>' },
        { id: 2, scriptName: '狀態欄', findRegex: '/<hud>([\\s\\S]*?)<\\/hud>/g', replaceString: '<div>$1</div>' },
      ],
    }), '我的卡')
    expect(d.format).toBe('mmd-export')
    expect(d.source).toBe('mmd')
    expect(d.name).toBe('我的卡')
    expect(d.mountTrigger).toBe('【網頁美化】【狀態欄點火】')
    expect(d.mountLayer).toBe('over')
    expect(d.opening).toBe('第一句開場')
    expect(d.rules).toHaveLength(2)
    expect(d.rules[0]).toMatchObject({ id: 1, name: '網頁美化', find: '/【網頁美化】/g', replace: '<style>.kg{}</style>', enabled: true })
  })

  it('酒館規則：留 trimStrings、對應 disabled 與 promptOnly，只作用在使用者輸入的規則不進顯示層', () => {
    const d = importAuthorDraft(JSON.stringify([
      { scriptName: '狀態', findRegex: '/<s>(.*?)<\\/s>/g', replaceString: '<i>$1</i>', trimStrings: ['x'], placement: [2], disabled: false },
      { scriptName: '關掉的', findRegex: 'a', replaceString: 'b', disabled: true },
      { scriptName: '只給模型', findRegex: 'c', replaceString: 'd', placement: [1] },
      { scriptName: '沒寫位置', findRegex: 'e', replaceString: 'f' },
    ]))
    expect(d.format).toBe('st-regex')
    expect(d.source).toBe('tavern')
    expect(d.rules.map((r) => r.name)).toEqual(['狀態', '關掉的', '沒寫位置'])
    expect(d.rules[0].trimStrings).toEqual(['x'])
    expect(d.rules[0].enabled).toBe(true)
    expect(d.rules[1].enabled).toBe(false)
  })

  it('酒館單一規則物件也吃', () => {
    const d = importAuthorDraft(JSON.stringify({ scriptName: 'solo', findRegex: '/a/g', replaceString: 'b' }))
    expect(d.format).toBe('st-regex')
    expect(d.name).toBe('solo')
    expect(d.rules).toHaveLength(1)
  })

  it('酒館 V2 卡：規則從 data.extensions.regex_scripts 來，開場白用 first_mes', () => {
    const d = importAuthorDraft(JSON.stringify({
      spec: 'chara_card_v2', spec_version: '2.0',
      data: { name: 'Alice', first_mes: '你好', extensions: { regex_scripts: [{ scriptName: 's', findRegex: '/x/g', replaceString: 'y' }] } },
    }))
    expect(d.format).toBe('st-card')
    expect(d.name).toBe('Alice')
    expect(d.opening).toBe('你好')
    expect(d.source).toBe('tavern')
    expect(d.rules).toHaveLength(1)
  })

  it('我們自己的資產形狀（含 role_get_author_asset 的 authorAsset 包裝）', () => {
    const asset = { mountLayer: 'over', mountTrigger: '<t>', pageMode: 'immersive', rules: [{ id: 1, name: 'r', find: '/<t>/g', replace: 'x', enabled: true }], status: 'active', variants: { '书': '書' }, version: 3 }
    const d1 = importAuthorDraft(JSON.stringify(asset), 'mine')
    expect(d1.format).toBe('moonstage-asset')
    expect(d1.immersive).toBe(true)
    expect(d1.mountTrigger).toBe('<t>')
    expect(d1.rules[0].find).toBe('/<t>/g')
    const d2 = importAuthorDraft(JSON.stringify({ authorAsset: asset }), 'mine')
    expect(d2.format).toBe('moonstage-asset')
  })

  it('壞 JSON、空清單、認不得的形狀各自有理由', () => {
    expect(() => importAuthorDraft('{not json')).toThrow(DraftImportError)
    expect(() => importAuthorDraft('{not json')).toThrowError('invalid-json')
    expect(() => importAuthorDraft('[]')).toThrowError('empty')
    expect(() => importAuthorDraft('{"foo":1}')).toThrowError('unknown-format')
    expect(() => importAuthorDraft('"str"')).toThrowError('unknown-format')
  })
})

describe('draftToAuthorAsset', () => {
  it('產出跟 authorAssetServe 一樣的形狀，簡繁對照表為空', () => {
    const d = importAuthorDraft(JSON.stringify({ roleName: 'x', statusbar: '<s>', pageDepth: 'top', rules: [{ name: 'a', find: 'b', replace: 'c' }] }))
    const asset = draftToAuthorAsset(d)
    expect(asset).toMatchObject({ mountTrigger: '<s>', mountLayer: 'over', pageMode: 'normal', source: 'mmd', variants: null })
    expect(asset.rules).toBe(d.rules)
  })
})

describe('stripFileExtension', () => {
  it('去掉副檔名', () => {
    expect(stripFileExtension('regex.json')).toBe('regex')
    expect(stripFileExtension('狀態欄 v2.JSON')).toBe('狀態欄 v2')
    expect(stripFileExtension('noext')).toBe('noext')
  })
})
