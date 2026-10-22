// Minimal animated GIF89a encoder for palette-indexed frames (no dependencies).
// Frames are diffed against the previous one so only the changed rectangle is
// stored, and identical frames are merged by extending the previous delay.

function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map();
  const out = [];
  let cur = 0;
  let bits = 0;
  const emit = (code) => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = eoi + 1;
    } else {
      if (next >= 1 << codeSize) codeSize++;
      dict.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 0xff);
  return out;
}

function subBlocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];

// frames: [{ px: Uint8Array(w*h), t: ms }], palette: [[r,g,b] x 64]
export function encodeGif(frames, w, h, palette, scale = 4) {
  const W = w * scale;
  const H = h * scale;
  const bytes = [];
  const push = (arr) => {
    for (const b of arr) bytes.push(b);
  };
  push([...Buffer.from('GIF89a')]);
  push([...u16(W), ...u16(H), 0xf5, 0, 0]); // global colour table, 64 entries
  for (let i = 0; i < 64; i++) push(palette[i] || [0, 0, 0]);
  push([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0]); // loop forever

  // Build delta frames.
  const deltas = [];
  let prev = null;
  frames.forEach((f, idx) => {
    const end = frames[idx + 1]?.t ?? f.t + 1000;
    let x0 = 0;
    let y0 = 0;
    let x1 = w - 1;
    let y1 = h - 1;
    if (prev) {
      x0 = w;
      y0 = h;
      x1 = -1;
      y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (f.px[i] !== prev[i]) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) {
        deltas[deltas.length - 1].end = end;
        return;
      }
    }
    deltas.push({ px: f.px, x0, y0, x1, y1, start: f.t, end });
    prev = f.px;
  });

  const t0 = deltas[0]?.start ?? 0;
  let shown = 0; // centiseconds already emitted, avoids rounding drift
  for (const d of deltas) {
    const target = Math.round((d.end - t0) / 10);
    const delay = Math.max(2, target - shown);
    shown += delay;
    const rw = (d.x1 - d.x0 + 1) * scale;
    const rh = (d.y1 - d.y0 + 1) * scale;
    push([0x21, 0xf9, 0x04, 0x04, ...u16(delay), 0, 0]); // disposal: leave in place
    push([0x2c, ...u16(d.x0 * scale), ...u16(d.y0 * scale), ...u16(rw), ...u16(rh), 0]);
    const idx = new Uint8Array(rw * rh);
    let p = 0;
    for (let y = 0; y < rh; y++) {
      const row = (d.y0 + Math.floor(y / scale)) * w;
      for (let x = 0; x < rw; x++) idx[p++] = d.px[row + d.x0 + Math.floor(x / scale)] & 63;
    }
    bytes.push(6);
    push(subBlocks(lzw(idx, 6)));
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}
