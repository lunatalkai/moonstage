// desktop/src/utils/bubble-id.ts
// Atomic counter for talkList bubble ids — 取代直接呼 Date.now() 避免同毫秒
// 兩次 push 撞 id（v-for 看到相同 key 會 warn `Duplicate keys detected`）。
// 與 mobile/src/utils/bubble-id.js 同邏輯，保持兩端 helper 介面一致。
//
// Algorithm: lastIssued = max(now, lastIssued + 1)。永遠單調遞增、永遠 >= clock，
// 對 clock jitter idempotent。

let lastIssued = 0

export function nextBubbleId(): number {
	const now = Date.now()
	lastIssued = now > lastIssued ? now : lastIssued + 1
	return lastIssued
}

// Test-only：清計數器讓 spec 不互相影響
export function __resetBubbleCounter(): void {
	lastIssued = 0
}
