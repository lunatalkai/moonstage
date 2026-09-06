/**
 * 開放 API v1 的端點表。
 *
 * 從 main.js 抽出來：舞台套件（src/stage）不能 import main.js（那會建立整個 app），
 * 但它跟 playground 要用同一張表——路徑寫兩份遲早會漂。
 * 路徑一律相對（/open/v1/...），主機由 http.create({ host }) 決定。
 */
const V1 = '/open/v1';
export const requestUrl = {
	// 對話核心迴圈
	chatStart: `${V1}/conversation/start`,
	chatStop: `${V1}/conversation/stop`,
	rewriteChat: `${V1}/conversation/rewrite-by-id`,
	rewriteChatByContent: `${V1}/conversation/rewrite`,
	chatOperationStatus: `${V1}/conversation/operations`,
	getReplay: `${V1}/conversation/replay`,
	historyMessageList: `${V1}/conversation/messages`,
	chatList: `${V1}/conversation/list`,
	deleteConversation: `${V1}/conversation/delete`,
	chatDelete: `${V1}/conversation/delete-message`,
	saveAndStartNew: `${V1}/conversation/save-and-start-new`,
	// 存檔：這張卡的對話清單（依 roleId）、改名、切到某一段、在最新節點分叉。
	// 每張卡最多 20 段——save-and-start-new 與 fork 滿了回 409 conversation_limit_reached。
	conversationArchives: `${V1}/conversation/archives`,
	conversationTitle: `${V1}/conversation/title`,
	conversationSwitch: `${V1}/conversation/switch`,
	conversationFork: `${V1}/conversation/fork`,
	// 劇情回溯。路由是通的（2026-09-03 對正式站實測回 400 missing_conversation_id，
	// 不是 404）；缺的是使用者這一端的入口——原本的檢查點選單屬於對話歷史面板，
	// 這個客戶端沒有那個面板。目前只有「伺服器回傳一個沒跑完的回溯」時才會走到。
	loadConversation: `${V1}/conversation/backward`,
	chatWsTicket: `${V1}/conversation/ws-ticket`,
	// 幫答：替玩家寫下一句，填進輸入框由玩家送出。
	chatSuggestReply: `${V1}/conversation/suggest-reply`,

	// 角色與遊玩所需的讀路徑
	getRoleDetail: `${V1}/role/detail`,
	// 試玩卡：把本機的酒館卡建成一張會自動到期的私有卡（PUT/GET/DELETE …/{clientKey}）。
	trialCards: `${V1}/trial-cards`,
	authorAssetServe: `${V1}/role/author-asset/serve`,
	// 外觀偏好（桌布、字體）。送出那一輪不讀它——讀的是下面那一份。
	playerPreference: `${V1}/player/preference`,
	playerPreferenceSave: `${V1}/player/preference/save`,
	// 這張卡的遊玩設定：稱呼、自我介紹、模型／線路、上下文檔位、思考深度。
	// **送出那一輪讀的是這一份**，寫進外觀偏好不會生效。
	playerRoleSettings: `${V1}/player/role-settings`,
	playerRoleSettingsSave: `${V1}/player/role-settings/save`,
	// 深入準備（Agent 模式）與劇情摘要偏好
	playerAgentMode: `${V1}/player/agent-mode`,
	playerCompactPreference: `${V1}/player/compact-preference`,
	getModelListV2: `${V1}/models`,
	modelUptimeHistory: `${V1}/models/uptime-history`,
	// 長期指令（這段對話一直有效的要求）
	conversationDirectives: `${V1}/conversation/directives`,
	conversationDirectiveAdd: `${V1}/conversation/directive/add`,
	conversationDirectiveUpdate: `${V1}/conversation/directive/update`,
	conversationDirectiveDelete: `${V1}/conversation/directive/delete`,
	// 手帳（只有玩家看得到的筆記）與它的範本
	// 這則回覆的組成（上下文 chip 點開的那一片；回的是這段對話最近一次完成的回覆）
	promptDiagnostics: `${V1}/conversation/prompt-diagnostics`,
	// AI 記事本／永久記憶：路徑參數用 {conversationId}／{atomId}，呼叫端自己 replace（同 mobile）
	memoryAtoms: `${V1}/conversation/memory/{conversationId}/atoms`,
	memoryDeleteAtom: `${V1}/conversation/memory/{conversationId}/atoms/{atomId}`,
	conversationNotepad: `${V1}/conversation/notepad`,
	conversationNotepadSave: `${V1}/conversation/notepad/save`,
	notepadTemplates: `${V1}/notepad/templates`,
	notepadTemplate: `${V1}/notepad/template`,
	notepadTemplateSave: `${V1}/notepad/template/save`,
	notepadTemplateDelete: `${V1}/notepad/template/delete`,
	notepadTemplateShare: `${V1}/notepad/template/share`,
	notepadTemplateShareRevoke: `${V1}/notepad/template/share/revoke`,
	shareCodePreview: `${V1}/share/preview`,
	shareCodeImport: `${V1}/share/import`,
	worldbookDetail: `${V1}/worldbook/detail`,
	worldbookEntryList: `${V1}/worldbook/entry/list`,
}

export default requestUrl
