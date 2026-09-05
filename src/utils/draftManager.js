/**
 * 草稿数据管理工具 (uni-app 跨平台版本)
 * @module utils/draftManager
 * @description 基于 uni.storage API 实现的草稿管理工具
 */

const DRAFT_VERSION = '1.0';
// 保留默认 key 以兼容旧代码
const DEFAULT_DRAFT_KEY = 'role_draft';
const DRAFT_TIMESTAMP_KEY = 'role_draft_timestamp';

/**
 * 保存草稿数据
 * @param {string} key - 存储键名
 * @param {Object} data - 表单数据对象
 * @param {Object} options - 配置选项
 * @param {boolean} options.manual - 是否手动保存 (默认 false)
 * @returns {Object} { success: boolean, timestamp: string, error?: string }
 */
export function saveDraft(key, data, options = {}) {
  try {
    // 兼容旧版调用方式: saveDraft(data, options)
    if (typeof key === 'object' && key !== null) {
      options = data || {};
      data = key;
      key = DEFAULT_DRAFT_KEY;
    }

    if (!key || typeof key !== 'string') {
      console.error('[DraftManager] Invalid key:', key);
      return { success: false, error: 'Invalid key' };
    }

    if (!data || typeof data !== 'object') {
      console.error('[DraftManager] Invalid data:', data);
      return { success: false, error: 'Invalid data' };
    }

    // 添加元数据
    const draftData = {
      ...data,
      _draftMeta: {
        savedAt: new Date().toISOString(),
        version: DRAFT_VERSION,
        source: options.manual ? 'manual' : 'auto'
      }
    };

    // 序列化并保存
    const jsonStr = JSON.stringify(draftData);
    uni.setStorageSync(key, jsonStr);

    // 兼容旧版时间戳存储
    if (key === DEFAULT_DRAFT_KEY) {
      uni.setStorageSync(DRAFT_TIMESTAMP_KEY, draftData._draftMeta.savedAt);
    }

    console.log('[DraftManager] Draft saved:', {
      key,
      source: draftData._draftMeta.source,
      timestamp: draftData._draftMeta.savedAt,
      dataSize: jsonStr.length
    });

    return {
      success: true,
      timestamp: draftData._draftMeta.savedAt
    };
  } catch (error) {
    console.error('[DraftManager] Save draft failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 加载草稿数据
 * @param {string} [key] - 存储键名 (可选, 默认使用 DEFAULT_DRAFT_KEY)
 * @returns {Object|null} 草稿数据对象, 无数据时返回 null
 */
export function loadDraft(key) {
  try {
    // 兼容旧版调用方式: loadDraft()
    if (!key) {
      key = DEFAULT_DRAFT_KEY;
    }

    if (typeof key !== 'string') {
      console.error('[DraftManager] Invalid key:', key);
      return null;
    }

    const jsonStr = uni.getStorageSync(key);
    if (!jsonStr) {
      console.log('[DraftManager] No draft found for key:', key);
      return null;
    }

    const draftData = JSON.parse(jsonStr);

    // 验证数据版本
    if (!draftData._draftMeta || draftData._draftMeta.version !== DRAFT_VERSION) {
      console.warn('[DraftManager] Draft version mismatch, clearing...');
      clearDraft(key);
      return null;
    }

    console.log('[DraftManager] Draft loaded:', {
      key,
      source: draftData._draftMeta.source,
      timestamp: draftData._draftMeta.savedAt,
      dataSize: jsonStr.length
    });

    return draftData;
  } catch (error) {
    console.error('[DraftManager] Load draft failed:', error);
    // 数据损坏时清空
    clearDraft(key);
    return null;
  }
}

/**
 * 清空草稿数据
 * @param {string} [key] - 存储键名 (可选, 默认使用 DEFAULT_DRAFT_KEY)
 * @returns {boolean} 是否成功清空
 */
export function clearDraft(key) {
  try {
    // 兼容旧版调用方式: clearDraft()
    if (!key) {
      key = DEFAULT_DRAFT_KEY;
    }

    if (typeof key !== 'string') {
      console.error('[DraftManager] Invalid key:', key);
      return false;
    }

    uni.removeStorageSync(key);

    // 兼容旧版时间戳存储
    if (key === DEFAULT_DRAFT_KEY) {
      uni.removeStorageSync(DRAFT_TIMESTAMP_KEY);
    }

    console.log('[DraftManager] Draft cleared for key:', key);
    return true;
  } catch (error) {
    console.error('[DraftManager] Clear draft failed:', error);
    return false;
  }
}

/**
 * 检查是否存在草稿数据
 * @param {string} [key] - 存储键名 (可选, 默认使用 DEFAULT_DRAFT_KEY)
 * @returns {boolean} 是否存在草稿
 */
export function hasDraft(key) {
  try {
    // 兼容旧版调用方式: hasDraft()
    if (!key) {
      key = DEFAULT_DRAFT_KEY;
    }

    if (typeof key !== 'string') {
      return false;
    }

    const jsonStr = uni.getStorageSync(key);
    return !!jsonStr;
  } catch (error) {
    console.error('[DraftManager] Check draft failed:', error);
    return false;
  }
}

/**
 * 获取草稿保存时间戳
 * @returns {string|null} ISO 8601 格式时间戳,无数据时返回 null
 * @deprecated 新代码请使用 loadDraft(key)._draftMeta.savedAt
 */
export function getDraftTimestamp() {
  try {
    return uni.getStorageSync(DRAFT_TIMESTAMP_KEY) || null;
  } catch (error) {
    console.error('[DraftManager] Get timestamp failed:', error);
    return null;
  }
}

/**
 * 获取所有草稿列表 (可选功能)
 * @returns {Array} 草稿信息数组 [{key, savedAt, source}]
 */
export function getAllDrafts() {
  try {
    const info = uni.getStorageInfoSync();
    const draftKeys = info.keys.filter(k => k.includes('_draft'));

    return draftKeys.map(key => {
      try {
        const data = loadDraft(key);
        return {
          key,
          savedAt: data?._draftMeta?.savedAt,
          source: data?._draftMeta?.source
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    console.error('[DraftManager] Get all drafts failed:', error);
    return [];
  }
}

export default {
  saveDraft,
  loadDraft,
  clearDraft,
  hasDraft,
  getDraftTimestamp,
  getAllDrafts
};
