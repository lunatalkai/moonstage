import cryptoJs from "crypto-js"
import * as OpenCC from 'opencc-js'
import { isAmbiguousChar } from './ambiguous-chars'
import TradOrSimp from './TradOrSimp'

import {
	Base64
} from 'js-base64';


const fui = {
	toast: function(text) {
		text && uni.showToast({
			title: text,
			icon: 'none',
			duration: 2000
		})
	},
	modal: function(title, content, callback, showCancel, confirmColor, confirmText) {
		uni.showModal({
			title: title,
			content: content,
			showCancel: showCancel || false,
			// #ifndef MP-TOUTIAO
			cancelColor: "#7F7F7F",
			confirmColor: confirmColor || "#465CFF",
			// #endif
			confirmText: confirmText || "确定",
			success(res) {
				if (res.confirm) {
					callback && callback(true)
				} else {
					callback && callback(false)
				}
			},
			fail(err) {
				console.log(err)
			}
		})
	},
	href(url, isMain) {
		if (isMain) {
			uni.switchTab({
				url: url
			})
		} else {
			uni.navigateTo({
				url: url
			});
		}
	},
	//字符串省略
	strOmit(content, length) {
		if (!content) {
			return '';
		}
		if (content.length > length) {
			return content.slice(0, length) + "…";
		}
		return content;
	},
	jsonp: function(url, callback, callbackname) {
		// #ifdef H5
		window[callbackname] = callback;
		let script = document.createElement("script");
		script.src = url;
		script.type = "text/javascript";
		document.head.appendChild(script);
		document.head.removeChild(script);
		// #endif
	},

	// rpx转px
	rpxToPx: function(rpx) {
		const screenWidth = uni.getSystemInfoSync().screenWidth
		return (screenWidth * Number.parseInt(rpx)) / 750
	},

	// px转rpx
	pxToRpx: function(px) {
		const screenWidth = uni.getSystemInfoSync().screenWidth
		return (750 * Number.parseInt(px)) / screenWidth
	},
	sign: function(key, secret, expireTime) {
		// 生成10位unix时间戳
		const unixTime = Math.floor(new Date().getTime() / 1000);
		// 生成随机字符串
		const randomStr = Math.random().toString(36).substring(2, 10);
		// 构造签名内容
		const signContent = "ACS" + key + unixTime + randomStr + (unixTime + expireTime);
		// 使用 hmac-sha1 算法签名
		const hmac = cryptoJs.HmacSHA1(signContent, secret);
		const signature = cryptoJs.enc.Hex.stringify(hmac);
		// 拼接返回值
		const result = "004" + signature + unixTime + randomStr + (unixTime + expireTime);
		return result;
	},
	decrypt: function(encrypted, secretKey) {
		let key = cryptoJs.enc.Utf8.parse(secretKey)
		let iv = cryptoJs.enc.Utf8.parse("your16charIvKey1")
		let decrypt = cryptoJs.AES.decrypt(encrypted, key, {
			iv: iv,
			mode: cryptoJs.mode.CBC,
			padding: cryptoJs.pad.Pkcs7
		})
		return cryptoJs.enc.Utf8.stringify(decrypt).toString()
	},
	encrypt: function(plaintext, secretKey) {
		let key = cryptoJs.enc.Utf8.parse(secretKey)
		let iv = cryptoJs.enc.Utf8.parse("your16charIvKey1")
		let srcs = cryptoJs.enc.Utf8.parse(plaintext)
		let encrypted = cryptoJs.AES.encrypt(srcs, key, {
			iv: iv,
			mode: cryptoJs.mode.CBC,
			padding: cryptoJs.pad.Pkcs7
		})
		return encrypted.toString()
	},
	encodeBase64: function(value) {
		return Base64.encode(value);
	},
	generateRandomString: function(length) {
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const charactersLength = characters.length;
		let result = '';
		for (let i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	},
	formatTimestamp: function(timestamp) {
		const date = new Date(timestamp * 1000);
		const year = date.getFullYear();
		const month = ('0' + (date.getMonth() + 1)).slice(-2);
		const day = ('0' + date.getDate()).slice(-2);
		const hours = ('0' + date.getHours()).slice(-2);
		const minutes = ('0' + date.getMinutes()).slice(-2);
		const seconds = ('0' + date.getSeconds()).slice(-2);
		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	},
	formatDate: function(timestamp) {
		// issue mobile#4: invalid timestamp 防呆，避免 padStart 出 'NaN-aN-aN aN:aN:aN'。
		// explicit null/undefined/'' 檢查保留 0 為合法 Unix epoch。對齊 codebase 既有 5 處同類 guard 慣例 return ''。
		if (timestamp === null || timestamp === undefined || timestamp === '') return '';
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) return '';
		const year = date.getFullYear();
		const month = ('0' + (date.getMonth() + 1)).slice(-2);
		const day = ('0' + date.getDate()).slice(-2);
		const hours = ('0' + date.getHours()).slice(-2);
		const minutes = ('0' + date.getMinutes()).slice(-2);
		const seconds = ('0' + date.getSeconds()).slice(-2);
		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	},
	formatSimpleDate: function(timestamp) {
		if (timestamp === null || timestamp === undefined || timestamp === '') return '';
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) return '';
		const currentYear = new Date().getFullYear();
		const year = date.getFullYear() !== currentYear ? date.getFullYear() : '';
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const hours = ('0' + date.getHours()).slice(-2);
		const minutes = ('0' + date.getMinutes()).slice(-2);
		// 判断是否是今天
		const isToday = date.toDateString() === new Date().toDateString();
		// 格式化日期字符串
		let formattedDate = '';
		if (year) {
			formattedDate += `${year}-`;
		}
		if (!isToday) {
			formattedDate += `${month}-${day} `;
		}
		formattedDate += `${hours}:${minutes}`;
		return formattedDate;
	},
	randomArr: function(arr, len) {
		var arrNew = [];
		if (arr.len <= len) {
			return arr;
		}
		for (var i = 0; i < len; i++) {
			var _num = Math.floor(Math.random() * arr.length)
			var mm = arr[_num];
			arr.splice(_num, 1)
			arrNew.push(mm)
		}
		return arrNew;
	},
	//设置缓存和失效时间
	setCache(key, value, expire = 0) {
		let obj = {
			data: value, //存储的数据
			time: Date.now() / 1000, //记录存储的时间戳
			expire: expire //记录过期时间，单位秒
		}
		uni.setStorageSync(key, JSON.stringify(obj))
	},
	//概率事件 参数应该是一个介于 0 和 1 之间的小数
	getProbability(probability) {
		return Math.random() < probability;
	},
	//获取缓存
	getCache(key) {
		let val = uni.getStorageSync(key)
		if (!val) {
			return null
		}
		val = JSON.parse(val)
		if (val.expire && Date.now() / 1000 - val.time > val.expire) {
			uni.removeStorageSync(key)
			return null
		}
		return val.data
	},
	// 繁体转简体
	sify(text) {
		if (!text) return text;
		const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });
		return converter(text);
	},
	// 智能转繁体：自动检测输入是简体还是繁体
	// 使用 TradOrSimp 库检测，只有明确是简体才转换
	tify(text) {
		if (!text) return text;
		// 單字 + 一簡對多繁 → 保持原樣，不轉換
		if (text.length === 1 && isAmbiguousChar(text)) {
			return text;
		}
		// 只有明確是簡體才轉換，否則不轉換（包含繁體和簡繁通用如「小栗帽」）
		if (TradOrSimp.isSimplified(text)) {
			const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
			return converter(text);
		}
		return text;
	}
}
export default fui