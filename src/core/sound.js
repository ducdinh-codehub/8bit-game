import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A tiny chiptune synth: square / triangle / noise channels rendered to 8-bit
// WAV files, played with whatever the OS provides. No native dependencies.

const SR = 22050;

const note = (f, ms, o = {}) => ({ wave: 'square', f0: f, f1: o.to ?? f, ms, vol: o.vol ?? 0.35, duty: o.duty ?? 0.5, ...o });
const noise = (ms, o = {}) => ({ wave: 'noise', f0: o.f ?? 4000, f1: o.to ?? o.f ?? 4000, ms, vol: o.vol ?? 0.3 });
const rest = (ms) => ({ wave: 'rest', ms });

export const SFX = {
  jump: [note(260, 140, { to: 900, duty: 0.25 })],
  coin: [note(988, 70, { duty: 0.5 }), note(1319, 260, { duty: 0.5 })],
  stomp: [note(500, 60, { to: 140 }), noise(50, { vol: 0.2 })],
  bump: [note(140, 60, { to: 90, duty: 0.5 })],
  break: [noise(160, { f: 3000, to: 600, vol: 0.4 })],
  powerup: [523, 659, 784, 1047, 784, 1047, 1319].map((f) => note(f, 55, { duty: 0.25 })),
  hurt: [note(600, 90, { to: 200 }), note(400, 120, { to: 120 })],
  die: [note(988, 90), note(740, 90), note(587, 90), rest(60), note(392, 300, { to: 196 })],
  flag: [note(1500, 700, { to: 260, duty: 0.25 })],
  win: [523, 659, 784, 1047, 784, 1047].map((f, i) => note(f, i === 5 ? 400 : 110, { duty: 0.25 })),
  eat: [note(600, 50, { to: 1200, duty: 0.25 })],
  bonus: [note(880, 60), note(1175, 60), note(1760, 120)],
  move: [note(220, 18, { vol: 0.15 })],
  rotate: [note(660, 30, { vol: 0.2, duty: 0.25 })],
  drop: [noise(60, { f: 1200, to: 300, vol: 0.3 })],
  line: [659, 784, 988].map((f) => note(f, 70, { duty: 0.25 })),
  tetris: [523, 659, 784, 1047, 1319, 1568].map((f) => note(f, 70, { duty: 0.25 })),
  levelup: [784, 988, 1175, 1568].map((f) => note(f, 80, { duty: 0.5 })),
  shoot: [noise(260, { f: 6000, to: 400, vol: 0.45 })],
  quack: [note(720, 80, { to: 520, duty: 0.5, vol: 0.3 }), rest(40), note(720, 80, { to: 520, duty: 0.5, vol: 0.3 })],
  fall: [note(1200, 500, { to: 200, duty: 0.25, vol: 0.25 })],
  laugh: [note(400, 80), note(300, 80), note(400, 80), note(300, 80)],
  gameover: [note(523, 150), note(392, 150), note(330, 150), note(262, 400, { to: 196 })],
  start: [784, 1047, 1319, 1568].map((f) => note(f, 70)),
  select: [note(880, 30, { duty: 0.25, vol: 0.2 })],
};

export function synth(parts) {
  const total = parts.reduce((n, p) => n + Math.round((p.ms / 1000) * SR), 0);
  const buf = new Uint8Array(total).fill(128);
  let i = 0;
  let lfsr = 1;
  for (const p of parts) {
    const n = Math.round((p.ms / 1000) * SR);
    let phase = 0;
    let nv = 1;
    for (let k = 0; k < n; k++, i++) {
      if (p.wave === 'rest') continue;
      const t = k / n;
      const f = p.f0 * Math.pow(p.f1 / p.f0, t);
      phase += f / SR;
      let v;
      if (p.wave === 'noise') {
        if (phase >= 1) {
          phase -= Math.floor(phase);
          const bit = (lfsr ^ (lfsr >> 1)) & 1;
          lfsr = (lfsr >> 1) | (bit << 14);
          nv = lfsr & 1 ? 1 : -1;
        }
        v = nv;
      } else if (p.wave === 'tri') {
        const ph = phase % 1;
        v = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
      } else {
        v = phase % 1 < p.duty ? 1 : -1;
      }
      const env = (1 - t * 0.7) * Math.min(1, k / 40) * Math.min(1, (n - k) / 40);
      buf[i] = Math.max(0, Math.min(255, Math.round(128 + v * p.vol * env * 127)));
    }
  }
  return buf;
}

export function wav(samples) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + samples.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(samples.length, 40);
  return Buffer.concat([h, Buffer.from(samples)]);
}

function players() {
  if (process.platform === 'darwin') return [(f) => ['afplay', ['-v', '0.6', f]]];
  if (process.platform === 'win32')
    return [(f) => ['powershell', ['-NoProfile', '-c', `(New-Object Media.SoundPlayer '${f}').PlaySync()`]]];
  return [(f) => ['aplay', ['-q', f]], (f) => ['paplay', [f]], (f) => ['play', ['-q', f]]];
}

export class Sound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.dir = path.join(os.tmpdir(), `8bit-arcade-sfx-${process.getuid?.() ?? 'u'}`);
    this.files = new Map();
    this.candidates = players();
    this.active = 0;
    this.last = new Map();
  }

  file(name) {
    if (this.files.has(name)) return this.files.get(name);
    const f = path.join(this.dir, `${name}.wav`);
    if (!fs.existsSync(f)) {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(f, wav(synth(SFX[name])));
    }
    this.files.set(name, f);
    return f;
  }

  play(name) {
    if (!this.enabled || !SFX[name] || !this.candidates.length) return;
    const now = Date.now();
    if (now - (this.last.get(name) || 0) < 45 || this.active >= 4) return;
    this.last.set(name, now);
    let f;
    try {
      f = this.file(name);
    } catch {
      this.enabled = false;
      return;
    }
    const [cmd, args] = this.candidates[0](f);
    this.active++;
    let done = false;
    const finish = () => {
      if (!done) (done = true), this.active--;
    };
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', () => {
      // Player missing: try the next one next time, give up when none are left.
      this.candidates.shift();
      finish();
    });
    child.on('close', finish);
    child.unref();
  }
}

export const silent = { play() {}, enabled: false };
