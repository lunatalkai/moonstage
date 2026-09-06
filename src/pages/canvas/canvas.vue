<template>
  <!--
    Open Canvas。

    這一頁只有畫布：沒有側欄、沒有平台的元件庫、沒有第二套 UI。卡片的 CSS 沒有
    沙盒，文件裡多一塊介面就多一塊會被卡片弄壞、而作者根本不知道它存在的東西。

    每個區塊的節點名是作者手上那張卡打得到的名字（見 canvas-dom-contract.ts）。
    我們自己的 class 不做承諾，data-lt 做。
  -->
  <div class="canvas-root chat" :class="{ 'is-touch': isTouchDevice, 'lt-format-mmd': cardFormat === 'mmd' }">
    <CanvasHeader
      :role-name="convertPlainText(roleView.roleName || '', displayScript)"
      :avatar="cfImage(roleView.roleAvatar, 'avatarMedium')"
      :model-name="formData.selectModelName"
      :badge="previewDraft ? t('openChat.preview.badge') : (trialCard ? t('openChat.trial.badge') : '')"
      :show-model="!previewOnly"
      :back-label="t('common.back')"
      :model-label="t('chat.modelSelectAria')"
      @back="goBackToEntry"
      @model="openModelSelect"
    />

    <CanvasStage :background-url="playerBackgroundUrl" @scroll="onStageScroll">
      <CanvasIntro :text="introText" :open="introOpen" @toggle="introOpen = !introOpen" />

      <CanvasMessage
        v-for="(item, index) in talkList"
        :key="item.id != null ? item.id : index"
        :id="'msg-' + item.id"
        :message="messageProps(item, index)"
        :labels="messageLabels"
        :menu-label="t('canvas.actions.more')"
        @menu="openMessageMenu(index, $event)"
        @action="onMessageAction($event, index)"
        @swipe="onGreetingSwipe"
      >
        <!--
          誠實的失敗（I-1）。這一則為什麼停在這裡、現在能做什麼，就掛在它自己
          那一列底下——不另開一個玩家得去別處找的地方。
        -->
        <chat-system-message
          v-if="item.type == 0 && item.chatFinish && !item.agentInterrupted && !['resume_unavailable', 'compact_no_input'].includes(item.finishReason) && getSystemMsgKind(item.finishReason)"
          :kind="getSystemMsgKind(item.finishReason)"
          :label="getSystemMsgLabel(item.finishReason)"
          :sub="getSystemMsgSub(item.finishReason)"
          :cta="getSystemMsgCta(item.finishReason, item, index)"
          :cta-action="getSystemMsgCtaAction(item.finishReason, item, index)"
          :ctas="getSystemMsgCtas(item, index)"
          @cta="onSystemMsgCta($event, item, index)"
        ></chat-system-message>
      </CanvasMessage>

      <!-- MMD 的「你可以選擇開場」：訊息列之後的獨立區塊（照 MMD 的 DOM 位置）。
           點一條把那句話填進輸入框，由玩家自己送出——不是換開場白。 -->
      <CanvasPrologue :title="prologueTitle" :items="prologueItems" @pick="onProloguePick" />
    </CanvasStage>

    <CanvasComposer
      ref="composerRef"
      :value="content"
      :placeholder="t('canvas.placeholder')"
      :send-state="composerSendState"
      :generating="isGenerating"
      :enter-sends="!isTouchDevice"
      :shortcuts="shortcutItems"
      :more-open="panel.more"
      :more-items="moreItems"
      :model-score="modelScoreText"
      :labels="composerLabels"
      @update:value="content = $event"
      @send="onCanvasSend"
      @continue="onCanvasSend"
      @stop="onCanvasStop"
      @more="panel = toggleMore(panel)"
      :assist-busy="assistBusy"
      :assist-cost="ASSIST_COST"
      @assist="onAssist"
      @more-pick="onPanelPick"
      @model="openModelSelect"
      @shortcut="onShortcut"
    />

    <CanvasMessageMenu
      :open="menuOpen"
      :editing="menuEditing"
      :draft="menuDraft"
      :message="menuMessage"
      :actions="menuActions"
      :labels="menuLabels"
      :anchor="menuAnchor"
      @update:draft="menuDraft = $event"
      @pick="onMenuPick"
      @close="closeMessageMenu"
      @cancel-edit="closeMessageMenu"
      @confirm-edit="onMenuConfirmEdit"
    />

    <!--
      彈層一律留在這一頁。換頁等於把卡片的裝修整個丟掉——玩家看到的是「按一下就
      變成另一個網站」，而作者的 CSS 只作用在這一頁。殼共用一份，裡面換不同的
      `.xxx-scope`（那才是作者認得的名字）。
    -->
    <CanvasPopup :open="panel.sheet === 'model'" :title="t('canvas.panel.model')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasModelPanel
        mode="model"
        :open="panel.sheet === 'model'"
        :title="t('canvas.panel.model')"
        :role-id="roleId"
        :selected-value="selectedVariantValue"
        :model-name="formData.selectModelName"
        :score-text="modelScoreText"
        :score-dynamic="modelScoreDynamic"
        :context-value="formData.context"
        :thinking-depth="formData.thinkingDepth"
        :show-thinking-process="formData.showThinkingProcess !== false"
        :labels="modelPanelLabels"
        @apply="onApplyModelSettings"
        @close="closeCanvasSheet"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'conversations'" :title="t('canvas.archive.load')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasConversationList
        :title="t('canvas.archive.load')"
        :count-text="archiveCountText"
        :items="archiveRows"
        :empty-text="t('canvas.panel.historyEmpty')"
        :current-label="t('canvas.panel.historyCurrent')"
        :close-text="t('main.cancel')"
        :full="archivesFull"
        :full-text="archiveFullText"
        :labels="archiveActionLabels"
        @pick="onPickArchive"
        @rename="onRenameArchive"
        @delete="onDeleteArchive"
        @close="closeCanvasSheet"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'background'" :title="t('canvas.panel.background')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasModify
        :title="t('canvas.panel.background')"
        :items="backgroundOptions"
        @pick="onPickBackground"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'font'" :title="t('canvas.panel.font')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasModify
        :title="t('canvas.panel.fontHint')"
        :items="fontOptions"
        @pick="onPickFont"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'persona'" :title="t('canvas.panel.persona')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasPersona
        :user-name="formData.userName"
        :user-sex="formData.userSex"
        :user-define="formData.userDefine"
        :sandbox-level="formData.sandboxLevel"
        :jailbreak="formData.jailbreak"
        :default-jailbreak="defaultJailbreak"
        :sex-options="personaSexOptions"
        :sandbox-options="personaSandboxOptions"
        :saving="personaSaving"
        :error="personaError"
        :labels="personaLabels"
        @save="onSavePersona"
        @close="closeCanvasSheet"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'directives'" :title="t('directive.title')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasDirectives
        :list="directives.list"
        :count-text="directiveCountText(directives)"
        :max-length="directives.maxLength"
        :loading="directives.loading"
        :load-failed="directives.loadFailed"
        :has-conversation="Boolean(conversationId)"
        :can-add="canAddDirective(directives, Boolean(conversationId))"
        :draft="directives.draft"
        :editing-source-id="directives.editingSourceId"
        :editing-text="directives.editingText"
        :pending-delete-id="directivePendingDeleteId"
        :error="directives.error"
        :labels="directiveLabels"
        @add="onAddDirective"
        @edit="onEditDirective"
        @save-edit="onSaveDirectiveEdit"
        @cancel-edit="directives = cancelEditDirective(directives)"
        @ask-delete="directivePendingDeleteId = $event"
        @confirm-delete="onDeleteDirective"
        @cancel-delete="directivePendingDeleteId = ''"
        @retry="loadDirectives"
        @close="closeCanvasSheet"
        @update:draft="directives.draft = $event"
        @update:editing-text="directives.editingText = $event"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'notepad'" :title="t('notepad.title')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasNotepad
        :draft="notepad.draft"
        :saved-content="notepad.savedContent"
        :max-length="notepad.maxLength"
        :discount-threshold="notepad.discountThreshold"
        :loading="notepad.loading"
        :load-failed="notepad.loadFailed"
        :saving="notepad.saving"
        :has-conversation="Boolean(conversationId)"
        :templates-open="notepad.templatesOpen"
        :templates="notepad.templates"
        :code="notepad.code"
        :previewing="notepad.previewing"
        :preview-open="notepad.previewOpen"
        :preview-title="notepad.previewTitle"
        :preview-content="notepad.previewContent"
        :importing="notepad.importing"
        :share-open="notepad.shareOpen"
        :share-code="notepad.shareCode"
        :copy-open="notepad.copyOpen"
        :conversations="notepadCopyRows"
        :error="notepad.error"
        :labels="notepadLabels"
        @save="onSaveNotepad"
        @retry="loadNotepad"
        @toggle-templates="onToggleNotepadTemplates"
        @apply-template="onApplyNotepadTemplate"
        @save-template="onSaveNotepadTemplate"
        @update:code="notepad.code = $event"
        @preview-code="onPreviewShareCode"
        @cancel-preview="onCancelSharePreview"
        @confirm-import="onConfirmShareImport"
        @share-template="onShareNotepadTemplate"
        @delete-template="onDeleteNotepadTemplate"
        @copy-share-code="onCopyShareCode"
        @revoke-share="onRevokeShare"
        @close-share="onCloseShare"
        @toggle-copy="onToggleNotepadCopy"
        @copy-from="onCopyNotepadFrom"
        @close="closeCanvasSheet"
        @update:draft="notepad.draft = $event"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'context-breakdown'" :title="t('promptBreakdown.title')"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasContextBreakdown
        :report="contextBreakdown.report"
        :loading="contextBreakdown.loading"
        :load-failed="contextBreakdown.loadFailed"
        :active-key="contextBreakdown.activeKey"
        :mod-details-expanded="contextBreakdown.modDetailsExpanded"
        :locale="String(locale)"
        :labels="contextBreakdownLabels"
        @select="onSelectContextBreakdownItem"
        @toggle-mod-details="onToggleContextBreakdownModDetails"
        @retry="loadContextBreakdown"
        @close="closeCanvasSheet"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'memory'" :title="memoryLabels.title"
                 :close-label="t('main.cancel')" @close="closeCanvasSheet">
      <CanvasMemory
        :atoms="memory.atoms"
        :loading="memory.loading"
        :load-failed="memory.loadFailed"
        :expanded-ids="memory.expandedIds"
        :deleting-id="memory.deletingId"
        :labels="memoryLabels"
        @toggle-expand="onToggleMemoryExpand"
        @delete="askDeleteMemoryAtom"
        @retry="loadMemory"
        @close="closeCanvasSheet"
      />
    </CanvasPopup>

    <CanvasPopup :open="panel.sheet === 'confirm'" :title="confirmSpec.title"
                 :close-label="t('main.cancel')" @close="onConfirmCancel">
      <CanvasConfirm
        :content="confirmSpec.content"
        :ok-text="confirmSpec.okText"
        :cancel-text="t('main.cancel')"
        @ok="onConfirmOk"
        @cancel="onConfirmCancel"
      />
    </CanvasPopup>
  </div>
</template>

<script lang="ts" setup>
import { cfImageDesktop } from "@/utils/image-transform.js"

import {computed, h, onMounted, reactive, ref, unref, getCurrentInstance, nextTick, watch} from 'vue';
import {
  onLoad,
  onShow,
  onHide,
  onUnload,
  onBackPress
} from "@dcloudio/uni-app";
import {useI18n} from 'vue-i18n';

const {t, locale} = useI18n();



import {useUserDefine} from '@/mixins/UserDefine.js'
import {useStore} from 'vuex' // Add this import

import $fui from '@/components/firstui/fui-clipboard';
import { useStageHost } from '@/host/stage-host';
// 主站的訊息／對話框元件庫在畫布上不用：卡片沒有沙盒，它的 CSS 會打到
// 那些元件而作者根本不知道它們存在。改用 uni 自己的提示與對話框。
// 提示走 StageHost：uni-app 殼就是 uni.showToast，嵌進別的站台時由宿主決定長相。
const stageHost = useStageHost();
const message = {
  error: (text: any) => stageHost.ui.toast(String(text || ''), 'error'),
  warning: (text: any) => stageHost.ui.toast(String(text || ''), 'warning'),
  success: (text: any) => stageHost.ui.toast(String(text || ''), 'success'),
  info: (text: any) => stageHost.ui.toast(String(text || ''), 'info'),
};
/*
  所有二次確認都走畫布自己的確認框（CanvasConfirm，節點名照 MMD 的 .confirm-scope），
  不走 uni.showModal：原生框是一塊固定的黑底，卡片對它寫不了任何規則——owner 2026-09-05
  截圖裡「重新生成」那個黑框就是它。確定鍵吃到美化、框本身沒有，就是這個原因。
*/
const Modal = {
  confirm: (opts: any) => askConfirm(
    'modal',
    String(opts?.title || ''),
    String(opts?.content || ''),
    String(opts?.okText || ''),
    typeof opts?.onOk === 'function' ? opts.onOk : undefined,
  ),
};
import MarkdownIt from 'markdown-it';
import {
  isHeavyHtml, unwrapSingleHtmlFence, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
  findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, clearStreamCache
} from '@/utils/rich-text-renderer.js';
import { applyDisplayRules, hasCrossLineRule } from '@/utils/display-rule-engine.js'
import { createAuthorAssetRuntime } from '@/utils/author-asset-mount.js'
import { needsKaiFallback, ensureKaiFallback, applyFontMode } from './canvas-font-fallback'
import { getAuthorDraftStore } from '@/common/author-draft-store'
import { draftToAuthorAsset, draftDisplayName, type AuthorDraft } from '@/common/author-draft'
import { hoistFixedAuthorNodes } from './canvas-author-node-hoist'
import { composerOverhang } from './canvas-composer-overhang'
import { createLunaIntentApi } from '@/utils/luna-intent-api.js'

// ── Open Canvas ─────────────────────────────────────────────────
import '@/common/canvas-theme-vars.css'
import './canvas.css'
import { shouldRegenerateAssist, assistLabelKey } from './canvas-assist-state'
import CanvasHeader from './components/canvas-header.vue'
import CanvasStage from './components/canvas-stage.vue'
import CanvasIntro from './components/canvas-intro.vue'
import CanvasMessage from './components/canvas-message.vue'
import CanvasComposer from './components/canvas-composer.vue'
import CanvasMessageMenu from './components/canvas-message-menu.vue'
import { applyTavernRules } from './canvas-rule-engine'
import { scopeCardHtml, normalizeCardFormat, type CardFormat } from './canvas-style-scope'
import { stripUnknownTags, wrapDialogue } from './canvas-platform-defaults'
import { buildGreetingList, hasAlternates, shouldDeferStart, stepGreeting, greetingIndexForStart, buildPrologueList, shouldShowPrologue } from './canvas-greetings'
import { archiveRequestQuery, buildArchiveRows, isArchiveFull, nextArchiveAfterDelete } from './canvas-archives'
import type { ArchiveRow } from './canvas-archives'
import { convertVisibleHtml, convertPlainText, createDisplayScriptConverter, directionForLocale } from './canvas-display-script'

// 顯示字形轉換（簡↔繁）：只在畫出來那一刻、只轉玩家看得到的字。
// 儲存與傳輸永遠是原文——卡片的正則與機讀協定都寫死在作者的字形上，
// 早一步轉就會把它們轉壞（見 canvas-display-script.ts 檔頭與設計 §3.3.5）。
const displayScript = createDisplayScriptConverter(directionForLocale(stageHost.locale.get()))
import CanvasPrologue from './components/canvas-prologue.vue'
import { captureBodySnapshot, restoreBodySnapshot } from './canvas-body-snapshot'
import CanvasPopup from './components/canvas-popup.vue'
import CanvasModelPanel from './components/canvas-model-panel.vue'
import { computeCardThemeVars, CARD_THEME_VAR_NAMES } from './canvas-card-theme'
import CanvasConfirm from './components/canvas-confirm.vue'
import CanvasModify from './components/canvas-modify.vue'
import CanvasConversationList from './components/canvas-conversation-list.vue'
import CanvasPersona from './components/canvas-persona.vue'
import CanvasDirectives from './components/canvas-directives.vue'
import CanvasNotepad from './components/canvas-notepad.vue'
import CanvasContextBreakdown from './components/canvas-context-breakdown.vue'
import CanvasMemory from './components/canvas-memory.vue'
import { applyMemoryDeleteResponse, normalizeMemoryAtoms, type MemoryAtom } from './canvas-memory'
import {
  createDirectiveState, readDirectiveResponse, directiveCountText,
  canAddDirective, startEditDirective, cancelEditDirective, canSaveEdit,
  type DirectiveState,
} from './canvas-directives'
import {
  createPanelState, toggleMore, closeMore, openSheet, closeSheet, onEscape,
  type CanvasPanelState, type CanvasSheet,
} from './canvas-panel-state'
import { findVariant, resolveVariant, scoreParts } from './canvas-model-catalog'
import { resolveStoredModel, composeModelDisplayName } from './canvas-model-lanes'
import { computeContextUsage, contextBudgetTokens, formatContextUsage } from './canvas-context-usage'
import {
  BREAKDOWN_META,
  createPromptDiagnosticsRequestGate,
  normalizeServerReport,
  type PromptBreakdownReport,
} from './canvas-context-breakdown'
import type { MessageMenuAnchor } from './components/canvas-message.vue'
import {
  ROLE_SETTINGS_DEFAULTS, readRoleSettings, buildRoleSettingsSavePayload,
  type RoleSettings,
} from './canvas-role-settings'


// V1.1: 引入 WebSocket 心跳管理和 SSE 解析工具
import { createHeartbeatManager } from '@/utils/websocketHeartbeat';
import { createSSEParser } from '@/utils/sseParser';
// isSummaryFormat 這個名字在那支模組裡並不存在——舊頁面一直帶著這個匯入，
// 打包器只是靜默給了 undefined。沒有呼叫點，拿掉。
import { renderSummary } from '@/utils/messageRenderer';
import { resolveChatWebSocketBase } from './chat-websocket-url';
import { WS_BASE } from '@/config/env';
import { clearTokens as clearOpenAuthTokens, redirectToLogin as redirectToOpenLogin } from '@/common/open-oauth';
import {
  applyPendingUserDefineRefresh,
  parsePendingUserDefineRefresh,
} from './chat-user-define-refresh';

// #ifdef H5
import { nextBubbleId } from '@/utils/bubble-id';
// #endif


import { dispatchSSEEvent, handleParsedChatSSEEventGate, type DispatchContext } from './chat-sse-dispatch';
import {
  buildPendingOperationProbeQuery,
  createChatTransportOwnership,
  createClientOperationId,
  createOperationStatusPollScheduler,
  createPendingStreamEntry,
  classifyOperationCapabilityResponse,
  consumeFrozenPendingStreamError,
  decideStreamResume,
  authoritativePendingOperationDisposition,
  isChatOperationTerminal,
  isChatOperationBackendStillWorking,
  resolveCompactWatchdogAction,
  resolveCompactWatchdogMs,
  isChatOperationVisibleOutcomeExpired,
  resolveAgentTurnForOwnership as resolveAgentTurnFromSources,
  isChatSendInFlight,
  markExplicitPreAdmissionError,
  markStreamEntryAccepted,
  mergeChatHistoryOperationProjections,
  mergeOperationStatusIntoStreamEntry,
  mergeStreamMetaIntoPendingEntry,
  normalizeChatOperationStatus,
  prepareChatPayload,
  projectionFinishReason,
  recordExactOperationProbeMiss,
  selectPendingOperationFromList,
  shouldApplyOperationStatus,
  shouldAwaitDurableStopTerminal,
  shouldProbeExactOperationIdentity,
  retainedTimelineForHistoryResponse,
  STREAM_ENTRY_VERSION,
  terminateStreamForChatError,
  type PendingChatTurn,
} from './chat-transport-ownership';
import {
  BACKWARD_OPERATION_ENTRY_VERSION,
  BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS,
  backwardOperationRetryDelay,
  classifyBackwardOperationResponse,
  clearOperationCandidateMarker,
  commitRewriteCandidate,
  createBackwardOperationEntry,
  createPreAdmissionOperationErrorProjection,
  createRewriteSnapshot,
  createRewriteSnapshotForAI,
  createRewriteSnapshotForTarget,
  finalizeLegacyStoppedCandidate,
  findOperationCandidate,
  isOperationCandidateAdoptable,
  isLatestCanonicalAIId as isLatestCanonicalAIById,
  isTerminalActionAllowed,
  latestCanonicalAIIndex as resolveLatestCanonicalAIIndex,
  normalizeBackwardOperationEntry,
  operationKindFromPayload,
  removeOperationCandidate,
  removeOwnedTurnBubbles,
  releaseChatComposerAfterStop,
  replaceLatestCanonicalAI,
  resolveChatActionButtonState,
  resolveRetryGenerationAction,
  retryModeForAI,
  restoreRewriteCandidate,
  settleZeroOutputTerminalFailure,
  settleOptimisticDurableUserStop,
  shouldKeepPersistedHistoryBubble,
  terminalUIActionFromAllowedActions,
  terminalUIActionsFromAllowedActions,
  adoptInterruptedAgentBubbleForResume,
  keepInterruptedAgentBubble,
  type ChatOperationKind,
  type ChatOperationUIAction,
  type RewriteSnapshot,
} from './chat-operation-ui-state';
import {
  createHistoryRequestKey,
  decideHistoryRecovery,
  shouldCompleteHistoryRequest,
  type HistoryRecoveryReason,
} from './chat-history-recovery';
import {
  hasRenderableAssistantOutput,
  resolvePendingThinkingCollapsed,
  splitThinkingContent,
} from '@/utils/thinking-content';
import {
  resolveChatErrorTypeFromFailure,
  resolveChatErrorMessage,
  resolveChatErrorPresentation,
} from '@/utils/chat-error-message.js';
import { isSignedIn as canUseChatOperationOutcome } from '@/common/open-oauth';
// 卡片附加內容的名字有多語欄位；沒有對應語言就退回原名。
function localizedField(item: Record<string, any> = {}, field: string, locale: string) {
  const suffix = locale === 'en' ? 'En' : locale === 'ja' ? 'Ja' : locale === 'ko' ? 'Ko' : ''
  return (suffix && item[field + suffix]) || item[field] || ''
}
import {
  attachPassBlock,
  carryPrepTrailAcrossHistoryRebuild,
  isMultiPassEffective,
  normalizeMultiPassPreference,
  resolvePendingPrepTrailCollapsed,
} from '@/utils/multi-pass';
import { findResumableAgentOperation, resolveAgentResumeTarget } from '@/utils/agent-composer-action';

const store = useStore()

// 压缩状态（从 Vuex 读取）
const isCompacting = computed(() => store.state.isCompacting)
const compactStatus = computed(() => store.state.compactStatus)
const multiPassEnabled = ref(false)
// Agent 模式「真的開著」＝全站沒關掉、使用者開了、而且這個模型跑得動。
// 與 modelSelect 同一份判準；散開各寫一次遲早漂移成「亮著但沒開」。
const deepPrepOn = computed(() =>
  multiPassRuntimeEnabled.value && multiPassEnabled.value && multiPassModelSupported.value
)
const multiPassRuntimeEnabled = ref(false)
// 這個模型能不能跑多步：伺服器回報，前端不維護第二份清單。
const multiPassModelSupported = ref(false)
const multiPassUpdating = ref(false)

// 這三個開關由伺服器宣告。先前這一頁只宣告了 ref 卻沒有人去讀，deepPrepOn 永遠是假；
// 真正讀它的是模型選單那個元件，撥開關時會廣播 multiPassPreferenceUpdated。
// 這裡自己讀一次（同 mobile memoryPage），再聽廣播——記憶彈窗的身分（AI 記事本／永久記憶）
// 要在玩家沒開過模型選單時也是對的。
function applyMultiPassPreference(pref: any) {
  multiPassEnabled.value = pref?.multiPassEnabled === true
  multiPassRuntimeEnabled.value = pref?.runtimeEnabled === true
  multiPassModelSupported.value = !!pref?.modelSupported
}

// 傳輸層失敗（連線被中斷、沒有 HTTP 狀態碼）跟伺服器說「不行」是兩回事：
// 前者重送一次通常就好；後者重送只是再被拒一次。實測進場那一刻同一條路由會有
// 兩筆並行請求，偶爾其中一筆被瀏覽器中斷（ERR_ABORTED）——那不是伺服器的答案。
function isTransportFailure(e: any): boolean {
  const code = Number(e?.statusCode)
  return !Number.isFinite(code) || code <= 0
}

async function loadMultiPassPreference(retryLeft = 1) {
  const id = String(unref(roleId) || formData.roleId || '')
  if (!id) return
  try {
    const res = await _this.http.get(_this.requestUrl.playerAgentMode, {
      // 帶上這張卡現在挑的模型：支不支援是按模型算的，不是按已存檔的那個。
      data: { roleId: id, model: formData.selectModel || '' },
      showLoading: false,
    })
    if (String(unref(roleId) || '') !== id) return
    applyMultiPassPreference(normalizeMultiPassPreference(res))
  } catch (e) {
    if (retryLeft > 0 && isTransportFailure(e)) {
      await new Promise((r) => setTimeout(r, 800))
      return loadMultiPassPreference(retryLeft - 1)
    }
    // 拿不到就當作沒開——退回「永久記憶」比顯示一個講錯身分的彈窗安全。
    console.warn('[Canvas] 讀取 Agent 模式狀態失敗:', e)
  }
}

function onMultiPassPreferenceUpdated(payload: any) {
  if (!payload || String(payload.roleId || '') !== String(unref(roleId) || '')) return
  applyMultiPassPreference(payload)
}
// 正文之前的準備階段（''＝沒有在準備）。伺服器送階段語意，文案在這裡選。
const prepStepStage = ref('')
// 準備階段的文案。禁技術詞（檢索／世界書／快取）——用戶看的是「她在做什麼」，
// 不是我們怎麼實作的。未知階段回空字串而不是原樣顯示，免得日後伺服器加了
// 新階段時把內部代號漏給用戶看。
// 這一刻在查什麼、找到幾條。等待實測長達 56 秒且絕大部分是等模型、省不下來——
// 固定一句話撐完全程跟畫面凍住沒有分別，所以要顯示它實際在做什麼。
const prepStepQuery = ref('')
const prepStepCount = ref(0)
// prepStepResource：模型這一步動的是哪一類東西（設定／筆記／記事本／先前的
// 對話／草稿）。伺服器只送類別，五語文案在這裡挑——用戶看到「正在翻看這個
// 故事的設定」有意義，看到內部資源名沒有意義（見 user-facing-message 規範）。
const prepStepResource = ref('')
// pendingPrepTrail：done 到 AI 氣泡建出來之間的暫存。done 在正文開始前就送出，
// 那時還沒有可以掛的對象。
const pendingPrepTrail = ref([])
// 退讓重試：第幾次／共幾次／幾秒後。退讓期間不告訴用戶，畫面等於凍住。
const prepRetryAttempt = ref(0)
const prepRetryMax = ref(0)
const prepRetryInSeconds = ref(0)
// 每一步都留在畫面上，不蓋掉上一步。
//
// ChatGPT／Claude 讓人覺得「做了很多活、值得等」，關鍵是那些步驟**累積成一條
// 軌跡**——看得到它查了什麼、找到什麼、又換了什麼角度。同一行不斷被覆蓋的話，
// 用戶永遠只看到當下那一句，等完什麼都沒留下，只感覺到等了很久。
const prepSteps = ref<string[]>([])
// 等久了輪替的安撫文案。固定一句撐很久一樣單調，所以兩個詞池拼接
// （每語言各自的語序，見 chat.thinkingTemplate）。
const slowWaitActive = ref(false)
const thinkingPhrase = ref('')
let thinkingPhraseTimer: ReturnType<typeof setInterval> | null = null
let slowWaitGiveUpTimer: ReturnType<typeof setTimeout> | null = null
// 安撫可以久，但不能無限。產品邊界：五分鐘內必須有結果（I-1）。
const SLOW_WAIT_GIVE_UP_MS = 5 * 60 * 1000
// 第一次壓住「結果還在確認中」的時間點。超過五分鐘才真的讓它宣告。
let outcomeUnconfirmedSuppressedAt = 0

// 從兩個詞池各挑一個拼成一句。每語言各自帶模板——{A}{B} 的中文語序
// 直接套到英文會產生不通順的句子。
function composeThinkingPhrase(): string {
  const pick = (key: string) => {
    const pool = String(t(key) || '').split('|').filter(Boolean)
    if (!pool.length) return ''
    return pool[Math.floor(Math.random() * pool.length)]
  }
  const tpl = String(t('chat.thinkingTemplate') || '{A}{B}')
  return tpl.replace('{A}', pick('chat.thinkingPoolA')).replace('{B}', pick('chat.thinkingPoolB'))
}

// 這一輪要不要套「五分鐘內必須有可見結果」那條上界，取決於它是不是 agent 模式。
// 判定本身是純函式（見 chat-transport-ownership），這裡只負責把三個來源湊齊：
// 伺服器投影、持久化的那一筆、以及這個分頁當下的開關。
function resolveAgentTurnForOwnership(status?: { agentTurn?: boolean } | null): boolean {
  return resolveAgentTurnFromSources({
    status,
    entry: readLsEntry(),
    localAgentTurn: multiPassEffective.value === true,
  })
}

function enterSlowWait(capturedPending: PendingChatTurn, storedDraft: string) {
  slowWaitActive.value = true
  thinkingPhrase.value = composeThinkingPhrase()
  if (thinkingPhraseTimer) clearInterval(thinkingPhraseTimer)
  thinkingPhraseTimer = setInterval(() => {
    // 避開和上一句一樣：換了字卻沒變化，比不換更像卡住。
    let next = composeThinkingPhrase()
    for (let i = 0; i < 5 && next === thinkingPhrase.value; i++) next = composeThinkingPhrase()
    thinkingPhrase.value = next
  }, 5000)
  if (String(capturedPending.operationId || '').trim()) {
    requestAuthoritativeOperationReconciliation('slow_wait_reconcile')
  }
  if (slowWaitGiveUpTimer) clearTimeout(slowWaitGiveUpTimer)
  // 安撫文案可以一直輪替，但普通 one-shot 不能無限等下去（I-1）。agent 沒有這個
  // 上界：跑六分鐘、十分鐘都是正常的，到期把它收掉等於把一輪還在跑的準備抹掉。
  if (!resolveAgentTurnForOwnership()) {
    slowWaitGiveUpTimer = setTimeout(() => {
      slowWaitGiveUpTimer = null
      if (pendingChatTurn !== capturedPending) return
      exitSlowWait()
      recoverPendingTurnAfterMissingDurableAck(capturedPending, storedDraft)
    }, SLOW_WAIT_GIVE_UP_MS)
  }
}

function exitSlowWait() {
  outcomeUnconfirmedSuppressedAt = 0;
  if (slowWaitGiveUpTimer) { clearTimeout(slowWaitGiveUpTimer); slowWaitGiveUpTimer = null }
  if (thinkingPhraseTimer) { clearInterval(thinkingPhraseTimer); thinkingPhraseTimer = null }
  thinkingPhrase.value = ''
  slowWaitActive.value = false
}
const prepStepText = computed(() => {
  // 等久了給一句安撫，但仍在同一個等待指示器裡。
  if (slowWaitActive.value && !prepStepStage.value) {
    return thinkingPhrase.value || t('multiPass.prepStillWorking')
  }
  // 資源名：有的話文案就說得出它動的是哪一類東西，沒有就退回原本的通用句。
  // 這是「忠實反映模型在做什麼」的關鍵——用戶付了錢，看不到它在幹嘛只會
  // 覺得它在偷懶或卡住了。
  const resName = {
    setting: t('multiPass.prepResSetting'),
    note: t('multiPass.prepResNote'),
    shared: t('multiPass.prepResShared'),
    past: t('multiPass.prepResPast'),
    draft: t('multiPass.prepResDraft'),
    mod: t('multiPass.prepResMod'),
    requirement: t('multiPass.prepResRequirement'),
    status: t('multiPass.prepResStatus'),
    settled: t('multiPass.prepResSettled'),
  }[prepStepResource.value] || ''

  if (prepStepStage.value === 'looking_up') {
    // {q}/{n}/{r} 是 vue-i18n 自己的插值佔位符——不帶參數呼叫 t() 時它會把
    // 佔位符解析成空字串，後面再 .replace() 已經沒東西可替換（實測畫面出現
    // 「正在查「」的設定」）。必須走 i18n 的參數 API，不能自己做字串替換。
    if (prepStepQuery.value && resName) {
      return t('multiPass.prepLookingUpIn', { r: resName, q: prepStepQuery.value })
    }
    return prepStepQuery.value
      ? t('multiPass.prepLookingUpNamed', { q: prepStepQuery.value })
      : t('multiPass.prepLookingUp')
  }
  // 寫入類的動作。原本這幾個工具一個進度事件都不發，模型每輪寫的筆記與草稿
  // 用戶一次都看不到——畫面上當然接不上。
  if (prepStepStage.value === 'noting') {
    if (prepStepResource.value === 'shared') return t('multiPass.prepNotingShared')
    // 說得出更新的是哪一類東西就說——「正在更新角色目前的狀態」比「正在記下重點」
    // 具體得多，而具體正是這條流水帳唯一的價值。
    return resName ? t('multiPass.prepNotingIn', { r: resName }) : t('multiPass.prepNoting')
  }
  if (prepStepStage.value === 'drafting') return t('multiPass.prepDrafting')
  // 交給機率決定的三件事各說各的。併成一句就只能寫得含糊,而這條流水帳唯一的
  // 價值就是具體——「擲骰決定結果」跟「封存一個暫時不揭曉的答案」對用戶的意義
  // 完全不同。三句都不帶結果值:封存的答案不能洩,擲出的點數由正文自己說。
  if (prepStepStage.value === 'rolling') return t('multiPass.prepRolling')
  if (prepStepStage.value === 'sealing') return t('multiPass.prepSealing')
  if (prepStepStage.value === 'revealing') return t('multiPass.prepRevealing')
  if (prepStepStage.value === 'retrying') {
    return t('multiPass.prepRetrying', {
      s: String(prepRetryInSeconds.value),
      a: String(prepRetryAttempt.value),
      m: String(prepRetryMax.value),
    })
  }
  if (prepStepStage.value === 'browsing') {
    return resName ? t('multiPass.prepBrowsingIn', { r: resName }) : t('multiPass.prepBrowsing')
  }
  if (prepStepStage.value === 'reading') {
    // 讀自己寫的草稿是「回頭審視」，不是「細看找到的資料」——同一個動詞套在
    // 兩件不同的事上，畫面就會出現「正在細看自己的草稿」這種不對勁的話。
    if (prepStepResource.value === 'draft') return t('multiPass.prepReviewingDraft')
    return resName ? t('multiPass.prepReadingIn', { r: resName }) : t('multiPass.prepReading')
  }
  if (prepStepStage.value === 'found') {
    // 零命中不是「找到 0 條」——那句話自相矛盾。查無結果本身是有效答案，
    // 但要用「沒有」講，不要用「找到 0」講。
    if (!prepStepCount.value) {
      return resName
        ? t('multiPass.prepFoundNoneIn', { r: resName })
        : t('multiPass.prepFoundNone')
    }
    return resName
      ? t('multiPass.prepFoundIn', { r: resName, n: String(prepStepCount.value) })
      : t('multiPass.prepFound', { n: String(prepStepCount.value) })
  }
  if (prepStepStage.value === 'deciding') return t('multiPass.prepDeciding')
  return ''
})
// 三個條件的 AND 走共用實作，不在這裡手抄第二份。
//
// 先前這裡是手抄的，而且把「模型名字串」餵給了要「偏好設定物件」的
// isMultiPassModelSupported()。字串上沒有 modelSupported 這個屬性，取到
// undefined，於是整個 computed 永遠是 false——不報錯、不留痕跡，
// 「狀態更新中」那個指示器就這樣從上線起沒亮過。
//
// modelSupported 只有伺服器說了算（見 multiPassStructuredModelAllowed，
// 直接從 stable-cache 清單推導），所以這裡存伺服器回的值，不自己判斷。
const multiPassEffective = computed(() => isMultiPassEffective({
  multiPassEnabled: multiPassEnabled.value,
  runtimeEnabled: multiPassRuntimeEnabled.value,
  modelSupported: multiPassModelSupported.value,
}))

// Phase 1 止血：compact watchdog — 防止 SSE 事件遺失導致 UI 卡住
//
// 390 秒原本是從伺服器的牆鐘推導的（「6 分鐘總預算 + 30 秒緩衝」）。那個牆鐘在
// 2026-08-31 移除了：壓縮的長度天生變動，用固定時間砍它砍掉的是快做完的工作。
//
// 所以這個秒數**不再是壓縮的上限**，它只剩一個角色：接不到收尾事件時的兜底。
// 真正讓 pill 撐住的是伺服器每 15 秒重送一次 compacting——
// startCompactWatchdog() 開頭會 clearCompactWatchdog()，所以每次重送都把這個
// timer 續上。判準因此從「跑了多久」變成「伺服器還有沒有動靜」，與伺服器端的
// 靜默判死同一套。
//
// 動這個秒數之前先確認伺服器的重送間隔（server: compactProgressNotifyInterval）——
// 兩者必須維持「重送間隔 << 這個秒數」，否則正常壓縮會被誤判成事件遺失。
const compactWatchdogTimer = ref(null);
// 兜底間隔。預設 COMPACT_WATCHDOG_DEFAULT_MS；測試可用 localStorage 覆寫成更短的
// 值，讓「到期之後怎麼決策」那條分支變得可測——它需要壓縮跑超過六分半才走得到，
// 按需重現不了。只准調短，壞值一律退回預設（見 resolveCompactWatchdogMs）。
function compactWatchdogMs() {
  let override;
  try {
    override = window.localStorage.getItem('lunatalk.compactWatchdogMs');
  } catch (e) {
    override = null; // 隱私模式 / 存取被擋：照預設走，不讓它變成錯誤
  }
  return resolveCompactWatchdogMs(override);
}

// Phase 2a：Stream resume 相關狀態（Last-Event-ID 恢復協定）
const PROTOCOL_VERSION = '2';
const STREAM_LS_PREFIX = 'lt:activeStream:';
const STOP_SETTLEMENT_LS_PREFIX = 'lt:pendingStop:';
const BACKWARD_LS_PREFIX = 'lt:pendingBackward:';
const STREAM_LS_TTL_MS = 10 * 60 * 1000; // 與 server retention 一致
// Pre-send marker 視窗：從 send() 發出到 streamMeta 送達的過度期，通常 <2s，server 端 15s read deadline 是硬上限
const STREAM_PENDING_TTL_MS = 20 * 1000;
// pendingPayload 可自動 resend 的視窗（Fix A 針對 server 根本沒收到 message 的情況）
const STREAM_PENDING_RESEND_TTL_MS = 10 * 1000;
const CHAT_OPEN_DEADLINE_MS = 10 * 1000;
const CHAT_ACCEPTED_DEADLINE_MS = 15 * 1000;
const RECONNECT_DELAYS = [1000, 2000, 5000]; // 指數退避
const streamId = ref('');
const lastEventId = ref(0);
const reconnectAttempt = ref(0);
// 指示當前是否處於「等待伺服器事件」狀態（true 時 onSocketClose 會嘗試自動重連）
const isStreamActive = ref(false);
// 伺服器對這段對話的操作投影。只用來判斷有沒有「中斷但進度已保留」的輪次可以續跑。
const knownOperations = ref<Array<{ operationId?: string; reasonCode?: string }>>([]);
// Phase 0 Task 3 (follow-up)：server emit messageMeta event 在 streamMeta 之後、首個 answer chunk 之前，
// 帶 isV3 flag。此處暫存待答 chunk 創建/更新 bubble 時寫入 msg.isV3。
// 一輪 stream 結束（[DONE] / done / sessionExpired / clearStreamState）必須清空避免污染下一輪。
const pendingMessageMeta = ref<{ isV3?: boolean; roleId?: string } | null>(null);
// 避免 onSocketError / onSocketClose 連續觸發造成重複 retry
const reconnectTimerHandle = ref<number | null>(null);
// 標記「本次 ws 連線是 resume 開頭且尚未收到任何實質事件」，給 done handler 判斷是否需要重抓 history
const isResumeInitial = ref(false);
// noActiveStream 時若此 payload 還在 resend TTL 內，自動補送一次
const pendingResendPayload = ref<any>(null);
// 對話 identity / timeline fence。切換對話與 rollback/rewrite/delete 均 bump。
const conversationGeneration = ref(0);
let activeHistoryRequestKey = '';
let historyRequestSequence = 0;
let historyRecoveryKey = '';
let historyRecoveryAttemptedKey = '';
let historyRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
const chatTransport = createChatTransportOwnership();
let activeSocketToken = 0;
let pendingChatTurn: PendingChatTurn | null = null;
let pendingRewriteSnapshot: RewriteSnapshot | null = null;
let requestedOperationKindOverride: ChatOperationKind | '' = '';
// 續跑來源:被中斷的那一輪的 operationId。送出後即清,不讓它污染下一次普通送出。
let resumeFromOperationIdOverride = '';
let operationStatusRequestKey = '';
let durableAckProbeKey = '';
let operationStatusSlowNoticeKey = '';
let operationTimedOutNoticeKey = '';
let backwardOperationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let backwardOperationRequestKey = '';
const operationStatusPollScheduler = createOperationStatusPollScheduler();
let globalSocketHandlers: null | {
  open?: (...args: any[]) => void;
  message?: (...args: any[]) => void;
  close?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
} = null;

type OperationResumeFields = {
  clientOperationId?: string;
  operationId?: string;
  operationState?: string;
  operationVersion?: number;
  serverOperationKind?: string;
  assistantChatId?: string;
  userChatId?: string;
  targetChatId?: string;
  sourceChatId?: string;
  checkpointChatId?: string;
  parentOperationId?: string;
  sourceOperationId?: string;
  outputDisposition?: string;
  finishReason?: string;
  allowedActions?: string[];
  reasonCode?: string;
  messageKey?: string;
};
type PendingEntry = OperationResumeFields & {
  version?: number;
  accepted?: boolean;
  streamId?: string;
  lastEventId?: number;
  pendingSince?: number;
  pendingPayload?: any;
  preAdmissionErrorType?: string;
  preAdmissionErrorAt?: number;
  exactIdentityEmptyProbeCount?: number;
  updatedAt: number;
};
type PendingStopSettlement = {
  conversationId: string;
  streamId: string;
  operationId: string;
  clientOperationId: string;
  requestedAt: number;
};
type ResumeDecision =
  | ({ kind: 'byStreamId'; streamId: string; lastEventId: number; pendingSince?: number; pendingPayload?: any } & OperationResumeFields)
  | { kind: 'byConv'; pendingSince: number; pendingPayload: any; operationId?: string; operationState?: string; serverOperationKind?: string; assistantChatId?: string }
  | { kind: 'byClientOperationId'; clientOperationId: string; pendingSince: number; pendingPayload: any; preAdmissionErrorType?: string; preAdmissionErrorAt?: number; exactIdentityEmptyProbeCount?: number }
  | ({ kind: 'byOperationId'; operationId: string; expired?: boolean; pendingSince?: number } & OperationResumeFields)
  | { kind: 'recoverDraft'; reason: string; draft?: string }
  | null;

function lsKeyForConv(currentConversationId: string = String(unref(conversationId) || '')): string {
  return STREAM_LS_PREFIX + currentConversationId;
}
function writeLsEntry(entry: PendingEntry) {
  try { localStorage.setItem(lsKeyForConv(), JSON.stringify(entry)); } catch (e) { /* quota / disabled */ }
}
function readLsEntry(
  currentConversationId: string = String(unref(conversationId) || ''),
): PendingEntry | null {
  if (!currentConversationId) return null;
  try {
    const raw = localStorage.getItem(lsKeyForConv(currentConversationId));
    if (!raw) return null;
    return JSON.parse(raw) as PendingEntry;
  } catch (e) { return null; }
}
function stopSettlementKeyForConv(conversation: string = String(unref(conversationId) || '')) {
  return STOP_SETTLEMENT_LS_PREFIX + conversation;
}
function readPendingStopSettlement(
  currentConversationId: string = String(unref(conversationId) || ''),
): PendingStopSettlement | null {
  if (!currentConversationId) return null;
  try {
    const raw = localStorage.getItem(stopSettlementKeyForConv(currentConversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStopSettlement;
    return parsed?.conversationId === currentConversationId ? parsed : null;
  } catch (_) {
    return null;
  }
}
function pendingStopSettlementMatches(
  current: PendingStopSettlement | PendingEntry | null,
  expected: PendingStopSettlement | null,
): boolean {
  if (!current || !expected) return false;
  const currentOperationId = String(current.operationId || '').trim();
  const expectedOperationId = String(expected.operationId || '').trim();
  if (currentOperationId && expectedOperationId) return currentOperationId === expectedOperationId;
  const currentClientOperationId = String(
    current.clientOperationId || (current as PendingEntry).pendingPayload?.clientOperationId || '',
  ).trim();
  const expectedClientOperationId = String(expected.clientOperationId || '').trim();
  return !!currentClientOperationId
    && !!expectedClientOperationId
    && currentClientOperationId === expectedClientOperationId;
}
function persistPendingStopSettlement(
  currentConversationId: string,
  currentStreamId: string,
  pending: PendingChatTurn | null,
): PendingStopSettlement | null {
  if (!currentConversationId) return null;
  const stored = readLsEntry();
  const entry: PendingStopSettlement = {
    conversationId: currentConversationId,
    streamId: String(currentStreamId || stored?.streamId || ''),
    operationId: String(pending?.operationId || stored?.operationId || ''),
    clientOperationId: String(
      pending?.clientOperationId
        || pending?.payload?.clientOperationId
        || stored?.clientOperationId
        || stored?.pendingPayload?.clientOperationId
        || '',
    ),
    requestedAt: Date.now(),
  };
  try {
    localStorage.setItem(stopSettlementKeyForConv(currentConversationId), JSON.stringify(entry));
    return entry;
  } catch (_) {
    return null;
  }
}
function clearPendingStopSettlement(expected: PendingStopSettlement | null) {
  if (!expected) return;
  const current = readPendingStopSettlement(expected.conversationId);
  if (!current || current.requestedAt !== expected.requestedAt) return;
  try { localStorage.removeItem(stopSettlementKeyForConv(expected.conversationId)); } catch (_) {}
}
function clearPersistedStoppedStream(expected: PendingStopSettlement | null) {
  if (!expected || !pendingStopSettlementMatches(readLsEntry(expected.conversationId), expected)) return;
  try { localStorage.removeItem(lsKeyForConv(expected.conversationId)); } catch (_) {}
}
function resumePendingStopSettlement(): boolean {
  const pendingStop = readPendingStopSettlement();
  if (!pendingStop) return false;
  requestConversationStopFallback(
    pendingStop.conversationId,
    pendingStop.streamId,
    pendingStop,
  );
  return true;
}
function persistPendingPreAdmissionState(pending: PendingChatTurn) {
  if (!unref(conversationId) || pendingChatTurn !== pending) return;
  const current = readLsEntry() || (
    pending.payload
      ? createPendingStreamEntry(pending.payload, pending.startedAt || Date.now())
      : null
  );
  if (!current) return;
  writeLsEntry({
    ...current,
    preAdmissionErrorType: pending.preAdmissionErrorType,
    preAdmissionErrorAt: pending.preAdmissionErrorAt,
    exactIdentityEmptyProbeCount: pending.exactIdentityEmptyProbeCount,
    updatedAt: Date.now(),
  });
}
function persistStreamState() {
  if (!streamId.value || !unref(conversationId)) return;
  const now = Date.now();
  const pendingPayload = pendingChatTurn?.payload || pendingResendPayload.value?.payload;
  if (chatTransport.shouldAwaitDurableTurnAck(pendingChatTurn) && pendingPayload) {
    const base = readLsEntry() || createPendingStreamEntry(pendingPayload, now);
    writeLsEntry(mergeStreamMetaIntoPendingEntry(base, {
      streamId: streamId.value,
      lastEventId: lastEventId.value,
      now,
    }));
    return;
  }
  persistAcceptedStreamState();
}
function persistAcceptedStreamState() {
  if (!unref(conversationId)) return;
  if (!streamId.value) {
    const pending = pendingChatTurn;
    if (
      pending
      && pending.operationOutcomeCapability !== 'legacy'
      && (
        pending.payload?.supportsOperationOutcome === true
        || !!String(pending.clientOperationId || '').trim()
        || !!String(pending.operationId || '').trim()
      )
    ) {
      const current = readLsEntry() || (
        pending.payload ? createPendingStreamEntry(pending.payload, pending.startedAt || Date.now()) : null
      );
      if (current) {
        writeLsEntry(markStreamEntryAccepted(current, {
          streamId: '',
          lastEventId: lastEventId.value,
          now: Date.now(),
        }));
      }
      return;
    }
    try { localStorage.removeItem(lsKeyForConv()); } catch (e) {}
    return;
  }
  const current = pendingChatTurn?.operationId
    ? mergeOperationStatusIntoStreamEntry(readLsEntry(), {
      operationId: pendingChatTurn.operationId,
      clientOperationId: pendingChatTurn.clientOperationId
        || pendingChatTurn.payload?.clientOperationId
        || '',
      kind: pendingChatTurn.serverOperationKind || '',
      state: pendingChatTurn.operationState || 'generating',
      version: pendingChatTurn.operationVersion,
      assistantChatId: pendingChatTurn.assistantChatId || '',
      userChatId: pendingChatTurn.userChatId || '',
      targetChatId: pendingChatTurn.targetChatId || '',
      sourceChatId: pendingChatTurn.sourceChatId || '',
      checkpointChatId: pendingChatTurn.checkpointChatId || '',
      parentOperationId: pendingChatTurn.parentOperationId || '',
      sourceOperationId: pendingChatTurn.sourceOperationId || '',
      outputDisposition: pendingChatTurn.outputDisposition || '',
      finishReason: pendingChatTurn.finishReason || '',
      allowedActions: pendingChatTurn.allowedActions || [],
      reasonCode: pendingChatTurn.reasonCode || '',
      messageKey: pendingChatTurn.messageKey || '',
    })
    : readLsEntry();
  writeLsEntry(markStreamEntryAccepted(current, {
    streamId: streamId.value,
    lastEventId: lastEventId.value,
    now: Date.now(),
  }));
}
// 在 send() 時先寫入，讓「streamMeta 還沒回來就刷新」的情境能透過 tryResumeByConv 恢復
function persistPendingSend(payload: any) {
  if (!unref(conversationId)) return;
  const prepared = prepareChatPayload(payload);
  if (!prepared.ok) return false;
  const pendingSince = Date.now();
  // 送出當下是唯一知道「這一輪是 agent」的時刻。重整之後 pendingChatTurn 沒了、
  // 伺服器在準備階段又還沒把它標成 agent，持久化這一筆是掛載路徑唯一的依據。
  writeLsEntry({
    ...createPendingStreamEntry(prepared.payload, pendingSince),
    agentTurn: multiPassEffective.value === true,
  });
  pendingResendPayload.value = { payload: prepared.payload, pendingSince };
  return true;
}
function hasPersistedPendingOperationIdentity(): boolean {
  const stored = readLsEntry();
  return !!String(
    stored?.operationId
      || stored?.clientOperationId
      || stored?.pendingPayload?.clientOperationId
      || pendingChatTurn?.operationId
      || pendingChatTurn?.clientOperationId
      || pendingChatTurn?.payload?.clientOperationId
      || '',
  ).trim();
}

function clearStreamState(options: { preservePersistedOperation?: boolean } = {}) {
  if (unref(conversationId) && options.preservePersistedOperation !== true) {
    try { localStorage.removeItem(lsKeyForConv()); } catch (e) {}
  }
  streamId.value = '';
  lastEventId.value = 0;
  reconnectAttempt.value = 0;
  isStreamActive.value = false;
  pendingResendPayload.value = null;
  operationStatusRequestKey = '';
  durableAckProbeKey = '';
  operationStatusSlowNoticeKey = '';
  // 工單修正：operationTimedOutNoticeKey 只由 releaseExpiredChatOperationOwnership
  // 讀寫，而該函式本身就會呼叫這裡——若在這裡重置，去重旗標會在同一次呼叫內被
  // 自己清空，去重判斷永遠失效（死碼）。比對用「同一 operationId 不再重複提示」
  // 已經足夠：換一個新 operationId 自然不會相等，不需要在這裡額外歸零。
  operationStatusPollScheduler.cancel();
  chatTransport.clearDeadlines(activeSocketToken);
  // Phase 0 Task 3：清掉本輪的 messageMeta 暫存，避免污染下一輪
  pendingMessageMeta.value = null;
  if (reconnectTimerHandle.value) {
    clearTimeout(reconnectTimerHandle.value);
    reconnectTimerHandle.value = null;
  }
}
function bumpConversationGeneration() {
  conversationGeneration.value += 1;
  return conversationGeneration.value;
}
function isConversationGenerationCurrent(generation: number) {
  return generation === conversationGeneration.value;
}
function teardownStreamForConversationSwitch(
  options: {
    preservePersistedOperation?: boolean
    invalidateHistory?: boolean
  } = {},
) {
  // localStorage key 由當前 conversationId 計算，identity 改變前必須先清。
  clearStreamState(options);
  closeWebSocket();
  socket.value = null;
  isConnecting.value = false;
  if (reconnectTimerHandle.value) {
    clearTimeout(reconnectTimerHandle.value);
    reconnectTimerHandle.value = null;
  }
  sseParser.reset();
  messageQueue.value = [];
  pendingChatTurn = null;
  pendingRewriteSnapshot = null;
  isResumeInitial.value = false;
  currentChatId.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  tempContent.value = '';
  pendingMessageMeta.value = null;
  removeOrphanPlaceholder();
  if (options.invalidateHistory === true) bumpConversationGeneration();
}
function readPendingStreamState(): ResumeDecision {
  const decision = decideStreamResume(readLsEntry(), Date.now(), {
    streamTtlMs: STREAM_LS_TTL_MS,
    pendingTtlMs: STREAM_PENDING_TTL_MS,
  });
  if (!decision || decision.kind === 'expired') {
    try { localStorage.removeItem(lsKeyForConv()); } catch (e) {}
    return null;
  }
  return decision as ResumeDecision;
}

function clearCompactWatchdog() {
  if (compactWatchdogTimer.value) {
    clearTimeout(compactWatchdogTimer.value);
    compactWatchdogTimer.value = null;
  }
}

function startCompactWatchdog() {
  clearCompactWatchdog();
  compactWatchdogTimer.value = setTimeout(() => {
    compactWatchdogTimer.value = null;
    // 權威在後端。碼表到期只代表「我們有一陣子沒收到事件」，不代表壓縮結束了——
    // 壓縮是 fail-closed 的，後端沒壓完，前端把送出鍵放開也沒有用：使用者送出的
    // 下一則訊息只會撞上同一份還沒完成的狀態，而畫面上已經沒有東西告訴他為什麼。
    if (resolveCompactWatchdogAction({
      state: pendingChatTurn?.operationState,
      observedAt: pendingChatTurn?.operationStateObservedAt,
      now: Date.now(),
    }) === 'keep-waiting') {
      console.warn('[AutoCompact] watchdog 到期，但伺服器最近說這一輪還在跑——繼續等');
      startCompactWatchdog();
      return;
    }
    console.warn('[AutoCompact] watchdog 超時，且伺服器沒說還在跑——清狀態並拉歷史補 summary');
    if (unref(isCompacting)) {
      store.commit('setIsCompacting', false);
      store.commit('setCompactStatus', '');
    }
    // 主動拉最新歷史，若後端已完成壓縮、summary 已入庫，前端自動補上
    try {
      ajax.value.flag = true;
      ajax.value.page = 1;
      getHistoryMsg();
    } catch (err) {
      console.error('[AutoCompact] watchdog 觸發 getHistoryMsg 失敗:', err);
    }
  }, compactWatchdogMs());
}

// Part A: 摘要編輯狀態

// Part D: 新劇情摘要浮動 pill 狀態
const newSummaryPillVisible = ref(false);
// 記憶佔用（chat-framework 邊界 1a）。伺服器只在第一頁歷史回這個欄位；
// 算不出來時整個欄位不回，保持 null 讓橫幅不出現，而不是顯示一個 0%。
const contextFootprint = ref<any>(null);
const contextFootprintOverWaterline = computed(
  () => contextFootprint.value?.overWaterline === true
);
// 一次性提示：同一個對話只在第一次偵測到時說明一次成因與解法；
// 之後靠常駐橫幅提醒——常駐的那條刻意不可關閉。
const contextFootprintIntroShownKey = 'lt_context_footprint_intro_v1';
function maybeShowContextFootprintIntro(conversationId: string) {
  if (!contextFootprintOverWaterline.value || !conversationId) return;
  let shown: string[] = [];
  try {
    shown = JSON.parse(stageHost.storage.get(contextFootprintIntroShownKey) || '[]');
  } catch (e) { shown = []; }
  if (!Array.isArray(shown)) shown = [];
  if (shown.includes(conversationId)) return;
  shown = shown.slice(-49).concat(conversationId);
  try { stageHost.storage.set(contextFootprintIntroShownKey, JSON.stringify(shown)); } catch (e) {}
  askConfirm(
    'modal',
    t('contextFootprint.introTitle'),
    t('contextFootprint.introBody', {
      percent: Math.max(0, Number(contextFootprint.value?.usedPercent) || 0),
    }),
    t('contextFootprint.action'),
    openContextFootprintHelp,
  );
}
// 帶使用者到能真的解決問題的地方：上下文容量的控制項就在模型設定那一層。
// 這一頁不換頁——換頁等於把卡片的裝修整個丟掉（見彈層那一段的說明）。
function openContextFootprintHelp() {
  openModelSelect();
}
const newSummaryPillTimer = ref(null);

// 创建markdown-it实例
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

const {
  userInfo,
  tempParam,
  hasLogin,
  formData,
  defaultJailbreak,
  getUserDefine,
  currentRole,
  setCurrentRoleId,
  getRole
} = useUserDefine()

const {proxy: _this} = getCurrentInstance();

const cfImage = (url, preset) => {
	return cfImageDesktop(url, preset);
}

onMounted(() => {
  // 哨兵要等 DOM 掛上才觀察得到；早於首則訊息渲染也沒關係，
  // 內容一撐高就會通知（見 setupScrollAnchorObserver）。
  nextTick(() => setupScrollAnchorObserver());

  // 載入 HTML Card Web Components（hc-btn, hc-bar, hc-stat, hc-tag, hc-collapse 等）
  import('@/common/html-card-components.js').catch(err => {
    console.warn('HTML Card Components 載入失敗:', err);
  });

  // 重寫 / 載入對話事件監聽（從 rewrite.vue / historySelect.vue 派發）
  // 注意：原本寫在 onShow 內，H5 切 tab 會反復綁定造成泄漏 → 改為 onMounted 一次性註冊

  // 輸入框的鍵盤由輸入區元件自己管（Enter 送出、Shift+Enter 換行、觸控裝置只留
  // 送出鍵）。這裡**不得**再掛一個送出用的 keydown：舊頁面掛過一個 Shift+Enter
  // 送出的原生監聽，跟元件的規則疊起來就變成兩個鍵都送出、而且打不出換行。
  //
  // 組字狀態仍然在這裡追：意圖 API 的 isComposing() 與送出前的保險都讀它，
  // 而 e.isComposing 在部分輸入法上不可靠。
  // #ifdef H5
  nextTick(() => {
    const textareaEl = document.getElementById('send_textarea');
    if (textareaEl) {
      textareaEl.addEventListener('compositionstart', () => { imeComposing.value = true; });
      textareaEl.addEventListener('compositionend', () => { imeComposing.value = false; });
    }
  });
  // #endif

  // 鍵盤快捷鍵
  // #ifdef H5
  keyboardHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // 蓋在畫面上的東西先關：功能面板、彈層。ESC 在有東西蓋著的時候按下去，
    // 玩家要的是把它關掉，不是停掉正在生成的回覆。
    const next = onEscape(panel.value);
    if (next !== panel.value) {
      e.preventDefault();
      panel.value = next;
      return;
    }
    // Escape：生成中就停止（ChatGPT / Claude.ai 慣例）。
    // 透過 onActionBtnClick 統一走 debounce 檢查，避免繞過 500ms guard。
    if (actionBtnState.value === 'stop') {
      e.preventDefault();
      onActionBtnClick();
    }
  };
  document.addEventListener('keydown', keyboardHandler);

  // H5 环境下使用原生滚动事件监听（更可靠）
  setTimeout(() => {
    const messageArea = document.querySelector('#scrollview');
    if (messageArea) {
      messageArea.addEventListener('scroll', nativeScrollHandler);
    }
  }, 1000);

  // 追蹤用戶輸入手勢（對齊 mobile 的修法），讓 scroll handler 能區分
  // 「真實手指/wheel/指標」vs「程式化 scrollTo 餘波 + Safari elastic 雜訊」。
  // 全部走 capture phase + passive 不打擾原生 scroll。
  document.addEventListener('touchstart', _onUserGestureStart, { capture: true, passive: true });
  document.addEventListener('touchend', _onUserGestureEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', _onUserGestureEnd, { capture: true, passive: true });
  document.addEventListener('pointerdown', _onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointerup', _onPointerUp, { capture: true, passive: true });
  document.addEventListener('pointercancel', _onPointerUp, { capture: true, passive: true });
  document.addEventListener('wheel', _onWheel, { capture: true, passive: true });
  // #endif
})

// #ifdef H5
function _onUserGestureStart() { _touchScrollActive = true; }
function _onUserGestureEnd() { _touchScrollActive = false; _touchScrollEndAt = Date.now(); }
// 只追蹤滑鼠 / 觸控板拖曳;鍵盤等非滾動指標事件不算手勢
function _onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') {
    _pointerScrollActive = true;
  }
}
function _onPointerUp(e: PointerEvent) {
  if (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') {
    _pointerScrollActive = false;
    _pointerScrollEndAt = Date.now();
  }
}
function _onWheel() { _wheelScrollEndAt = Date.now(); }
// #endif

// 版面讀角色資料的單一入口。
//
// 直接開卡片網址進來時，角色細節還在路上，store 裡的 currentRole 是 null——
// 版面上任何一處直接讀 currentRole.xxx 都會在第一次繪製時丟出例外，而 Vue 的
// 繪製例外會讓整棵子樹停在那裡：畫面上是一張空白的對話頁，沒有訊息、沒有開場白，
// 也沒有任何看得出原因的錯誤。永遠給一個空物件，等資料回來再自然更新。
// 純預覽沒有角色：頂欄與訊息署名用草稿的名字。
const roleView = computed(() => {
  if (previewOnly.value) return { roleName: previewRoleName() }
  return unref(currentRole) || {}
});

const getBackgroud = computed(() => {
  return formData.backgroundUrl
      ? formData.backgroundUrl
      : roleView.value.roleBackground;
});

// 只回「玩家或作者真的設過」的那個值。desktop 先前沒有背景圖層，補上時若沿用
// getBackgroud（會 fallback 到角色預設背景），等於一次改掉所有既有卡的外觀。
const playerBackgroundUrl = computed(() => formData.backgroundUrl || '');

onLoad((options) => {
  //监听页面加载
  from.value = stageHost.storage.get("from") || '';
  version.value = stageHost.storage.get("version") || '';

  // 三種進場（owner 2026-09-05）：只有卡片 ID＝一般遊玩；只有草稿＝純預覽，
  // 不碰伺服器；兩個都有＝照常遊玩，但作者資產換成本機草稿。
  // 試玩卡：入口頁剛把本機檔案建成一張會到期的私有卡，玩法跟一般卡完全一樣，只多個徽章。
  trialCard.value = options.trial === '1';
  const draftId = options.draft ? String(options.draft) : '';
  if (draftId) {
    bootFromDraft(draftId, options.roleId);
    return;
  }
  bootRole(options.roleId, null);
});

async function bootFromDraft(draftId: string, targetRoleId: any) {
  let draft: AuthorDraft | null = null;
  try {
    draft = await (await getAuthorDraftStore()).get(draftId);
  } catch (e) { /* 讀不到就當沒有 */ }
  if (!draft) {
    // 草稿不在了（換了瀏覽器、清了資料）：說清楚、送回入口，不留在空畫布上。
    uni.showToast({ title: t('openChat.preview.missing'), icon: 'none' });
    setTimeout(() => uni.reLaunch({ url: '/pages/play/entry' }), 1200);
    return;
  }
  previewDraft.value = draft;
  if (targetRoleId) {
    bootRole(targetRoleId, draft);
    return;
  }
  previewOnly.value = true;
  // 沒有卡：把角色識別清成空字串，免得下游把預設的 0 當成一張卡。
  roleId.value = '' as any;
  // onLoad 在掛載之前；作者容器要掛在 body 上、量對話欄，等 DOM 在了再套。
  await nextTick();
  applyAuthorAsset(draftToAuthorAsset(draft));
  seedPreviewOpening(draft);
}

function bootRole(targetRoleId: any, draft: AuthorDraft | null) {
  const options = { roleId: targetRoleId };
  roleId.value = options.roleId;
  if (draft) {
    nextTick(() => applyAuthorAsset(draftToAuthorAsset(draft)));
  } else {
    loadAuthorAsset(options.roleId);
  }
  /*
    先把遊玩設定清成「還不知道」。

    共用的表單初值裡塞著客戶端自己編的模型代號與一個猜出來的性別。留著它們的話：
    伺服器查不到那個代號，會落到未知模型的回退價；而玩家第一次存人設時，那個他
    從來沒選過的性別會被一起寫進去。空值才是誠實的——設定的主是伺服器。
  */
  Object.assign(formData, ROLE_SETTINGS_DEFAULTS);
  formData.selectModelName = '';
  // 遊玩設定要在第一次送出之前到手：送出那一輪帶的模型就是從這裡讀的。
  ensureRoleSettings().then(loadModelCatalog);
  // Agent 模式開沒開要等遊玩設定到手（支不支援按這張卡挑的模型算）。
  ensureRoleSettings().then(loadMultiPassPreference);
  uni.$on('multiPassPreferenceUpdated', onMultiPassPreferenceUpdated);
  formData.roleId = options.roleId;

  setCurrentRoleId(options.roleId);
  getRole(async (error, data) => {
    if (error) return;
    greeting.list = buildGreetingList(data);
    prologue.value = buildPrologueList(data);
    if (data && data.roleAvatar) pic.value = data.roleAvatar;
    // 選開場白只在「這張卡還沒開始過」時才有意義。
    // 回頭玩的人押後開對話，畫面上會變成一張沒有歷史的空白對話頁加一個選單——
    // 而他的紀錄好好地在伺服器上。
    if (shouldDeferStart(greeting.list) && !(await hasExistingConversation())) {
      // 伺服器建立對話的當下就把開場白落下去了，先開就等於替玩家選了第一條。
      pendingGreetingStart.value = true;
      renderGreetingPreview();
      return;
    }
    chatStart();
  });
}

const chatContainerRef = ref<null | HTMLElement>(null)
const scrollableElement = ref<null | HTMLElement>(null)
const createTipShow = ref(false);

// 键盘快捷键处理器引用
let keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

const from = ref('');
const version = ref('');
const roleId = ref(0);//角色ID
const pic = ref("");//角色头像
const historyConversation = ref(false); //是否有历史对话
const conversationId = ref(''); //历史对话ID

// Phase 2a：當 conversationId 首次被設定時，嘗試從 localStorage 拉回未完成的 stream
watch(conversationId, (newId, oldId) => {
  if (newId === oldId) return;
  if (!newId) return;
  // 只在首次設定時檢查（避免切換對話時重複觸發）
  if (oldId) return;
  nextTick(() => tryResumeOnMount());
});

function tryResumeOnMount() {
  if (!unref(conversationId)) return;
  if (resumePendingBackwardOperation(String(unref(conversationId)))) return;
  if (resumePendingStopSettlement()) return;
  if (socket.value) {
    console.log('[Stream] tryResumeOnMount 時 socket 已存在，跳過');
    return;
  }
  const pending = readPendingStreamState();
  if (!pending) return;
  if (pending.kind === 'recoverDraft') {
    recoverStoredStreamDraft(pending);
    return;
  }

  // 立即推占位，不等 streamMeta / 首個 answer chunk
  const pushPlaceholder = () => {
    const aiBubbleId = nextBubbleId();
    if (pendingChatTurn) pendingChatTurn.aiBubbleId = aiBubbleId;
    currentChatId.value = aiBubbleId;
    upsertPendingAIBubble({
      id: aiBubbleId,
      operationBubbleId: aiBubbleId,
      content: '',
      thinkingContent: '',
      thinkingCollapsed: true,
      type: 0,
      pic: unref(pic),
      playstate: false,
      chatLoading: true,
      chatFinish: false,
      maskPosition: 1,
    });
    return aiBubbleId;
  };

  if (pending.kind === 'byStreamId') {
    console.log('[Stream] tryResumeOnMount byStreamId, full replay from 0:', pending.streamId, 'conv=', unref(conversationId));
    streamId.value = pending.streamId;
    lastEventId.value = 0;
    isStreamActive.value = true;
    isResumeInitial.value = true;
    if (pending.pendingPayload) {
      pendingResendPayload.value = {
        payload: pending.pendingPayload,
        pendingSince: pending.pendingSince,
      };
      beginPendingChatTurn({
        draft: pending.pendingPayload.message,
        payload: pending.pendingPayload,
        startedAt: pending.pendingSince,
        expectsAccepted: !pending.pendingPayload.rewrite && !pending.pendingPayload.contine,
        operationId: pending.operationId,
        operationState: pending.operationState,
        operationVersion: pending.operationVersion,
        serverOperationKind: pending.serverOperationKind,
        assistantChatId: pending.assistantChatId,
        userChatId: pending.userChatId,
        targetChatId: pending.targetChatId,
        sourceChatId: pending.sourceChatId,
        checkpointChatId: pending.checkpointChatId,
        parentOperationId: pending.parentOperationId,
        sourceOperationId: pending.sourceOperationId,
        outputDisposition: pending.outputDisposition,
        finishReason: pending.finishReason,
        allowedActions: pending.allowedActions,
        reasonCode: pending.reasonCode,
        messageKey: pending.messageKey,
      });
    } else if (pending.operationId) {
      beginPendingChatTurn({
        expectsAccepted: false,
        accepted: true,
        operationId: pending.operationId,
        operationState: pending.operationState,
        operationVersion: pending.operationVersion,
        serverOperationKind: pending.serverOperationKind,
        assistantChatId: pending.assistantChatId,
        userChatId: pending.userChatId,
        targetChatId: pending.targetChatId,
        sourceChatId: pending.sourceChatId,
        checkpointChatId: pending.checkpointChatId,
        parentOperationId: pending.parentOperationId,
        sourceOperationId: pending.sourceOperationId,
        outputDisposition: pending.outputDisposition,
        finishReason: pending.finishReason,
        allowedActions: pending.allowedActions,
        reasonCode: pending.reasonCode,
        messageKey: pending.messageKey,
        operationKind: operationKindFromServer(pending.serverOperationKind),
      });
    }
    pushPlaceholder();
    connectWebSocket({
      resumeStreamId: pending.streamId,
      lastEventId: 0,
    });
  } else if (pending.kind === 'byConv') {
    // 刷新發生在 send() → streamMeta 窗口內：沒有 streamId，只有 pendingPayload。
    // 透過 server 的 mode=tryResume 反查 conversation 有沒有 active session。
    console.log(`[Stream] tryResumeOnMount byConv, pendingSince=${pending.pendingSince} conv=${unref(conversationId)}`);
    isStreamActive.value = true;
    isResumeInitial.value = true;
    // 包一層帶上 pendingSince 給 noActiveStream 判斷 resend 時效
    pendingResendPayload.value = { payload: pending.pendingPayload, pendingSince: pending.pendingSince };
    beginPendingChatTurn({
      draft: pending.pendingPayload.message,
      payload: pending.pendingPayload,
      startedAt: pending.pendingSince,
      expectsAccepted: !pending.pendingPayload.rewrite && !pending.pendingPayload.contine,
    });
    pushPlaceholder();
    connectWebSocket({ tryResumeByConv: true });
  } else if (pending.kind === 'byClientOperationId') {
    if (pending.expired === true) {
      // I-1（No dead end）：clientOperationId-only 的殘留紀錄已超過可見結果
      // 上界。這條路徑代表 provider 從未回傳 operationId（送出後就失敗、
      // 網路斷、伺服器重啟或 pre-admission 失敗），沒有可查詢的伺服器
      // operationId 能做權威核對，因此不像 byOperationId 分支那樣先做一次
      // 讀取，改為直接放手：不設 isStreamActive、不 pushPlaceholder、不設
      // pendingResendPayload（會讓輸入框被 mutation guard 卡住），交給既有的
      // releaseExpiredChatOperationOwnership 清乾淨殘留紀錄並提示一次。
      console.log(
        '[ChatOperation] 本機 clientOperationId 紀錄已超過可見結果上界，放棄恢復並清除殘留:',
        pending.clientOperationId,
      );
      beginPendingChatTurn({
        draft: pending.pendingPayload.message,
        payload: pending.pendingPayload,
        startedAt: pending.pendingSince,
        expectsAccepted: true,
        clientOperationId: pending.clientOperationId,
        preAdmissionErrorType: pending.preAdmissionErrorType,
        preAdmissionErrorAt: pending.preAdmissionErrorAt,
        exactIdentityEmptyProbeCount: pending.exactIdentityEmptyProbeCount,
      });
      releaseExpiredChatOperationOwnership(null, 'mount');
      return;
    }
    console.log('[ChatOperation] 以 exact clientOperationId 恢復持久化 intent:', pending.clientOperationId);
    isStreamActive.value = true;
    isResumeInitial.value = true;
    pendingResendPayload.value = {
      payload: pending.pendingPayload,
      pendingSince: pending.pendingSince,
    };
    beginPendingChatTurn({
      draft: pending.pendingPayload.message,
      payload: pending.pendingPayload,
      startedAt: pending.pendingSince,
      expectsAccepted: true,
      clientOperationId: pending.clientOperationId,
      preAdmissionErrorType: pending.preAdmissionErrorType,
      preAdmissionErrorAt: pending.preAdmissionErrorAt,
      exactIdentityEmptyProbeCount: pending.exactIdentityEmptyProbeCount,
    });
    const aiBubbleId = pushPlaceholder();
    if (pendingChatTurn) pendingChatTurn.socketToken = 0;
    currentChatId.value = aiBubbleId;
    probePendingTurnAfterDurableAckTimeout(0);
  } else if (pending.kind === 'byOperationId') {
    // I-1（No dead end）：本機紀錄已超過可見結果上界時，不能再假裝這輪仍在
    // 進行中——不推占位、不設 isStreamActive，但仍必須做一次權威讀取
    // （requestAuthoritativeOperationReconciliation），因為伺服器可能已經把
    // 結果持久化，跳過讀取會把它憑空丟掉。讀回非 terminal 時该函式自己會呼叫
    // releaseExpiredChatOperationOwnership 放手。
    const isExpiredResume = pending.expired === true;
    console.log(
      isExpiredResume
        ? '[ChatOperation] 本機紀錄已超過可見結果上界，改為單次權威讀取後視情況放手:'
        : '[ChatOperation] stream 已過期，改以權威 operation status 恢復:',
      pending.operationId,
    );
    if (!isExpiredResume) {
      isStreamActive.value = true;
      isResumeInitial.value = true;
    }
    beginPendingChatTurn({
      expectsAccepted: false,
      accepted: true,
      operationId: pending.operationId,
      operationState: pending.operationState,
      operationVersion: pending.operationVersion,
      serverOperationKind: pending.serverOperationKind,
      assistantChatId: pending.assistantChatId,
      userChatId: pending.userChatId,
      targetChatId: pending.targetChatId,
      sourceChatId: pending.sourceChatId,
      checkpointChatId: pending.checkpointChatId,
      parentOperationId: pending.parentOperationId,
      sourceOperationId: pending.sourceOperationId,
      outputDisposition: pending.outputDisposition,
      finishReason: pending.finishReason,
      allowedActions: pending.allowedActions,
      reasonCode: pending.reasonCode,
      messageKey: pending.messageKey,
      operationKind: operationKindFromServer(pending.serverOperationKind),
      startedAt: pending.pendingSince,
    });
    if (!isExpiredResume) pushPlaceholder();
    requestAuthoritativeOperationReconciliation('mount');
  }
}
const talkList = ref([]);//对话列表
const isUserAtBottom = ref(true); //用户是否在底部（控制是否自动滚动）
const autoScrollEnabled = ref(true); //是否启用自动滚动（用户手动往上滚时禁用）
const isExpanded = ref(false);//简介展开
const messageQueue = ref([]);
const isConnecting = ref(false);
const focus = ref(false);//对话输入框焦点
const contine = ref(false);//继续说
const rewrite = ref(false); //是否重说
const rewriteTargetChatId = ref(''); // V2 rewrite 必須指向已 accepted 的 USER chatId
const continueTargetChatId = ref(''); // additive exact-parent identity for capable Continue
const openMore = ref(false); //开启更多功能
const openLight = ref(false); //开启更多灵感
const content = ref(''); //输入对话
type ModExpiryAcknowledgement = {
  payload: any
  draft: string
  clientTurnId: string
  ackToken: string
  expiredCount: number
  expiredMods: Array<{
    name?: string
    nameEn?: string
    nameJa?: string
    nameKo?: string
    expiresAt?: string
    canRenew?: boolean
  }>
}
function projectExpiredModSummaries(value: unknown): ModExpiryAcknowledgement['expiredMods'] {
  const safeText = (candidate: unknown) => typeof candidate === 'string' ? candidate : ''
  return Array.isArray(value)
    ? value.map((item: any) => ({
        name: safeText(item?.name),
        nameEn: safeText(item?.nameEn),
        nameJa: safeText(item?.nameJa),
        nameKo: safeText(item?.nameKo),
        expiresAt: safeText(item?.expiresAt),
        canRenew: item?.canRenew === true,
      }))
    : []
}
// A server-side expiry gate rejects the turn before persistence. Keep only the
// minimum replay material locally; the modal never renders MOD ids or content.
const modExpiryAckOpen = ref(false);
const modExpiryAckBusy = ref(false);
const modExpiryAck = ref<ModExpiryAcknowledgement | null>(null);
const modExpiryRetryAcknowledgement = ref<ModExpiryAcknowledgement | null>(null);
const modExpiryAffectedCount = computed(() => Math.max(0, Number(modExpiryAck.value?.expiredCount) || 0));
function expiredModName(mod: any) {
  return localizedField(mod || {}, 'name', locale.value) || t('mod.marketplaceV2.unavailable');
}
function expiredModDate(mod: any) {
  const raw = mod?.expiresAt;
  if (!raw) return t('mod.marketplaceV2.unavailable');
  const date = new Date(String(raw));
  const formatted = Number.isNaN(date.getTime())
    ? t('mod.marketplaceV2.unavailable')
    : new Intl.DateTimeFormat(locale.value).format(date);
  return t('mod.expiry.expiredAt', { date: formatted });
}
const imeComposing = ref(false); // IME composing 狀態 · 防 Enter 在中文/日文輸入候選階段被搶走 (issue desktop#9)
const reWriteContent = ref('');//改写内容
const manualEditSubmitting = ref(false)
const tempContent = ref(''); //临时记录输入内容
const currentChatId = ref(''); //当前对话
const replyContent = ref(''); //答复内容
const thinkingContent = ref(''); //模型思考過程
const lastFinishReason = ref(''); // 模型結束原因（content_filter/length/error）
const socket = ref(null);
const retryTimes = ref(0);

// Phase 2d — 主動作按鈕（Send / Stop / Spinner / Disabled）狀態機
// 四態：
//   send-disabled  — textarea 空、不在 streaming、不 compacting
//   send           — textarea 有內容
//   stop           — streaming 中且 streamId 已取得（使用者可中斷）
//   compacting     — 記憶整理中、或 streaming 但 streamId 尚未回（防誤觸）
// 依賴：isCompacting, isStreamActive, streamId, content（必須在本 block 之前宣告）
const userStopRequested = ref(false);
const actionBtnState = computed<'send-disabled' | 'send' | 'stop' | 'compacting' | 'continue'>(() => {
  return resolveChatActionButtonState({
    isCompacting: unref(isCompacting),
    userStopRequested: unref(userStopRequested),
    isStreamActive: unref(isStreamActive),
    streamId: unref(streamId),
    content: unref(content),
    operations: unref(knownOperations),
  });
});
const actionBtnClass = computed(() => ({
  'has-content': actionBtnState.value === 'send' || actionBtnState.value === 'stop'
    || actionBtnState.value === 'continue',
  'is-stop': actionBtnState.value === 'stop',
  'is-compacting': actionBtnState.value === 'compacting',
  'disabled': actionBtnState.value === 'send-disabled' || actionBtnState.value === 'compacting',
}));
const actionBtnAriaLabel = computed(() => {
  switch (actionBtnState.value) {
    case 'stop': return t('chat.stop_generation_aria') || '停止生成';
    case 'continue': return t('multiPass.continueAction') || '繼續';
    case 'compacting': return t('chat.compacting_aria') || '整理記憶中，無法中斷';
    default: return t('chat.send_aria') || '送出';
  }
});
const actionBtnTooltip = computed(() => {
  if (actionBtnState.value === 'compacting' && unref(isCompacting)) {
    return t('chat.compacting_tip') || '記憶整理中，無法中斷';
  }
  return '';
});
/*
  把暫停的那一輪 Agent 接著跑。

  「繼續」不帶輸入框的字——它跟送新訊息是兩個不同的意圖。走既有的
  retry_generation：那條路重用同一則使用者訊息、不新增第二筆，正是「把這一輪
  跑完」的語意；多帶一個續跑來源讓伺服器接上斷點。

  輸入區那顆鍵與訊息底下的系統氣泡都走這一條：先前系統氣泡的「繼續說」走的是
  一般的 continue（在助理那一列後面接著寫），可是 Agent 暫停後那一輪還沒收尾，
  伺服器會回「還有沒完成的操作」——按了等於沒按（owner 2026-09-04 回報）。
  回傳 false 代表沒有可以續的那一輪。
*/
function resumeAgentOperation(): boolean {
  const resumable = findResumableAgentOperation(unref(knownOperations));
  const target = resolveAgentResumeTarget(resumable, unref(talkList));
  if (!target) return false;
  // retry_generation 的相容舊投影**就是** rewrite=true(伺服器契約寫在
  // router/chat_operation_runtime.go)。只挑型別名稱、把兩個舊旗標都清成 false
  // 的話,每次「繼續」都會在准入被判定為宣告與旗標矛盾而擋掉——連線兩百多毫秒
  // 就關,前端只能一直輪詢,畫面卡在「正在回覆」不動(owner 2026-08-08 在 mobile 實測)。
  //
  // 順帶:send() 裡有內容且非 rewrite 才會推新的使用者泡泡,所以走這條路
  // 那顆空的使用者泡泡自己就不會出現了。
  rewrite.value = true;
  contine.value = false;
  pendingRewriteSnapshot = null;
  rewriteTargetChatId.value = target.chatId;
  resumeFromOperationIdOverride = target.operationId;
  requestedOperationKindOverride = 'retry_generation';
  // 訊息帶的是原本那一句,不是輸入框裡的字——「繼續」是把這一輪跑完。
  // 使用者正在打的草稿不能被吃掉:他並沒有要送出那些字。
  const pendingDraft = unref(content);
  content.value = target.message;
  send();
  content.value = pendingDraft;
  return true;
}

function onActionBtnClick() {
  const state = actionBtnState.value;
  noteAuthorGestureAndRewrite(state);
  if (state === 'stop') {
    return sendStop();
  }
  if (state === 'continue') {
    resumeAgentOperation();
    return;
  }
  if (state === 'send') {
    // 工單 #41-F1：用戶新句發送入口，雙清 rewrite/contine，避免殘留上一輪
    // 重説/繼續的旗標污染這次的普通新句 payload。
    rewrite.value = false;
    contine.value = false;
    return send();
  }
  // send-disabled / compacting 不做事
}

function sendStop() {
  // 使用者按下停止之後,畫面上不能再說「模型暫時不穩定,{s} 秒後再試」——
  // 那是把他自己的操作說成外部故障,而且那行字會一直掛著不會自己消失
  // (重試狀態原本沒有任何地方清掉,owner 2026-08-08 在 mobile 一眼看出是假的)。
  //
  // 只清「正在重試」這組敘述,不動 prepSteps:那些步驟是他已經付過錢的成果。
  prepStepStage.value = '';
  prepRetryAttempt.value = 0;
  prepRetryMax.value = 0;
  prepRetryInSeconds.value = 0;
  const currentStreamId = unref(streamId);
  const currentConversationId = String(unref(conversationId) || '');
  const stopSettlement = persistPendingStopSettlement(
    currentConversationId,
    currentStreamId,
    pendingChatTurn,
  );
  const capturedSocket: any = unref(socket);
  if (capturedSocket && typeof capturedSocket.send === 'function') {
    try {
      capturedSocket.send({
        data: JSON.stringify({ action: 'stop' }),
        fail: (err) => console.error('[Stream] sendStop 傳送失敗:', err)
      });
      console.log('[Stream] stop 訊息已送出, streamId=', currentStreamId);
    } catch (e) {
      console.error('[Stream] sendStop 呼叫例外:', e);
    }
  }
  requestConversationStopFallback(currentConversationId, currentStreamId, stopSettlement);
  finalizeUserStoppedStream();
}

function requestConversationStopFallback(
  stopConversationId: string,
  stopStreamId: string,
  stopSettlement: PendingStopSettlement | null = null,
) {
  if (!stopConversationId) return;
  try {
    _this.http.post(_this.requestUrl.chatStop, {
      header: { 'content-type': 'application/json' },
      data: { conversationId: stopConversationId, streamId: stopStreamId },
      showLoading: false,
    }).then(() => {
      // The authority server settles a stopped durable prefix in this request.
      // The local timeline is already optimistically settled and unlocked.
      // Refresh history after the ACK instead of restoring transport ownership.
      operationStatusPollScheduler.cancel();
      clearPersistedStoppedStream(stopSettlement);
      clearPendingStopSettlement(stopSettlement);
      if (pendingChatTurn) return;
      ajax.value.flag = true;
      ajax.value.page = 1;
      getHistoryMsg();
    }).catch((e: any) => {
      console.error('[Stream] chatStop fallback failed:', e);
    });
  } catch (e) {
    console.error('[Stream] chatStop fallback exception:', e);
  }
}

function finalizeUserStoppedStream() {
  const stoppedPrompt = unref(tempContent);
  const pendingOperation = pendingChatTurn;
  const awaitsDurableOperationTerminal = isReplacementOperationKind(
    pendingChatTurn?.operationKind,
  )
    || pendingChatTurn?.operationKind === 'continue'
    || shouldAwaitDurableStopTerminal(pendingChatTurn);
  userStopRequested.value = true;
  lastFinishReason.value = 'user_stop';

  const last = talkList.value[talkList.value.length - 1];
  const bubbleId = unref(currentChatId) || ((last && last.type === 0 && !last.chatFinish) ? last.id : nextBubbleId());
  const hasPartial = !!(unref(replyContent) || unref(thinkingContent));

  if (hasPartial) {
    const data: any = {
      id: bubbleId,
      content: unref(replyContent),
      thinkingContent: unref(thinkingContent),
      thinkingCollapsed: true,
      type: 0,
      pic: unref(pic),
      chatLoading: false,
      chatFinish: true,
      maskPosition: 1,
      finishReason: 'user_stop',
    };
    if (pendingMessageMeta.value?.isV3 === true) {
      data.isV3 = true;
    }
    upsertPendingAIBubble(data);
  } else {
    removeOrphanPlaceholder();
  }

  if (bubbleId) {
    try { clearStreamCache(String(bubbleId) + ':0'); } catch (_) {}
  }
  // 清掉排隊中的訊息避免使用者停止後又被送出
  if (unref(messageQueue) && messageQueue.value.length > 0) {
    messageQueue.value = [];
  }
  // 只有已確認 legacy 的本地 Stop 才恢復草稿。Durable/unknown lane 已接受
  // 這次 operation；把同一 prompt 填回輸入框會誘使用戶重送並重複扣點。
  if (!awaitsDurableOperationTerminal && !hasPartial && stoppedPrompt && !unref(content)) {
    content.value = stoppedPrompt;
  }
  // Rewrite／Continue 與 operation-capable Send 的本地 Bubble 只是視覺快照；
  // Stop settlement 另存 operation identity 供 ACK／重啟補送，舊 request 不得再
  // 持有 composer ownership。server durable terminal 仍決定採用與收費。
  if (awaitsDurableOperationTerminal) {
    talkList.value = settleOptimisticDurableUserStop(
      talkList.value,
      pendingChatTurn,
      hasPartial,
    );
    releaseStoppedComposerOwnership();
    clearStreamState();
    try { closeWebSocket(); } catch (_) {}
    socket.value = null;
    lastFinishReason.value = '';
    tempContent.value = '';
    replyContent.value = '';
    thinkingContent.value = '';
    pendingMessageMeta.value = null;
    return;
  }

  // 一般 Send 的本地 Stop 已結束這次 transport ownership。若保留 pending turn，
  // 下一次 send 會被 in-flight guard 永久擋住。
  const legacyOperationBubbleId = pendingOperation?.aiBubbleId || bubbleId;
  talkList.value = finalizeLegacyStoppedCandidate(talkList.value, legacyOperationBubbleId);
  releaseStoppedComposerOwnership();
  clearStreamState();
  try { closeWebSocket(); } catch (_) {}
  socket.value = null;
  lastFinishReason.value = '';
  tempContent.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  pendingMessageMeta.value = null;
}

function releaseStoppedComposerOwnership() {
  const released = releaseChatComposerAfterStop({
    isStreamActive: unref(isStreamActive),
    isConnecting: unref(isConnecting),
    isCompacting: unref(isCompacting),
    userStopRequested: unref(userStopRequested),
    pendingResendPayload: unref(pendingResendPayload),
    pendingChatTurn,
  });
  isStreamActive.value = released.isStreamActive === true;
  isConnecting.value = released.isConnecting === true;
  userStopRequested.value = released.userStopRequested === true;
  pendingResendPayload.value = released.pendingResendPayload;
  pendingChatTurn = null;
  // compact/stream flags 都屬於被停止的 request；若任一殘留，輸入後仍會顯示灰鍵。
  clearCompactState();
}
const bottomPopupShow = ref(false)
const loading = ref(false)
const title = ref('')
const savedScrollTop = ref(0) // 保存滚动位置

const scrollTopValue = ref(0) // 控制scroll-view滚动位置

// 頂欄的動態玻璃（DESIGN §3.1）。捲動 0 → 完全透明，作者卡的版面直接透上來；
// 捲過 80px → 升到完整玻璃，訊息從底下穿過去時字才不會跟頂欄的字疊在一起。
// 三個常數（80 閾值 / 9px blur / 0.30 dim）跟站上其他浮層同一組，不要憑感覺改。
const headerScrollY = ref(0)
const headerStyle = computed(() => {
  const p = Math.max(0, Math.min(1, headerScrollY.value / 80));
  return {
    // backdrop-filter 不認 rpx（DESIGN §5.2 例外），這裡必須是 px
    '--h-blur': (p * 9) + 'px',
    '--h-sat': (1 + p * 0.3).toFixed(3),
    '--h-dim': (p * 0.30).toFixed(3),
  };
})

// V1.1: 创建心跳管理器和 SSE 解析器实例
const heartbeatManager = createHeartbeatManager();
const sseParser = createSSEParser();

const rollbackPending = ref(false);

function isTimelineMutationBlocked() {
  const storedOperation = readLsEntry();
  const hasPersistedOperationIdentity = !!String(
    storedOperation?.operationId
      || storedOperation?.clientOperationId
      || storedOperation?.pendingPayload?.clientOperationId
      || '',
  ).trim();
  const currentConversationId = String(unref(conversationId) || '');
  const hasPersistedBackward = !!(
    currentConversationId && readPendingBackwardOperation(currentConversationId)
  );
  return isChatSendInFlight({
    isStreamActive: unref(isStreamActive),
    isConnecting: unref(isConnecting),
    pendingResendPayload: unref(pendingResendPayload),
    pendingChatTurn: pendingChatTurn || (hasPersistedOperationIdentity ? { persisted: true } : null),
    isCompacting: unref(isCompacting),
    rollbackPending: unref(rollbackPending) || hasPersistedBackward,
  });
}

function notifyTimelineMutationBlocked() {
  message.warning(t('chat.operationPending') || t('chat.rollbackPending') || 'Please wait for the current operation.');
}

//对话请求参数
const ajax = ref({
  rows: 30, //每页数量
  page: 1, //页码
  flag: true, // 请求开关
  loading: true, // 加载中
  loadText: t('main.loading'),
  hasNextPage: false //是否有更多页
})

// 目前這個角色生效中的顯示層替換規則。
//
// 沒有資產的角色這裡永遠是空陣列，替換引擎完全不進場——不是「進場了但沒命中」，
// 是連呼叫都沒有。絕大多數對話走的就是這條路，成本與改動前完全相同。
//
// 鐵律：規則只作用在玩家看到的內容。送給模型的原文不經過這裡。
// 收斂成單一 ref：highlightText / renderMarkdown 有抽取式的特徵測試（把函式原始碼
// 拉出去單獨 eval），每多一個自由變數就得在那兩個測試的 vm context 裡多宣告一個。
// 一個物件比三個 ref 好維護，也讓「這兩支熱函式依賴什麼」一眼看得完。
// crossLine 只在資產變動時算一次，不必每次渲染都判。
const activeAuthorAsset = ref({ rules: [], version: 0, crossLine: false, variants: null });

// ── 作者預覽 ─────────────────────────────────────────────────────────
//
// previewDraft：這次進場帶著本機草稿（兩種模式都會設）。
// previewOnly：沒有卡片 ID。畫布上所有會打伺服器的東西都要看這個旗標——
// 沒登入也能用是這個模式的前提，任何一個漏網的請求撞到 401 就會被踢去登入頁。
const previewDraft = ref<AuthorDraft | null>(null);
const previewOnly = ref(false);
const trialCard = ref(false);
let previewSeq = 0;
let previewHintShown = false;

function previewRoleName(): string {
  const draft = previewDraft.value;
  return (draft && draftDisplayName(draft)) || t('openChat.preview.name');
}

// 預覽的第一則：草稿裡的開場白；沒有就放一句說明，玩家才知道下一步做什麼。
function seedPreviewOpening(draft: AuthorDraft) {
  talkList.value = [{
    id: 0,
    content: draft.opening || t('openChat.preview.openingHint'),
    type: 0,
    pic: '',
    maskPosition: 1,
    chatFinish: true,
  }];
}

// 純預覽的「送出」：不打伺服器，把輸入的字當成一則 AI 回覆畫出來，
// 讓作者拿自己的文字試規則。第一次攔下來時說一聲。
function previewEcho() {
  const text = String(unref(content) || '').trim();
  if (!text) return;
  content.value = '';
  previewSeq += 1;
  talkList.value.push({
    id: `preview-${previewSeq}`,
    content: text,
    type: 0,
    pic: '',
    maskPosition: 1,
    chatFinish: true,
  });
  nextTick(() => scrollToBottom(true));
  if (!previewHintShown) {
    previewHintShown = true;
    uni.showToast({ title: t('openChat.preview.intercepted'), icon: 'none', duration: 2500 });
  }
}

function setActiveAuthorAsset(asset) {
  const rules = (asset && Array.isArray(asset.rules)) ? asset.rules : [];
  activeAuthorAsset.value = {
    rules: rules,
    version: (asset && asset.version) || 0,
    crossLine: hasCrossLineRule(rules),
    // 伺服器算好的簡繁對照表：規則寫簡體、玩家看到繁體時仍要命中。
    variants: (asset && asset.variants) || null,
  };
  // 規則換了，之前用舊規則算出來的串流快取必須作廢。
  clearStreamCache();
}

// 每次套用規則都要帶同一組選項，抽出來免得兩個呼叫點漂移。
function authorRuleOptions() {
  return {
    variants: activeAuthorAsset.value.variants,
    // 酒館的規則在替換內容裡寫 {{user}} / {{char}}，套用當下展開。
    macros: { user: userDisplayName(), char: roleView.value.roleName || '' },
  };
}

// 沉浸模式：作者宣告的滿版乾淨畫布。
//
// 掛在 <html> 而不是頁面根節點，因為要收掉的是 uni-app 的全站左右 window，
// 那兩個在頁面外面（見 App.vue 的 .lt-immersive 區塊）。
const immersiveMode = ref(false);

function applyImmersiveMode(on) {
  immersiveMode.value = !!on;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('lt-immersive', !!on);
}

// 這張卡有沒有自訂版面。只看「作者真的放了東西」——空資產（status=none）不算，
// 否則每張卡都會被當成自訂版面而放寬行長。
const hasAuthorAsset = computed(() => activeAuthorAsset.value.rules.length > 0);

// ── 作者資產執行期 ──────────────────────────────────────────────
// 這一端的層級取值來自 Task 1 的實機盤點：對話頁既有元素用到 10000/9998/1000，
// 所以容器必須夾在既有值之間（見設計文檔 §3.3.2）。
// cover 必須高於 desktop 自己的左右側欄（.uni-left-window / .uni-right-window 都是
// 997），否則作者在螢幕邊緣掛的東西會被側欄蓋掉、連點都點不到；同時必須低於系統
// 彈窗（uni-modal 1200），平台的彈窗永遠要在作者內容之上。
const AUTHOR_LAYER_Z_INDEX = { under: 12, over: 30, cover: 1000 };

let authorAssetRuntime = null;
let authorColumnObserver = null;
let authorFixedNodeObserver = null;
let authorFixedNodeHoistLayer = null;
let authorFixedNodeHoistScheduled = false;
let lunaIntent = null;

// 宿主轉接：意圖 API 本身不碰 DOM，兩端各自把「作者想做什麼」接到自己的實作。
// 這一次的送出是不是來自 luna.send()。意圖 API 在呼叫 submit 之前已經改寫過，
// send() 不能再改一次。onActionBtnClick → send() 是同步的，所以旗標判定是準的。
let authorSubmitInFlight = false;

function buildAuthorAssetHost() {
  const inputEl = () => document.querySelector('textarea#send_textarea');
  const writeDraft = (text) => {
    const el = inputEl();
    if (!el) return false;
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  return {
    getInput: () => { const el = inputEl(); return el ? el.value : ''; },
    setInput: (text) => writeDraft(text),
    appendInput: (text) => { const el = inputEl(); return writeDraft((el ? el.value : '') + text); },
    // 送出後把草稿清掉。App 自己送出時清的是它的反應式狀態，而作者這條路徑是
    // 直接寫 DOM 的 textarea，兩者不同步——不補這一下，作者按鈕送出後輸入框會
    // 留著剛剛那句話，使用者以為沒送出去而再按一次。
    submit: () => {
      authorSubmitInFlight = true;
      try {
        // 意圖 API 在呼叫 submit 之前已經把 beforeSend 改寫後的字寫進 DOM 了，
        // 但 send() 讀的是反應式的 content——原生 input 事件回灌反應式狀態不保證
        // 在這一行之前完成。先手動同步，否則送出去的會是改寫前的內容。
        const el = inputEl();
        if (el) content.value = el.value;
        onActionBtnClick();
      } finally { authorSubmitInFlight = false; }
      writeDraft('');
      return true;
    },
    setBackground: (url) => {
      // 先動本地再寫穿伺服器。只寫伺服器的話畫面要重載才變，作者呼叫完會覺得
      // 「什麼都沒發生」——背景是 formData.backgroundUrl 算出來的，不同步就看不到。
      formData.backgroundUrl = url;
      // 寫穿伺服器：換裝置再進來這張卡，桌布還在。純預覽沒有卡也沒有登入，只改本地。
      if (!previewOnly.value) savePlayerPreference({ roleId: unref(roleId), prefs: { backgroundUrl: url } });
      return true;
    },
    scrollToTop: () => { scrollTopValue.value = 0; return true; },
    scrollToBottom: () => { scrollToBottom(true); return true; },
    // 用既有的 IME 旗標：組字期間改草稿會跟拼音打架。
    isComposing: () => imeComposing.value === true,
  };
}

function savePlayerPreference(payload) {
  try {
    _this.http.post(_this.requestUrl.playerPreferenceSave, { data: payload, showLoading: false });
  } catch (e) { /* 偏好寫入失敗不影響對話 */ }
}

// 進對話頁時載入這張卡的作者資產。沒有資產的角色到此為止——
// activeAuthorAsset 維持空陣列，替換引擎連呼叫都沒有。
//
// 走 serve 不走 mine：mine 是作者編輯態端點（登入 + ownership），玩家打它只會拿到
// 403，結果是這張卡只有作者本人看得到裝修。serve 是玩家路徑，公開卡連遊客都拿得到。
async function loadAuthorAsset(targetRoleId) {
  if (!targetRoleId) return;
  try {
    const res = await _this.http.get(_this.requestUrl.authorAssetServe, {
      data: { roleId: targetRoleId },
      showLoading: false,
      timeout: 8000,
    });
    if (res.statusCode !== 200 || !res.data) return;
    applyAuthorAsset(res.data);
  } catch (e) {
    // 資產載入失敗不能影響對話本身——沒有資產就是正常狀態。
    console.warn('[AuthorAsset] 載入失敗，本次對話不套用版面規則');
  }
}

// 把一份作者資產套到畫布上。伺服器回的與本機草稿轉出來的是同一個形狀，
// 所以兩條路在這裡會合；之後的規則、掛載、沉浸模式都不知道資產從哪來。
function applyAuthorAsset(asset) {
  try {
    const res = { data: asset };
    setActiveAuthorAsset(res.data);
    cardFormat.value = normalizeCardFormat(res.data.cardFormat);
    applyImmersiveMode(res.data.pageMode === 'immersive');
    if (!activeAuthorAsset.value.rules.length && !res.data.mountTrigger) return;

    authorAssetRuntime = createAuthorAssetRuntime({
      doc: document,
      layerZIndex: AUTHOR_LAYER_Z_INDEX,
      // 作者容器內的真實點擊登記為一次使用者手勢，讓作者按鈕呼叫的 send() 過得了關。
      // 只是放寬手勢來源，不會自己送出任何東西——作者沒呼叫 send() 就什麼都不會發生。
      // lunaIntent 這時還沒建好，所以晚綁：點擊發生時才取。
      onUserGesture: () => { if (lunaIntent) lunaIntent.noteUserGesture(); },
    });
    lunaIntent = createLunaIntentApi({
      host: buildAuthorAssetHost(),
      runtime: authorAssetRuntime,
    });
    window.luna = lunaIntent.api;

    if (res.data.mountTrigger) {
      // 掛載點的內容也走同一組規則：作者在資產裡寫一條規則把觸發串換成常駐內容。
      const mounted = scopeCardHtml(
        applyTavernRules(res.data.mountTrigger, activeAuthorAsset.value.rules, authorRuleOptions()).html,
        cardFormat.value,
      );
      const mountEl = authorAssetRuntime.mount({ mountLayer: res.data.mountLayer, html: mounted });
      // 來源寫在容器上：MMD 的卡以 content-box 排版（見 canvas.css 的說明），酒館的卡不是。
      if (mountEl) mountEl.setAttribute('data-luna-author-format', cardFormat.value);
      if (needsKaiFallback(mounted)) ensureKaiFallback();
      measureAuthorColumn();
      observeAuthorColumn();
      observeComposerOverhang();
      observeCardTheme();
      window.addEventListener('resize', measureAuthorColumn);

      // 掛載點自己只搬一次，但訊息串裡的內容會不斷冒出新的 fixed 面板重複觸發
      // （見 runFixedAuthorNodeHoist 的說明），這裡記住掛載層的名字讓那支函式
      // 知道要搬去哪個容器，再跑一次＋掛上持續監看。
      authorFixedNodeHoistLayer = res.data.mountLayer;
      runFixedAuthorNodeHoist();
      observeFixedAuthorNodes();
    }
  } catch (e) {
    // 套用失敗不能影響對話本身——沒有資產就是正常狀態。
    console.warn('[AuthorAsset] 套用失敗，本次對話不套用版面規則');
  }
}

// 使用者按下主行動鍵時：標記手勢，並讓作者的送出前改寫也套用在手打的訊息上。
//
// 刻意抽成獨立函式而不是寫在 onActionBtnClick 裡：那個函式有一支源碼掃描式的
// 特徵測試（chat-turn-flag-hygiene），會用字面比對確認旗標清理的先後順序。
// 在它體內多寫任何含有相同字樣的程式或註解，都會讓那支測試誤判順序。
// 只負責標記手勢。作者的 beforeSend 改寫已移到 send() 裡——這顆按鈕不是唯一的
// 送出入口，Shift+Enter 與 confirm-type="send" 都直接呼叫 send()，改寫掛在這裡的話
// 鍵盤送出會靜默略過作者的改寫（而 desktop 上鍵盤才是主要送出方式）。
function noteAuthorGestureAndRewrite(state) {
  if (!lunaIntent) return;
  // 標記「現在是使用者手勢」：非手勢路徑一律拒絕，避免定時器自動送變成自問自答。
  lunaIntent.noteUserGesture();
  if (state !== 'send') return;
}

// 對話頁被子頁疊上去時只會 onHide、不會 onUnload——聊天頁還活著，作者容器是
// 掛在 body 上的 fixed 節點，不收起來就會蓋在子頁上面。藏起來而不是 dispose：
// dispose 會讓作者的腳本在返回時重跑一次。
//
// 量對話欄，把位置寫成容器上的 --lt-chat-col-* 變數。author-asset-mount.js 的
// under/over/cover 容器本身永遠貼滿視窗（position:fixed 直接解析到視窗，不再挪到
// 對話欄位置、也不再靠 transform 建立 containing block——那是三欄式聊天頁的舊行為，
// 畫布沒有側欄不需要它，見該檔 applyContainerBox 的說明）。這組變數只服務「作者
// 自己想選擇性地只蓋住對話欄那一塊」的情境（`right: var(--lt-chat-col-right)`），
// 不讀這組變數的卡完全不受影響、也不會被縮進對話欄。
function measureAuthorColumn() {
  if (!authorAssetRuntime) return;
  const el = document.querySelector('#chat');
  if (!el) return;
  const r = el.getBoundingClientRect();
  // 這一欄會捲動，rect 的高度是整份內容而不是看得到的那塊——夾回視窗，
  // 否則 bottom 會是負數，作者拿去定位就跑到畫面外了。
  const top = Math.max(0, r.top);
  const bottom = Math.min(window.innerHeight, r.bottom);
  authorAssetRuntime.setColumnMetrics(
    { left: r.left, top: top, width: r.width, height: Math.max(0, bottom - top) },
    window.innerWidth,
    window.innerHeight,
  );
}

// 對話欄要「持續」量，不能只量一次：載入資產的當下訊息還沒鋪完，那時的對話欄
// 只有一小截高；之後內容長到幾千 px，看得到的那塊變成整個視窗高。--lt-chat-col-*
// 是給選擇性讀它的作者用的即時數字，不是掛載當下的一次性快照，讀到舊值一樣會
// 讓那類卡片的面板算錯位置。
//
// resize 事件不夠：視窗根本沒變，變的是欄內的內容。
function observeAuthorColumn() {
  if (typeof ResizeObserver !== 'function') return;
  const el = document.querySelector('#chat');
  if (!el) return;
  authorColumnObserver = new ResizeObserver(function () { measureAuthorColumn(); });
  authorColumnObserver.observe(el);
}

// 作者把輸入區往上推（例如為了給自己的底部工具列讓位）時，捲動區的底部會被
// 輸入區蓋住，最後一則訊息的結尾永遠捲不出來。量出被蓋住多少，補成對話欄的
// 底部內距。純函式在 canvas-composer-overhang.ts。
let composerOverhangObserver = null;
let composerOverhangRaf = 0;
function measureComposerOverhang() {
  const scroll = document.querySelector('.scroll-view');
  const composer = document.querySelector('.composer-scope');
  if (!scroll || !composer) return;
  const s = scroll.getBoundingClientRect();
  const c = composer.getBoundingClientRect();
  const px = composerOverhang({ scrollBottom: s.bottom, scrollHeight: s.height, composerTop: c.top, composerHeight: c.height });
  const root = document.documentElement;
  if (px > 0) root.style.setProperty('--lt-canvas-composer-overhang', px + 'px');
  else root.style.removeProperty('--lt-canvas-composer-overhang');
}
function scheduleComposerOverhang() {
  if (composerOverhangRaf) return;
  const schedule = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame
    : (fn) => setTimeout(fn, 16);
  composerOverhangRaf = schedule(() => { composerOverhangRaf = 0; measureComposerOverhang(); });
}
// transform 不會觸發 ResizeObserver，所以除了尺寸還要盯 style／class 的變化——
// 作者的腳本通常就是改這兩個把輸入區推上去的。
// ── 從作者的卡抽出「塊」與「藥丸」的外觀 ──────────────────────────────
//
// 量卡片已經漆好的兩個節點（AI 氣泡、快捷鍵），把邊框／底色／圓角／主色寫回我們的變數，
// 我方的獨立區塊（準備軌跡、思考過程、中斷卡、狀態列）與藥丸（重新生成、上下文、chip）
// 就跟著卡片走。作者切日夜、卡片載入、第一則 AI 氣泡出現時都要重量一次。
let cardThemeObserver: MutationObserver | null = null
let cardThemeRaf = 0

function syncCardTheme() {
  if (typeof document === 'undefined') return
  const root = document.querySelector('.canvas-root') as HTMLElement | null
  if (!root) return
  const bubble = document.querySelector('.mes[data-lt-role="ai"] .mes_text') as HTMLElement | null
  const pill = document.querySelector('.shortcut-btn') as HTMLElement | null
  const b = bubble ? getComputedStyle(bubble) : null
  const p = pill ? getComputedStyle(pill) : null
  const vars = computeCardThemeVars({
    bubbleBorderColor: b?.borderTopColor, bubbleBorderWidth: b?.borderTopWidth, bubbleBorderStyle: b?.borderTopStyle,
    bubbleBackground: b?.backgroundColor, bubbleRadius: b?.borderTopLeftRadius,
    accentColor: p?.borderTopColor,
    pillBorderColor: p?.borderTopColor, pillBorderWidth: p?.borderTopWidth, pillBorderStyle: p?.borderTopStyle,
    pillBackground: p?.backgroundColor, pillColor: p?.color, pillRadius: p?.borderTopLeftRadius,
  })
  for (const name of CARD_THEME_VAR_NAMES) {
    const value = vars[name]
    if (value) root.style.setProperty(name, value)
    else root.style.removeProperty(name)
  }
}

function scheduleCardThemeSync() {
  if (typeof window === 'undefined') return
  if (cardThemeRaf) cancelAnimationFrame(cardThemeRaf)
  cardThemeRaf = requestAnimationFrame(() => { cardThemeRaf = 0; syncCardTheme() })
}

function observeCardTheme() {
  disposeCardTheme()
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
  cardThemeObserver = new MutationObserver(scheduleCardThemeSync)
  // 日夜切換多半是 html／body 上的 class 或 data-*；卡片載入會插入 <style>；訊息列會長出來。
  cardThemeObserver.observe(document.documentElement, { attributes: true })
  if (document.body) cardThemeObserver.observe(document.body, { attributes: true, childList: true })
  if (document.head) cardThemeObserver.observe(document.head, { childList: true })
  const list = document.querySelector('.chat-body')
  if (list) cardThemeObserver.observe(list, { childList: true })
  scheduleCardThemeSync()
}

function disposeCardTheme() {
  if (cardThemeObserver) { cardThemeObserver.disconnect(); cardThemeObserver = null }
  if (cardThemeRaf && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(cardThemeRaf); cardThemeRaf = 0 }
}

function observeComposerOverhang() {
  const composer = document.querySelector('.composer-scope');
  if (!composer) return;
  if (typeof MutationObserver === 'function') {
    composerOverhangObserver = new MutationObserver(scheduleComposerOverhang);
    composerOverhangObserver.observe(composer, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  window.addEventListener('resize', scheduleComposerOverhang);
  scheduleComposerOverhang();
}
function disposeComposerOverhang() {
  if (composerOverhangObserver) {
    try { composerOverhangObserver.disconnect(); } catch (e) { /* 收尾不得拋錯 */ }
    composerOverhangObserver = null;
  }
  window.removeEventListener('resize', scheduleComposerOverhang);
  try { document.documentElement.style.removeProperty('--lt-canvas-composer-overhang'); } catch (e) { /* 同上 */ }
}

// MMD 的「工具列／HUD 面板」這類卡片，慣用手法是讓 AI 每輪都在回覆裡重新吐一次
// 觸發標記（跟狀態欄快照同一套邏輯，每輪刷新一次）。我方的顯示規則引擎逐則訊息
// 展開，若標記展開出的是帶 `position:fixed` 的面板，含標記的每一則訊息都會各自
// 展開一份、留在自己的氣泡裡——氣泡常帶 `backdrop-filter`（卡片自己的玻璃效果），
// 這會把面板吸成氣泡的 containing block，貼著氣泡邊緣而不是視窗邊緣；而且觸發
// 幾次就疊幾份。
//
// MMD 真實平台上這類面板搬到了 body 級的單一容器（實測：面板節點是
// document.body 的直接子節點），觸發幾次都只剩一份。這裡補回同一件事：
// 訊息串裡帶 id 又是 fixed 的節點，第一次見到就搬進掛載層容器；容器裡已經有
// 同 id 的，代表這是重複觸發，直接丟掉這一份——先出現的那份可能已經被使用者
// 互動過（展開/收合、輸入內容……），整個換掉反而會讓正在用的東西重置。
// 純函式邏輯在 canvas-author-node-hoist.ts，這裡只負責接 DOM 與排程。
function runFixedAuthorNodeHoist() {
  if (!authorAssetRuntime || !authorFixedNodeHoistLayer) return;
  const container = authorAssetRuntime.containerFor(authorFixedNodeHoistLayer);
  const chatEl = document.querySelector('#chat');
  if (!container || !chatEl) return;
  try {
    hoistFixedAuthorNodes(chatEl, container, (el) => getComputedStyle(el));
  } catch (e) {
    // 單次搬家失敗不能拖垮對話——下一次訊息更新還會再跑一次。
  }
}

// 跟 observeAuthorColumn 一樣的理由：訊息串不是掛載當下量一次就結束，串流回覆
// 期間會持續改動 DOM。MutationObserver 一次串流可能觸發幾十次 mutation，
// 用 requestAnimationFrame 收斂成一輪只搬一次，不逐字重跑。
function observeFixedAuthorNodes() {
  if (typeof MutationObserver !== 'function') return;
  const chatEl = document.querySelector('#chat');
  if (!chatEl) return;
  authorFixedNodeObserver = new MutationObserver(function () {
    if (authorFixedNodeHoistScheduled) return;
    authorFixedNodeHoistScheduled = true;
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame
      : function (fn) { setTimeout(fn, 16); };
    schedule(function () {
      authorFixedNodeHoistScheduled = false;
      runFixedAuthorNodeHoist();
    });
  });
  authorFixedNodeObserver.observe(chatEl, { childList: true, subtree: true });
}

function setAuthorAssetPageVisible(visible) {
  try { if (authorAssetRuntime) authorAssetRuntime.setPageVisible(visible); } catch (e) { /* 不得影響頁面切換 */ }
}

function disposeAuthorAsset() {
  disposeCardTheme()
  applyImmersiveMode(false);
  disposeComposerOverhang();
  window.removeEventListener('resize', measureAuthorColumn);
  if (authorColumnObserver) {
    try { authorColumnObserver.disconnect(); } catch (e) { /* 收尾不得拋錯 */ }
    authorColumnObserver = null;
  }
  if (authorFixedNodeObserver) {
    try { authorFixedNodeObserver.disconnect(); } catch (e) { /* 收尾不得拋錯 */ }
    authorFixedNodeObserver = null;
  }
  authorFixedNodeHoistLayer = null;
  authorFixedNodeHoistScheduled = false;
  try { if (authorAssetRuntime) authorAssetRuntime.dispose(); } catch (e) { /* 收尾不得拋錯 */ }
  authorAssetRuntime = null;
  lunaIntent = null;
  if (typeof window !== 'undefined' && window.luna) { try { delete window.luna; } catch (e) { window.luna = undefined; } }
  setActiveAuthorAsset(null);
}

const highlightText = (content, type, cacheKey) => {
  if (!content) return '';

  // streaming render cache 短路 (issue #5 · O(N²) 解法 · mirror mobile chat.vue)
  // 細節見 rich-text-renderer.js 的 stream cache 區塊註解
  if (cacheKey && !isHeavyHtml(content)) {
    const boundary = findStableBoundary(content, activeAuthorAsset.value.crossLine);
    let cache = getStreamCacheEntry(cacheKey);
    if (!cache || boundary < cache.boundary || cache.boundary > content.length) {
      cache = { boundary: 0, html: '' };
    }
    const WRAP_RE = /^<div class="rich-md">([\s\S]*)<\/div>$/;
    const stripWrap = (h) => {
      if (!h) return '';
      const m = WRAP_RE.exec(h);
      return m ? m[1] : h;
    };
    const concat = (a, b) => !a ? (b || '') : !b ? a : a + '\n' + b;
    if (boundary > cache.boundary) {
      const newPrefix = content.substring(cache.boundary, boundary);
      const newPrefixHtml = stripWrap(highlightText(newPrefix, type));
      cache = { boundary, html: concat(cache.html, newPrefixHtml) };
      setStreamCacheEntry(cacheKey, cache.boundary, cache.html);
    }
    let combined;
    if (cache.boundary >= content.length) {
      combined = cache.html;
    } else {
      const tail = content.substring(cache.boundary);
      const tailHtml = stripWrap(highlightText(tail, type));
      combined = concat(cache.html, tailHtml);
    }
    return `<div class="rich-md">${combined}</div>`;
  }

  // 过滤开头和结尾的双引号
  let processedContent = content.replace(/^"(.*)"$/, '$1');

  // 顯示層替換：套在這裡而不是函式入口，是因為上面的快取分支本身只負責切段並
  // 遞迴（遞迴呼叫不帶 cacheKey，會落到這條路徑）。於是規則自然跟著快取的增量
  // 節奏走：前綴穩定時套一次就進快取，之後只有短短的尾段每次重算。
  // 邊界永遠落在空行之後，而不跨行的規則不可能跨越它，所以
  // 「切開各自套」與「整段套」結果相同。會跨行的規則已在上面放棄快取。
  if (activeAuthorAsset.value.rules.length) {
    processedContent = applyTavernRules(processedContent, activeAuthorAsset.value.rules, authorRuleOptions()).html;
    // 酒館來源的卡在原平台是有沙盒的（它的 <style> 會被加訊息層前綴），
    // 所以它寫裸選擇器是安全的。這裡沒有沙盒，得替它補上那層前綴，
    // 否則同一張卡搬過來會把整頁弄壞。MMD 來源不加——那邊的作者就是靠
    // 無前綴的 <style> 換掉整個頁面的背景與輸入框。
    processedContent = scopeCardHtml(processedContent, cardFormat.value);
  }

  // 非標準名字的標籤（<思维链>、<status>…）拿掉標籤、留內文；思考類標籤已在渲染前
  // 折進思考過程框（thinking-content.ts）。一定要排在卡片規則之後——<AC_UI>、
  // <功能按钮> 這些觸發標籤就是規則要吃的東西。不看來源：對誰都安全。
  processedContent = stripUnknownTags(processedContent);

  // 富文字渲染：重 HTML（角色卡類）維持舊路徑；其餘一律先跑 MD
  // → chat bubble 同時支援純文字 / Markdown / 輕量 HTML 混合
  //
  // 工單 #65（回歸 #24）：AI 常把整卡包在單一 ```html 圍欄輸出，先解包
  // 再判斷 heavy / 再渲染，heavy 判定與實際渲染吃同一份解包後內容，
  // 避免字面 ``` 標記殘留在卡片渲染輸出的上下（#24 當時只修了
  // rich-text-renderer.js 的 renderRichText()，這裡是 chat.vue 自己
  // 重複實作的分支，未同步）。
  // 此邏輯與 rich-text-renderer.js renderRichText() 存在重複，改動須同步。
  processedContent = unwrapSingleHtmlFence(processedContent);
  // heavy 判定要吃「未 stash」的原始內容——下面的隱藏資料 stash 會把 display:none
  // 區塊整段換成 \x05N\x06 佔位符，若判定排在 stash 之後，剛好整則訊息以隱藏資料
  // span 開頭（沒有敘事文字在前）會被誤判成非 heavy，形同繞過了本來要保護的 heavy 分支。
  const heavy = isHeavyHtml(processedContent);

  // ── 隱藏機讀資料 span 保護：先於 markdown / 換行轉換整段 stash ──
  //
  // 根因（2026-09-04 owner 回報「MMD 匯入卡漏渲染 HUD／狀態欄示例」追查得出）：
  // MMD 匯入卡常用 <span style="display:none"> 包一段換行分隔的機讀資料（例
  // <zzhud-data>／<zzroles-data>），卡片自己的腳本事後讀這個 span 的 textContent
  // 去解析欄位，換行本身就是欄位分隔符。這段資料在酒館規則展開時已經是最終字串
  // （$1 捕獲組直接帶著原始換行），不是給人看的散文，不該被下面兩條「換行轉
  // <br>」路徑動到：
  //   1. 非 heavy 訊息（敘事文字在前，例如「終端啟動...」接著才是卡片
  //      HTML）→ 走 markdown-it（開了 breaks:true，單 \n 一律轉 <br>）。
  //   2. heavy 訊息 → 下面的文字節點 regex 對 heavy 分支額外做一次 \n → <br>
  //      （給作者手寫 HTML 用 \n 換行用的，同樣不分青紅皂白）。
  // <br> 元素的 textContent 貢獻是空字串，兩條路徑都會讓卡片腳本讀到的資料
  // 變成「整批欄位黏在一起、沒有分隔字元」，卡片自己的欄位解析器（通常要求
  // 「區段標記後接著換行才是欄位」）就會判定失敗、回傳空白，依賴這份資料渲染
  // 的面板整塊不出現——這正是回報的症狀。
  //
  // 修法：在 heavy 判定「之後」、markdown / sanitize「之前」，把每個帶
  // display:none 的元素整段（含巢狀，例如 zzroles-source 包 zzroles-data）
  // stash 成不透明佔位符，跟下面既有的 style/script/code/pre stash 用同一套
  // \x05N\x06 記號、同一個陣列，一路撐到最後（含 heavy 分支的文字節點換行
  // 轉換）才一起還原，原樣一個字元都不改。
  //
  // 這不是特定卡片的補丁：任何卡只要用「display:none 隱藏 span + 換行分隔
  // 鍵值」這個通用手法回傳機讀資料，都吃得到這個保護。
  const SHIELD_LT = '\x01', SHIELD_GT = '\x02';
  const __rawStash = [];  // 收 raw-text 元素 inner content / comment / 隱藏資料 span 整段
  // HTML void element：規範上沒有結束標籤，掃描器遇到帶 display:none 的這類標籤
  // 不能去找配對的 </tagName>（永遠找不到）。
  const VOID_TAG_NAMES = new Set(['img', 'br', 'hr', 'input', 'source', 'track', 'wbr', 'area', 'base', 'col', 'embed', 'link', 'meta']);
  processedContent = ((html) => {
    let out = '';
    let i = 0;
    const n = html.length;
    while (i < n) {
      if (html.charAt(i) !== '<') { out += html.charAt(i); i++; continue; }
      const tagStart = i;
      const openM = /^<\s*([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(html.slice(i));
      if (!openM || openM[0].endsWith('/>')) { out += html.charAt(i); i++; continue; }
      const tagName = openM[1];
      const attrs = openM[2];
      if (!/display\s*:\s*none/i.test(attrs)) { out += html.charAt(i); i++; continue; }
      // void element（img/br/hr/...）永遠沒有配對的結束標籤。之前在這裡沒有排除
      // 它們，導致觸發用的裸 <img src="x" style="display:none">（沒包在 span 裡的
      // 卡，跟 zzroles/zzhud 的寫法不同）會讓下面的配對掃描找不到 </img>、
      // depth 永遠不歸零，於是把「這個 img 之後、訊息剩下的全部內容」都當成隱藏
      // 資料整段 stash 掉——後面的 markdown / 斜體裝飾從此看不到那段內容。
      // 修法：void element 本身不需要保護內容（它沒有子內容），直接當一般字元
      // 往下掃，不進入配對搜尋。
      if (VOID_TAG_NAMES.has(tagName.toLowerCase())) { out += html.charAt(i); i++; continue; }
      // 找同名 tag 的配平結束位置（處理巢狀，例如 zzroles-source 包 zzroles-data）
      const openTagLen = openM[0].length;
      const tagRe = new RegExp('<\\s*(/?)\\s*' + tagName + '(?:[\\s/>]|$)', 'gi');
      tagRe.lastIndex = tagStart + openTagLen;
      let depth = 1;
      let endPos = -1;
      let m;
      while ((m = tagRe.exec(html)) !== null) {
        if (m[1] === '/') {
          depth--;
          if (depth === 0) {
            const closeEnd = html.indexOf('>', m.index);
            endPos = closeEnd === -1 ? n : closeEnd + 1;
            break;
          }
        } else {
          depth++;
        }
      }
      // 找不到配對的結束標籤（格式異常 / 串流中途截斷）：放棄整段 stash，
      // 逐字元往下掃，不要把找不到結束點當成「吞到字串結尾」。
      if (endPos === -1) { out += html.charAt(i); i++; continue; }
      __rawStash.push(html.substring(tagStart, endPos));
      out += '\x05' + (__rawStash.length - 1) + '\x06';
      i = endPos;
    }
    return out;
  })(processedContent);

  /*
     重 HTML 也過 markdown-it。

     先前重 HTML（訊息以區塊 tag 開頭）整段跳過 markdown，只 sanitize——於是卡片
     HTML 前後、空行隔開的 `---`、`**粗體**`、`# 標題` 全部原樣印出來。MMD 的管線是
     「正則→整段進 Vditor（CommonMark）→淨化」：HTML 區塊之間空一行之後 Markdown 照常
     解析，區塊裡面不解析（tavern-mmd 平台契約 §8／§13，2026-08-28 實機）。markdown-it
     開 html:true 走的是同一套 CommonMark HTML block 規則，所以重 HTML 過它之後得到的
     就是 MMD 那個結果；隱藏資料 span、<style>／<script>／<code>／<pre> 在上面已經 stash
     成佔位符，markdown-it 看不到它們。owner 2026-09-04：「它實際上是能渲染 Markdown 的，
     我們現在還不行」。
  */
  try {
    const _md = getMarkdownIt();
    processedContent = renderTaskLists(_md.render(dedentHtmlBlockLines(processedContent))).trim();
  } catch (e) {
    // MD parse 失敗 fallback：原樣保留
  }
  if (heavy) {
    // 重 HTML：sanitize 危險 tag
    processedContent = sanitizeHtml(processedContent);
  }

  // ── HTML pre-pass：屏蔽 / stash 不該被 text-node regex 處理的內容 ──
  //
  // 為什麼需要：下面 .replace(/>([^<]*)</g, ...) 假設「`>` 是 tag 結束、
  // `<` 是 tag 開始」，但 author HTML 卡常有兩類 corner case：
  //
  //   1. attribute value 含 < >：inline event handler 的 arrow function
  //      (oninput 內 arrow / JS 比較 if(a<5))
  //   2. raw-text 元素內容：style / script / code / pre 四種 tag 的 inner content
  //      內含 CSS / JS / 代碼，常有 () 會被 italic regex 直接打中
  //
  // 解法：pre-pass 掃一次，分兩種處理：
  //   - attribute value 內的 `<` `>` → 暫換成 `\x01` `\x02`（控制字元），
  //     避免 text-node regex 誤判 tag 邊界
  //   - raw-text 元素內容 / HTML comment → 整段 stash 進陣列，原位放 `\x05N\x06`
  //     佔位符（N 是 stash index），text regex 跑完再從 stash 還原
  //
  // 維持 mobile/desktop 邏輯一致 — 兩邊用同一份 shield/stash 規則。
  // SHIELD_LT/SHIELD_GT/__rawStash 沿用上面隱藏資料 stash 那組宣告與同一個陣列，
  // 佔位符記號共用，才能在最後一次 restore（下面 result.replace(/\x05.../)）一次還原。
  processedContent = ((html) => {
    let out = '';
    let i = 0;
    const n = html.length;
    while (i < n) {
      const c = html.charAt(i);
      if (c !== '<') { out += c; i++; continue; }
      // <!-- comment --> 整段 stash（避免 comment 內 `(` `)` `*` 等被 italic regex 動到）
      if (html.substr(i, 4) === '<!--') {
        const endC = html.indexOf('-->', i + 4);
        const stopC = endC === -1 ? n : endC + 3;
        __rawStash.push(html.substring(i, stopC));
        out += '\x05' + (__rawStash.length - 1) + '\x06';
        i = stopC;
        continue;
      }
      // 開始解析一個 tag：找到結束的 `>`，attribute value 內的 `<` `>` 屏蔽成控制字元
      const tagStart = i;
      out += '<'; i++;
      let quote = null;
      while (i < n) {
        const cc = html.charAt(i);
        if (quote) {
          if (cc === '<') out += SHIELD_LT;
          else if (cc === '>') out += SHIELD_GT;
          else out += cc;
          if (cc === quote) quote = null;
          i++;
        } else if (cc === '"' || cc === "'") {
          quote = cc; out += cc; i++;
        } else if (cc === '>') {
          out += '>'; i++; break;
        } else {
          out += cc; i++;
        }
      }
      // 若這個 tag 是 raw-text element（style/script/code/pre），整段 inner 內容
      // stash 進陣列 — 只 shield `<` `>` 不夠（CSS / JS 常無 `<` `>`，但有 `(` `)`
      // 會被 italic regex 打中）
      const tagStr = html.substring(tagStart, i);
      const nameM = /^<\s*([a-zA-Z]+)/.exec(tagStr);
      if (nameM && !tagStr.endsWith('/>')) {
        const lname = nameM[1].toLowerCase();
        if (lname === 'style' || lname === 'script' || lname === 'code' || lname === 'pre') {
          const closeRe = new RegExp('</' + lname + '(\\s[^>]*)?>', 'i');
          const rest = html.substring(i);
          const cm = closeRe.exec(rest);
          const rawEnd = cm ? i + cm.index : n;
          __rawStash.push(html.substring(i, rawEnd));
          out += '\x05' + (__rawStash.length - 1) + '\x06';
          i = rawEnd;
        }
      }
    }
    return out;
  })(processedContent);

  // 注意 regex 用 `[<]` 而非 `<`，避開 Vue 3 SFC parser 對源碼中 `</` 的 end-tag 誤判
  // （regex 語意等價 — `[<]` 是 char class 只包含 `<`，跟單純的 `<` 一樣）
  let result = processedContent.replace(/>([^<]*)[<]/g, (match, textContent, offset) => {
    if (!textContent.trim()) return match;

    // 只有 heavy HTML 路徑才做 \n → <br> 轉換（作者手寫 HTML 用 \n 換行；MMD 那邊是
    // .content{white-space:pre-line} 在做同一件事）。
    // 重 HTML 現在也過 markdown-it 了，區塊之間的段落換行 markdown-it 已經處理成 <br>，
    // 它自己排版用的換行（<br>\n、text\n<ul>）不能再轉一次：文字節點頭尾緊貼區塊 tag 的
    // 換行剝掉，只有緊貼行內 tag 的才保留——那是作者在 <span> 之間自己排的行。
    if (heavy) {
      const INLINE_TAGS = 'span|b|i|em|strong|u|s|sub|sup|font|code|small|mark|cite|q|abbr|a';
      const before = processedContent.substring(Math.max(0, offset - 60), offset + 1);
      const after = processedContent.substring(offset + match.length - 1, offset + match.length + 60);
      const afterInlineClose = new RegExp('<\\/(' + INLINE_TAGS + ')\\s*>$', 'i').test(before);
      const beforeInlineOpen = new RegExp('^<(' + INLINE_TAGS + ')\\b', 'i').test(after);
      textContent = textContent.replace(/\\n/g, '\n');
      if (!afterInlineClose) {
        textContent = textContent.replace(/^\n+/, '');
      }
      if (!beforeInlineOpen) {
        textContent = textContent.replace(/\n+$/, '');
      }
      textContent = textContent.replace(/\n/g, '<br>');
    }

    // MMD 的對白高亮：引號裡的話包成 <font color>。這是 MMD 平台自己做的事，不是卡片
    // 的規則——作者的美化 CSS 直接對 `.content font[color*="#ff"]`／`font[color="#DC8333"]`
    // 寫樣式（#DC8333 是 MMD 的預設對白色）。少了這層，作者做好的對白樣式在我們這
    // 裡整個不見（owner 2026-09-06：「引號沒生效」）。
    // 必須在括號斜體之前做：此刻 textContent 還是純文字節點；先做斜體再做對白，
    // 斜體塞進來的 <span style="…"> 屬性值會被當成引號包掉，畫面上冒出
    // `"color: #C4B4A3;…">` 這串字（owner 2026-09-06 截圖）。
    const dialogued = wrapDialogue(textContent);

    // 「遊戲對白裝飾」：(text)/（text）/*text*/_text_ 轉全形括號斜體
    // 角色扮演心理活動描述的視覺強化 — heavy HTML 與 MD 路徑都要套。
    // attribute value 的 `<` `>` 已被 pre-pass 屏蔽成 \x01/\x02，
    // raw-text 元素內容已被 stash 成 \x05N\x06 佔位符 — 這個 regex
    // 不會誤判到那些位置，所以這裡無需額外 skip。上一步包進來的 <font> 標籤裡
    // 沒有這些分隔符，不會被打到。
    const highlightedText = dialogued.replace(/\$(.*?)\$|（(.*?)）|\((.*?)\)|\*(.*?)\*|_(.*?)_/g, (subMatch, p1, p2, p3, p4) => {
      const replacementText = p1 || p2 || p3 || p4 || '';
      if (replacementText) {
        const hasBrackets =
            (replacementText.startsWith('(') && replacementText.endsWith(')')) ||
            (replacementText.startsWith('（') && replacementText.endsWith('）'));

        let spanOpen = '';
        if (type == 0) {
          spanOpen = '<span style="color: #C4B4A3;font-style: italic;font-weight: 400;">';
        } else {
          spanOpen = '<span style="color: #665b65;font-style: italic;font-weight: 400;">';
        }
        const spanClose = '</span>';

        return hasBrackets
            ? `${spanOpen}${replacementText}${spanClose}`
            : `${spanOpen}（${replacementText}）${spanClose}`;
      }
      return '';
    });

    return `>${highlightedText}<`;
  });

  // ── 顯示字形轉換：排在卡片正則與 markdown 之後、stash 還原之前 ──
  // 此刻機讀區塊還是 \x05N\x06 佔位符，轉換碰不到它們；屬性與 class 也不碰。
  result = convertVisibleHtml(result, displayScript);

  // ── 還原 pre-pass 屏蔽 / stash 的內容 ──
  // 順序：先還原 stash 佔位符（內容可能含 `<` `>`），再還原 attribute 內的 \x01/\x02
  result = result.replace(/\x05(\d+)\x06/g, (m, idx) => __rawStash[parseInt(idx, 10)]);
  result = result.replace(/\x01/g, '<').replace(/\x02/g, '>');

  // MD 路徑包一層 .rich-md wrapper，讓 markdown 美化 CSS 只作用於 MD 輸出
  // heavy HTML（作者手寫卡片）保留原樣，不被 markdown 樣式污染
  return heavy ? result : `<div class="rich-md">${result}</div>`;
};

/**
 * 从消息中获取所有 AI 生成的图片 URL
 * 优先从 aiImageUrls 字段读取，向后兼容旧的 [AI_IMAGE:url] 格式
 */
const getAiImageUrls = (item) => {
  if (!item) return []

  // 优先从新的 aiImageUrls 字段读取
  if (item.aiImageUrls) {
    try {
      const urls = JSON.parse(item.aiImageUrls)
      if (Array.isArray(urls) && urls.length > 0) {
        return urls
      }
    } catch (e) {
      console.error('[getAiImageUrls] 解析 aiImageUrls 失敗:', e)
    }
  }

  // 向后兼容：从 content 中解析旧格式
  if (item.content) {
    const matches = item.content.match(/\[AI_IMAGE:([^\]]+)\]/g)
    if (matches) {
      return matches.map(m => m.replace(/\[AI_IMAGE:([^\]]+)\]/, '$1'))
    }
  }

  return []
}

// Open Canvas 只認作者資產（規則 + 掛載層）。平台主題引擎不在這條路由上。
async function loadRoleTheme(_role: any) {}

/**
 * 注入組件庫 CSS（優先級低於主題 CSS，按序注入）
 */
function injectComponentLibCss(componentLibs) {
  // 清理舊的組件庫樣式
  document.querySelectorAll('style[id^="hcx-lib-"]').forEach(el => el.remove())
  if (!componentLibs || componentLibs.length === 0) return
  componentLibs.forEach(lib => {
    if (!lib.css) return
    const styleEl = document.createElement('style')
    styleEl.id = `hcx-lib-${lib.libId}`
    styleEl.textContent = lib.css
    document.head.appendChild(styleEl)
  })
  console.log('組件庫 CSS 已注入，數量:', componentLibs.length)
}

/**
 * V2 主題 CSS Variables 注入
 * 將主題的 cssOverrides（存於 style 欄位）注入到頁面 <style> 標籤中
 */
function injectThemeCss(theme) {
  if (!theme || !theme.style) return
  const styleId = `hc-theme-${theme.themeId}`
  // 移除舊的主題樣式
  const existing = document.getElementById(styleId)
  if (existing) existing.remove()
  // 注入新的主題樣式
  const styleEl = document.createElement('style')
  styleEl.id = styleId
  styleEl.textContent = theme.style
  document.head.appendChild(styleEl)
}

// V2：統一走 renderMarkdown，不再有主題分叉邏輯
/*
  渲染結果要記住。

  messageProps 是模板裡每一列都會呼叫的函式：串流期間每個 chunk 都會讓整份清單
  重新渲染，於是幾百則早就完成的訊息每秒被重跑幾十次規則引擎與 markdown——
  而 HTML 那條路每跑一次還會把訊息裡的 <script>／<style> 再執行一遍（見
  renderMarkdown）。作者卡片的面板腳本就這樣被反覆重新初始化，畫面一閃一閃、
  內容跳動（owner 2026-09-04 回報）。

  記憶鍵只比對字串的身分與旗標，不算雜湊：完成的訊息 content 不會被重新指派，
  === 是 O(1)；串流中的那一則每次都不同，走下面的節流。
*/
const renderMemo = new WeakMap()
const STREAM_RENDER_INTERVAL_MS = 150
const streamRenderTick = ref(0)
let streamRenderTimer = 0

function renderMemoKey(item) {
  return {
    content: item.content,
    thinking: item.thinkingContent,
    finish: !!item.chatFinish,
    summary: !!item.isSummary,
    version: activeAuthorAsset.value.version,
    script: displayScript.value,
  }
}

function renderMemoHit(entry, key) {
  return !!entry
    && entry.key.content === key.content
    && entry.key.thinking === key.thinking
    && entry.key.finish === key.finish
    && entry.key.summary === key.summary
    && entry.key.version === key.version
    && entry.key.script === key.script
}

// 卡片自己的規則若提到某個思考類標籤（<思考>、<thought>…），那段就讓給卡片畫，不折進
// 思考過程框。粗略比對：規則的 find 裡出現 `<標籤名` 就算。
function cardHandlesTag(tagName) {
  const needle = '<' + String(tagName).toLowerCase();
  return activeAuthorAsset.value.rules.some((r) => r && r.enabled !== false && String(r.find || '').toLowerCase().includes(needle));
}

const renderMessage = (item) => {
  if (!item) return ''
  const split = splitThinkingContent(item.content || '', { keep: cardHandlesTag })
  if (split.hasThinking) {
    item.thinkingContent = item.thinkingContent || split.thinkingContent
    item.content = split.visibleContent
  }
  const key = renderMemoKey(item)
  const entry = renderMemo.get(item)
  if (renderMemoHit(entry, key)) return entry.html

  // 串流中的那一則：最多每 150ms 換一次畫面。上游每秒送幾十個 chunk，每個都整則
  // 重建 innerHTML 的話，作者的美化腳本剛套上就被拆掉。畫面看起來仍是連續的，
  // 只是一次多幾個字。
  if (!item.chatFinish && !item.chatLoading && entry && entry.streamAt) {
    // 讀一下 tick 讓這一列在下一次節流到期時重新渲染
    void streamRenderTick.value
    const elapsed = Date.now() - entry.streamAt
    if (elapsed < STREAM_RENDER_INTERVAL_MS) {
      if (!streamRenderTimer) {
        streamRenderTimer = setTimeout(() => {
          streamRenderTimer = 0
          streamRenderTick.value++
        }, STREAM_RENDER_INTERVAL_MS - elapsed)
      }
      return entry.html
    }
  }

  const html = renderMarkdown(item)
  renderMemo.set(item, { key, html, streamAt: item.chatFinish ? 0 : Date.now() })
  return html
}

function togglePrepTrail(item: any) {
  if (!item) return
  item.prepTrailCollapsed = item.prepTrailCollapsed === false
}

function toggleThinking(item: any) {
  if (!item) return
  item.thinkingCollapsed = item.thinkingCollapsed === false
}

function formatThinkingSize(value: string) {
  const length = String(value || '').trim().length
  if (length <= 0) return ''
  return `${length} chars`
}

/*
  訊息裡的 <script>／<style> 要真的跑起來。

  v-html 塞進去的 <script> 瀏覽器不執行，所以要把它們抄一份掛到 head。以前只在
  「原文本身就是 HTML」的訊息上做這件事——可是作者的腳本多半是**正則套上去之後**
  才出現的（開場白是一句話，規則把它換成一整塊帶 <script> 的面板），原文一看是純
  文字就被跳過，面板畫出來了、按鈕卻找不到 handler（owner 2026-09-06：開局事件
  點了沒反應，Console 是 handleHuChoice is not defined）。現在看的是套完規則的結果。

  只在訊息完成後跑，而且同一則同一份結果只跑一次：規則版本一換（作者在預覽裡改檔）
  結果就變，那時候該重跑；單純重畫不該重跑，否則同一段腳本會塞進 head 幾十次。
*/
const activatedMessageScripts = new WeakMap<object, string>();
function activateMessageScripts(item: any, html: string) {
  if (!item || !item.chatFinish) return;
  if (!/<(script|style)[\s>]/i.test(html || '')) return;
  if (activatedMessageScripts.get(item) === html) return;
  activatedMessageScripts.set(item, html);
  nextTick(() => {
    const messageEl = document.querySelector(`#msg-${item.id} .content`);
    if (!messageEl) return;
    const scriptTags = messageEl.innerHTML.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
    if (scriptTags) {
      scriptTags.forEach((scriptTag) => {
        const scriptContent = scriptTag.replace(/<script[^>]*>|<\/script>/gi, '');
        const newScript = document.createElement('script');
        newScript.textContent = scriptContent;
        document.head.appendChild(newScript);
      });
    }
    // <style> 連同屬性一起搬：作者的主題切換靠 `style[id^="…"]` 找到自己的樣式塊再
    // 開關 disabled，id 掉了那顆開關就點不動。同 id 再來一次就是換掉，不疊第二份。
    const styleTags = messageEl.innerHTML.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    if (styleTags) {
      styleTags.forEach((styleTag) => {
        const attrs = (styleTag.match(/^<style([^>]*)>/i) || ['', ''])[1];
        const styleContent = styleTag.replace(/<style[^>]*>|<\/style>/gi, '');
        const newStyle = document.createElement('style');
        const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
        if (idMatch) {
          newStyle.id = idMatch[1];
          const existing = document.head.querySelector(`style[id="${idMatch[1].replace(/"/g, '')}"]`);
          if (existing) existing.remove();
        }
        newStyle.textContent = styleContent;
        document.head.appendChild(newStyle);
      });
    }
    if (needsKaiFallback(messageEl.innerHTML)) ensureKaiFallback();
  });
}

// 渲染Markdown内容
const renderMarkdown = (item) => {
  // V1.1: 只信呼叫端傳入的 isSummary 旗標；拿掉 isSummaryFormat(item.content) 內容嗅探
  // 後備判斷——裸字串比對 <summary>/<analysis> 會把一般回覆裡含 <details><summary> 摺疊塊
  // 的內容誤判成內部總結，導致整段 Markdown 不解析、摺疊塊標題被剝到只剩瀏覽器預設值。
  // isSummary 由呼叫端明確帶入（歷史列映射 / 即時總結兩條路徑都有），不需要這段嗅探補資料缺口。
  if (item.isSummary) {
    return renderSummary(item.content);
  }

  // 预处理内容：移除 AI_IMAGE 标记（由模板单独渲染）
  let processedContent = item.content || '';
  processedContent = processedContent.replace(/\[AI_IMAGE:[^\]]+\]/g, '');

  // 检测内容是否已经是HTML格式
  const isHTML = /<[^>]*>/g.test(processedContent);

  // HTML 與純文字走同一條：規則套完才知道有沒有 <script>／<style>，所以腳本啟動
  // 看的是套完規則的結果，不是原文（見 activateMessageScripts）。
  const cacheKey = (!item.chatFinish && item.id != null) ? (item.id + ':' + item.type + ':' + activeAuthorAsset.value.version) : null;
  const cleanContent = highlightText(processedContent, item.type, cacheKey);
  activateMessageScripts(item, cleanContent);
  return cleanContent;

};

function onConfirmStartNewConversation() {
  saveAndStartNew();
  onCreateClose();
}

function onCreateClose() {
  createTipShow.value = false
}

// 走得掉：直接開卡片網址進來的人沒有上一頁，navigateBack 會靜默什麼都不做，
// 那就是死路。沒有上一頁就直接重開卡片入口。
function goBackToEntry() {
  const stack = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (stack && stack.length > 1) {
    uni.navigateBack();
    return;
  }
  uni.reLaunch({ url: '/pages/play/entry' });
}

function openModelSelect() {
  // 純預覽不會呼叫模型。節點留著（作者的卡對它寫外觀），按下去講清楚為什麼沒東西可選。
  if (previewOnly.value) {
    uni.showToast({ title: t('openChat.preview.noModel'), icon: 'none' })
    return
  }
  panel.value = openSheet(panel.value, 'model')
}

// ==== SystemMessage 組件（finishReason 視覺化） ====
// Port 自 mobile src/pages/canvas/canvas.vue 的 getSystemMsgKind/Label/Sub/Cta，
// 取代舊的 getTruncationHint（純文字 ⚠️ 警告，沒有 CTA，也漏了
// rate_limit/server_error/network_error 三個 kind）。kind 映射跟 mobile
// 保持 1:1（含 user_stop → 'stopped'）；CTA 仍由最新 exact terminal row
// fence 決定，舊訊息不會重新取得 Continue/Retry 操作權。
function getSystemMsgKind(finishReason) {
  const map = {
    'content_filter': 'filtered',
    'content_filter_input': 'filtered',
    'refusal':        'filtered',
    'length':         'length-cap',
    'context_overflow': 'length-cap',
    'interrupted':    'length-cap',
    'incomplete':     'length-cap',
    'reasoning_only': 'model-error',
    'reasoning_only_timeout': 'model-error',
    'empty_response': 'model-error',
    'rewrite_below_threshold': 'model-error',
    'error':          'model-error',
    'pause_turn':     'stopped',
    'user_stop':      'stopped',
    // agent 中斷但進度已保留:這是「還沒跑完」,不是失敗。
    //
    // 正常情況下這一列會由 agentInterrupted 驅動的中斷卡承載,系統訊息那條被
    // 擋掉;這裡是退化路徑(軌跡讀不到時)。少了它會掉到底下的預設值,畫面上
    // 出現一句「模型連線失敗」——把使用者自己按的停止說成連線故障
    // (owner 2026-08-08 在 desktop 拍到)。
    'agent_progress_preserved': 'stopped',
    // 刻意不是 model-error：這是「還沒確認」的狀態,不是已知的失敗,用告警視覺
    // 會讓人以為東西壞了。但也不能沿用 'stopped'——notice tone 是
    // border-radius:9999px 的單行藥丸,只裝得下「已停止生成」那種短標籤;
    // 本卡有說明文字與 CTA,套藥丸會被撐成一顆球並把按鈕擠到文字上
    // (2026-08-01 UI 驗收實際拍到)。故自成一個中性但走卡片版面的 kind。
    'outcome_unconfirmed': 'outcome-unconfirmed',
    'rate_limit':     'rate-limit',
    'service_unavailable': 'server-error',
    'server_error':   'server-error',
    'network_error':  'network-error',
    'history_load_error': 'network-error',
    'insufficient_credits': 'quota',
    'quota_exhausted': 'quota',
    'compact_retryable': 'compact-retryable',
    'conversation_stale': 'model-error',
    'operation_in_progress': 'model-error',
    'mutation_in_progress': 'model-error',
    'rewrite_target_not_latest': 'model-error',
    'rewrite_target_invalid': 'model-error',
  };
  return (finishReason && finishReason !== 'stop') ? (map[finishReason] || 'model-error') : '';
}
function getSystemMsgLabel(finishReason) {
  const map = {
    'content_filter':   t('systemMsg.filtered')     || 'AI 已終止本次回覆',
    'content_filter_input': t('systemMsg.filtered') || 'AI 已終止本次回覆',
    'refusal':          t('systemMsg.filtered')     || 'AI 已終止本次回覆',
    'length':           t('systemMsg.lengthCap')    || '達到單次生成上限',
    'context_overflow': t('systemMsg.lengthCap')    || '達到單次生成上限',
    'interrupted':      t('chat.turnInterrupted')   || '回覆已中斷，已保留目前內容',
    'incomplete':       t('chat.turnInterrupted')   || '回覆已中斷，已保留目前內容',
    'reasoning_only':   t('chat.noFinalAnswer')     || '模型完成了思考，但沒有產生最終回覆',
    'reasoning_only_timeout': t('chat.noFinalAnswerTimeout') || '模型回應太慢，這則被中斷了',
    'empty_response':   t('error.emptyResponse')    || '模型沒有產生回覆',
    'rewrite_below_threshold': t('chat.rewriteBelowThreshold') || '重新生成沒有產生足夠內容，原回覆已保留',
    'error':            t('systemMsg.modelError')   || 'AI 模型連線失敗',
    'pause_turn':       t('systemMsg.stopped')      || '已停止生成',
    'user_stop':        t('systemMsg.stopped')      || '已停止生成',
    'agent_progress_preserved': t('multiPass.interruptedNotice') || '這一輪還沒跑完，進度已經留著',
    'outcome_unconfirmed': t('chat.operationStatusUnavailable') || '結果還在確認中，不用重送——完成後會自動更新。',
    'rate_limit':       t('systemMsg.rateLimit')    || '請求過於頻繁',
    // 上游把「這個模型現在用不了」分類成 service_unavailable，但終局錯誤這張表
    // 先前沒有這個鍵,於是落到通用的「AI 模型連線失敗」——使用者看不出是模型的問題,
    // 也就不知道換一個模型就能繼續。重試進度那條路早就有這句文案,只是沒接到終局。
    'service_unavailable': t('error.serviceUnavailable'),
    'server_error':     t('systemMsg.serverError')  || '伺服器暫時不穩定',
    'network_error':    t('systemMsg.networkError') || '網路連線中斷',
    'history_load_error': t('systemMsg.networkError') || '網路連線中斷',
    'insufficient_credits': t('chat.point_no_tips') || '點數已用完',
    'quota_exhausted':  t('chat.freeQuotaExhaustedTitle') || '免費額度已用完',
    'compact_retryable': t('chat.compactFailed')    || '記錄失敗',
    'conversation_stale': t('error.replyNotGenerated'),
    'operation_in_progress': t('chat.operationPending') || '目前的聊天操作仍在進行中',
    'mutation_in_progress': t('chat.rollbackInProgressNotice') || '上一步操作仍在處理中',
    'rewrite_target_not_latest': t('chat.editLatestAIOnly') || '只能編輯目前最新的 AI 回覆',
    'rewrite_target_invalid': t('chat.rewriteTargetChanged') || '這則回覆已無法編輯',
  };
  return map[finishReason] || (t('systemMsg.modelError') || 'AI 模型連線失敗');
}
function getSystemMsgSub(finishReason) {
  const map = {
    'content_filter':   t('systemMsg.filteredSub')     || '內容觸發了安全規則',
    // content_filter_input：輸入端內容審查拒絕(阿里/Kimi/Grok 等審查簽名分揀，
    // 見內容審查錯誤呈現設計)。
    // 跟既有輸出端 finishReason='content_filter'(Claude 系)共用 filtered 卡視覺，
    // 但副文案給行動指引，且刻意不放重試 CTA(見 getSystemMsgCta 未收錄)。
    'content_filter_input': t('error.contentFilter') || '模型因安全考量未生成本次回覆，可換個說法或切換模型試試',
    'refusal':          t('systemMsg.filteredSub')     || '內容觸發了安全規則',
    'length':           t('systemMsg.lengthCapSub')    || '可從這裡繼續故事',
    'context_overflow': t('systemMsg.lengthCapSub')    || '可從這裡繼續故事',
    'interrupted':      t('chat.turnRetryable')        || '回覆未完成，訊息已保留，可再試一次',
    'incomplete':       t('chat.turnRetryable')        || '回覆未完成，訊息已保留，可再試一次',
    'reasoning_only':   t('chat.retryOrSwitchModel')    || '可重試，或從模型選單切換模型',
    'reasoning_only_timeout': t('chat.retryLaterOrSwitchModel') || '可以換一個模型，或過一陣子再試',
    'empty_response':   t('chat.turnRetryable')         || '本次沒有可用回覆，可再試一次',
    'rewrite_below_threshold': t('chat.turnRetryable')  || '原回覆仍保留，可再試一次',
    'error':            t('systemMsg.modelErrorSub')   || '模型服務暫時無法回應',
    'pause_turn':       t('systemMsg.stoppedSub')      || '你中斷了這次生成',
    'user_stop':        t('systemMsg.stoppedSub')      || '你中斷了這次生成',
    'outcome_unconfirmed': t('chat.operationStatusUnavailableSub') || '不用重送，完成後會自動更新。若已產生回覆，會照原規則計費。',
    // agent 準備沒跑完時,主標只說「進度已經留著」——使用者不知道除了按繼續之外
    // 還能換模型。實測模型整條掛掉時(上游 100% 失敗),他會一直按繼續,而那個模型
    // 不會好。副標把兩條路都講出來,按鈕維持不變。
    //
    // 逐一原因的提示(限流 / 不可用 / 斷線各自不同)要伺服器把分類落盤才做得到,
    // 另案;在那之前這一句對所有情況都成立。
    'agent_progress_preserved': t('multiPass.interruptedNoticeSub'),
    'rate_limit':       t('systemMsg.rateLimitSub')    || '請稍等一會再試',
    'server_error':     t('systemMsg.serverErrorSub')  || '可能過載中，稍候再試',
    'network_error':    t('systemMsg.networkErrorSub') || '請檢查網路後重試',
    'history_load_error': t('systemMsg.networkErrorSub') || '請檢查網路後重試',
    // 這個客戶端不賣點數也沒有每日報到，所以副標只說清楚該去哪處理，不給一顆
    // 按了會落空的鍵（開放契約沒有付費端點，見 docs/open-api-v1.md）。
    'insufficient_credits': t('chat.manageOnLunaTalk'),
    'quota_exhausted':  t('chat.manageOnLunaTalk'),
    'compact_retryable': t('error.compactRetryable')   || '記憶整理未完成，對話已恢復，請再發送一次',
    'rewrite_target_not_latest': t('chat.rewriteTargetChangedSub') || '對話內容已變更，請重新整理後編輯最新一則 AI 回覆',
    'rewrite_target_invalid': t('chat.rewriteTargetChangedSub') || '對話內容已變更，請重新整理後編輯最新一則 AI 回覆',
  };
  return map[finishReason] || '';
}
function getSystemMsgCtaLabel(action: ChatOperationUIAction | 'refresh_history' | '') {
  if (
    action === 'retry'
    || action === 'retry_rewrite'
    || action === 'retry_continue'
    || action === 'rewrite'
  ) return t('chat.retry') || '重試';
  if (action === 'continue') {
    // Agent 暫停中：這顆鍵做的是把那一輪接著跑，不是在回覆後面接著寫。
    if (findResumableAgentOperation(unref(knownOperations))) return t('multiPass.continueAction') || '繼續';
    return t('chat.say_continue') || '繼續';
  }
  if (action === 'switch_model') return t('chat.switchModel') || '切換模型';
  if (action === 'refresh_history') return t('chat.refreshConversation') || '重新整理對話';
  return '';
}

function getSystemMsgCta(finishReason, item, index) {
  return getSystemMsgCtaLabel(
    getSystemMsgCtaAction(finishReason, item, index),
  );
}

function getSystemMsgCtas(item, index) {
  if (item?.operationProjectionCapable !== true) return [];
  return terminalUIActionsFromAllowedActions(item)
    .filter(action => isTerminalActionAllowed(talkList.value, index, action))
    .map(action => ({
      action,
      label: getSystemMsgCtaLabel(action),
    }))
    .filter(entry => !!entry.label);
}
function getSystemMsgCtaAction(finishReason, item, index) {
  if (finishReason === 'history_load_error') return 'refresh_history';
  // 逃生口必須留在 App 內：refresh_history 是重載這段對話,不是叫用戶自己
  // 重新整理瀏覽器——PWA 與原生 App 根本沒有那個動作。
  if (finishReason === 'outcome_unconfirmed') return 'refresh_history';
  if (finishReason === 'rewrite_target_not_latest' || finishReason === 'rewrite_target_invalid') {
    return 'refresh_history';
  }
  let action = '';
  if (item?.operationProjectionCapable === true) {
    // Capable rows render and emit the exact server action. finishReason is
    // presentation copy, never permission to invent or collapse a CTA.
    action = terminalUIActionFromAllowedActions(item);
  } else {
    // Frozen legacy fallback: old history has no allowedActions projection.
    const retry = ['content_filter', 'refusal', 'error', 'reasoning_only', 'reasoning_only_timeout', 'empty_response', 'rewrite_below_threshold', 'rate_limit', 'server_error', 'network_error', 'compact_retryable', 'conversation_stale'];
    const cont = ['length', 'context_overflow', 'interrupted', 'incomplete', 'pause_turn', 'user_stop'];
    action = retry.includes(finishReason) ? 'retry' : (cont.includes(finishReason) ? 'continue' : '');
  }
  if (!action || !isTerminalActionAllowed(talkList.value, index, action)) return '';
  return action;
}

function exactTimelineRowIndex(chatId, expectedType?: number) {
  const expected = String(chatId || '').trim();
  if (!expected) return -1;
  return talkList.value.findIndex(row => (
    row
    && row.operationProjectionOnly !== true
    && (expectedType === undefined || row.type === expectedType)
    && (
      String(row.chatId || '').trim() === expected
      || String(row.id || '').trim() === expected
    )
  ));
}

function firstExactTimelineRowIndex(chatIds, expectedType?: number) {
  for (const chatId of chatIds) {
    const index = exactTimelineRowIndex(chatId, expectedType);
    if (index >= 0) return index;
  }
  return -1;
}

function startRetryGenerationFromAuthoritativeTerminal(item): boolean {
  const target = resolveRetryGenerationAction(talkList.value, item);
  if (!target) return false;
  const { userIndex, terminalIndex } = target;
  const snapshot = createRewriteSnapshot(talkList.value, userIndex, terminalIndex);
  const userBubble = talkList.value[userIndex];
  if (!snapshot || !userBubble) return false;

  content.value = String(userBubble.content || '');
  rewrite.value = true;
  contine.value = false;
  pendingRewriteSnapshot = snapshot;
  rewriteTargetChatId.value = String(userBubble.chatId || userBubble.id || '');
  if (!rewriteTargetChatId.value) return false;
  requestedOperationKindOverride = 'retry_generation';
  send();
  return true;
}

function onSystemMsgCta(action, item, index) {
  if (action === 'refresh_history') {
    teardownStreamForConversationSwitch({ invalidateHistory: true });
    ajax.value.page = 1;
    ajax.value.flag = true;
    getHistoryMsg();
    return;
  }
  if (!isTerminalActionAllowed(talkList.value, index, action)) {
    notifyTimelineMutationBlocked();
    return;
  }
  if (action === 'switch_model') {
    openModelSelect();
    return;
  }
  // Agent 暫停後那一輪還沒收尾：系統氣泡的「繼續」跟輸入區那顆鍵是同一件事。
  if ((action === 'continue' || action === 'retry_continue') && resumeAgentOperation()) {
    return;
  }

  // Old history has no operation lineage. Preserve its frozen positional
  // fallback exactly; capable rows below must resolve a server-provided ID.
  if (item?.operationProjectionCapable !== true) {
    if (action === 'retry') {
      if (retryModeForAI(talkList.value, index) === 'continue') {
        doContinue(item, index);
      } else {
        doReiteration(index);
      }
    } else if (action === 'continue') {
      doContinue(item, index);
    }
    return;
  }

  const operationKind = String(item?.operationKind || item?.serverOperationKind || '')
    .trim()
    .toLowerCase();
  if (operationKind === 'backward') {
    const checkpointIndex = firstExactTimelineRowIndex([
      item?.checkpointChatId,
      item?.targetChatId,
    ]);
    if (checkpointIndex < 0) {
      notifyTimelineMutationBlocked();
      return;
    }
    const checkpoint = talkList.value[checkpointIndex];
    loadConversation(checkpoint?.chatId || checkpoint?.id);
    return;
  }

  if (action === 'continue' || action === 'retry_continue') {
    const continueSourceIndex = firstExactTimelineRowIndex(
      action === 'retry_continue'
        ? [item?.sourceChatId, item?.targetChatId]
        : [
          item?.assistantChatId,
          item?.operationProjectionOnly === true ? '' : (item?.chatId || item?.id),
          item?.sourceChatId,
        ],
      0,
    );
    if (continueSourceIndex < 0) {
      notifyTimelineMutationBlocked();
      return;
    }
    continueFromAuthoritativeTerminal(
      talkList.value[continueSourceIndex],
      index,
      action,
    );
    return;
  }

  if (action === 'retry_rewrite' || action === 'rewrite') {
    const rewriteSourceIndex = firstExactTimelineRowIndex([
      item?.assistantChatId,
      item?.operationProjectionOnly === true ? '' : (item?.chatId || item?.id),
      item?.sourceChatId,
    ], 0);
    const expectedUserIndex = firstExactTimelineRowIndex([
      item?.targetChatId,
      item?.userChatId,
    ], 1);
    if (
      rewriteSourceIndex < 0
      || (expectedUserIndex >= 0 && expectedUserIndex !== rewriteSourceIndex - 1)
    ) {
      notifyTimelineMutationBlocked();
      return;
    }
    doReiteration(rewriteSourceIndex);
    return;
  }

  if (action === 'retry') {
    if (operationKind.includes('continue')) {
      const continueSourceIndex = firstExactTimelineRowIndex([
        item?.sourceChatId,
        item?.targetChatId,
      ], 0);
      if (continueSourceIndex < 0) {
        notifyTimelineMutationBlocked();
        return;
      }
      continueFromAuthoritativeTerminal(
        talkList.value[continueSourceIndex],
        index,
        action,
      );
      return;
    }
    if (operationKind === 'send' || operationKind === 'retry_generation') {
      if (!startRetryGenerationFromAuthoritativeTerminal(item)) {
        notifyTimelineMutationBlocked();
      }
      return;
    }
    const assistantIndex = firstExactTimelineRowIndex([
      item?.assistantChatId,
      item?.operationProjectionOnly === true ? '' : (item?.chatId || item?.id),
    ], 0);
    if (assistantIndex >= 0) {
      doReiteration(assistantIndex);
      return;
    }
    const userIndex = firstExactTimelineRowIndex([
      item?.userChatId,
      item?.targetChatId,
    ], 1);
    if (userIndex >= 0 && userIndex === index - 1) {
      doReiteration(index);
      return;
    }
    notifyTimelineMutationBlocked();
  }
}

function backwardStorageKey(conversation: string): string {
  return `${BACKWARD_LS_PREFIX}${conversation}`;
}

function writePendingBackwardOperation(entry: any): boolean {
  const normalized = normalizeBackwardOperationEntry({
    ...entry,
    version: BACKWARD_OPERATION_ENTRY_VERSION,
  }, entry?.conversationId);
  if (!normalized) return false;
  try {
    localStorage.setItem(backwardStorageKey(normalized.conversationId), JSON.stringify(normalized));
    return true;
  } catch (_) {
    return false;
  }
}

function readPendingBackwardOperation(conversation: string): any {
  if (!conversation) return null;
  const key = backwardStorageKey(conversation);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const normalized = normalizeBackwardOperationEntry(JSON.parse(raw), conversation);
    if (!normalized) localStorage.removeItem(key);
    return normalized;
  } catch (_) {
    try { localStorage.removeItem(key); } catch (_) {}
    return null;
  }
}

function clearPendingBackwardOperation(entry: any) {
  const current = readPendingBackwardOperation(String(entry?.conversationId || ''));
  if (!current || current.operationId !== entry?.operationId) return;
  try { localStorage.removeItem(backwardStorageKey(current.conversationId)); } catch (_) {}
}

function cancelPendingBackwardRetryTimer() {
  if (backwardOperationRetryTimer) clearTimeout(backwardOperationRetryTimer);
  backwardOperationRetryTimer = null;
}

function isPendingBackwardOperationCurrent(entry: any): boolean {
  if (String(unref(conversationId) || '') !== String(entry?.conversationId || '')) return false;
  const current = readPendingBackwardOperation(String(entry?.conversationId || ''));
  return !!current && current.operationId === entry?.operationId;
}

function finishPendingBackwardOperation(entry: any) {
  if (!isPendingBackwardOperationCurrent(entry)) return;
  cancelPendingBackwardRetryTimer();
  backwardOperationRequestKey = '';
  clearPendingBackwardOperation(entry);
  rollbackPending.value = false;
  unref(ajax).flag = true;
  unref(ajax).page = 1;
  teardownStreamForConversationSwitch({ invalidateHistory: true });
  getHistoryMsg();
}

function failPendingBackwardOperation(entry: any, messageKey = 'chat.rollbackFailed') {
  if (!isPendingBackwardOperationCurrent(entry)) return;
  cancelPendingBackwardRetryTimer();
  backwardOperationRequestKey = '';
  clearPendingBackwardOperation(entry);
  rollbackPending.value = false;
  uni.showToast({
    title: t(messageKey) || t('chat.rollbackFailed'),
    icon: 'none',
  });
}

function schedulePendingBackwardOperation(entry: any, legacyFallbackUsed = false): boolean {
  if (!isPendingBackwardOperationCurrent(entry)) return false;
  // I-1（No dead end）：與 backwardOperationRetryDelay 解耦的絕對時間上界。
  // backwardOperationRetryDelay 對任何合法 attempt 永遠回一個延遲值（凍結契約
  // 明文要求），所以單靠它永遠不會耗盡、永遠會再排一次 timer。這裡用 entry
  // 建立時的 createdAt 當基準，與既有 operation-status 輪詢共用同一支純函式
  // 與同一個 5 分鐘上界；拿不到可信基準（缺失、非有限數、指向未來）時純函式
  // 本身回 false，我們就不放手，維持既有重試行為。
  if (isChatOperationVisibleOutcomeExpired({
    localStartedAt: entry.createdAt,
    now: Date.now(),
    agentTurn: resolveAgentTurnForOwnership(),
  })) {
    failPendingBackwardOperation(entry, 'chat.rollbackTimedOut');
    return false;
  }
  const delay = backwardOperationRetryDelay(entry.attempt);
  if (delay == null) {
    // 產品邊界 I-1（SKILL.md「No dead end」）：重試耗盡不得懸置。
    // 交給既有的 failPendingBackwardOperation 收斂——它會取消 timer、清 request
    // key、清 persisted pending entry、把 rollbackPending 收回 false 並提示，
    // 讓使用者能重試，而不是永遠卡在「回溯處理中，請稍等」。
    failPendingBackwardOperation(entry, 'chat.rollbackTimedOut');
    return false;
  }
  if (
    delay === BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS
    && operationStatusSlowNoticeKey !== entry.operationId
  ) {
    operationStatusSlowNoticeKey = entry.operationId;
    // 刻意保留 uni.showToast:劇情回溯不產生 AI 佔位氣泡,沒有 row 可以轉成
    // 系統訊息;改走 announceOutcomeUnconfirmed 只會落到 fallback,卻把 toast
    // 元件從 uni 換成 Ant Design,等於在沒有收益的情況下改了視覺。
    uni.showToast({ title: t('chat.operationStatusUnavailable'), icon: 'none' });
  }
  const nextEntry = {
    ...entry,
    attempt: entry.attempt + 1,
    updatedAt: Date.now(),
  };
  if (!writePendingBackwardOperation(nextEntry)) {
    console.warn('[Backward] 無法更新 persisted retry metadata；保留既有 identity 並慢速對賬');
    cancelPendingBackwardRetryTimer();
    backwardOperationRetryTimer = setTimeout(() => {
      backwardOperationRetryTimer = null;
      postPendingBackwardOperation(entry, legacyFallbackUsed);
    }, BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS);
    return true;
  }
  cancelPendingBackwardRetryTimer();
  backwardOperationRetryTimer = setTimeout(() => {
    backwardOperationRetryTimer = null;
    postPendingBackwardOperation(nextEntry, legacyFallbackUsed);
  }, delay);
  return true;
}

function postPendingBackwardOperation(entry: any, legacyFallbackUsed = false): boolean {
  entry = normalizeBackwardOperationEntry(entry, String(unref(conversationId) || ''));
  if (!entry || !isPendingBackwardOperationCurrent(entry)) return false;
  const requestKey = `${entry.operationId}:${legacyFallbackUsed ? 'legacy' : 'v1'}`;
  if (backwardOperationRequestKey === requestKey) return true;
  backwardOperationRequestKey = requestKey;
  rollbackPending.value = true;
  const data = legacyFallbackUsed
    ? {
      conversationId: entry.conversationId,
      chatId: entry.targetChatId,
    }
    : {
      conversationId: entry.conversationId,
      chatId: entry.targetChatId,
      rollbackMutationCapability: 'v1',
      clientOperationID: entry.operationId,
    };
  _this.http.post(_this.requestUrl.loadConversation, {
    header: { 'content-type': 'application/json' },
    showLoading: false,
    data,
  }).then((res: any) => {
    if (backwardOperationRequestKey === requestKey) backwardOperationRequestKey = '';
    if (!isPendingBackwardOperationCurrent(entry)) return;
    const outcome = classifyBackwardOperationResponse(res.statusCode, res.data || {});
    if (outcome === 'success') {
      finishPendingBackwardOperation(entry);
      return;
    }
    if (outcome === 'pending') {
      schedulePendingBackwardOperation(entry, legacyFallbackUsed);
      return;
    }
    if (outcome === 'retry') {
      schedulePendingBackwardOperation(entry, legacyFallbackUsed);
      return;
    }
    if (outcome === 'legacy_fallback' && !legacyFallbackUsed) {
      postPendingBackwardOperation(entry, true);
      return;
    }
    const errorCode = String(res.data?.errorCode || res.data?.error || '');
    failPendingBackwardOperation(
      entry,
      errorCode === 'mutation_in_progress'
        || errorCode === 'conversation_history_mutation_pending'
        ? 'chat.rollbackPending'
        : 'chat.rollbackFailed',
    );
  }).catch((error: any) => {
    if (backwardOperationRequestKey === requestKey) backwardOperationRequestKey = '';
    if (!isPendingBackwardOperationCurrent(entry)) return;
    console.error('[Backward] operation request failed', error);
    const outcome = classifyBackwardOperationResponse(error?.statusCode, error?.data || {});
    if (outcome === 'legacy_fallback' && !legacyFallbackUsed) {
      postPendingBackwardOperation(entry, true);
      return;
    }
    if (outcome === 'terminal_failure') {
      failPendingBackwardOperation(entry);
      return;
    }
    schedulePendingBackwardOperation(entry, legacyFallbackUsed);
  });
  return true;
}

function resumePendingBackwardOperation(conversation: string): boolean {
  const entry = readPendingBackwardOperation(conversation);
  if (!entry) return false;
  cancelPendingBackwardRetryTimer();
  rollbackPending.value = true;
  return postPendingBackwardOperation(entry, false);
}

// 劇情回溯：走開放 API v1 的 /conversation/backward（server 端已補上）。
// 這個開關保留是因為第三方部署可能接到還沒有這條路徑的舊伺服器；
// 關掉時按鈕會直接說明不可用，不會卡住。
const BACKWARD_AVAILABLE = true;

function loadConversation(chatId) {
  if (!BACKWARD_AVAILABLE) {
    message.warning(t('chat.backwardUnavailable'));
    return;
  }
  if (isTimelineMutationBlocked()) {
    uni.showToast({ title: t('chat.rollbackPending') || 'Rollback is still processing', icon: 'none' });
    return;
  }
  const currentConversationId = String(unref(conversationId) || '');
  const existing = readPendingBackwardOperation(currentConversationId);
  if (existing) {
    rollbackPending.value = true;
    postPendingBackwardOperation(existing, false);
    return;
  }
  const entry = createBackwardOperationEntry({
    operationId: `rollback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    conversationId: currentConversationId,
    targetChatId: chatId,
    now: Date.now(),
  });
  if (!writePendingBackwardOperation(entry)) {
    uni.showToast({ title: t('chat.rollbackFailed'), icon: 'none' });
    return;
  }
  rollbackPending.value = true;
  postPendingBackwardOperation(entry, false);
}

function chatDelete(chatId) {
  if (isTimelineMutationBlocked()) {
    notifyTimelineMutationBlocked();
    return;
  }
  _this.http.post(_this.requestUrl.chatDelete, {
    header: {
      'content-type': 'application/json'
    },
    showLoading: false,
    data: {
      conversationId: unref(conversationId),
      chatId: chatId
    }
  }).then(res => {
    if (res.statusCode == 200) {
      unref(ajax).flag = true;
      unref(ajax).page = 1;
      teardownStreamForConversationSwitch({ invalidateHistory: true });
      getHistoryMsg();
    }
  }).catch(e => {
    console.error(e);
  });
}

/**
 * 保存目前對話並開啟新對話
 */
function saveAndStartNew() {
  _this.http.post(_this.requestUrl.saveAndStartNew, {
    header: {
      'content-type': 'application/json'
    },
    showLoading: false,
    data: {
      conversationId: unref(conversationId),
      save: true
    }
  }).then(res => {
    if (res.statusCode == 200) {
      teardownStreamForConversationSwitch({ invalidateHistory: true });
      conversationId.value = res.data.conversationId;
      // 通知 right-window 更新 conversationId
      uni.$emit('updateConversationId', { conversationId: res.data.conversationId });
      talkList.value = [];
      openMore.value = false;
      const welcomeContent = res.data.defaultRelay;
      let data: any = {
        "id": nextBubbleId(),
        "content": welcomeContent,
        "type": 0,
        "pic": pic.value,
        'maskPosition': 1,
        'chatFinish': true,
      }
      // V3 welcome: push 路径不经过 SSE / mapRow，需要在这里手动建 ast
      // 否则 isMessageV3() && item.ast 双闸 fail，bubble 走 v-html 把 <scene>/<choice>
      // 渲染成纯文字（issue: 新建对话第一句没样式）
      unref(talkList).push(data);

      // 換了一段對話等於換了一個捲動語境：使用者在舊對話裡往上滑過的話，
      // autoScrollEnabled 還停在 false，接下來這次捲底會被自己的 gate 擋掉，
      // 畫面就停在原位（2026-08-12 回報「開新對話不會自動滑到底部」）。
      autoScrollEnabled.value = true;
      isUserAtBottom.value = true;
      nextTick(() => scrollToBottom(true));
      loadArchives();
    } else if (res.statusCode === 409 && res.data && res.data.error === 'conversation_limit_reached') {
      // 存檔滿了（伺服器數的）：講清楚、給一條去刪的路，不當成一般錯誤。
      archiveCount.value = Number(res.data.count || archiveCount.value);
      if (Number(res.data.limit) > 0) archiveLimit.value = Number(res.data.limit);
      askArchivesFull();
    } else {
      message.error(res.data.error);
    }
  }).catch(e => {
    console.error(e);
  });
}


function chatStart(greetingIndex?: number) {
  return _this.http.post(_this.requestUrl.chatStart, {
    header: {
      'content-type': 'application/json'
    },
    showLoading: false,
    // 2026-05-08: chatStart 服务端会做 conversation 创建 / 历史拉取 / theme V3 state hydrate,
    // 偶尔耗时 30s+ 会被默认 timeout 截断. 显式延长到 60s 留充足边际.
    timeout: 60000,
    data: greetingIndex === undefined
      ? { roleId: unref(roleId) }
      // 伺服器是在這一刻建立對話並落下開場白的，所以選到哪一條要在這裡講。
      // 舊版伺服器沒有這個欄位，只有真的有替代開場白時才帶。
      : { roleId: unref(roleId), greetingIndex },
  }).then(res => {
    if (res.statusCode == 200) {
      pic.value = res.data.roleInfo.roleAvatar;
      historyConversation.value = res.data.historyConversation;
      conversationId.value = res.data.conversationId;
      // 通知 right-window 更新 conversationId
      uni.$emit('updateConversationId', { conversationId: res.data.conversationId });
      // 存檔數要在面板打開前就知道：「＋」面板裡的兩顆鍵滿了要停用。
      loadArchives();
      if (unref(historyConversation)) {
        ajax.flag = true;
        ajax.page = 1;
        getHistoryMsg();
      } else {
        const welcomeContent = res.data.defaultRelay;
        let data: any = {
          "id": 0,
          "content": welcomeContent,
          "type": 0,
          "pic": unref(pic),
          "playstate": false,
          'maskPosition': 1,
          'chatFinish': true,
        }
        // V3 welcome: chatStart(no history) push 不经过 SSE / mapRow，需手动建 ast
        // 否则 isMessageV3() && item.ast 双闸 fail → v-html 把 <scene>/<choice>
        // 渲染成纯文字（StoryCard 直接打开 URL 第一次 welcome 没样式 bug）
        unref(talkList).push(data);
        // 第一次打開一張角色卡也要停在底部。這條分支原本推完開場白就結束，
        // 於是沒歷史的角色卡停在頂端，開場白只露出一角。有歷史的那條走
        // getHistoryMsg，page 1 已經做了同樣三件事，這裡缺的就是它。
        // 重置跟隨狀態的理由同 saveAndStartNew：使用者在別的對話往上滑過的話，
        // 旗標還停在 false，捲底會被自己的 gate 擋掉。
        autoScrollEnabled.value = true;
        isUserAtBottom.value = true;
        nextTick(() => scrollToBottom(true));
      }
    } else {
      message.error(res.data.error);
    }
  }).catch(e => {
    console.error(e);
  });
}


function appendChatErrorBubble(errorType, errorMessage = '', metadata: Record<string, any> = {}) {
  removeOrphanPlaceholder();
  const presentation = resolveChatErrorPresentation(errorType, t);
  talkList.value.push({
    id: nextBubbleId(),
    content: presentation.finishReason ? '' : (errorMessage || presentation.message),
    type: 0,
    pic: pic.value,
    playstate: false,
    chatLoading: false,
    chatFinish: true,
    maskPosition: 1,
    ...metadata,
    finishReason: presentation.finishReason,
    errorAction: presentation.action,
    isApplicationError: true,
    systemOnly: true,
  });
  scrollToBottom();
}

// finishReasonOverride：內容審查(輸入端)確定性拒絕等場景，改推 <chat-system-message>
// 卡片(kind 由 getSystemMsgKind(finishReasonOverride) 決定)取代純文字錯誤泡泡，
// content 留空避免文字重複兩次。空字串/未傳 = 既有行為不變。
const sendError = (retryLimit, errMsg, finishReasonOverride = '', errorType = '') => {
  const failedPendingTurn = pendingChatTurn;
  if (errorType) {
    if (recoverPendingChatTurnBeforeAccepted(false)) {
      appendChatErrorBubble(errorType, errMsg);
      return;
    }
  } else if (recoverPendingChatTurnBeforeAccepted()) {
    return;
  }
  if (discardPendingChatOperationCandidate(failedPendingTurn)) {
    if (errorType) appendChatErrorBubble(errorType, errMsg);
    else message.error(errMsg);
    return;
  }
  if (hasRenderableAssistantOutput(replyContent.value, thinkingContent.value)) {
    const last = talkList.value[talkList.value.length - 1];
    const bubbleId = unref(currentChatId)
      || failedPendingTurn?.aiBubbleId
      || (last && last.type === 0 && last.chatFinish !== true ? last.id : nextBubbleId());
    const partial: any = {
      id: bubbleId,
      content: replyContent.value,
      thinkingContent: thinkingContent.value,
      thinkingCollapsed: true,
      type: 0,
      pic: pic.value,
      chatLoading: false,
      chatFinish: true,
      maskPosition: 1,
      finishReason: 'error',
    };
    if (pendingMessageMeta.value?.isV3 === true) partial.isV3 = true;
    upsertPendingAIBubble(partial);
    pendingChatTurn = null;
    rewrite.value = false;
    contine.value = false;
    lastFinishReason.value = '';
    tempContent.value = '';
    replyContent.value = '';
    thinkingContent.value = '';
    pendingMessageMeta.value = null;
    return;
  }

  const shouldRestoreUserBubble = !!failedPendingTurn?.userBubbleId;
  talkList.value = removeOwnedTurnBubbles(talkList.value, failedPendingTurn);
  pendingChatTurn = null;
  rewrite.value = false;
  contine.value = false;
  if (retryTimes.value < retryLimit) {
    content.value = tempContent.value;
    retryTimes.value++;
    rewriteTargetChatId.value = failedPendingTurn?.chatId ? String(failedPendingTurn.chatId) : '';
    rewrite.value = !!rewriteTargetChatId.value;
    send();
    return;
  }
  //重试失败，返回"请求失败，请稍后重试！"
  retryTimes.value = 0;
  if (shouldRestoreUserBubble) {
    talkList.value.push({
      id: nextBubbleId(),
      content: tempContent.value,
      type: 1,
      pic: userInfo.value.avatar ? userInfo.value.avatar : '/static/logo.png',
      maskPosition: 1,
    });
  }
  if (errorType) {
    appendChatErrorBubble(errorType, errMsg);
  } else {
    const errorBubble = finishReasonOverride ? {
    id: nextBubbleId(),
    content: '',
    type: 0,
    pic: pic.value,
    playstate: false,
    chatLoading: false,
    chatFinish: true,
    maskPosition: 1,
    finishReason: finishReasonOverride,
  } : {
    id: nextBubbleId(),
    content: errMsg,
    type: 0,
    pic: pic.value,
    playstate: false,
    chatLoading: false,
    chatFinish: true,
    maskPosition: 1,
    errorAction: '',
  };
    talkList.value.push(errorBubble);
  }
  tempContent.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  pendingMessageMeta.value = null;
  scrollToBottom();
}

// 更新 / 補 AI 進行中氣泡：若列表末尾是 type=0 且 chatFinish=false（送訊息 or streamMeta push 的占位），
// 就 splice 取代；否則直接 push。修復 race case：history 載入晚於 streamMeta placeholder，
// 把占位擦掉之後，首個 answer chunk 不會再蓋掉用戶自己的訊息氣泡。
function upsertPendingAIBubble(data) {
  // 把準備軌跡接到這則 AI 訊息上。用戶等了一分多鐘也付了錢，那段過程是他唯一
  // 能判斷「模型有沒有在幹活」的依據，不該隨氣泡出現而消失。
  //
  // 每一次 upsert 都補，而不是「第一次掛上、之後靠接力」：一輪串流會呼叫這裡
  // 四十幾次，每次都是新物件，只要其中一次的 pendingIndex 落空（走 push 而不是
  // splice），接力就斷了，而斷點之後的每一次都補不回來。實測就是這樣斷的。
  //
  // 保留到下一輪準備開始才清（見 prepStep 的第一步），所以整輪都補得到。
  if (!data.prepTrail && pendingPrepTrail.value.length) {
    data.prepTrail = pendingPrepTrail.value;
  }
  const last = talkList.value[talkList.value.length - 1];
  const operationBubbleId = pendingChatTurn?.aiBubbleId;
  const ownedPendingIndex = operationBubbleId === undefined || operationBubbleId === null || operationBubbleId === ''
    ? -1
    : talkList.value.findIndex(item =>
      item
      && item.type === 0
      && (
        String(item.operationBubbleId || '') === String(operationBubbleId)
        || String(item.id || '') === String(operationBubbleId)
      )
    );
  const pendingIndex = ownedPendingIndex >= 0
    ? ownedPendingIndex
    : (last && last.type === 0 && !last.chatFinish ? talkList.value.length - 1 : -1);
  if (operationBubbleId !== undefined && operationBubbleId !== null && operationBubbleId !== '') {
    data.operationBubbleId = operationBubbleId;
  }
  data.thinkingCollapsed = resolvePendingThinkingCollapsed(talkList.value, data.thinkingCollapsed);
  // 串流期間用戶展開的準備過程要撐得過下一個 chunk：這裡先前是每次重建都寫死
  // 收起，於是點開之後立刻被關上，手感是「點了沒反應」。思考過程上一行做的是
  // 同一件事，準備過程漏了。
  data.prepTrailCollapsed = resolvePendingPrepTrailCollapsed(talkList.value, data.prepTrailCollapsed);
  if (pendingIndex >= 0) {
    const pendingBubble = talkList.value[pendingIndex];
    if (pendingBubble?.isV3 && !data.isV3) data.isV3 = pendingBubble.isV3;
    if (pendingBubble?.ast && !data.ast) data.ast = pendingBubble.ast;
    if (pendingBubble?.finishReason && !data.finishReason) data.finishReason = pendingBubble.finishReason;
    if (pendingBubble?.thinkingContent && !data.thinkingContent) data.thinkingContent = pendingBubble.thinkingContent;
    if (pendingBubble?.prepTrail && !data.prepTrail) data.prepTrail = pendingBubble.prepTrail;
    talkList.value.splice(pendingIndex, 1, data);
  } else {
    talkList.value.push(data);
  }
}


// Wait until the most recent AI bubble's stream has fully closed. The server
// only processes one turn per WS connection and closes the socket after the
// trailing [DONE]/flowResponses/state frames — but those tail frames can
// arrive 10+ seconds AFTER the visible content is done. If the user clicks
// a <choice> button in that window we'd push the second send onto the still-
// open (but server-ignored) socket, and when the close lands we'd surface
// "connection lost" despite the first reply having rendered cleanly.
// Gating the auto-send on chatFinish keeps the second turn on the fresh
// connection that `sendWebSocketMessage` opens after socket.value is cleared.
// NOTE (2026-04-19): earlier iterations of this patch attempted to work
// around the server's "one turn per WS" behaviour by (a) proactively
// closing the socket after [DONE] with a timer, and (b) force-clearing
// socket.value / isConnecting on timeout. Both were reverted after they
// caused rapid "WebSocket is not connected" spam in the console when the
// proactive close raced with user clicks/heartbeat. The right fix is
// server-side (let ConversationWsChat handle multiple turns on one
// connection); until that lands we tolerate the 15s tail window and
// simply rely on the server closing the socket itself.

// 把一句話填進輸入框，由玩家自己按送出。
//
// 這是畫布上所有「替玩家準備一句話」的唯一出口（開場選項、日後的選項按鈕）。
// 只填不送：自動送出試過，會撞上上一輪串流的收尾窗口（伺服器一條連線一輪，
// 收尾的幾個 frame 可能晚十幾秒到），玩家看到的是「連線中斷」；填進去也讓他
// 有最後一次改字的機會——作者回報（2026-09-04）要的正是這個。
function fillComposer(msg: string) {
  if (!msg || typeof msg !== 'string') return;
  content.value = msg;
  // 展開輸入區並把焦點交給輸入框：折疊態的主輸入框是藏起來的，光 focus 不會有反應；
  // 展開後 Enter 就能送、觸控上送出鍵也在眼前。
  nextTick(() => {
    try {
      if (composerRef.value && typeof composerRef.value.expand === 'function') {
        composerRef.value.expand();
        return;
      }
      const el = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
      if (el && typeof el.focus === 'function') el.focus();
    } catch (e) { /* ignore */ }
  });
}

async function copyV3TextToClipboard(payload: string, feedback?: string) {
  const text = String(payload || '');
  if (!text) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', 'true');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    if (feedback) message.success(feedback);
  } catch (e) {
    message.error(t('common.copyFailed') || 'Copy failed');
  }
}

// 這兩支原本是 provide 給主題引擎的子元件用的。畫布沒有那些子元件，
// 但頁面自己仍然要複製與回填，所以留著函式、拿掉注入。


// Task 9: DispatchContext reused across every incoming SSE event.
// Built once here — all refs / helpers referenced below are either
// hoisted (function declarations) or already declared above. Any
// later refactor that moves helpers must keep this ordering intact.
const dispatchCtx: DispatchContext = {
  currentChatId,
  replyContent,
  thinkingContent,
  talkList,
  lastFinishReason,
  lastEventId,
  streamId,
  isStreamActive,
  tempContent,
  content,
  pendingMessageMeta,
  pendingResendPayload,
  isResumeInitial,
  userStopRequested,
  pic,
  formData,
  upsertPendingAIBubble,
  scrollToBottom,
  persistStreamState,
  clearStreamState,
  sendError,
  resetHistoryPagination: () => {
    ajax.value.flag = true;
    ajax.value.page = 1;
  },
  getHistoryMsg,
  removeOrphanPlaceholder,
  removeResumeHistoryDuplicateByMessageAnchor,
  appendStreamStateMessage,
  clearCompactState,
  discardPendingChatOperationCandidate,
  commitPendingChatOperationAfterVisibleDone,
  onOperationStatus: handleOperationStatusEvent,
  onOperationRecoveryRequired: reason => requestPendingOperationReconciliation(reason),
  tify: (s: string) => _this.fui.tify(s),
  getLocale: () => stageHost.locale.get(),
  nextTick,
  t,
  // 2026-05-07 Phase 3
};

// 移除末尾「空的 chatLoading AI 氣泡」。
// 觸發路徑：tryResumeOnMount 已先推占位，但後續 server 回 done/sessionExpired/noActiveStream、
// 或 WS error/reconnect 耗盡，都沒有 answer chunk 把占位填實。若不清，UI 永遠留一個轉圈圈的氣泡。
// 把末尾那顆「還沒被填實的 AI 佔位氣泡」就地轉成系統訊息,而不是刪掉它再彈
// 一個會消失的 toast。
//
// 由來(2026-08-01):「暫時無法確認這次操作的結果」原本走 message.warning。
// 那個呈現有三個問題:它是**狀態**卻用打斷式警告呈現;toast 會自己消失,用戶
// 錯過就再也看不到;而且它不可行動——Apple HIG 明說「不要只為了告知而打斷,
// 用戶不會感謝一個有資訊卻無法採取行動的打斷」。
//
// 轉成系統訊息之後三件事同時解決:留在對話流裡看得到、視覺是狀態級而非告警、
// 掛得上 refresh_history CTA(App 內重載對話,不是叫用戶重新整理瀏覽器——
// PWA 與原生 App 沒有那個動作,而 HIG 要求 App 自行恢復先前狀態)。
//
// 回傳是否真的轉換了:沒有可轉的佔位氣泡時(例如串流已經填了內容)回 false,
// 呼叫端據此決定要不要退回舊行為。
function markPendingOutcomeUnconfirmed() {
  const last = talkList.value[talkList.value.length - 1];
  if (
    !last
    || last.type !== 0
    || last.chatFinish
    || hasRenderableAssistantOutput(last.content, last.thinkingContent)
  ) return false;
  last.chatLoading = false;
  last.chatFinish = true;
  last.finishReason = 'outcome_unconfirmed';
  return true;
}

// 宣告「結果還在確認中」的唯一入口。
//
// 優先把它變成留得住的系統訊息;只有在真的沒有佔位氣泡可轉時(例如劇情回溯——
// 那條操作不產生 AI 氣泡)才退回 toast。入口只有一個,是為了讓「先試 row」這件事
// 不會被某個呼叫點繞過——繞過就等於又回到「用戶錯過就沒了」。
function announceOutcomeUnconfirmed() {
  // 還在等的時候完全不宣告——這是真正的匯流點，三條路徑（輪詢耗盡、身分對帳、
  // 確認逾時）都會經過這裡。先前只擋了其中一條，於是「輪詢耗盡」那條照樣把
  // 氣泡跳出來（實測 console: accepted_without_operation fast polling exhausted）。
  //
  // 為什麼不該宣告：等待指示器**已經**在說「還在處理」了。換一個提示沒有給
  // 用戶任何新資訊——狀態沒變、能做的事也沒變（等／停止／自己重整），只是把
  // 被動可忽略的指示器換成看起來像出事的東西（HIG 總則二）。而那個「無法確認」
  // 多半是假的：後台還在生成。
  //
  // 界限由 enterSlowWait 的五分鐘（產品邊界 I-1）負責；到期後 slowWaitActive
  // 會被清掉，那時再走到這裡才真的宣告。
  // 還在等的時候完全不宣告。
  //
  // 先前這裡寫的是 `if (slowWaitActive.value) return`，但那個旗標只有
  // enterSlowWait 會設，而輪詢耗盡那條路徑根本不會走到 enterSlowWait——
  // 於是守衛永遠是 false，等同不存在（實測氣泡照跳）。**檢查別人有沒有設旗標，
  // 不等於自己擋住。**
  //
  // 改成：只要這一輪還在進行中就自己記時並放行等待，直到超過產品邊界的五分鐘
  // （I-1）才真的宣告。這樣三條路徑（輪詢耗盡、身分對帳、確認逾時）都被擋住，
  // 而「不能永遠停在等待」的性質仍然成立。
  if (pendingChatTurn) {
    const now = Date.now();
    if (!outcomeUnconfirmedSuppressedAt) outcomeUnconfirmedSuppressedAt = now;
    if (now - outcomeUnconfirmedSuppressedAt < SLOW_WAIT_GIVE_UP_MS) return;
  }
  outcomeUnconfirmedSuppressedAt = 0;
  if (markPendingOutcomeUnconfirmed()) return;
  // 轉換失敗有兩種完全不同的成因，不能都退回 toast：
  //   (a) 根本沒有佔位氣泡可轉（例如劇情回溯不產生 AI 氣泡）→ 才該說「還在確認」
  //   (b) 最後一則**已經有可見輸出** → 結果就在畫面上，這時再說「無法確認」是騙人
  // 2026-08-01 使用者回報 (b)：模型端出錯的情境跳了這個提示，但內容其實正常跑出來了。
  // 產品邊界：durable 可見輸出存在時，這次 operation 的結果不是「無法確認」。
  const last = talkList.value[talkList.value.length - 1];
  if (last && last.type === 0 && hasRenderableAssistantOutput(last.content, last.thinkingContent)) return;
  message.warning(t('chat.operationStatusUnavailable'));
}

function removeOrphanPlaceholder() {
  const lastIdx = talkList.value.length - 1;
  const last = talkList.value[lastIdx];
  if (
    last
    && last.type === 0
    && !last.chatFinish
    && !hasRenderableAssistantOutput(last.content, last.thinkingContent)
  ) {
    // agent 跑到一半被停下來時,這顆氣泡不是「空的」——它承載著使用者已經付過錢
    // 的那段準備過程。移除它等於讓畫面上只剩使用者自己的訊息,底下空無一物。
    //
    // 留下來,並把即時軌跡固定上去;底下的「繼續」由 agentInterrupted 驅動。
    if (keepInterruptedAgentBubble(last, prepSteps.value)) {
      talkList.value.splice(lastIdx, 1, { ...last });
      return;
    }
    talkList.value.pop();
  }
}

function removeResumeHistoryDuplicateByMessageAnchor(messageId: string | number) {
  if (messageId === undefined || messageId === null || messageId === '') return;
  const duplicateIndex = talkList.value.findIndex(item =>
    item && item.type === 0 && item.chatFinish === true && String(item.id) === String(messageId)
  );
  if (duplicateIndex >= 0) {
    talkList.value.splice(duplicateIndex, 1);
  }
}

function appendStreamStateMessage(messageText: string, finishReason: 'resume_unavailable' | 'compact_retryable' | 'compact_no_input') {
  removeOrphanPlaceholder();
  talkList.value.push({
    id: nextBubbleId(),
    content: messageText,
    type: 0,
    pic: pic.value,
    playstate: false,
    chatLoading: false,
    chatFinish: true,
    maskPosition: 1,
    finishReason,
  });
  nextTick(() => scrollToBottom(true));
}

function clearCompactState() {
  clearCompactWatchdog();
  store.commit('setIsCompacting', false);
  store.commit('setCompactStatus', '');
}

//处理服务器消息 - V1.1: 使用 SSE 解析器
const handlerMessage = (res, eventGeneration: number, socketToken: number) => {
  if (!isOwnedSocketCallback(socketToken, eventGeneration)) return;
  let text = res.data;

  // ----------------------------------------------------------------
  // Theme V3 out-of-band events (M2 Task 7)
  // The server emits JSON envelopes for non-streaming events such as
  // `{"type":"cg_update", ...}` on the same socket. Try a fast JSON probe
  // BEFORE falling through to the SSE parser so we don't corrupt the existing
  // text-chunk path.
  if (typeof text === 'string' && text.length > 0 && text.charCodeAt(0) === 123 /* '{' */) {
    try {
      const envelope = JSON.parse(text);
      if (envelope && typeof envelope === 'object' && typeof envelope.type === 'string') {
        if (envelope.type === 'cg_update') {
          // 這條路由沒有 V3 的 CG 面板，事件收下不轉發。
          return;
        }
      }
    } catch (_) {
      // Not JSON — fall through to the SSE parser below.
    }
  }

  if (text == '积分不足') {
    sendError(0, t("chat.point_no_tips"), '', 'insufficient_credits');
    return;
  }

  // V1.1: 使用 SSE 解析器解析消息
  const events = sseParser.parse(text);

  // 处理解析出的事件
  events.forEach(event => {
    if (!isOwnedSocketCallback(socketToken, eventGeneration)) return;
    if (event.event === 'ready') {
      // 驗票通過。心跳與排隊中的聊天幀都等到這裡才開始，避免搶在驗票之前送出。
      const readySocket = socketsAwaitingReady.get(socketToken);
      socketsAwaitingReady.delete(socketToken);
      if (!readySocket) return;
      const mockWebSocket = {
        readyState: 1,
        send: (data: string) => {
          if (!isOwnedSocketCallback(socketToken, eventGeneration)) return;
          if (typeof readySocket.send === 'function') readySocket.send({ data });
        }
      };
      heartbeatManager.start(mockWebSocket as any, { interval: 10000 });
      sendQueuedChatPayload(readySocket, socketToken);
      return;
    }
    if (event.event === 'error' && event.data?.code === 'unauthorized') {
      // 票證或身分失效：重連只會再拿一張同樣不被接受的票，直接回登入。
      socketsAwaitingReady.delete(socketToken);
      clearOpenAuthTokens();
      redirectToOpenLogin();
      return;
    }
    if (event.event === 'accepted') {
      markPendingChatTurnAccepted(event.data);
      return;
    }
    if (event.event === 'turn_already_consumed') {
      const pending = pendingChatTurn;
      const prepared = prepareChatPayload(pending?.payload);
      const retryable = event.data?.errorCode === 'turn_already_consumed' && event.data?.retryable === true;
      if (retryable && prepared.ok && chatTransport.consumeTurnAlreadyConsumedRetry(pending)) {
        console.warn('[Stream] turn_already_consumed，改用新 socket 重送一次');
        if (pending) pending.payload = prepared.payload;
        persistPendingSend(prepared.payload);
        sendWebSocketMessage(prepared.payload);
      } else {
        console.warn('[Stream] turn_already_consumed 重送已耗盡，恢復草稿');
        const draft = pending?.draft || pending?.payload?.message || '';
        if (!recoverPendingChatTurnBeforeAccepted()) recoverStoredStreamDraft({ draft });
        closeWebSocket();
      }
      return;
    }
    const isVisibleDone = (event.event === 'answer' || event.event === 'message')
      && event.raw === '[DONE]';
    // Task 9: main streaming / v2 protocol events are dispatched via a
    // pure module so the WS and HTTP streaming transports share exactly
    // one code path. Vuex-touching cases and a few legacy branches
    // remain inline below (see switch). `event.id` bookkeeping for v2
    // resume lives inside dispatchSSEEvent.
    const skipInlineHandler = handleParsedChatSSEEventGate(event, {
      isGenerationCurrent: () => isOwnedSocketCallback(socketToken, eventGeneration),
      dispatchEvent: ev => dispatchSSEEvent(ev, dispatchCtx),
      clearResumeInitialIfNeeded: () => {
        if (isResumeInitial.value) {
          isResumeInitial.value = false;
        }
      },
    });
    if (isVisibleDone) {
      multiPassUpdating.value = multiPassEffective.value;
      retireActiveSocketAfterVisibleDone(socketToken);
    }
    if (skipInlineHandler) return;

    switch (event.event) {
      case 'prepStep': {
        // 正文之前的準備步驟進度。伺服器只送**資料**（階段、在查什麼、找到幾條），
        // 文案在前端組——五語文案是前端資產，改字不用動伺服器。
        // done 一律收掉指示器；伺服器保證不論走哪條路徑都會送 done。
        const d = event.data || {};
        const stage = d.stage || '';
        // 偵錯用：在 console 過濾框輸入 [Prep] 就只剩這些。
        console.log('[Prep]', stage, JSON.stringify(d), '| raw:', String(event.raw || '').slice(0, 120));
        // 進度事件是「伺服器活著」的證據。客戶端等 15 秒收不到「已寫入」確認
        // 就判定失聯，但準備要跑 30-60 秒、那段期間伺服器還沒開始寫任何東西
        // ——不主動清掉倒數的話，**每一輪都會**被誤判成失聯。
        if (pendingChatTurn) {
          chatTransport.noteServerStreamProgress(pendingChatTurn, 'durable_operation');
        }
        exitSlowWait();
        // 新一輪的準備開始了：上一輪的軌跡已經掛在它自己的訊息上，這裡可以放手。
        if (stage !== 'done' && pendingPrepTrail.value.length) pendingPrepTrail.value = [];
        prepStepQuery.value = d.query || '';
        prepStepResource.value = d.resource || '';
        prepStepCount.value = typeof d.count === 'number' ? d.count : 0;
        prepRetryAttempt.value = typeof d.attempt === 'number' ? d.attempt : 0;
        prepRetryMax.value = typeof d.maxAttempts === 'number' ? d.maxAttempts : 0;
        prepRetryInSeconds.value = typeof d.retryInSeconds === 'number' ? d.retryInSeconds : 0;
        prepStepStage.value = stage === 'done' ? '' : stage;
        if (stage === 'done') {
          // 軌跡不隨正文開始而消失。
          //
          // 用戶在這裡等了一分多鐘、也付了錢——那段過程是他唯一能判斷「模型
          // 到底有沒有在幹活」的依據。氣泡一出現就把它抹掉，等於事後不給看，
          // 他只會留下「等很久，不知道發生了什麼」的印象。
          //
          // 所以把它掛到那則訊息上，跟思考過程同一個形態：預設收起，想看就展開。
          // 下次重新整理沒有就沒有（它不落盤），但這一次既然已經寫出來了，
          // 就沒有理由讓它憑空消失。
          // 不能在這裡直接掛到最後一則：done 是在**正文開始之前**送出的，
          // 那一刻 AI 氣泡還不存在，最後一則是用戶自己的訊息。先存起來，
          // 等氣泡建出來時再接上（跟思考內容走同一條 pendingPrepTrail 路徑）。
          if (prepSteps.value.length) pendingPrepTrail.value = prepSteps.value.slice();
          prepSteps.value = [];
        } else {
          const line = prepStepText.value;
          // 同一句不重複追加：重複的行看起來像卡住，比不顯示更糟。
          if (line && line !== prepSteps.value[prepSteps.value.length - 1]) {
            prepSteps.value.push(line);
            // 軌跡增長要跟隨底部。少了這個，準備跑完之後氣泡已經在螢幕外，
            // 用戶等了一分多鐘卻看不到結果——動態內容本來就該跟著長。
            nextTick(() => scrollToBottom());
          }
        }
        break;
      }

      case 'passBlock':
        attachPassBlock(talkList.value, event.data, currentChatId.value);
        multiPassUpdating.value = false;
        nextTick(() => scrollToBottom());
        break;

      case 'flowResponses':
        if (content.value || tempContent.value || replyContent.value) {
          tempContent.value = "";
          replyContent.value = "";
          console.log('訊息傳送結束');
        }
        break;

      case 'streamMeta':
        // 送達證明:server 已回首事件,解除 accepted 黑洞看門狗(見 ownership 註釋)
        chatTransport.noteServerStreamProgress(pendingChatTurn, 'stream_meta');
        // Phase 2a：伺服端首個事件下發 streamId，之後 resume/刷新都用它
        try {
          const meta = event.data;
          if (meta && meta.streamId) {
            streamId.value = meta.streamId;
            isStreamActive.value = true;
            // streamMeta 只代表 session 建立；完整 payload 必須保留到 accepted。
            persistStreamState();
            console.log('[Stream] streamMeta received:', meta.streamId, 'conv=', unref(conversationId));

            // Resume 補 AI placeholder bubble：正常 send() 流程會在發送時 push 一個
            // chatLoading 的空 AI 氣泡，resume 路徑（刷新進來）沒有這一步，若不補則：
            //   1. UI 空白，用戶不知 AI 在生成
            //   2. 首個 answer chunk 到達時，splice(length-1, 1, data) 會覆蓋掉用戶自己的訊息氣泡
            const last = talkList.value[talkList.value.length - 1];
            const needPlaceholder = !last || last.type !== 0 || last.chatFinish;
            if (needPlaceholder) {
              talkList.value.push({
                id: nextBubbleId(),
                content: '',
                type: 0,
                pic: unref(pic),
                playstate: false,
                chatLoading: true,
                chatFinish: false,
                maskPosition: 1,
              });
              nextTick(() => scrollToBottom(true));
            }
          }
        } catch (e) {
          console.error('[Stream] 解析 streamMeta 失敗:', e);
        }
        break;

      case 'done':
        // Phase 2a：v2 協定的正式結束訊號，清 localStorage
        {
          // Bad Case 1 修正：cold-resume 連上的是「已結束」session，server 只發 done 不 replay
          // （見 character_router.go:4013-4017 的短路邏輯）。若首次 history 拉取發生在
          // InsertAIChat commit 之前，AI 訊息還沒在 DB，UI 會空白。這裡在清狀態前補拉一次 history。
          const needRefetch = isResumeInitial.value && !replyContent.value;
          console.log(`[Stream] done event received, needRefetch=${needRefetch} conv=${unref(conversationId)}`);
          isResumeInitial.value = false;
          multiPassUpdating.value = false;
          // clearStreamState 內部會設 isStreamActive=false，不要拆兩步造成中間態
          clearStreamState();
          removeOrphanPlaceholder();
          // 這一輪的上下文用量要等落盤後從歷史讀；不擋收尾。
          scheduleContextUsageRefresh();
          // 組成彈窗開著的話，這一輪收尾後重讀一次，副標「依最近一次完成的回覆」才是真的。
          if (panel.value.sheet === 'context-breakdown') loadContextBreakdown();
          // 記憶彈窗開著的話也重讀一次：Agent 這一輪可能剛記了新的東西。
          if (panel.value.sheet === 'memory') loadMemory();
          if (needRefetch) {
            try {
              ajax.value.flag = true;
              ajax.value.page = 1;
              getHistoryMsg();
            } catch (e) { console.error('[Stream] done 後重抓 history 失敗:', e); }
          }
        }
        break;

      case 'noActiveStream':
        // Phase 2a：server 反查該 conversation 無 active session。兩種情境：
        //   (a) 訊息根本沒送達 server（refresh 太快） → pendingResend 尚在 TTL 內，自動補送一次
        //   (b) stream 已結束 → 走 history 補齊（對齊 sessionExpired UX）
        {
          if (requestPendingOperationReconciliation('noActiveStream')) {
            break;
          }
          const resend = pendingResendPayload.value;
          const freshEnough = resend && resend.pendingSince && (Date.now() - resend.pendingSince <= STREAM_PENDING_RESEND_TTL_MS);
          console.log(`[Stream] noActiveStream, pendingResend=${!!resend} freshEnough=${freshEnough} conv=${unref(conversationId)}`);
          if (resend && freshEnough) {
            const prepared = prepareChatPayload(resend.payload);
            if (!prepared.ok) {
              console.error('[Stream] noActiveStream payload 欄位不完整，取消自動補送:', prepared.missingFields.join(','));
              recoverStoredStreamDraft({ draft: resend.payload?.message || '' });
              closeWebSocket();
              break;
            }
            const payloadToResend = prepared.payload;
            console.log('[Stream] noActiveStream → auto resend');
            // 先清 isStreamActive / isResumeInitial，避免舊 socket 關閉時的 onSocketClose 把新 send 的狀態
            // 誤當作「stream 斷線」觸發重連 / fallback history，引發新連線自己打自己。
            isStreamActive.value = false;
            isResumeInitial.value = false;
            // 移除 byConv 路徑上 tryResumeOnMount 推的空 placeholder，否則 onSocketClose
            // 會看到「尾端有空 AI 氣泡」→ 呼叫 sendError 彈「連線中斷」toast + 抹掉上下文。
            removeOrphanPlaceholder();
            const resendOperationKind = operationKindFromPayload(payloadToResend);
            let resendUserBubbleId: string | number | undefined;
            // Rewrite 重用原 USER、Continue 沒有 USER；只有 ordinary Send 的
            // byConv resend 需要補本地 USER bubble。
            if (resendOperationKind === 'send') {
              const resendUserBubble = {
                id: nextBubbleId(),
                content: payloadToResend.message,
                type: 1,
                pic: unref(userInfo).avatar ? unref(userInfo).avatar : '/static/logo.png',
                maskPosition: 1,
                transportTransient: true,
                serverAccepted: false,
              };
              talkList.value.push(resendUserBubble);
              resendUserBubbleId = resendUserBubble.id;
            }
            const resendAIBubbleId = nextBubbleId();
            talkList.value.push({
              id: resendAIBubbleId,
              operationBubbleId: resendAIBubbleId,
              content: '',
              type: 0,
              pic: unref(pic),
              chatLoading: true,
              chatFinish: false,
              maskPosition: 1,
            });
            // 重新寫入 pending marker（server 收到 streamMeta 會再清）
            persistPendingSend(payloadToResend);
            beginPendingChatTurn({
              userBubbleId: resendUserBubbleId,
              aiBubbleId: resendAIBubbleId,
              draft: payloadToResend.message,
              payload: payloadToResend,
              expectsAccepted: !payloadToResend.rewrite && !payloadToResend.contine,
              operationKind: resendOperationKind,
            });
            sendWebSocketMessage(payloadToResend);
          } else {
            pendingResendPayload.value = null;
            clearStreamState();
            removeOrphanPlaceholder();
            try {
              ajax.value.flag = true;
              ajax.value.page = 1;
              getHistoryMsg();
            } catch (e) { console.error('[Stream] noActiveStream → getHistoryMsg 失敗:', e); }
          }
        }
        break;

      case 'hasRecentReply':
        // Phase 2a Fix A 補丁：server 告知此 conv 最近已有 AI chat 寫入 DB
        // （原 stream 其實順利完成、只是 streamMeta 沒在 refresh 前到達 client）。
        // 不觸發 auto-resend，只拉 history 呈現結果。避免「stream 已完成 + resend 產生第二條回覆」的 UI 重複。
        console.log(`[Stream] hasRecentReply, 走 history 不 resend, conv=${unref(conversationId)}`);
        pendingResendPayload.value = null;
        isResumeInitial.value = false;
        clearStreamState();
        removeOrphanPlaceholder();
        try {
          ajax.value.flag = true;
          ajax.value.page = 1;
          getHistoryMsg();
        } catch (e) { console.error('[Stream] hasRecentReply → getHistoryMsg 失敗:', e); }
        break;

      case 'compacting':
        store.commit('setIsCompacting', true);
        store.commit('setCompactStatus', 'compacting');
        console.log('[AutoCompact] 伺服端觸發壓縮，原因:', event.data.reason);
        startCompactWatchdog();
        // Resume 時 tryResumeOnMount 已先推占位，但壓縮階段該由 pill 接管、不該有空氣泡。
        // 等 compactDone 後的 answer chunks 會再透過 upsertPendingAIBubble 補新占位。
        removeOrphanPlaceholder();
        break;

      case 'compactDone':
        clearCompactWatchdog();
        store.commit('setIsCompacting', false);
        store.commit('setCompactStatus', 'success');
        console.log('[AutoCompact] 壓縮完成，summaryId:', event.data.summaryId);
        // Part D：將新 summary 即時插入 messages 陣列
        try {
          const summaryPayload = event.data && event.data.summary;
          // 後端 Chat model：chatId (string) / chatMessage / conversationId / isSummary / createTime
          const summaryChatId = summaryPayload && (summaryPayload.chatId || summaryPayload.id);
          if (summaryPayload && summaryChatId) {
            const alreadyExists = talkList.value.some(m => m && m.id === summaryChatId);
            if (!alreadyExists) {
              const rawContent = summaryPayload.chatMessage != null
                ? summaryPayload.chatMessage
                : (summaryPayload.content || '');
              // 存原文：字形轉換在渲染那一刻做（renderMarkdown），這裡先轉會把卡片協定轉壞。
              const summaryMsg = {
                id: summaryChatId,
                content: rawContent,
                type: 0,
                pic: pic.value,
                isSummary: true,
                summaryExpanded: false,
                chatLoading: false,
                chatFinish: true,
                maskPosition: 1,
                conversationId: summaryPayload.conversationId || unref(conversationId),
                createTime: summaryPayload.createTime,
                _isNewSummary: true,
              };
              talkList.value.push(summaryMsg);
              if (autoScrollEnabled.value) {
                nextTick(() => scrollToBottom());
                // 淡入提示（300ms 後清 flag）
                setTimeout(() => {
                  const idx = talkList.value.findIndex(m => m && m.id === summaryChatId);
                  if (idx >= 0) talkList.value[idx]._isNewSummary = false;
                }, 320);
              } else {
                // 使用者在閱讀歷史 → 顯示浮動 pill
                newSummaryPillVisible.value = true;
                if (newSummaryPillTimer.value) clearTimeout(newSummaryPillTimer.value);
                newSummaryPillTimer.value = setTimeout(() => {
                  newSummaryPillVisible.value = false;
                }, 5000);
              }
            }
          }
        } catch (err) {
          console.error('[AutoCompact] 插入 summary 訊息失敗:', err);
        }
        setTimeout(() => {
          store.commit('setCompactStatus', '');
        }, 1500);
        break;

      case 'compactFailed':
        clearCompactWatchdog();
        store.commit('setIsCompacting', false);
        store.commit('setCompactStatus', 'failed');
        console.error('[AutoCompact] 壓縮失敗:', event.data.error);
        // 工單 #41-F1：這輪失敗，不清 rewrite/contine 的話會殘留到下一次使用者
        // 新句發送，讓 server 誤判成重説或繼續。
        rewrite.value = false;
        contine.value = false;
        {
          const outcome = event.data?.outcome || event.data?.type || event.data?.reason;
          if (outcome === 'no_input') {
            appendStreamStateMessage(t('chat.compactNoInput'), 'compact_no_input');
          } else {
            // content 留空：訊息改由下方 <chat-system-message> 卡片承載（label 用
            // chat.compactFailed、sub 用 error.compactRetryable），避免同一段文字
            // 在普通泡泡跟系統卡片重複出現兩次。跟 mobile 側同一份修法一致。
            appendStreamStateMessage('', 'compact_retryable');
          }
        }
        setTimeout(() => {
          store.commit('setCompactStatus', '');
        }, 2000);
        break;

      case 'compactSkipped':
        clearCompactWatchdog();
        store.commit('setIsCompacting', false);
        store.commit('setCompactStatus', '');
        console.log('[AutoCompact] 本輪壓縮已跳過，原因:', event.data?.reason);
        uni.showToast({
          title: t('chat.compactSkippedNotice'),
          icon: 'none'
        });
        break;

      case 'waiting':
        // 後端等待上游 API 回應超過 10 秒，在氣泡底部顯示提示
        {
          let lastItem = talkList.value[talkList.value.length - 1];
          if (lastItem) {
            lastItem.waitingHint = t('error.modelSlow');
          }
        }
        break;
      case 'retrying':
        // 後端正在重試，在氣泡底部顯示重試進度
        {
          const attempt = event.data?.attempt || '?';
          const max = event.data?.max || '?';
          const retryErrorType = event.data?.error_type || 'connection_error';
          const retryMessages = {
            'service_unavailable': t('error.serviceUnavailable'),
            'rate_limit': t('error.rateLimit'),
            'server_error': t('error.serverError'),
            'timeout': t('error.timeout'),
            'connection_error': t('error.connectionError'),
            'content_filter': t('error.contentFilter'),
          };
          const retryMsg = retryMessages[retryErrorType] || t('error.connectionError');
          let lastItem = talkList.value[talkList.value.length - 1];
          if (lastItem) {
            lastItem.waitingHint = retryMsg + ' (' + attempt + '/' + max + ')';
          }
        }
        break;
      case 'error':
        multiPassUpdating.value = false;
        // 解析後端傳來的錯誤類型
        const errorType = event.data?.error_type || 'connection_error';
        if (markExplicitPreAdmissionError(
          pendingChatTurn,
          errorType,
          Date.now(),
        )) {
          persistPendingPreAdmissionState(pendingChatTurn as PendingChatTurn);
        }
        if (
          pendingChatTurn?.operationOutcomeCapability === 'legacy'
          && !String(pendingChatTurn.preAdmissionErrorType || '').trim()
        ) {
          pendingChatTurn.preAdmissionErrorType = errorType;
          pendingChatTurn.preAdmissionErrorAt = Date.now();
        }
        if (
          pendingChatTurn?.operationOutcomeCapability === 'legacy'
          && settleFrozenLegacyStreamError(pendingChatTurn)
        ) {
          break;
        }
        if (requestPendingOperationReconciliation(`stream_error:${errorType}`)) {
          break;
        }
        const failedPendingOperation = pendingChatTurn;
        terminateStreamForChatError(errorType, () => clearStreamState());
        const errorMsg = resolveChatErrorMessage(errorType, t);

        if (errorType === 'mod_expiry_ack_required') {
          handleModExpiryAckRequired(event.data);
          break;
        }

        // compact_retryable（壓縮收尾競賽失敗，當輪無回覆）等 error 事件代表
        // 伺服端已放棄本輪壓縮，前端不該讓「整理中」pill 卡到 390s watchdog 兜底
        // 才消失。收到任何 error 事件都立即清 compacting 狀態，只清狀態不動下面
        // 既有的重試/保留內容邏輯。
        if (unref(isCompacting)) {
          clearCompactWatchdog();
          store.commit('setIsCompacting', false);
          store.commit('setCompactStatus', '');
        }

        // `event:error` 不是 durable winner 證明。Rewrite 必須恢復舊 branch，
        // Continue 只能移除自己的 provisional bubble；即使已收到部分文字／思考，
        // 也不能把 transport error 猜成 server 已落盤。
        if (discardPendingChatOperationCandidate(failedPendingOperation)) {
          appendChatErrorBubble(errorType, errorMsg);
          break;
        }
        pendingChatTurn = null;

        if (hasRenderableAssistantOutput(replyContent.value, thinkingContent.value)) {
          // 正文或思考已有可顯示輸出 → 保留內容，標記為 error 截斷
          let data = {
            "id": currentChatId.value,
            "content": replyContent.value,
            "thinkingContent": thinkingContent.value,
            "thinkingCollapsed": true,
            "type": 0,
            "pic": pic.value,
            "chatLoading": false,
            "chatFinish": true,
            "maskPosition": 1,
            "finishReason": resolveChatErrorPresentation(errorType, t).finishReason || 'error'
          };
          upsertPendingAIBubble(data);
          lastFinishReason.value = '';
          tempContent.value = "";
          replyContent.value = "";
          thinkingContent.value = "";
          // 工單 #41-F1：這條分支保留部分內容、不走 sendError，必須自己清
          // rewrite/contine，避免殘留旗標污染下一次使用者新句 payload。
          rewrite.value = false;
          contine.value = false;
        } else {
          replyContent.value = "";
          // 內容審查(輸入端)確定性拒絕(error_type='content_filter'，見設計文件
          // §3.3)：原樣重發必再撞，走 filtered 卡視覺、不放重試 CTA。用獨立
          // finishReason 值(content_filter_input)跟既有輸出端 finishReason=
          // 'content_filter' 通道(保留重試 CTA)區隔，避免 CTA 語義衝突。
          if (errorType === 'conversation_stale') {
            sendError(0, errorMsg, 'conversation_stale', errorType);
          } else {
            sendError(0, errorMsg, errorType === 'content_filter' ? 'content_filter_input' : '', errorType);
          }
        }
        break;
    }
  });
}

// 滚动节流定时器（仅用于加载更多）
let loadMoreThrottleTimer: ReturnType<typeof setTimeout> | null = null;
const LOAD_MORE_THROTTLE_DELAY = 300; // 300ms节流
let lastScrollTop = 0; // 记录上一次滚动位置
let scrollAnchor = 0; // 滚动锚点，用于累计检测往上滚动

// 追蹤「是否有用戶輸入正在驅動滾動」（對齊 mobile 的修法）。
// 區分真實手勢（手指/指標/wheel）與程式化 scroll 餘波 / Safari elastic 雜訊：
//   - 手勢中：低閾值（15px）立即解除自動跟隨，避免拉扯感
//   - 非手勢：高閾值（100px）+ distToBottom≥100 雙保險，防 elastic / momentum 誤觸
// 用 module-level let 而非 ref：scroll handler 高頻調用，不需要 reactivity
let _touchScrollActive = false;
let _touchScrollEndAt = 0;
let _pointerScrollActive = false;
let _pointerScrollEndAt = 0;
let _wheelScrollEndAt = 0;
const _GESTURE_TAIL_MS = 500; // 手放開後 500ms 內仍算手勢 (cover momentum 慣性)

function isUserGestureScrolling(): boolean {
  const now = Date.now();
  if (_touchScrollActive || _pointerScrollActive) return true;
  if (_touchScrollEndAt && now - _touchScrollEndAt < _GESTURE_TAIL_MS) return true;
  if (_pointerScrollEndAt && now - _pointerScrollEndAt < _GESTURE_TAIL_MS) return true;
  if (_wheelScrollEndAt && now - _wheelScrollEndAt < _GESTURE_TAIL_MS) return true;
  return false;
}

// 計算當前 scroll 狀態 → 更新 autoScrollEnabled / isUserAtBottom (兩個 handler 共用)
function applyScrollGate(scrollTop: number, scrollHeight: number, clientHeight: number) {
  // 無條件記錄——哨兵要用它推算內容總高（見 setupScrollAnchorObserver）。
  // 不能改讀 .message-list-area 的 scrollTop：uni-app 的 scroll-view 真正捲動的是
  // 內層 div，外層自訂元素的 scrollTop 永遠是 0，那會讓哨兵把「使用者上滑」誤判成
  // 「內容撐高」，一滑就被拉回底部。
  scrollTopNow = scrollTop;
  headerScrollY.value = scrollTop;
  const distanceFromBottom = Math.max(0, scrollHeight - scrollTop - clientHeight);
  const isAtBottom = distanceFromBottom < 120;

  // 更新錨點：用戶往下滾動時更新錨點
  if (scrollTop > scrollAnchor) {
    scrollAnchor = scrollTop;
  }

  const scrollUpDistance = scrollAnchor - scrollTop;
  const isScrollingDown = scrollTop > lastScrollTop + 10;
  const isUserGesture = isUserGestureScrolling();
  // 手勢期間 15px 立即解除（避免剛上滑就被自動 scroll 拉扯）
  // 非手勢 100px + distanceFromBottom 雙保險（防 Safari elastic / momentum 雜訊誤觸）
  const threshold = isUserGesture ? 15 : 100;

  if (scrollUpDistance > threshold) {
    if (isUserGesture || distanceFromBottom >= 100) {
      autoScrollEnabled.value = false;
    }
  } else if (isScrollingDown && isAtBottom && !autoScrollEnabled.value) {
    autoScrollEnabled.value = true;
    scrollAnchor = scrollTop;
  }

  // 滑回接近底部 → 自動恢復 follow（不再只靠 scrollingDown && isAtBottom）
  if (!autoScrollEnabled.value && distanceFromBottom < 60) {
    autoScrollEnabled.value = true;
    scrollAnchor = scrollTop;
  }

  lastScrollTop = scrollTop;
  isUserAtBottom.value = isAtBottom;
}

// H5 原生滚动事件处理器
function nativeScrollHandler(event: Event) {
  const container = event.target as HTMLElement;
  if (!container) return;

  applyScrollGate(container.scrollTop, container.scrollHeight, container.clientHeight);

  // 加载更多历史消息
  if (container.scrollTop < 50 && unref(ajax).hasNextPage && unref(ajax).flag && !loadMoreThrottleTimer) {
    loadMoreThrottleTimer = setTimeout(() => {
      loadMoreThrottleTimer = null;
    }, LOAD_MORE_THROTTLE_DELAY);
    ajax.value.page++;
    getHistoryMsg();
  }
}

// 处理滚动事件（uni-app scroll-view）
function handleScroll(event) {
  // 畫布的捲動容器是一個自己捲的 div，量它就好——不像 uni-app 的 scroll-view
  // 得從事件的 detail 拿（外層自訂元素的 scrollTop 恆為 0）。
  const container = (event?.target as HTMLElement) || (document.querySelector('#scrollview') as HTMLElement);
  if (!container) return;
  const scrollTop = container.scrollTop || 0;
  const scrollHeight = container.scrollHeight || 0;
  const realClientHeight = container.clientHeight || 0;

  applyScrollGate(scrollTop, scrollHeight, realClientHeight);

  // 加载更多历史消息
  if (scrollTop < 50 && unref(ajax).hasNextPage && unref(ajax).flag && !loadMoreThrottleTimer) {
    loadMoreThrottleTimer = setTimeout(() => {
      loadMoreThrottleTimer = null;
    }, LOAD_MORE_THROTTLE_DELAY);
    ajax.value.page++;
    getHistoryMsg();
  }
}

function completeHistoryRequest(request: {
  conversationId: string
  requestKey: string
}): boolean {
  if (!shouldCompleteHistoryRequest({
    requestConversationId: request.conversationId,
    requestKey: request.requestKey,
    currentConversationId: unref(conversationId),
    activeRequestKey: activeHistoryRequestKey,
  })) return false;

  activeHistoryRequestKey = ''
  ajax.value.flag = true
  hideLoadTips(true);
  return true
}

function showHistoryLoadFailure(request: {
  conversationId: string
  requestKey: string
}) {
  if (!completeHistoryRequest(request)) return;

  if (talkList.value.length > 0) return;
  talkList.value = [{
    id: nextBubbleId(),
    content: '',
    type: 0,
    pic: pic.value,
    playstate: false,
    chatLoading: false,
    chatFinish: true,
    maskPosition: 1,
    finishReason: 'history_load_error',
    isApplicationError: true,
    systemOnly: true,
  }];
}

function recoverEmptyHistory(reason: HistoryRecoveryReason, request: {
  conversationId: string
  generation: number
  requestKey: string
  page: number
}): boolean {
  const decision = decideHistoryRecovery({
    reason,
    requestConversationId: request.conversationId,
    requestGeneration: request.generation,
    requestKey: request.requestKey,
    requestPage: request.page,
    currentConversationId: unref(conversationId),
    currentGeneration: conversationGeneration.value,
    timelineLength: talkList.value.length,
    activeRequestKey: activeHistoryRequestKey,
  });
  if (!decision) return false;
  if (historyRecoveryAttemptedKey === decision.key) return false;
  if (historyRecoveryKey === decision.key) return true;

  historyRecoveryKey = decision.key;
  historyRecoveryTimer = setTimeout(() => {
    historyRecoveryTimer = null;
    if (historyRecoveryKey !== decision.key) return;
    historyRecoveryKey = '';

    const currentDecision = decideHistoryRecovery({
      reason,
      requestConversationId: request.conversationId,
      requestGeneration: request.generation,
      requestKey: request.requestKey,
      requestPage: request.page,
      currentConversationId: unref(conversationId),
      currentGeneration: conversationGeneration.value,
      timelineLength: talkList.value.length,
      activeRequestKey: activeHistoryRequestKey,
    });
    if (!currentDecision || historyRecoveryAttemptedKey === currentDecision.key) return;

    historyRecoveryAttemptedKey = currentDecision.key;
    activeHistoryRequestKey = '';
    ajax.value.page = 1;
    ajax.value.flag = true;
    getHistoryMsg();
  }, 0);
  return true;
}

//获取历史对话
function getHistoryMsg() {
  if (!ajax.value.flag) {
    return;
  }
  // 立即设置为 false 防止重复调用
  ajax.value.flag = false;
  hideLoadTips(false);
  const supportsOperationOutcome = canUseChatOperationOutcome();
  const pageAtHistoryRequest = ajax.value.page;
  const generationAtHistoryRequest = conversationGeneration.value;
  const conversationIdAtHistoryRequest = String(unref(conversationId) || '');
  const historyRequestAttempt = ++historyRequestSequence;
  const historyRequestKey = createHistoryRequestKey({
    conversationId: conversationIdAtHistoryRequest,
    generation: generationAtHistoryRequest,
    page: pageAtHistoryRequest,
    attempt: historyRequestAttempt,
  });
  activeHistoryRequestKey = historyRequestKey;
  const historyRequestData: Record<string, any> = {
    pageNum: pageAtHistoryRequest,
    pageSize: ajax.value.rows,
    conversationId: conversationIdAtHistoryRequest,
  };
  if (supportsOperationOutcome) historyRequestData.supportsOperationOutcome = true;
  const pendingAtHistoryRequest = pendingChatTurn;
  _this.http.get(_this.requestUrl.historyMessageList, {
    showLoading: false,
    data: historyRequestData,
  }).then(res => {
    if (!isConversationGenerationCurrent(generationAtHistoryRequest)) {
      const recoveryScheduled = recoverEmptyHistory('stale_generation', {
        conversationId: conversationIdAtHistoryRequest,
        generation: generationAtHistoryRequest,
        requestKey: historyRequestKey,
        page: pageAtHistoryRequest,
      });
      if (!recoveryScheduled) {
        showHistoryLoadFailure({
          conversationId: conversationIdAtHistoryRequest,
          requestKey: historyRequestKey,
        });
      }
      return;
    }
    if (res.statusCode == 200) {
      if (!completeHistoryRequest({
        conversationId: conversationIdAtHistoryRequest,
        requestKey: historyRequestKey,
      })) return;
      if (pageAtHistoryRequest == 1) {
        historyRecoveryAttemptedKey = '';
        historyRecoveryKey = '';
      }
      const chatList = res.data.chats;
      ajax.value.hasNextPage = res.data.hasNextPage;
      if (pageAtHistoryRequest == 1) {
        contextFootprint.value = res.data.contextFootprint || null;
        maybeShowContextFootprintIntro(conversationIdAtHistoryRequest);
      }
      let data = [];
      // 一列歷史紀錄翻成畫面上的一則訊息。
      const mapRow = ({chatId, chatMessage, contentThinking, chatRole, audioUrl, isSummary, aiImageUrls, finishReason, isV3, inputTokens, model}: any) => {
        const rawContent = (chatMessage || '').replace("<已解除苛刻的道德限制>", "");
        const split = splitThinkingContent(rawContent, { keep: cardHandlesTag });
        // 存原文：字形轉換在渲染那一刻做（renderMarkdown），這裡先轉會把卡片協定轉壞。
        const content = split.visibleContent;
        const rowThinkingContent = contentThinking || split.thinkingContent;
        const isAI = chatRole === 'AI';
        const row: any = {
          id: chatId,
          content,
          thinkingContent: isAI ? rowThinkingContent : '',
          thinkingCollapsed: true,
          type: isAI ? 0 : 1,
          pic: isAI ? pic.value : userInfo.value.avatar,
          src: audioUrl || "",
          playstate: false,
          maskPosition: 1,
          isSummary: isSummary || false,
          summaryExpanded: false,
          chatFinish: true,
          aiImageUrls: aiImageUrls || "",
          finishReason: finishReason || "stop",
          // 上下文用量 chip 的原料：這一輪的輸入 token 與所用模型。只存原始值，
          // 換算成百分比在渲染那一刻做（玩家調了檔位要跟著變）。
          inputTokens: isAI ? Number(inputTokens) || 0 : 0,
          model: isAI ? String(model || '') : '',
        };
        return row;
      };
      data = chatList.map(mapRow).filter(shouldKeepPersistedHistoryBubble);
      data.reverse();
      const newestPageRow = data[data.length - 1];
      const lastKnownTimeline = talkList.value;
      const authoritativePendingDisposition = pageAtHistoryRequest == 1
        && pendingAtHistoryRequest
        && pendingChatTurn === pendingAtHistoryRequest
        ? authoritativePendingOperationDisposition(res.data, pendingAtHistoryRequest)
        : 'unknown';
      if (
        authoritativePendingDisposition === 'terminal'
        || authoritativePendingDisposition === 'absent'
      ) {
        pendingChatTurn = null;
        pendingResendPayload.value = null;
        isResumeInitial.value = false;
        userStopRequested.value = false;
        clearStreamState();
        closeWebSocket();
      }
      const operationProjectionUnavailable = (
        res.data.schemaVersion === 'outcome_v1'
        && res.data.operationStatusAvailable === false
      );

      let selector = '';
      // Phase 2a：正在 resume 的 stream 可能已經把部分 chunk 渲染上 talkList，
      // 若這裡無條件 wipe，會把前半段抹掉。只有在非 stream 中才 wipe（Fix E）。
      const retainedTimeline = retainedTimelineForHistoryResponse({
        page: pageAtHistoryRequest,
        streamActive: isStreamActive.value,
        pendingAtRequest: pendingAtHistoryRequest,
        currentPending: pendingChatTurn,
        timeline: talkList.value,
      });
      knownOperations.value = Array.isArray(res.data.operations) ? res.data.operations : [];
      const mergedTimeline = mergeChatHistoryOperationProjections(
        [...data, ...retainedTimeline],
        {
          schemaVersion: res.data.schemaVersion,
          operations: res.data.operations,
          operationStatusAvailable: res.data.operationStatusAvailable,
        },
        {
          aiPic: pic.value,
          lastKnownMessages: lastKnownTimeline,
          // 伺服器只送階段語意,五語文案在前端挑——使用者換語言之後回看,
          // 看到的是他現在的語言。
          agentPrepTraces: res.data.agentPrepTraces,
          t,
        } as any,
      );
      // 準備軌跡先從伺服器讀回，再用記憶體那份補齊還沒落盤的最後幾步。
      //
      // 兩層都要：伺服器那份撐住「重整之後還在」（記憶體會被整條換掉），
      // 記憶體那份撐住「剛跑完的那一刻」（最後一步可能還沒寫進資料庫）。
      // 只有其中一層的話，各自會漏掉對方涵蓋的那個時刻。
      // **伺服器軌跡的套用已撤回**（2026-08-08）。
      //
      // 兩個獨立的錯：prepTrail 存的是已經本地化好的**字串**，而伺服器送的是
      // {stage, resource, …} 物件（渲染成原始 JSON）；以及停止的輪次沒有 AI 列，
      // 退回掛到使用者那一則會讓 AI 的推理跑進使用者自己的氣泡裡。
      //
      // 重建時要先把 prepStepText 那個讀元件狀態的 computed 抽成純格式化函式，
      // 並且給中斷的輪次一個 AI 側的氣泡。
      talkList.value = carryPrepTrailAcrossHistoryRebuild(mergedTimeline, lastKnownTimeline);
      if (operationProjectionUnavailable && pendingChatTurn) {
        requestPendingOperationReconciliation('history_projection_unavailable');
      }

      if (isStreamActive.value) {
        // history 與 flowNodeStatus 到達順序不固定：anchor 已知時在 merge 後去重；
        // history 先到時則由後續 flowNodeStatus 分支用同一 message id 去重。
        removeResumeHistoryDuplicateByMessageAnchor(currentChatId.value);
        upsertPendingAIBubble({
          id: nextBubbleId(),
          content: replyContent.value || '',
          thinkingContent: thinkingContent.value || '',
          thinkingCollapsed: true,
          type: 0,
          pic: pic.value,
          playstate: false,
          chatLoading: true,
          chatFinish: false,
          maskPosition: 1,
        });
      } else {
        if (talkList.value.length > 0) {
          talkList.value[talkList.value.length - 1].chatFinish = true;
        }
      }

      if (pageAtHistoryRequest == 1) {
        if (talkList.value.length > 0) {
          selector = `#msg-${talkList.value[talkList.value.length - 1].id}`;
        }
      } else {
        selector = newestPageRow ? `#msg-${newestPageRow.id}` : '';
      }

      nextTick(() => {
        if (pageAtHistoryRequest == 1) {
          // 加载第一页时，启用自动滚动并强制滚动到底部
          autoScrollEnabled.value = true;
          isUserAtBottom.value = true;
          scrollToBottom(true);
        } else {
          setPageScrollTo(selector);
        }
        hideLoadTips(true);
      });
    } else {
      const recoveryScheduled = recoverEmptyHistory('transport_error', {
        conversationId: conversationIdAtHistoryRequest,
        generation: generationAtHistoryRequest,
        requestKey: historyRequestKey,
        page: pageAtHistoryRequest,
      });
      if (!recoveryScheduled) {
        showHistoryLoadFailure({
          conversationId: conversationIdAtHistoryRequest,
          requestKey: historyRequestKey,
        });
      }
    }
  }).catch((e) => {
    if (!isConversationGenerationCurrent(generationAtHistoryRequest)) {
      const recoveryScheduled = recoverEmptyHistory('stale_generation', {
        conversationId: conversationIdAtHistoryRequest,
        generation: generationAtHistoryRequest,
        requestKey: historyRequestKey,
        page: pageAtHistoryRequest,
      });
      if (!recoveryScheduled) {
        showHistoryLoadFailure({
          conversationId: conversationIdAtHistoryRequest,
          requestKey: historyRequestKey,
        });
      }
      return;
    }
    const recoveryScheduled = recoverEmptyHistory('transport_error', {
      conversationId: conversationIdAtHistoryRequest,
      generation: generationAtHistoryRequest,
      requestKey: historyRequestKey,
      page: pageAtHistoryRequest,
    });
    if (!recoveryScheduled) {
      showHistoryLoadFailure({
        conversationId: conversationIdAtHistoryRequest,
        requestKey: historyRequestKey,
      });
    }
  });
}

// 隐藏加载提示
function hideLoadTips(flag) {
  if (flag) {
    ajax.loadText = t('main.load_success');
    setTimeout(() => {
      ajax.loading = false;
    }, 300);
  } else {
    ajax.loading = true;
    ajax.loadText = t('main.loading');
  }
}

// 捲底哨兵：列表尾端 1px 元素 + IntersectionObserver。
//
// 由來：開一張新角色卡不會捲到底，返回重進才會。內容是非同步撐高的
// （HTML 內容卡、圖片、XMLV3 一則訊息能渲染出上百個巢狀元件），捲底跑完時
// scrollHeight 還是舊值，捲到的是「當下的底部」。實測開新卡 2.5 秒後
// scrollHeight 才從 556 長到 1240。
//
// 不用「再多排幾個 setTimeout」解：mobile 2026-08-09 那樣修過，撐三天就再壞。
// 內容什麼時候撐完只有版面知道，任何猜測值慢裝置都不夠。改成事件驅動：
// 內容撐高把哨兵擠出容器可視範圍 → observer 立刻通知 → 捲回底。
// 內容長多久跟多久，不長高就零開銷。mobile 走同一套機制。
let scrollAnchorObserver: IntersectionObserver | null = null;
let lastAnchorAbsY = 0;
// 由 applyScrollGate 維護：uni-app scroll-view 真正捲動的是內層 div，
// 外層 .message-list-area 的 scrollTop 恆為 0，不能拿來推算。
let scrollTopNow = 0;

// 捲到底的實作用元素定位，而不是 scrollTop 巨大值——後者會被 clamp 到當時的
// scrollHeight，而那正是「內容還在長高」時算不準的東西。
function scrollAnchorIntoView() {
  const el = document.getElementById('chat-scroll-anchor');
  if (!el) return;
  try {
    el.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior });
  } catch (e) {
    el.scrollIntoView(false);
  }
}

function setupScrollAnchorObserver() {
  if (scrollAnchorObserver) return;
  if (typeof IntersectionObserver === 'undefined') return;
  // desktop 捲的是 scroll-view 容器不是整頁，所以 root 是容器本身。
  const root = document.querySelector('#scrollview');
  const anchor = document.getElementById('chat-scroll-anchor');
  if (!root || !anchor) return;
  scrollAnchorObserver = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    // 哨兵還看得見 = 已經在底部，不需要做事
    if (entry.isIntersecting) return;

    // 哨兵離開視窗有兩種原因，只有一種該捲：
    //   內容撐高   → 內容總高變大 → 該捲
    //   使用者上滑 → 只有 scrollTop 變，總高不變 → **不該捲**
    // 少了這個判準，使用者一往上滑就被拉回底部，而 autoScrollEnabled 要累積
    // 上滑距離才會翻，滑幾 px 就被拉回去永遠累積不到閾值，卡成抖動。
    // 哨兵永遠在列表最末端，所以「它的絕對 Y」就是內容總高。
    const anchorAbsY = scrollTopNow + entry.boundingClientRect.top;
    const grew = anchorAbsY > lastAnchorAbsY + 1;
    lastAnchorAbsY = anchorAbsY;
    if (!grew) return;

    // 該不該捲仍由既有 gate 決定，哨兵只換掉「什麼時候檢查」。
    if (!autoScrollEnabled.value) return;
    scrollAnchorIntoView();
  }, { root, threshold: 0, rootMargin: '0px 0px -8px 0px' });
  scrollAnchorObserver.observe(anchor);
}

function teardownScrollAnchorObserver() {
  if (!scrollAnchorObserver) return;
  try {
    scrollAnchorObserver.disconnect();
  } catch (e) {}
  scrollAnchorObserver = null;
}

//滑动到底部
// force: true 表示强制滚动，false 表示根据 autoScrollEnabled 决定
function scrollToBottom(force = false) {
  // 如果不是强制滚动，且自动滚动被禁用，则不滚动
  if (!force && !autoScrollEnabled.value) {
    return;
  }

  nextTick(() => {
    // uni-app scroll-view 需要通过 scroll-top 属性触发滚动
    scrollTopValue.value = scrollTopValue.value === 9999999999 ? 9999999998 : 9999999999;

    // #ifdef H5
    // H5 环境下额外尝试 DOM 操作
    const compensate = () => {
      // 排程當下該捲，不代表補償跑的時候仍然該捲——使用者可能已經往上滑了。
      // 這個補償原本沒有任何 gate，串流期間每個 chunk 都排一個，使用者一滑就被
      // 無條件拉回底部，於是永遠累積不到 applyScrollGate 的解除閾值，卡成抖動
      // （2026-08-12 回報「對話上下滑動時整個頁面在閃爍」）。
      // force 捲動（送出訊息、開新對話）不受此限，那是使用者自己的動作。
      if (!force && !autoScrollEnabled.value) return;
      // 尝试多个可能的滚动容器
      const selectors = ['#scrollview'];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight;
          break;
        }
      }
    };
    // 只補這一次，等的是「本幀版面落定」。非同步撐高（HTML 內容卡、圖片、
    // XMLV3 巢狀元件）不在這裡處理——那要等多久只有版面知道，猜出來的延遲
    // 慢裝置永遠不夠、快裝置白跑，由 setupScrollAnchorObserver 的哨兵接手。
    setTimeout(compensate, 30);
    // #endif
  });
}

// 设置页面滚动位置
function setPageScrollTo(selector) {
  if (selector) {
    let view = uni.createSelectorQuery().in(_this).select(selector);
    view.boundingClientRect((res) => {
      uni.pageScrollTo({
        scrollTop: res.top - 30, // -30 为多显示出大半个消息的高度，示意上面还有信息。
        duration: 0
      });
    }).exec();
  }
}

//简介展开更多
function expandedClick() {
  isExpanded.value = !unref(isExpanded);
}

function onChatInput(value) {
  content.value = value;
}


function detachGlobalSocketListeners() {
  if (!globalSocketHandlers) return;
  const socketApi = uni as any;
  if (globalSocketHandlers.open && typeof socketApi.offSocketOpen === 'function') {
    socketApi.offSocketOpen(globalSocketHandlers.open);
  }
  if (globalSocketHandlers.message && typeof socketApi.offSocketMessage === 'function') {
    socketApi.offSocketMessage(globalSocketHandlers.message);
  }
  if (globalSocketHandlers.close && typeof socketApi.offSocketClose === 'function') {
    socketApi.offSocketClose(globalSocketHandlers.close);
  }
  if (globalSocketHandlers.error && typeof socketApi.offSocketError === 'function') {
    socketApi.offSocketError(globalSocketHandlers.error);
  }
  globalSocketHandlers = null;
}

function isOwnedSocketCallback(socketToken: number, eventGeneration: number): boolean {
  return chatTransport.isCurrentSocket(socketToken)
    && isConversationGenerationCurrent(eventGeneration);
}

function retireActiveSocketForNextTurn() {
  const staleSocket: any = socket.value;
  if (activeSocketToken) chatTransport.invalidateSocketGeneration(activeSocketToken);
  detachGlobalSocketListeners();
  socket.value = null;
  isConnecting.value = false;
  heartbeatManager.stop();
  sseParser.reset();
  if (!staleSocket) return;
  try {
    if (typeof staleSocket.close === 'function') staleSocket.close({ code: 1000, reason: 'next_turn' });
    else (uni as any).closeSocket({ code: 1000, reason: 'next_turn' });
  } catch (e) {
    console.warn('[Stream] 關閉上一輪連線失敗:', e);
  }
}

function retireActiveSocketAfterVisibleDone(socketToken: number) {
  if (!chatTransport.isCurrentSocket(socketToken)) return;
  // 保留 task 接收 trailing flowResponses/done，但這個 generation 從此不得再送 chat payload。
  chatTransport.retireChatPayload(socketToken);
  finalizePendingChatTurnAfterVisibleDone();
}

function operationKindFromServer(
  kind: unknown,
): 'send' | 'retry_generation' | 'rewrite' | 'continue' {
  const normalized = String(kind || '').trim().toLowerCase();
  if (normalized === 'continue_response') return 'continue';
  if (normalized === 'rewrite_response') return 'rewrite';
  if (normalized === 'retry_generation') return 'retry_generation';
  return 'send';
}

function isReplacementOperationKind(kind: unknown): boolean {
  return kind === 'rewrite' || kind === 'retry_generation';
}

function recordAuthoritativeOperationStatus(input: any) {
  const status = normalizeChatOperationStatus(input);
  if (!status) return null;
  const storedEntry = readLsEntry();
  const existingOperationId = String(
    pendingChatTurn?.operationId || storedEntry?.operationId || '',
  ).trim();
  if (existingOperationId && existingOperationId !== status.operationId) {
    console.warn('[ChatOperation] 忽略不屬於目前回合的 operationStatus');
    return null;
  }
  const expectedClientOperationId = String(
    pendingChatTurn?.clientOperationId
      || pendingChatTurn?.payload?.clientOperationId
      || storedEntry?.clientOperationId
      || storedEntry?.pendingPayload?.clientOperationId
      || '',
  ).trim();
  if (
    !existingOperationId
    && expectedClientOperationId
    && status.clientOperationId !== expectedClientOperationId
  ) {
    console.warn('[ChatOperation] 忽略 clientOperationId 不相符的 operationStatus');
    return null;
  }
  const currentConversationId = String(unref(conversationId) || '');
  if (status.conversationId && status.conversationId !== currentConversationId) {
    console.warn('[ChatOperation] 忽略不屬於目前對話的 operationStatus');
    return null;
  }
  if (!pendingChatTurn && !existingOperationId) return null;
  if (!shouldApplyOperationStatus({
    operationId: existingOperationId,
    operationState: pendingChatTurn?.operationState || storedEntry?.operationState,
    operationVersion: pendingChatTurn?.operationVersion ?? storedEntry?.operationVersion,
  }, status)) {
    console.warn('[ChatOperation] 忽略較舊或會讓 terminal 回退的 operationStatus');
    return null;
  }

  if (pendingChatTurn) {
    // operationStatus 本身就是 server durable Begin/進度證明。它可能早於
    // accepted/streamMeta 抵達；必須先解除 accepted watchdog，否則緊接的
    // socket close 會把已由 server 擁有的候選誤當成「完全未送達」刪掉。
    chatTransport.noteServerStreamProgress(pendingChatTurn, 'durable_operation');
    pendingChatTurn.operationId = status.operationId;
    pendingChatTurn.operationState = status.state;
    // 觀測時間戳只在這裡蓋——這是狀態唯一的套用點，而且已經過了
    // shouldApplyChatOperationStatus 的過期／倒退守衛。蓋在守衛之前的話，
    // 一筆被拒絕的舊狀態也會把信任窗刷新。
    pendingChatTurn.operationStateObservedAt = Date.now();
    if (status.version !== undefined) pendingChatTurn.operationVersion = status.version;
    pendingChatTurn.serverOperationKind = status.kind;
    pendingChatTurn.operationKind = operationKindFromServer(status.kind);
    if (status.assistantChatId) pendingChatTurn.assistantChatId = status.assistantChatId;
    if (status.userChatId) pendingChatTurn.userChatId = status.userChatId;
    if (status.targetChatId) pendingChatTurn.targetChatId = status.targetChatId;
    if (status.sourceChatId) pendingChatTurn.sourceChatId = status.sourceChatId;
    if (status.checkpointChatId) pendingChatTurn.checkpointChatId = status.checkpointChatId;
    if (status.parentOperationId) pendingChatTurn.parentOperationId = status.parentOperationId;
    if (status.sourceOperationId) pendingChatTurn.sourceOperationId = status.sourceOperationId;
    if (status.outputDisposition) pendingChatTurn.outputDisposition = status.outputDisposition;
    if (status.finishReason) pendingChatTurn.finishReason = status.finishReason;
    if (status.allowedActions) pendingChatTurn.allowedActions = status.allowedActions;
    if (status.reasonCode) pendingChatTurn.reasonCode = status.reasonCode;
    if (status.messageKey) pendingChatTurn.messageKey = status.messageKey;
  }

  const operationBubble = pendingChatTurn?.aiBubbleId == null
    ? null
    : findOperationCandidate(talkList.value, pendingChatTurn.aiBubbleId);
  if (operationBubble) {
    operationBubble.operationProjectionCapable = true;
    operationBubble.operationId = status.operationId;
    operationBubble.operationKind = operationKindFromServer(status.kind);
    operationBubble.serverOperationKind = status.kind;
    operationBubble.operationState = status.state;
    if (status.version !== undefined) operationBubble.operationVersion = status.version;
    if (status.assistantChatId) {
      operationBubble.assistantChatId = status.assistantChatId;
      operationBubble.chatId = status.assistantChatId;
    }
    if (status.userChatId) operationBubble.userChatId = status.userChatId;
    if (status.targetChatId) operationBubble.targetChatId = status.targetChatId;
    if (status.sourceChatId) operationBubble.sourceChatId = status.sourceChatId;
    if (status.checkpointChatId) operationBubble.checkpointChatId = status.checkpointChatId;
    if (status.parentOperationId) operationBubble.parentOperationId = status.parentOperationId;
    if (status.sourceOperationId) operationBubble.sourceOperationId = status.sourceOperationId;
    if (status.outputDisposition) operationBubble.outputDisposition = status.outputDisposition;
    operationBubble.allowedActions = status.allowedActions ? [...status.allowedActions] : [];
    if (status.reasonCode) operationBubble.reasonCode = status.reasonCode;
    if (status.messageKey) operationBubble.messageKey = status.messageKey;
  }

  const currentEntry = storedEntry || {
    version: STREAM_ENTRY_VERSION,
    accepted: pendingChatTurn?.accepted === true,
    clientOperationId: pendingChatTurn?.clientOperationId
      || pendingChatTurn?.payload?.clientOperationId
      || '',
    updatedAt: Date.now(),
  };
  writeLsEntry(mergeOperationStatusIntoStreamEntry(currentEntry, status, Date.now()));
  return status;
}

function refreshHistoryAfterAuthoritativeOperation(status: any) {
  const pending = pendingChatTurn;
  const operationBubble = pending?.aiBubbleId == null
    ? null
    : findOperationCandidate(talkList.value, pending.aiBubbleId);

  if (operationBubble) {
    operationBubble.operationProjectionCapable = true;
    operationBubble.chatLoading = false;
    operationBubble.chatFinish = true;
    operationBubble.operationState = status.state;
    operationBubble.operationKind = operationKindFromServer(status.kind);
    operationBubble.serverOperationKind = status.kind;
    if (status.version !== undefined) operationBubble.operationVersion = status.version;
    if (status.assistantChatId) {
      operationBubble.assistantChatId = status.assistantChatId;
      operationBubble.chatId = status.assistantChatId;
    }
    if (status.userChatId) operationBubble.userChatId = status.userChatId;
    if (status.targetChatId) operationBubble.targetChatId = status.targetChatId;
    if (status.sourceChatId) operationBubble.sourceChatId = status.sourceChatId;
    if (status.checkpointChatId) operationBubble.checkpointChatId = status.checkpointChatId;
    if (status.parentOperationId) operationBubble.parentOperationId = status.parentOperationId;
    if (status.sourceOperationId) operationBubble.sourceOperationId = status.sourceOperationId;
    if (status.outputDisposition) operationBubble.outputDisposition = status.outputDisposition;
    operationBubble.allowedActions = status.allowedActions ? [...status.allowedActions] : [];
    if (status.reasonCode) operationBubble.reasonCode = status.reasonCode;
    if (status.messageKey) operationBubble.messageKey = status.messageKey;
    operationBubble.finishReason = projectionFinishReason(
      status,
      operationBubble.finishReason,
      operationBubble.thinkingContent,
    );
  }

  if (
    pending
    && !status.assistantChatId
    && (status.state === 'failed_retryable' || status.state === 'failed_terminal')
  ) {
    talkList.value = settleZeroOutputTerminalFailure(talkList.value, pending);
    talkList.value = mergeChatHistoryOperationProjections(
      talkList.value,
      {
        schemaVersion: 'outcome_v1',
        operationStatusAvailable: true,
        operations: [status],
      },
      {
        aiPic: pic.value,
        // 即時停止這條路沒有 agentPrepTraces(那是載入歷史才有的欄位),
        // 用畫面上正在跑的流水帳把中斷卡撐起來。少了它,這一列會是空的,
        // 使用者要重新整理才看得到自己剛才的進度。
        // 準備跑完時 prepSteps 會被搬進 pendingPrepTrail 並清空,所以「正文開始
        // 之後才按停止」這條路上前者是空的——只看它的話,這一列拿不到軌跡,
        // 於是退化成一顆系統藥丸,而不是 mobile 那樣的 AI 氣泡加準備過程卡
        // (owner 2026-08-08 在 desktop 拍到)。兩份都要看。
        agentPrepTrail: prepSteps.value.length
          ? prepSteps.value.slice()
          : pendingPrepTrail.value.slice(),
      } as any,
    );
  } else if (
    pending
    && status.assistantChatId
    && operationBubble
    && hasRenderableAssistantOutput(operationBubble.content, operationBubble.thinkingContent)
  ) {
    commitPendingChatOperationAfterVisibleDone();
  }

  // 權威終結接手 [DONE] 的回合清理。
  //
  // server 在終結 operationStatus 之後才寫 answer [DONE]
  // （settle → emit：chat_operation_settlement.go:590-610；[DONE]：
  // character_router.go:9979 / :14064 / :14492，每個 provider 都是這個順序）。
  // 下面的 bumpConversationGeneration() 會讓 isOwnedSocketCallback 的
  // generation 閘立刻失效，於是同一批 parse 出來的 [DONE] 被靜默丟棄——
  // 而 [DONE] 分支（chat-sse-dispatch.ts:433-441）是回合結束清理的唯一擁有者。
  // 對每個 capable client 的成功回合這都是必然發生，不是偶發競賽，所以這裡
  // 必須自己補完，否則 streaming 狀態會跨回合殘留（使用者症狀：思考鏈顯示
  // 上一回合的內容、上一回合的 finishReason 標到下一回合的氣泡）。
  //
  // 只複製幂等的賦空值。playSound / checkQuotaExhaustion /
  // triggerReadinessFetch 有真副作用，legacy lane 仍會走 [DONE]，
  // 在這裡重做會變成播兩次語音、彈兩次額度提示。
  lastFinishReason.value = '';
  tempContent.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  pendingMessageMeta.value = null;
  if (currentChatId.value) {
    try { clearStreamCache(String(currentChatId.value) + ':0'); } catch (_) {}
  }
  pendingChatTurn = null;
  pendingResendPayload.value = null;
  isResumeInitial.value = false;
  userStopRequested.value = false;
  clearStreamState();
  removeOrphanPlaceholder();
  closeWebSocket();
  // A pre-terminal page-one request may still be in flight for this same
  // conversation. Give the authoritative reload a new history identity so
  // that older empty/snapshot responses cannot overwrite its terminal rows.
  bumpConversationGeneration();
  ajax.value.flag = true;
  ajax.value.page = 1;
  try {
    getHistoryMsg();
  } catch (error) {
    console.error('[ChatOperation] 權威 terminal 後重抓 history 失敗:', error);
  }
}

function handleOperationStatusEvent(input: any) {
  const status = recordAuthoritativeOperationStatus(input);
  if (!status) return;
  if (isChatOperationTerminal(status)) {
    refreshHistoryAfterAuthoritativeOperation(status);
  }
}

// 輪詢耗盡不代表結果不存在——多半只是操作 id 還沒建立而模型正在生成。
// 進入慢等待（維持等待指示器 + 背景對帳），不要換容器。
function recoverOperationStatusPollingExhausted(operationId: string, reason: string): boolean {
  const storedOperationId = String(readLsEntry()?.operationId || '').trim();
  const pendingOperationId = String(pendingChatTurn?.operationId || '').trim();
  if (
    !operationId
    || (pendingOperationId && pendingOperationId !== operationId)
    || (!pendingOperationId && storedOperationId !== operationId)
  ) return false;

  operationStatusRequestKey = '';
  if (operationStatusSlowNoticeKey !== operationId) {
    operationStatusSlowNoticeKey = operationId;
    announceOutcomeUnconfirmed();
    console.warn(`[ChatOperation] ${reason} fast polling exhausted; durable ownership retained`);
  }
  if (operationStatusPollScheduler.scheduleSlow(() => {
    requestAuthoritativeOperationReconciliation(reason);
  })) return true;
  return operationStatusPollScheduler.hasPending();
}

function scheduleOperationStatusReconciliation(reason: string, operationId: string): boolean {
  if (operationStatusPollScheduler.schedule(() => {
    requestAuthoritativeOperationReconciliation(reason);
  })) return true;
  if (operationStatusPollScheduler.isExhausted()) {
    return recoverOperationStatusPollingExhausted(operationId, reason);
  }
  return operationStatusPollScheduler.hasPending();
}

// I-1（No dead end）：requestAuthoritativeOperationReconciliation 讀回權威狀態後
// 確認非 terminal 時呼叫。放在 scheduleOperationStatusReconciliation 之後——
// 12 秒快輪詢耗盡後的 recoverOperationStatusPollingExhausted 仍然只轉慢輪詢，
// 不放手；只有這裡（5 分鐘可見結果上界）才是誠實放手的地方。
function releaseExpiredChatOperationOwnership(recorded: any, reason: string): void {
  const pending = pendingChatTurn;
  const operationId = String(
    recorded?.operationId || pending?.operationId || readLsEntry()?.operationId || '',
  ).trim();
  // 伺服器最近說「還在跑」就不放手。權威在後端，碼表只是問不到時的退路。
  // 守衛放在這裡而不是每一個判定點：放手一律走這條路，堵住這裡就堵住全部，
  // 將來多一個判定點也不會漏。
  const liveState = recorded ? recorded.state : pending?.operationState;
  const liveObservedAt = recorded ? Date.now() : pending?.operationStateObservedAt;
  if (isChatOperationBackendStillWorking({
    state: liveState,
    observedAt: liveObservedAt,
    now: Date.now(),
  })) {
    // 繼續問。不重排的話這一輪會停在沒有人推進的狀態。
    scheduleOperationStatusReconciliation(reason, operationId);
    return;
  }
  const elapsedMs = Math.max(0, Date.now() - (Number(pending?.startedAt) || Date.now()));
  // 去重判斷必須在 clearStreamState() 之前定案：這是同一次呼叫，先讀後寫才有
  // 意義（下面的清理步驟不會再動這個旗標）。
  const shouldNotify = operationTimedOutNoticeKey !== (operationId || reason);
  if (shouldNotify) operationTimedOutNoticeKey = operationId || reason;
  operationStatusPollScheduler.cancel();
  discardPendingChatOperationCandidate(pending);
  pendingChatTurn = null;
  pendingResendPayload.value = null;
  clearStreamState();
  removeOrphanPlaceholder();
  closeWebSocket();
  bumpConversationGeneration();
  ajax.value.flag = true;
  ajax.value.page = 1;
  try {
    getHistoryMsg();
  } catch (error) {
    console.error('[ChatOperation] 逾時放手後重抓歷史訊息失敗:', error);
  }
  if (shouldNotify) message.warning(t('chat.operationTimedOut'));
  console.warn(
    `[ChatOperation] ${reason} 已超過使用者可見結果的上界（operationId=${operationId || 'unknown'}, elapsed=${elapsedMs}ms），停止等待並放手`,
  );
}

function schedulePendingOperationIdentityReconciliation(
  pending: PendingChatTurn,
  socketToken: number,
  reason: string,
): boolean {
  const clientOperationId = String(
    pending.clientOperationId || pending.payload?.clientOperationId || '',
  ).trim();
  if (!clientOperationId || pendingChatTurn !== pending) return false;
  // I-1（No dead end）：與 operationStatusPollScheduler 的輪詢節奏解耦的絕對
  // 時間上界。scheduleSlow 在快輪詢窗口耗盡後只會轉成 60 秒一輪的慢速對賬，
  // 永遠不會自己放手；這裡與 schedulePendingBackwardOperation／
  // decideStreamResume 共用同一純函式與同一 5 分鐘上界，基準用
  // pending.startedAt（拿不到可信基準時純函式保守回 false，維持既有輪詢
  // 行為）。
  if (isChatOperationVisibleOutcomeExpired({
    localStartedAt: pending.startedAt,
    now: Date.now(),
    agentTurn: resolveAgentTurnForOwnership(),
  })) {
    releaseExpiredChatOperationOwnership(null, reason);
    return false;
  }
  if (operationStatusPollScheduler.schedule(() => {
    probePendingTurnAfterDurableAckTimeout(socketToken, reason);
  })) return true;
  if (operationStatusPollScheduler.isExhausted()) {
    if (operationStatusSlowNoticeKey !== clientOperationId) {
      operationStatusSlowNoticeKey = clientOperationId;
      announceOutcomeUnconfirmed();
      console.warn(`[ChatOperation] ${reason} exact identity probe moved to slow reconciliation`);
    }
    if (operationStatusPollScheduler.scheduleSlow(() => {
      probePendingTurnAfterDurableAckTimeout(socketToken, reason);
    })) return true;
  }
  return operationStatusPollScheduler.hasPending();
}

function requestAuthoritativeOperationReconciliation(
  reason: string,
): boolean {
  if (!canUseChatOperationOutcome()) return false;
  const stored = readLsEntry();
  const operationId = String(
    pendingChatTurn?.operationId || stored?.operationId || '',
  ).trim();
  if (!operationId) return false;
  if (
    operationStatusRequestKey === operationId
    || operationStatusPollScheduler.hasPending()
  ) return true;

  const capturedGeneration = conversationGeneration.value;
  const capturedConversationId = String(unref(conversationId) || '');
  operationStatusRequestKey = operationId;
  const endpoint = `${_this.requestUrl.chatOperationStatus}/${encodeURIComponent(operationId)}`;
  _this.http.get(endpoint, { showLoading: false }).then((res: any) => {
    operationStatusRequestKey = '';
    if (
      !isConversationGenerationCurrent(capturedGeneration)
      || String(unref(conversationId) || '') !== capturedConversationId
    ) {
      return;
    }
    const status = normalizeChatOperationStatus(res?.data);
    if (!status || status.operationId !== operationId) {
      // I-1：查無此 operation／回傳身分不符——我們不知道結果，但已經等了
      // 五分鐘還不知道，繼續扣著使用者更糟。沒有可信的 acceptedAt，只能用
      // 本機 startedAt 當退路；拿不到基準時純函式本身會保守回 false。
      if (isChatOperationVisibleOutcomeExpired({
        localStartedAt: pendingChatTurn?.startedAt,
        now: Date.now(),
        agentTurn: resolveAgentTurnForOwnership(),
      })) {
        releaseExpiredChatOperationOwnership(null, reason);
        return;
      }
      scheduleOperationStatusReconciliation(reason, operationId);
      return;
    }
    if (status.conversationId && status.conversationId !== capturedConversationId) {
      if (isChatOperationVisibleOutcomeExpired({
        localStartedAt: pendingChatTurn?.startedAt,
        now: Date.now(),
        agentTurn: resolveAgentTurnForOwnership(),
      })) {
        releaseExpiredChatOperationOwnership(null, reason);
        return;
      }
      scheduleOperationStatusReconciliation(reason, operationId);
      return;
    }
    const recorded = recordAuthoritativeOperationStatus(status);
    if (!recorded) {
      if (isChatOperationVisibleOutcomeExpired({
        localStartedAt: pendingChatTurn?.startedAt,
        now: Date.now(),
        agentTurn: resolveAgentTurnForOwnership(),
      })) {
        releaseExpiredChatOperationOwnership(null, reason);
        return;
      }
      scheduleOperationStatusReconciliation(reason, operationId);
      return;
    }
    if (isChatOperationTerminal(recorded)) {
      operationStatusPollScheduler.cancel();
      refreshHistoryAfterAuthoritativeOperation(recorded);
      return;
    }
    if (isChatOperationVisibleOutcomeExpired({
      acceptedAt: recorded.acceptedAt,
      localStartedAt: pendingChatTurn?.startedAt,
      now: Date.now(),
      agentTurn: resolveAgentTurnForOwnership(recorded),
    })) {
      releaseExpiredChatOperationOwnership(recorded, reason);
      return;
    }
    scheduleOperationStatusReconciliation(reason, operationId);
  }).catch((error: any) => {
    operationStatusRequestKey = '';
    if (
      !isConversationGenerationCurrent(capturedGeneration)
      || String(unref(conversationId) || '') !== capturedConversationId
    ) {
      return;
    }
    console.warn(`[ChatOperation] ${reason} status 查詢失敗，保留本地回合等待下次恢復`, error);
    // I-1：查詢本身失敗（網路／伺服器錯誤）跟「伺服器說還沒好」同樣是我們
    // 不知道結果，但已經等了五分鐘還不知道時，一樣要誠實放手而不是永遠重試。
    if (isChatOperationVisibleOutcomeExpired({
      localStartedAt: pendingChatTurn?.startedAt,
      now: Date.now(),
      agentTurn: resolveAgentTurnForOwnership(),
    })) {
      releaseExpiredChatOperationOwnership(null, reason);
      return;
    }
    scheduleOperationStatusReconciliation(reason, operationId);
  });
  return true;
}

function requestPendingOperationReconciliation(reason: string): boolean {
  if (!canUseChatOperationOutcome()) {
    if (pendingChatTurn) pendingChatTurn.operationOutcomeCapability = 'legacy';
    return false;
  }
  if (requestAuthoritativeOperationReconciliation(reason)) return true;
  const pending = pendingChatTurn;
  if (
    !pending
    || pending.operationOutcomeCapability === 'legacy'
    || (
      pending.payload?.supportsOperationOutcome !== true
      && !String(pending.clientOperationId || '').trim()
    )
  ) return false;
  probePendingTurnAfterDurableAckTimeout(pending.socketToken || 0, reason);
  return true;
}

function resumePendingOperationReconciliationOnForeground() {
  const currentConversationId = String(unref(conversationId) || '');
  if (!currentConversationId) return;
  const backward = readPendingBackwardOperation(currentConversationId);
  if (backward) {
    cancelPendingBackwardRetryTimer();
    rollbackPending.value = true;
    postPendingBackwardOperation(backward, false);
    return;
  }
  const stored = readLsEntry();
  const hasPersistedIdentity = !!String(
    stored?.operationId
      || stored?.clientOperationId
      || stored?.pendingPayload?.clientOperationId
      || '',
  ).trim();
  if (!hasPersistedIdentity) return;
  operationStatusPollScheduler.cancel();
  if (!requestPendingOperationReconciliation('foreground')) {
    tryResumeOnMount();
  }
}

function beginPendingChatTurn(input: PendingChatTurn) {
  const operationKind = input.operationKind || operationKindFromPayload(input.payload);
  const rewriteSnapshot = isReplacementOperationKind(operationKind)
    ? input.rewriteSnapshot
      || pendingRewriteSnapshot
      || createRewriteSnapshotForTarget(talkList.value, input.payload?.chatId)
    : null;
  pendingChatTurn = {
    ...input,
    operationKind,
    rewriteSnapshot,
    clientOperationId: input.clientOperationId || input.payload?.clientOperationId || '',
    startedAt: input.startedAt || Date.now(),
    accepted: input.accepted === true,
    expectsAccepted: input.expectsAccepted !== false,
    consumedRetryCount: 0,
  };
  const operationBubble = talkList.value.find(item =>
    item && String(item.id || '') === String(input.aiBubbleId || '')
  );
  if (operationBubble) operationBubble.operationKind = operationKind;
  pendingRewriteSnapshot = null;
}

function discardPendingChatOperationCandidate(pending = pendingChatTurn): boolean {
  if (!pending || !pending.operationKind || pending.operationKind === 'send') return false;
  if (isReplacementOperationKind(pending.operationKind)) {
    talkList.value = restoreRewriteCandidate(
      talkList.value,
      pending.rewriteSnapshot,
      pending.aiBubbleId,
    );
  } else {
    talkList.value = removeOperationCandidate(talkList.value, pending.aiBubbleId);
  }
  removeOrphanPlaceholder();
  if (pending === pendingChatTurn) pendingChatTurn = null;
  pendingRewriteSnapshot = null;
  rewrite.value = false;
  contine.value = false;
  rewriteTargetChatId.value = '';
  continueTargetChatId.value = '';
  tempContent.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  lastFinishReason.value = '';
  pendingMessageMeta.value = null;
  return true;
}

function discardStoppedOperationWithoutDurableTerminal(): boolean {
  const pending = pendingChatTurn;
  const awaitsDurableTerminal = isReplacementOperationKind(pending?.operationKind)
    || pending?.operationKind === 'continue';
  if (!userStopRequested.value || !awaitsDurableTerminal) return false;
  const discarded = discardPendingChatOperationCandidate(pending);
  userStopRequested.value = false;
  return discarded;
}

function commitPendingChatOperationAfterVisibleDone(): boolean {
  const pending = pendingChatTurn;
  if (!pending?.aiBubbleId) return false;
  if (isReplacementOperationKind(pending.operationKind)) {
    const result = commitRewriteCandidate(
      talkList.value,
      pending.rewriteSnapshot,
      pending.aiBubbleId,
    );
    if (!result.committed) {
      if (result.reason === 'ineligible_output') {
        talkList.value = restoreRewriteCandidate(
          talkList.value,
          pending.rewriteSnapshot,
          pending.aiBubbleId,
        );
        return false;
      }
      console.error('[ChatOperation] durable Rewrite winner lacks a recoverable local snapshot; refreshing authoritative history');
      clearStreamState();
      ajax.value.flag = true;
      ajax.value.page = 1;
      getHistoryMsg();
      return false;
    }
    talkList.value = result.messages;
    return true;
  }
  if (
    pending.operationKind === 'continue'
    && !isOperationCandidateAdoptable(talkList.value, pending.aiBubbleId)
  ) {
    talkList.value = removeOperationCandidate(talkList.value, pending.aiBubbleId);
    return false;
  }
  talkList.value = clearOperationCandidateMarker(talkList.value, pending.aiBubbleId);
  return true;
}

function recoverPendingChatTurnBeforeAccepted(showNotice = true): boolean {
  const pending = pendingChatTurn;
  if (!chatTransport.shouldRecoverTransientTurn(pending)) return false;

  const transientBubbleIds = new Set(
    [pending.userBubbleId, pending.aiBubbleId].filter(id => id !== undefined && id !== null && id !== '')
  );
  talkList.value = talkList.value.filter(item => !transientBubbleIds.has(item && item.id));
  if (!content.value && pending.draft) content.value = pending.draft;
  if (pending.socketToken) {
    messageQueue.value = messageQueue.value.filter(entry => entry && entry.socketToken !== pending.socketToken);
  }
  pendingChatTurn = null;
  tempContent.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  clearStreamState();
  // 工單 #41-F1：回合送出失敗復原時一併清掉 rewrite/contine，避免殘留旗標
  // 污染使用者下一次新句 payload（誤判成重説或繼續）。此函式是失敗路徑的
  // 共用入口（含 sendError 提前 return 的那一條），修這裡一次生效。
  rewrite.value = false;
  contine.value = false;
  const explicitErrorType = String(pending.preAdmissionErrorType || '').trim();
  if (explicitErrorType) {
    // 伺服器已經明確講了原因（免費次數用完、點數不足這類），這種時候只彈一句
    // 「訊息未送出」等於把一個明確的答案顯示成斷線——使用者分不出是我們壞了
    // 還是他不能用。把原話印進錯誤氣泡，草稿仍然留在輸入框讓他換個模型再送。
    appendChatErrorBubble(explicitErrorType, resolveChatErrorMessage(explicitErrorType, t));
  } else if (showNotice) {
    message.warning(t('chat.messageNotSentDraftSaved'));
  }
  return true;
}

function markPendingChatTurnAccepted(eventData: any) {
  const expectedClientOperationId = String(
    pendingChatTurn?.clientOperationId || pendingChatTurn?.payload?.clientOperationId || '',
  ).trim();
  const eventClientOperationId = String(eventData?.clientOperationId || '').trim();
  if (
    expectedClientOperationId
    && eventClientOperationId
    && eventClientOperationId !== expectedClientOperationId
  ) {
    console.warn('[ChatOperation] 忽略 clientOperationId 不相符的 accepted');
    return;
  }
  if (eventData?.operationId && eventClientOperationId === expectedClientOperationId) {
    recordAuthoritativeOperationStatus({
      ...eventData,
      state: eventData.state || 'accepted',
    });
  }
  const localUserBubbleId = pendingChatTurn?.userBubbleId;
  const acceptedId = chatTransport.markAccepted(pendingChatTurn, eventData);
  pendingResendPayload.value = null;
  persistAcceptedStreamState();
  if (pendingChatTurn) {
    pendingChatTurn.draft = '';
    const shouldKeepPendingPayloadForExactProbe =
      !String(pendingChatTurn.operationId || '').trim()
      && pendingChatTurn.operationOutcomeCapability !== 'legacy'
      && pendingChatTurn.payload?.supportsOperationOutcome === true
      && !!String(
        pendingChatTurn.clientOperationId || pendingChatTurn.payload?.clientOperationId || '',
      ).trim();
    if (!shouldKeepPendingPayloadForExactProbe) pendingChatTurn.payload = null;
  }
  if (shouldProbeExactOperationIdentity(pendingChatTurn)) {
    probePendingTurnAfterDurableAckTimeout(
      pendingChatTurn?.socketToken || 0,
      'accepted_without_operation',
    );
  }
  if (localUserBubbleId === undefined || localUserBubbleId === null) return;
  const userBubble = talkList.value.find(item => item && item.id === localUserBubbleId);
  if (!userBubble) return;
  userBubble.transportTransient = false;
  userBubble.serverAccepted = true;
  if (acceptedId) userBubble.chatId = acceptedId;
}

function finalizePendingChatTurnAfterVisibleDone() {
  if (!pendingChatTurn) return;
  if (pendingChatTurn.expectsAccepted !== false && pendingChatTurn.accepted !== true && pendingChatTurn.serverProgress !== true) return;
  const userBubble = talkList.value.find(item => item && item.id === pendingChatTurn?.userBubbleId);
  if (userBubble) {
    // 只有 accepted(有真 chatId)才解除 transient;serverProgress-only 保持
    // transient,避免重說 fallback 到本地 id 撞 server UUID(見 mobile 同註)。
    if (pendingChatTurn.accepted === true) {
      userBubble.transportTransient = false;
      userBubble.serverAccepted = true;
    }
  }
  pendingChatTurn = null;
}

function shouldRewriteUserTurn(userBubble: any): boolean {
  return chatTransport.shouldRewriteUserTurn(userBubble);
}

function recoverStoredStreamDraft(decision: any) {
  if (decision?.draft && !content.value) content.value = decision.draft;
  pendingChatTurn = null;
  clearStreamState();
  removeOrphanPlaceholder();
  message.warning(t('chat.messageNotSentDraftSaved'));
}

function recoverPendingTurnAfterMissingDurableAck(
  capturedPending: PendingChatTurn | null,
  storedDraft = '',
): boolean {
  if (!capturedPending || pendingChatTurn !== capturedPending) return false;
  // 等久了先不換容器、不宣告失聯：那個「失聯」多半是假的（後台還在生成），
  // 而等待指示器已經在說「還在處理」。換一句安撫的文案，讓系統自己去對帳。
  //
  // 但**必須有界限**——不然對帳一直沒結果時，用戶會看著文案永遠輪替下去。
  // 產品邊界要求五分鐘內必須有結果（I-1），到期仍無結論才走下面的恢復路徑。
  //
  // 改在這個單一匯流點而不是逐個呼叫點，是為了不漏掉任何一條逾時路徑。
  if (!slowWaitActive.value) {
    enterSlowWait(capturedPending, storedDraft);
    return true;
  }
  if (discardPendingChatOperationCandidate(capturedPending)) {
    clearStreamState();
    announceOutcomeUnconfirmed();
    closeWebSocket();
    return true;
  }
  const recovered = recoverPendingChatTurnBeforeAccepted();
  if (!recovered) recoverStoredStreamDraft({ draft: storedDraft });
  closeWebSocket();
  return true;
}

function settleConfirmedPreAdmissionFailure(
  capturedPending: PendingChatTurn,
  storedDraft = '',
): boolean {
  if (!capturedPending || pendingChatTurn !== capturedPending) return false;
  const errorType = String(
    capturedPending.preAdmissionErrorType || 'connection_error',
  ).trim();
  const errorMessage = resolveChatErrorMessage(errorType, t);
  const operationProjection = createPreAdmissionOperationErrorProjection(
    talkList.value,
    capturedPending,
  ) || {};
  operationStatusPollScheduler.cancel();
  operationStatusRequestKey = '';
  durableAckProbeKey = '';

  // accepted 可以早於 operation Begin。此時 USER row 已由 server 接收，
  // 不能把原文恢復成「未送出」草稿；只移除未持久化 AI 候選並保留 USER。
  if (capturedPending.accepted === true) {
    discardPendingChatOperationCandidate(capturedPending);
    if (pendingChatTurn === capturedPending) pendingChatTurn = null;
    pendingResendPayload.value = null;
    clearStreamState();
    removeOrphanPlaceholder();
    appendChatErrorBubble(errorType, errorMessage, operationProjection);
    closeWebSocket();
    return true;
  }

  const recovered = recoverPendingChatTurnBeforeAccepted(false);
  if (!recovered) {
    if (storedDraft && !content.value) content.value = storedDraft;
    pendingChatTurn = null;
    clearStreamState();
    removeOrphanPlaceholder();
  }
  appendChatErrorBubble(errorType, errorMessage, operationProjection);
  closeWebSocket();
  return true;
}

function settleFrozenLegacyStreamError(
  capturedPending: PendingChatTurn,
): boolean {
  if (!capturedPending || pendingChatTurn !== capturedPending) return false;
  const errorType = consumeFrozenPendingStreamError(capturedPending);
  if (!errorType) return false;

  operationStatusPollScheduler.cancel();
  operationStatusRequestKey = '';
  durableAckProbeKey = '';
  pendingResendPayload.value = null;
  capturedPending.operationOutcomeCapability = 'legacy';
  const errorMsg = resolveChatErrorMessage(errorType, t);

  if (unref(isCompacting)) {
    clearCompactWatchdog();
    store.commit('setIsCompacting', false);
    store.commit('setCompactStatus', '');
  }

  // Rewrite/Continue keep their canonical source and remove only the owned
  // provisional candidate. The frozen legacy error is surfaced once; clearing
  // stream state before close removes both localStorage replay and noActive
  // resend guards.
  if (discardPendingChatOperationCandidate(capturedPending)) {
    clearStreamState();
    appendChatErrorBubble(errorType, errorMsg);
    closeWebSocket();
    return true;
  }

  pendingChatTurn = null;
  if (hasRenderableAssistantOutput(replyContent.value, thinkingContent.value)) {
    const last = talkList.value[talkList.value.length - 1];
    const bubbleId = unref(currentChatId)
      || capturedPending.aiBubbleId
      || (last && last.type === 0 && last.chatFinish !== true ? last.id : nextBubbleId());
    upsertPendingAIBubble({
      id: bubbleId,
      content: replyContent.value,
      thinkingContent: thinkingContent.value,
      thinkingCollapsed: true,
      type: 0,
      pic: pic.value,
      chatLoading: false,
      chatFinish: true,
      maskPosition: 1,
      finishReason: resolveChatErrorPresentation(errorType, t).finishReason || 'error',
    });
    rewrite.value = false;
    contine.value = false;
    lastFinishReason.value = '';
    tempContent.value = '';
    replyContent.value = '';
    thinkingContent.value = '';
    pendingMessageMeta.value = null;
  } else if (errorType === 'conversation_stale') {
    sendError(0, errorMsg, 'conversation_stale', errorType);
  } else {
    sendError(0, errorMsg, errorType === 'content_filter' ? 'content_filter_input' : '', errorType);
  }

  pendingResendPayload.value = null;
  clearStreamState();
  removeOrphanPlaceholder();
  closeWebSocket();
  return true;
}

function probePendingTurnAfterDurableAckTimeout(
  socketToken: number,
  reason = 'durable_ack_timeout',
) {
  const capturedPending = pendingChatTurn;
  if (
    !capturedPending
    || capturedPending.socketToken !== socketToken
    || !shouldProbeExactOperationIdentity(capturedPending)
  ) return;
  if (!canUseChatOperationOutcome()) {
    capturedPending.operationOutcomeCapability = 'legacy';
    if (settleFrozenLegacyStreamError(capturedPending)) return;
    if (capturedPending.streamMetaReceived === true) {
      chatTransport.noteServerStreamProgress(capturedPending, 'legacy_server');
      return;
    }
    recoverPendingTurnAfterMissingDurableAck(
      capturedPending,
      capturedPending.draft || readLsEntry()?.pendingPayload?.message || '',
    );
    return;
  }

  const capturedGeneration = conversationGeneration.value;
  const capturedConversationId = String(unref(conversationId) || '');
  const storedDraft = capturedPending.draft || readLsEntry()?.pendingPayload?.message || '';
  const probeKey = `${socketToken}:${capturedPending.clientOperationId || capturedPending.startedAt || ''}`;
  if (durableAckProbeKey === probeKey) return;
  durableAckProbeKey = probeKey;

  const isCurrentProbe = () =>
    durableAckProbeKey === probeKey
    && pendingChatTurn === capturedPending
    && isConversationGenerationCurrent(capturedGeneration)
    && String(unref(conversationId) || '') === capturedConversationId;
  const probeQuery = buildPendingOperationProbeQuery(capturedPending, 10);
  if (!probeQuery) {
    durableAckProbeKey = '';
    console.warn('[ChatOperation] exact identity probe skipped because clientOperationId is missing');
    return;
  }
  const endpoint = `${_this.requestUrl.chatOperationStatus}${probeQuery}`;
  _this.http.get(endpoint, { showLoading: false }).then((res: any) => {
    if (!isCurrentProbe()) return;
    durableAckProbeKey = '';
    const capability = classifyOperationCapabilityResponse(res);
    if (capability === 'legacy') {
      capturedPending.operationOutcomeCapability = 'legacy';
      if (settleFrozenLegacyStreamError(capturedPending)) return;
      if (capturedPending.streamMetaReceived === true) {
        chatTransport.noteServerStreamProgress(capturedPending, 'legacy_server');
        return;
      }
      recoverPendingTurnAfterMissingDurableAck(capturedPending, storedDraft);
      return;
    }
    if (capability === 'supported') {
      capturedPending.operationOutcomeCapability = 'supported';
      const status = selectPendingOperationFromList(res.data, capturedPending);
      if (status) {
        const recorded = recordAuthoritativeOperationStatus(status);
        if (recorded && isChatOperationTerminal(recorded)) {
          refreshHistoryAfterAuthoritativeOperation(recorded);
        } else if (recorded) {
          requestAuthoritativeOperationReconciliation(reason);
        }
        return;
      }
      const emptyProbe = recordExactOperationProbeMiss(
        capturedPending,
        Date.now(),
      );
      persistPendingPreAdmissionState(capturedPending);
      if (emptyProbe.confirmed) {
        settleConfirmedPreAdmissionFailure(capturedPending, storedDraft);
        return;
      }
      schedulePendingOperationIdentityReconciliation(
        capturedPending,
        socketToken,
        reason,
      );
      return;
    }
    schedulePendingOperationIdentityReconciliation(
      capturedPending,
      socketToken,
      reason,
    );
  }).catch((error: any) => {
    if (!isCurrentProbe()) return;
    durableAckProbeKey = '';
    if (classifyOperationCapabilityResponse(error) === 'legacy') {
      capturedPending.operationOutcomeCapability = 'legacy';
      if (settleFrozenLegacyStreamError(capturedPending)) return;
      if (capturedPending.streamMetaReceived === true) {
        chatTransport.noteServerStreamProgress(capturedPending, 'legacy_server');
        return;
      }
      recoverPendingTurnAfterMissingDurableAck(capturedPending, storedDraft);
      return;
    }
    console.warn('[ChatOperation] durable ack capability probe failed', error);
    schedulePendingOperationIdentityReconciliation(
      capturedPending,
      socketToken,
      reason,
    );
  });
}

function handleChatTransportDeadline(kind: 'open' | 'accepted', socketToken: number) {
  if (!chatTransport.isCurrentSocket(socketToken)) return;
  console.warn(`[Stream] ${kind} deadline exceeded, socketToken=${socketToken}`);
  if (kind === 'accepted') {
    probePendingTurnAfterDurableAckTimeout(socketToken);
    return;
  }
  const storedDraft = pendingChatTurn?.draft || readLsEntry()?.pendingPayload?.message || '';
  const recovered = recoverPendingChatTurnBeforeAccepted();
  if (!recovered) recoverStoredStreamDraft({ draft: storedDraft });
  closeWebSocket();
}

function sendQueuedChatPayload(capturedSocket: any, socketToken: number) {
  const entryIndex = messageQueue.value.findIndex(entry => entry && entry.socketToken === socketToken);
  if (entryIndex < 0 || !chatTransport.consumeChatPayload(socketToken)) return;
  const entry = messageQueue.value.splice(entryIndex, 1)[0];
  const options = {
    data: JSON.stringify(entry.payload),
    success: () => {
      if (!chatTransport.isCurrentSocket(socketToken)) return;
      rewrite.value = false;
      rewriteTargetChatId.value = '';
      contine.value = false;
    },
    fail: (err: any) => {
      if (!chatTransport.isCurrentSocket(socketToken)) return;
      console.error('WebSocket 傳送訊息失敗，請檢查：', err);
      if (requestPendingOperationReconciliation('socket_send_failed')) return;
      const recovered = recoverPendingChatTurnBeforeAccepted();
      if (recovered) closeWebSocket();
      else sendError(0, t('message.disconnect_tips'));
    }
  };
  if (!capturedSocket || typeof capturedSocket.send !== 'function') {
    options.fail({ errMsg: 'captured SocketTask.send unavailable', errCode: 'socket_task_send_unavailable' });
    return;
  }
  const pending = pendingChatTurn;
  if (pending?.socketToken === socketToken && chatTransport.shouldAwaitDurableTurnAck(pending)) {
    chatTransport.armAcceptedDeadline(socketToken, CHAT_ACCEPTED_DEADLINE_MS, token => {
      handleChatTransportDeadline('accepted', token);
    });
  }
  try {
    capturedSocket.send(options);
  } catch (err) {
    options.fail(err || { errMsg: 'captured SocketTask.send threw' });
  }
}

function handleOwnedSocketTermination(kind: 'close' | 'error', detail: any, socketToken: number) {
  chatTransport.clearDeadlines(socketToken);
  isConnecting.value = false;
  if (activeSocketToken === socketToken) socket.value = null;
  heartbeatManager.stop();
  sseParser.reset();
  clearCompactWatchdog();
  if (unref(isCompacting)) {
    console.warn(`[AutoCompact] WebSocket ${kind === 'close' ? '關閉' : '出錯'}時 compacting 仍為 true，強制清理狀態`);
    store.commit('setIsCompacting', false);
    store.commit('setCompactStatus', '');
  }
  if (requestPendingOperationReconciliation(`socket_${kind}`)) {
    // status poll 負責 durable convergence；若已有 streamId，仍同步嘗試恢復
    // 即時串流，兩條路都只能作用於同一 operationId / socket generation。
    if (isStreamActive.value && streamId.value) attemptReconnectWithResume();
    return;
  }
  if (recoverPendingChatTurnBeforeAccepted()) return;
  if (isStreamActive.value && streamId.value) {
    attemptReconnectWithResume();
    return;
  }
  if (isStreamActive.value) {
    isResumeInitial.value = false;
    clearStreamState();
    removeOrphanPlaceholder();
    try {
      ajax.value.flag = true;
      ajax.value.page = 1;
      getHistoryMsg();
    } catch (e) {
      console.error('[Stream] transport fallback getHistoryMsg 失敗:', e);
    }
    return;
  }
  const lastTalk = talkList.value[talkList.value.length - 1];
  // 只有本輪「未完成」(chatFinish !== true) 才算真異常關閉；乾淨成功輪
  // (已收到 done、chatFinish 已標 true)不發錯誤事件，避免污染 GA4 監控。
  if (lastTalk && lastTalk.chatFinish !== true && lastTalk.finishReason !== 'user_stop') {
    sendError(0, t('message.disconnect_tips'));
  }
}

function handleModExpiryAckRequired(eventData: any) {
  const pending = pendingChatTurn;
  const prepared = prepareChatPayload(pending?.payload);
  const payloadTurnId = prepared.payload.clientTurnId;
  const receivedTurnId = eventData?.clientTurnId == null ? '' : String(eventData.clientTurnId);
  const ackToken = eventData?.ackToken == null ? '' : String(eventData.ackToken);

  // The server gate is pre-persistence. Never try to "helpfully" resend if
  // the server did not prove that this acknowledgement belongs to this exact
  // client turn; restore the draft instead.
  if (!prepared.ok || !payloadTurnId || !ackToken || receivedTurnId !== payloadTurnId) {
    const draft = pending?.draft || prepared.payload.message || '';
    if (!recoverPendingChatTurnBeforeAccepted()) recoverStoredStreamDraft({ draft });
    closeWebSocket();
    message.warning(t('mod.expiry.retryUnavailable'));
    return;
  }

  const transientBubbleIds = new Set(
    [pending?.userBubbleId, pending?.aiBubbleId].filter(id => id !== undefined && id !== null && id !== '')
  );
  talkList.value = talkList.value.filter(item => !transientBubbleIds.has(item && item.id));
  if (pending?.socketToken) {
    messageQueue.value = messageQueue.value.filter(entry => entry && entry.socketToken !== pending.socketToken);
  }
  pendingChatTurn = null;
  tempContent.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  clearStreamState();
  closeWebSocket();

  modExpiryAck.value = {
    payload: prepared.payload,
    draft: pending?.draft || prepared.payload.message || '',
    clientTurnId: payloadTurnId,
    ackToken,
    expiredCount: Array.isArray(eventData?.expiredMods) ? eventData.expiredMods.length : 0,
    expiredMods: projectExpiredModSummaries(eventData?.expiredMods),
  };
  modExpiryRetryAcknowledgement.value = null;
  modExpiryAckOpen.value = true;
}

function cancelModExpiryAcknowledgement() {
  if (modExpiryAckBusy.value) return;
  const pending = modExpiryAck.value;
  if (pending) content.value = pending.draft;
  tempContent.value = '';
  replyContent.value = '';
  thinkingContent.value = '';
  modExpiryRetryAcknowledgement.value = pending;
  modExpiryAckOpen.value = false;
  modExpiryAck.value = null;
}

function continueWithExpiredModOnce() {
  const pending = modExpiryAck.value;
  if (!pending || modExpiryAckBusy.value) return;
  const prepared = prepareChatPayload({
    ...pending.payload,
    clientTurnId: pending.clientTurnId,
    ackToken: pending.ackToken,
  });
  if (!prepared.ok || !prepared.payload.clientTurnId || !prepared.payload.ackToken) {
    message.warning(t('mod.expiry.retryUnavailable'));
    return;
  }

  modExpiryAckBusy.value = true;
  let userBubbleId: string | number | undefined;
  if (prepared.payload.message) {
    const userBubble = {
      id: nextBubbleId(),
      content: prepared.payload.message,
      type: 1,
      pic: unref(userInfo).avatar ? unref(userInfo).avatar : '/static/logo.png',
      maskPosition: 1,
      transportTransient: true,
      serverAccepted: false,
    };
    userBubbleId = userBubble.id;
    talkList.value.push(userBubble);
  }
  const aiBubble = {
    id: nextBubbleId(),
    content: '',
    type: 0,
    pic: unref(pic),
    playstate: false,
    chatLoading: true,
    chatFinish: false,
    maskPosition: 1,
  };
  talkList.value.push(aiBubble);
  tempContent.value = prepared.payload.message;
  content.value = '';
  replyContent.value = '';
  focus.value = false;
  autoScrollEnabled.value = true;
  isUserAtBottom.value = true;
  nextTick(() => scrollToBottom(true));

  beginPendingChatTurn({
    userBubbleId,
    aiBubbleId: aiBubble.id,
    draft: pending.draft,
    payload: prepared.payload,
    expectsAccepted: !prepared.payload.rewrite && !prepared.payload.contine,
  });
  persistPendingSend(prepared.payload);
  const started = sendWebSocketMessage(prepared.payload);
  modExpiryAckBusy.value = false;
  modExpiryRetryAcknowledgement.value = null;
  if (started) {
    modExpiryAckOpen.value = false;
    modExpiryAck.value = null;
  }
}

function generateClientTurnId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 发送信息
function send() {
  const explicitOperationKind = requestedOperationKindOverride;
  requestedOperationKindOverride = '';
  const explicitResumeFrom = resumeFromOperationIdOverride;
  resumeFromOperationIdOverride = '';
  // IME composition 期間禁止送出(issue desktop#9 #5)。
  // confirm-type="send" + @confirm="send" 在 H5 textarea 用 Enter 時會觸發,
  // 即使 handleKeydown 攔住了,confirm event 仍可能在 IME flush 候選的瞬間誤 fire。
  if (unref(imeComposing)) return;
  // 純預覽：攔下來，不送（owner 2026-09-05）。放在登入檢查之前，沒登入也能預覽。
  if (previewOnly.value) {
    previewEcho();
    return;
  }
  // 未登录时触发登录弹窗
  if (!unref(hasLogin)) {
    uni.$emit('notLogin', {});
    return;
  }
  /*
    這張卡要用哪顆模型只有伺服器知道（見 loadRoleSettings）。設定還沒到手就送出，
    帶出去的會是一個空的模型代號——伺服器查不到它，會落到未知模型的回退價，
    而畫面上完全看不出來。所以寧可誠實地說一句「再試一次」，並且立刻補讀一次：
    這不是死路，玩家按第二次就會過。
  */
  if (!formData.selectModel) {
    ensureRoleSettings();
    uni.showToast({ title: t('canvas.panel.settingsNotReady'), icon: 'none' });
    return;
  }
  const supportsOperationOutcome = canUseChatOperationOutcome();
  // Transitional guard for InputQueue (#38): block every send entry (including Enter)
  // while a turn or compaction is in flight. InputQueue D4's two-slot preflight
  // will replace this guard when that queue ships.
  if (isTimelineMutationBlocked()) {
    notifyTimelineMutationBlocked();
    return;
  }
  // 發送前去除首尾空白
  content.value = unref(content).trim();
  // 作者的 beforeSend 改寫：所有送出入口都會流經這裡，所以改寫只在這裡做一次。
  // 「繼續」不帶輸入框的字，改寫它等於動到使用者沒有要送的草稿；
  // 來自 luna.send() 的送出則已經在意圖 API 內改寫過，再做一次會把結果接兩遍。
  if (lunaIntent && !authorSubmitInFlight && !unref(contine) && unref(content)) {
    const authorRewritten = lunaIntent.applyBeforeSend(unref(content));
    if (authorRewritten !== unref(content)) content.value = authorRewritten;
  }
  // 「繼續」刻意不帶輸入框的字——它是「把這一輪跑完」,不是送新訊息。
  // 少了 explicitResumeFrom 這一項,繼續鍵按下去會靜靜地卡在這一行,畫面完全沒反應。
  if (!unref(content) && !unref(tempContent) && !unref(contine) && !explicitResumeFrom) {
    return;
  }
  const retryAcknowledgement = modExpiryRetryAcknowledgement.value;
  if (retryAcknowledgement) {
    modExpiryRetryAcknowledgement.value = null;
    if (retryAcknowledgement.draft === unref(content)) {
      modExpiryAck.value = retryAcknowledgement;
      modExpiryAckOpen.value = true;
      return;
    }
  }
  // 新的一輪開始，上一輪的準備軌跡就到此為止。
  //
  // 先前只在「收到新的準備步驟」時清（見 prepStep 分支）。那條路徑在這一輪
  // **沒有準備**時根本不會走到——關掉深入準備、或伺服器判定不跑的輪次——
  // 於是上一輪的軌跡會原封不動掛到這一則新訊息上，畫面顯示一個它根本沒做過的
  // 「準備過程」。實測：agent 關閉的兩輪都掛著上一輪那 6 步。
  pendingPrepTrail.value = [];
  prepSteps.value = [];

  let data = null;
  let userBubbleId: string | number | undefined;
  if (unref(content) && !unref(rewrite)) {
    // 将当前发送信息 添加到消息列表。
    data = {
      "id": nextBubbleId(),
      "content": unref(content),
      "type": 1,
      "pic": unref(userInfo).avatar ? unref(userInfo).avatar : '/static/logo.png',
      "maskPosition": 1,
      transportTransient: true,
      serverAccepted: false,
    }
    userBubbleId = data.id;
    unref(talkList).push(data);
  }
  tempContent.value = unref(content);
  multiPassUpdating.value = false;
  content.value = "";
  replyContent.value = "";
  // 新回合開始必須連 thinkingContent 一起清。上一回合的權威終結路徑會把
  // [DONE]（唯一清這個 ref 的地方）fence 掉，殘留的思考內容會被下一回合
  // 當成自己的思考鏈顯示出來。mobile 同一位置本來就兩個都清。
  thinkingContent.value = "";
  // Phase 2a：新 send 開始，重置 resume-initial 標記（前次 resume 流程可能留下）
  isResumeInitial.value = false;
  // 「繼續」接管中斷的那一列,不在底下另開一顆。
  //
  // 它本來就是同一輪還沒交卷:後續的準備要接在原本那顆氣泡裡繼續長,最後直接
  // 變成 AI 的回覆。另開一顆的話,上面那顆還掛著「繼續」——AI 正在跑的時候
  // 使用者還能再按一次(owner 2026-08-08 在 mobile 指出)。
  const adoptedResume = explicitResumeFrom
    ? adoptInterruptedAgentBubbleForResume(unref(talkList))
    : undefined;
  const aiBubbleId = adoptedResume ? adoptedResume.bubbleId : nextBubbleId();
  currentChatId.value = aiBubbleId as any;
  if (adoptedResume) {
    // 既有軌跡交給即時流水帳接著長,續跑的新步驟就會排在它後面。
    prepSteps.value = adoptedResume.trail.slice();
    data = unref(talkList)[adoptedResume.index];
  } else {
    data = {
      "id": aiBubbleId,
      operationBubbleId: aiBubbleId,
      "content": unref(replyContent),
      "type": 0,
      "pic": unref(pic),
      "playstate": false,
      "chatLoading": true,
      "chatFinish": false,//是否回复结束
      "maskPosition": 1
    }
    unref(talkList).push(data);
  }
  focus.value = false
  // 发送新消息时，启用自动滚动并强制滚动到底部
  autoScrollEnabled.value = true;
  isUserAtBottom.value = true;
  nextTick(() => {
    scrollToBottom(true);
  });
  const payloadInput = {
    conversationId: unref(conversationId),
    message: unref(tempContent),
    // 送出去的一定是伺服器給過我們的那個值：這張卡的遊玩設定裡存的是什麼就是
    // 什麼（見 loadRoleSettings）。客戶端自己編一個代號的話，伺服器查不到它，
    // 會落到未知模型的回退價——而畫面上完全看不出來。
    model: formData.selectModel || '',
    thinkingDepth: formData.thinkingDepth || '',
    rewrite: unref(rewrite),
    contine: unref(contine),
    language: stageHost.locale.get(),
    supportsOperationOutcome,
    clientOperationId: supportsOperationOutcome ? createClientOperationId() : '',
    operationKind: explicitOperationKind === 'retry_generation'
      ? explicitOperationKind
      : '',
    chatId: unref(rewrite)
      ? unref(rewriteTargetChatId)
      : (unref(contine) ? unref(continueTargetChatId) : ''),
    clientTurnId: generateClientTurnId(),
    resumeFromOperationId: explicitResumeFrom,
  };
  const preparedPayload = prepareChatPayload(payloadInput);

  beginPendingChatTurn({
    userBubbleId,
    aiBubbleId,
    draft: unref(tempContent),
    payload: preparedPayload.payload,
    expectsAccepted: preparedPayload.ok ? !unref(rewrite) && !unref(contine) : true,
    operationKind: operationKindFromPayload(preparedPayload.payload),
    rewriteSnapshot: pendingRewriteSnapshot,
  });
  if (!preparedPayload.ok) {
    console.error('[Stream] chat payload 欄位不完整，已保留草稿:', preparedPayload.missingFields.join(','));
    recoverPendingChatTurnBeforeAccepted();
    return;
  }
  const messageData = preparedPayload.payload;

  // Phase 2a：發送前寫入 pending marker，讓 streamMeta 到達前的刷新也能透過 tryResumeByConv 恢復
  persistPendingSend(messageData);
  console.log(`[Stream] send 寫入 pending marker，conv=${unref(conversationId)} pendingSince=${Date.now()}`);

  sendWebSocketMessage(messageData);
}

// 发送WebSocket消息
function sendWebSocketMessage(data) {
  const prepared = prepareChatPayload(data);
  if (!prepared.ok) {
    console.error('[Stream] chat payload 欄位不完整，已取消傳送:', prepared.missingFields.join(','));
    if (!recoverPendingChatTurnBeforeAccepted()) {
      recoverStoredStreamDraft({ draft: data?.message || '' });
    }
    return false;
  }
  retireActiveSocketForNextTurn();
  const socketToken = chatTransport.openSocketGeneration();
  activeSocketToken = socketToken;
  messageQueue.value = [{ socketToken, payload: prepared.payload }];
  if (pendingChatTurn) {
    pendingChatTurn.payload = prepared.payload;
    pendingChatTurn.socketToken = socketToken;
  }
  connectWebSocket(undefined, socketToken);
  return true;
}

//连接WebSocket服务器
// Phase 2a：支援 resume 連線（帶 resumeStreamId/lastEventId 或 conversationId 反查）
// resumeParams:
//   { resumeStreamId: string, lastEventId: number } → 精確 resume
//   { tryResumeByConv: true } → 反查 resume（刷新頁面場景）
//   undefined → 正常新連線
// 串流連線不能帶 Authorization 標頭，所以身分改成兩步：先用 Bearer 換一張
// 短效一次性票證，連線後的第一幀交出票證，伺服器回 ready 之後才收聊天幀。
// 票證用完即失效，每一次連線（含重連與續跑）都要重新換。
async function fetchChatWsTicket(): Promise<string> {
  try {
    const res: any = await _this.http.post(_this.requestUrl.chatWsTicket, {
      header: { 'content-type': 'application/json' },
      showLoading: false,
      data: {},
    });
    if (res?.statusCode === 200 && res.data?.ticket) return String(res.data.ticket);
  } catch (e) {
    console.error('[Stream] 取得串流票證失敗:', e);
  }
  return '';
}

// socketToken → 已開啟但還在等 ready 的連線。收到 ready 才把排隊中的聊天幀送出去。
const socketsAwaitingReady = new Map<number, any>();

async function connectWebSocket(
  resumeParams?: { resumeStreamId?: string; lastEventId?: number; tryResumeByConv?: boolean },
  requestedSocketToken?: number,
) {
  if (!requestedSocketToken && socket.value) return;
  const socketToken = requestedSocketToken || chatTransport.openSocketGeneration();
  if (!chatTransport.isCurrentSocket(socketToken)) return;
  if (resumeParams) chatTransport.retireChatPayload(socketToken);
  activeSocketToken = socketToken;
  const capturedGeneration = conversationGeneration.value;

  const ticket = await fetchChatWsTicket();
  // 換票期間可能已經有別的連線接手，或者這一輪被取消了。
  if (!chatTransport.isCurrentSocket(socketToken)) return;
  if (!ticket) {
    handleOwnedSocketTermination('error', { errMsg: 'chat ws ticket unavailable' }, socketToken);
    return;
  }

  // Localhost normally validates against production. A local backend is used
  // only by the explicit dev:h5:local command.
  let wsUrl = resolveChatWebSocketBase(
    WS_BASE,
    // 指向臨時實例時，代理與串流由同一個環境變數決定。
    // 分開設定就會有人只改一邊，然後靜默測到線上。
    import.meta.env.VITE_CHAT_API_BASE,
  );

  // 組 query string（Phase 2a 協定協商）
  const params = new URLSearchParams();
  params.set('protocolVersion', PROTOCOL_VERSION);
  if (resumeParams?.resumeStreamId) {
    params.set('resumeStreamId', resumeParams.resumeStreamId);
    params.set('lastEventId', String(resumeParams.lastEventId || 0));
  } else if (resumeParams?.tryResumeByConv && unref(conversationId)) {
    params.set('mode', 'tryResume');
    params.set('conversationId', unref(conversationId));
  }
  wsUrl += '?' + params.toString();
  console.log('[Stream] ws connecting:', wsUrl);

  const capturedSocket: any = uni.connectSocket({
    url: wsUrl,
    // uni-h5 無 callback 時 promisify 會把返回值包成 Promise(無 .send),
    // 必須帶 callback 強制回傳 SocketTask——7/18 PC「send unavailable」實錘根因。
    success: () => {},
    header: {
      'content-type': 'application/json',
      'from': unref(from),
      'version': unref(version)
    }
  });
  socket.value = capturedSocket;
  isConnecting.value = false;
  chatTransport.armOpenDeadline(socketToken, CHAT_OPEN_DEADLINE_MS, token => {
    handleChatTransportDeadline('open', token);
  });

  const onOpen = () => {
    if (!isOwnedSocketCallback(socketToken, capturedGeneration)) return;
    chatTransport.markSocketOpened(socketToken);
    console.log('WebSocket連線已開啟！');
    isConnecting.value = true;
    // 第一幀一定是驗票；伺服器在收到 ready 之前只讀這一幀。
    socketsAwaitingReady.set(socketToken, capturedSocket);
    try {
      capturedSocket.send({ data: JSON.stringify({ type: 'auth', ticket }) });
    } catch (e) {
      socketsAwaitingReady.delete(socketToken);
      handleOwnedSocketTermination('error', e || { errMsg: 'chat ws auth frame failed' }, socketToken);
    }
  };
  const onMessage = (res: any) => {
    if (!isOwnedSocketCallback(socketToken, capturedGeneration)) return;
    heartbeatManager.updateLastMessageTime();
    handlerMessage(res, capturedGeneration, socketToken);
  };
  const onClose = (res: any) => {
    if (!isOwnedSocketCallback(socketToken, capturedGeneration)) return;
    console.log('WebSocket連線已關閉！');
    handleOwnedSocketTermination('close', res, socketToken);
  };
  const onError = (err: any) => {
    if (!isOwnedSocketCallback(socketToken, capturedGeneration)) return;
    console.error('WebSocket 連線開啟失敗，請檢查：', err);
    handleOwnedSocketTermination('error', err, socketToken);
  };

  detachGlobalSocketListeners();
  const fallbackHandlers: NonNullable<typeof globalSocketHandlers> = {};
  if (capturedSocket && typeof capturedSocket.onOpen === 'function') capturedSocket.onOpen(onOpen);
  else { fallbackHandlers.open = onOpen; (uni as any).onSocketOpen(onOpen); }
  if (capturedSocket && typeof capturedSocket.onMessage === 'function') capturedSocket.onMessage(onMessage);
  else { fallbackHandlers.message = onMessage; (uni as any).onSocketMessage(onMessage); }
  if (capturedSocket && typeof capturedSocket.onClose === 'function') capturedSocket.onClose(onClose);
  else { fallbackHandlers.close = onClose; (uni as any).onSocketClose(onClose); }
  if (capturedSocket && typeof capturedSocket.onError === 'function') capturedSocket.onError(onError);
  else { fallbackHandlers.error = onError; (uni as any).onSocketError(onError); }
  globalSocketHandlers = Object.keys(fallbackHandlers).length ? fallbackHandlers : null;
}

// Phase 2a：斷線自動重連（指數退避）
function attemptReconnectWithResume() {
  if (!streamId.value) {
    // 沒有 streamId 無法 resume
    reconnectAttempt.value = 0;
    if (requestPendingOperationReconciliation('missing_stream_id')) return;
    discardStoppedOperationWithoutDurableTerminal();
    return;
  }
  // 避免 onSocketError + onSocketClose 連續觸發重複排程
  if (reconnectTimerHandle.value) {
    console.log('[Stream] reconnect 已排程，略過重複呼叫');
    return;
  }
  if (reconnectAttempt.value >= RECONNECT_DELAYS.length) {
    console.warn('[Stream] 重連次數已達上限，放棄 resume，清空狀態');
    reconnectAttempt.value = 0;
    if (requestPendingOperationReconciliation('reconnect_exhausted')) return;
    discardStoppedOperationWithoutDurableTerminal();
    clearStreamState();
    removeOrphanPlaceholder();
    return;
  }
  const delay = RECONNECT_DELAYS[reconnectAttempt.value];
  reconnectAttempt.value++;
  console.log(`[Stream] 重連嘗試 ${reconnectAttempt.value}/${RECONNECT_DELAYS.length}，延遲 ${delay}ms (streamId=${streamId.value} conv=${unref(conversationId)})`);
  reconnectTimerHandle.value = setTimeout(() => {
    reconnectTimerHandle.value = null;
    if (socket.value) {
      // 連線已被其他路徑建立，取消
      return;
    }
    isResumeInitial.value = true;
    connectWebSocket({
      resumeStreamId: streamId.value,
      lastEventId: lastEventId.value,
    });
  }, delay) as unknown as number;
}

// 关闭WebSocket连接
function closeWebSocket() {
  const staleSocket: any = socket.value;
  if (activeSocketToken) chatTransport.invalidateSocketGeneration(activeSocketToken);
  detachGlobalSocketListeners();
  socket.value = null;
  isConnecting.value = false;
  messageQueue.value = [];
  heartbeatManager.stop();
  chatTransport.clearDeadlines(activeSocketToken);
  if (!staleSocket) return;
  try {
    if (typeof staleSocket.close === 'function') staleSocket.close({ code: 1000, reason: 'client_close' });
    else (uni as any).closeSocket({ code: 1000, reason: 'client_close' });
  } catch (e) {
    console.warn('[Stream] 關閉連線失敗:', e);
  }
}

function focusChange() {
  openMore.value = false;
  openLight.value = false;
  focus.value = true;
  // 輸入框獲取焦點時只有用戶在底部才滾動
  if (isUserAtBottom.value) {
    nextTick(() => {
      scrollToBottom();
    });
  }
}

function blurChange() {
  focus.value = false;
  // 输入框失去焦点时不自动滚动，避免页面跳动
}

function openMoreClick() {
  focus.value = false
  openLight.value = false;
  openMore.value = !unref(openMore);
  // 打开更多菜单时只在用户在底部时才滚动
  if (openMore.value) {
    nextTick(() => {
      scrollToBottom();
    });
  }
}

const cancelRewrite = () => {
  bottomPopupShow.value = false
}

const latestCanonicalAIMessageIndex = computed(() => resolveLatestCanonicalAIIndex(talkList.value));

function isLatestCanonicalAIIndex(index: number) {
  return latestCanonicalAIMessageIndex.value === index;
}

function isLatestCanonicalAIId(chatId: string | number) {
  return isLatestCanonicalAIById(talkList.value, chatId);
}

const sureRewrite = async (chatId) => {
  if (manualEditSubmitting.value) return;
  if (isTimelineMutationBlocked()) {
    notifyTimelineMutationBlocked();
    return;
  }
  const targetChatId = chatId || unref(tempParam)?.id;
  if (!isLatestCanonicalAIId(targetChatId)) {
    message.warning(t('chat.editLatestAIOnly'));
    return;
  }
  manualEditSubmitting.value = true;
  try {
    const res = await _this.http.post(_this.requestUrl.rewriteChat, {
      header: {
        'content-type': 'application/json'
      },
      showLoading: false,
      data: {
        chatId: targetChatId,
        content: unref(reWriteContent)
      }
    })

    if (res.statusCode == 200) {
      bottomPopupShow.value = false
      const data = {
        "id": targetChatId,
        "content": reWriteContent.value,
        "type": 0,
        "pic": pic.value,
        "chatLoading": false,
        "chatFinish": true,
        'maskPosition': 1,
      }
      teardownStreamForConversationSwitch({ invalidateHistory: true })
      const replacement = replaceLatestCanonicalAI(talkList.value, targetChatId, data);
      if (!replacement.updated) {
        message.warning(t('chat.editLatestAIOnly'));
        return;
      }
      talkList.value = replacement.messages;
      reWriteContent.value = ""
      nextTick(() => {
        scrollToBottom();
      });
    } else {
      const errorType = String(
        res?.data?.errorCode || res?.data?.code || 'server_error',
      ).trim();
      appendChatErrorBubble(errorType);
    }
  } catch (e) {
    console.log(e)
    appendChatErrorBubble(resolveChatErrorTypeFromFailure(e));
  } finally {
    manualEditSubmitting.value = false;
  }
}

// 重新生成誤觸保護。「已有完整回覆再重新生成」屬破壞性操作（替換當前回覆、
// 可能觸發劇情回溯），先做二次確認（跟刪除／回溯同一套）；取消則無任何副作用。
// 失敗態重試 CTA（onSystemMsgCta 的 retry 分支）不經過這層——那裡沒有內容
// 可失去，加確認只是摩擦。
function confirmReiteration(index) {
  Modal.confirm({
    title: t('main.tip'),
    content: t('chat.regenerateConfirmation'),
    okText: t('main.sure'),
    cancelText: t('main.cancel'),
    centered: true,
    onOk() {
      doReiteration(index);
    },
    onCancel() {}
  });
}

const doReiteration = (index) => {
  if (isTimelineMutationBlocked()) {
    notifyTimelineMutationBlocked();
    return;
  }
  const rewriteSnapshot = createRewriteSnapshotForAI(talkList.value, index);
  if (!rewriteSnapshot) return;
  const userBubble = rewriteSnapshot.userBubble;
  // 工單 #41-F1：重開新輪前若當前仍在活躍生成中，先走既有的停止機制，避免
  // 殘留 socket/streamId 把新輪回覆污染成「繼續上一輪」。sendStop() 內部
  // 同步呼叫 finalizeUserStoppedStream()（沒有 promise/ack），呼叫返回時
  // isStreamActive 已經是 false，不需要額外等待或延遲。
  if (actionBtnState.value === 'stop') {
    sendStop();
  }
  content.value = userBubble.content
  rewrite.value = shouldRewriteUserTurn(userBubble)
  contine.value = false
  if (rewrite.value) {
    // Canonical 舊 branch 保持可恢復，直到 server 以 [DONE] 證明新 winner 已 durable。
    pendingRewriteSnapshot = rewriteSnapshot;
  } else {
    // 未 accepted 的 USER 不是 response Rewrite，而是 retry-generation；
    // 沿用既有送出語義，只精準移除該 transient pair。
    talkList.value.splice(rewriteSnapshot.userIndex, 2);
    pendingRewriteSnapshot = null;
  }
  rewriteTargetChatId.value = rewrite.value ? String(userBubble.chatId || userBubble.id || '') : ''
  send()
}

function startContinueFromSource(item) {
  continueTargetChatId.value = String(item?.chatId || item?.id || '');
  // 工單 #41-F1：重開新輪前若當前仍在活躍生成中，先走既有的停止機制（同步）。
  if (actionBtnState.value === 'stop') {
    sendStop();
  }
  rewrite.value = false
  contine.value = true
  const continueDraft = content.value
  content.value = ''
  send()
  continueTargetChatId.value = ''
  if (!content.value && continueDraft) content.value = continueDraft
}

const doContinue = (item, index) => {
  if (isTimelineMutationBlocked()) {
    notifyTimelineMutationBlocked();
    return;
  }
  if (!isTerminalActionAllowed(talkList.value, index, 'continue')
    && !isTerminalActionAllowed(talkList.value, index, 'retry')) {
    notifyTimelineMutationBlocked();
    return;
  }
  startContinueFromSource(item);
}

function continueFromAuthoritativeTerminal(item, terminalIndex, action) {
  if (isTimelineMutationBlocked()) {
    notifyTimelineMutationBlocked();
    return;
  }
  if (!isTerminalActionAllowed(talkList.value, terminalIndex, action)) {
    notifyTimelineMutationBlocked();
    return;
  }
  startContinueFromSource(item);
}

// 舊的長按彈出選單（fui-bubble-box）已由畫布自己的覆蓋層選單取代：
// 兩端同一份動作清單，只有呼出方式不同。動作能不能做由 menuActions 決定。

// ========== Quota Exhaustion Toast ==========

const copyText = (e, text, tips) => {
  $fui.getClipboardData(text, res => {
    if (res) {
      _this.fui.toast(tips || t('copy_success'))
    }
  }, e)
}

function toggleSummaryExpand(item) {
  item.summaryExpanded = !item.summaryExpanded;
}

// 消費子頁面（modelSelect 等）保存後寫入的刷新標記
// 只在標記存在時刷新，避免瀏覽器 tab 切換等場景無謂調用 API
function consumePendingUserDefineRefresh() {
  try {
    const raw = sessionStorage.getItem('pendingUserDefineRefresh');
    if (!raw) return;
    sessionStorage.removeItem('pendingUserDefineRefresh');
    const pending = parsePendingUserDefineRefresh(raw);
    if (!pending) return;
    applyPendingUserDefineRefresh(formData, pending, String(unref(roleId) || ''));
    if (unref(hasLogin)) {
      getUserDefine();
    }
  } catch (e) {
    console.warn('consumePendingUserDefineRefresh failed:', e);
  }
}

onShow(() => {
  //监听页面显示，页面每次出现在屏幕上都触发
  // 從子頁返回：把 onHide 收起來的作者容器放回來（節點與訂閱都還在，不重跑腳本）。
  setAuthorAssetPageVisible(true);

  /*
    這一頁不再有子頁面：重寫與編輯在訊息選單裡，換模型在彈層裡。所以也沒有
    「從子頁回來要刷新」這件事——那條路徑連同它服務的兩個頁面一起拿掉了。
    這個消費函式留著只為了清掉舊分頁可能留下的標記，沒有標記時它什麼都不做。
  */
  consumePendingUserDefineRefresh();

  // 恢复滚动位置
  nextTick(() => {
    resumePendingOperationReconciliationOnForeground();
    const container = document.querySelector('#scrollview');
    if (container && savedScrollTop.value > 0) {
      container.scrollTop = savedScrollTop.value;
    }
  });
});

onHide(() => {
  //监听页面隐藏
  // 先收作者容器：子頁疊上來之前把它藏起來，否則覆蓋層會蓋在子頁上。
  setAuthorAssetPageVisible(false);
  // 保存滚动位置
  const container = document.querySelector('#scrollview');
  if (container) {
    savedScrollTop.value = container.scrollTop;
  }
});

onUnload(() => {
  //监听页面返回
  // 作者資產先收：卸容器、還原變數、釋放訂閱。這是單一還原點，作者不必寫 destroy。
  disposeAuthorAsset();
  uni.$off('multiPassPreferenceUpdated', onMultiPassPreferenceUpdated);
  cancelPendingBackwardRetryTimer();
  cancelContextUsageRefresh();
  teardownStreamForConversationSwitch({
    preservePersistedOperation: hasPersistedPendingOperationIdentity(),
    invalidateHistory: true,
  });
  // 清掉本頁所有 streaming render cache (issue #5)
  try { clearStreamCache(); } catch (_) {}
  teardownScrollAnchorObserver();
  // 卡片往 <body> / <html> 加的 class 帶著它的 !important。不還原的話玩家會
  // 帶著上一張卡的美化走到別的頁面去，而他完全看不出那是哪來的。
  restoreDocumentOnLeave();
  // 清理 onMounted 註冊的事件監聽，避免泄漏
  // 移除键盘快捷键监听
  // #ifdef H5
  if (keyboardHandler) {
    document.removeEventListener('keydown', keyboardHandler);
  }
  // 移除追蹤滾動手勢的 touch / pointer / wheel 監聽（對齊 mobile 的修法）
  try {
    document.removeEventListener('touchstart', _onUserGestureStart, { capture: true } as any);
    document.removeEventListener('touchend', _onUserGestureEnd, { capture: true } as any);
    document.removeEventListener('touchcancel', _onUserGestureEnd, { capture: true } as any);
    document.removeEventListener('pointerdown', _onPointerDown as EventListener, { capture: true } as any);
    document.removeEventListener('pointerup', _onPointerUp as EventListener, { capture: true } as any);
    document.removeEventListener('pointercancel', _onPointerUp as EventListener, { capture: true } as any);
    document.removeEventListener('wheel', _onWheel, { capture: true } as any);
  } catch (e) { /* 部分舊瀏覽器移除 listener options 簽名不一致,忽略 */ }
  // 同步移除 native scroll listener,避免換頁後仍 fire
  try {
    const messageArea = document.querySelector('#scrollview');
    if (messageArea) messageArea.removeEventListener('scroll', nativeScrollHandler);
  } catch (e) { /* ignore */ }
  // #endif
});

onBackPress(() => {
  //监听页面卸载
  teardownStreamForConversationSwitch({
    preservePersistedOperation: hasPersistedPendingOperationIdentity(),
    invalidateHistory: true,
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Open Canvas — 畫布自己的狀態與轉接
//
// 上面是引擎（連線、操作狀態機、串流、歷史、回溯）；這一段只做「把引擎接到
// 畫布這組 DOM 上」。畫布的節點名是作者的語彙，不是我們的——所以這裡的工作
// 幾乎都是翻譯：引擎的一則訊息 → 卡片認得的那一列。
// ═══════════════════════════════════════════════════════════════════════

// 進畫布之前 <body> / <html> 長什麼樣。卡片的第一件事就是往 body 加自己的
// 主題 class，離開時得放回去，否則玩家帶著上一張卡的美化走到別的頁面。
// 取在這裡而不是 onMounted：卡片的腳本是第一則訊息渲染出來才跑的。
const enterBodySnapshot = captureBodySnapshot(typeof document !== 'undefined' ? document : null)

// 這張卡從哪個平台來。決定它的 <style> 要不要加訊息層前綴（見 canvas-style-scope）。
const cardFormat = ref<CardFormat>('mmd')

// ── 開場白 ─────────────────────────────────────────────────────────────
const greeting = reactive({ list: [] as string[], index: 0 })
const pendingGreetingStart = ref(false)

/**
 * 這張卡有沒有既有的對話。
 *
 * 查不到答案時回「有」：那條路是今天的行為（照舊開對話、載歷史），
 * 最壞只是玩家少了一次選開場白的機會；反過來猜錯會把他的紀錄藏起來。
 */
async function hasExistingConversation(): Promise<boolean> {
  const targetRoleId = String(unref(roleId) || '')
  if (!targetRoleId) return true
  try {
    // 這條路由回的是「我真的聊過的卡」（沒發過訊息的不算），沒有依角色過濾的參數，
    // 所以拿一頁最近的自己比對。玩得很久以前的卡可能落在後面幾頁：那時會多給一次
    // 選開場白的機會，而伺服器只對新對話套用選擇，歷史照樣載得回來。
    const res = await _this.http.get(_this.requestUrl.chatList, {
      data: { pageNum: 1, pageSize: 100 },
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200) return true
    const list: any[] = (res.data && res.data.conversations) || []
    if (!Array.isArray(list)) return true
    return list.some((row: any) => String(row?.conversationRoleId || '') === targetRoleId)
  } catch (e) {
    // 問不到就走今天的路（照舊開對話、載歷史）：最壞是少一次選開場白的機會，
    // 反過來猜錯會把玩家的紀錄藏起來。
    return true
  }
}

function renderGreetingPreview() {
  const text = greeting.list[greeting.index] || ''
  talkList.value = [{
    id: 0,
    content: text,
    type: 0,
    pic: unref(pic),
    maskPosition: 1,
    chatFinish: true,
  }]
}

function onGreetingSwipe(delta: number) {
  if (!pendingGreetingStart.value) return
  const next = stepGreeting(greeting, delta)
  if (next === greeting.index) return
  greeting.index = next
  renderGreetingPreview()
}

const showGreetingSwipes = computed(() => pendingGreetingStart.value && hasAlternates(greeting.list))

// ── 開場選項（MMD prologue）────────────────────────────────────────────
//
// 「你可以選擇開場」：給玩家挑的第一句話，跟上面的替代開場白是兩份資料、兩個機制。
// MMD 實測（2026-09-04，以訪客身分開一張公開卡）：點一條＝輸入框的字換成那一條，區塊
// 留著、不送出、不動 AI 的開場白。作者回報的事故正是我方先前把它接成「換掉第一則
// 訊息」（跟替代開場白共用狀態）。標題照 MMD 措辭走五語（見 locale）。
// ── 幫答（.ai-assistant）────────────────────────────────────────────────
//
// 伺服器替玩家寫下一句（固定便宜模型、固定點數），這裡只把它填進輸入框，
// 玩家自己改、自己送。跟開場選項走同一個出口 fillComposer——畫布上所有
// 「替玩家準備一句話」的東西都不代送。
const ASSIST_COST = 10
const assistBusy = ref(false)
// 上一次幫答填進輸入框的那句。伺服器把這一輪的結果留著：輸入框還裝著這句、玩家沒改過
// 就再按燈泡＝不滿意想換（regenerate:true，會再扣點）；輸入框空或是玩家自己的字＝
// 拿回這一輪的那句（regenerate:false，命中就免費）。換了對話就忘掉。
const lastAssistReply = ref('')
watch(conversationId, () => { lastAssistReply.value = '' })

async function onAssist() {
  if (assistBusy.value) return
  if (previewOnly.value) {
    uni.showToast({ title: t('openChat.preview.intercepted'), icon: 'none' })
    return
  }
  const targetConversationId = String(unref(conversationId) || '')
  if (!targetConversationId) {
    uni.showToast({ title: t('canvas.assist.failed'), icon: 'none' })
    return
  }
  assistBusy.value = true
  try {
    const regenerate = shouldRegenerateAssist(content.value, lastAssistReply.value)
    const res: any = await _this.http.post(_this.requestUrl.chatSuggestReply, {
      data: { conversationId: targetConversationId, regenerate: regenerate },
      showLoading: false,
      timeout: 60000,
    })
    const reply = res?.statusCode === 200 ? String(res?.data?.reply || '') : ''
    if (reply) {
      // 扣不扣點以回應為準（cost 0 = 這一輪的那句拿回來，沒收錢）；命中不用提示。
      lastAssistReply.value = reply
      fillComposer(reply)
      return
    }
    const code = String(res?.data?.error || '')
    uni.showToast({
      title: code === 'insufficient_credits' ? t('canvas.assist.insufficient') : t('canvas.assist.failed'),
      icon: 'none',
    })
  } catch (e) {
    uni.showToast({ title: t('canvas.assist.failed'), icon: 'none' })
  } finally {
    assistBusy.value = false
  }
}

const prologue = ref<string[]>([])
const composerRef = ref<any>(null)
const prologueTitle = computed(() => t('canvas.prologue.title'))
const prologueItems = computed(() => (
  shouldShowPrologue(prologue.value, talkList.value)
    ? prologue.value.map((line) => convertPlainText(line, displayScript))
    : []
))

function onProloguePick(pi: number) {
  const text = prologue.value[pi]
  if (!text) return
  fillComposer(text)
}

// ── 頁面狀態 ───────────────────────────────────────────────────────────
const introOpen = ref(false)
const menuIndex = ref(-1)
const menuOpen = ref(false)
const menuEditing = ref(false)
const menuDraft = ref('')
// 浮層從哪裡呼出（手指按下的點／⋯ 按鈕的框）；null 就退回置中覆蓋層。
const menuAnchor = ref<MessageMenuAnchor | null>(null)

// 觸控裝置走長按，指標裝置走懸停 + 三個點。用能力查詢而不是量寬度：
// 平板橫放時寬度像桌機，但手指仍然是手指。
const isTouchDevice = ref(false)
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  try {
    isTouchDevice.value = window.matchMedia('(hover: none)').matches
  } catch (e) {
    isTouchDevice.value = false
  }
}

const introText = computed(() => {
  const role = roleView.value as any
  return convertPlainText(role.creatorNotes || role.roleDesc || '', displayScript)
})

function userDisplayName(): string {
  const info: any = unref(userInfo) || {}
  // 只用暱稱；userName 是登入帳號（例如 test-01），不該當聊天裡的署名。沒有暱稱就叫「你」。
  return info.nickName || t('canvas.you')
}

const messageLabels = computed(() => ({
  copy: t('chat.copy'),
  edit: t('chat.rewrite'),
  regenerate: t('canvas.actions.regenerate'),
  reasoning: t('chat.thinkingProcess'),
  prepTrail: t('multiPass.prepTrailTitle'),
  prev: t('canvas.greeting.prev'),
  next: t('canvas.greeting.next'),
  interruptedNotice: t('multiPass.interruptedNotice'),
  interruptedNoticeSub: t('multiPass.interruptedNoticeSub'),
  continueAction: t('multiPass.continueAction'),
}))


/**
 * 一則訊息翻成畫布那一列要的東西。
 *
 * 刻意是函式而不是 computed：computed 會讓任何一則訊息變動都重算整份清單，
 * 串流期間每個 chunk 都要把幾百則歷史重跑一次規則引擎。
 */
function messageProps(item: any, index: number) {
  const isUser = item.type == 1
  const isSystemOnly = !!item.systemOnly
  const role = isSystemOnly ? 'system' : (isUser ? 'user' : 'ai')
  // 等回覆時不畫內容，畫指示器：那顆氣泡還不是一則訊息。
  // 準備階段的軌跡拿最後一步當標籤——等待期間不能有兩個東西同時在動。
  const lines = (unref(prepSteps) || []) as string[]
  // 這一輪那一列拿到整份軌跡（照 mobile：每一步都留著，做過的壓暗、當下這步亮著），
  // 指示器就不再重複最後一步。Agent 跑得慢，玩家唯一能判斷「有沒有在幹活」的
  // 依據就是這份一直在長的清單（owner 2026-09-04）。
  const liveSteps = (item.chatLoading && lines.length && item.id === unref(currentChatId)) ? lines : null
  // 軌跡在上面一步一步列著，指示器不重複最後一步——但也不能光三個點沒有字
  // （owner 2026-09-05）：準備中就寫「思考中」，其餘寫「正在回覆」。
  const loadingLabel = liveSteps
    ? t('chat.thinkingInProgress')
    : (unref(prepStepText) || t('chat.aiReplying'))
  const html = item.chatLoading ? '' : renderMessage(item)
  return {
    mesid: index,
    prepSteps: liveSteps,
    role,
    name: isUser ? userDisplayName() : convertPlainText(roleView.value.roleName || '', displayScript),
    avatar: item.pic || '',
    html,
    loadingLabel,
    // 這一輪 Agent 做了什麼。用戶付了錢、等了一分多鐘，過程是他唯一能判斷
    // 「有沒有在幹活」的依據，不該隨氣泡出現而消失。
    prepTrail: Array.isArray(item.prepTrail) ? item.prepTrail : null,
    agentInterrupted: item.agentInterrupted === true,
    reasoning: (!isUser && item.thinkingContent && formData.showThinkingProcess !== false)
      ? item.thinkingContent : '',
    finished: !!item.chatFinish,
    loading: !!item.chatLoading,
    latest: index === talkList.value.length - 1,
    // 只有最新那一則 AI 能重新生成（架構上只支援改寫最新一則）。
    // 這跟 latest 不同：latest 是列表最後一則，可能是玩家自己說的。
    // 串流進行中一律關掉：重新生成時新氣泡要等跑完才換上去，這段時間舊的那則仍是
    // 「最新一則 AI」，鍵還亮著就會再送一次（owner 2026-09-05：跑到 182 個 token 時還能按）。
    latestAI: !previewOnly.value && !isUser && !isSystemOnly && !!item.chatFinish && !isStreamActive.value && isLatestCanonicalAIIndex(index),
    contextUsage: (!isUser && !isSystemOnly) ? contextUsageForRow(item) : null,
    swipes: (index === 0 && showGreetingSwipes.value)
      ? { index: greeting.index, total: greeting.list.length }
      : null,
  }
}

// ── 訊息選單 ───────────────────────────────────────────────────────────
//
// 兩端同一份動作清單，只有呼出方式不同：手機長按氣泡、桌機點三個點。
// 「能不能做」由既有的操作狀態機決定——一顆按得下去卻做不到的鍵比沒有更糟。
const menuMessage = computed(() => {
  const item = talkList.value[menuIndex.value]
  if (!item) return null
  return { html: renderMessage(item) }
})

/**
 * 「繼續」只給最新一則、而且那一輪沒收尾的 AI：被截斷、被停止、還沒跑完。
 * 判定跟那一列底下系統訊息的「繼續」鍵同一套（伺服器給了 allowedActions 就
 * 照它，舊列照收尾原因），不另造一份會漂移的清單。
 */
function canContinueFromIndex(index: number): boolean {
  const item = talkList.value[index]
  if (!item || item.type != 0) return false
  if (!isTerminalActionAllowed(talkList.value, index, 'continue')) return false
  if (item.operationProjectionCapable === true) {
    return Array.isArray(item.allowedActions) && item.allowedActions.includes('continue')
  }
  return getSystemMsgCtaAction(item.finishReason, item, index) === 'continue'
}

/**
 * 「⋯」裡的清單。重新生成不在這裡——它常駐在氣泡底下那一列。
 * 最新一則 AI：改寫、繼續（沒收尾才有）、倒回、複製、刪除；
 * 其他 AI 與玩家的訊息：複製、倒回、刪除。
 * 「能不能做」由既有的操作狀態機決定——一顆按得下去卻做不到的鍵比沒有更糟。
 */
const menuActions = computed(() => {
  const index = menuIndex.value
  const item = talkList.value[index]
  if (!item) return []
  // 純預覽的訊息不在伺服器上：改寫、倒回、分叉、刪除都沒有對象，只留複製。
  if (previewOnly.value) return [{ key: 'copy', label: t('chat.copy') }]
  const isAI = item.type == 0
  const latestAI = isAI && isLatestCanonicalAIIndex(index)
  const actions: Array<{ key: string; label: string; disabled?: boolean }> = []
  if (latestAI) {
    actions.push({ key: 'edit', label: t('chat.rewrite') })
    if (canContinueFromIndex(index)) {
      actions.push({ key: 'continue', label: t('multiPass.continueAction') })
    }
  }
  // 倒回是回到歷史裡的某一則；最新那一則本來就在這裡，倒回它沒有意義（owner 2026-09-05）。
  const isLatestRow = index === talkList.value.length - 1
  if (item.id !== 0 && !isLatestRow) {
    actions.push({ key: 'rewind', label: t('canvas.menu.rewind') })
  }
  // 從這一則分叉：伺服器（04500a5a 起）吃 chatId，只複製到這一則為止，之後的不帶過去；
  // 現在這段會存起來。所以每一則 AI 底下都掛得住。滿檔時鍵在但不能按。
  if (isAI && item.id !== 0) {
    actions.push({ key: 'fork', label: t('canvas.archive.forkHere'), disabled: archivesFull.value })
  }
  actions.push({ key: 'copy', label: t('chat.copy') })
  if (item.id !== 0) {
    actions.push({ key: 'delete', label: t('chat.delete') })
  }
  return actions
})

function openMessageMenu(index: number, anchor: MessageMenuAnchor | null = null) {
  const item = talkList.value[index]
  if (!item || item.chatLoading) return
  menuIndex.value = index
  menuEditing.value = false
  menuAnchor.value = anchor
  menuOpen.value = true
}

function closeMessageMenu() {
  menuOpen.value = false
  menuEditing.value = false
  menuAnchor.value = null
  menuIndex.value = -1
}

function onMenuPick(key: string) {
  const index = menuIndex.value
  const item = talkList.value[index]
  if (!item) return
  switch (key) {
    case 'copy':
      copyText(null, item.content, t('canvas.copied'))
      closeMessageMenu()
      break
    case 'rewrite':
      closeMessageMenu()
      confirmReiteration(index)
      break
    case 'edit':
      menuDraft.value = item.content || ''
      menuEditing.value = true
      break
    case 'continue':
      closeMessageMenu()
      doContinue(item, index)
      break
    case 'resume-agent':
      // 中斷卡上的「繼續」：接著跑被停下的那一輪 Agent，不是重新開始。
      resumeAgentOperation()
      break
    case 'fork':
      closeMessageMenu()
      askForkArchive(String(item.id || ''))
      break
    case 'rewind':
      closeMessageMenu()
      // 劇情回溯：把故事倒回這一則。開放 API 一直有這條路由，缺的只是入口——
      // 舊頁面的檢查點選單屬於對話歷史面板，這個客戶端沒有那個面板。
      Modal.confirm({
        title: t('main.tip'),
        content: t('canvas.menu.rewindConfirm'),
        okText: t('main.sure'),
        cancelText: t('main.cancel'),
        onOk() { loadConversation(item.id) },
      })
      break
    case 'delete':
      closeMessageMenu()
      Modal.confirm({
        title: t('main.tip'),
        content: t('chat.delete_chat_tips'),
        okText: t('main.sure'),
        cancelText: t('main.cancel'),
        onOk() { chatDelete(item.id) },
      })
      break
    default:
      closeMessageMenu()
  }
}

function onMessageAction(key: string, index: number) {
  // 氣泡底下的「上下文 NN%」chip：不經選單，直接彈這段對話最近一次完成回覆的組成（mobile 同一份）。
  if (key === 'context-usage') { openContextBreakdownSheet(); return }
  menuIndex.value = index
  onMenuPick(key)
}

// ── 上下文用量 chip ──────────────────────────────────────────────────
//
// 分子是那一則 AI 回覆存下來的輸入 token（歷史列有、串流終態沒有——所以每一輪
// 收尾後另外去讀一次歷史，只補這個欄位），分母是它所用模型在玩家目前檔位下的
// 容量。口徑、脫敏、等級門檻都在 canvas-context-usage.ts。
function contextUsageForRow(item: any) {
  const inputTokens = Number(item?.inputTokens)
  if (!Number.isFinite(inputTokens) || inputTokens <= 0) return null
  const modelValue = String(item?.model || '')
  if (!modelValue) return null
  const variant = resolveVariant(modelGroups.value, modelValue)
    || resolveStoredModel(modelGroups.value, modelValue).variant
  if (!variant) return null
  const budget = contextBudgetTokens(variant.contextBudgetOptions, formData.context)
  return formatContextUsage(computeContextUsage({ inputTokens, budgetTokens: budget }), t)
}

let contextUsageRefreshTimers: any[] = []

function cancelContextUsageRefresh() {
  for (const handle of contextUsageRefreshTimers) clearTimeout(handle)
  contextUsageRefreshTimers = []
}

/**
 * 一輪收尾後把最新幾則的輸入 token 讀回來。
 *
 * 串流的終態幀、操作狀態、replay 都不帶用量，只有歷史列有；而用量是收尾之後
 * 才落盤，所以延後一拍再讀，讀不到就再等一次。刻意不走 getHistoryMsg()：
 * 那條路有翻頁旗標、時間軸合併與恢復語意，這裡只想補一個欄位。
 */
function scheduleContextUsageRefresh() {
  cancelContextUsageRefresh()
  const generation = conversationGeneration.value
  const conversationAtSchedule = String(unref(conversationId) || '')
  if (!conversationAtSchedule) return
  const attempt = async (retryLeft: number) => {
    if (!isConversationGenerationCurrent(generation)) return
    if (String(unref(conversationId) || '') !== conversationAtSchedule) return
    let patched = false
    try {
      const res = await _this.http.get(_this.requestUrl.historyMessageList, {
        showLoading: false,
        data: { pageNum: 1, pageSize: 4, conversationId: conversationAtSchedule },
      })
      if (!isConversationGenerationCurrent(generation)) return
      const chats = res?.statusCode == 200 && Array.isArray(res.data?.chats) ? res.data.chats : []
      for (const chat of chats) {
        if (chat?.chatRole !== 'AI') continue
        const tokens = Number(chat.inputTokens)
        if (!Number.isFinite(tokens) || tokens <= 0) continue
        const row = talkList.value.find(r => r && r.type === 0 && (
          String(r.id || '') === String(chat.chatId || '')
          || String(r.chatId || '') === String(chat.chatId || '')
          || String(r.assistantChatId || '') === String(chat.chatId || '')
        ))
        if (!row) continue
        if (row.inputTokens !== tokens || row.model !== chat.model) {
          row.inputTokens = tokens
          row.model = chat.model || row.model || ''
        }
        patched = true
      }
    } catch (e) {
      console.warn('讀取上下文用量失敗', e)
    }
    // 用量是收尾之後才落盤的，實測有時要等好幾秒；沒讀到就拉長間隔再試兩次。
    if (!patched && retryLeft > 0) {
      contextUsageRefreshTimers.push(setTimeout(() => attempt(retryLeft - 1), retryLeft >= 2 ? 4000 : 8000))
    }
  }
  contextUsageRefreshTimers.push(setTimeout(() => attempt(2), 1200))
}

function onMenuConfirmEdit() {
  const item = talkList.value[menuIndex.value]
  if (!item) return
  reWriteContent.value = menuDraft.value
  const chatId = item.id
  closeMessageMenu()
  sureRewrite(chatId)
}

// ── 輸入區 ─────────────────────────────────────────────────────────────
const composerSendState = computed(() => {
  const state = unref(actionBtnState)
  // 停止有自己的節點（I-2，見 canvas.css 檔頭），所以主鍵在生成中只是不能按。
  if (state === 'stop' || state === 'compacting') return 'pending'
  // 上一輪沒收尾時主鍵是「繼續」：這時送新訊息沒有意義，玩家要的是把它跑完。
  if (state === 'continue') return 'continue'
  if (state === 'send-disabled') return 'send-disabled'
  return 'send'
})

const isGenerating = computed(() => {
  const state = unref(actionBtnState)
  return state === 'stop' || state === 'compacting'
})

// 輸入區上面那一排放「每次都會碰」的五樣（照 MMD 的習慣）；其餘全部收進「＋」。
const shortcutItems = computed(() => previewOnly.value ? [] : [
  { key: 'model', label: t('canvas.panel.model') },
  { key: 'persona', label: t('canvas.panel.persona') },
  { key: 'directives', label: t('directive.entry') },
  { key: 'notepad', label: t('notepad.entry') },
  { key: 'new-chat', label: t('chat.newchat'), disabled: archivesFull.value },
])

// ── 底部功能面板與彈層 ─────────────────────────────────────────────────
//
// 面板的格子照 MMD 的「＋」選單挑，但只留開放契約真的做得到的：
// 自訂指令、用戶人設、設定補充、劇情總結、遊玩教程都不在 v1 裡，
// 放一顆按下去沒反應的鍵比沒有那顆鍵更糟。
const panel = ref<CanvasPanelState>(createPanelState())

// 「＋」放得下全部：快捷列上的五樣也留著，玩家不必記得哪一樣在哪裡。
const moreItems = computed(() => previewOnly.value ? [
  { key: 'bottom', label: t('canvas.shortcut.toBottom') },
] : [
  { key: 'model', label: t('canvas.panel.model') },
  { key: 'persona', label: t('canvas.panel.persona') },
  { key: 'directives', label: t('directive.entry') },
  { key: 'notepad', label: t('notepad.entry') },
  // AI 自己每輪記下的記錄（owner 2026-09-05：「AI 自己記的記錄，我們都看不到」）。
  // 身分跟 mobile 同一條判準：Agent 開著是「AI 記事本」，沒開是「永久記憶」。
  { key: 'memory', label: deepPrepOn.value ? t('chat.aiNotebookEntry') : t('chat.permanentMemory') },
  // owner 2026-09-05：這兩顆照它們實際做的事叫——「新的對話」其實是存檔（把現在這段
  // 存起來、開新的），清單入口其實是讀檔。分叉屬於訊息那一層（每則的「⋯」），不放這裡。
  { key: 'new-chat', label: t('canvas.archive.saveAndNew'), disabled: archivesFull.value },
  { key: 'conversations', label: t('canvas.archive.load') },
  { key: 'background', label: t('canvas.panel.background') },
  { key: 'font', label: t('canvas.panel.font') },
  { key: 'reset-chat', label: t('canvas.panel.reset') },
  { key: 'export', label: t('canvas.panel.export') },
  { key: 'bottom', label: t('canvas.shortcut.toBottom') },
])

function closeCanvasSheet() {
  panel.value = closeSheet(panel.value)
}

function onPanelPick(key: string) {
  panel.value = closeMore(panel.value)
  onShortcut(key)
}

function onShortcut(key: string) {
  if (key === 'new-chat') {
    // 滿了就不問「要不要開新的」——先講清楚為什麼開不了、給一條去刪的路。
    if (archivesFull.value) { askArchivesFull(); return }
    askConfirm('new-chat', t('canvas.archive.saveAndNew'), t('canvas.archive.saveAndNewHint'), t('canvas.archive.saveAndNew'))
    return
  }
  if (key === 'fork-archive') {
    askForkArchive()
    return
  }
  if (key === 'bottom') {
    autoScrollEnabled.value = true
    scrollToBottom(true)
    return
  }
  if (key === 'model') { openModelSelect(); return }
  if (key === 'conversations') { openConversationList(); return }
  if (key === 'persona') { openPersonaSheet(); return }
  if (key === 'directives') { openDirectivesSheet(); return }
  if (key === 'notepad') { openNotepadSheet(); return }
  if (key === 'memory') { openMemorySheet(); return }
  if (key === 'background') { panel.value = openSheet(panel.value, 'background'); return }
  if (key === 'font') { panel.value = openSheet(panel.value, 'font'); return }
  if (key === 'reset-chat') {
    askConfirm('reset-chat', t('canvas.panel.reset'), t('canvas.panel.resetConfirm'), t('canvas.panel.reset'))
    return
  }
  if (key === 'export') { exportConversation(); return }
}

// ── 一次性確認 ─────────────────────────────────────────────────────────
const confirmSpec = ref<{ kind: string; title: string; content: string; okText: string; onOk?: () => void }>({ kind: '', title: '', content: '', okText: '' })

function askConfirm(kind: string, title: string, content: string, okText: string, onOk?: () => void) {
  confirmSpec.value = { kind, title, content, okText, onOk }
  panel.value = openSheet(panel.value, 'confirm')
}

function onConfirmCancel() {
  // 從記憶那一片來的確認：取消要回到清單，不能把玩家丟在空畫布上。
  if (confirmSpec.value.kind === 'delete-memory') {
    memory.value = { ...memory.value, pendingDeleteId: '' }
    panel.value = openSheet(panel.value, 'memory')
    return
  }
  closeCanvasSheet()
}

function onConfirmOk() {
  const kind = confirmSpec.value.kind
  const onOk = confirmSpec.value.onOk
  closeCanvasSheet()
  // 帶回呼的一次性確認（重新生成、倒回、刪除、上下文提示）：做完就把回呼丟掉。
  if (kind === 'modal') { confirmSpec.value = { ...confirmSpec.value, onOk: undefined }; if (onOk) onOk(); return }
  if (kind === 'new-chat') { onConfirmStartNewConversation(); return }
  if (kind === 'reset-chat') { resetConversation(); return }
  if (kind === 'fork-archive') { forkArchive(); return }
  if (kind === 'delete-archive') {
    const target = pendingDeleteArchive.value
    pendingDeleteArchive.value = ''
    deleteArchive(target)
    return
  }
  if (kind === 'archives-full') { openConversationList(); return }
  if (kind === 'delete-memory') {
    // 確認框把記憶那一片換掉了（同時只有一個彈層）；刪完要把清單開回來，
    // 不然玩家按完「刪除」落在空畫布上，不知道刪成了沒有。
    const target = memory.value.pendingDeleteId
    memory.value = { ...memory.value, pendingDeleteId: '' }
    panel.value = openSheet(panel.value, 'memory')
    deleteMemoryAtom(target)
    return
  }
}

// ── 模型目錄 ───────────────────────────────────────────────────────────
//
// 目錄只在這一頁讀一次：清單、每輪點數、上下文檔位、思考檔位都從同一份來，
// 不另外抄一份到別的狀態裡（兩份遲早會各說各話）。
const modelGroups = ref<any[]>([])

async function loadModelCatalog(retryLeft = 1) {
  try {
    const res = await _this.http.get(_this.requestUrl.getModelListV2, {
      data: { contextLevel: formData.context, roleId: unref(roleId) },
      showLoading: false,
      timeout: 10000,
    })
    if (res.statusCode === 200 && Array.isArray(res.data)) modelGroups.value = res.data
  } catch (e) {
    // 讀不到目錄時輸入區就不顯示點數、模型設定裡是一句空清單的提示、
    // 每則回覆底下的上下文用量也算不出分母。對話本身照跑：換模型是選配，聊天不是。
    // 進場那一次常撞上其他請求一起排隊而逾時（實測），隔幾秒再試一次就好。
    console.warn('模型目錄載入失敗', e)
    if (retryLeft > 0) setTimeout(() => { loadModelCatalog(retryLeft - 1) }, 4000)
  }
}

/*
  已存的代號換算成「畫面上這是哪一條線路」。

  兩種代號都查不到字面：線路上線前存下的基礎代號（`relay-claude-sonnet-4-5`
  ——目錄裡只有它的線路 `-ripple` / `-drizzle`），以及還沒挑過模型時客戶端手上的
  佔位代號。查不到就沒有一條標成「現在用的」、輸入區也沒有點數，看起來像壞了。

  **只換算給畫面看。** 存起來的值與送出去的值都還是 formData.selectModel，
  直到玩家自己挑一條線路為止——玩家沒動手就改掉他的設定，他完全不會知道。
*/
const selectedVariant = computed(() => {
  const exact = resolveVariant(modelGroups.value, formData.selectModel)
  if (exact) return exact
  return resolveStoredModel(modelGroups.value, formData.selectModel).variant
})
const selectedVariantValue = computed(() => selectedVariant.value?.value || formData.selectModel)
/*
  頂欄與模型設定那一列寫的是「模型名 · 線路名」。

  伺服器回的 `selectModelName` 是模型的**內部代號**（`relay-claude-sonnet-4-5-ripple`
  這種字串）——那是查表用的值，不是給人看的字。目錄一到手就換成友善名；換不到的
  時候才留著伺服器給的那個，總比一片空白好。
*/
watch(selectedVariant, (variant) => {
  if (!variant) return
  formData.selectModelName = composeModelDisplayName(variant, variant.family)
}, { immediate: true })

const modelScoreText = computed(() => scoreParts(selectedVariant.value).text)
const modelScoreDynamic = computed(() => scoreParts(selectedVariant.value).dynamic)
const modelPanelLabels = computed(() => ({
  close: t('main.cancel'),
  done: t('main.sure'),
  perTurn: t('canvas.panel.perTurn'),
  contextTitle: t('modelSelect.contextBudgetShort'),
  contextHint: t('canvas.panel.contextHint'),
  thinkingTitle: t('modelSelect.thinkingDepth'),
  thinkingHint: t('canvas.panel.thinkingHint'),
}))

/*
  模型選單按下確認：模型、線路、上下文檔位、思考深度一次交回來。

  三個值一起寫是必要的：不同模型能吃的檔位不一樣，只換模型不換檔位會送出
  伺服器不認得的檔位。選單裡已經算好了，這裡照收。
*/
function onApplyModelSettings(payload: any) {
  const next = payload || {}
  /*
    只有玩家真的挑了另一條線路才動模型。

    選單手上拿到的是**換算過**的值（線路上線前存的基礎代號在目錄裡沒有本人，
    畫面上標亮的是家族的代表線路）。按確認時它會把那個代表線路交回來——照收的話，
    玩家只是進來看了一眼上下文檔位，他存的代號就被悄悄換掉了。
  */
  const resolvedNow = selectedVariantValue.value
  if (typeof next.selectModel === 'string' && next.selectModel && next.selectModel !== resolvedNow) {
    formData.selectModel = next.selectModel
  }
  const variant = findVariant(modelGroups.value, next.selectModel)
  if (variant) formData.selectModelName = composeModelDisplayName(variant, variant.family)
  if (Number.isFinite(Number(next.context))) formData.context = Number(next.context)
  if (typeof next.thinkingDepth === 'string') formData.thinkingDepth = next.thinkingDepth
  persistRoleSettings()
  // 目錄的標價是按上下文檔位算的，換了檔位就重抓一次，否則玩家在決定的那一刻
  // 看到的是舊價。
  loadModelCatalog()
  // 換了模型，Agent 模式支不支援也跟著變。
  loadMultiPassPreference()
}

// ── 這張卡的遊玩設定 ───────────────────────────────────────────────────
//
// 送出那一輪讀的是這一份，不是玩家偏好（偏好只管外觀）。所以模型、上下文檔位、
// 思考深度、稱呼與自我介紹都從這裡讀、往這裡寫。
//
// 寫入只送動到的欄位：伺服器那一端每個欄位都是指標，沒送＝不動。整包送出會把
// 玩家剛在別處存好的值蓋回這一頁手上的舊快照。
let roleSettingsSnapshot: RoleSettings = { ...ROLE_SETTINGS_DEFAULTS }
const roleSettingsReady = ref(false)
let roleSettingsInFlight: Promise<void> | null = null

function currentRoleSettings(): RoleSettings {
  return {
    userName: formData.userName || '',
    userSex: formData.userSex || '',
    userDefine: formData.userDefine || '',
    selectModel: formData.selectModel || '',
    context: Number(formData.context) || 1,
    thinkingDepth: formData.thinkingDepth || '',
    sandboxLevel: formData.sandboxLevel || '',
    jailbreak: formData.jailbreak || '',
  }
}

async function loadRoleSettings() {
  const targetRoleId = String(unref(roleId) || '')
  if (!targetRoleId) return
  try {
    const res = await _this.http.get(_this.requestUrl.playerRoleSettings, {
      data: { roleId: targetRoleId },
      showLoading: false,
      timeout: 10000,
    })
    if (res.statusCode !== 200 || !res.data) return
    const settings = readRoleSettings(res.data)
    roleSettingsSnapshot = { ...settings }
    Object.assign(formData, settings)
    formData.selectModelName = String(res.data.selectModelName || '') || settings.selectModel
    defaultJailbreak.value = String(res.data.defaultJailbreak || '')
    roleSettingsReady.value = true
  } catch (e) {
    // 讀不到就用畫面上的預設值繼續。對話本身照跑——設定是選配，聊天不是。
    console.warn('遊玩設定載入失敗', e)
  }
}

function ensureRoleSettings() {
  if (roleSettingsReady.value) return Promise.resolve()
  if (!roleSettingsInFlight) {
    roleSettingsInFlight = loadRoleSettings().finally(() => { roleSettingsInFlight = null })
  }
  return roleSettingsInFlight
}

async function persistRoleSettings() {
  const payload = buildRoleSettingsSavePayload(
    String(unref(roleId) || ''), roleSettingsSnapshot, currentRoleSettings(),
  )
  // 一個字都沒動就連請求都不發。
  if (!payload) return true
  try {
    const res = await _this.http.post(_this.requestUrl.playerRoleSettingsSave, {
      header: { 'content-type': 'application/json' },
      data: payload,
      showLoading: false,
    })
    if (res.statusCode !== 200) {
      // 稱呼與自我介紹會過內容審核，被擋下時伺服器講的是原因——照講給玩家聽，
      // 不要換成一句「儲存失敗」。
      const reason = (res.data && (res.data.error || res.data.message)) || ''
      uni.showToast({ title: String(reason || t('main.save_failed')), icon: 'none' })
      return false
    }
    roleSettingsSnapshot = { ...roleSettingsSnapshot, ...currentRoleSettings() }
    return true
  } catch (e) {
    uni.showToast({ title: t('main.save_failed'), icon: 'none' })
    return false
  }
}

// ── 用戶人設 ───────────────────────────────────────────────────────────
//
// 稱呼與自我介紹會過內容審核。被擋下時伺服器講的是原因——原樣留在這一片裡，
// 不要換成一句「儲存失敗」：玩家改不了他看不見的東西。
const personaSaving = ref(false)
const personaError = ref('')

const personaSexOptions = computed(() => [
  { value: 'man', label: t('create.roleSex_man') },
  { value: 'women', label: t('create.roleSex_women') },
  { value: 'other', label: t('create.roleSex_other') },
])

// 由弱到強。每一檔帶一句「什麼時候該用它」——少了那句話，玩家只能靠猜，
// 而猜錯的代價是角色開始拒演，他不會知道是這裡造成的。
const personaSandboxOptions = computed(() => [
  { value: 'light', label: t('chat.sandbox_light'), hint: t('chat.sandboxHint_light') },
  { value: 'standard', label: t('chat.sandbox_standard'), hint: t('chat.sandboxHint_standard') },
  { value: 'immersive', label: t('chat.sandbox_immersive'), hint: t('chat.sandboxHint_immersive') },
  { value: 'deep', label: t('chat.sandbox_deep'), hint: t('chat.sandboxHint_deep') },
])

const personaLabels = computed(() => ({
  title: t('canvas.panel.persona'),
  cancel: t('main.cancel'),
  save: t('main.sure'),
  nameLabel: t('canvas.panel.personaName'),
  namePlaceholder: t('canvas.panel.personaNamePlaceholder'),
  sexLabel: t('canvas.panel.personaSex'),
  defineLabel: t('canvas.panel.personaDefine'),
  definePlaceholder: t('canvas.panel.personaDefinePlaceholder'),
  sandboxLabel: t('chat.sandboxLevel'),
  sandboxDesc: t('chat.sandboxLevelDesc'),
  advanced: t('canvas.panel.personaAdvanced'),
  jailbreakLabel: t('chat.jailbreak'),
  jailbreakHint: t('chat.jailbreakTips'),
  jailbreakReset: t('chat.jailbreakResetDefault'),
}))

function openPersonaSheet() {
  personaError.value = ''
  ensureRoleSettings()
  panel.value = openSheet(panel.value, 'persona')
}

async function onSavePersona(value: any) {
  if (personaSaving.value) return
  personaSaving.value = true
  personaError.value = ''
  const before = {
    userName: formData.userName, userSex: formData.userSex, userDefine: formData.userDefine,
    sandboxLevel: formData.sandboxLevel, jailbreak: formData.jailbreak,
  }
  formData.userName = String(value?.userName || '')
  formData.userSex = String(value?.userSex || '')
  formData.userDefine = String(value?.userDefine || '')
  formData.sandboxLevel = String(value?.sandboxLevel || '')
  formData.jailbreak = String(value?.jailbreak || '')
  const ok = await persistRoleSettings()
  personaSaving.value = false
  if (!ok) {
    // 存不進去就把畫面退回去：顯示成已儲存卻沒生效，比講出失敗更糟。
    Object.assign(formData, before)
    personaError.value = t('main.save_failed')
    return
  }
  closeCanvasSheet()
}

// ── 自訂指令（長期指令）─────────────────────────────────────────────────
//
// 「這段對話一直有效的要求」，每一輪都會帶上去。它掛在對話上，不是掛在卡片上——
// 對話還沒建立時（例如玩家還在挑開場白）沒有地方可以掛，那時把原因寫出來，
// 不要只把鍵變灰。
const directives = ref<DirectiveState>(createDirectiveState())
const directivePendingDeleteId = ref('')

const directiveLabels = computed(() => ({
  title: t('directive.title'),
  close: t('main.cancel'),
  add: t('directive.add'),
  edit: t('directive.edit'),
  delete: t('directive.delete'),
  deleteConfirmShort: t('directive.delete'),
  save: t('directive.save'),
  cancel: t('directive.cancel'),
  empty: t('directive.empty'),
  loading: t('canvas.panel.loading'),
  loadFailed: t('directive.loadFailed'),
  retry: t('notepad.retry'),
  placeholder: t('directive.placeholder'),
  waitingConversation: t('directive.waitingConversation'),
  originManual: t('directive.originManual'),
  originAi: t('directive.originAi'),
}))

function openDirectivesSheet() {
  directivePendingDeleteId.value = ''
  panel.value = openSheet(panel.value, 'directives')
  loadDirectives()
}

async function loadDirectives() {
  const id = String(unref(conversationId) || '')
  if (!id) { directives.value = { ...createDirectiveState() }; return }
  directives.value = { ...directives.value, loading: true, loadFailed: false, error: '' }
  try {
    const res = await _this.http.get(_this.requestUrl.conversationDirectives, {
      data: { conversationId: id },
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200) throw new Error('unexpected status')
    directives.value = {
      ...directives.value,
      ...readDirectiveResponse(res.data),
      loading: false,
      loadFailed: false,
    }
  } catch (e) {
    directives.value = { ...directives.value, loading: false, loadFailed: true }
  }
}

// 三個寫入走同一條路：送出 → 伺服器回最新的整份清單 → 照著重畫。
// 自己在本地拼一份的話，被伺服器改過的地方（排序、狀態）就對不上了。
async function mutateDirectives(url: string, data: any, onFail: string) {
  try {
    const res = await _this.http.post(url, {
      header: { 'content-type': 'application/json' },
      data,
      showLoading: false,
    })
    if (res.statusCode !== 200) {
      directives.value = { ...directives.value, error: humanDirectiveError(res.data, onFail) }
      /*
        失敗之後把清單重讀一次。

        最常見的失敗就是「這一條已經不在了」（在別的裝置刪過、或這一頁手上是舊
        快照）。不重讀的話畫面會一直留著那一列，玩家每按一次刪除都拿到同一句
        錯誤——他看到的東西根本不存在，而畫面沒有任何辦法自己回到真相。
      */
      loadDirectives()
      return false
    }
    directives.value = {
      ...directives.value,
      ...readDirectiveResponse(res.data),
      error: '',
      editingSourceId: '',
      editingText: '',
    }
    return true
  } catch (e) {
    directives.value = { ...directives.value, error: onFail }
    return false
  }
}

/*
  伺服器對指令回的是代號（`DIRECTIVE_NOT_FOUND` 這種字串），不是講給人聽的句子。
  原樣印出去，玩家看到的是一串他無法理解、也無法處理的內部識別符。所以只有在
  伺服器真的回了一句話時才照用；回代號就換成我們自己的說法。
*/
function humanDirectiveError(data: any, fallback: string) {
  const raw = String((data && (data.message || data.error)) || '').trim()
  if (!raw) return fallback
  if (/^[A-Z0-9_]+$/.test(raw)) return fallback
  return raw
}

async function onAddDirective() {
  const id = String(unref(conversationId) || '')
  if (!id) return
  const text = String(directives.value.draft || '').trim()
  if (!canAddDirective(directives.value, true)) return
  const ok = await mutateDirectives(
    _this.requestUrl.conversationDirectiveAdd,
    { conversationId: id, text },
    t('directive.saveFailed'),
  )
  if (ok) directives.value = { ...directives.value, draft: '' }
}

function onEditDirective(sourceId: string) {
  const item = directives.value.list.find((row) => row.sourceId === sourceId)
  if (!item) return
  directivePendingDeleteId.value = ''
  directives.value = startEditDirective(directives.value, item)
}

async function onSaveDirectiveEdit(sourceId: string) {
  const id = String(unref(conversationId) || '')
  if (!id || !canSaveEdit(directives.value)) return
  await mutateDirectives(
    _this.requestUrl.conversationDirectiveUpdate,
    { conversationId: id, sourceId, text: String(directives.value.editingText || '').trim() },
    t('directive.saveFailed'),
  )
}

async function onDeleteDirective(sourceId: string) {
  const id = String(unref(conversationId) || '')
  directivePendingDeleteId.value = ''
  if (!id) return
  await mutateDirectives(
    _this.requestUrl.conversationDirectiveDelete,
    { conversationId: id, sourceId },
    t('directive.saveFailed'),
  )
}

// ── 這則回覆的組成 ─────────────────────────────────────────────────────
//
// 氣泡底下的「上下文 NN%」chip 點開的那一片：上下文由哪些部分組成、各占多少、
// 上一輪快取命中率、本輪花了多少點。mobile 聊天頁那份彈窗搬過來的，同一條伺服器
// 路徑（breakdownVersion=2：mod／手帳／長期指令各自成格）。
//
// 口徑要講清楚：伺服器回的是「這段對話最近一次完成的回覆」，不是被點的那一則——
// chip 掛在每一則 AI 氣泡下，但點舊氣泡看到的仍是最新一輪的組成（副標有寫）。
const contextBreakdown = ref({
  report: null as PromptBreakdownReport | null,
  loading: false,
  loadFailed: false,
  activeKey: '',
  modDetailsExpanded: false,
})
const contextBreakdownGate = createPromptDiagnosticsRequestGate()

const contextBreakdownLabels = computed(() => ({
  title: t('promptBreakdown.title'),
  subtitle: t('promptBreakdown.subtitle'),
  close: t('main.cancel'),
  retry: t('promptBreakdown.retry'),
  loadFailed: t('promptBreakdown.modDetailsLoadError'),
  unsupportedModel: t('promptBreakdown.unsupportedModel'),
  notReady: t('promptBreakdown.notReady'),
  totalTokens: t('promptBreakdown.totalTokens'),
  totalChars: t('promptBreakdown.totalChars'),
  tokenUnit: t('promptBreakdown.tokenUnit'),
  pointUnit: t('promptBreakdown.pointUnit'),
  unavailable: t('promptBreakdown.unavailable'),
  billingTotal: t('promptBreakdown.billingTotal'),
  inputPoints: t('promptBreakdown.inputPoints'),
  cacheReadPoints: t('promptBreakdown.cacheReadPoints'),
  outputPoints: t('promptBreakdown.outputPoints'),
  cacheHitRateFull: t('promptBreakdown.cacheHitRateFull'),
  localEstimateNote: t('promptBreakdown.localEstimateNote'),
  expandModDetails: t('promptBreakdown.expandModDetails'),
  collapseModDetails: t('promptBreakdown.collapseModDetails'),
  modDetailsUnavailable: t('promptBreakdown.modDetailsUnavailable'),
  modDetailsLegacy: t('promptBreakdown.modDetailsLegacy'),
  items: Object.fromEntries(BREAKDOWN_META.map((meta) => [meta.key, t(meta.labelKey)])) as Record<string, string>,
  sources: (n: number) => t('promptBreakdown.sources', { n }),
  modsUsed: (n: number) => t('promptBreakdown.modsUsed', { n }),
}))

function resetContextBreakdown() {
  contextBreakdownGate.invalidate()
  contextBreakdown.value = { report: null, loading: false, loadFailed: false, activeKey: '', modDetailsExpanded: false }
}

function openContextBreakdownSheet() {
  panel.value = openSheet(panel.value, 'context-breakdown')
  loadContextBreakdown()
}

async function loadContextBreakdown() {
  const id = String(unref(conversationId) || '').trim()
  if (!id) { resetContextBreakdown(); return }
  // 換了對話：舊報告不能留著給新對話看。
  if (contextBreakdown.value.report && contextBreakdown.value.report.conversationId !== id) resetContextBreakdown()
  const token = contextBreakdownGate.begin(id)
  if (!token) return
  contextBreakdown.value = { ...contextBreakdown.value, loading: true }
  try {
    const res = await _this.http.get(_this.requestUrl.promptDiagnostics, {
      // breakdownVersion=2：mod／手帳／長期指令各自成格，不再混進「系統」
      data: { conversationId: id, breakdownVersion: 2 },
      showLoading: false,
      timeout: 8000,
    })
    if (!contextBreakdownGate.isCurrent(token)) return
    if (String(unref(conversationId) || '').trim() !== id) return
    const report = res && res.statusCode === 200 ? normalizeServerReport(res.data) : null
    if (!report) {
      if (!contextBreakdown.value.report) contextBreakdown.value = { ...contextBreakdown.value, loadFailed: true }
      return
    }
    contextBreakdown.value = { ...contextBreakdown.value, report, loadFailed: false, modDetailsExpanded: false }
  } catch (e) {
    if (!contextBreakdownGate.isCurrent(token)) return
    if (!contextBreakdown.value.report) contextBreakdown.value = { ...contextBreakdown.value, loadFailed: true }
    console.warn('[ContextBreakdown] 讀取失敗:', e)
  } finally {
    if (contextBreakdownGate.finish(token)) contextBreakdown.value = { ...contextBreakdown.value, loading: false }
  }
}

function onSelectContextBreakdownItem(key: string) {
  contextBreakdown.value = { ...contextBreakdown.value, activeKey: key, modDetailsExpanded: false }
}

function onToggleContextBreakdownModDetails() {
  contextBreakdown.value = { ...contextBreakdown.value, modDetailsExpanded: !contextBreakdown.value.modDetailsExpanded }
}

// ── AI 記事本／永久記憶 ────────────────────────────────────────────────
//
// AI 自己每輪記下的記錄（記憶原子）。mobile memoryPage 那一頁的彈窗版：看得到、能刪、
// 長的能收合。身分跟 mobile 同一條判準（deepPrepOn）：Agent 開著是「AI 記事本」
// （角色自己記的，關不掉），沒開是「永久記憶」（背景整理的）。mobile 那一頁在
// 非 Agent 模式還有一顆 VIP 開關，那是角色設定的一部分，這裡不放——畫布另有設定入口。
//
// 展開狀態與正在刪哪一條都放在頁面：元件只畫。刪除走畫布自己的確認框（askConfirm），
// 確認框會把這一片換掉，所以確認後要再把它開回來（見 onConfirmOk）。
const memory = ref({
  atoms: [] as MemoryAtom[],
  loading: false,
  loadFailed: false,
  expandedIds: {} as Record<string, boolean>,
  deletingId: '',
  pendingDeleteId: '',
  /** 這份清單屬於哪段對話；換了對話就整份清掉 */
  conversationId: '',
})

const memoryLabels = computed(() => ({
  title: deepPrepOn.value ? t('chat.aiNotebookTitle') : t('chat.permanentMemory'),
  // mobile 的 aiNotebookTip 講的是「向左滑刪除」，那是手機手勢；這裡用不帶手勢的那句。
  subtitle: deepPrepOn.value ? t('chat.aiNotebookDesc') : t('chat.memoryTip'),
  close: t('main.cancel'),
  loading: t('canvas.panel.loading'),
  loadFailed: t('notepad.loadFailed'),
  retry: t('notepad.retry'),
  empty: deepPrepOn.value ? t('chat.aiNotebookEmpty') : t('chat.memoryEmpty'),
  delete: t('main.delete'),
  expand: t('chat.memoryExpand'),
  collapse: t('chat.memoryCollapse'),
  sourceAgent: t('chat.memorySourceAgent'),
  sourceAuto: t('chat.memorySourceAuto'),
  time: {
    now: t('chat.memoryTimeNow'),
    min: t('chat.memoryTimeMin'),
    hour: t('chat.memoryTimeHour'),
    day: t('chat.memoryTimeDay'),
    month: t('chat.memoryTimeMonth'),
  },
}))

function memoryUrl(template: string, params: Record<string, string>) {
  let url = String(template || '')
  for (const [key, value] of Object.entries(params)) url = url.replace(`{${key}}`, encodeURIComponent(value))
  return url
}

function openMemorySheet() {
  panel.value = openSheet(panel.value, 'memory')
  loadMemory()
}

async function loadMemory(retryLeft = 1) {
  const id = String(unref(conversationId) || '').trim()
  // 換了對話：舊清單與展開狀態不能留給新對話看。
  if (memory.value.conversationId !== id) {
    memory.value = { ...memory.value, atoms: [], expandedIds: {}, deletingId: '', pendingDeleteId: '', loadFailed: false, conversationId: id }
  }
  if (!id) { memory.value = { ...memory.value, loading: false }; return }
  memory.value = { ...memory.value, loading: true, loadFailed: false }
  let retrying = false
  try {
    const res = await _this.http.get(memoryUrl(_this.requestUrl.memoryAtoms, { conversationId: id }), {
      showLoading: false,
      timeout: 10000,
    })
    if (String(unref(conversationId) || '').trim() !== id) return
    if (!res || res.statusCode !== 200) {
      memory.value = { ...memory.value, loadFailed: true }
      return
    }
    memory.value = { ...memory.value, atoms: normalizeMemoryAtoms(res.data), loadFailed: false }
  } catch (e) {
    if (String(unref(conversationId) || '').trim() !== id) return
    // 連線被中斷這種傳輸層失敗先自己重送一次，不要一開彈窗就給玩家看「載入失敗」。
    if (retryLeft > 0 && isTransportFailure(e)) {
      retrying = true
      await new Promise((r) => setTimeout(r, 800))
      return loadMemory(retryLeft - 1)
    }
    memory.value = { ...memory.value, loadFailed: true }
    console.warn('[Memory] 讀取失敗:', e)
  } finally {
    // 重送中的那一輪自己會收尾；這裡收尾會讓骨架在重送期間閃一下。
    if (!retrying && String(unref(conversationId) || '').trim() === id) memory.value = { ...memory.value, loading: false }
  }
}

function onToggleMemoryExpand(atomId: string) {
  if (!atomId) return
  const expandedIds = { ...memory.value.expandedIds, [atomId]: !memory.value.expandedIds[atomId] }
  memory.value = { ...memory.value, expandedIds }
}

function askDeleteMemoryAtom(atomId: string) {
  if (!atomId || memory.value.deletingId) return
  memory.value = { ...memory.value, pendingDeleteId: atomId }
  // 確認語意照 mobile：Agent 模式講「角色之後就不會再記得這件事」，一般模式講「可能會再次被提取」。
  askConfirm(
    'delete-memory',
    t('main.delete'),
    deepPrepOn.value ? t('chat.aiNotebookDeleteConfirm') : t('chat.memoryDeleteConfirm'),
    t('main.delete'),
  )
}

async function deleteMemoryAtom(atomId: string) {
  const id = String(unref(conversationId) || '').trim()
  if (!atomId || !id) return
  memory.value = { ...memory.value, deletingId: atomId }
  try {
    const res = await _this.http.request({
      method: 'DELETE',
      url: memoryUrl(_this.requestUrl.memoryDeleteAtom, { conversationId: id, atomId }),
      showLoading: false,
      timeout: 10000,
    })
    const atoms = applyMemoryDeleteResponse(memory.value.atoms, atomId, res)
    const expandedIds = { ...memory.value.expandedIds }
    delete expandedIds[atomId]
    memory.value = { ...memory.value, atoms, expandedIds }
    uni.showToast({ title: t('chat.memoryDeleted'), icon: 'none' })
  } catch (e) {
    console.error('[Memory] 刪除失敗:', e)
    uni.showToast({ title: t('chat.memoryDeleteFailed'), icon: 'none' })
  } finally {
    memory.value = { ...memory.value, deletingId: '' }
  }
}

// ── AI 筆記 ────────────────────────────────────────────────────────────
//
// 只有玩家看得到的一份記錄，AI 每一輪都會讀。載入失敗時不給編輯入口：
// 伺服器上那份還在，開放編輯等於讓玩家用一片空白覆蓋掉自己的記錄。
const notepad = ref({
  draft: '',
  /** 伺服器上目前存著的那份。跟草稿不一樣＝有沒存的修改，關掉前要問一次。 */
  savedContent: '',
  maxLength: 10000,
  discountThreshold: 2000,
  loading: false,
  loadFailed: false,
  saving: false,
  templatesOpen: false,
  templates: [] as Array<{ templateId: string; title?: string }>,
  // 分享碼：貼碼→預覽→匯入；產生→複製／停止分享。
  code: '',
  previewing: false,
  previewOpen: false,
  previewTitle: '',
  previewContent: '',
  pendingCode: '',
  importing: false,
  shareOpen: false,
  shareCode: '',
  copyOpen: false,
  error: '',
})

// 可以抄過來的來源：這個帳號聊過的其他卡（開放契約的 conversation/list，扣掉現在這一張卡）。
// 這份跟「存檔」不是同一份：存檔只列這張卡；抄筆記要的是別張卡上的那段對話。
const notepadSourceRows = ref<any[]>([])

async function loadNotepadSourceRows() {
  try {
    const res = await _this.http.get(_this.requestUrl.chatList, {
      data: { pageNum: 1, pageSize: 50 },
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200) return
    const list: any[] = (res.data && res.data.conversations) || []
    if (!Array.isArray(list)) return
    const current = String(unref(roleId) || '')
    notepadSourceRows.value = list.map((row: any) => {
      const rowRoleId = String(row?.conversationRoleId || row?.roleId || '')
      return {
        key: rowRoleId,
        conversationId: String(row?.conversationId || ''),
        name: row?.roleName || row?.conversationName || rowRoleId,
        current: rowRoleId === current,
      }
    }).filter((row: any) => row.key)
  } catch (e) {
    console.warn('筆記來源清單載入失敗', e)
  }
}

const notepadCopyRows = computed(() => notepadSourceRows.value
  .filter((row: any) => row && row.key && !row.current)
  .map((row: any) => ({ key: row.key, name: row.name })))

const notepadLabels = computed(() => ({
  title: t('notepad.title'),
  subtitle: t('notepad.subtitle'),
  close: t('main.cancel'),
  save: t('notepad.save'),
  loading: t('canvas.panel.loading'),
  loadFailed: t('notepad.loadFailed'),
  retry: t('notepad.retry'),
  placeholder: t('notepad.placeholder'),
  waitingConversation: t('directive.waitingConversation'),
  costNotice: t('notepad.costNotice', { threshold: notepad.value.discountThreshold }),
  overBy: t('notepad.overBy', { count: Math.max(0, notepad.value.draft.length - notepad.value.maxLength) }),
  templateEntry: t('template.entry'),
  templateApply: t('template.apply'),
  templateEmpty: t('template.empty'),
  templateUntitled: t('template.untitled'),
  templateSaveCurrent: t('template.saveCurrent'),
  templateShare: t('template.share'),
  templateDelete: t('template.delete'),
  templateDeleteConfirm: t('template.deleteConfirm'),
  codePlaceholder: t('template.codePlaceholder'),
  codePreview: t('template.preview'),
  codeMalformed: t('shareCode.errMalformed'),
  codeChecksum: t('shareCode.errChecksum'),
  cancel: t('template.cancel'),
  importToLibrary: t('template.importToLibrary'),
  shareHint: t('template.shareHint'),
  revoke: t('template.revoke'),
  copyCode: t('template.copyCode'),
  done: t('canvas.archive.done'),
  copyFrom: t('notepad.copyFrom'),
  copyEmpty: t('notepad.copyEmpty'),
  copyPick: t('template.apply'),
  copyOverwrite: t('notepad.copyOverwriteContent'),
  copyOverwriteOk: t('notepad.copyOverwriteOk'),
  untitled: t('notepad.untitled'),
  discardTitle: t('notepad.discardTitle'),
  discardOk: t('notepad.discardOk'),
  keepEditing: t('notepad.keepEditing'),
}))

function openNotepadSheet() {
  panel.value = openSheet(panel.value, 'notepad')
  loadNotepad()
}

async function loadNotepad() {
  const id = String(unref(conversationId) || '')
  if (!id) { notepad.value = { ...notepad.value, loading: false, loadFailed: false, draft: '' }; return }
  notepad.value = { ...notepad.value, loading: true, loadFailed: false, error: '' }
  try {
    const res = await _this.http.get(_this.requestUrl.conversationNotepad, {
      data: { conversationId: id },
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200 || !res.data) throw new Error('unexpected status')
    const maxLength = Number(res.data.maxLength)
    const threshold = Number(res.data.discountThreshold)
    notepad.value = {
      ...notepad.value,
      draft: String(res.data.content || ''),
      savedContent: String(res.data.content || ''),
      maxLength: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : notepad.value.maxLength,
      discountThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : notepad.value.discountThreshold,
      loading: false,
      loadFailed: false,
    }
  } catch (e) {
    notepad.value = { ...notepad.value, loading: false, loadFailed: true }
  }
}

async function onSaveNotepad() {
  const id = String(unref(conversationId) || '')
  if (!id || notepad.value.saving) return
  notepad.value = { ...notepad.value, saving: true, error: '' }
  try {
    const res = await _this.http.post(_this.requestUrl.conversationNotepadSave, {
      header: { 'content-type': 'application/json' },
      data: { conversationId: id, content: notepad.value.draft },
      showLoading: false,
    })
    if (res.statusCode !== 200) {
      const reason = (res.data && (res.data.error || res.data.message)) || t('notepad.saveFailed')
      notepad.value = { ...notepad.value, saving: false, error: String(reason) }
      return
    }
    notepad.value = { ...notepad.value, saving: false, error: '', savedContent: notepad.value.draft }
    uni.showToast({ title: t('notepad.saved'), icon: 'none' })
  } catch (e) {
    notepad.value = { ...notepad.value, saving: false, error: t('notepad.saveFailed') }
  }
}

function onToggleNotepadCopy() {
  const open = !notepad.value.copyOpen
  notepad.value = { ...notepad.value, copyOpen: open, templatesOpen: false }
  if (open && !notepadSourceRows.value.length) loadNotepadSourceRows()
}

/*
  把另一段對話的筆記抄過來。

  先去讀那一段的內容再覆蓋，不是把兩份接起來——玩家挑的是「用那一份」。
  覆蓋只動草稿不動伺服器：他還得自己按儲存，中間反悔隨時可以關掉。
*/
async function onCopyNotepadFrom(sourceKey: string) {
  const conversation = notepadSourceRows.value.find((row: any) => row.key === sourceKey)
  const sourceConversationId = String((conversation && conversation.conversationId) || '')
  if (!sourceConversationId) {
    notepad.value = { ...notepad.value, error: t('notepad.loadFailed') }
    return
  }
  try {
    const res = await _this.http.get(_this.requestUrl.conversationNotepad, {
      data: { conversationId: sourceConversationId },
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200 || !res.data) throw new Error('unexpected status')
    notepad.value = {
      ...notepad.value,
      draft: String(res.data.content || ''),
      copyOpen: false,
      error: '',
    }
  } catch (e) {
    notepad.value = { ...notepad.value, error: t('notepad.loadFailed') }
  }
}

function onToggleNotepadTemplates() {
  const open = !notepad.value.templatesOpen
  notepad.value = { ...notepad.value, templatesOpen: open, copyOpen: false }
  if (open) loadNotepadTemplates()
}

async function loadNotepadTemplates() {
  try {
    const res = await _this.http.get(_this.requestUrl.notepadTemplates, {
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200 || !res.data) return
    const list = Array.isArray(res.data.list) ? res.data.list : []
    notepad.value = {
      ...notepad.value,
      templates: list.map((row: any) => ({
        templateId: String(row?.templateId || ''),
        title: String(row?.title || ''),
      })).filter((row: any) => row.templateId),
    }
  } catch (e) {
    notepad.value = { ...notepad.value, error: t('template.loadFailed') }
  }
}

// 清單刻意不帶內容（那是長文，列幾十筆會拖慢），所以套用時才去讀那一筆。
async function onApplyNotepadTemplate(templateId: string) {
  if (!templateId) return
  try {
    const res = await _this.http.get(_this.requestUrl.notepadTemplate, {
      data: { templateId },
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200 || !res.data) throw new Error('unexpected status')
    notepad.value = {
      ...notepad.value,
      draft: String(res.data.content || ''),
      templatesOpen: false,
      error: '',
    }
  } catch (e) {
    notepad.value = { ...notepad.value, error: t('template.loadFailed') }
  }
}

async function onSaveNotepadTemplate() {
  const content = String(notepad.value.draft || '')
  if (!content.trim()) {
    notepad.value = { ...notepad.value, error: t('template.titleInvalid') }
    return
  }
  try {
    const res = await _this.http.post(_this.requestUrl.notepadTemplateSave, {
      header: { 'content-type': 'application/json' },
      data: { title: (roleView.value as any).roleName || t('template.untitled'), content },
      showLoading: false,
    })
    if (res.statusCode !== 200) {
      const reason = (res.data && (res.data.error || res.data.message)) || t('template.saveFailed')
      notepad.value = { ...notepad.value, error: String(reason) }
      return
    }
    notepad.value = { ...notepad.value, error: '' }
    uni.showToast({ title: t('template.saved'), icon: 'none' })
    loadNotepadTemplates()
  } catch (e) {
    notepad.value = { ...notepad.value, error: t('template.saveFailed') }
  }
}

// ── 手帳模板的分享碼 ─────────────────────────────────────────────────
//
// 跟 mobile 的 NotepadTemplateSheet 是同一份行為：貼碼→先看→存進我的模板；
// 產生分享碼→複製／停止分享。每種失敗的下一步不同（核對碼／更新／去問分享者），
// 伺服器回 messageKey，這裡直接用它，不共用一句「匯入失敗」。
function shareCodeErrorText(res: any): string {
  const key = res && res.data && res.data.messageKey
  return key ? t(String(key)) : t('shareCode.errNotFound')
}

async function onPreviewShareCode(canonical: string) {
  if (!canonical || notepad.value.previewing) return
  notepad.value = { ...notepad.value, previewing: true, error: '' }
  try {
    const res = await _this.http.get(_this.requestUrl.shareCodePreview, {
      data: { code: canonical },
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200 || !res.data) {
      notepad.value = { ...notepad.value, previewing: false, error: shareCodeErrorText(res) }
      return
    }
    notepad.value = {
      ...notepad.value,
      previewing: false,
      previewOpen: true,
      shareOpen: false,
      previewTitle: String(res.data.title || ''),
      previewContent: String(res.data.content || ''),
      pendingCode: canonical,
    }
  } catch (e) {
    notepad.value = { ...notepad.value, previewing: false, error: t('shareCode.errNotFound') }
  }
}

function onCancelSharePreview() {
  notepad.value = { ...notepad.value, previewOpen: false, pendingCode: '' }
}

async function onConfirmShareImport() {
  const code = notepad.value.pendingCode
  if (!code || notepad.value.importing) return
  notepad.value = { ...notepad.value, importing: true, error: '' }
  try {
    const res = await _this.http.post(_this.requestUrl.shareCodeImport, {
      header: { 'content-type': 'application/json' },
      data: { code },
      showLoading: false,
    })
    if (res.statusCode !== 200 || !res.data) {
      notepad.value = { ...notepad.value, importing: false, error: shareCodeErrorText(res) }
      return
    }
    // 副本已經是他的了：清掉輸入框、關掉預覽、重讀清單。
    notepad.value = { ...notepad.value, importing: false, previewOpen: false, pendingCode: '', code: '' }
    uni.showToast({ title: t('template.imported'), icon: 'none' })
    loadNotepadTemplates()
  } catch (e) {
    notepad.value = { ...notepad.value, importing: false, error: t('shareCode.errNotFound') }
  }
}

async function onShareNotepadTemplate(templateId: string) {
  if (!templateId) return
  try {
    const res = await _this.http.post(_this.requestUrl.notepadTemplateShare, {
      header: { 'content-type': 'application/json' },
      data: { templateId },
      showLoading: false,
    })
    if (res.statusCode !== 200 || !res.data || !res.data.code) throw new Error('unexpected status')
    notepad.value = { ...notepad.value, shareOpen: true, previewOpen: false, shareCode: String(res.data.code), error: '' }
  } catch (e) {
    notepad.value = { ...notepad.value, error: t('template.shareFailed') }
  }
}

function onCopyShareCode() {
  const code = notepad.value.shareCode
  if (!code) return
  uni.setClipboardData({
    data: code,
    success: () => uni.showToast({ title: t('template.copied'), icon: 'none' }),
  })
}

// 撤銷只擋住之後的匯入；已經匯入的人手上是自己的副本，不受影響（文案有講）。
async function onRevokeShare() {
  const code = notepad.value.shareCode
  if (!code) return
  try {
    const res = await _this.http.post(_this.requestUrl.notepadTemplateShareRevoke, {
      header: { 'content-type': 'application/json' },
      data: { code },
      showLoading: false,
    })
    if (res.statusCode !== 200) throw new Error('unexpected status')
    notepad.value = { ...notepad.value, shareOpen: false, shareCode: '' }
    uni.showToast({ title: t('template.revoked'), icon: 'none' })
  } catch (e) {
    notepad.value = { ...notepad.value, error: t('template.shareFailed') }
  }
}

function onCloseShare() {
  notepad.value = { ...notepad.value, shareOpen: false }
}

async function onDeleteNotepadTemplate(templateId: string) {
  if (!templateId) return
  try {
    const res = await _this.http.post(_this.requestUrl.notepadTemplateDelete, {
      header: { 'content-type': 'application/json' },
      data: { templateId },
      showLoading: false,
    })
    if (res.statusCode !== 200) throw new Error('unexpected status')
    loadNotepadTemplates()
  } catch (e) {
    notepad.value = { ...notepad.value, error: t('template.loadFailed') }
  }
}

// ── 歷史對話 ───────────────────────────────────────────────────────────
//
// ── 存檔（這張卡的對話清單）─────────────────────────────────────────
//
// owner 2026-09-04：歷史對話＝這張卡的存檔。伺服器的 /conversation/archives 依 roleId
// 只回這張卡的段落；點一列是切到那一段，不是換卡。可以取名、可以在最新節點分叉
// （把現在這段存起來、分一段帶著同樣歷史的新段），每張卡最多 20 段——上限在伺服器，
// 這裡只負責把「滿了」講清楚並給一條路（刪掉一段再開）。
const archiveRows = ref<ArchiveRow[]>([])
const archiveCount = ref(0)
const archiveLimit = ref(20)
const archiveBusy = ref(false)
const pendingDeleteArchive = ref('')
const archivesFull = computed(() => isArchiveFull(archiveCount.value, archiveLimit.value))
const archiveCountText = computed(() => archiveCount.value + '/' + archiveLimit.value)
const archiveFullText = computed(() => t('canvas.archive.full', { count: archiveCount.value, limit: archiveLimit.value }))
const archiveActionLabels = computed(() => ({
  rename: t('canvas.archive.rename'),
  delete: t('main.delete'),
  done: t('canvas.archive.done'),
  cancel: t('main.cancel'),
}))
const archiveLabels = computed(() => ({
  segment: (n: number) => t('canvas.archive.segment', { n }),
  messages: (n: number) => t('canvas.archive.messages', { n }),
}))

function openConversationList() {
  panel.value = openSheet(panel.value, 'conversations')
  loadArchives()
}

async function loadArchives() {
  const targetRoleId = String(unref(roleId) || '')
  if (!targetRoleId) return
  try {
    const res = await _this.http.get(_this.requestUrl.conversationArchives, {
      data: archiveRequestQuery(targetRoleId),
      showLoading: false,
      timeout: 8000,
    })
    if (res.statusCode !== 200 || !res.data) return
    // 名字與摘要跟訊息一樣只在畫面上轉字形（儲存傳輸原文）。
    archiveRows.value = buildArchiveRows(res.data.archives, archiveLabels.value).map((row) => ({
      ...row,
      name: convertPlainText(row.name, displayScript),
      summary: convertPlainText(row.summary, displayScript),
    }))
    archiveCount.value = Number(res.data.count || 0)
    if (Number(res.data.limit) > 0) archiveLimit.value = Number(res.data.limit)
  } catch (e) {
    console.warn('存檔清單載入失敗', e)
  }
}

function postArchiveAction(url: string, data: Record<string, any>) {
  return _this.http.post(url, {
    header: { 'content-type': 'application/json' },
    showLoading: false,
    data,
  })
}

// 切換／分叉之後的收尾照 saveAndStartNew：拆掉串流、換 conversationId、從第一頁重載訊息。
// 差別只在這裡沒有開場白可以直接推——那一段的訊息在伺服器上，要重新載。
function adoptConversation(nextId: string) {
  teardownStreamForConversationSwitch({ invalidateHistory: true })
  conversationId.value = nextId
  uni.$emit('updateConversationId', { conversationId: nextId })
  talkList.value = []
  openMore.value = false
  ajax.value.page = 1
  ajax.value.flag = true
  autoScrollEnabled.value = true
  isUserAtBottom.value = true
  getHistoryMsg()
}

function reportArchiveFailure(res: any) {
  const detail = res && res.data && typeof res.data.error === 'string' ? res.data.error : ''
  message.error(detail ? t('canvas.archive.failed') + ' (' + detail + ')' : t('canvas.archive.failed'))
}

function askArchivesFull() {
  askConfirm('archives-full', t('canvas.panel.history'), archiveFullText.value, t('canvas.archive.view'))
}

async function onPickArchive(key: string) {
  if (!key || key === String(unref(conversationId) || '')) return
  if (isTimelineMutationBlocked()) { notifyTimelineMutationBlocked(); return }
  if (archiveBusy.value) return
  archiveBusy.value = true
  try {
    const res = await postArchiveAction(_this.requestUrl.conversationSwitch, { conversationId: key })
    if (res.statusCode !== 200) { reportArchiveFailure(res); return }
    closeCanvasSheet()
    adoptConversation(key)
    loadArchives()
  } catch (e) {
    console.error('切換存檔失敗', e)
    message.error(t('canvas.archive.failed'))
  } finally {
    archiveBusy.value = false
  }
}

async function onRenameArchive(key: string, title: string) {
  if (!key) return
  try {
    const res = await postArchiveAction(_this.requestUrl.conversationTitle, { conversationId: key, title })
    if (res.statusCode !== 200) { reportArchiveFailure(res); return }
    loadArchives()
  } catch (e) {
    console.error('存檔改名失敗', e)
    message.error(t('canvas.archive.failed'))
  }
}

// 刪除走二次確認（確認彈層會換掉清單彈層；刪完再把清單開回來）。
function onDeleteArchive(key: string) {
  if (!key) return
  pendingDeleteArchive.value = key
  askConfirm('delete-archive', t('main.delete'), t('canvas.archive.deleteConfirm'), t('main.delete'))
}

async function deleteArchive(key: string) {
  if (!key) return
  if (isTimelineMutationBlocked()) { notifyTimelineMutationBlocked(); return }
  const wasCurrent = key === String(unref(conversationId) || '')
  const successor = nextArchiveAfterDelete(archiveRows.value, key)
  try {
    const res = await postArchiveAction(_this.requestUrl.deleteConversation, { conversationId: key })
    if (res.statusCode !== 200) { reportArchiveFailure(res); return }
    if (wasCurrent) {
      // 刪掉的是正在聊的這段：接手最近的另一段；一段都不剩就重新開一段（伺服器會落開場白）。
      // handoff 沒有寫這一條，這是施工時的決定，回報時列出。
      let adopted = false
      if (successor) {
        const sw = await postArchiveAction(_this.requestUrl.conversationSwitch, { conversationId: successor })
        if (sw.statusCode === 200) { adoptConversation(successor); adopted = true }
      }
      if (!adopted) restartConversationFromScratch()
    }
    await loadArchives()
    openConversationList()
  } catch (e) {
    console.error('刪除存檔失敗', e)
    message.error(t('canvas.archive.failed'))
  }
}

// 帶 chatId＝從那一則分出去（訊息的「⋯」）；不帶＝從最新節點。
const pendingForkChatId = ref('')

function askForkArchive(chatId = '') {
  if (archivesFull.value) { askArchivesFull(); return }
  pendingForkChatId.value = chatId
  const hint = chatId ? t('canvas.archive.forkFromHint') : t('canvas.archive.forkHint')
  askConfirm('fork-archive', t('canvas.archive.fork'), hint, t('canvas.archive.fork'))
}

async function forkArchive() {
  const id = String(unref(conversationId) || '')
  const chatId = pendingForkChatId.value
  pendingForkChatId.value = ''
  if (!id) return
  if (isTimelineMutationBlocked()) { notifyTimelineMutationBlocked(); return }
  if (archiveBusy.value) return
  archiveBusy.value = true
  try {
    const payload: Record<string, string> = { conversationId: id }
    if (chatId) payload.chatId = chatId
    const res = await postArchiveAction(_this.requestUrl.conversationFork, payload)
    if (res.statusCode === 409 && res.data && res.data.error === 'conversation_limit_reached') {
      archiveCount.value = Number(res.data.count || archiveCount.value)
      if (Number(res.data.limit) > 0) archiveLimit.value = Number(res.data.limit)
      askArchivesFull()
      return
    }
    if (res.statusCode !== 200 || !res.data || !res.data.conversationId) { reportArchiveFailure(res); return }
    adoptConversation(String(res.data.conversationId))
    loadArchives()
  } catch (e) {
    console.error('分叉存檔失敗', e)
    message.error(t('canvas.archive.failed'))
  } finally {
    archiveBusy.value = false
  }
}

// ── 更換背景 ───────────────────────────────────────────────────────────
//
// 這一頁不上傳圖片（開放契約沒有那條路）。做得到的是換回卡片自己的背景，
// 或把玩家自己設過的那張拿掉——作者的卡也可以用它自己的方式改背景。
const backgroundOptions = computed(() => {
  const items: Array<{ key: string; label: string; current?: boolean }> = [
    { key: 'reset', label: t('canvas.panel.backgroundReset'), current: !formData.backgroundUrl },
  ]
  const roleBackground = (roleView.value as any).roleBackground
  if (roleBackground) {
    items.push({
      key: 'role',
      label: t('canvas.panel.backgroundRole'),
      current: formData.backgroundUrl === roleBackground,
    })
  }
  return items
})

function onPickBackground(key: string) {
  const roleBackground = (roleView.value as any).roleBackground
  const next = key === 'role' && roleBackground ? roleBackground : ''
  formData.backgroundUrl = next
  savePlayerPreference({ roleId: unref(roleId), prefs: { backgroundUrl: next } })
  closeCanvasSheet()
}

// ── 字體 ───────────────────────────────────────────────────────────────
// 預設跟隨卡片：作者沒指定字體就是黑體，電子閱讀黑體較好；作者要楷體自己在卡片
// CSS 裡寫（寫了 Kaiti 就會拿到文楷備援）。玩家自己想換字體可在這裡選，
// 偏好跟桌布一樣存在這張卡的玩家偏好裡（owner 2026-09-06 裁決）。
type FontMode = 'card' | 'wenkai' | 'system'
const fontMode = computed<FontMode>(() => {
  const saved = String(formData.fontFamily || '')
  if (saved === 'card' || saved === 'wenkai' || saved === 'system') return saved
  return 'card'
})
watch(fontMode, (mode) => applyFontMode(mode), { immediate: true })

const fontOptions = computed(() => ([
  { key: 'card', label: t('canvas.panel.fontCard'), current: fontMode.value === 'card' },
  { key: 'wenkai', label: t('canvas.panel.fontWenKai'), current: fontMode.value === 'wenkai' },
  { key: 'system', label: t('canvas.panel.fontSystem'), current: fontMode.value === 'system' },
]))

function onPickFont(key: string) {
  formData.fontFamily = key
  if (!previewOnly.value) savePlayerPreference({ roleId: unref(roleId), prefs: { fontFamily: key } })
  closeCanvasSheet()
}

// ── 重置聊天 ───────────────────────────────────────────────────────────
function resetConversation() {
  const id = unref(conversationId)
  if (!id) return
  if (isTimelineMutationBlocked()) {
    notifyTimelineMutationBlocked()
    return
  }
  _this.http.post(_this.requestUrl.deleteConversation, {
    header: { 'content-type': 'application/json' },
    showLoading: false,
    data: { conversationId: id },
  }).then((res: any) => {
    if (res.statusCode !== 200) {
      message.error((res.data && res.data.error) || t('main.save_failed'))
      return
    }
    restartConversationFromScratch()
  }).catch((e: any) => {
    console.error('重置聊天失敗', e)
  })
}

// 從頭再開一段：拆掉串流、清掉畫面、讓伺服器重新建對話並落開場白。
// 重置聊天與「刪掉正在聊的那段存檔、又沒有別段可接手」都走這裡。
function restartConversationFromScratch() {
  teardownStreamForConversationSwitch({ invalidateHistory: true })
  conversationId.value = ''
  talkList.value = []
  ajax.value.page = 1
  ajax.value.flag = true
  autoScrollEnabled.value = true
  isUserAtBottom.value = true
  chatStart()
}

// ── 匯出聊天 ───────────────────────────────────────────────────────────
//
// 匯出的是「這一頁現在載進來的那些訊息」——再往前的還在伺服器上，沒有翻頁
// 就不在這份檔案裡。複製到剪貼簿之外也給一份檔案：長對話貼不進大部分輸入框。
function buildConversationExport() {
  const roleName = (roleView.value as any).roleName || ''
  const lines: string[] = []
  if (roleName) lines.push('# ' + roleName, '')
  for (const item of talkList.value as any[]) {
    const text = String(item?.content || '').trim()
    if (!text) continue
    const who = item?.type === 1 ? userDisplayName() : (roleName || t('canvas.you'))
    lines.push('**' + who + '**', '', text, '')
  }
  return lines.join('\n')
}

function exportConversation() {
  panel.value = closeMore(panel.value)
  const text = buildConversationExport()
  if (!text.trim()) {
    uni.showToast({ title: t('canvas.panel.exportEmpty'), icon: 'none' })
    return
  }
  try {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clip && typeof clip.writeText === 'function') clip.writeText(text)
  } catch (e) { /* 不給讀寫剪貼簿時還有下載那條路 */ }
  downloadConversationFile(text)
  uni.showToast({ title: t('canvas.copied'), icon: 'none' })
}

function downloadConversationFile(text: string) {
  try {
    if (typeof document === 'undefined' || typeof Blob === 'undefined') return
    const roleName = ((roleView.value as any).roleName || 'chat').replace(/[\\/:*?"<>|]/g, '_')
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = roleName + '.md'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    console.warn('匯出檔案失敗', e)
  }
}

/**
 * 送出。有替代開場白的卡在這一刻才真的開對話——選到哪一條要跟著這一次請求走。
 */
async function onCanvasSend() {
  if (pendingGreetingStart.value) {
    const index = greetingIndexForStart(greeting)
    const draft = content.value
    pendingGreetingStart.value = false
    talkList.value = []
    try {
      await chatStart(index)
    } catch (e) {
      // 請求層自己吞錯誤，這裡多半走不到；留著是為了真的丟出來的那種。
    }
    // 開對話成不成功看的是有沒有拿到對話——請求層對失敗也是 resolve，
    // 用 try/catch 判定會在沒有對話的情況下把訊息送進虛空。
    if (!unref(conversationId)) {
      pendingGreetingStart.value = true
      content.value = draft
      renderGreetingPreview()
      uni.showToast({ title: t('main.network_error'), icon: 'none' })
      return
    }
  }
  onActionBtnClick()
}

function onCanvasStop() {
  sendStop()
}

function onStageScroll(event: Event) {
  handleScroll(event)
}

// ── 離場 ───────────────────────────────────────────────────────────────
//
// 卡片往 body / html 加的 class 帶著它的 !important。不還原的話玩家會帶著
// 上一張卡的美化走到別的頁面去，而他完全看不出那是哪來的。
function restoreDocumentOnLeave() {
  restoreBodySnapshot(typeof document !== 'undefined' ? document : null, enterBodySnapshot)
}


const composerLabels = computed(() => ({
  stop: t('canvas.stop'),
  more: t('chat.moreAria'),
  send: t('canvas.send'),
  paste: t('canvas.composer.paste'),
  clear: t('canvas.composer.clear'),
  model: t('canvas.panel.model'),
  perTurn: t('canvas.composer.perTurn'),
  assist: t(assistLabelKey(content.value, lastAssistReply.value)),
}))

const menuLabels = computed(() => ({
  cancel: t('main.cancel'),
  confirm: t('main.sure'),
}))

</script>
