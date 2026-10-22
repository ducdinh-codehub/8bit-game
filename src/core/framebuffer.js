import { FONTS, textWidth } from './font.js';
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

  // Filled circle (or ellipse when ry is given).
  disc(cx, cy, r, c, ry = r) {
    for (let y = -ry; y <= ry; y++)
      for (let x = -r; x <= r; x++) if ((x * x) / (r * r + r) + (y * y) / (ry * ry + ry) <= 1) this.set(cx + x, cy + y, c);
  }

  // Draw text. font: 'big' (5x7, default) | 'small' (3x5).
  // align: 'left' | 'center' | 'right' relative to x. shadow draws a drop
  // shadow one pixel down-right; outline draws a 1px border all round.
  text(str, x, y, c, { align = 'left', scale = 1, shadow, outline, font = 'big' } = {}) {
    str = String(str).toUpperCase();
    const f = FONTS[font];
    const w = textWidth(str, scale, font);
    const x0 = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? x - w + 1 : x;
    if (outline !== undefined)
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]])
        this.text(str, x0 + dx * scale, y + dy * scale, outline, { scale, font });
    if (shadow !== undefined) this.text(str, x0 + scale, y + scale, shadow, { scale, font });
    let cx = x0;
    for (const ch of str) {
      const g = f.glyphs[ch] || f.glyphs['?'];
      for (const [dx, dy] of g) this.rect(cx + dx * scale, y + dy * scale, scale, scale, c);
      cx += (f.w + 1) * scale;
    }
    return w;
  }

  // Shrink 2:1 into `out` (w/2 x h/2), for terminals too small for full size.
  // Each output pixel takes the most common colour of its 2x2 block, falling
  // back to the top-left pixel, which keeps thin outlines and text legible.
  downsample(out) {
    const { w, px } = this;
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        const i = y * 2 * w + x * 2;
        const a = px[i];
        const b = px[i + 1];
        const c = px[i + w];
        const d = px[i + w + 1];
        out.px[y * out.w + x] = a === b || a === c || a === d ? a : b === c || b === d ? b : c === d ? c : a;
      }
    return out;
  }

  copyFrom(other) {
    this.px.set(other.px);
  }
}
