import { describe, it, expect } from 'vitest';
import {
  normalizeShareCodeInput,
  validateShareCodeInput,
  SHARE_CODE_TYPE_NOTEPAD,
} from './share-code';

describe('normalizeShareCodeInput', () => {
  // 用戶會從 Discord 抄或貼，大小寫、空白、連字號、整條連結都可能出現。
  it('accepts the shapes people actually paste', () => {
    const canonical = 'LT-NB-A7K29QRMT';
    for (const variant of [
      canonical,
      canonical.toLowerCase(),
      `  ${canonical}  `,
      'LTNBA7K29QRMT',
      'LT NB A7K29QRMT',
      'https://lunatalk.ai/s/NB-A7K29QRMT',
    ]) {
      expect(normalizeShareCodeInput(variant)).toBe(canonical);
    }
  });

  // Crockford 的用意就是讓抄寫錯誤自動還原，而不是報錯。
  it('folds confusable letters back to digits', () => {
    expect(normalizeShareCodeInput('LT-NB-O1234567B')).toContain('01234567');
    expect(normalizeShareCodeInput('LT-NB-0l234567B')).toContain('01234567');
  });

  it('returns empty for input that is not a code at all', () => {
    expect(normalizeShareCodeInput('')).toBe('');
    expect(normalizeShareCodeInput('隨便一段文字')).toBe('');
    expect(normalizeShareCodeInput('LT-NB-SHORT')).toBe('');
  });
});

describe('validateShareCodeInput', () => {
  // 打錯一個字當場就要知道，不必往返伺服器才回「碼不存在」（HIG：即時驗證）。
  it('separates a typo from a shape problem', () => {
    // A7K29QRM3 的校驗碼是刻意算過的；改一個資料字元就該被抓到
    const good = validateShareCodeInput('LT-NB-A7K29QRMT');
    const typo = validateShareCodeInput('LT-NB-B7K29QRMT');
    expect(typo.status).not.toBe(good.status);
    expect(typo.status).toBe('checksum');
    expect(validateShareCodeInput('LT-NB-XX').status).toBe('malformed');
    expect(validateShareCodeInput('').status).toBe('empty');
  });

  // 空輸入不該顯示錯誤——用戶還沒開始打字就先罵他是不禮貌的。
  it('stays silent before the user has typed anything', () => {
    expect(validateShareCodeInput('   ').status).toBe('empty');
    expect(validateShareCodeInput('   ').canonical).toBe('');
  });

  it('exposes the parsed type so the UI can route or explain', () => {
    const parsed = validateShareCodeInput('LT-NB-A7K29QRMT');
    if (parsed.status === 'ok') {
      expect(parsed.codeType).toBe(SHARE_CODE_TYPE_NOTEPAD);
    }
  });
});
