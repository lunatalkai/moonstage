// 施工單（VIP 永久記憶被連坐關閉事故）：跟 mobile UserDefineMixin.setUserDefine
// 同一輪的形狀對齊（見 mobile/tests/chat/user-define-mixin-scoped-save.spec.js）。
//
// desktop 的 useUserDefine().setUserDefine() 依賴 useStore()/useI18n()/
// getCurrentInstance() 等 Vue composition context，直接掛載執行成本高（對照
// UserDefine.show-thinking-process.spec.js 的既有慣例）。真正的送出範圍邏輯
// 已抽成純函式 buildScopedUserDefinePayload（跟 resolveRecordNotFoundFallback
// 同慣例），這裡直接測那顆純函式，覆蓋的是 setUserDefine() 實際呼叫的同一段
// 邏輯，不是重新推導一份影子邏輯。
import { describe, it, expect } from 'vitest'
import { buildScopedUserDefinePayload } from './UserDefine'

describe('buildScopedUserDefinePayload (desktop) · 意圖範圍化存檔', () => {
	const formData = {
		roleId: 'role-1',
		backgroundUrl: 'https://old-bg.png',
		autoAudio: false,
		permanentMemory: true,
		systemPrompt: 'a carefully written system prompt',
		compactExtraInstruction: 'remember the plot twist',
	}

	it('帶 fields 時只回傳 { roleId, ...fields }，不含其他欄位', () => {
		const payload = buildScopedUserDefinePayload(formData, { backgroundUrl: 'https://new-bg.png' })
		expect(payload).toEqual({ roleId: 'role-1', backgroundUrl: 'https://new-bg.png' })
		expect(payload).not.toHaveProperty('systemPrompt')
		expect(payload).not.toHaveProperty('permanentMemory')
		expect(payload).not.toHaveProperty('compactExtraInstruction')
	})

	it('不帶 fields 時回傳整個 formData 原物件（相容既有全量存檔頁面）', () => {
		const payload = buildScopedUserDefinePayload(formData, undefined)
		expect(payload).toBe(formData)
	})

	it('fields 為空物件時仍只送 roleId（不誤退回整包）', () => {
		// 空物件是 truthy，語意上是「呼叫端明確表示不改任何欄位」，不應該退回整包。
		const payload = buildScopedUserDefinePayload(formData, {})
		expect(payload).toEqual({ roleId: 'role-1' })
	})
})

// 回歸（2026-08-09，shintou516 兩次回報）：桌面端聊天設定的儲存鍵原本寫成
// `@click="setUserDefine"`，Vue 會把 click 事件當成第一個參數傳進來。事件物件是
// truthy，於是被當成「只存這幾格」，而 DOM 事件的屬性都在原型上、展開後是空的
// ——最後送出去的只有 { roleId }，使用者填的系統提示與破限詞一格都沒送，
// 伺服器照「沒傳的欄位不要動」處理，看起來成功、實際什麼都沒存。
//
// 呼叫端寫法會再犯，所以除了改模板，這裡讓 fields 只認真正的純物件：
// 不是純物件就退回整包，把「靜默丟資料」變成「照舊全量存檔」。
describe('buildScopedUserDefinePayload · 非純物件的 fields 不得被當成範圍化存檔', () => {
	const formData = {
		roleId: 'role-1',
		systemPrompt: 'a carefully written system prompt',
		jailbreak: 'user written jailbreak text',
	}

	it('DOM 事件被誤傳成 fields 時，退回整包存檔（不得只送 roleId）', () => {
		const clickEvent = typeof Event === 'function' ? new Event('click') : { type: 'click' }
		const payload = buildScopedUserDefinePayload(formData, clickEvent)
		expect(payload).toBe(formData)
		expect(payload).toHaveProperty('systemPrompt')
		expect(payload).toHaveProperty('jailbreak')
	})

	it('陣列、字串、數字同樣不算 fields', () => {
		for (const bogus of [['systemPrompt'], 'systemPrompt', 1]) {
			expect(buildScopedUserDefinePayload(formData, bogus)).toBe(formData)
		}
	})
})
