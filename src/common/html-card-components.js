/**
 * HTML Card Web Components
 * 用於 AI 生成的 HTML 卡片中的交互組件
 * 這些組件可以在 v-html 中正常工作
 */

// 輔助函數：讀取「同義顏色屬性」——color 與 txt-color 在不同組件文檔中
// 是同一個語意（文字/填色），但命名不統一。兩者都認，若同時設定，
// 以該組件文檔慣用的 nativeAttr 優先，另一個當別名 fallback。
function readHcColorAttr(element, nativeAttr) {
  const aliasAttr = nativeAttr === 'txt-color' ? 'color' : 'txt-color';
  return element.getAttribute(nativeAttr) || element.getAttribute(aliasAttr) || '';
}

// 輔助函數：獲取顏色（優先使用 color/txt-color 屬性，其次 CSS 變數 --hc-txt-c，最後用默認值）
function getHcColor(element, defaultColor = '#fff') {
  // 優先使用 color 屬性（同時相容 txt-color 別名）
  const attrColor = readHcColorAttr(element, 'color');
  if (attrColor) return attrColor;

  // 其次讀取 CSS 變數
  const cssColor = getComputedStyle(element).getPropertyValue('--hc-txt-c').trim();
  if (cssColor) return cssColor;

  // 最後使用默認值
  return defaultColor;
}

// ========== hc-btn 交互按鈕 ==========
// 用法：
//   <hc-btn send="要發送的內容">按鈕文字</hc-btn>
//   <hc-btn copy="要複製的內容">複製分享</hc-btn>
//   <hc-btn send="內容" bg="#e94560">帶背景色</hc-btn>
//   <hc-btn send="內容" bg="#e94560,#ff6b9d">漸變背景</hc-btn>
//   <hc-btn send="內容" w="auto">自適應寬度</hc-btn>
//   <hc-btn send="內容" w="50%">半寬</hc-btn>
//   <hc-btn send="內容" w="full">滿寬（等同 100%）</hc-btn>
function normalizeHcWidth(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'full') return '100%';
  return raw;
}

class HcBtn extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const bg = this.getAttribute('bg') || '#e94560';
    const w = normalizeHcWidth(this.getAttribute('w'));
    const center = this.hasAttribute('c');
    const txtColor = readHcColorAttr(this, 'txt-color') || '#fff';
    const background = bg.includes(',')
      ? `linear-gradient(135deg,${bg})`
      : bg;

    // 寬度處理：無w屬性=block 100%，有w屬性=inline-block 指定寬度
    // center屬性：block + margin auto 居中
    let hostDisplay, hostWidth, hostMargin;
    if (center && w) {
      hostDisplay = 'block';
      hostWidth = w;
      hostMargin = '6px auto';
    } else if (w) {
      hostDisplay = 'inline-block';
      hostWidth = w;
      hostMargin = '0';
    } else {
      hostDisplay = 'block';
      hostWidth = '100%';
      hostMargin = '6px 0';
    }

    this.style.display = hostDisplay;
    this.style.width = hostWidth;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: ${hostDisplay};
          width: ${hostWidth};
          margin: ${hostMargin};
          white-space: normal;
        }
        :host(:first-child) {
          margin-top: 0;
        }
        :host(:last-child) {
          margin-bottom: 0;
        }
        button {
          width: 100%;
          padding: 15px;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: bold;
          cursor: pointer;
          color: ${txtColor};
          background: ${background};
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        button:active {
          transform: scale(0.98);
          opacity: 0.9;
        }
      </style>
      <button><slot></slot></button>
    `;

    this.shadowRoot.querySelector('button').addEventListener('click', () => this.handleClick());
  }

  handleClick() {
    const sendText = this.getAttribute('send');
    const copyText = this.getAttribute('copy');

    if (sendText) {
      // 填入輸入框
      const textarea = document.querySelector('#lunatalk-input textarea.uni-textarea-textarea');
      if (textarea) {
        textarea.value = sendText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    if (copyText) {
      // 複製到剪貼板
      const btn = this.shadowRoot.querySelector('button');

      // 嘗試使用 Clipboard API，不支援則用 fallback
      const copyToClipboard = (text) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        }
        // Fallback: 使用 execCommand
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          return Promise.resolve();
        } catch (err) {
          return Promise.reject(err);
        } finally {
          document.body.removeChild(textarea);
        }
      };

      copyToClipboard(copyText).then(() => {
        btn.textContent = '✓ 已複製';
        setTimeout(() => {
          btn.innerHTML = '<slot></slot>';
        }, 1500);
      }).catch(err => {
        console.error('複製失敗:', err);
        btn.textContent = '✗ 複製失敗';
        setTimeout(() => {
          btn.innerHTML = '<slot></slot>';
        }, 1500);
      });
    }
  }
}

// ========== hc-bar 進度條 ==========
// 用法：
//   <hc-bar value="60">生命值</hc-bar>
//   <hc-bar value="60" max="100" color="#00ff00">經驗值</hc-bar>
//   <hc-bar value="33" color="#00d4ff" label="進度"></hc-bar>
class HcBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const value = parseFloat(this.getAttribute('value')) || 0;
    const max = parseFloat(this.getAttribute('max')) || 100;
    const color = readHcColorAttr(this, 'color') || '#00d4ff';
    const percent = Math.min(100, Math.max(0, (value / max) * 100));

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-top: 8px;
          white-space: normal;
        }
        .bar-container {
          height: 8px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.2);
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          border-radius: 4px;
          background: ${color};
          width: ${percent}%;
          transition: width 0.3s ease;
        }
      </style>
      <div class="bar-container">
        <div class="bar-fill"></div>
      </div>
    `;
  }
}

// ========== hc-stat 狀態行 ==========
// 用法：
//   <hc-stat label="好感度" value="85/100"></hc-stat>
//   <hc-stat label="HP" value="80/100" icon="❤️"></hc-stat>
//   <hc-stat label="👤 角色名" value="好感度 85" color="#ff6b9d"></hc-stat>
class HcStat extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const value = this.getAttribute('value') || '';
    const icon = this.getAttribute('icon') || '';
    const color = getHcColor(this);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 8px;
          white-space: normal;
        }
        :host(:last-child) {
          margin-bottom: 0;
        }
        .stat-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .icon {
          margin-right: 4px;
        }
        .label {
          color: ${color};
          opacity: 0.7;
          white-space: nowrap;
          flex-shrink: 0;
          margin-right: 12px;
        }
        .value {
          font-weight: bold;
          color: ${color};
          text-align: right;
          min-width: 0;
          word-break: break-word;
        }
      </style>
      <div class="stat-row">
        <span class="label">${icon ? `<span class="icon">${icon}</span>` : ''}${label}</span>
        <span class="value">${value}</span>
      </div>
    `;
  }
}

// ========== hc-tag 標籤/徽章 ==========
// 用法：
//   <hc-tag>默認標籤</hc-tag>
//   <hc-tag bg="#e94560">VIP</hc-tag>
//   <hc-tag bg="#00d4ff" color="#000">新手</hc-tag>
class HcTag extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const bg = this.getAttribute('bg') || 'rgba(255,255,255,0.2)';
    const txtColor = readHcColorAttr(this, 'txt-color') || '#fff';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
          white-space: normal;
          margin-right: 8px;
          margin-bottom: 8px;
        }
        .tag {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          background: ${bg};
          color: ${txtColor};
        }
      </style>
      <span class="tag"><slot></slot></span>
    `;
  }
}

// ========== hc-collapse 折疊面板 ==========
// 用法：
//   <hc-collapse title="📖 遊戲規則">這裡是隱藏的內容...</hc-collapse>
//   <hc-collapse title="查看詳情" open>默認展開的內容</hc-collapse>
class HcCollapse extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
  }

  connectedCallback() {
    const title = this.getAttribute('title') || '展開';
    this._open = this.hasAttribute('open');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 12px;
          white-space: normal;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 15px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          cursor: pointer;
          user-select: none;
        }
        .header:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .title {
          font-weight: bold;
          color: #fff;
        }
        .arrow {
          color: #fff;
          transition: transform 0.2s ease;
        }
        .arrow.open {
          transform: rotate(180deg);
        }
        .content {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s ease;
        }
        .content.open {
          grid-template-rows: 1fr;
        }
        .content-inner {
          overflow: hidden;
          padding: 0 15px;
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.6;
        }
        .content.open .content-inner {
          padding: 15px;
        }
        ::slotted(*) {
          margin-right: 8px;
          margin-bottom: 8px;
        }
        ::slotted(p:first-child),
        ::slotted(hc-p:first-child),
        ::slotted(h1:first-child),
        ::slotted(h2:first-child),
        ::slotted(h3:first-child) {
          margin-top: 0;
        }
        ::slotted(p:last-child),
        ::slotted(hc-p:last-child),
        ::slotted(h1:last-child),
        ::slotted(h2:last-child),
        ::slotted(h3:last-child) {
          margin-bottom: 0;
        }
      </style>
      <div class="header">
        <span class="title">${title}</span>
        <span class="arrow ${this._open ? 'open' : ''}">▼</span>
      </div>
      <div class="content ${this._open ? 'open' : ''}">
        <div class="content-inner"><slot></slot></div>
      </div>
    `;

    this.shadowRoot.querySelector('.header').addEventListener('click', () => this.toggle());
  }

  toggle() {
    this._open = !this._open;
    this.shadowRoot.querySelector('.arrow').classList.toggle('open', this._open);
    this.shadowRoot.querySelector('.content').classList.toggle('open', this._open);
  }
}

// ========== hc-radio 單選組 ==========
// 用法：
//   <hc-radio label="性別" name="gender" options="男,女,其他"></hc-radio>
class HcRadio extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._value = '';
  }

  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const options = (this.getAttribute('options') || '').split(',').filter(o => o.trim());
    const color = getHcColor(this);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 12px;
          white-space: normal;
        }
        .label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: ${color};
        }
        .options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .option {
          padding: 8px 16px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.1);
          color: ${color};
          opacity: 0.8;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }
        .option:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .option.selected {
          background: #e94560;
          color: #fff;
          opacity: 1;
        }
      </style>
      ${label ? `<span class="label">${label}</span>` : ''}
      <div class="options">
        ${options.map(opt => `<span class="option" data-value="${opt.trim()}">${opt.trim()}</span>`).join('')}
      </div>
    `;

    this.shadowRoot.querySelectorAll('.option').forEach(el => {
      el.addEventListener('click', () => this.select(el));
    });
  }

  select(el) {
    this.shadowRoot.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    this._value = el.dataset.value;
  }

  getValue() {
    return this._value;
  }

  getLabel() {
    return this.getAttribute('label') || this.getAttribute('name') || '';
  }
}

// ========== hc-checkbox 多選組 ==========
// 用法：
//   <hc-checkbox label="攜帶道具" name="items" options="手機,手電筒,鑰匙"></hc-checkbox>
class HcCheckbox extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._values = new Set();
  }

  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const options = (this.getAttribute('options') || '').split(',').filter(o => o.trim());
    const color = getHcColor(this);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 12px;
          white-space: normal;
        }
        .label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: ${color};
        }
        .options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .option {
          padding: 8px 16px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.1);
          color: ${color};
          opacity: 0.8;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }
        .option:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .option.selected {
          background: #00d4ff;
          color: #000;
          opacity: 1;
        }
      </style>
      ${label ? `<span class="label">${label}</span>` : ''}
      <div class="options">
        ${options.map(opt => `<span class="option" data-value="${opt.trim()}">${opt.trim()}</span>`).join('')}
      </div>
    `;

    this.shadowRoot.querySelectorAll('.option').forEach(el => {
      el.addEventListener('click', () => this.toggle(el));
    });
  }

  toggle(el) {
    const value = el.dataset.value;
    if (this._values.has(value)) {
      this._values.delete(value);
      el.classList.remove('selected');
    } else {
      this._values.add(value);
      el.classList.add('selected');
    }
  }

  getValue() {
    return Array.from(this._values);
  }

  getLabel() {
    return this.getAttribute('label') || this.getAttribute('name') || '';
  }
}

// ========== hc-input 文字輸入 ==========
// 用法：
//   <hc-input label="備註" name="note" placeholder="輸入其他想說的..."></hc-input>
class HcInput extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const placeholder = this.getAttribute('placeholder') || '';
    const color = getHcColor(this);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 12px;
          white-space: normal;
        }
        .label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: ${color};
        }
        input {
          width: 100%;
          padding: 12px 15px;
          border: none;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: ${color};
          font-size: 14px;
          box-sizing: border-box;
          outline: none;
        }
        input::placeholder {
          color: ${color};
          opacity: 0.4;
        }
        input:focus {
          background: rgba(255, 255, 255, 0.15);
        }
      </style>
      ${label ? `<span class="label">${label}</span>` : ''}
      <input type="text" placeholder="${placeholder}">
    `;
  }

  getValue() {
    const input = this.shadowRoot.querySelector('input');
    return input ? input.value.trim() : '';
  }

  getLabel() {
    return this.getAttribute('label') || this.getAttribute('name') || '';
  }
}

// ========== hc-form 表單容器 ==========
// 用法：
//   <hc-form title="📋 角色創建" btn="開始冒險" color="#000">
//     <hc-input label="角色名" name="name"></hc-input>
//     <hc-radio label="職業" name="job" options="戰士,法師,盜賊"></hc-radio>
//     <hc-checkbox label="技能" name="skills" options="攻擊,防禦,治療"></hc-checkbox>
//   </hc-form>
class HcForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const title = this.getAttribute('title') || '';
    const btnText = this.getAttribute('btn') || '確認';
    const bg = this.getAttribute('bg') || '#e94560';
    const color = getHcColor(this);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 15px;
          white-space: normal;
        }
        .form-container {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 15px;
        }
        .title {
          display: block;
          margin-bottom: 15px;
          font-size: 16px;
          font-weight: bold;
          color: ${color};
        }
        .form-content {
          margin-bottom: 15px;
        }
        .submit-btn {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          background: ${bg};
          color: ${color};
          font-size: 15px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        .submit-btn:active {
          transform: scale(0.98);
          opacity: 0.9;
        }
        .submit-btn.success {
          background: #28a745;
        }
      </style>
      <div class="form-container">
        ${title ? `<span class="title">${title}</span>` : ''}
        <div class="form-content">
          <slot></slot>
        </div>
        <button class="submit-btn">${btnText}</button>
      </div>
    `;

    // 將 color 傳遞給子組件（子組件已設 color 或 txt-color 任一者都視為已指定，不覆蓋）
    if (color !== '#fff') {
      const formElements = this.querySelectorAll('hc-radio, hc-checkbox, hc-input');
      formElements.forEach(el => {
        if (!el.hasAttribute('color') && !el.hasAttribute('txt-color')) {
          el.setAttribute('color', color);
        }
      });
    }

    this.shadowRoot.querySelector('.submit-btn').addEventListener('click', () => this.submit());
  }

  submit() {
    const results = [];

    // 收集所有表單元素的值
    const formElements = this.querySelectorAll('hc-radio, hc-checkbox, hc-input');
    formElements.forEach(el => {
      const label = el.getLabel();
      const value = el.getValue();

      if (label && value && (Array.isArray(value) ? value.length > 0 : value)) {
        if (Array.isArray(value)) {
          results.push(`${label}：${value.join('、')}`);
        } else {
          results.push(`${label}：${value}`);
        }
      }
    });

    if (results.length === 0) {
      return;
    }

    const output = results.join('\n');

    // 填入輸入框
    const textarea = document.querySelector('#lunatalk-input textarea.uni-textarea-textarea');
    if (textarea) {
      textarea.value = output;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // 顯示成功狀態
      const btn = this.shadowRoot.querySelector('.submit-btn');
      const originalText = btn.textContent;
      btn.textContent = '✓ 已填入';
      btn.classList.add('success');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('success');
      }, 1500);
    }
  }
}

// ========== hc-meter 儀表/量表 ==========
// 用法：
//   <hc-meter label="好感度" value="75" max="100" color="#ff69b4"></hc-meter>
//   <hc-meter label="HP" value="20" max="100" data-level="danger"></hc-meter>
class HcMeter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const label = this.getAttribute('label') || '';
    const value = parseFloat(this.getAttribute('value')) || 0;
    const max = parseFloat(this.getAttribute('max')) || 100;
    const level = this.getAttribute('data-level') || '';
    const percent = Math.min(100, Math.max(0, (value / max) * 100));

    // 根據 data-level 自動決定顏色
    let fillColor = this.getAttribute('color') || '';
    if (!fillColor) {
      if (level === 'danger') fillColor = '#e74c3c';
      else if (level === 'warning') fillColor = '#f39c12';
      else fillColor = 'var(--hc-bar-fill, #00d4ff)';
    }

    const barHeight = 'var(--hc-bar-height, 24px)';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 8px;
          white-space: normal;
        }
        .meter-container {
          position: relative;
          height: ${barHeight};
          border-radius: 12px;
          background: var(--hc-bar-bg, rgba(255, 255, 255, 0.2));
          overflow: hidden;
        }
        .meter-fill {
          height: 100%;
          border-radius: 12px;
          background: ${fillColor};
          width: ${percent}%;
          transition: width 0.3s ease;
        }
        .meter-label {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        }
      </style>
      <div class="meter-container">
        <div class="meter-fill"></div>
        <div class="meter-label">${label} ${value}/${max}</div>
      </div>
    `;
  }
}

// ========== hc-tabs + hc-tab 標籤頁切換 ==========
// 用法：
//   <hc-tabs>
//     <hc-tab title="屬性">屬性內容</hc-tab>
//     <hc-tab title="背包">背包內容</hc-tab>
//   </hc-tabs>
class HcTabs extends HTMLElement {
  constructor() {
    super();
    this._activeIndex = 0;
  }

  connectedCallback() {
    // 注入全域樣式（僅注入一次）
    if (!document.getElementById('hc-tabs-style')) {
      const style = document.createElement('style');
      style.id = 'hc-tabs-style';
      style.textContent = `
        hc-tabs {
          display: block;
          margin-bottom: 12px;
          white-space: normal;
        }
        .hc-tabs-header {
          display: flex;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 8px;
        }
        .hc-tabs-btn {
          flex: 1;
          padding: 8px 12px;
          border: none;
          background: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .hc-tabs-btn:hover {
          color: rgba(255, 255, 255, 0.8);
        }
        .hc-tabs-btn.active {
          color: var(--hc-primary, #e94560);
          border-bottom-color: var(--hc-primary, #e94560);
        }
      `;
      document.head.appendChild(style);
    }

    // 建立標籤按鈕行
    const header = document.createElement('div');
    header.className = 'hc-tabs-header';

    const tabs = this.querySelectorAll(':scope > hc-tab');
    tabs.forEach((tab, index) => {
      const btn = document.createElement('button');
      btn.className = 'hc-tabs-btn' + (index === 0 ? ' active' : '');
      btn.textContent = tab.getAttribute('title') || `Tab ${index + 1}`;
      btn.addEventListener('click', () => this.switchTab(index));
      header.appendChild(btn);
    });

    this.insertBefore(header, this.querySelector(':scope > hc-tab'));

    // 預設顯示第一個 tab
    this.switchTab(0);
  }

  switchTab(index) {
    this._activeIndex = index;
    const tabs = this.querySelectorAll(':scope > hc-tab');
    const header = this.querySelector(':scope > .hc-tabs-header');
    const btns = header ? header.querySelectorAll('.hc-tabs-btn') : [];

    tabs.forEach((tab, i) => {
      tab.style.display = i === index ? 'block' : 'none';
    });
    btns.forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
  }
}

class HcTab extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    if (!this.style.display) {
      this.style.display = 'none';
    }
  }
}

// ========== hc-list + hc-item 列表 ==========
// 用法：
//   <hc-list>
//     <hc-item icon="⚔️">鐵劍</hc-item>
//     <hc-item icon="🧪">治療藥水 x3</hc-item>
//   </hc-list>
class HcList extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    // 注入全域樣式（僅注入一次）
    if (!document.getElementById('hc-list-style')) {
      const style = document.createElement('style');
      style.id = 'hc-list-style';
      style.textContent = `
        hc-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 8px;
          white-space: normal;
        }
      `;
      document.head.appendChild(style);
    }
  }
}

class HcItem extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const icon = this.getAttribute('icon') || '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          white-space: normal;
        }
        .item-row {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
        .icon {
          width: 24px;
          flex-shrink: 0;
          text-align: center;
          margin-right: 8px;
          font-size: 16px;
        }
        .content {
          flex: 1;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
        }
      </style>
      <div class="item-row">
        ${icon ? `<span class="icon">${icon}</span>` : ''}
        <span class="content"><slot></slot></span>
      </div>
    `;
  }
}

// ========== hc-alert 提示框 ==========
// 用法：
//   <hc-alert type="warning">小心前方有陷阱！</hc-alert>
//   <hc-alert type="danger">你的生命值過低！</hc-alert>
//   <hc-alert type="success">任務完成！</hc-alert>
//   <hc-alert>提示訊息</hc-alert>
class HcAlert extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const type = this.getAttribute('type') || 'info';

    const typeConfig = {
      info: {
        icon: '\u2139\uFE0F',
        bg: 'rgba(108, 92, 231, 0.15)',
        border: 'var(--hc-primary, #6c5ce7)'
      },
      warning: {
        icon: '\u26A0\uFE0F',
        bg: 'rgba(243, 156, 18, 0.15)',
        border: 'var(--hc-warning, #f39c12)'
      },
      danger: {
        icon: '\u274C',
        bg: 'rgba(231, 76, 60, 0.15)',
        border: 'var(--hc-danger, #e74c3c)'
      },
      success: {
        icon: '\u2705',
        bg: 'rgba(46, 204, 113, 0.15)',
        border: 'var(--hc-success, #2ecc71)'
      }
    };

    const config = typeConfig[type] || typeConfig.info;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-bottom: 8px;
          white-space: normal;
        }
        .alert {
          display: flex;
          align-items: flex-start;
          padding: 10px 14px;
          background: ${config.bg};
          border-left: 3px solid ${config.border};
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          line-height: 1.5;
        }
        .alert-icon {
          flex-shrink: 0;
          margin-right: 8px;
          font-size: 16px;
        }
        .alert-content {
          flex: 1;
        }
      </style>
      <div class="alert">
        <span class="alert-icon">${config.icon}</span>
        <span class="alert-content"><slot></slot></span>
      </div>
    `;
  }
}

// ========== 註冊所有組件 ==========
if (typeof window !== 'undefined' && window.customElements) {
  // 檢查是否已註冊，避免重複註冊報錯
  if (!customElements.get('hc-btn')) {
    customElements.define('hc-btn', HcBtn);
  }
  if (!customElements.get('hc-bar')) {
    customElements.define('hc-bar', HcBar);
  }
  if (!customElements.get('hc-stat')) {
    customElements.define('hc-stat', HcStat);
  }
  if (!customElements.get('hc-tag')) {
    customElements.define('hc-tag', HcTag);
  }
  if (!customElements.get('hc-collapse')) {
    customElements.define('hc-collapse', HcCollapse);
  }
  if (!customElements.get('hc-radio')) {
    customElements.define('hc-radio', HcRadio);
  }
  if (!customElements.get('hc-checkbox')) {
    customElements.define('hc-checkbox', HcCheckbox);
  }
  if (!customElements.get('hc-input')) {
    customElements.define('hc-input', HcInput);
  }
  if (!customElements.get('hc-form')) {
    customElements.define('hc-form', HcForm);
  }
  if (!customElements.get('hc-meter')) {
    customElements.define('hc-meter', HcMeter);
  }
  if (!customElements.get('hc-tabs')) {
    customElements.define('hc-tabs', HcTabs);
  }
  if (!customElements.get('hc-tab')) {
    customElements.define('hc-tab', HcTab);
  }
  if (!customElements.get('hc-list')) {
    customElements.define('hc-list', HcList);
  }
  if (!customElements.get('hc-item')) {
    customElements.define('hc-item', HcItem);
  }
  if (!customElements.get('hc-alert')) {
    customElements.define('hc-alert', HcAlert);
  }
}

export {
  HcBtn,
  HcBar,
  HcStat,
  HcTag,
  HcCollapse,
  HcRadio,
  HcCheckbox,
  HcInput,
  HcForm,
  HcMeter,
  HcTabs,
  HcTab,
  HcList,
  HcItem,
  HcAlert,
  readHcColorAttr,
  getHcColor
};
