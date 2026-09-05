// 分享碼的客戶端解析。與 server 的 router/share_code.go 是同一份語義，
// 存在的理由是 HIG 的「即時驗證，不要等提交才報錯」：使用者從 Discord 抄碼
// 抄錯一個字，應該在他打完的當下就知道，而不是送出後等伺服器回「碼不存在」
// ——後者會讓他去懷疑分享者給錯碼。
//
// 這裡只做格式與校驗，不判斷碼存不存在（那必須問伺服器）。

export const SHARE_CODE_PREFIX = 'LT';
export const SHARE_CODE_TYPE_NOTEPAD = 'NB';

const DATA_LEN = 8;
const PAYLOAD_LEN = DATA_LEN + 1;
// 不含 I L O U：I/L 與 1、O 與 0 會抄錯，U 排除是避免隨機組合拼出冒犯字眼。
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHECK_ALPHABET = `${ALPHABET}*~$=U`;

function crockfordValue(ch: string): number {
  if (ch === 'O' || ch === 'o') return 0;
  if (ch === 'I' || ch === 'i' || ch === 'L' || ch === 'l') return 1;
  const idx = ALPHABET.indexOf(ch.toUpperCase());
  return idx;
}

function checkSymbol(data: string): string {
  let sum = 0;
  for (const ch of data) {
    const value = crockfordValue(ch);
    if (value < 0) return '';
    sum = (sum * 32 + value) % 37;
  }
  return CHECK_ALPHABET[sum];
}

// normalizeShareCodeInput 把使用者實際會貼進來的樣子收成標準形；
// 認不出來就回空字串（交給 validate 去分類原因）。
export function normalizeShareCodeInput(input: string): string {
  let raw = String(input ?? '').trim();
  if (!raw) return '';
  // 分享連結與裸碼是同一件事的兩種樣子
  const linkAt = raw.lastIndexOf('/s/');
  if (linkAt >= 0) raw = `${SHARE_CODE_PREFIX}-${raw.slice(linkAt + 3)}`;

  const compact = raw.replace(/[-\s　]/g, '');
  if (compact.length !== SHARE_CODE_PREFIX.length + 2 + PAYLOAD_LEN) return '';
  if (compact.slice(0, 2).toUpperCase() !== SHARE_CODE_PREFIX) return '';

  const codeType = compact.slice(2, 4).toUpperCase();
  if (!/^[A-Z]{2}$/.test(codeType)) return '';

  const rawPayload = compact.slice(4);
  let data = '';
  for (let i = 0; i < DATA_LEN; i += 1) {
    const value = crockfordValue(rawPayload[i]);
    if (value < 0) return '';
    data += ALPHABET[value];
  }
  // 校驗位保留使用者輸入的字元，由 validate 決定它對不對
  return `${SHARE_CODE_PREFIX}-${codeType}-${data}${rawPayload[DATA_LEN].toUpperCase()}`;
}

export type ShareCodeValidation =
  | { status: 'empty'; canonical: '' }
  | { status: 'malformed'; canonical: '' }
  | { status: 'checksum'; canonical: '' }
  | { status: 'ok'; canonical: string; codeType: string };

// validateShareCodeInput 把「還沒打」「形狀不對」「抄錯一個字」分成三種結果。
// 三者對使用者的下一步不同：什麼都不說 / 確認拿到的是完整的碼 / 核對字元。
export function validateShareCodeInput(input: string): ShareCodeValidation {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return { status: 'empty', canonical: '' };

  const normalized = normalizeShareCodeInput(trimmed);
  if (!normalized) return { status: 'malformed', canonical: '' };

  const codeType = normalized.slice(3, 5);
  const payload = normalized.slice(6);
  const data = payload.slice(0, DATA_LEN);
  const given = payload[DATA_LEN];
  const expected = checkSymbol(data);
  if (!expected) return { status: 'malformed', canonical: '' };

  const givenValue = crockfordValue(given);
  const expectedValue = crockfordValue(expected);
  const matches = given === expected
    || (givenValue >= 0 && expectedValue >= 0 && givenValue === expectedValue);
  if (!matches) return { status: 'checksum', canonical: '' };

  return { status: 'ok', canonical: `${SHARE_CODE_PREFIX}-${codeType}-${data}${expected}`, codeType };
}
