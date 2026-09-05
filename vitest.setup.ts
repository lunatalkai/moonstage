import { config } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-Hant',
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    'zh-Hant': {
      themeEditor: {
        tabPreview: '預覽',
        cpmTabExample: '用法範例',
        cpmTabDefinition: '組件定義',
        cpmNoDefinition: '此組件無定義資料',
        cpmAria: '{title} 預覽',
        closeAria: '關閉',
        copy: '複製',
        copied: '已複製',
        noExamplePreview: '無範例，無法預覽',
      },
      themeV3: {
        statusbar: {
          round: '第 {n} 回合',
          inventory: '物品',
          battle: '戰鬥',
          cgGallery: 'CG 圖鑑',
          cgCount: '{n} 張',
          relations: '關係',
        },
        inventory: {
          capacity: '容量',
          empty: '背包是空的',
          equipment: '裝備',
          none: '(無)',
          loot: '獲得',
        },
        slot: {
          weapon: '武器',
          armor: '防具',
          accessory: '飾品',
          helmet: '頭盔',
          boots: '靴子',
          shield: '盾牌',
          cloak: '披風',
          ring: '戒指',
        },
        minigame: {
          shareImage: '截圖分享',
          generating: '生成中',
          copy: '複製',
          copied: '已複製',
        },
        vnCg: {
          drawing: '繪製中',
          drawFailed: '繪圖失敗',
          retry: '重試',
          unlocked: '已解鎖 {n} 張 CG',
        },
        trpg: {
          success: '成功',
          fail: '失敗',
          awaitingRoll: '等待擲骰',
        },
        battle: {
          nextTurn: '下一回合',
          current: '目前行動：',
        },
      },
    },
    en: {
      themeV3: {},
    },
  },
})

config.global.plugins = [...(config.global.plugins || []), i18n]
