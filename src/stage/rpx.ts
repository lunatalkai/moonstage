/**
 * rpx 的執行時換算。
 *
 * uni 的 H5 編譯器把 `Nrpx` 換成依視窗寬度縮放的長度：視窗 ≤ rpxCalcMaxDeviceWidth（960）時
 * 1rpx = 視窗寬 / 750；更寬時退回以 375 為基準，1rpx = 0.5px（manifest.json 的預設）。
 * 套件 build 沒有 uni 編譯器，改成把 `Nrpx` 編成 `calc(N * var(--ms-rpx))`，
 * 這裡在舞台根元素上維護 `--ms-rpx`，規則跟 uni 逐字相同。
 */
export const RPX_MAX_DEVICE_WIDTH = 960
export const RPX_BASE_DEVICE_WIDTH = 375
export const RPX_DESIGN_WIDTH = 750

export function rpxUnitPx(viewportWidth: number): number {
  const width = viewportWidth > RPX_MAX_DEVICE_WIDTH ? RPX_BASE_DEVICE_WIDTH : viewportWidth
  return width / RPX_DESIGN_WIDTH
}

/** 在根元素上維護 --ms-rpx，回傳解除函式。 */
export function installRpxVar(root: HTMLElement, win: Window = window): () => void {
  const apply = () => root.style.setProperty('--ms-rpx', rpxUnitPx(win.innerWidth) + 'px')
  apply()
  win.addEventListener('resize', apply)
  return () => win.removeEventListener('resize', apply)
}
