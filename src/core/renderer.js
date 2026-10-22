import { bgCode, fgCode } from './palette.js';

// Turns a palette-indexed framebuffer into ANSI output. Each terminal cell shows
// two vertical pixels using '▀' (top = foreground, bottom = background), which
// gives roughly square pixels. Only cells that changed since the last frame are
// emitted.
export class Renderer {
  constructor(colorMode = 'truecolor') {
    this.setColorMode(colorMode);
    this.prev = null;
  }

  setColorMode(mode) {
    this.mode = mode;
    this.fg = Array.from({ length: 64 }, (_, i) => fgCode(i, mode));
    this.bg = Array.from({ length: 64 }, (_, i) => bgCode(i, mode));
    this.prev = null;
  }

  invalidate() {
    this.prev = null;
  }

  render(fb, ox = 0, oy = 0) {
    const { w, px } = fb;
    const rows = fb.h >> 1;
    if (!this.prev || this.prev.length !== w * rows) this.prev = new Int32Array(w * rows).fill(-1);
    const prev = this.prev;
    let out = '';
    let curFg = -1;
    let curBg = -1;
    let cx = -1;
    let cy = -1;
    for (let r = 0; r < rows; r++) {
      const top = r * 2 * w;
      const bot = top + w;
      for (let x = 0; x < w; x++) {
        const t = px[top + x] & 63;
        const b = px[bot + x] & 63;
        const key = (t << 8) | b;
        const i = r * w + x;
        if (prev[i] === key) continue;
        prev[i] = key;
        if (cy !== r || cx !== x) out += `\x1b[${oy + r + 1};${ox + x + 1}H`;
        if (t === b) {
          if (curBg !== t) {
            out += this.bg[t];
            curBg = t;
          }
          out += ' ';
        } else {
          if (curFg !== t) {
            out += this.fg[t];
            curFg = t;
          }
          if (curBg !== b) {
            out += this.bg[b];
            curBg = b;
          }
          out += '▀';
        }
        cx = x + 1;
        cy = r;
      }
    }
    if (out) out += '\x1b[0m';
    return out;
  }
}
