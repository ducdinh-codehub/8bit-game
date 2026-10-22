// Small helpers for the text-mode screens (menu, settings, lists).

export const A = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?<>]*[A-Za-z]/g;

// Emoji and most pictographs occupy two terminal cells.
const cellWidth = (ch) => (ch.codePointAt(0) >= 0x1f300 ? 2 : 1);

export const visibleLength = (s) => [...s.replace(ANSI_RE, '')].reduce((n, ch) => n + cellWidth(ch), 0);

export function pad(s, w) {
  const n = visibleLength(s);
  return n >= w ? s : s + ' '.repeat(w - n);
}

export function truncate(s, w) {
  const plain = s.replace(ANSI_RE, '');
  return [...plain].length > w ? [...plain].slice(0, Math.max(0, w - 1)).join('') + '…' : s;
}

// Paint a full screen of lines centred horizontally (block-aligned) and
// vertically, without clearing first (avoids flicker).
export function paint(term, lines, { blockWidth } = {}) {
  const w = blockWidth ?? Math.max(...lines.map(visibleLength));
  const left = Math.max(0, Math.floor((term.cols - w) / 2));
  const top = Math.max(0, Math.floor((term.rows - lines.length) / 2));
  let out = '\x1b[H';
  for (let r = 0; r < term.rows; r++) {
    const line = r >= top && r < top + lines.length ? lines[r - top] : '';
    out += `\x1b[${r + 1};1H\x1b[0m\x1b[2K${line ? ' '.repeat(left) + line : ''}\x1b[0m`;
  }
  term.write(out);
}

export function box(title, bodyLines, width) {
  const inner = width - 2;
  const t = title ? ` ${title} ` : '';
  const top = `${A.gray}╭─${A.reset}${A.bold}${t}${A.reset}${A.gray}${'─'.repeat(Math.max(0, inner - 1 - visibleLength(t)))}╮${A.reset}`;
  const mid = bodyLines.map((l) => `${A.gray}│${A.reset}${pad(l, inner)}${A.gray}│${A.reset}`);
  const bot = `${A.gray}╰${'─'.repeat(inner)}╯${A.reset}`;
  return [top, ...mid, bot];
}
