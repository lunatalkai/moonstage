import { defineComponent, h, ref } from 'vue'

/**
 * 單行輸入框那一個真正的 <input>。
 *
 * 跟 canvas-textarea 同一個理由：uni-app 的編譯器會把模板裡的 `<input>` 換成它自己的
 * 元件，渲染出來是 `<uni-input>` 外殼包著內層 input。外殼沒有 `.value`——就地改名時
 * 讀到的永遠是 undefined，字打了也送不出去（2026-09-04 存檔面板實走踩到）。
 * 用 h() 建的節點不經過那層轉換，測試環境與瀏覽器拿到的是同一個真 input。
 */
export default defineComponent({
  name: 'CanvasInput',
  props: {
    value: { type: String, default: '' },
    elClass: { type: String, default: '' },
    maxlength: { type: Number, default: 100 },
    ariaLabel: { type: String, default: '' },
  },
  emits: ['input', 'keydown'],
  setup(props, { emit, expose }) {
    const el = ref<HTMLInputElement | null>(null)
    expose({ el })
    return () =>
      h('input', {
        type: 'text',
        class: props.elClass,
        maxlength: props.maxlength,
        'aria-label': props.ariaLabel || undefined,
        value: props.value,
        ref: el,
        onInput: (e: Event) => emit('input', e),
        onKeydown: (e: KeyboardEvent) => emit('keydown', e),
        onClick: (e: MouseEvent) => e.stopPropagation(),
      })
  },
})
