<template>
	<!--
		模型選單，彈層版。

		它住在畫布彈層的 `.mp-setting-body` 裡，而那一層就是唯一會捲動的容器。
		所以這裡**沒有任何固定高度、沒有第二個捲動容器、沒有浮在清單上的選單**：
		所有東西都在文流裡，一根手指從上滑到下就能看完。原本整頁版的
		「側欄＋雙欄詳情＋釘住的確認鍵」在 560px 寬的彈層裡沒有位置——
		分類與排序收成兩條橫滑 rail，詳情長在被點開的那一列底下，確認鍵是殼上那顆。
	-->
	<div class="ms-sheet">

		<!-- 搜尋框：真的 input（模板裡的 <input> 會被編譯器包一層殼，殼自帶尺寸與一個空的
			 佔位點，看起來像 bug）；左邊放放大鏡，讓人一眼知道這是搜尋。 -->
		<div class="ms-search">
			<span class="ms-search-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
			</span>
			<CanvasInput
				el-class="ms-search-input"
				:value="searchQuery"
				:placeholder="t('modelSelect.searchPlaceholder')"
				@input="searchQuery = $event" />
			<span v-if="searchQuery" class="ms-search-clear" role="button" tabindex="0"
				:aria-label="t('main.cancel')"
				@click="searchQuery = ''"
				@keydown.enter.prevent="searchQuery = ''">×</span>
		</div>

		<!-- 分類。捲動容器本身不留左右內距，第一顆與最後一顆的邊距由內層給，
			 內容才會滑到彈層邊緣才消失（DESIGN §3.3）。 -->
		<div class="ms-rail">
			<div class="ms-rail-inner">
				<div
					v-for="(tab, index) in displayTabs"
					:key="index"
					class="ms-chip model-filter-tab"
					:class="{ 'is-on': tabCurrent === tab.tabIndex, 'active': tabCurrent === tab.tabIndex }"
					@click="tabChange(tab.tabIndex)">
					<span class="ms-chip-text">{{ tab.name }}</span>
				</div>
			</div>
		</div>

		<!-- 排序。不再是彈出的選單——選單蓋在清單上，在手機上就是一片黑。
			 每一個選項都有一句「它實際在比什麼」，選中的那句寫在 rail 底下。 -->
		<div class="ms-sort">
			<span class="ms-eyebrow">{{ t('modelSelect.sortTitle') }}</span>
			<div class="ms-rail">
				<div class="ms-rail-inner">
					<div
						v-for="opt in SORT_OPTIONS"
						:key="opt.value"
						class="ms-chip model-filter-tab"
						:class="{ 'is-on': sortMode === opt.value, 'active': sortMode === opt.value }"
						@click="sortMode = opt.value">
						<span class="ms-chip-text">{{ t(opt.labelKey) }}</span>
					</div>
				</div>
			</div>
			<span class="ms-hint">{{ t(sortDescKey) }}</span>
		</div>

		<!-- 設定常駐：上下文檔位、思考深度、Agent 模式。它們跟著選中的模型走。 -->
		<template v-if="!isLoading">
			<div class="ms-card">
				<span class="ms-card-title">{{ t('modelSelect.contextBudgetShort') }}</span>
				<div class="ms-pills">
					<div
						v-for="item in contextBudgetLevelOptions"
						:key="item.value"
						class="ms-pill token"
						:class="{ 'is-on': item.value === formData.context, 'selected': item.value === formData.context }"
						@click="contextBudgetLevelChange(item.value)">
						<span class="ms-pill-text">{{ item.text }}</span>
					</div>
				</div>
			</div>

			<div v-if="hasThinkingDepthOptions" class="ms-card">
				<span class="ms-card-title">{{ t('modelSelect.thinkingDepth') }}</span>
				<div class="ms-pills">
					<div
						v-for="option in thinkingDepthOptions"
						:key="option.value"
						class="ms-pill mp-token-btn"
						:class="{ 'is-on': formData.thinkingDepth === option.value, 'selected': formData.thinkingDepth === option.value }"
						@click="thinkingDepthChange(option.value)">
						<span class="ms-pill-text">{{ getThinkingOptionLabel(option) }}</span>
					</div>
				</div>
				<!-- 邊界 7：adaptive 模型關不掉思考，檔位選擇器不給「關閉」，
					 改用說明告知模型會自己判斷。 -->
				<span v-if="isAdaptiveThinkingModel" class="ms-hint">{{ t('modelSelect.thinkingAdaptiveHint') }}</span>
				<!-- 「顯示思考過程」是 adaptive 專屬的顯示層開關：只控制聊天中
					 要不要渲染摺疊思考區塊，不影響生成與計費。 -->
				<div v-if="isAdaptiveThinkingModel" class="ms-switch-line">
					<span class="ms-switch-label">{{ t('modelSelect.showThinkingProcess') }}</span>
					<ASwitch
						v-model:checked="formData.showThinkingProcess"
						size="small"
						@change="onShowThinkingProcessChange" />
				</div>
			</div>

			<!-- 模型不支援時停用但仍然顯示，並講出原因。整個消失的話，開著的
				 對話換到不支援的模型之後，使用者看不到也關不掉。 -->
			<div v-if="deepPrepVisible" class="ms-card">
				<div class="ms-switch-line">
					<div class="ms-switch-col">
						<span class="ms-card-title">✦ {{ t('modelSelect.deepPrepLabel') }}</span>
						<span class="ms-hint">{{ deepPrepModelSupported ? t('modelSelect.deepPrepHintBilling') : t('modelSelect.deepPrepUnsupported') }}</span>
					</div>
					<ASwitch
						:checked="deepPrepOn"
						:disabled="!deepPrepModelSupported || deepPrepSaving"
						size="small"
						@change="onDeepPrepChange" />
				</div>
			</div>
		</template>

		<div class="ms-listhead">
			<span class="ms-eyebrow">{{ t('modelSelect.allModels') }} · {{ displayFamilies.length }}</span>
		</div>

		<div class="ms-list">
			<template v-if="isLoading">
				<div v-for="i in 6" :key="'sk-'+i" class="ms-family">
					<div class="ms-row">
						<div class="ms-tile sk"></div>
						<div class="ms-name-col">
							<div class="sk ms-sk-line" style="width:56%"></div>
							<div class="sk ms-sk-line is-thin" style="width:38%"></div>
						</div>
						<div class="sk ms-sk-line" style="width:40px"></div>
					</div>
				</div>
			</template>

			<template v-else-if="displayFamilies.length">
				<!--
					詳情長在被打開的那一列底下，跟列在同一張卡裡。
					列與它的詳情要在**同一次迭代**裡（key 掛在卡上），否則清單重排時詳情會被
					重新掛載，正在看的可用率圖表整個掉回去。
				-->
				<div
					v-for="family in displayFamilies"
					:key="familyKey(family)"
					class="ms-family"
					:class="{
						'is-current': isFamilySelected(family),
						'is-active': detailFamily && detailFamily.family === family.family
					}">
					<!-- 舊頁面的 .model-item 是「一條列」：卡片對選中列寫的是整塊填主色＋白字。
						 名字掛在列上、不掛在整張家族卡上，展開的線路清單才不會整片被填掉
						 （owner 2026-09-05 iPhone 截圖）。 -->
					<div class="ms-row model-item" :class="{ 'model-item-active': isFamilySelected(family) }" @click="toggleDetail(family)">
						<div class="ms-tile" :style="modelIconFor(family) ? { background: modelIconBgFor(family) } : monogramStyle(family)">
							<img v-if="modelIconFor(family)" class="ms-tile-img" :src="modelIconFor(family)"  />
							<span v-else class="ms-tile-mono">{{ family.family.charAt(0).toUpperCase() }}</span>
						</div>

						<div class="ms-name-col">
							<div class="ms-name-line">
								<!-- 狀態燈只有例外態才亮。一頁全綠等於沒有燈。 -->
								<div v-if="rowDotTone(family)" class="ms-dot" :class="'ms-dot-' + rowDotTone(family)"></div>
								<span class="ms-name">{{ family.family }}</span>
								<div v-if="isFamilySelected(family)" class="ms-badge is-accent">
									<span class="ms-badge-text">{{ t('modelSelect.currentInUse') }}</span>
								</div>
								<div v-if="family.discountUntilTs > 0" class="ms-badge is-accent">
									<span class="ms-badge-text">-{{ getDiscountPercent(family) }}%</span>
								</div>
								<div v-else-if="isFreeFamily(family)" class="ms-badge">
									<span class="ms-badge-text">{{ t('modelSelect.free') }}</span>
								</div>
								<div v-else-if="family.isMember" class="ms-badge">
									<span class="ms-badge-text">VIP</span>
								</div>
								<div v-else-if="hasFamilyBadge(family, 'new')" class="ms-badge">
									<span class="ms-badge-text">{{ t('modelSelect.newBadge') }}</span>
								</div>
							</div>
							<span v-if="rowMetaFor(family)" class="ms-meta">{{ rowMetaFor(family) }}</span>
						</div>

						<div class="ms-price-col">
							<span v-if="originalPriceFor(family)" class="ms-price-was">{{ originalPriceFor(family) }}</span>
							<span class="ms-price" :class="{ 'is-accent': family.discountUntilTs > 0 }">{{ priceTextFor(family) }}</span>
						</div>
						<svg class="ms-caret" :class="{ 'is-open': detailFamily && detailFamily.family === family.family }"
							viewBox="0 0 24 24" fill="none" stroke="currentColor"
							stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M6 10l6 5 6-5" />
						</svg>
					</div>

					<template v-if="detailFamily && detailFamily.family === family.family">
						<!-- 第二層：一條線路的 72 小時可用率。同一張卡裡換內容，左上角回上一層。 -->
						<div v-if="laneDetailVariant" class="ms-detail">
							<div class="ms-lane-back" @click="closeLaneDetail">
								<svg class="ms-lane-back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
									stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
								<span class="ms-lane-back-text">{{ laneDetailFamily ? laneDetailFamily.family : '' }}</span>
							</div>
							<span class="ms-detail-name">{{ laneDetailName }}</span>

							<div class="ms-lane-head">
								<div class="ms-chip-status" :class="'ms-chip-' + laneDetailTone">
									<div class="ms-dot" :class="'ms-dot-fill-' + laneDetailTone"></div>
									<span class="ms-chip-status-text">{{ laneDetailStatusText }}</span>
								</div>
								<span v-if="laneHistory && laneHistory.percentText" class="ms-lane-pct">{{ laneHistory.percentText }}</span>
								<span class="ms-lane-pct-cap">{{ t('modelSelect.laneDetailUptime') }}</span>
							</div>

							<div v-if="laneHistoryLoading" class="ms-lane-empty">
								<span class="ms-hint">{{ t('modelSelect.speedObserving') }}</span>
							</div>
							<div v-else-if="!laneBuckets.length" class="ms-lane-empty">
								<span class="ms-hint">{{ t('modelSelect.laneDetailEmpty') }}</span>
							</div>
							<template v-else>
								<div class="ms-buckets">
									<div
										v-for="(b, i) in laneBuckets"
										:key="b.hourStartMs"
										class="ms-bucket"
										:class="['ms-bucket-' + b.tone, { 'ms-bucket-sel': laneSelectedIndex === i }]"
										:style="{ width: laneBucketWidthPct + '%' }"
										@mouseenter="laneSelectedIndex = i"
										@mouseleave="laneSelectedIndex = -1"
										@click.stop="laneSelectedIndex = laneSelectedIndex === i ? -1 : i"></div>
								</div>
								<!-- tooltip 放方塊條**下方**：放上方會蓋掉可用率那個數字。 -->
								<div class="ms-bucket-tipwrap">
									<div v-if="laneSelected" class="ms-bucket-dot" :style="laneDotStyle"></div>
									<div v-if="laneSelected" class="ms-bucket-tip" :style="laneTipStyle">
										<span class="ms-bucket-tip-t">{{ laneSelected.rangeText }}</span>
										<div class="ms-bucket-tip-row">
											<div v-if="laneSelected.tone !== 'none'" class="ms-dot" :class="'ms-dot-fill-' + laneSelected.tone"></div>
											<span class="ms-bucket-tip-v">{{ laneSelected.valueText }}</span>
										</div>
									</div>
								</div>
								<div class="ms-bucket-axis">
									<span class="ms-bucket-axis-t">{{ t('modelSelect.bucketAxisDay3') }}</span>
									<span class="ms-bucket-axis-t">{{ t('modelSelect.bucketAxisDay2') }}</span>
									<span class="ms-bucket-axis-t">{{ t('modelSelect.bucketAxisDay1') }}</span>
									<span class="ms-bucket-axis-t">{{ t('modelSelect.bucketAxisNow') }}</span>
								</div>
								<div class="ms-bucket-legend">
									<div v-for="k in bucketLegend" :key="k.tone" class="ms-bucket-key">
										<div class="ms-bucket-sw" :class="'ms-bucket-' + k.tone"></div>
										<span class="ms-bucket-key-t">{{ k.text }}</span>
									</div>
								</div>
							</template>

							<span class="ms-eyebrow ms-detail-eyebrow">{{ t('modelSelect.laneMetricsHeading') }}</span>
							<div v-for="row in laneDetailMetrics" :key="row.key" class="ms-kv">
								<span class="ms-kv-k">{{ row.label }}</span>
								<span class="ms-kv-v">{{ row.value }}</span>
							</div>
							<span class="ms-src">{{ t('modelSelect.laneHistorySource') }}</span>
						</div>

						<!-- 第一層：說明 → 線路 → 狀況徽章 → 評測與用量。全部在文流裡，一起捲。 -->
						<div v-else class="ms-detail">
							<span class="ms-detail-desc">{{ isFreeFamily(detailFamily) ? t('modelSelect.freeModelDesc') : getDisplayDescription(detailFamily) }}</span>

							<span class="ms-eyebrow ms-detail-eyebrow">{{ optionSectionLabel(detailFamily) }}</span>
							<div
								v-for="variant in getVisibleVariants(detailFamily)"
								:key="variant.value"
								class="ms-opt"
								:class="{ 'is-on': formData.selectModel === variant.value }"
								@click="selectVariant(detailFamily, variant)">
								<div class="ms-opt-line1">
									<div class="ms-radio" :class="{ 'is-on': formData.selectModel === variant.value }"></div>
									<span class="ms-opt-name">{{ optionLabelFor(detailFamily, variant) }}</span>
									<!-- 上游供應商此刻掛著的折扣。扣費是跟著它走的（server 端用供應商現價
										 算成本），所以這個數字不是裝飾。它沒有截止時間，隨時會結束。 -->
									<div v-if="variant.providerDiscountPercent > 0" class="ms-badge is-accent">
										<span class="ms-badge-text">-{{ variant.providerDiscountPercent }}%</span>
									</div>
									<div
										v-if="variantDotTone(variant)"
										class="ms-dot"
										:class="'ms-dot-' + variantDotTone(variant)"></div>
									<span class="ms-opt-price">{{ variantPriceText(variant) }}</span>
								</div>
								<!-- 指標直接掛在這條線路底下，讀的人不必自己配名字。 -->
								<span class="ms-opt-meta">{{ laneMetaFor(variant) }}</span>
								<!-- 整列只有一個結果：選這條線路。次動作只在**已經選中**的那一列出現，
									 而且帶文字——裸箭頭在列尾的語意是「整列會導航」，跟這裡「整列是選取」
									 正好相反。 -->
								<div
									v-if="formData.selectModel === variant.value"
									class="ms-opt-entry"
									@click.stop="openLaneDetail(detailFamily, variant)">
									<span class="ms-opt-entry-text">{{ t('modelSelect.laneDetailEntry') }}</span>
									<svg class="ms-opt-entry-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
										stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
								</div>
							</div>

							<!-- 收在後面的是**比較貴**的那幾條（清單本身由便宜到貴）。標籤寫出
								 被收起來的是什麼、有幾條——只放一個箭頭的話，使用者不知道展開會拿到什麼。 -->
							<div
								v-if="hiddenVariantCount(detailFamily) > 0"
								class="ms-more"
								@click="toggleAllLanes(detailFamily)">
								<span class="ms-more-text">{{ laneToggleLabel(detailFamily) }}</span>
								<svg
									class="ms-caret"
									:class="{ 'is-open': isShowingAllLanes(detailFamily) }"
									viewBox="0 0 24 24" fill="none" stroke="currentColor"
									stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M6 10l6 5 6-5" />
								</svg>
							</div>

							<span v-if="dynamicNoteFor(detailFamily)" class="ms-note">{{ dynamicNoteFor(detailFamily) }}</span>

							<!-- 警示徽章排在指標之前：它們是「現在有狀況」，該先看到。
								 「樣本不足」不在這裡——它折進可用率那一列的值，緊貼它修飾的數字。 -->
							<div v-if="hasSignalBadges(detailFamily)" class="ms-signals">
								<div v-for="badge in alertBadgesFor(detailFamily)" :key="badge.key" class="ms-badge">
									<span class="ms-badge-text">{{ t(badge.key) }}</span>
								</div>
								<div v-if="getNoLimitBadgeState(detailFamily)" class="ms-badge">
									<span class="ms-badge-text">{{ getNoLimitBadgeText(detailFamily) }}</span>
								</div>
							</div>

							<!-- 兩欄 KV：列組固定，沒有資料的列畫「—」而不是整列消失。
								 列會忽有忽無的話，同一個位置在不同卡片上是不同的東西，
								 跨卡片比較就沒了——而那正是選 KV 的理由。
								 綜合智力不在這裡：收合列的指標帶已經有了，展開只給新東西。 -->
							<span class="ms-eyebrow ms-detail-eyebrow">{{ t('modelSelect.metricsTitle') }}</span>
							<div v-for="row in detailRowsFor(detailFamily)" :key="row.key" class="ms-kv">
								<span class="ms-kv-k">{{ t(row.labelKey) }}</span>
								<span class="ms-kv-v" :class="{ 'is-none': !row.value }">{{ row.value || '—' }}</span>
							</div>
							<span class="ms-src">{{ t('modelSelect.metricsSource') }}</span>
						</div>
					</template>
				</div>
			</template>

			<!-- 空態分兩種：沒有模型 vs 篩選後沒有結果。後者要能清掉篩選。 -->
			<div v-else class="ms-empty">
				<span class="ms-empty-title">{{ t('modelSelect.noModelsFound') }}</span>
				<span class="ms-hint">{{ t('modelSelect.tryAnotherFilter') }}</span>
				<div class="ms-pill is-on ms-empty-btn" @click="searchQuery = ''; tabChange(-1)">
					<span class="ms-pill-text">{{ t('modelSelect.allModels') }}</span>
				</div>
			</div>
		</div>

		<!-- 高消費確認。蓋在彈層之上（DESIGN §3.2：modal 100+），底要不透明。 -->
		<div v-if="costModalVisible" class="ms-cost-mask" @click.self="settleCostModal(false)">
			<div class="ms-cost confirm-scope">
				<span class="ms-cost-title">{{ costModalTitle }}</span>
				<span class="confirm-content">{{ t('modelSelect.deepPrepCostBody') }}</span>
				<span class="ms-hint ms-cost-suggest">{{ t('modelSelect.deepPrepCostSuggest') }}</span>
				<div class="confirm-bottom">
					<div class="cancel-btn" @click="settleCostModal(false)">{{ t('modelSelect.deepPrepCostCancel') }}</div>
					<div class="btn-gap"></div>
					<div class="ok-btn" @click="settleCostModal(true)">{{ t('modelSelect.deepPrepCostConfirm') }}</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
	// @ts-nocheck
	import { CanvasInput } from '@/pages/canvas/components/canvas-field'
	import icon_deepseek from '@/static/icon/models/deepseek.png';
	import icon_gpt from '@/static/icon/models/gpt.png';
	import icon_claude from '@/static/icon/models/claude.png';
	import icon_llama from '@/static/icon/models/llama.svg';
	import icon_qwen from '@/static/icon/models/qwen.svg';
	import icon_gemini from '@/static/icon/models/gemini.png';
	import icon_mistral from '@/static/icon/models/mistral.svg';
	import icon_yi from '@/static/icon/models/yi.svg';
	import icon_glm from '@/static/icon/models/glm.png';
	import icon_kimi from '@/static/icon/models/kimi.svg';
	import icon_xiaomimimo from '@/static/icon/models/xiaomimimo.svg';
	import icon_grok from '@/static/icon/models/grok.png';
	import icon_minimax from '@/static/icon/models/minimax.png';
	import icon_bytedance from '@/static/icon/models/bytedance.png';
	import icon_ling from '@/static/icon/models/ling.png';
	import icon_nvidia from '@/static/icon/models/nvidia.svg';
	import icon_hunyuan from '@/static/icon/models/hunyuan.svg';
	import icon_gemma from '@/static/icon/models/gemma.svg';
	import icon_default from '@/static/icon/models/default.svg';
	import lunaLogo from '@/static/logo.png';
	/*
		型別檢查在這一份關掉。

		這是主站那份模型選單原封搬過來的——它相依一大批沒有型別的模組（模型目錄、
		健康度指標、分類記憶…），在 strict 下會長出上百條 TS7006/TS7016。那筆債
		屬於原始那一份，不屬於這次的搬遷；為了讓它變綠而去改它的寫法，等於在
		「不要動它的邏輯」這條線上動手，而型別錯誤一條也擋不住那種改動帶來的回歸。

		所以這裡的規矩是：**這一份只做接縫層的修改**（生命週期、端點、樣式作用域）。
		要動它的邏輯時，連同型別一起處理，再把這一行拿掉。
	*/
	import { computed, ref, reactive, getCurrentInstance, nextTick, watch } from 'vue';
	import { onMounted } from 'vue';
	import { useI18n } from 'vue-i18n';
	const { t } = useI18n();

	// 畫布這條路由不掛平台的元件庫：卡片的 CSS 沒有沙盒，它會打到那些元件而
	// 作者根本不知道它們存在（見 canvas.vue 檔頭）。開關換成同介面的自繪版，
	// 提示換成系統的輕提示——兩者的呼叫形狀不變，這一頁的邏輯完全沒有動。
	import ASwitch from './ms-switch.vue';
	const message = {
		error: (text: any) => uni.showToast({ title: String(text || ''), icon: 'none' }),
		warning: (text: any) => uni.showToast({ title: String(text || ''), icon: 'none' }),
		success: (text: any) => uni.showToast({ title: String(text || ''), icon: 'none' }),
	};
	import {
		getContextBudgetLevelOptions,
		getContextBudgetOptions,
		getNoLimitCoverageState,
		getThinkingControl,
		getVisibleThinkingDepthOptions,
		isAutoCompactForcedForModel,
		normalizeContextValue
	} from '@/utils/model-context-options'
	import { getAaAgenticIndex, getAaIntelligenceIndex, getModelHealthMetrics, getUsageRank } from '@/utils/model-health-metrics'
	import {
		laneMetrics,
		detailMetrics,
		variantStatusTone,
	uptimeBucketTone,
	pinFamilyToTop,
		dedupeFamilies,
		familyKey,
		familyPriceDisplay,
		familyStatusTone,
		isFreeModelValue,
		mergeFreeModelFamilies,
		monogramHue,
		normalizeTabIndex,
		sortFamilies,
	} from '@/utils/model-select-presentation'
	import {
		ALL_CATEGORY,
		browsedCategory,
		forgetBrowsedCategory,
		rememberBrowsedCategory,
	} from '@/utils/model-select-category-memory'
	import { setShowThinkingProcess } from '@/utils/thinking-display-pref'
	import { normalizeMultiPassPreference } from '@/utils/multi-pass'
	const gemIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="#FED880" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;display:block;"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3L8 9l4 13 4-13-3-6M2 9h20"/></svg>'
	/*
		這一份原本是整頁，設定由它自己去讀寫。搬進畫布的彈層之後，設定的主換成
		呼叫端：那一頁本來就握著這張卡的設定（送出那一輪讀的就是它），面板再讀
		一次只會多一個會跟它不一致的快照。

		所以只改接縫：`formData` 仍然是同一個名字、同樣的欄位，只是初值由 props
		給、按下確認時把結果交回去，中間所有邏輯一個字都沒動。
	*/
	const props = withDefaults(defineProps<{
		roleId?: string
		/** 彈層開著嗎——關著時不重抓清單 */
		open?: boolean
		selectModel?: string
		selectModelName?: string
		context?: number
		thinkingDepth?: string
		showThinkingProcess?: boolean
		autoCompactEnabled?: boolean
		compactExtraInstruction?: string
	}>(), {
		roleId: '', open: true, selectModel: '', selectModelName: '', context: 1,
		thinkingDepth: '', showThinkingProcess: true, autoCompactEnabled: false,
		compactExtraInstruction: '',
	});

	const emit = defineEmits<{
		(e: 'select', payload: Record<string, unknown>): void
		(e: 'close'): void
	}>();

	const formData = reactive({
		roleId: props.roleId,
		selectModel: props.selectModel,
		selectModelName: props.selectModelName,
		context: props.context,
		thinkingDepth: props.thinkingDepth,
		showThinkingProcess: props.showThinkingProcess !== false,
		autoCompactEnabled: Boolean(props.autoCompactEnabled),
		compactExtraInstruction: props.compactExtraInstruction || '',
	});

	// 這個客戶端沒有會員身分（開放契約沒有帳務面），所以會員判定一律當作沒有。
	// 真正的資格由伺服器在送出那一輪判，前端不自己擋——擋錯了使用者沒有申訴的路。
	const userInfo: any = {};

	const { proxy: _this } = getCurrentInstance();


	/*
		原本這裡做三件事：存 userrole、存壓縮偏好、退回上一頁。搬進彈層之後前兩件
		由呼叫端做（它才知道快照是什麼，只送真的動到的欄位），退頁換成關掉彈層——
		這一頁不換頁，換頁等於把卡片的裝修整個丟掉。
	*/
	const saveUserDefine = async () => {
		emit('select', {
			selectModel: formData.selectModel,
			selectModelName: formData.selectModelName,
			context: formData.context,
			thinkingDepth: formData.thinkingDepth,
			autoCompactEnabled: isAutoCompactForced.value ? true : formData.autoCompactEnabled,
			compactExtraInstruction: (formData.compactExtraInstruction || '').trim(),
		});
		emit('close');
	}

	// Data
	const modelTabs = ref([]);        // ModelGroupV2[]
	const tabCurrent = ref(0);
	const currentFamilies = ref([]);   // Currently displayed families
	const selectItem = ref(null);      // Currently selected variant (Model)
	// 進頁時在用的**線路 value**；清單只認它來決定誰釘最上面（見 displayFamilies）。
	// 存 value 不存家族名：免費那一列在畫面上被改過名，用名字比對永遠對不上。
	const pinnedModelValue = ref('');
	const activatedFamilies = ref(new Set()); // Families where user actively clicked a tier pill
	const isSure = ref(false);
	const isLoading = ref(true);       // Loading until model list + user settings ready

	// Computed: selected family name for bottom bar
	const selectedFamilyName = computed(() => {
		if (!selectItem.value || !selectItem.value.family) {
			return selectItem.value?.name || '';
		}
		return selectItem.value.family;
	});

	const selectedContextModel = computed(() => selectItem.value);
	const contextBudgetOptions = computed(() => getContextBudgetOptions(selectedContextModel.value));
	const contextBudgetLevelOptions = computed(() => getContextBudgetLevelOptions(selectedContextModel.value));
	const isAutoCompactForced = computed(() => isAutoCompactForcedForModel(selectedContextModel.value));
	const selectedContextBudgetIndex = computed(() => {
		const index = contextBudgetOptions.value.findIndex(item => item.value === formData.context);
		return index >= 0 ? index : 0;
	});
	const selectedContextBudgetText = computed(() => {
		return contextBudgetOptions.value[selectedContextBudgetIndex.value]?.text || '';
	});
	const selectedContextBudgetLevelIndex = computed(() => {
		const index = contextBudgetLevelOptions.value.findIndex(item => item.value === formData.context);
		return index >= 0 ? index : 0;
	});
	const thinkingDepthOptions = computed(() => {
		if (!selectItem.value) return [];
		return getVisibleThinkingDepthOptions(selectItem.value);
	});
	const hasThinkingDepthOptions = computed(() => thinkingDepthOptions.value.length > 0);
	// 邊界 7：adaptive 模型關不掉思考，檔位選擇器隱藏「關閉」選項，
	// 另外提供「顯示思考過程」顯示層開關（此 computed 同時控制兩者可見性）。
	const isAdaptiveThinkingModel = computed(() => getThinkingControl(selectItem.value) === 'adaptive');
	const memoryDepthTrackStyle = computed(() => ({
		'--memory-depth-fill-width': `${((selectedContextBudgetLevelIndex.value + 1) / Math.max(contextBudgetLevelOptions.value.length, 1)) * 100}%`,
		'--memory-depth-thumb-left': `${(selectedContextBudgetLevelIndex.value / Math.max(contextBudgetLevelOptions.value.length, 1)) * 100}%`,
		'--memory-depth-thumb-width': `${100 / Math.max(contextBudgetLevelOptions.value.length, 1)}%`,
	}));

	const defaultThinkingDepthValue = (options, defaultValue = '') => {
		if (!options || options.length === 0) return '';
		if (defaultValue && options.some(item => item.value === defaultValue)) {
			return defaultValue;
		}
		const preferred = ['max', 'on', 'high'];
		for (const value of preferred) {
			const found = options.find(item => item.value === value);
			if (found) return found.value;
		}
		const enabled = options.find(item => item.value && item.value !== 'off');
		return enabled ? enabled.value : options[0].value;
	};

	const normalizeThinkingDepthForSelectedModel = (forceDefault = false) => {
		const options = thinkingDepthOptions.value;
		if (!options.length) {
			if (formData.thinkingDepth) {
				formData.thinkingDepth = '';
			}
			return;
		}
		if (forceDefault || !options.some(item => item.value === formData.thinkingDepth)) {
			formData.thinkingDepth = defaultThinkingDepthValue(options, selectItem.value && selectItem.value.defaultThinkingDepth);
		}
	};

	const normalizeContextForSelectedModel = (forceThinkingDefault = false) => {
		if (!selectItem.value) return;
		const nextContext = normalizeContextValue(formData.context, selectItem.value);
		if (nextContext !== formData.context) {
			formData.context = nextContext;
		}
		normalizeThinkingDepthForSelectedModel(forceThinkingDefault);
		normalizeShowThinkingProcessForSelectedModel();
	};

	// 邊界 7：「顯示思考過程」只對 adaptive 模型有意義。切到非 adaptive 模型時
	// 重置回預設 true（顯示），避免殘留的 false 誤傷之後其他模型的思考渲染
	// （見 chat-framework SKILL.md 邊界 7 與 thinking-display-pref.ts 模組註解）。
	const normalizeShowThinkingProcessForSelectedModel = () => {
		if (isAdaptiveThinkingModel.value) return;
		if (formData.showThinkingProcess !== true) {
			formData.showThinkingProcess = true;
		}
		setShowThinkingProcess(formData.roleId, true);
	};

	// 邊界 7：「顯示思考過程」是純顯示層開關（不影響生成與計費），立即持久化到
	// 本地偏好（thinking-display-pref.ts），不用等按下「儲存」。
	const onShowThinkingProcessChange = () => {
		setShowThinkingProcess(formData.roleId, formData.showThinkingProcess);
	};

	watch(isAutoCompactForced, (forced) => {
		if (forced) {
			formData.autoCompactEnabled = true;
		}
	}, { immediate: true });

	// Filter families based on MAX mode
	const filteredFamilies = computed(() => {
		if (formData.context === 100) {
			return currentFamilies.value
				.filter(f => f.isSupportMax)
				.map(f => ({
					...f,
					variants: f.variants.filter(v => v.isSupportMax)
				}));
		}
		return currentFamilies.value;
	});

	// Get filtered variants for a family (respecting MAX mode)
	const getFilteredVariants = (family) => {
		if (formData.context === 100) {
			return family.variants.filter(v => v.isSupportMax);
		}
		return family.variants;
	};

	/**
	 * 上游名冊自動長出來的線路，預設只露出最便宜的幾條。
	 *
	 * **只收這一批**：我們自己配的中繼渠道（經濟線路、官方供應商）永遠留在上面，
	 * 它們是刻意挑過的、數量也不會自己長。會爆的是自動長出來的那一批——單一模型
	 * 今天就有三十條，全部平鋪的話使用者要捲很久才看得到確認鍵。
	 *
	 * 六條而不是四條：這批清單本身由便宜到貴，六條才看得出一段有意義的價格階梯；
	 * 四條會在還沒拉開差距前就截斷。
	 */
	const LANE_COLLAPSE_LIMIT = 6;
	const expandedLaneFamilies = ref({});

	const isShowingAllLanes = (family) => !!expandedLaneFamilies.value[family && family.family];

	const toggleAllLanes = (family) => {
		const key = family && family.family;
		if (!key) return;
		expandedLaneFamilies.value = {
			...expandedLaneFamilies.value,
			[key]: !expandedLaneFamilies.value[key],
		};
	};

	/**
	 * 真正要渲染的那幾條。
	 *
	 * **選中的那條永遠在裡面**，即使它排在收合線之後：使用者打開面板第一件事是確認
	 * 自己現在用的是哪一條，看不到它就等於這一頁沒有回答他最想問的問題。
	 */
	/**
	 * 真正要渲染的那幾條。
	 *
	 * 自己配的渠道全留；自動長出來的那一批只留最便宜的幾條。**選中的那條永遠在裡面**，
	 * 即使它排在收合線之後：使用者打開面板第一件事是確認自己現在用的是哪一條，
	 * 看不到它就等於這一頁沒有回答他最想問的問題。
	 */
	const getVisibleVariants = (family) => {
		const variants = getFilteredVariants(family);
		if (isShowingAllLanes(family)) return variants;
		const ours = variants.filter(v => !v.laneAutoListed);
		const listed = variants.filter(v => v.laneAutoListed);
		if (listed.length <= LANE_COLLAPSE_LIMIT) return variants;
		const head = listed.slice(0, LANE_COLLAPSE_LIMIT);
		const selected = listed.find(v => v.value === formData.selectModel);
		if (selected && !head.some(v => v.value === selected.value)) head.push(selected);
		return ours.concat(head);
	};

	/** 收合狀態下還沒露出來的條數；展開狀態下回「按收合會藏起來幾條」，讓按鈕留著。 */
	const hiddenVariantCount = (family) => {
		const listed = getFilteredVariants(family).filter(v => v.laneAutoListed);
		if (listed.length <= LANE_COLLAPSE_LIMIT) return 0;
		if (isShowingAllLanes(family)) return listed.length - LANE_COLLAPSE_LIMIT;
		return listed.length - getVisibleVariants(family).filter(v => v.laneAutoListed).length;
	};

	const laneToggleLabel = (family) => {
		if (isShowingAllLanes(family)) return t('modelSelect.laneCollapse');
		return t('modelSelect.laneShowMore', { n: hiddenVariantCount(family) });
	};

	const getFamilyPrimaryVariant = (family) => {
		const variants = getFilteredVariants(family);
		if (!variants || variants.length === 0) return null;
		const selected = variants.find(v => v.value === formData.selectModel);
		return selected || variants[0];
	};

	const getVariantMetrics = (variant) => {
		return getModelHealthMetrics(variant && variant.status ? variant.status : null);
	};

	const getAvailabilityStatusClass = (variant) => {
		return getVariantMetrics(variant).availability.status;
	};

	const getAvailabilityLabelKey = (variant) => {
		return getVariantMetrics(variant).availability.labelKey;
	};

	const getLatencyBars = (variant) => {
		return getVariantMetrics(variant).latency.bars;
	};

	const getLatencyToneClass = (variant) => {
		return getVariantMetrics(variant).latency.tone;
	};

	const getLatencyLabelKey = (variant) => {
		return getVariantMetrics(variant).latency.labelKey;
	};

	const getLatencySourceLabelKey = (variant) => {
		return getVariantMetrics(variant).latency.sourceLabelKey;
	};

	const getLatencyValueText = (variant) => {
		return getVariantMetrics(variant).latency.valueText;
	};

	const getPerformanceChips = (variant) => {
		return getVariantMetrics(variant).performanceChips;
	};

	const getSignalBadges = (variant) => {
		return getVariantMetrics(variant).badges;
	};

	// Third-party (Artificial Analysis) intelligence index — separate from the
	// live gateway health/performance telemetry above; sourced from modelListV2
	// family/variant fields, not variant.status.
	const getIntelligenceIndex = (family, variant) => {
		return getAaIntelligenceIndex(family, variant);
	};

	const msText = (ms) => (Math.round(ms / 100) / 10) + 's';
	const pctText = (p) => String(Math.round(p * 10) / 10);

	/**
	 * 線路列第二行。**沒有真實對話時整行換成一句話**，不留空也不顯示 0——
	 * 首字與完整回覆率都只由真實對話供給（探針是幾十 token 的非串流請求，
	 * 拿它算速度會讓閒置線路看起來比實際快），所以要空是一起空。
	 */
/**
 * 截斷率的顯示值。
 *
 * server 給的是「完整回覆率」，畫面反過來講：**有百分之幾的機率被切斷**。
 * 正常值因此是 0%，越小越好——「完整 100%」單獨擺在那裡沒有人看得懂它在講什麼，
 * 而「截斷率 0%」直接講使用者實際會遇到的事（回覆講到一半斷掉）。
 *
 * 取到小數一位再去掉尾巴的 .0：這個指標有意義的範圍就在 0-5%，取整數會把
 * 0.4% 的截斷顯示成 0%，跟完全沒斷長得一模一樣。
 */
const truncationText = (completionRate: number) => {
	const v = Math.max(0, Math.min(100, 100 - completionRate))
	const r = Math.round(v * 10) / 10
	return (Number.isInteger(r) ? r : r.toFixed(1)) + '%'
};

	const laneMetaFor = (variant) => {
		const m = laneMetrics(variant && variant.status);
		if (m.noUsageData) return t('modelSelect.laneNoUsageData');
		// 沒有速度資料時退回可用率——那是探針就量得到的、跨線路可比的真數字。
		// 先前這裡整行換成「尚無使用資料」，而使用者把那句話讀成「沒人用過」。
		if (m.uptimePercent !== null) {
			return t('modelSelect.laneUptimeOnly', { percent: pctText(m.uptimePercent) });
		}
		const parts = [];
		if (m.latencyMs !== null) {
			// 箭頭比括號直觀：一眼就是「會拉到這麼長」。只有落差夠大時才有 p90。
			const head = t('modelSelect.firstTokenLatency') + ' ' + msText(m.latencyMs);
			// 只報中位數（server 的 current 就是中位數）。先前寫成「9.7s→44.1s」——
			// 尾巴那個數字是極值，擺在中位數旁邊會被讀成「它就是這麼慢」。
			parts.push(head);
		}
		// 列上放**出字率**而不是截斷率：使用者更在乎「這東西出不出字」，
		// 至於出了字有沒有被截斷，想看的人點進詳情看——那一層兩個都有。
		if (m.outputRate !== null) {
			parts.push(t('modelSelect.metricOutputRate') + ' ' + Math.round(m.outputRate) + '%');
		}
		return parts.join(' · ');
	};

	/** 展開層 KV 的列組。**固定四列**，沒有資料的畫「—」。 */
	const detailRowsFor = (family) => {
		const m = detailMetrics(family, getFamilyPrimaryVariant(family));
		const rows = [
			{ key: 'agentic', labelKey: 'modelSelect.metricAgentic', value: m.agentic === null ? '' : String(m.agentic) },
			{
				key: 'usage', labelKey: 'modelSelect.metricPopularity',
				value: m.usage ? t('modelSelect.usageRankDetail', {
					rank: m.usage.rank, total: m.usage.total, share: m.usage.share,
				}) : '',
			},
		];
		// 可用率是唯一會整列消失的：樣本不足時那個數字是誤導，不是缺漏。
		if (m.uptime) {
			rows.push({
				key: 'uptime', labelKey: 'modelSelect.metricUptime',
				value: m.uptime.percent72h === null
					? t('modelSelect.uptimeValue', { p: pctText(m.uptime.percent24h) })
					: t('modelSelect.uptimeValueWith72h', {
						p24: pctText(m.uptime.percent24h), p72: pctText(m.uptime.percent72h),
					}),
			});
		}
		rows.push({
			key: 'context', labelKey: 'modelSelect.metricContext',
			value: m.contextRange
				? (m.contextRange.min === m.contextRange.max
					? m.contextRange.min
					: t('modelSelect.contextRangeValue', m.contextRange))
				: '',
		});
		return rows;
	};

	/**
	 * 只有警示徽章。「樣本不足」被折進可用率那一列的值，不在這裡重複——
	 * 它是在修飾數字可不可信，離那個數字越近越好。
	 */
	const alertBadgesFor = (family) => (getSignalBadges(getFamilyPrimaryVariant(family)) || [])
		.filter(b => b.key !== 'modelSelect.signalInsufficientSample');

	/** 線路列的點燈：unknown 是空心，不是黃色（黃色＝有狀況，不是＝不知道）。 */
	const variantDotTone = (variant) => variantStatusTone(variant && variant.status);

	// ── 線路詳情：同一塊面板的第二層（桌面沒有第二個畫面）────────────────
	/**
	 * 一格的時間標籤。
	 *
	 * 分鐘要**算出來**，不能寫死 `:00`：server 的格是對 **UTC 整點**切的，而這裡用的是
	 * 觀看者的本地時間。整點時區看起來剛好是 :00，但半小時時區（印度 +5:30、伊朗
	 * +3:30、紐芬蘭 −3:30…）真正的區間是 18:30–19:30——寫死 :00 會顯示成 18:00–19:00，
	 * 整整差半小時，而且沒有任何跡象看得出來是錯的。
	 */
	const hhmm = (d: Date) =>
		String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

	const laneDetailFamily = ref<any>(null);
	const laneDetailVariant = ref<any>(null);
	const laneHistory = ref<any>(null);
	const laneHistoryLoading = ref(false);
	const laneSelectedIndex = ref(-1);

	const laneDetailName = computed(() =>
		laneDetailFamily.value && laneDetailVariant.value
			? optionLabelFor(laneDetailFamily.value, laneDetailVariant.value) : '');

	const laneDetailTone = computed(() => {
		const v = laneDetailVariant.value;
		const tone = v ? variantStatusTone(v.status) : null;
		// variantStatusTone 對 green 回 null（列上不點燈），但詳情層要明講「正常」。
		if (tone === 'danger') return 'red';
		if (tone === 'warning') return 'yellow';
		if (tone === null && v && v.status) return 'green';
		return 'unknown';
	});

	const laneDetailStatusText = computed(() => {
		// 整把 key 寫全，不要用前綴拼——拼出來的 key 靜態掃不到。
		const map: any = {
			green: 'modelSelect.statusGreen',
			yellow: 'modelSelect.statusYellow',
			red: 'modelSelect.statusRed',
			unknown: 'modelSelect.statusUnknown',
		};
		return t(map[laneDetailTone.value]);
	});

	const laneToneText = (tone: string) => {
		const map: any = {
			green: 'modelSelect.statusGreen',
			amber: 'modelSelect.statusYellow',
			red: 'modelSelect.statusRed',
		};
		return map[tone] ? t(map[tone]) : '';
	};

	const laneBuckets = computed(() => {
		const h = laneHistory.value;
		if (!h || !Array.isArray(h.buckets)) return [];
		return h.buckets.map((b: any) => Object.assign({}, b, { tone: uptimeBucketTone(b) }));
	});

	// 寬度用百分比：72 格各自捨入的話誤差會累積把整條推爆。
	const laneBucketWidthPct = computed(() => {
		const n = laneBuckets.value.length;
		return n ? (100 - (n - 1) * 0.35) / n : 0;
	});

	const laneSelected = computed(() => {
		const b: any = laneBuckets.value[laneSelectedIndex.value];
		if (!b) return null;
		const d = new Date(b.hourStartMs);
		const end = new Date(b.hourStartMs + 3600000);
		return {
			tone: b.tone,
			rangeText: t('modelSelect.bucketRange', {
				month: d.getMonth() + 1, day: d.getDate(),
				from: hhmm(d), to: hhmm(end),
			}),
			valueText: b.tone === 'none'
				? t('modelSelect.bucketNoData')
				: (laneToneText(b.tone) + ' · ' + (Math.round(b.percent * 10) / 10) + '%'),
		};
	});

	const laneDotStyle = computed(() => {
		const i = laneSelectedIndex.value;
		if (i < 0) return { opacity: 0 };
		const w = laneBucketWidthPct.value;
		return { left: (i * (w + 0.35) + w / 2) + '%' };
	});

	// tooltip 夾在面板內：貼著左右邊時不要溢出去。
	const laneTipStyle = computed(() => {
		const i = laneSelectedIndex.value;
		if (i < 0) return { opacity: 0 };
		const w = laneBucketWidthPct.value;
		const centerPct = i * (w + 0.35) + w / 2;
		const clamped = Math.max(22, Math.min(centerPct, 78));
		return { left: clamped + '%' };
	});

	const bucketLegend = computed(() => ([
		{ tone: 'green', text: t('modelSelect.statusGreen') },
		{ tone: 'amber', text: t('modelSelect.statusYellow') },
		{ tone: 'red', text: t('modelSelect.statusRed') },
		{ tone: 'none', text: t('modelSelect.bucketLegendNoData') },
	]));

	/**
	 * 詳情層報的是**原始指標**，不是收合列那份。
	 *
	 * 收合列的 laneMetrics() 帶了佔位規則（例如出字率高於門檻就不佔位），那是為了
	 * 三段指標帶擠不下而設的。把它拿來餵 KV 列會出事：一條好好的線路，出字率正常
	 * 所以被 laneMetrics 濾掉，KV 上就畫成「—」——而在固定列組裡「—」的意思是
	 * 「沒有資料」。等於把「正常」顯示成「量不到」。status 頁的本份是忠實報數字。
	 */
	const perfCurrent = (v: any, key: string) => {
		const perf = v && v.status && v.status.performance;
		const metric = perf && perf[key];
		const n = metric && typeof metric.current === 'number' ? metric.current : null;
		return (n === null || !isFinite(n)) ? null : n;
	};

	const laneDetailMetrics = computed(() => {
		const v = laneDetailVariant.value;
		if (!v) return [];
		const ttft = perfCurrent(v, 'firstTokenLatencyMs');
		const complete = perfCurrent(v, 'completionRate');
		const output = perfCurrent(v, 'outputRate');
		return [
			{ key: 'ttft', label: t('modelSelect.metricFirstTokenLatency'),
				value: ttft !== null ? (Math.round(ttft / 100) / 10) + 's' : '—' },
			{ key: 'complete', label: t('modelSelect.metricTruncation'),
				value: complete !== null ? truncationText(complete) : '—' },
			{ key: 'output', label: t('modelSelect.metricOutputRate'),
				value: output !== null ? Math.round(output) + '%' : '—' },
			{ key: 'billing', label: t('modelSelect.metricBilling'),
				value: variantPriceText(v) },
		];
	});

	const closeLaneDetail = () => {
		laneDetailVariant.value = null;
		laneDetailFamily.value = null;
		laneHistory.value = null;
		laneSelectedIndex.value = -1;
	};

	/**
	 * 逐小時歷史是**逐線路**的——每條線路本來就是目錄裡各自獨立的 model value，
	 * 所以直接把線路的 value 丟給端點就是那條線路的歷史。
	 */
	const openLaneDetail = (family: any, variant: any) => {
		laneDetailFamily.value = family;
		laneDetailVariant.value = variant;
		laneHistory.value = null;
		laneSelectedIndex.value = -1;
		loadLaneHistory(variant && variant.value);
	};

	const loadLaneHistory = (modelValue: string) => {
		if (!modelValue) return;
		laneHistoryLoading.value = true;
		_this.http.get(_this.requestUrl.modelUptimeHistory, {
			data: { model: modelValue, hours: 72 },
			// 這是裝飾性的背景請求，面板自己有 inline 空態（laneHistoryLoading）。
			// 不關掉的話會蓋一層全螢幕阻斷式遮罩去等一張圖表——mobile 那支本來就關了。
			showLoading: false,
		}).then((res: any) => {
			// 端點回的是百分比不是狀態，三色由前端分檔（uptimeBucketTone）。
			const d = (res && res.data) ? res.data : res;
			if (!d || !Array.isArray(d.buckets)) { laneHistory.value = null; return; }
			// 開 A → 返回 → 開 B，如果 A 的回應晚於 B 抵達，沒有這道守衛就會把 A 的
			// 圖表畫在 B 的面板上，而且畫面上沒有任何跡象。handler 會把 requested
			// model 原樣回傳，拿它比對當前開著的線路即可。
			const current = laneDetailVariant.value && laneDetailVariant.value.value;
			if (d.model && current && d.model !== current) return;
			// 一筆樣本都沒有時 server 回 percent: 0。**那不是 0%，那是沒有資料**——
			// 跟方塊的灰格同一條規則，只是先前只套在方塊上、漏了頭條這個數字。
			// 顯示 0% 會被讀成「這條線路整整三天全掛」。
			const hasSamples = (typeof d.totalSamples === 'number') && d.totalSamples > 0;
			const pct = (hasSamples && typeof d.percent === 'number') ? d.percent : null;
			laneHistory.value = Object.assign({}, d, {
				percentText: pct === null ? '' : (Math.round(pct * 10) / 10) + '%',
			});
		}).catch(() => {
			// 拿不到歷史不該把整塊面板弄壞——上面的即時指標仍然有用。
			laneHistory.value = null;
		}).finally(() => {
			laneHistoryLoading.value = false;
		});
	};

	/** Agent 表現。伺服器沒有值時回 null，畫面整項不顯示（不是顯示 0）。 */
	const getAgenticIndex = (family, variant) => {
		return getAaAgenticIndex(family, variant);
	};

	/** 全球用量名次；沒有名次時回 null。 */
	const usageRankInfo = (family, variant) => {
		return getUsageRank(family, variant);
	};

	const usageRankShort = (family, variant) => {
		const info = usageRankInfo(family, variant);
		return info ? t('modelSelect.usageRankValue', { rank: info.rank }) : '';
	};

	const usageRankDetailText = (family, variant) => {
		const info = usageRankInfo(family, variant);
		if (!info) return '';
		return t('modelSelect.usageRankDetail', { rank: info.rank, total: info.total, share: info.share });
	};

	const hasFamilyBadge = (family, badge) => {
		if (!family || !Array.isArray(family.badges)) return false;
		return family.badges.includes(badge);
	};

	// Display tabs
	const displayTabs = computed(() => {
		const tabs = modelTabs.value.map((tab, index) => ({
			name: tab.group,
			tabIndex: index
		}));
		// 「全部」放最前面：它是預設值，擺在十幾個分類的尾巴等於每次都要滑到底才回得來。
		tabs.unshift({ name: t('modelSelect.allModels'), tabIndex: -1 });
		return tabs;
	});

	// ── v3 呈現層 ───────────────────────────────────────────────────────
	//
	// 純計算在 utils/model-select-presentation.ts，mobile 有一份同語意的 .js。
	// 計價一旦兩端漂移，就是使用者看到一個數字、被扣另一個。

	const searchQuery = ref('');
	// 桌面版設定常駐（不像手機收成 chip），所以只有排序需要彈層。
	const sortSheetOpen = ref(false);
	// 預設「熱門」：站內用量欄位還沒上線時每個家族同分，tie-break 讓它自然退回
	// 原次序，也就是設計文件 §3.55 的降級行為。
	const sortMode = ref('popular');
	// 桌面版右側是常駐詳情面板，不是手風琴——有空間就不必展開／收合。
	const detailFamilyName = ref('');

	const SORT_OPTIONS = [
		{ value: 'popular', labelKey: 'modelSelect.sortPopular', descKey: 'modelSelect.sortPopularDesc' },
		{ value: 'price', labelKey: 'modelSelect.sortPrice', descKey: 'modelSelect.sortPriceDesc' },
		{ value: 'latency', labelKey: 'modelSelect.sortLatency', descKey: 'modelSelect.sortLatencyDesc' },
		{ value: 'throughput', labelKey: 'modelSelect.sortThroughput', descKey: 'modelSelect.sortThroughputDesc' },
		{ value: 'intelligence', labelKey: 'modelSelect.sortIntelligence', descKey: 'modelSelect.sortIntelligenceDesc' },
		{ value: 'stability', labelKey: 'modelSelect.sortStability', descKey: 'modelSelect.sortStabilityDesc' },
	];

	/** 選中的排序在比什麼——寫在 rail 底下那一句。 */
	const sortDescKey = computed(() => {
		const opt = SORT_OPTIONS.find(o => o.value === sortMode.value);
		return opt ? opt.descKey : '';
	});

	const sortLabel = computed(() => {
		const opt = SORT_OPTIONS.find(o => o.value === sortMode.value);
		return opt ? t(opt.labelKey) : t('modelSelect.sortTitle');
	});

	/**
	 * 列表最終要渲染的：免費模型收成一列 → 搜尋 → 排序 → 目前使用釘最上面。
	 * 釘住那一步一定要在排序之後，否則排序會把它推走。
	 */
	const displayFamilies = computed(() => {
		// 去重要在排序**之前**做。「全部」把每個分類攤平，同一個模型同時掛在「精選」
		// 與品牌分類底下——不去重的話清單裡有重複的 :key，而重複的 key 只有在重排時
		// 才發作（見 dedupeFamilies 的註解）。
		let families = dedupeFamilies(
			mergeFreeModelFamilies(filteredFamilies.value, t('modelSelect.freeModelName')));

		const q = String(searchQuery.value || '').trim().toLowerCase();
		if (q) {
			families = families.filter(f => {
				if (String(f.family || '').toLowerCase().includes(q)) return true;
				// 也讓線路名搜得到：記得「朝霧」的機率不比記得模型名低。
				return (f.variants || []).some(v =>
					String(v.channelLabel || '').toLowerCase().includes(q)
					|| String(v.name || '').toLowerCase().includes(q));
			});
		}

		// 代表線路要跟畫面顯示的是同一條，否則會「照 A 線路排序、顯示 B 線路數字」。
		families = sortFamilies(families, sortMode.value, {
			primaryVariantOf: f => getFamilyPrimaryVariant(f),
		});

		// 釘住的是**進頁時**在用的那個模型，不是當下選中的那個。
		// 取當下選中的話，使用者點一條線路就改變了當下選中 → 清單重排 → 他正在
		// 看的那一列被搬走（手機端症狀是「點完就消失」）。
		return pinFamilyToTop(families, pinnedModelValue.value);
	});

	/**
	 * 哪個家族的詳情是打開的：使用者點過就是那個，否則跟著目前選中的走。
	 *
	 * 彈層版只在文流裡展開，沒有第二欄可以「總得顯示點什麼」，所以選中的模型
	 * 不在這個分類裡時**什麼都不展開**——先前退到清單第一列，切到別的分類時
	 * 第一列會無故自己攤開，看起來像是它被選中了。
	 */
	const DETAIL_COLLAPSED = '\u0000';
	const detailFamily = computed(() => {
		const list = displayFamilies.value;
		if (!list.length) return null;
		if (detailFamilyName.value === DETAIL_COLLAPSED) return null;
		if (detailFamilyName.value) {
			const hit = list.find(f => f.family === detailFamilyName.value);
			if (hit) return hit;
		}
		return list.find(f => isFamilySelected(f)) || null;
	});

	const isFreeFamily = (family) => !!(family && (family.isFreeModelGroup
		|| (family.variants || []).some(v => isFreeModelValue(v && v.value))));

	/**
	 * 面板換到別的模型時，把線路詳情關掉。
	 *
	 * 桌面的線路詳情是**同一塊面板的第二層**，不是獨立畫面——先前它只看
	 * `laneDetailVariant` 有沒有值，於是使用者在左邊點另一個模型時，面板還蓋著上一個
	 * 模型的線路詳情：新模型的線路清單被整個擋住，看起來像「點了沒反應」。
	 *
	 * 綁在 detailFamily 而不是點擊處理函式上，是因為面板也會因為選取變動或清單重整
	 * 而換模型，那些路徑不經過 openDetail。
	 *
	 * **位置不能往上搬**：watch 建立時會立刻求值一次，放在 detailFamily 的 const 之前
	 * 會撞 TDZ。Vue 會把那個 ReferenceError 吞成一句 warn，元件照常渲染，但這個
	 * watcher 從頭到尾不會作用——症狀是「改了沒效果」而不是「壞掉」。
	 */
	watch(() => detailFamily.value && detailFamily.value.family, (now, before) => {
		if (before !== undefined && now !== before) closeLaneDetail();
	});


	const priceTextFor = (family) => {
		const d = familyPriceDisplay(family);
		if (!d) return '';
		// en 的「起」是前綴（from 25 credits），語序跟中文相反 → 必須是完整的 key，
		// 不能由這裡拼字串。
		return t(d.from ? 'modelSelect.priceCreditsFrom' : 'modelSelect.priceCredits', { n: d.amountText });
	};

	const originalPriceFor = (family) => {
		const d = familyPriceDisplay(family);
		return d && d.original ? d.original : 0;
	};

	/**
	 * 列上要不要點燈。只有「這個模型現在有問題」才點。
	 * 'unknown'（伺服器明講樣本不足）刻意不點——prod 實資料裡多數模型是這個狀態，
	 * 一排灰點的訊息量跟一排綠點一樣是零。那件事由展開層的「樣本不足」徽章負責。
	 */
	const rowDotTone = (family) => {
		const tone = familyStatusTone(family);
		return tone === 'warning' || tone === 'danger' ? tone : '';
	};

	const expandHintFor = (family) => {
		const n = getFilteredVariants(family).length;
		if (n <= 1) return '';
		return t(isFreeFamily(family) ? 'modelSelect.expandSlots' : 'modelSelect.expandLanes', { n });
	};

	/** 免費層沒有線路體系，不要借用那個詞。 */
	const optionSectionLabel = (family) => t(isFreeFamily(family)
		? 'modelSelect.slotSection' : 'modelSelect.laneSection');

	const optionLabelFor = (family, variant) => {
		if (isFreeFamily(family)) {
			const m = String((variant && variant.value) || '').match(/-(\w+)$/);
			return t('modelSelect.freeSlotLabel', { n: m ? m[1] : '1' });
		}
		return (variant && variant.channelLabel) || (variant && variant.name) || '';
	};

	const variantPriceText = (variant) =>
		t('modelSelect.priceCredits', { n: formatPrice(getVariantPrice(variant)) });

	/** 浮動的那條要講出處，否則「~」沒有來源。 */
	/**
	 * 「哪幾條是浮動計費」。
	 *
	 * **全部都是浮動時不逐條點名**：這一族現在有三十條線路，逐條列出來就是把剛剛
	 * 收起來的那二十幾個名字原封不動貼回畫面上，收合等於白做。而且使用者要的答案
	 * 是「我會被按用量收費嗎」，不是一份名冊——只有在有些浮動、有些固定時，
	 * 點名才真的在回答問題。混合時也只點前三個，其餘用數量帶過。
	 */
	const DYNAMIC_NOTE_NAME_LIMIT = 3;
	const dynamicNoteFor = (family) => {
		const variants = getFilteredVariants(family) || [];
		const dyn = variants.filter(v => v && v.billingType === 'dynamic');
		if (!dyn.length) return '';
		const hint = getPriceEstHint(dyn[0]);
		let base;
		if (dyn.length === variants.length) {
			base = t('modelSelect.dynamicLaneNoteAll');
		} else if (dyn.length <= DYNAMIC_NOTE_NAME_LIMIT) {
			base = t('modelSelect.dynamicLaneNote', { lane: dyn.map(v => optionLabelFor(family, v)).join('、') });
		} else {
			base = t('modelSelect.dynamicLaneNoteMany', {
				lane: dyn.slice(0, DYNAMIC_NOTE_NAME_LIMIT).map(v => optionLabelFor(family, v)).join('、'),
				n: dyn.length,
			});
		}
		return hint ? base + ' ' + hint : base;
	};

	/** 列的指標帶。桌面列更寬，所以比手機多一段吐字速度。 */
	const rowMetaFor = (family) => {
		// 桌面實際可用寬只有 1000px（uni-app 的 left/right window 版面），
		// 四段會被擠到截斷，所以這裡收到三段：線路 · 智力 · 首字。
		// 吐字速度在右側面板逐線路給，不必在掃視層重複。
		const primary = getFamilyPrimaryVariant(family);
		const parts = [];
		if (isFreeFamily(family)) {
			const remain = Number(family.freeQuotaRemaining || 0);
			if (remain > 0) parts.push(t('modelSelect.quotaLeft', { n: remain }));
		} else if (primary && primary.channelLabel) {
			parts.push(primary.channelLabel);
		}
		const iq = getIntelligenceIndex(family, primary);
		if (iq !== null && iq !== undefined) parts.push(t('modelSelect.metricIntelligence') + ' ' + iq);
		// 名次排在延遲前面：使用者掃這一列時要的是「別人都選哪個」，延遲在右側
		// 面板逐線路給。三段的上限不變，所以有名次時延遲自然讓位。
		const rankText = usageRankShort(family, primary);
		if (rankText) parts.push(rankText);
		const latency = getLatencyValueText(primary);
		if (latency) parts.push(t('modelSelect.firstTokenLatency') + ' ' + latency);
		const chips = getPerformanceChips(primary) || [];
		const speed = chips.find(c => c.key === 'tokensPerSecond');
		if (speed) parts.push(t(speed.labelKey) + ' ' + speed.valueText);
		return parts.slice(0, 3).join(' · ');
	};

	/**
	 * 面板裡每條線路的指標。**只給兩段**：浮動線路的價格是 `~287-970 積分` 這種
	 * 長字串，三段會被擠到截斷（手機端實測過）。字每秒與 Token 每秒講同一件事。
	 */
	const variantMetaFor = (variant) => {
		const parts = [];
		const latency = getLatencyValueText(variant);
		if (latency) parts.push(t('modelSelect.firstTokenLatency') + ' ' + latency);
		const chips = getPerformanceChips(variant) || [];
		const rate = chips.find(c => c.key === 'outputRate');
		const speed = chips.find(c => c.key === 'tokensPerSecond') || chips.find(c => c.key === 'charsPerSecond');
		for (const chip of [rate, speed]) if (chip) parts.push(t(chip.labelKey) + ' ' + chip.valueText);
		return parts.slice(0, 2).join(' · ');
	};

	/** 無品牌素材時的退路：低飽和深灰，不是彩色塊（primitives §5.1）。 */
	const monogramStyle = (family) => {
		const hue = monogramHue(family && family.family);
		return { background: `linear-gradient(158deg, hsl(${hue}, 22%, 14%), hsl(${hue}, 26%, 9%))` };
	};

	const footerSelectionText = computed(() => {
		if (!selectItem.value) return '';
		const lane = selectItem.value.channelLabel;
		return lane ? `${selectedFamilyName.value} · ${lane}` : selectedFamilyName.value;
	});

	const openDetail = (family) => { detailFamilyName.value = (family && family.family) || ''; };
	/** 列上的點擊：開著就收起來，收著就打開。 */
	const toggleDetail = (family) => {
		const name = (family && family.family) || '';
		const isOpen = !!(detailFamily.value && detailFamily.value.family === name);
		detailFamilyName.value = isOpen ? DETAIL_COLLAPSED : name;
	};

	/**
	 * 列上的圖示。包一層是因為既有的 getModelIconPath / getModelIconBg 收的是
	 * **名稱字串**，而 v3 的列拿到的是 family 物件；直接傳物件會在每一列丟
	 * `name.toLowerCase is not a function`，整份列表渲染成空白（實測踩過）。
	 *
	 * 同時處理兩件 v3 的事：
	 *  - 免費模型掛 LunaTalk 自己的標記。它刻意不揭露承接它的那一家，所以
	 *    **不該掛任何供應商 logo**——這不是退路，是它自己的識別。
	 *  - 認不出品牌時回空字串，讓模板走 monogram，而不是既有的 default.svg。
	 *    那張圖是一次性插畫，八個未知模型會長得一模一樣；monogram 由名稱決定
	 *    色相，彼此可辨（primitives §5.1）。
	 */
	const modelIconFor = (family) => {
		if (isFreeFamily(family)) return lunaLogo;
		const name = String((family && family.family) || '');
		const path = getModelIconPath(name);
		return path && path !== modelIconMap.default ? path : '';
	};

	const modelIconBgFor = (family) => {
		if (isFreeFamily(family)) return 'rgba(255,255,255,0.06)';
		return getModelIconBg(String((family && family.family) || ''));
	};

	// ── 深入準備（原「進階回覆」，原本在聊天設定裡）──
	//
	// 搬來這裡是因為它能不能用由**模型**決定（伺服器回報 modelSupported）。
	// 放在聊天設定的話，用戶選模型時看不見它，換了模型也不知道它已失效——
	// 違反 HIG 第三條「看得懂自己的處境」。放在這裡，換到不支援的模型時
	// 選項就在同一畫面消失，依賴關係結構性可見。
	const deepPrepEnabled = ref(false);
	const deepPrepRuntimeEnabled = ref(false);
	const deepPrepModelSupported = ref(false);
	const deepPrepSaving = ref(false);
	// 撥開之前要不要先攔一次高消費確認。由伺服器宣告，見 utils/multi-pass 的註解。
	const deepPrepCostWarning = ref(false);
	// 總開關關著時整個選項不出現：那是全站狀態，不是這個對話的問題，
	// 顯示一個永遠灰著的開關只會讓人以為自己做錯了什麼。
	const deepPrepSupported = computed(() => deepPrepModelSupported.value && deepPrepRuntimeEnabled.value);

	// 模型不支援時**仍然顯示**這一項，只是停用並說明原因。
	//
	// 先前是整項消失，而那會產生一個沒有出口的狀態：偏好是 per-conversation 的，
	// 開著的對話換到不支援的模型之後，使用者看不到開關、不知道自己開著、也關不掉。
	// 線上實測抓到過（modelSupported=false 而 multiPassEnabled=true）。
	// 全站總開關關著才整項不出現——那是全站狀態，不是他的處境。
	const deepPrepVisible = computed(() => deepPrepRuntimeEnabled.value);

	// 「真的開著」＝全站沒關掉、使用者開了、而且這個模型跑得動。
	//
	// 開關樣子、shimmer、ULTRA 徽章、說明文字、底部欄五處都要同一個判準，散在
	// 模板裡各寫一次遲早漂移成「亮著但沒開」。總開關也要算進來：偏好存在帳上，
	// 全站關掉時它仍然是 true，只看那兩個條件的話底部欄會在功能根本沒開的情況下
	// 變成金色。
	const deepPrepOn = computed(() =>
		deepPrepRuntimeEnabled.value && deepPrepEnabled.value && deepPrepModelSupported.value
	);



	const loadDeepPrepPreference = async () => {
		if (!formData.roleId) return;
		try {
			// 帶上「使用者現在挑的那個模型」，而不是只問已存檔的那個。
			//
			// 深入準備的開關靠 modelSupported 決定顯不顯示，而使用者在這一頁做的事
			// 就是**還沒存檔地挑模型**。只問已存檔的等於答非所問：他點了 A，拿回來
			// 的是上次存的 B 支不支援，開關的顯隱因此跟他的操作完全脫節。
			const res = await _this.http.get(_this.requestUrl.playerAgentMode, {
				data: { roleId: formData.roleId, model: formData.selectModel || '' },
				showLoading: false,
			});
			const pref = normalizeMultiPassPreference(res);
			deepPrepEnabled.value = pref.multiPassEnabled;
			deepPrepRuntimeEnabled.value = pref.runtimeEnabled;
			deepPrepModelSupported.value = pref.modelSupported;
			deepPrepCostWarning.value = pref.costWarning;
		} catch (error) {
			console.warn('[ModelSelect] 讀取深入準備偏好失敗:', error);
		}
	};

	// 開啟前的高消費確認。
	//
	// 只在**開啟**方向攔：關掉沒有代價，攔一次只是擋路。攔的門檻由伺服器宣告
	// （costWarning），前端不自己判斷哪些模型貴——前端沒有定價，也沒有模型目錄。
	const costModalVisible = ref(false);
	const costModalResolve = ref(null);
	// 標題點名使用者剛挑的那個模型。攔他的原因是**這個模型本來就貴**，不是這個
	// 模式本身——便宜的模型再多跑幾輪也還是便宜，所以那些根本不攔。講成「這個
	// 模式很貴」會跟豁免名單自相矛盾。
	const costModalTitle = computed(() =>
		t('modelSelect.deepPrepCostTitle', { model: selectedFamilyName.value })
	);

	// 任何不是明確按下確認的收尾都往「不開」倒——這道確認守的是錢。
	const settleCostModal = (confirmed) => {
		const resolve = costModalResolve.value;
		costModalResolve.value = null;
		costModalVisible.value = false;
		if (resolve) resolve(!!confirmed);
	};

	const confirmDeepPrepCost = () => new Promise((resolve) => {
		costModalResolve.value = resolve;
		costModalVisible.value = true;
	});

	const onDeepPrepChange = async (nextEnabled) => {
		// 停用態仍然在畫面上，所以也可能被觸發——在這裡擋掉，不要送出一個
		// 伺服器本來就不會生效的偏好。
		if (!deepPrepModelSupported.value) return;
		if (deepPrepSaving.value) return;
		const previous = deepPrepEnabled.value;
		deepPrepEnabled.value = nextEnabled;
		deepPrepSaving.value = true;
		try {
			const res = await _this.http.post(_this.requestUrl.playerAgentMode, {
				data: { roleId: formData.roleId, multiPassEnabled: nextEnabled },
			});
			if (!res || res.statusCode !== 200) throw new Error('unexpected status');
			const pref = normalizeMultiPassPreference(res);
			deepPrepEnabled.value = pref.multiPassEnabled;
			deepPrepRuntimeEnabled.value = pref.runtimeEnabled;
			deepPrepModelSupported.value = pref.modelSupported;
			deepPrepCostWarning.value = pref.costWarning;
			uni.$emit('multiPassPreferenceUpdated', { roleId: formData.roleId, ...pref });
			// 價格與無限卡覆蓋是伺服器按「這張卡有沒有開 Agent 模式」算的，所以
			// 開關一撥，整份清單的標價就變了——固定價轉成浮動、無限卡從涵蓋變成
			// 不涵蓋。不重抓的話使用者會在**決定要不要開的那一頁**看到舊價，
			// 要離開再回來才會更新。
			getModelList();
		} catch (error) {
			// 存不進去就把開關撥回去——顯示成已開啟卻沒生效，比不給開更糟。
			deepPrepEnabled.value = previous;
			console.warn('[ModelSelect] 儲存深入準備偏好失敗:', error);
		} finally {
			deepPrepSaving.value = false;
		}
	};

	onMounted(() => {
		if (props.open) {
			getModelList();
			loadDeepPrepPreference();
		}
	});

	// 彈層不是頁面：它掛上去之後就一直在，沒有「再次顯示」這個事件。每一次被打開
	// 都要重問一次——價格與支援度都會在別處被改掉（換了 Agent 模式、換了卡）。
	watch(() => props.open, (open) => {
		if (!open) return;
		// 這一份掛上去就一直在（彈層不是頁面）：上一次按過確認留下的 isSure 會讓第二次
		// 確認直接被擋掉——重新整理後只有第一次有效（owner 2026-09-05）。每次打開歸零。
		isSure.value = false;
		syncFromProps();
		getModelList();
		loadDeepPrepPreference();
	});

	// 呼叫端那邊的設定變了（例如另一個彈層存了上下文檔位）就跟著走。
	function syncFromProps() {
		formData.roleId = props.roleId;
		formData.selectModel = props.selectModel;
		formData.selectModelName = props.selectModelName;
		formData.context = props.context;
		formData.thinkingDepth = props.thinkingDepth;
		formData.showThinkingProcess = props.showThinkingProcess !== false;
		formData.autoCompactEnabled = Boolean(props.autoCompactEnabled);
		formData.compactExtraInstruction = props.compactExtraInstruction || '';
	}

	watch(() => [props.roleId, props.selectModel, props.context, props.thinkingDepth].join('|'), () => {
		if (!props.open) syncFromProps();
	});

	// 換了模型就重新問一次支援度。
	//
	// 先前只在 onLoad / onShow 查——而 onShow 是「頁面顯示」不是「選了模型」，
	// 所以在頁面裡點來點去時支援度從不更新，開關的顯隱取決於進頁面那一刻的模型。
	// 那段程式碼的註解寫著「換過模型之後支援度可能變了，重新確認一次」，
	// 但它掛錯了事件，所以那件事實際上沒有發生。
	watch(() => formData.selectModel, () => {
		if (isLoading.value) return;
		loadDeepPrepPreference();
	});

	// 記憶輪數變更時重新拉取動態模型的價格範圍
	watch(() => formData.context, () => {
		if (!isLoading.value) {
			refreshDynamicPrices();
		}
	});

	const modelListQueryParams = () => {
		const data = { contextLevel: formData.context };
		if (formData.roleId) {
			data.roleId = formData.roleId;
		}
		return data;
	};

	const refreshDynamicPrices = async () => {
		try {
			// 這一片自己有骨架（isLoading）。不關掉全螢幕的等待遮罩，玩家會看到一層
			// 蓋住整個畫面的轉圈，而他要的東西就在底下正在畫出來。
			const res = await _this.http.get(_this.requestUrl.getModelListV2, {
				data: modelListQueryParams(),
				showLoading: false,
			});
			if (res.statusCode == 200 && res.data) {
				const newTabs = res.data;
				for (let g = 0; g < newTabs.length && g < modelTabs.value.length; g++) {
					const newFamilies = newTabs[g].families || [];
					const oldFamilies = modelTabs.value[g].families || [];
					for (const nf of newFamilies) {
						const of = oldFamilies.find(f => f.family === nf.family);
						if (!of) continue;
						for (const nv of (nf.variants || [])) {
							const ov = (of.variants || []).find(v => v.value === nv.value);
							if (ov) {
								ov.noLimitEligible = nv.noLimitEligible;
								ov.noLimitCovered = nv.noLimitCovered;
								if (nv.billingType === 'dynamic') {
									ov.estMinScore = nv.estMinScore;
									ov.estMaxScore = nv.estMaxScore;
									ov.estSource = nv.estSource;
									ov.estSampleCount = nv.estSampleCount;
								}
							}
						}
						if (nf.billingType === 'dynamic') {
							of.estMinScore = nf.estMinScore;
							of.estMaxScore = nf.estMaxScore;
							of.estSource = nf.estSource;
							of.estSampleCount = nf.estSampleCount;
						}
					}
				}
			}
		} catch (e) {
			console.warn('Failed to refresh dynamic prices:', e);
		}
	};

	const goBack = () => emit('close');

	const showTip = (type) => {
		let title = "", content = "";
		switch (type) {
			case 1:
				title = t('chat.memory_rounds');
				content = t('chat.memory_rounds_tips');
				break;
			case 3:
				title = t('modelSelect.enableAutoCompact');
				content = t('modelSelect.autoCompactV2Tips');
				break;
			case 4:
				title = t('modelSelect.contextBudgetShort');
				content = t('modelSelect.contextBudgetTips');
				break;
			case 5:
				title = t('modelSelect.thinkingDepth');
				content = t('modelSelect.thinkingDepthTips');
				break;
			}
			uni.showModal({ title, content, showCancel: false });
		};

	const onAutoCompactChange = () => {
		console.log('[modelSelect] autoCompactEnabled changed to:', formData.autoCompactEnabled);
	};

	const mrChange = (e) => {
		formData.context = e.detail.value;
	};

	const contextBudgetLevelChange = (value: number) => {
		const option = contextBudgetOptions.value.find(item => item.value === value);
		if (!option) return;
		mrChange({ detail: { value: option.value } });
	};

	const thinkingDepthChange = (value) => {
		if (!thinkingDepthOptions.value.some(item => item.value === value)) return;
		formData.thinkingDepth = value;
	};

	const getThinkingOptionLabel = (option) => {
		if (!option) return '';
		return option.label || t(option.labelKey);
	};

	const tabChange = (e) => {
		// 兩種呼叫形狀：既有的 tabs 元件送 { index }，v3 的側欄直接送數字。
		// 不正規化的話數字會讓 e.index 變 undefined → modelTabs[undefined] → 空陣列，
		// 畫面只顯示「暫無模型」，看起來像資料沒回來，其實是參數形狀不對。
		const index = normalizeTabIndex(e);
		if (index < 0) {
			showAllFamilies();
			return;
		}
		tabCurrent.value = index;
		currentFamilies.value = modelTabs.value[index]?.families || [];
		// 記在這裡而不是側欄的 click 上：空狀態那顆「看全部」也走這條路，
		// 之後新增的呼叫端同樣不必各自記得補一次。
		rememberBrowsedCategory(modelTabs.value[index]?.group || '');
	};

	const showAllFamilies = () => {
		rememberBrowsedCategory(ALL_CATEGORY);
		tabCurrent.value = -1;
		const all = [];
		modelTabs.value.forEach(tab => {
			if (tab.families) {
				all.push(...tab.families);
			}
		});
		currentFamilies.value = all;
	};

	// Check if a family contains the currently selected model
	/** 只在還沒定過的時候記下來——之後使用者怎麼選都不再改變清單次序。 */
	const capturePinnedFamily = () => {
		if (pinnedModelValue.value) return;
		const value = (selectItem.value && selectItem.value.value) || formData.selectModel;
		if (value) pinnedModelValue.value = value;
	};

	const isFamilySelected = (family) => {
		return family.variants.some(v => v.value === formData.selectModel);
	};

	// Select the default (cheapest) variant of a family
	const selectDefaultVariant = (family) => {
		if (family.isMember && !userInfo.isMember && !userInfo.isTryMember && !userInfo.isNoLimitMember && !userInfo.isUseLimitMember) {
			message.warning(t('chat.model_vip_tips'));
			return;
		}
		// If already selected within this family, don't change variant
		const existing = family.variants.find(v => v.value === formData.selectModel);
		if (existing) return;

		// Select cheapest variant
		const variant = family.variants[0];
		if (variant) {
			formData.selectModel = variant.value;
			selectItem.value = { ...variant, family: family.family };
			normalizeContextForSelectedModel(true);
			activatedFamilies.value.add(family.family);
		}
	};

	// Select a specific variant (tier pill click)
	// 換了模型就要重問一次支不支援。
	//
	// loadDeepPrepPreference 本來就帶「使用者現在挑的那個模型」（見那裡的註解），
	// 但先前只在進頁與 onShow 時呼叫——於是使用者點了支援的模型，Agent 那一列
	// 仍然掛著上一個模型的答案。實測：卡片已打勾 Claude Sonnet 5，開關卻還寫著
	// 「這個模型還不支援」，而那是已存檔的 qwen:32b 的答案。
	watch(() => formData.selectModel, (next, prev) => {
		if (!next || next === prev) return;
		loadDeepPrepPreference();
	});

	const selectVariant = (family, variant) => {
		formData.selectModel = variant.value;
		selectItem.value = { ...variant, family: family.family };
		normalizeContextForSelectedModel(true);
		activatedFamilies.value.add(family.family);
	};

	const toggleExpand = (family) => {
		family.expanded = !family.expanded;
	};

	// Selected family → show channel description; unselected → show family description
	const getDisplayDescription = (family) => {
		if (family.variants && family.variants.length > 1) {
			const selected = family.variants.find(v => v.value === formData.selectModel);
			if (selected && selected.description) {
				return selected.description;
			}
		}
		return family.description;
	};

	const getVariantThinkingDepth = (variant) => {
		if (!variant || !Array.isArray(variant.thinkingDepthOptions) || variant.thinkingDepthOptions.length === 0) {
			return '';
		}
		if (selectItem.value && variant.value === selectItem.value.value) {
			return formData.thinkingDepth;
		}
		return defaultThinkingDepthValue(variant.thinkingDepthOptions, variant.defaultThinkingDepth);
	};

	const getFixedThinkingDepthSurcharge = (variant) => {
		if (!variant || variant.value !== 'deepseek-v4-flash') return 0;
		const depth = getVariantThinkingDepth(variant);
		if (depth === 'max') return 10;
		if (depth === 'high' || depth === 'on') return 5;
		return 0;
	};

	const getVariantPrice = (variant) => {
		if (!variant) return { fixed: 0, isDynamic: false };
		if (variant.billingType === 'dynamic') {
			return {
				isDynamic: true,
				min: variant.estMinScore || 0,
				max: variant.estMaxScore || 0,
				source: variant.estSource || 'formula',
				sampleCount: variant.estSampleCount || 0,
			};
		}
		const thinkingSurcharge = getFixedThinkingDepthSurcharge(variant);
		if (formData.context === 100 && variant.isSupportMax) {
			return { fixed: (variant.maxScore || 0) + thinkingSurcharge, isDynamic: false };
		}
		return { fixed: ((variant.costScore || 0) * formData.context) + thinkingSurcharge, isDynamic: false };
	};

	const formatPrice = (priceObj) => {
		if (!priceObj) return '0';
		if (priceObj.isDynamic) {
			return `~${priceObj.min}-${priceObj.max}`;
		}
		return String(priceObj.fixed || 0);
	};

	const getPriceEstHint = (variant) => {
		if (!variant || variant.billingType !== 'dynamic') return '';
		if (variant.estSource === 'role') {
			return t('chat.price_est_hint_role');
		}
		if (variant.estSource === 'global') {
			return t('chat.price_est_hint_global');
		}
		return t('chat.price_est_hint_formula');
	};

	// 折扣相關 helper：originalCostScore / originalMaxScore 是後端在折扣期動態回傳的原價
	// 平時為 0，前端據此判斷是否顯示「劃掉的原價」
	const getOriginalVariantPrice = (variant) => {
		if (!variant) return 0;
		if (formData.context === 100 && variant.isSupportMax) {
			return variant.originalMaxScore || 0;
		}
		return (variant.originalCostScore || 0) * formData.context;
	};

	const getDiscountPercent = (family) => {
		if (!family || !family.originalCostScore || !family.variants?.length) return 0;
		const v = family.variants[0];
		const original = v.originalCostScore || 0;
		const current = v.costScore || 0;
		if (original <= 0 || current >= original) return 0;
		return Math.round((1 - current / original) * 100);
	};

	const formatDiscountDate = (untilTs) => {
		if (!untilTs) return '';
		// untilTs 是「折扣結束的第一秒」(unix sec)；顯示給用戶的是「截止前最後一天」= untilTs - 1 秒
		const d = new Date((untilTs - 1) * 1000);
		const m = d.getMonth() + 1;
		const day = d.getDate();
		return m + '/' + day;
	};

	const getFamilyNoLimitModel = (family) => {
		if (!family || !family.variants?.length) return null;
		const variants = getFilteredVariants(family);
		const selected = variants.find(v => v.value === formData.selectModel);
		const variant = selected || variants[0] || family.variants[0];
		if (!variant) return null;
		return {
			...variant,
			family: family.family,
			isCacheStable: variant.isCacheStable || family.isCacheStable,
			contextBudgetOptions: variant.contextBudgetOptions || family.contextBudgetOptions,
		};
	};

	/**
	 * 徽章區要不要出現。看的是**整區**有沒有東西，不是只看警示徽章——
	 * 無限卡那一顆也住在這一區。只看警示的話，健康的模型（一個警示都沒有）
	 * 會把「無限卡涵不涵蓋這個模型」一起藏掉。mobile 有一份同語意的判斷。
	 */
	const hasSignalBadges = (family) => {
		return alertBadgesFor(family).length > 0 || !!getNoLimitBadgeState(family);
	};

	const getNoLimitBadgeState = (family) => {
		return getNoLimitCoverageState(userInfo.value || userInfo, getFamilyNoLimitModel(family), formData.context);
	};

	const getNoLimitBadgeText = (family) => {
		return getNoLimitBadgeState(family) === 'available'
			? t('modelSelect.noLimitAvailable')
			: t('modelSelect.noLimitUnavailable');
	};

	// Model logo source: @lobehub/icons-static-svg (qwen, kimi, xiaomimimo).
	// Model logo source: @lobehub/icons-static-svg (qwen, kimi, xiaomimimo).
	//
	// 圖示用 import 而不是寫死 `/static/...` 路徑：舞台當套件嵌進別的站台時沒有 playground 的
	// /static/，路徑字串會變成破圖（第三方宿主 2026-09-06 實測）；import 由 build 決定去處
	// （playground 出檔案、套件 build 內嵌），兩邊都對。
	const modelIconMap = {
		'deepseek': icon_deepseek,
		'gpt': icon_gpt,
		'openai': icon_gpt,
		'claude': icon_claude,
		'llama': icon_llama,
		'qwen': icon_qwen,
		'gemini': icon_gemini,
		'mistral': icon_mistral,
		'yi': icon_yi,
		'glm': icon_glm,
		'chatglm': icon_glm,
		'moonshot': icon_kimi,
		'kimi': icon_kimi,
		'mimo': icon_xiaomimimo,
		'xiaomi': icon_xiaomimimo,
		'grok': icon_grok,
		'minimax': icon_minimax,
		'seed': icon_bytedance,
		// InclusionAI 官方 Ling 系列標誌（來源：官方 Hugging Face 模型庫）。
		'ling': icon_ling,
		'nemotron': icon_nvidia,
		'nvidia': icon_nvidia,
		// 這兩個是 2026-08-29 新上的家族。族名不含既有任何一個 key（gemma 不是
		// gemini、hunyuan 不是任何既有品牌），所以在補進來之前它們是掉到 default 的
		// ——畫面上那格會是首字塊，看起來像「這個模型還沒做好」。
		'hunyuan': icon_hunyuan,
		'tencent': icon_hunyuan,
		'gemma': icon_gemma,
		'default': icon_default
	};

	const getModelIconPath = (name) => {
		if (!name) return modelIconMap.default;
		const lowerName = name.toLowerCase();
		for (const key of Object.keys(modelIconMap)) {
			if (key !== 'default' && lowerName.includes(key)) {
				return modelIconMap[key];
			}
		}
		return modelIconMap.default;
	};

	const getModelIconBg = (name) => {
		if (!name) return '#2A2A2E';
		const n = name.toLowerCase();
		if (n.includes('claude')) return '#DA7756';
		if (n.includes('gpt') || n.includes('openai')) return '#FFFFFF';
		if (n.includes('grok')) return '#000000';
		if (n.includes('qwen')) return '#FFFFFF';
		if (n.includes('kimi')) return '#FFFFFF';
		if (n.includes('mimo') || n.includes('xiaomi')) return '#FFFFFF';
		if (n.includes('seed')) return '#FFFFFF';
		if (n.includes('nemotron') || n.includes('nvidia')) return '#FFFFFF';
		// 這兩個 logo 是 currentColor 的單色圖（同 qwen／kimi／xiaomi 那批），
		// 在深底上會糊成一團，所以配白底。
		if (n.includes('hunyuan') || n.includes('tencent')) return '#FFFFFF';
		if (n.includes('gemma')) return '#FFFFFF';
		return '#2A2A2E';
	};

	const getModelList = async () => {
		try {
			// 這一片自己有骨架（isLoading）。不關掉全螢幕的等待遮罩，玩家會看到一層
			// 蓋住整個畫面的轉圈，而他要的東西就在底下正在畫出來。
			const res = await _this.http.get(_this.requestUrl.getModelListV2, {
				data: modelListQueryParams(),
				showLoading: false,
			});

			if (res.statusCode == 200) {
				modelTabs.value = res.data;
				// 接回使用者上一輪瀏覽到的分類（見 utils/model-select-category-memory）。
				// 接得回來就不要再跳到目前使用中的模型——那個跳轉是給「沒有瀏覽意圖」
				// 的進場用的，重放在回頁上等於把使用者剛看到的位置洗掉。
				const resumedBrowsedCategory = resumeBrowsedCategory();
				if (!resumedBrowsedCategory) {
					tabCurrent.value = 0;
					currentFamilies.value = modelTabs.value[0]?.families || [];
				}


				nextTick(() => {
					// Find the tab containing the selected model and switch to it
					if (!resumedBrowsedCategory) updateTabFromSelectedModel();
					// Sync selectItem
					syncSelectItem();
					isLoading.value = false;
				});
			} else {
				message.error(res.data.error);
				isLoading.value = false;
			}
		} catch (e) {
			console.error('Failed to fetch model list:', e);
			isLoading.value = false;
		}
	};

	// 回頁時接回上一輪瀏覽到的分類。記住的分類可能已經不在新一份清單裡
	// （下架、改名）——那時連記憶一起放掉並回傳 false，讓「跳到目前使用中的模型」
	// 重新生效，不要把人留在一個跟他無關的分類上。
	const resumeBrowsedCategory = () => {
		const remembered = browsedCategory();
		if (!remembered) return false;
		// 清單是空的代表這次沒拿到資料，不代表分類不見了。這時放掉記憶等於
		// 讓一次失敗的請求抹掉使用者的瀏覽位置。
		if (!modelTabs.value.length) return false;
		if (remembered === ALL_CATEGORY) {
			showAllFamilies();
			return true;
		}
		const index = modelTabs.value.findIndex(tab => tab.group === remembered);
		if (index < 0) {
			forgetBrowsedCategory();
			return false;
		}
		tabCurrent.value = index;
		currentFamilies.value = modelTabs.value[index]?.families || [];
		return true;
	};

	const updateTabFromSelectedModel = () => {
		if (!formData.selectModel || !modelTabs.value.length) return;

		// If current tab already contains the selected model, don't switch
		const currentTabHasModel = currentFamilies.value.some(f =>
			f.variants && f.variants.some(v => v.value === formData.selectModel)
		);
		if (currentTabHasModel) return;

		// 跳過第一個分頁去找這個模型：第一個分頁是編輯／演算法選出來的推薦集合
		// （2026-08-29 起是「全球熱門」，先前是「精選」），模型在那裡是客串，
		// 在品牌分頁才是它的家。找不到才退回任何一個分頁。
		let tabIndex = modelTabs.value.findIndex((tab, idx) =>
			idx > 0 && tab.families && tab.families.some(f =>
				f.variants.some(v => v.value === formData.selectModel)
			)
		);
		// 別的分頁都沒有就退回第一個分頁
		if (tabIndex < 0) {
			tabIndex = modelTabs.value.findIndex(tab =>
				tab.families && tab.families.some(f =>
					f.variants.some(v => v.value === formData.selectModel)
				)
			);
		}

		if (tabIndex >= 0 && tabIndex !== tabCurrent.value) {
			tabCurrent.value = tabIndex;
			currentFamilies.value = modelTabs.value[tabIndex].families;
		}
	};


// 聊天頁頂欄與 model chip 顯示的是 selectModelName。它一度被直接賦成 variant.value
// ——也就是 `deepseek-v4-flash-ripple` 這種內部識別碼，用戶在那個位置看到的就是它。
//
// 這個欄位本來就是「顯示名」（既有值如 BaseBot、Claude Sonnet 4.5 都是友好名），
// 是選單這裡賦值時取錯了欄位。組成友好名：模型名 ＋ 線路名（有線路時）。
function composeModelDisplayName(variant, familyName) {
	if (!variant) return '';
	const base = (variant.name || familyName || '').trim();
	const lane = (variant.channelLabel || '').trim();
	if (!base) return lane || variant.value || '';
	return lane ? base + ' · ' + lane : base;
}

	const syncSelectItem = () => {
		if (!formData.selectModel) return;
		for (const tab of modelTabs.value) {
			if (!tab.families) continue;
			for (const family of tab.families) {
				const found = family.variants.find(v => v.value === formData.selectModel);
				if (found) {
					selectItem.value = { ...found, family: family.family };
					formData.selectModelName = composeModelDisplayName(found, family.family);
					capturePinnedFamily();
					normalizeContextForSelectedModel();
					return;
				}
			}
		}
	};

	// 高消費確認攔在**按下確認的那一刻**，不是撥開關的那一刻。
	//
	// 偏好是跟著這個對話走的，不是跟著模型走：在 V4 Flash 上開過之後，切到
	// V4 Pro 時開關本來就是開的，根本不會有 change 事件，於是最該攔的那一次
	// （換到貴模型）反而完全不攔。而不管使用者怎麼換模型、怎麼撥開關，最後都會
	// 經過「確認」這一步，攔在這裡才蓋得住所有路徑。
	const costConfirming = ref(false);
	const sure = async () => {
		if (isSure.value || costConfirming.value) return;
		if (deepPrepOn.value && deepPrepCostWarning.value) {
			costConfirming.value = true;
			let confirmed = false;
			try {
				confirmed = await confirmDeepPrepCost();
			} finally {
				costConfirming.value = false;
			}
			// 取消就留在這一頁，什麼都不套用。Agent 模式的偏好在撥開關時就已經存過
			// 了，這裡取消的是「換到這個模型」，兩者是分開的。
			if (!confirmed) return;
		}
		isSure.value = true;
		saveUserDefine();
	};

	/*
		確認鍵在殼上，不在這一份裡：作者的卡寫的是
		`.model-setting-scope .bottom .btn`——那顆鍵必須留在 MMD 的名字底下。
		所以把「確認」這個動作交出去，讓殼上的那顆鍵按下時走的是同一條路
		（含高消費確認）。
	*/
	defineExpose({ sure });
</script>
