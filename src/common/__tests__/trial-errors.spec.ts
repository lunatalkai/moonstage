import { describe, it, expect } from 'vitest'
import { describeTrialFailure } from '../trial-errors'
import { importAuthorDraft } from '../author-draft'

describe('describeTrialFailure', () => {
  const draft = importAuthorDraft(JSON.stringify([{ scriptName: '狀態欄', findRegex: 'a', replaceString: 'b' }, { scriptName: '特化庫', findRegex: 'c', replaceString: 'd' }]), 'r')

  it('規則過大：指名規則、KB 與上限', () => {
    const p = describeTrialFailure(413, { error: 'trial_payload_too_large', message: 'display rule #2 "特化庫" replacement is 35475 bytes; the limit is 131072 bytes', detail: { reason: 'ruleReplace', section: 'authorAsset', name: '特化庫', index: 1, max: 131072, actual: 35475, unit: 'bytes' } }, draft)
    expect(p.fixable).toBe(true)
    expect(p.lines).toEqual([{ key: 'openChat.trial.limitRule', params: { name: '特化庫', actual: 34.6, max: 128 } }])
    expect(p.serverMessage).toContain('35475')
  })

  it('規則名字伺服器沒帶時，從草稿依索引補', () => {
    const p = describeTrialFailure(413, { error: 'trial_payload_too_large', detail: { reason: 'ruleReplace', index: 0, max: 131072, actual: 200000 } }, draft)
    expect(p.lines[0].params!.name).toBe('狀態欄')
  })

  it('開場白／世界書條目／條數／檔案：各自的行', () => {
    expect(describeTrialFailure(413, { detail: { reason: 'welcome', section: 'welcome', max: 8000, actual: 8123 } }, null).lines[0]).toEqual({ key: 'openChat.trial.limitWelcome', params: { actual: 8123, max: 8000 } })
    expect(describeTrialFailure(413, { detail: { reason: 'entryContent', name: '沈栀语详细人设', index: 4, max: 3000, actual: 3120 } }, null).lines[0]).toEqual({ key: 'openChat.trial.limitEntry', params: { name: '沈栀语详细人设', actual: 3120, max: 3000 } })
    expect(describeTrialFailure(413, { detail: { reason: 'entries', max: 1000, actual: 1200 } }, null).lines[0]).toEqual({ key: 'openChat.trial.limitEntries', params: { actual: 1200, max: 1000 } })
    expect(describeTrialFailure(413, { detail: { reason: 'body', max: 4194304, actual: 5242880 } }, null).lines[0]).toEqual({ key: 'openChat.trial.limitBody', params: { actual: 5, max: 4 } })
  })

  it('不支援的值：掛載層帶值、規則缺 find 帶名字、認不得的帶伺服器原句', () => {
    expect(describeTrialFailure(400, { error: 'trial_unsupported', detail: { section: 'authorAsset', field: 'mountLayer', value: 'sideways' } }, null).lines[0]).toEqual({ key: 'openChat.trial.unsupportedMountLayer', params: { value: 'sideways' } })
    expect(describeTrialFailure(400, { error: 'trial_unsupported', detail: { section: 'authorAsset', field: 'find', index: 1 } }, draft).lines[0]).toEqual({ key: 'openChat.trial.unsupportedRuleFind', params: { name: '特化庫' } })
    const other = describeTrialFailure(400, { error: 'trial_unsupported', message: 'authorAsset.rules: something odd', detail: { section: 'authorAsset', field: 'rules', reason: 'something odd' } }, null)
    expect(other.lines[0]).toEqual({ key: 'openChat.trial.unsupportedGeneric', params: { message: 'authorAsset.rules: something odd' } })
  })

  it('其他 400 用伺服器原句；503 是暫時不可用；500 是失敗且不可修', () => {
    expect(describeTrialFailure(400, { error: 'trial_invalid_body', message: 'trial_invalid_body: name is required to create a trial' }, null)).toMatchObject({ fixable: true, lines: [{ key: 'openChat.trial.unsupportedGeneric', params: { message: 'trial_invalid_body: name is required to create a trial' } }] })
    expect(describeTrialFailure(503, { error: 'worldbook_unavailable' }, null)).toMatchObject({ fixable: false, lines: [{ key: 'openChat.trial.unavailable' }] })
    expect(describeTrialFailure(500, { error: 'boom' }, null)).toMatchObject({ fixable: false, lines: [{ key: 'openChat.trial.failed' }], serverMessage: 'boom' })
  })
})
