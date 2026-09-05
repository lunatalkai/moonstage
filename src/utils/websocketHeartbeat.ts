/**
 * WebSocket 心跳管理工具
 * @description 提供智能心跳机制，避免连接超时断开
 * @version 1.1
 */

import { ref } from 'vue';

export interface HeartbeatConfig {
  interval?: number; // 心跳间隔，默认 10000ms (10秒)
  pingMessage?: any; // 自定义心跳消息，默认 {type: 'ping', timestamp: number}
}

export interface HeartbeatManager {
  start: (ws: WebSocket, config?: HeartbeatConfig) => void;
  stop: () => void;
  updateLastMessageTime: () => void;
  isActive: () => boolean;
}

/**
 * 创建 WebSocket 心跳管理器
 * @returns HeartbeatManager 实例
 */
export function createHeartbeatManager(): HeartbeatManager {
  const heartbeatTimer = ref<number | null>(null);
  const lastMessageTime = ref<number>(Date.now());
  const heartbeatInterval = ref<number>(10000); // 默认 10 秒

  /**
   * 启动心跳
   * @param ws WebSocket 实例
   * @param config 配置选项
   */
  const start = (ws: WebSocket, config?: HeartbeatConfig) => {
    // 停止已有心跳
    stop();

    // 更新配置
    if (config?.interval) {
      heartbeatInterval.value = config.interval;
    }

    // 启动定时器
    heartbeatTimer.value = window.setInterval(() => {
      // 检查连接状态
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('[WebSocket Heartbeat] 连接未开启，停止心跳');
        stop();
        return;
      }

      const timeSinceLastMessage = Date.now() - lastMessageTime.value;

      // 智能跳过：如果最近有消息交互，无需心跳
      if (timeSinceLastMessage < heartbeatInterval.value) {
        console.debug('[WebSocket Heartbeat] 最近有消息交互，跳过本次心跳');
        return;
      }

      // 发送心跳包
      try {
        const pingMessage = config?.pingMessage || {
          type: 'ping',
          timestamp: Date.now()
        };

        ws.send(JSON.stringify(pingMessage));
        console.debug('[WebSocket Heartbeat] 心跳发送成功', pingMessage);
      } catch (error) {
        console.error('[WebSocket Heartbeat] 心跳发送失败', error);
        stop();
      }
    }, heartbeatInterval.value);

    console.info('[WebSocket Heartbeat] 心跳已启动，间隔:', heartbeatInterval.value, 'ms');
  };

  /**
   * 停止心跳
   */
  const stop = () => {
    if (heartbeatTimer.value !== null) {
      window.clearInterval(heartbeatTimer.value);
      heartbeatTimer.value = null;
      console.info('[WebSocket Heartbeat] 心跳已停止');
    }
  };

  /**
   * 更新最后消息时间
   * @description 在收到任何 WebSocket 消息时调用，用于智能跳过心跳
   */
  const updateLastMessageTime = () => {
    lastMessageTime.value = Date.now();
  };

  /**
   * 检查心跳是否活跃
   * @returns boolean
   */
  const isActive = (): boolean => {
    return heartbeatTimer.value !== null;
  };

  return {
    start,
    stop,
    updateLastMessageTime,
    isActive
  };
}

/**
 * 使用示例：
 *
 * import { createHeartbeatManager } from '@/utils/websocketHeartbeat';
 *
 * // 创建管理器实例
 * const heartbeatManager = createHeartbeatManager();
 *
 * // WebSocket 连接打开时启动心跳
 * ws.onopen = () => {
 *   heartbeatManager.start(ws, {
 *     interval: 10000, // 10秒
 *     pingMessage: { type: 'ping', timestamp: Date.now() }
 *   });
 * };
 *
 * // 收到消息时更新时间
 * ws.onmessage = (event) => {
 *   heartbeatManager.updateLastMessageTime();
 *   // ... 处理消息
 * };
 *
 * // 连接关闭时停止心跳
 * ws.onclose = () => {
 *   heartbeatManager.stop();
 * };
 *
 * // 组件卸载时停止心跳
 * onUnmounted(() => {
 *   heartbeatManager.stop();
 * });
 */
