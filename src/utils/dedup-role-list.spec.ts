import { describe, it, expect } from 'vitest'
import { dedupRoleListByRoleId } from './dedup-role-list'

describe('dedupRoleListByRoleId（我的關注列表重複顯示回歸測試）', () => {
  it('同一 roleId 出現兩次時只保留一筆', () => {
    const list = [
      { characterRoleId: 'r1', roleName: 'Aiko v1' },
      { characterRoleId: 'r1', roleName: 'Aiko v2' },
    ]
    const result = dedupRoleListByRoleId(list)
    expect(result.length).toBe(1)
    expect(result[0].roleName).toBe('Aiko v2')
  })

  it('混合新舊角色時，只去重重複的 roleId，新角色保留', () => {
    const list = [
      { characterRoleId: 'r1', roleName: 'Aiko' },
      { characterRoleId: 'r1', roleName: 'Aiko' },
      { characterRoleId: 'r2', roleName: 'Beni' },
    ]
    const result = dedupRoleListByRoleId(list)
    expect(result.map(r => r.characterRoleId).sort()).toEqual(['r1', 'r2'])
  })

  it('去重後保留既有順序（第一次出現的位置）', () => {
    const list = [
      { characterRoleId: 'r1' },
      { characterRoleId: 'r2' },
      { characterRoleId: 'r1' },
      { characterRoleId: 'r3' },
    ]
    const result = dedupRoleListByRoleId(list)
    expect(result.map(r => r.characterRoleId)).toEqual(['r1', 'r2', 'r3'])
  })
})
