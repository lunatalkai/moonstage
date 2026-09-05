/**
 * 消息渲染工具
 * @description 处理消息内容的渲染，包括 Markdown 和 Summary 特殊处理
 * @version 1.1
 */

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

/**
 * 渲染 Markdown 内容
 * @param content 消息内容
 * @returns 渲染后的 HTML
 */
export function renderMarkdown(content: string): string {
  return md.render(content);
}

/**
 * 渲染 Summary 消息
 * @description
 * - 移除 <analysis> 标签及其内容（LLM 的内部思考过程）
 * - 移除 <summary> 标签但保留内容
 * - 保留换行和列表格式
 * - 转换为适合显示的 HTML
 *
 * @param content Summary 消息内容
 * @returns 渲染后的 HTML
 */
export function renderSummary(content: string): string {
  // 移除 <analysis></analysis> 标签及其内容（LLM 的内部分析过程，不需要显示）
  let processed = content.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

  // 移除 <summary> 标签但保留内容
  processed = processed.replace(/<\/?summary>/gi, '');

  // 清理多余的空白行
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // 转换换行符为 <br>
  processed = processed.replace(/\n/g, '<br>');

  // 转换列表项（- 开头的行）为带样式的列表
  processed = processed.replace(/^- (.*?)(<br>|$)/gm, '<div style="margin-left: 20px; margin-top: 8px;">• $1</div>');

  // 转换数字列表（1. 2. 开头的行）
  processed = processed.replace(/^(\d+)\. (.*?)(<br>|$)/gm, '<div style="margin-left: 20px; margin-top: 8px;">$1. $2</div>');

  return processed;
}
