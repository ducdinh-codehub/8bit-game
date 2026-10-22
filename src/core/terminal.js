import { parseInput } from './input.js';

const ESC = '\x1b';

// Owns the TTY: alternate screen, raw mode, cursor, keyboard protocol and mouse.
// Restores everything on exit, including crashes and signals.
export class Terminal {
  constructor(stdin = process.stdin, stdout = process.stdout) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.active = false;
    this.mouseOn = false;
    this.listeners = new Set();
    this.resizeListeners = new Set();
    this.onData = (buf) => {
      for (const ev of parseInput(buf.toString('utf8'))) {
        if (ev.type === 'key' && ev.ctrl && ev.name === 'c' && ev.event !== 'release') {
          this.exit();
          process.exit(130);
        }
        for (const l of this.listeners) l(ev);
      }
    };
    this.onResize = () => {
      for (const l of this.resizeListeners) l();
    };
    this.restore = () => this.exit();
  }

  get cols() {
    return this.stdout.columns || 80;
  }

  get rows() {
    return this.stdout.rows || 24;
  }

  get interactive() {
    return !!(this.stdin.isTTY && this.stdout.isTTY);
  }

  enter() {
    if (this.active) return;
    if (!this.interactive) throw new Error('8bit-arcade needs an interactive terminal (TTY).');
    this.active = true;
    this.stdin.setRawMode(true);
    this.stdin.resume();
    this.stdin.on('data', this.onData);
    this.stdout.on('resize', this.onResize);
    // Terminal window closed: writes fail with EIO, just leave.
    this.stdout.on('error', () => process.exit(0));
    // alt screen, hide cursor, disable line wrap, push kitty flags 1|2|8 (disambiguate, events, all keys)
    this.write(`${ESC}[?1049h${ESC}[?25l${ESC}[?7l${ESC}[>11u${ESC}[2J`);
    process.on('exit', this.restore);
    for (const sig of ['SIGTERM', 'SIGHUP']) process.on(sig, () => (this.exit(), process.exit(143)));
    process.on('uncaughtException', (err) => {
      this.exit();
      console.error(err);
      process.exit(1);
    });
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.setMouse(false);
    this.write(`${ESC}[<u${ESC}[0m${ESC}[?7h${ESC}[?25h${ESC}[?1049l`);
    this.stdin.off('data', this.onData);
    this.stdout.off('resize', this.onResize);
    try {
      this.stdin.setRawMode(false);
    } catch {}
    this.stdin.pause();
    process.off('exit', this.restore);
  }

  setMouse(on) {
    if (on === this.mouseOn) return;
    this.mouseOn = on;
    // 1003 = report all motion, 1006 = SGR encoding
    this.write(on ? `${ESC}[?1003h${ESC}[?1006h` : `${ESC}[?1003l${ESC}[?1006l`);
  }

  write(s) {
    if (s) this.stdout.write(s);
  }

  clear() {
    this.write(`${ESC}[0m${ESC}[2J${ESC}[H`);
  }

  onInput(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onResizeEvent(fn) {
    this.resizeListeners.add(fn);
    return () => this.resizeListeners.delete(fn);
  }

  // Resolves with the next key press (ignoring releases / mouse).
  nextKey() {
    return new Promise((resolve) => {
      const off = this.onInput((ev) => {
        if (ev.type !== 'key' || ev.event === 'release') return;
        off();
        resolve(ev);
      });
    });
  }
}

export const moveTo = (row, col) => `${ESC}[${row + 1};${col + 1}H`;
