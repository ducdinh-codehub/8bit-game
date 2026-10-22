import { GLYPHS, textWidth } from './font.js';
import { TRANSPARENT } from './palette.js';

// Build a sprite from rows of characters and a char -> palette index map.
// '.' and ' ' are transparent.
export function makeSprite(rows, colors) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const data = new Uint8Array(w * h).fill(TRANSPARENT);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '.' && ch !== ' ') {
        if (colors[ch] === undefined) throw new Error(`Sprite colour missing for '${ch}'`);
        data[y * w + x] = colors[ch];
      }
    });
  });
  return { w, h, data };
}

export class Framebuffer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
  }

  clear(c) {
    this.px.fill(c);
  }

  set(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return TRANSPARENT;
    return this.px[y * this.w + x];
  }

  rect(x, y, w, h, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) this.px.fill(c, yy * this.w + x0, yy * this.w + x1);
  }

  frame(x, y, w, h, c) {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  sprite(spr, x, y, flip = false) {
    x = Math.floor(x);
    y = Math.floor(y);
    for (let sy = 0; sy < spr.h; sy++) {
      const ty = y + sy;
      if (ty < 0 || ty >= this.h) continue;
      for (let sx = 0; sx < spr.w; sx++) {
        const c = spr.data[sy * spr.w + (flip ? spr.w - 1 - sx : sx)];
        if (c === TRANSPARENT) continue;
        const tx = x + sx;
        if (tx < 0 || tx >= this.w) continue;
        this.px[ty * this.w + tx] = c;
      }
    }
  }

  // Draw text with the 3x5 font. align: 'left' | 'center' | 'right' relative to x.
  text(str, x, y, c, { align = 'left', scale = 1, shadow } = {}) {
    str = String(str).toUpperCase();
    const w = textWidth(str, scale);
    let cx = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? x - w + 1 : x;
    if (shadow !== undefined) this.text(str, cx + scale, y + scale, shadow, { scale });
    for (const ch of str) {
      const g = GLYPHS[ch] || GLYPHS['?'];
      for (const [dx, dy] of g) this.rect(cx + dx * scale, y + dy * scale, scale, scale, c);
      cx += 4 * scale;
    }
    return w;
  }

  copyFrom(other) {
    this.px.set(other.px);
  }
}
