/**
 * Cloudflare Image Resizing 图片转换工具
 * 文档: https://developers.cloudflare.com/images/image-resizing/url-format/
 */

/**
 * 转换为 Cloudflare Image Resizing URL
 * @param {string} url - 原始图片 URL
 * @param {object} options - 压缩参数
 * @param {number} options.width - 目标宽度
 * @param {number} options.height - 目标高度
 * @param {number} options.quality - 图片质量 (1-100)，默认 85
 * @param {string} options.fit - 裁剪模式: scale-down(默认), contain, cover, crop, pad
 * @param {string} options.format - 输出格式: auto(推荐), webp, avif, json
 * @param {number} options.dpr - 设备像素比，默认 1
 * @returns {string} Cloudflare Image Resizing URL
 *
 * @example
 * transformCloudflareImage('https://images.example.com/xxx.png', { width: 100, quality: 85 })
 * // => 'https://images.example.com/cdn-cgi/image/width=100,quality=85/xxx.png'
 */
export function transformCloudflareImage(url, options = {}) {
	if (!url || typeof url !== 'string') return ''

	// 移除旧的查询参数（imageView2 等）
	url = url.split('?')[0]

	// 检测 APNG 格式，跳过压缩（Cloudflare 不支持 APNG 压缩）
	// 注意：GIF 支持压缩，所以不跳过
	if (url.toLowerCase().endsWith('.apng')) {
		return url
	}

	// 如果没有任何参数，直接返回 URL
	if (Object.keys(options).length === 0) {
		return url
	}

	// 构建 Cloudflare 参数
	const params = []

	if (options.width) params.push(`width=${options.width}`)
	if (options.height) params.push(`height=${options.height}`)
	if (options.quality !== undefined) params.push(`quality=${options.quality}`)
	if (options.fit) params.push(`fit=${options.fit}`)
	if (options.format) params.push(`format=${options.format}`)
	if (options.dpr && options.dpr > 1) params.push(`dpr=${options.dpr}`)

	// 如果没有参数，直接返回 URL
	if (params.length === 0) return url

	const cfParams = params.join(',')

	try {
		// 解析 URL
		const urlObj = new URL(url)
		const pathname = urlObj.pathname

		// 返回 Cloudflare Image Resizing 格式
		return `${urlObj.origin}/cdn-cgi/image/${cfParams}${pathname}`
	} catch (e) {
		console.error('transformCloudflareImage error:', e)
		return url
	}
}

/**
 * 预设配置 - 移动端常用尺寸
 */
export const MOBILE_PRESETS = {
	// 小头像
	avatarSmall: { width: 80, quality: 85, format: 'auto' },
	// 中等头像
	avatarMedium: { width: 100, quality: 90, format: 'auto' },
	// 大头像
	avatarLarge: { width: 200, quality: 90, format: 'auto' },
	// 角色背景 - 小
	roleBackgroundSmall: { width: 200, height: 280, fit: 'cover', quality: 80, format: 'auto' },
	// 角色背景 - 中
	roleBackgroundMedium: { width: 400, height: 560, fit: 'cover', quality: 80, format: 'auto' },
	// 角色背景 - 大
	roleBackgroundLarge: { width: 600, height: 840, fit: 'cover', quality: 85, format: 'auto' },
	// 缩略图
	thumbnail: { width: 355, quality: 90, format: 'auto' },
	// 详情页大图
	detail: { width: 750, quality: 90, format: 'auto' }
}

/**
 * 预设配置 - 桌面端常用尺寸
 */
export const DESKTOP_PRESETS = {
	// 小头像
	avatarSmall: { width: 96, quality: 90, format: 'auto' },
	// 中等头像
	avatarMedium: { width: 160, quality: 90, format: 'auto' },
	// 大头像
	avatarLarge: { width: 240, quality: 95, format: 'auto' },
	// 角色背景 - 小
	roleBackgroundSmall: { width: 400, quality: 85, format: 'auto' },
	// 角色背景 - 中
	roleBackgroundMedium: { width: 800, quality: 90, format: 'auto' },
	// 角色背景 - 大
	roleBackgroundLarge: { width: 1200, quality: 90, format: 'auto' },
	// CG 预览
	cgPreview: { width: 900, quality: 90, format: 'auto' },
	// 缩略图
	thumbnail: { width: 400, quality: 90, format: 'auto' },
	// 详情页大图
	detail: { width: 1920, quality: 95, format: 'auto' }
}

/**
 * 快捷方法 - 移动端
 */
export function cfImageMobile(url, preset = 'avatarMedium') {
	return transformCloudflareImage(url, MOBILE_PRESETS[preset] || {})
}

/**
 * 快捷方法 - 桌面端
 */
export function cfImageDesktop(url, preset = 'avatarMedium') {
	return transformCloudflareImage(url, DESKTOP_PRESETS[preset] || {})
}

// 默认导出
export default {
	transformCloudflareImage,
	cfImageMobile,
	cfImageDesktop,
	MOBILE_PRESETS,
	DESKTOP_PRESETS
}
