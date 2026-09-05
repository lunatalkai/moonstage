/**
 * 幾個還沒有型別的 JS 模組的宣告。
 *
 * 這一頁的 TS 模組會匯入一批純 JS 的工具（字形轉換、易混字表、顯示規則引擎…）。
 * 在 strict 底下，每一個沒有宣告檔的匯入都會長出一條 TS7016，而那條錯誤講的不是
 * 「這裡寫錯了」，是「那支模組還沒補型別」——兩件事混在同一份輸出裡，真正的型別
 * 錯誤就會被淹掉。
 *
 * 這裡把它們宣告成 any：不假裝知道它們的形狀（那會是更糟的謊），只是讓「缺宣告」
 * 這件事不再每次都重報一遍。哪一支補上真正的型別，就把它從這裡拿掉。
 */

declare module 'opencc-js'
declare module '@/common/TradOrSimp'
declare module '@/common/ambiguous-chars'
declare module '@/utils/display-rule-engine.js'
declare module '@/utils/rich-text-renderer.js'
