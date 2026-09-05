/**
 * 全局 Loading 管理器
 * @module utils/loadingManager
 * @description 提供全局 Loading 状态管理，支持多请求叠加和超时保护
 */

import { ref, reactive } from 'vue';

// 响应式状态
const state = reactive({
	visible: false,
	text: '',
	requestCount: 0, // 并发请求计数
	timeoutId: null,
	maxTimeout: 30000, // 最大超时时间 30 秒
});

// 默认文案 (会被国际化覆盖)
let defaultTexts = {
	loading: '加载中',
	submitting: '提交中',
	saving: '保存中',
	uploading: '上传中',
};

/**
 * 设置默认文案 (用于国际化)
 */
export function setLoadingTexts(texts) {
	defaultTexts = { ...defaultTexts, ...texts };
}

/**
 * 显示 Loading
 * @param {string} text - 加载文案
 * @param {object} options - 配置选项
 * @param {number} options.timeout - 超时时间 (ms)，默认 30000
 */
export function showLoading(text = '', options = {}) {
	const { timeout = state.maxTimeout } = options;

	state.requestCount++;
	state.text = text || defaultTexts.loading;
	state.visible = true;

	// 清除之前的超时
	if (state.timeoutId) {
		clearTimeout(state.timeoutId);
	}

	// 设置超时保护
	state.timeoutId = setTimeout(() => {
		console.warn('[LoadingManager] 请求超时，自动关闭 Loading');
		forceHideLoading();
	}, timeout);
}

/**
 * 隐藏 Loading
 * 支持多请求叠加，只有所有请求都完成后才隐藏
 */
export function hideLoading() {
	state.requestCount = Math.max(0, state.requestCount - 1);

	if (state.requestCount === 0) {
		state.visible = false;
		state.text = '';

		if (state.timeoutId) {
			clearTimeout(state.timeoutId);
			state.timeoutId = null;
		}
	}
}

/**
 * 强制隐藏 Loading (忽略请求计数)
 */
export function forceHideLoading() {
	state.requestCount = 0;
	state.visible = false;
	state.text = '';

	if (state.timeoutId) {
		clearTimeout(state.timeoutId);
		state.timeoutId = null;
	}
}

/**
 * 更新 Loading 文案
 */
export function updateLoadingText(text) {
	if (state.visible) {
		state.text = text;
	}
}

/**
 * 获取 Loading 状态 (响应式)
 */
export function useLoading() {
	return {
		visible: () => state.visible,
		text: () => state.text,
		state,
	};
}

// 快捷方法
export const loading = {
	show: showLoading,
	hide: hideLoading,
	forceHide: forceHideLoading,
	update: updateLoadingText,
	setTexts: setLoadingTexts,
	// 预设场景
	submit: (text) => showLoading(text || defaultTexts.submitting),
	save: (text) => showLoading(text || defaultTexts.saving),
	upload: (text) => showLoading(text || defaultTexts.uploading),
};

export default loading;
