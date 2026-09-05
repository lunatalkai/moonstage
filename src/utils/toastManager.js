/**
 * 全局 Toast 消息管理器
 * @module utils/toastManager
 * @description 提供统一的消息提示 API，支持成功、错误、警告、信息等类型
 */

import { message as antMessage } from 'ant-design-vue';

// 默认文案 (会被国际化覆盖)
let defaultTexts = {
	success: '操作成功',
	error: '操作失败',
	networkError: '网络错误，请检查网络连接',
	timeout: '请求超时，请重试',
	serverError: '服务器错误，请稍后重试',
	unauthorized: '登录已过期，请重新登录',
};

// 配置
const config = {
	duration: 3, // 默认显示时间 (秒)
	maxCount: 3, // 最大同时显示数量
};

// 初始化配置
antMessage.config({
	top: '80px',
	duration: config.duration,
	maxCount: config.maxCount,
});

/**
 * 设置默认文案 (用于国际化)
 */
export function setToastTexts(texts) {
	defaultTexts = { ...defaultTexts, ...texts };
}

/**
 * 成功提示
 */
export function success(content, duration = config.duration) {
	return antMessage.success({
		content: content || defaultTexts.success,
		duration,
		class: 'custom-toast custom-toast-success',
	});
}

/**
 * 错误提示
 */
export function error(content, duration = config.duration) {
	return antMessage.error({
		content: content || defaultTexts.error,
		duration,
		class: 'custom-toast custom-toast-error',
	});
}

/**
 * 警告提示
 */
export function warning(content, duration = config.duration) {
	return antMessage.warning({
		content: content || '',
		duration,
		class: 'custom-toast custom-toast-warning',
	});
}

/**
 * 信息提示
 */
export function info(content, duration = config.duration) {
	return antMessage.info({
		content: content || '',
		duration,
		class: 'custom-toast custom-toast-info',
	});
}

/**
 * 加载中提示 (需手动关闭)
 */
export function loading(content, duration = 0) {
	return antMessage.loading({
		content: content || defaultTexts.loading,
		duration,
		class: 'custom-toast custom-toast-loading',
	});
}

/**
 * 网络错误提示
 */
export function networkError(content) {
	return error(content || defaultTexts.networkError);
}

/**
 * 超时错误提示
 */
export function timeout(content) {
	return error(content || defaultTexts.timeout);
}

/**
 * 服务器错误提示
 */
export function serverError(content) {
	return error(content || defaultTexts.serverError);
}

/**
 * 未授权提示
 */
export function unauthorized(content) {
	return warning(content || defaultTexts.unauthorized);
}

/**
 * 根据 HTTP 状态码显示对应提示
 */
export function fromHttpStatus(statusCode, customMessage) {
	if (statusCode >= 200 && statusCode < 300) {
		return success(customMessage);
	}

	switch (statusCode) {
		case 400:
			return error(customMessage || '请求参数错误');
		case 401:
			return unauthorized(customMessage);
		case 403:
			return error(customMessage || '没有权限访问');
		case 404:
			return error(customMessage || '请求的资源不存在');
		case 408:
		case -9999: // 自定义超时码
			return timeout(customMessage);
		case 429:
			return warning(customMessage || '请求过于频繁，请稍后重试');
		case 500:
		case 502:
		case 503:
		case 504:
			return serverError(customMessage);
		case -1: // 网络错误
			return networkError(customMessage);
		default:
			return error(customMessage || `请求失败 (${statusCode})`);
	}
}

/**
 * 销毁所有消息
 */
export function destroyAll() {
	antMessage.destroy();
}

// 导出统一 API
export const toast = {
	success,
	error,
	warning,
	info,
	loading,
	networkError,
	timeout,
	serverError,
	unauthorized,
	fromHttpStatus,
	destroyAll,
	setTexts: setToastTexts,
};

export default toast;
