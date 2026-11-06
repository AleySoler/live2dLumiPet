/**
 * 加速键（Electron accelerator）工具：格式化、解析、按键捕获
 *
 * 我们内部统一用英文 accelerator（'Alt+1', 'Shift+Delete', 'Ctrl+Alt+F5'），
 * 面板展示时再转成人类可读的 "Alt + 1"。
 */

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Super'];

const KEY_LABELS: Record<string, string> = {
  num0: 'Num0',
  num1: 'Num1',
  num2: 'Num2',
  num3: 'Num3',
  num4: 'Num4',
  num5: 'Num5',
  num6: 'Num6',
  num7: 'Num7',
  num8: 'Num8',
  num9: 'Num9',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Space: 'Space',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

export function acceleratorToParts(acc: string | null | undefined): string[] {
  if (!acc) return [];
  return acc.split('+').map((s) => s.trim()).filter(Boolean);
}

export function formatAccelerator(acc: string | null | undefined): string {
  if (!acc) return '未绑定';
  const parts = acceleratorToParts(acc);
  if (!parts.length) return '未绑定';
  const mods = parts.filter((p) => MODIFIER_ORDER.includes(p));
  const keys = parts.filter((p) => !MODIFIER_ORDER.includes(p));
  const orderedMods = MODIFIER_ORDER.filter((m) => mods.includes(m));
  const keysLabel = keys.map((k) => KEY_LABELS[k] ?? k);
  return [...orderedMods, ...keysLabel].join(' + ');
}

/** 判断是否只由修饰键组成 */
export function isModifierOnly(acc: string): boolean {
  const parts = acceleratorToParts(acc);
  return parts.length > 0 && parts.every((p) => MODIFIER_ORDER.includes(p));
}

/** 只依赖按键的最小结构，DOM KeyboardEvent 与测试桩都能传进来 */
export interface KeyLike {
  code?: string;
  key?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * 把按键事件转成 Electron accelerator。
 * 只按了修饰键时返回 null（等待真正的主键）。
 */
export function eventToAccelerator(e: KeyLike): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');

  const key = codeToAcceleratorKey(e);
  if (!key) return null;
  parts.push(key);
  return parts.join('+');
}

function codeToAcceleratorKey(e: KeyLike): string | null {
  const code = e.code || '';
  const key = e.key || '';

  // 修饰键本身不算主键
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(key)) return null;

  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return 'num' + code.slice(6);
  if (/^Numpad(Add|Subtract|Multiply|Divide|Decimal)$/.test(code)) {
    const map: Record<string, string> = {
      NumpadAdd: 'numadd',
      NumpadSubtract: 'numsub',
      NumpadMultiply: 'nummult',
      NumpadDivide: 'numdiv',
      NumpadDecimal: 'numdec',
    };
    return map[code] ?? null;
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

  const named: Record<string, string> = {
    Space: 'Space',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Escape: 'Escape',
    Enter: 'Enter',
    NumpadEnter: 'Enter',
    Tab: 'Tab',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  if (named[code]) return named[code];
  if (/^[A-Za-z0-9]$/.test(key)) return key.toUpperCase();
  return null;
}

/** 粗略校验 accelerator 是否可用（Electron 在 register 时会再校验一次） */
export function looksValidAccelerator(acc: string): boolean {
  if (!acc) return false;
  const parts = acceleratorToParts(acc);
  if (parts.length < 1) return false;
  const keys = parts.filter((p) => !MODIFIER_ORDER.includes(p));
  return keys.length === 1;
}
