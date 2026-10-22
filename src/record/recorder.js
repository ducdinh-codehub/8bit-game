import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../core/config.js';
import { NES } from '../core/palette.js';
import { Renderer } from '../core/renderer.js';
import { writeCast } from './cast.js';
import { encodeGif } from './gif.js';

const CAPTURE_FPS = 15;
const MAX_MS = 10 * 60 * 1000;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Captures framebuffer snapshots while a game runs, then writes both an
// asciicast (.cast, replayable in a terminal) and an animated .gif.
export class Recorder {
  constructor({ gameId, title, w, h, colorMode, gifScale = 4 }) {
    Object.assign(this, { gameId, title, w, h, colorMode, gifScale });
    this.frames = [];
    this.start = performance.now();
    this.lastCapture = -Infinity;
  }

  get elapsed() {
    return performance.now() - this.start;
  }

  capture(fb) {
    const t = this.elapsed;
    if (t > MAX_MS || t - this.lastCapture < 1000 / CAPTURE_FPS) return;
    this.lastCapture = t;
    this.frames.push({ px: fb.px.slice(), t });
  }

  // Writes files and returns their paths. `meta` (e.g. score) goes into the cast header.
  save(meta = {}) {
    if (!this.frames.length) return null;
    const dir = paths.recordings;
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, `${this.gameId}-${stamp()}`);
    const castPath = `${base}.cast`;
    const gifPath = `${base}.gif`;

    const r = new Renderer(this.colorMode);
    const events = this.frames.map((f) => [f.t / 1000, r.render({ w: this.w, h: this.h, px: f.px })]);
    writeCast(
      castPath,
      {
        width: this.w,
        height: this.h / 2,
        timestamp: Math.floor(Date.now() / 1000),
        title: `${this.title}${meta.score ? ` — score ${meta.score}` : ''}`,
        env: { TERM: 'xterm-256color', SHELL: '8bit-arcade' },
        '8bit': { game: this.gameId, ...meta },
      },
      events,
    );
    fs.writeFileSync(gifPath, encodeGif(this.frames, this.w, this.h, NES, this.gifScale));
    return { castPath, gifPath, durationMs: this.frames.at(-1).t };
  }
}

export function listRecordings() {
  const dir = paths.recordings;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.cast'))
    .map((f) => {
      const castPath = path.join(dir, f);
      const gifPath = castPath.replace(/\.cast$/, '.gif');
      return { name: f.replace(/\.cast$/, ''), castPath, gifPath: fs.existsSync(gifPath) ? gifPath : null, mtime: fs.statSync(castPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}
