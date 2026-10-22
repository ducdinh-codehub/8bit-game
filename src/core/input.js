// Parses raw terminal input into key and mouse events.
//
// Supports legacy escape sequences, the kitty keyboard protocol (which gives us
// real key-release events in kitty, Ghostty, WezTerm, Alacritty, foot, recent
// iTerm2) and SGR mouse reporting.

const KITTY_CODES = { 9: 'tab', 13: 'enter', 27: 'escape', 32: 'space', 127: 'backspace' };
const CSI_FINAL = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' };
const TILDE = { 2: 'insert', 3: 'delete', 5: 'pageup', 6: 'pagedown' };
const EVENT = { 1: 'press', 2: 'repeat', 3: 'release' };

function keyFromCode(code) {
  if (KITTY_CODES[code]) return KITTY_CODES[code];
  if (code >= 32 && code < 127) return String.fromCharCode(code).toLowerCase();
  return `code${code}`;
}

function mods(m) {
  const bits = Math.max(0, (m || 1) - 1);
  return { shift: !!(bits & 1), alt: !!(bits & 2), ctrl: !!(bits & 4) };
}

export function parseInput(str) {
  const events = [];
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch === '\x1b') {
      const next = str[i + 1];
      if (next === '[') {
        // CSI: params then final byte in 0x40-0x7e
        let j = i + 2;
        while (j < str.length && !(str.charCodeAt(j) >= 0x40 && str.charCodeAt(j) <= 0x7e)) j++;
        if (j >= str.length) break;
        const params = str.slice(i + 2, j);
        const final = str[j];
        i = j + 1;
        if (params.startsWith('<') && (final === 'M' || final === 'm')) {
          const [b, x, y] = params.slice(1).split(';').map(Number);
          const motion = !!(b & 32);
          const wheel = !!(b & 64);
          const button = b & 3;
          let action = final === 'm' ? 'up' : motion ? 'move' : 'down';
          if (wheel) action = button === 0 ? 'wheelup' : 'wheeldown';
          events.push({ type: 'mouse', x: x - 1, y: y - 1, button, action });
          continue;
        }
        if (params === '' && final === 'M' && i + 3 <= str.length) {
          // Legacy X10 mouse: ESC [ M then button, x, y each as a byte + 32.
          const b = str.charCodeAt(i) - 32;
          const x = str.charCodeAt(i + 1) - 32;
          const y = str.charCodeAt(i + 2) - 32;
          i += 3;
          const motion = !!(b & 32);
          const button = b & 3;
          let action = button === 3 ? 'up' : motion ? 'move' : 'down';
          if (b & 64) action = button === 0 ? 'wheelup' : 'wheeldown';
          events.push({ type: 'mouse', x: x - 1, y: y - 1, button: button === 3 ? 0 : button, action });
          continue;
        }
        if (params.startsWith('?')) continue; // query responses
        const fields = params.split(';');
        const [codeStr] = (fields[0] || '').split(':');
        const [modStr, evStr] = (fields[1] || '').split(':');
        const m = mods(Number(modStr) || 1);
        const event = EVENT[Number(evStr) || 1];
        if (final === 'u') {
          const code = Number(codeStr);
          const name = keyFromCode(code);
          const isChar = code >= 32 && code < 127;
          let text = isChar ? String.fromCharCode(code) : undefined;
          if (text && m.shift && /[a-z]/.test(text)) text = text.toUpperCase();
          events.push({ type: 'key', name, ch: m.ctrl ? undefined : text, ...m, event, kitty: true });
        } else if (CSI_FINAL[final]) {
          events.push({ type: 'key', name: CSI_FINAL[final], ...m, event, kitty: !!evStr });
        } else if (final === '~' && TILDE[codeStr]) {
          events.push({ type: 'key', name: TILDE[codeStr], ...m, event, kitty: !!evStr });
        }
        continue;
      }
      if (next === 'O' && i + 2 < str.length) {
        const name = CSI_FINAL[str[i + 2]];
        if (name) events.push({ type: 'key', name, event: 'press' });
        i += 3;
        continue;
      }
      events.push({ type: 'key', name: 'escape', event: 'press' });
      i += 1;
      continue;
    }
    i += 1;
    if (ch === '\r' || ch === '\n') events.push({ type: 'key', name: 'enter', event: 'press' });
    else if (ch === '\x7f' || ch === '\b') events.push({ type: 'key', name: 'backspace', event: 'press' });
    else if (ch === '\t') events.push({ type: 'key', name: 'tab', event: 'press' });
    else if (ch === ' ') events.push({ type: 'key', name: 'space', ch: ' ', event: 'press' });
    else if (ch.charCodeAt(0) < 32) {
      const letter = String.fromCharCode(ch.charCodeAt(0) + 96);
      events.push({ type: 'key', name: letter, ctrl: true, event: 'press' });
    } else {
      const lower = ch.toLowerCase();
      events.push({ type: 'key', name: lower, ch, shift: ch !== lower, event: 'press' });
    }
  }
  return events;
}

export const ACTIONS = {
  up: ['up', 'w'],
  down: ['down', 's'],
  left: ['left', 'a'],
  right: ['right', 'd'],
  fire: ['space', 'z', 'j'],
  alt: ['x', 'k', 'c'],
  confirm: ['enter', 'space'],
  pause: ['p'],
  quit: ['q', 'escape'],
  record: ['r'],
};

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left', w: 's', s: 'w', a: 'd', d: 'a' };

// Without key-release events we guess "held" from the OS key repeat stream.
const LEGACY_FIRST_HOLD_MS = 300;
const LEGACY_REPEAT_HOLD_MS = 140;

// Tracks held keys, presses since the last game step, and the mouse.
export class Input {
  constructor() {
    this.held = new Map(); // key name -> expiry timestamp (Infinity when we have release events)
    this.pressedKeys = new Set();
    this.hasReleaseEvents = false;
    this.mouse = { x: -1, y: -1, inside: false };
    this.clicks = [];
    this.now = () => performance.now();
  }

  handle(ev) {
    const t = this.now();
    if (ev.type === 'mouse') {
      this.mouse.x = ev.x;
      this.mouse.y = ev.y;
      this.mouse.moved = true;
      if (ev.action === 'down' && ev.button === 0) this.clicks.push({ x: ev.x, y: ev.y });
      return;
    }
    const name = ev.name;
    if (ev.event === 'release') {
      this.hasReleaseEvents = true;
      this.held.delete(name);
      return;
    }
    this.pressedKeys.add(name);
    if (OPPOSITE[name]) this.held.delete(OPPOSITE[name]);
    if (this.hasReleaseEvents) {
      this.held.set(name, Infinity);
    } else {
      const wasHeld = (this.held.get(name) || 0) > t;
      this.held.set(name, t + (wasHeld || ev.event === 'repeat' ? LEGACY_REPEAT_HOLD_MS : LEGACY_FIRST_HOLD_MS));
    }
  }

  keyDown(name) {
    const exp = this.held.get(name);
    return exp !== undefined && exp > this.now();
  }

  keyPressed(name) {
    return this.pressedKeys.has(name);
  }

  down(action) {
    return (ACTIONS[action] || [action]).some((k) => this.keyDown(k));
  }

  pressed(action) {
    return (ACTIONS[action] || [action]).some((k) => this.pressedKeys.has(k));
  }

  consume(action) {
    for (const k of ACTIONS[action] || [action]) this.pressedKeys.delete(k);
  }

  takeClicks() {
    const c = this.clicks;
    this.clicks = [];
    return c;
  }

  endStep() {
    this.pressedKeys.clear();
  }

  reset() {
    this.held.clear();
    this.pressedKeys.clear();
    this.clicks = [];
  }
}
