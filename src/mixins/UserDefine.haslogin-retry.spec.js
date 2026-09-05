// 工單 #45（P1，跟 mobile 同一顆競態，見 mobile 的對應測試
// 的完整根因記錄，DESIGN.md「Desktop + Mobile 改同一功能必須同一 agent 一起做」）：
//
// useUserDefine() 的 onMounted() 目前寫法：
//   onMounted(() => { if (unref(hasLogin)) { getUserDefine() } })
// 是一次性檢查、沒有補救機制。若元件掛載那一刻 hasLogin 恰好是 false（訪客身分
// 先看到聊天頁、登入疊層蓋在上面——見 LoginMixin.js 的 loginTipShow 邏輯，不是
// 阻擋渲染），使用者之後在原地登入（store.commit('login', ...)），hasLogin 變
// true，但 getUserDefine() 永遠不會被觸發——formData.selectModelName 永久卡在
// data() 佔位字面值 "BaseModel"，跟 mobile 回報的「退出聊天再進變回普通模型」
// 是同一顆競態的桌面版。
//
// 修復：加一個 watch(hasLogin, ...)，只要「尚未 fetch 過」且 hasLogin 變 true
// 就補一次 getUserDefine()——跟 onMounted 共用同一個「已 fetch 過」旗標，避免
// 兩邊疊加成兩次呼叫。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_DEFINE_JS_PATH = path.resolve(__dirname, './UserDefine.js')

function readSource() {
	return readFileSync(USER_DEFINE_JS_PATH, 'utf-8')
}

describe('工單 #45 · useUserDefine onMounted 的 hasLogin 一次性檢查沒有補救機制（persistent 卡死根因）', () => {
	it('RED（重現餓死）：onMounted 執行當下 hasLogin=false，之後 hasLogin 變 true，沒有 watch 補救的話 getUserDefine 永遠不會被呼叫', () => {
		let hasLogin = false
		let getUserDefineCalls = 0
		const getUserDefine = () => { getUserDefineCalls += 1 }

		// 目前 UserDefine.js 的 onMounted() 寫法：一次性 if 檢查，無補救。
		const currentOnMounted = () => {
			if (hasLogin) {
				getUserDefine()
			}
		}
		currentOnMounted()
		expect(getUserDefineCalls).toBe(0)

		// 使用者之後登入，hasLogin 變 true——沒有任何機制會補呼叫。
		hasLogin = true
		expect(getUserDefineCalls).toBe(0) // 卡死：跟 mobile rongronggo 回報的持續卡死同構
	})

	it('GREEN（修復後行為）：watch(hasLogin) 補一次呼叫，且跟 onMounted 共用同一個「已 fetch 過」旗標，不會疊加成兩次', () => {
		let hasLogin = false
		let getUserDefineCalls = 0
		let hasFetchedInitialUserDefine = false
		const getUserDefine = () => { getUserDefineCalls += 1 }

		const currentOnMounted = () => {
			if (hasLogin && !hasFetchedInitialUserDefine) {
				hasFetchedInitialUserDefine = true
				getUserDefine()
			}
		}
		// 修復後 UserDefine.js 的 watch(hasLogin, ...) 行為
		const hasLoginWatcher = (newVal) => {
			if (newVal && !hasFetchedInitialUserDefine) {
				hasFetchedInitialUserDefine = true
				getUserDefine()
			}
		}

		currentOnMounted() // hasLogin=false，短路
		expect(getUserDefineCalls).toBe(0)

		hasLogin = true
		hasLoginWatcher(true) // 補一次
		expect(getUserDefineCalls).toBe(1)

		// 反向次序：onMounted 先贏（hasLogin 一開始就 true）時，watcher 之後
		// 觸發（例如短暫 logout 又 login）不得疊加成第二次。
		let hasLogin2 = true
		let calls2 = 0
		let fetched2 = false
		const getUserDefine2 = () => { calls2 += 1 }
		const onMounted2 = () => { if (hasLogin2 && !fetched2) { fetched2 = true; getUserDefine2() } }
		const watcher2 = (v) => { if (v && !fetched2) { fetched2 = true; getUserDefine2() } }
		onMounted2()
		expect(calls2).toBe(1)
		watcher2(true)
		expect(calls2).toBe(1) // 已 fetch 過，watcher no-op
	})
})

describe('工單 #45 · UserDefine.js 原始碼鎖：watch(hasLogin, ...) 補觸發，不繞過既有 onMounted 邏輯', () => {
	const source = readSource()

	it('import 了 watch（vue composition API）', () => {
		expect(source).toMatch(/import\s*\{[\s\S]*\bwatch\b[\s\S]*\}\s*from\s*['"]vue['"]/)
	})

	it('存在 watch(hasLogin, ...) 呼叫，且內部會呼叫 getUserDefine()', () => {
		const watchIdx = source.indexOf('watch(hasLogin')
		expect(watchIdx).toBeGreaterThan(-1)
		const watchBody = source.slice(watchIdx, watchIdx + 400)
		expect(watchBody).toMatch(/getUserDefine\(\)/)
	})

	it('onMounted 與 watch(hasLogin) 共用同一個「已 fetch 過」旗標（避免疊加成兩次呼叫）', () => {
		const onMountedIdx = source.indexOf('onMounted(() => {')
		expect(onMountedIdx).toBeGreaterThan(-1)
		const onMountedBody = source.slice(onMountedIdx, onMountedIdx + 400)

		const watchIdx = source.indexOf('watch(hasLogin')
		const watchBody = source.slice(watchIdx, watchIdx + 400)

		// 兩處共用同一個旗標識別字（名稱不寫死，只驗證同一個字面出現在兩邊）
		const flagMatch = onMountedBody.match(/(\w*[Ff]etched\w*)\.value/)
		expect(flagMatch).not.toBeNull()
		const flagName = flagMatch[1]
		expect(watchBody).toContain(flagName + '.value')
	})
})
