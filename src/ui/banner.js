import { NES, rgbFg } from '../core/palette.js';

// "ANSI Shadow" style block letters, 6 rows each.
const LETTERS = {
  8: [' █████╗ ', '██╔══██╗', '╚█████╔╝', '██╔══██╗', '╚█████╔╝', ' ╚════╝ '],
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
  T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  C: [' ██████╗', '██╔════╝', '██║     ', '██║     ', '╚██████╗', ' ╚═════╝'],
  D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  ' ': ['  ', '  ', '  ', '  ', '  ', '  '],
};

export function bannerLines(text = '8BIT ARCADE') {
  const rows = Array(6).fill('');
  for (const ch of text) LETTERS[ch].forEach((r, i) => (rows[i] += r));
  return rows;
}

// NES rainbow used for the gradient.
const RAINBOW = [0x16, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x21, 0x22, 0x23, 0x24, 0x25].map((i) => NES[i]);

function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function gradient(pos) {
  const n = RAINBOW.length;
  const p = ((pos % n) + n) % n;
  const i = Math.floor(p);
  return lerp(RAINBOW[i], RAINBOW[(i + 1) % n], p - i);
}

// Colourise banner rows; `phase` animates the gradient.
export function colorBanner(rows, mode, phase = 0) {
  return rows.map((row, y) => {
    let out = '';
    let last = '';
    [...row].forEach((ch, x) => {
      let code = '';
      if (ch === '█') {
        const [r, g, b] = gradient(x / 7 + y * 0.15 + phase);
        code = rgbFg(r, g, b, mode);
      } else if (ch !== ' ') {
        code = '\x1b[38;5;239m';
      }
      if (code && code !== last) {
        out += code;
        last = code;
      }
      out += ch;
    });
    return out + '\x1b[0m';
  });
}

export function smallBanner(mode, phase = 0) {
  const text = '▄▀▄ 8-BIT ARCADE ▄▀▄';
  return [...text].map((ch, i) => rgbFg(...gradient(i / 2 + phase), mode) + ch).join('') + '\x1b[0m';
}

export const BANNER_WIDTH = bannerLines()[0].length;
