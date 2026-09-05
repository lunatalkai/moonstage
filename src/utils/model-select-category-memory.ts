// 使用者這一輪 App 生命週期裡最後**主動**切到的模型分類。
//
// 為什麼需要它：選單每次進頁都是新的組件實例，初始狀態會整份重來，於是
// 「有沒有人動過分類」這件事在離開頁面的瞬間就沒了。少了這層記憶，進頁時的
// 「跳到目前使用中的模型所屬分類」會在每一次回頁時重放一遍——使用者切到 GLM
// 看了一半、離開再回來，畫面又被拉回自己正在用的那一家，剛剛看到哪裡全丟。
//
// 只活在記憶體裡，刻意不落地：重開 App 之後回到「跳到目前模型」才是最有用的
// 起點；而同一輪裡使用者剛表達過的瀏覽意圖應該蓋過那個預設。
//
// 記的是分類名不是索引——分類清單由伺服器下發，順序會變。
//
// 這份記憶不分角色：在 A 角色瀏覽到 GLM，開 B 角色的選單也會停在 GLM。
// 那是刻意的取捨——使用者比較模型時本來就跨角色，記憶跟著人比跟著角色合理。
//
// mobile 有一份同語意的 .js，兩份都改。

// 「全部」在兩端的內部值不同（mobile 是 'all'，desktop 是 tabCurrent -1），
// 呼叫端各自正規化成這個哨兵值再交給這裡。
export const ALL_CATEGORY = 'all'

let browsedCategoryKey = ''

export function rememberBrowsedCategory(key: string): void {
	browsedCategoryKey = key || ''
}

export function browsedCategory(): string {
	return browsedCategoryKey
}

export function forgetBrowsedCategory(): void {
	browsedCategoryKey = ''
}
