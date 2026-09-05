/**
 * 作者資產掛載的共用測試夾具。
 *
 * 兩端逐位元組相同，由 check-author-runtime-parity.mjs 擋著。
 * 兩端的測試框架不同，案例只有這一份。
 */

/** 兩端各自的層級取值（Task 1 盤點結果）。兩端 under/over 同值，cover 必須分端。 */
const LAYER_Z_INDEX = {
  desktop: { under: 12, over: 30, cover: 1000 },
  mobile: { under: 12, over: 30, cover: 997 },
}

/** 平台承諾會發給作者的事件；拼錯的名字必須被忽略而不是靜默訂閱成功。 */
const VALID_EVENTS = [
  'message:mount',
  'message:done',
  'conversation:switch',
  'theme:change',
  'dispose',
]

const INVALID_EVENTS = ['message:mounted', 'ready', 'messageMount', '']

/** 三個合法容器，以及會被歸位到 under 的無效值。 */
const VALID_LAYERS = ['under', 'over', 'cover']
const FALLBACK_LAYER_INPUTS = ['floating', '', null, undefined, 'COVER']

export {
  LAYER_Z_INDEX,
  VALID_EVENTS,
  INVALID_EVENTS,
  VALID_LAYERS,
  FALLBACK_LAYER_INPUTS,
}
