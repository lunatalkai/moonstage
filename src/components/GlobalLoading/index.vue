<template>
	<Teleport to="body">
		<Transition name="fade">
			<view v-if="visible" class="loading-overlay" @click.stop>
				<view class="loading-container">
					<!-- 动态光环 -->
					<view class="loading-rings">
						<view class="ring ring-1"></view>
						<view class="ring ring-2"></view>
						<view class="ring ring-3"></view>
					</view>

					<!-- 中心 Logo/图标 -->
					<view class="loading-center">
						<view class="pulse-dot"></view>
					</view>

					<!-- 加载文字 -->
					<view class="loading-text" v-if="text">
						<span>{{ text }}</span>
						<span class="loading-dots">
							<span class="dot">.</span>
							<span class="dot">.</span>
							<span class="dot">.</span>
						</span>
					</view>
				</view>
			</view>
		</Transition>
	</Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
	modelValue: {
		type: Boolean,
		default: false
	},
	text: {
		type: String,
		default: ''
	}
});

const emit = defineEmits(['update:modelValue']);

const visible = ref(props.modelValue);

watch(() => props.modelValue, (val) => {
	visible.value = val;
});

// 防止滚动穿透
watch(visible, (val) => {
	if (val) {
		document.body.style.overflow = 'hidden';
	} else {
		document.body.style.overflow = '';
	}
});

onUnmounted(() => {
	document.body.style.overflow = '';
});
</script>

<style scoped>
.loading-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.65);
	backdrop-filter: blur(8px);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 99999;
}

.loading-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 24px;
}

/* 光环动画 */
.loading-rings {
	position: relative;
	width: 80px;
	height: 80px;
}

.ring {
	position: absolute;
	border-radius: 50%;
	border: 2px solid transparent;
}

.ring-1 {
	width: 80px;
	height: 80px;
	top: 0;
	left: 0;
	border-top-color: #FED880;
	border-right-color: #FED880;
	animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}

.ring-2 {
	width: 60px;
	height: 60px;
	top: 10px;
	left: 10px;
	border-bottom-color: rgba(254, 216, 128, 0.7);
	border-left-color: rgba(254, 216, 128, 0.7);
	animation: spin 1.5s cubic-bezier(0.5, 0, 0.5, 1) infinite reverse;
}

.ring-3 {
	width: 40px;
	height: 40px;
	top: 20px;
	left: 20px;
	border-top-color: rgba(254, 216, 128, 0.4);
	animation: spin 2s linear infinite;
}

/* 中心脉冲点 */
.loading-center {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
}

.pulse-dot {
	width: 12px;
	height: 12px;
	background: linear-gradient(135deg, #FED880 0%, #f5c842 100%);
	border-radius: 50%;
	animation: pulse 1.5s ease-in-out infinite;
	box-shadow: 0 0 20px rgba(254, 216, 128, 0.6);
}

/* 加载文字 */
.loading-text {
	display: flex;
	align-items: center;
	font-size: 14px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.9);
	letter-spacing: 0.5px;
}

.loading-dots {
	display: inline-flex;
	margin-left: 2px;
}

.loading-dots .dot {
	animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dots .dot:nth-child(1) {
	animation-delay: -0.32s;
}

.loading-dots .dot:nth-child(2) {
	animation-delay: -0.16s;
}

.loading-dots .dot:nth-child(3) {
	animation-delay: 0s;
}

/* 动画定义 */
@keyframes spin {
	0% {
		transform: rotate(0deg);
	}
	100% {
		transform: rotate(360deg);
	}
}

@keyframes pulse {
	0%, 100% {
		transform: scale(1);
		opacity: 1;
	}
	50% {
		transform: scale(1.3);
		opacity: 0.7;
	}
}

@keyframes bounce {
	0%, 80%, 100% {
		transform: scale(0);
		opacity: 0.5;
	}
	40% {
		transform: scale(1);
		opacity: 1;
	}
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
	opacity: 1;
}
</style>
