import {
	computed,
	ref,
	reactive,
	onMounted,
	onUnmounted,
	getCurrentInstance,
	unref,
	nextTick,
	watch
} from 'vue'
import {
	useStore
} from 'vuex'
import {
	message,
	Modal
} from 'ant-design-vue';
import {
	useI18n
} from 'vue-i18n';

// 导入草稿管理工具
import { saveDraft, loadDraft, clearDraft, hasDraft } from '@/utils/draftManager'
// 邊界 7（模型思考能力三檔聲明制）：adaptive 模型「顯示思考過程」顯示層開關，
// 純本地偏好，不經 server（見 @/utils/thinking-display-pref.ts 模組註解）。
import { getShowThinkingProcess } from '@/utils/thinking-display-pref'

// 生成 chatSetting 草稿 key (基于 roleId)
const getChatSettingDraftKey = (roleId) => {
	return roleId ? `chat_setting_draft_${roleId}` : 'chat_setting_draft';
};

// 防抖函数工具
const debounce = (func, delay) => {
	let timeoutId;
	return function(...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func.apply(this, args), delay);
	};
};


// 事故根因（見工單：VIP 永久記憶被連坐關閉）：某些長駐、不會每次都重新掛載的
// 頁面/視窗手上可能是過期快照，若對「單一格」的切換動作整包送出 formData，會把
// 使用者剛在別的頁面存好的值（永久記憶、系統提示…）蓋回舊值。fields 讓呼叫端
// 只送真正變動的欄位；不帶 fields 時維持既有行為，送出整個 formData（給正在
// 編輯整組設定、進場已重讀過快照的頁面用）。
// 抽成純函式方便單元測試，不依賴 useStore()/useI18n()/getCurrentInstance() 等
// Vue composition context。
export function buildScopedUserDefinePayload(formData, fields) {
	// fields 只認真正的純物件。呼叫端若寫成 `@click="setUserDefine"`，Vue 會把
	// click 事件當第一個參數傳進來——事件是 truthy，但屬性都在原型上，展開後幾乎
	// 是空的，結果整包設定被縮成 { roleId }，看起來存成功、實際一格都沒送。
	// 這裡把那種誤用退回全量存檔：寧可多送，也不要靜默丟掉使用者填的東西。
	if (!isPlainFieldsObject(fields)) return formData;
	return { roleId: formData.roleId, ...fields };
}

function isPlainFieldsObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

export const useUserDefine = () => {
	const store = useStore()
	const {
		t,
		locale
	} = useI18n();

	const {
		proxy: _this
	} = getCurrentInstance();

	const userInfo = computed(() => store.state.userInfo)
	const tempParam = computed(() => store.state.tempParam)
	const hasLogin = computed(() => store.state.hasLogin)
	const currentRoleId = computed(() => store.state.currentRoleId)
	const currentRole = computed(() => store.state.currentRole)

	const formData = reactive({
		roleId: "",
		userName: "", //我的称呼
		userDefine: "", //用户设定
		userSex: "man", //用户性别
		userSexDesc: "", //性别描述
		selectModel: "", // 目前選擇的模型；空值＝還沒從伺服器讀到設定，送出前會補讀
		selectModelName: "", // 目前選擇的模型顯示名
		thinkingDepth: "", //模型思考深度
		showThinkingProcess: true, //adaptive 模型「顯示思考過程」顯示層開關（邊界 7），純本地偏好，不經 server
		permanentMemory: false, //永久记忆
		statusBarMode: false, //状态栏模式
		talkExample: [],
		templateStyle: "chat", //对话风格
		replyLength: "low", //回复字数
		limitLevel: "medium", //道德感
		showAll: false,
		backgroundUrl: '', //用户设定角色聊天背景
		fontFamily: '', // 畫布字體偏好（card / wenkai / system；空＝依卡片來源）
		context: 1,
		systemPrompt:"",//系统预设
		// 自动压缩相关（V2.0 服务端方案）
		autoCompactEnabled: false,    // 是否开启自动压缩（同步到后端，压缩提示词由服务端从i18n文件获取）
		// V2 提示词策略
		sandboxLevel: "",             // "light" | "standard"(default) | "immersive" | "deep"
		jailbreak: "",                // 自定義破限詞（空值 = 使用預設）
		// 劇情摘要偏好（Part B）
		compactExtraInstruction: "", // 使用者自訂壓縮指令（≤500 字）
	})

	// API 回傳的預設破限詞（供 placeholder 使用）
	const defaultJailbreak = ref("");

	// 草稿暂存相关状态
	const isDraftLoaded = ref(false);
	const lastSaveTime = ref('');
	let stopWatchFormData = null; // watch 停止函数引用

	const itemList = reactive([{
		text: t('create.roleSex_man'),
		value: 'man'
	}, {
		text: t('create.roleSex_women'),
		value: 'women'
	}, {
		text: t('create.roleSex_other'),
		value: 'other'
	}])

	const templateStyleList = ref([{
		text: t('chat.template_style_chat'),
		value: "chat"
	}, {
		text: t('chat.template_style_story'),
		value: "story"
	}])

	const replyLengthList = ref([{
		text: t('chat.reply_length_low'),
		value: "low",
	}, {
		text: t('chat.reply_length_medium'),
		value: "medium"
	}, {
		text: t('chat.reply_length_high'),
		value: "high"
	}])

	const limitLevelList = ref([{
		text: t('chat.reply_length_di'),
		value: "low",
	}, {
		text: t('chat.reply_length_medium'),
		value: "medium"
	}, {
		text: t('chat.reply_length_gao'),
		value: "high"
	}])

	const sandboxLevelList = ref([{
		text: t('chat.sandbox_light') || 'Light',
		value: "light",
	}, {
		text: t('chat.sandbox_standard') || 'Standard',
		value: "standard"
	}, {
		text: t('chat.sandbox_immersive') || 'Immersive',
		value: "immersive"
	}, {
		text: t('chat.sandbox_deep') || 'Deep',
		value: "deep"
	}])

	const speechList = ref([]);

	// 工單 #45：onMounted 是一次性檢查，若掛載那一刻 hasLogin 恰好是 false
	// （訪客先看到聊天頁、登入疊層蓋在上面——見 LoginMixin.js 的 loginTipShow，
	// 不阻擋渲染），使用者之後原地登入，hasLogin 變 true 但沒有任何機制會補
	// 呼叫 getUserDefine()，formData.selectModelName 永久卡在 data() 佔位字面值
	// "BaseModel"（跟 mobile 回報「退出聊天再進變回普通模型」同一顆競態）。
	// hasFetchedInitialUserDefine 旗標讓 onMounted 與下面的 watch(hasLogin) 共用
	// 同一次性語意——誰先滿足條件誰負責 fetch，另一邊不會疊加成第二次呼叫。
	const hasFetchedInitialUserDefine = ref(false)

	onMounted(() => {
		// 仅在登录状态下获取用户自定义设置
		if (unref(hasLogin) && !hasFetchedInitialUserDefine.value) {
			hasFetchedInitialUserDefine.value = true
			getUserDefine()
		}
	})

	// hasLogin 補救 watcher：掛載當下 hasLogin 為 false 時，onMounted 不會消耗
	// hasFetchedInitialUserDefine，這裡在 hasLogin 之後變 true 時補一次——不回退
	// 任何既有防併發語義，也不是無條件覆寫，只是「至少成功執行一次」的補救。
	watch(hasLogin, (newVal) => {
		if (newVal && !hasFetchedInitialUserDefine.value) {
			hasFetchedInitialUserDefine.value = true
			getUserDefine()
		}
	})

	/*
		玩家偏好只放**外觀**：桌布、顯示層開關。

		曾經這裡連模型、上下文檔位、稱呼與自我介紹一起讀——那是錯的來源。
		送出那一輪讀的是 `player/role-settings`（伺服器上這張卡的遊玩設定），
		寫進偏好的模型與檔位一個字都不會生效：畫面上看起來存好了，實際那一輪
		照舊值跑，而且沒有任何跡象看得出來。遊玩設定由畫布自己讀寫
		（見 pages/canvas/canvas-role-settings.ts）；這一份不再碰它們，
		免得兩邊各寫一次、後到的那次把先到的洗掉。
	*/
	const PLAY_PREFERENCE_DEFAULTS = {
		showAll: false,
		backgroundUrl: '',
		// 畫布字體：'' 跟卡片來源的預設走（MMD 卡＝文楷，其餘跟隨卡片）、wenkai、system、card
		fontFamily: '',
	};

	const getUserDefine = () => {
		if (!unref(formData).roleId) {
			return Promise.resolve(); // 返回一个 resolved Promise
		}
		return _this.http.get(_this.requestUrl.playerPreference, {
			data: {
				roleId: unref(formData).roleId
			},
			showLoading: false,
		}).then(res => {
			const prefs = (res && res.statusCode == 200 && res.data && res.data.prefs) || {};
			for (const key of Object.keys(PLAY_PREFERENCE_DEFAULTS)) {
				const value = prefs[key];
				formData[key] = (value === undefined || value === null || value === '')
					? PLAY_PREFERENCE_DEFAULTS[key]
					: value;
			}
			if (typeof formData.talkExample === 'string' && formData.talkExample !== 'null') {
				try { formData.talkExample = JSON.parse(formData.talkExample); } catch (_) { formData.talkExample = null; }
			}
			// 模型不在這裡補預設值：目錄裡沒有的代號一旦被送出去，伺服器會拿它去
			// 查表，查不到就落到未知模型的回退價。這張卡該用哪顆模型由
			// `player/role-settings` 說了算，畫布讀到什麼就用什麼。
			// 邊界 7：adaptive 模型「顯示思考過程」是純顯示層偏好，不經 server。
			formData.showThinkingProcess = getShowThinkingProcess(formData.roleId);
		}).catch(e => {
			console.log('角色設定錯誤', e)
		});
	}

	// loading 状态 (保留用于按钮禁用)
	const isSubmitting = ref(false);

	// fields：只想更動的欄位（見 buildScopedUserDefinePayload 註解），省略時維持既有
	// 行為，送出整個 formData。
	const setUserDefine = async (fields) => {
		if (isSubmitting.value) return Promise.resolve();

		isSubmitting.value = true;

		const payload = buildScopedUserDefinePayload(formData, fields);

		return _this.http.post(_this.requestUrl.playerPreferenceSave, {
			header: {
				'content-type': 'application/json'
			},
			data: { roleId: payload.roleId, prefs: payload },
			loadingText: t('main.saving') || '儲存中', // 自定义 loading 文案
		}).then(res => {
			if (res.statusCode == 200) {
				// 保存成功后清除草稿
				clearChatSettingDraft();
				message.success(t('main.save_success') || '儲存成功');
				uni.$emit('setDefineSuccess', {})
			} else {
				message.error(res.data.error || t('main.save_failed') || '儲存失敗');
			}
		}).catch(e => {
			// 错误已在全局拦截器处理，这里只需要打印日志
			console.error('[setUserDefine]', e);
		}).finally(() => {
			isSubmitting.value = false;
		});
	}

	const getRole = async (callback) => {
		_this.http.get(_this.requestUrl.getRoleDetail, {
			data: {
				roleId: unref(currentRoleId)
			}
		}).then(res => {
			if (res.statusCode == 200) {
				var role = {};
				if (uni.getLocale() == 'zh-Hant') {
					role = {
						...res.data,
						// 转换属性格式
						roleDesc:_this.fui.tify(res.data.roleDesc),
						roleName:_this.fui.tify(res.data.roleName),
						roleWelcome:_this.fui.tify(res.data.roleWelcome),
						roleDetailDesc:_this.fui.tify(res.data.roleDetailDesc)
					};
				} else {
					role = res.data;
				}
				setCurrentRole(role);
				if (callback) {
					callback(null, role);
				}
			} else {
				message.error(res.data.error);
				if (callback) {
					callback(res.data.error, null);
				}
			}
		}).catch(e => {
			console.log(e)
			if (callback) {
				callback(e, null);
			}
		})
	}

	const setCurrentRole = async (role) => {
		store.commit('setCurrentRole', role)
	}

	const setCurrentRoleId = async (roleId) => {
		store.commit('setCurrentRoleId', roleId)
	}

	// ========== 草稿暂存相关方法 ==========

	// 保存服务端原始数据的快照，用于比较差异
	let serverDataSnapshot = null;

	/**
	 * 比较两个对象是否有实质性差异（忽略元数据和空值差异）
	 */
	const hasSignificantChanges = (current, original) => {
		if (!original) return false;

		// 需要比较的关键字段
		const fieldsToCompare = [
			'userName', 'userDefine', 'userSex', 'systemPrompt',
			'templateStyle', 'replyLength', 'limitLevel',
			'talkExample'
		];

		for (const field of fieldsToCompare) {
			const currentVal = current[field];
			const originalVal = original[field];

			// 处理 talkExample 数组的比较
			if (field === 'talkExample') {
				const currentStr = JSON.stringify(currentVal || []);
				const originalStr = JSON.stringify(originalVal || []);
				if (currentStr !== originalStr) {
					return true;
				}
				continue;
			}

			// 处理空值情况
			const currentNormalized = currentVal === undefined || currentVal === null ? '' : currentVal;
			const originalNormalized = originalVal === undefined || originalVal === null ? '' : originalVal;

			if (currentNormalized !== originalNormalized) {
				return true;
			}
		}

		return false;
	};

	/**
	 * 自动保存草稿
	 * @param {Object} data - 要保存的数据
	 */
	const saveChatSettingDraftAuto = (data) => {
		// 只有当数据与服务端原始数据有差异时才保存草稿
		if (!hasSignificantChanges(data, serverDataSnapshot)) {
			return;
		}

		const draftKey = getChatSettingDraftKey(formData.roleId);
		const result = saveDraft(draftKey, data, { manual: false });
		if (result.success) {
			lastSaveTime.value = result.timestamp;
			console.log('[useUserDefine] Auto-saved draft at:', result.timestamp);
		}
	};

	// 创建防抖保存函数
	const debouncedSaveDraft = debounce((data) => {
		if (isDraftLoaded.value) {
			saveChatSettingDraftAuto(data);
		}
	}, 800);

	/**
	 * 初始化草稿自动保存监听
	 * 在页面 onLoad 后调用
	 */
	const initDraftWatch = () => {
		// 使用 Vue 3 的 watch 函数监听 formData 深度变化
		stopWatchFormData = watch(
			() => formData,
			(newValue) => {
				if (isDraftLoaded.value) {
					debouncedSaveDraft({ ...newValue });
				}
			},
			{ deep: true }
		);
	};

	/**
	 * 停止草稿监听
	 * 在页面 onUnmounted 时调用
	 */
	const destroyDraftWatch = () => {
		if (stopWatchFormData) {
			stopWatchFormData();
			stopWatchFormData = null;
		}
	};

	/**
	 * 手动保存草稿 (页面离开时调用)
	 */
	const saveChatSettingDraftOnLeave = () => {
		if (!isDraftLoaded.value || !formData.roleId) {
			return;
		}

		// 只有当数据与服务端原始数据有差异时才保存草稿
		if (!hasSignificantChanges(formData, serverDataSnapshot)) {
			return;
		}

		const draftKey = getChatSettingDraftKey(formData.roleId);
		const result = saveDraft(draftKey, { ...formData }, { manual: false });
		if (result.success) {
			console.log('[useUserDefine] Draft saved on leave:', result.timestamp);
		}
	};

	/**
	 * 加载草稿数据
	 * 在获取服务端数据后调用，检查是否有本地草稿需要恢复
	 */
	const loadChatSettingDraft = () => {
		const draftKey = getChatSettingDraftKey(formData.roleId);

		// 先保存服务端数据快照
		serverDataSnapshot = { ...formData };
		if (formData.talkExample) {
			serverDataSnapshot.talkExample = JSON.parse(JSON.stringify(formData.talkExample));
		}

		// 检查是否存在草稿
		if (!hasDraft(draftKey)) {
			isDraftLoaded.value = true;
			return;
		}

		// 加载草稿数据
		const draftData = loadDraft(draftKey);
		if (!draftData) {
			isDraftLoaded.value = true;
			return;
		}

		// 排除元数据后比较
		const { _draftMeta, ...cleanDraftData } = draftData;

		// 比较草稿和服务端数据是否有实质性差异
		if (!hasSignificantChanges(cleanDraftData, serverDataSnapshot)) {
			// 没有实质性差异，静默清除草稿
			clearDraft(draftKey);
			console.log('[useUserDefine] Draft has no significant changes, cleared silently');
			isDraftLoaded.value = true;
			return;
		}

		// 有实质性差异，弹窗确认是否恢复草稿
		Modal.confirm({
			title: t('main.tip'),
			content: t('create.loadDraft_confirm'),
			okText: t('create.loadDraft_restore'),
			cancelText: t('create.loadDraft_discard'),
			centered: true,
			onOk() {
				// 用户选择恢复草稿
				Object.assign(formData, cleanDraftData);
				lastSaveTime.value = _draftMeta?.savedAt || '';
				message.success(t('create.loadDraft_success'));
				isDraftLoaded.value = true;
			},
			onCancel() {
				// 用户选择放弃草稿
				clearDraft(draftKey);
				isDraftLoaded.value = true;
			}
		});
	};

	/**
	 * 清除草稿 (提交成功时调用)
	 */
	const clearChatSettingDraft = () => {
		const draftKey = getChatSettingDraftKey(formData.roleId);
		clearDraft(draftKey);
		console.log('[useUserDefine] Draft cleared after success');
	};

	// 返回需要在模板中使用的响应式状态和方法
	return {
		userInfo,
		tempParam,
		hasLogin,
		formData,
		setUserDefine,
		getUserDefine,
		itemList,
		templateStyleList,
		replyLengthList,
		limitLevelList,
		sandboxLevelList,
		defaultJailbreak,
		currentRoleId,
		currentRole,
		setCurrentRole,
		setCurrentRoleId,
		getRole,
		// 提交状态
		isSubmitting,
		// 草稿相关
		isDraftLoaded,
		lastSaveTime,
		initDraftWatch,
		destroyDraftWatch,
		loadChatSettingDraft,
		saveChatSettingDraftOnLeave,
		clearChatSettingDraft
	}
}
