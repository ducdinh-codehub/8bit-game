import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paths } from './core/config.js';
import { GAMES } from './games/index.js';
import { readCastHeader } from './record/cast.js';
import { listRecordings } from './record/recorder.js';

export const PACKAGE_CMD = 'npx 8bit-arcade';

export function resolveRecording(arg) {
  const all = listRecordings();
  if (!arg || arg === 'latest' || arg === 'last') return all[0] || null;
  const direct = path.resolve(arg);
  if (fs.existsSync(direct)) {
    const castPath = direct.replace(/\.gif$/, '.cast');
    const gifPath = castPath.replace(/\.cast$/, '.gif');
    return { name: path.basename(castPath, '.cast'), castPath, gifPath: fs.existsSync(gifPath) ? gifPath : null };
  }
  return all.find((r) => r.name === arg || r.name.startsWith(arg)) || null;
}

export function shareInfo(rec) {
  const header = readCastHeader(rec.castPath) || {};
  const meta = header['8bit'] || {};
  const game = GAMES.find((g) => g.id === meta.game);
  const title = game?.title || header.title || '8-bit arcade';
  const score = meta.score ? ` and scored ${meta.score}` : '';
  const text = `I played ${title} in my terminal${score} 🎮👾 Try it: ${PACKAGE_CMD}`;
  return {
    ...rec,
    title,
    score: meta.score || 0,
    text,
    tweetUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  };
}

function run(cmd, args, input) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'] });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    if (input !== undefined) child.stdin.end(input);
  });
}

export async function copyToClipboard(text) {
  if (process.platform === 'darwin') return run('pbcopy', [], text);
  if (process.platform === 'win32') return run('clip', [], text);
  return (await run('wl-copy', [], text)) || (await run('xclip', ['-selection', 'clipboard'], text)) || run('xsel', ['-b'], text);
}

export function reveal(file) {
  if (process.platform === 'darwin') return run('open', ['-R', file]);
  if (process.platform === 'win32') return run('explorer', [`/select,${file}`]);
  return run('xdg-open', [path.dirname(file)]);
}

export function openUrl(url) {
  if (process.platform === 'darwin') return run('open', [url]);
  if (process.platform === 'win32') return run('cmd', ['/c', 'start', '', url]);
  return run('xdg-open', [url]);
}

// asciinema identifies uploaders by an "install id". Reuse the user's own one
// if they have the asciinema CLI configured, so uploads land in their account.
function installId() {
  const candidates = [
    process.env.ASCIINEMA_INSTALL_ID_FILE,
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'asciinema', 'install-id'),
    path.join(os.homedir(), '.asciinema', 'install-id'),
  ].filter(Boolean);
  for (const f of candidates) {
    try {
      const id = fs.readFileSync(f, 'utf8').trim();
      if (id) return id;
    } catch {}
  }
  const own = path.join(paths.home, 'asciinema-install-id');
  try {
    return fs.readFileSync(own, 'utf8').trim();
  } catch {
    const id = crypto.randomUUID();
    fs.mkdirSync(paths.home, { recursive: true });
    fs.writeFileSync(own, id);
    return id;
  }
}

// Uploads a .cast to asciinema.org and returns the public URL.
export async function uploadCast(castPath, server = process.env.ASCIINEMA_SERVER_URL || 'https://asciinema.org') {
  const form = new FormData();
  form.append('asciicast', new Blob([fs.readFileSync(castPath)]), 'ascii.cast');
  const auth = Buffer.from(`${os.userInfo().username}:${installId()}`).toString('base64');
  const res = await fetch(`${server.replace(/\/$/, '')}/api/asciicasts`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'User-Agent': '8bit-arcade' },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${body.slice(0, 200)}`);
  try {
    const json = JSON.parse(body);
    return json.url || body.trim();
  } catch {
    return body.trim();
  }
}
