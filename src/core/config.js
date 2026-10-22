import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function homeDir() {
  if (process.env.EIGHTBIT_HOME) return process.env.EIGHTBIT_HOME;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, '8bit-arcade');
}

export const paths = {
  get home() {
    return homeDir();
  },
  get config() {
    return path.join(homeDir(), 'config.json');
  },
  get scores() {
    return path.join(homeDir(), 'scores.json');
  },
  get recordings() {
    return path.join(homeDir(), 'recordings');
  },
};

function defaultName() {
  try {
    return (os.userInfo().username || 'PLAYER').slice(0, 10).toUpperCase();
  } catch {
    return 'PLAYER';
  }
}

export const SETTINGS = [
  { key: 'playerName', label: 'Player name', type: 'text', max: 10, help: 'Shown on the high score table.' },
  { key: 'difficulty', label: 'Difficulty', options: ['easy', 'normal', 'hard'], help: 'Game speed, enemies and starting level.' },
  { key: 'sound', label: 'Sound effects', options: [true, false], help: 'Chiptune blips via afplay / aplay / paplay.' },
  { key: 'colorMode', label: 'Colour mode', options: ['auto', 'truecolor', '256'], help: 'Use 256 if colours look wrong.' },
  { key: 'fps', label: 'Frame rate', options: [20, 30, 60], help: 'Lower it on slow terminals or over SSH.' },
  { key: 'recordByDefault', label: 'Auto-record games', options: [false, true], help: 'Press R in any game to toggle recording.' },
  { key: 'gifScale', label: 'GIF export scale', options: [2, 3, 4, 6], help: 'Pixel size of exported GIFs.' },
  { key: 'showFps', label: 'Show FPS counter', options: [false, true], help: 'Debug overlay in the status line.' },
];

export function defaults() {
  return {
    playerName: defaultName(),
    difficulty: 'normal',
    sound: true,
    colorMode: 'auto',
    fps: 30,
    recordByDefault: false,
    gifScale: 4,
    showFps: false,
  };
}

export function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function loadSettings() {
  const s = { ...defaults(), ...readJSON(paths.config, {}) };
  // Drop invalid values (e.g. hand-edited config).
  for (const def of SETTINGS) {
    if (def.options && !def.options.includes(s[def.key])) s[def.key] = defaults()[def.key];
  }
  return s;
}

export function saveSettings(s) {
  writeJSON(paths.config, s);
}

// Parse a CLI string ("true", "30") into the setting's value type.
export function coerceSetting(key, raw) {
  const def = SETTINGS.find((d) => d.key === key);
  if (!def) throw new Error(`Unknown setting "${key}". Known: ${SETTINGS.map((d) => d.key).join(', ')}`);
  if (def.type === 'text') return String(raw).slice(0, def.max).toUpperCase();
  const match = def.options.find((o) => String(o) === String(raw).toLowerCase());
  if (match === undefined) throw new Error(`Invalid value for ${key}. Options: ${def.options.join(', ')}`);
  return match;
}

export function resolveColorMode(setting) {
  if (setting === 'truecolor' || setting === '256') return setting;
  const ct = (process.env.COLORTERM || '').toLowerCase();
  if (ct.includes('truecolor') || ct.includes('24bit')) return 'truecolor';
  if (['iTerm.app', 'WezTerm', 'vscode', 'ghostty', 'Hyper'].includes(process.env.TERM_PROGRAM)) return 'truecolor';
  if ((process.env.TERM || '').includes('kitty') || process.env.WT_SESSION) return 'truecolor';
  return '256';
}
