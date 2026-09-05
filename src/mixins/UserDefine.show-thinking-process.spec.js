// 施工單：模型思考能力三檔聲明制（邊界 7）· useUserDefine()（desktop）
//
// formData.showThinkingProcess 是純顯示層偏好（不經 server；setUserDefine 雖然
// 把整個 formData POST 出去，但 server 不需要認得這個欄位；getUserDefine 每次
// 回填都改從本地 thinking-display-pref 快取讀）。
//
// useUserDefine() 依賴 useStore()/useI18n()/getCurrentInstance() 等 Vue
// composition context，直接掛載執行成本高（對照 UserDefine.haslogin-retry.spec.js
// 的既有慣例），這裡改用原始碼斷言驗證整合點存在且接線正確。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_DEFINE_JS_PATH = path.resolve(__dirname, './UserDefine.js')

function readSource() {
	return readFileSync(USER_DEFINE_JS_PATH, 'utf-8')
}

describe('useUserDefine · showThinkingProcess 顯示層偏好（邊界 7，desktop）', () => {
	it('引入 getShowThinkingProcess 純函式', () => {
		const source = readSource()
		expect(source).toMatch(/import\s*\{\s*getShowThinkingProcess\s*\}\s*from\s*['"]@\/utils\/thinking-display-pref['"]/)
	})

	it('formData 預設 showThinkingProcess = true（顯示，摺疊）', () => {
		const source = readSource()
		expect(source).toMatch(/showThinkingProcess:\s*true,/)
	})

	it('getUserDefine() 不論走哪個分支都會用 formData.roleId 從本地偏好回填', () => {
		const source = readSource()
		expect(source).toMatch(/const getUserDefine = \([\s\S]*?formData\.showThinkingProcess = getShowThinkingProcess\(formData\.roleId\)/)
	})
})
