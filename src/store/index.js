import createPersistedState from 'vuex-persistedstate'

// 登出時要一併清掉的本地儲存 key —— 全部是「登入使用者會話」層級的資料。
// 共用裝置上換帳號時不清會造成 A 的資料殘留給 B。全域偏好設定不在此列。
export const LOGOUT_CLEARED_STORAGE_KEYS = [
	'lt.openchat.oauth.tokens',
	'lt.openchat.oauth.flow',
	'roleData'
]
			import {
				createStore
			} from 'vuex'
			const store = createStore({
				plugins: [
					// 可以有多个持久化实例  
					createPersistedState({
						key: 'app_data', // 状态保存到本地的 key   
						paths: ['hasLogin', 'userInfo',
							'loginProvider','currentRoleId','currentRole'
						], // 要持久化的状态，在state里面取，如果有嵌套，可以  a.b.c   
						storage: { // 存储方式定义  
							getItem: (key) => uni.getStorageSync(key), // 获取  
							setItem: (key, value) => uni.setStorageSync(key, value), // 存储  
							removeItem: (key) => uni.removeStorageSync(key) // 删除  
						}
					})
				],
				state: {
					//是否登录
					hasLogin: false,
					//登陆宿主平台信息
					loginProvider: {},
					userInfo: {
						id: '0',
						nickName: '',
						avatar: '',
						CreateTime: '',
						isMember: false,
						memberCreateTime: '',
						memberExpireTime: '',
						isTryMember: false,
						tryMemberCreateTime: '',
						tryMemberExpireTime: '',
						LastUpdateTime: '',
						isForbid: false,
						forbidStartTime: '',
						forbidReason: '',
						forbidEndTime: '',
						enableNsfw: false,
						language: '',
						ageBig18: '',
						isAdmin:''
					},
					tempParam: null,
					refer: "",
					currentRoleId:'',//当前角色ID
					currentRole:null,//当前角色
					// 自动压缩相关状态（用于UI显示压缩进度）
					isCompacting: false, // 是否正在压缩
					compactStatus: '', // 压缩状态: 'compacting' | 'success' | 'failed' | ''
				},
				mutations: {
					// 是否已經有可用的身分（OAuth access token）
					setSignedIn(state, signedIn) {
						state.hasLogin = !!signedIn
					},
					//退出登录
					logout(state) {
						state.hasLogin = false
						// 清掉所有登入使用者會話相關的本地快取,避免共用裝置跨帳號殘留
						// (A 登出後 B 登入不該看到 A 的身分 token / 寫卡草稿)
						LOGOUT_CLEARED_STORAGE_KEYS.forEach((key) => {
							uni.removeStorageSync(key)
						})
					},
					setUserInfo(state, userInfo) {
						state.userInfo = userInfo
					},
					setProvider(state, provider) {
						state.loginProvider = provider;
					},
					setRefer(state, refer) {
						state.refer = refer;
					},
					setTempParam(state, param) {
						state.tempParam = param;
					},
					clearTempParam(state) {
						state.tempParam = null;
					},
					setCurrentRoleId(state, roleId) {
						state.currentRoleId = roleId;
					},
					setCurrentRole(state, role){
						state.currentRole = role;
					},
					// 自动压缩相关 mutations（用于UI显示压缩进度）
					setIsCompacting(state, isCompacting) {
						state.isCompacting = isCompacting;
					},
					setCompactStatus(state, status) {
						state.compactStatus = status;
					}
				},
				actions: {

				}
			})

			export default store
