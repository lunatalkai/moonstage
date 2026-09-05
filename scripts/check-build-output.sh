#!/bin/bash
# 構建產物機關（硬 gate）：攔「以 . 開頭的 chunk 檔名」與「裸 `..-` 動態 import specifier」。
#
# 背景：uni-h5-vite 的 chunkFileNames 以 facade 模組相對 src 的目錄拍平命名，
# node_modules 內的動態 import chunk 會得到 `..-node_modules-*` 檔名；Rollup 見
# specifier 以 `.` 開頭不再補 `./` → 瀏覽器當裸模組標識符拒絕解析（線上事故：
# Monaco CSS 語言包 / html2canvas 動態載入全數失敗，2026-07-23）。
# vite.config.js 的 lunatalk:sanitize-chunk-file-names 插件是修復；本 gate 防回歸
#（例如 uni 升級改了命名邏輯、或插件被誤刪）。
#
# 用法： ./scripts/check-build-output.sh [assets_dir]
#        assets_dir 預設 dist/build/h5/assets
set -uo pipefail
cd "$(dirname "$0")/.."

ASSETS_DIR="${1:-dist/build/h5/assets}"
if [ ! -d "$ASSETS_DIR" ]; then
  echo "✖ assets 目錄不存在：$ASSETS_DIR（先跑 npm run build:h5）"
  exit 1
fi

bad_names=$(find "$ASSETS_DIR" -maxdepth 1 -name '.*' -type f | wc -l | tr -d ' ')
bad_imports=$(grep -rlE "import\\((\"|')\\.\\.-" "$ASSETS_DIR" 2>/dev/null | wc -l | tr -d ' ')

if [ "$bad_names" -ne 0 ] || [ "$bad_imports" -ne 0 ]; then
  echo "✖ 構建產物檢查失敗：以 . 開頭的 chunk $bad_names 個；含裸 ..- import specifier 的檔案 $bad_imports 個。"
  echo "  瀏覽器會把不以 ./ / ../ / / 開頭的 specifier 當裸模組標識符拒絕解析，"
  echo "  該 chunk 的動態載入在線上必定失敗（Monaco/html2canvas 事故同類）。"
  echo "  修法：確認 vite.config.js 的 lunatalk:sanitize-chunk-file-names 插件仍在生效。"
  find "$ASSETS_DIR" -maxdepth 1 -name '.*' -type f | head -5
  grep -rlE "import\\((\"|')\\.\\.-" "$ASSETS_DIR" 2>/dev/null | head -5
  exit 1
fi

echo "✔ 構建產物 chunk 命名 / 動態 import specifier 檢查通過"
