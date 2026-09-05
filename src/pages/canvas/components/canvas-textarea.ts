import { defineComponent, h, ref } from 'vue'

/**
 * 輸入框那一個真正的 <textarea>。
 *
 * ── 為什麼不是寫在模板裡 ──
 * uni-app 的編譯器會把模板裡的 `<textarea>` 換成它自己的元件，渲染出來是
 * `<uni-textarea>` 外殼包著兩個內層 textarea。作者的卡片抓到的是外殼，
 * 而外殼沒有 `.value`——它的腳本做的 `el.value = txt` 會靜默落到 textContent 上，
 * 字進不了輸入框，作者只會看到「按鈕點了沒反應」。
 *
 * 用 h() 建的節點不經過那層編譯轉換，測試環境與瀏覽器拿到的是同一個真 textarea。
 *
 * 節點名由呼叫端給：輸入框是卡片 querySelector 的 `.uni-textarea-textarea`
 * 加上酒館的 `#send_textarea`；編輯框是酒館的 `.edit_textarea`。
 */
export default defineComponent({
  name: 'CanvasTextarea',
  props: {
    value: { type: String, default: '' },
    /** 節點名照卡片的期待來，所以由呼叫端指定 */
    elId: { type: String, default: '' },
    elClass: { type: String, default: '' },
  },
  emits: ['input', 'keydown', 'compositionstart', 'compositionend', 'focus', 'blur'],
  setup(props, { emit, expose }) {
    const el = ref<HTMLTextAreaElement | null>(null)
    expose({ el })
    return () =>
      h('textarea', {
        id: props.elId || undefined,
        class: props.elClass,
        rows: 1,
        value: props.value,
        ref: el,
        onInput: (e: Event) => emit('input', e),
        onKeydown: (e: KeyboardEvent) => emit('keydown', e),
        onCompositionstart: () => emit('compositionstart'),
        onCompositionend: () => emit('compositionend'),
        onFocus: () => emit('focus'),
        onBlur: () => emit('blur'),
      })
  },
})
