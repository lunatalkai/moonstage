// 「我的關注」列表重複顯示 bug 的桌面端對應修復。
//
// desktop/src/pages/canvas/canvas.vue 的 loadSidebarRoles() 對「我的關注」分頁
// （sidebarCurrent === 1）套用的 dedupByRoleId 只處理
// itemType === 'conversation' 的「我的對話」項目——follow-list 的 roleList
// 項目（用 characterRoleId 識別）完全不在其去重範圍內，任何讓同一角色重複
// 進入 concat 的來源（可變排序鍵造成分頁位移等）都會讓同角色卡片無上限地
// 疊加顯示。
//
// 與 mobile/src/store/modules/chat-follow.js 的 dedupRoleListByRoleId 同語意
// （roleIdOf 取法一致：characterRoleId || roleId || id），二處邏輯必須保持一致。
function roleIdOf(item: any): string | number | undefined {
  return item && (item.characterRoleId || item.roleId || item.id)
}

// 以 roleIdOf 為鍵去重，保留既有順序（第一次出現的位置），同 roleId 以較新
// 一筆資料覆蓋該位置。
export function dedupRoleListByRoleId(list: any[]): any[] {
  if (!Array.isArray(list)) return []
  const indexByRoleId = new Map<string | number, number>()
  const result: any[] = []
  for (const item of list) {
    const id = roleIdOf(item)
    if (id == null) {
      result.push(item)
      continue
    }
    if (indexByRoleId.has(id)) {
      result[indexByRoleId.get(id) as number] = item
    } else {
      indexByRoleId.set(id, result.length)
      result.push(item)
    }
  }
  return result
}
