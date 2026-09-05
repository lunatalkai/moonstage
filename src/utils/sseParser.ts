/**
 * SSE 消息解析工具
 * @description 处理 Server-Sent Events (SSE) 消息流，支持分包处理
 * @version 1.1
 */

/**
 * SSE 事件数据结构
 */
export interface SSEEvent {
  event: string; // 事件名称，如 'answer', 'compacting', 'compactDone' 等
  data: any; // 事件数据，已解析为 JSON
  raw: string; // 原始数据字符串
  id?: number; // Phase 2a：事件 id，Last-Event-ID resume 用（v2 協定帶，v1 為 undefined）
}

/**
 * SSE 解析器类
 * @description 支持分包处理、缓冲区管理，正确解析跨包的 SSE 消息
 */
export class SSEParser {
  private buffer: string = ''; // 缓冲区，用于存储不完整的消息片段

  /**
   * 解析 SSE 消息
   * @param chunk 接收到的消息片段
   * @returns SSEEvent[] 解析出的事件数组
   */
  parse(chunk: string): SSEEvent[] {
    // 将新数据添加到缓冲区
    this.buffer += chunk;

    const events: SSEEvent[] = [];
    const lines = this.buffer.split('\n');

    // 保留最后一行（可能是不完整的）
    // 只有当最后一行以 \n 结尾时，才说明是完整的
    if (!this.buffer.endsWith('\n')) {
      this.buffer = lines.pop() || '';
    } else {
      this.buffer = '';
    }

    // 解析完整的行
    let i = 0;
    let pendingEventId: number | undefined = undefined;
    while (i < lines.length) {
      const line = lines[i].trim();

      // 空行：事件終結符，重置 pendingEventId
      if (!line) {
        pendingEventId = undefined;
        i++;
        continue;
      }

      // Phase 2a：解析 id: N 欄位（v2 協定）
      if (line.startsWith('id: ')) {
        const n = parseInt(line.slice(4).trim(), 10);
        if (!Number.isNaN(n)) {
          pendingEventId = n;
        }
        i++;
        continue;
      }

      // 解析事件行: event: eventName
      if (line.startsWith('event: ')) {
        const eventName = line.slice(7).trim();

        // 查找下一行的 data:
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();

          if (nextLine.startsWith('data: ')) {
            const dataContent = nextLine.slice(6).trim();

            // 尝试解析 JSON
            let parsedData: any = dataContent;
            try {
              if (dataContent && dataContent !== '[DONE]') {
                parsedData = JSON.parse(dataContent);
              }
            } catch (e) {
              console.warn(`[SSE Parser] 无法解析 JSON: ${dataContent}`, e);
            }

            events.push({
              event: eventName,
              data: parsedData,
              raw: dataContent,
              id: pendingEventId
            });
            pendingEventId = undefined;

            i += 2; // 跳过 event 和 data 两行
            continue;
          }
        }
      }

      // 如果只有 data: 行（无 event 行），也要处理
      if (line.startsWith('data: ')) {
        const dataContent = line.slice(6).trim();

        let parsedData: any = dataContent;
        try {
          if (dataContent && dataContent !== '[DONE]') {
            parsedData = JSON.parse(dataContent);
          }
        } catch (e) {
          console.warn(`[SSE Parser] 无法解析 JSON: ${dataContent}`, e);
        }

        events.push({
          event: 'message', // 默认事件类型
          data: parsedData,
          raw: dataContent,
          id: pendingEventId
        });
        pendingEventId = undefined;

        i++;
        continue;
      }

      i++;
    }

    return events;
  }

  /**
   * 重置解析器状态
   * @description 清空缓冲区，用于新的消息流
   */
  reset() {
    this.buffer = '';
  }

  /**
   * 获取当前缓冲区内容
   * @returns string 缓冲区内容
   */
  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * 创建 SSE 解析器实例（单例模式）
 * @returns SSEParser 实例
 */
export function createSSEParser(): SSEParser {
  return new SSEParser();
}

/**
 * 使用示例：
 *
 * import { createSSEParser } from '@/utils/sseParser';
 *
 * // 创建解析器
 * const parser = createSSEParser();
 *
 * // WebSocket 收到消息时
 * uni.onSocketMessage(res => {
 *   const events = parser.parse(res.data);
 *
 *   events.forEach(event => {
 *     switch (event.event) {
 *       case 'answer':
 *         // 处理回答事件
 *         const answerData = event.data;
 *         if (answerData?.choices?.[0]?.delta?.content) {
 *           replyContent.value += answerData.choices[0].delta.content;
 *         }
 *         break;
 *
 *       case 'compacting':
 *         // 处理压缩中事件
 *         store.commit('setIsCompacting', true);
 *         store.commit('setCompactStatus', 'compacting');
 *         break;
 *
 *       case 'compactDone':
 *         // 处理压缩完成事件
 *         store.commit('setCompactStatus', 'success');
 *         setTimeout(() => {
 *           store.commit('setIsCompacting', false);
 *           store.commit('setCompactStatus', '');
 *         }, 1500);
 *         break;
 *
 *       case 'compactFailed':
 *         // 处理压缩失败事件
 *         store.commit('setCompactStatus', 'failed');
 *         setTimeout(() => {
 *           store.commit('setIsCompacting', false);
 *           store.commit('setCompactStatus', '');
 *         }, 2000);
 *         break;
 *     }
 *   });
 * });
 *
 * // 连接关闭时重置解析器
 * uni.onSocketClose(() => {
 *   parser.reset();
 * });
 */
