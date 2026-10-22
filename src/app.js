import fs from 'node:fs';
import { defaults, loadSettings, resolveColorMode, saveSettings, SETTINGS } from './core/config.js';
import { playGame } from './core/runner.js';
import { bestScore, topScores } from './core/scores.js';
import { Sound, silent } from './core/sound.js';
import { Terminal } from './core/terminal.js';
import { GAMES } from './games/index.js';
import { replayCast } from './record/cast.js';
import { listRecordings } from './record/recorder.js';
import { copyToClipboard, openUrl, reveal, shareInfo, uploadCast } from './share.js';
import { BANNER_WIDTH, bannerLines, colorBanner, smallBanner } from './ui/banner.js';
import { A, box, pad, paint, truncate } from './ui/text.js';

const W = 78;

// Runs a keyboard-driven screen. `onKey` returns undefined to keep going, or a
// value to resolve with. `render(phase)` is called on every change and, when
// `animate` is set, on a timer.
function screen(term, render, onKey, { animate = false } = {}) {
  return new Promise((resolve) => {
    let phase = 0;
    let done = false;
    let queue = Promise.resolve();
    const draw = () => !done && render(phase);
    const timer = animate ? setInterval(() => ((phase += 0.2), draw()), 120) : null;
    const offResize = term.onResizeEvent(() => (term.clear(), draw()));
    // Keys are handled strictly in order, even when several arrive in one chunk
    // and a handler awaits (e.g. replaying a recording).
    const off = term.onInput((ev) => {
      if (ev.type !== 'key' || ev.event === 'release') return;
      queue = queue.then(async () => {
        if (done) return;
        const r = await onKey(ev);
        if (r === undefined) return draw();
        done = true;
        clearInterval(timer);
        off();
        offResize();
        resolve(r);
      });
    });
    term.clear();
    draw();
  });
}

const tagline = (g) => (g.inspiredBy ? `tribute to ${g.inspiredBy}` : `classic arcade (${g.year})`);

function mainMenu(term, settings, startSel = 0) {
  const sound = settings.sound ? new Sound(true) : silent;
  const mode = resolveColorMode(settings.colorMode);
  const items = [
    ...GAMES.map((game) => ({ kind: 'game', game })),
    { kind: 'sep' },
    { kind: 'scores', label: 'High scores' },
    { kind: 'recordings', label: 'Recordings & sharing' },
    { kind: 'settings', label: 'Settings' },
    { kind: 'quit', label: 'Quit' },
  ];
  let sel = startSel;
  const bests = Object.fromEntries(GAMES.map((g) => [g.id, bestScore(g.id)]));
  const move = (d) => {
    do sel = (sel + d + items.length) % items.length;
    while (items[sel].kind === 'sep');
    sound.play('select');
  };

  const render = (phase) => {
    const lines = [];
    const big = term.cols >= BANNER_WIDTH + 2 && term.rows >= 26;
    if (big) lines.push(...colorBanner(bannerLines(), mode, phase));
    else lines.push(' '.repeat(Math.floor((W - 20) / 2)) + smallBanner(mode, phase));
    lines.push('', `${A.dim}${' '.repeat(18)}░▒▓  retro games in your terminal  ▓▒░${A.reset}`, '');
    items.forEach((it, i) => {
      const on = i === sel;
      const mark = on ? `${A.yellow}${Math.floor(phase * 2) % 2 ? '▶' : '▷'}${A.reset}` : ' ';
      const hl = on ? A.bold + A.yellow : '';
      if (it.kind === 'sep') return lines.push(`${A.gray}  ${'─'.repeat(W - 4)}${A.reset}`);
      if (it.kind === 'game') {
        const g = it.game;
        const hi = bests[g.id] ? `${A.cyan}HI ${bests[g.id]}${A.reset}` : `${A.gray}HI —${A.reset}`;
        lines.push(`  ${mark} ${hl}${pad(`${i + 1}. ${g.title.toUpperCase()}`, 17)}${A.reset}${A.dim}${pad(truncate(tagline(g), 40), 42)}${A.reset}${hi}`);
      } else lines.push(`  ${mark} ${hl}${it.label}${A.reset}`);
    });
    lines.push('', `${A.dim}  ↑↓ choose · enter select · 1-${GAMES.length} quick play · q quit${A.reset}`);
    paint(term, lines, { blockWidth: W });
  };

  return screen(
    term,
    render,
    (ev) => {
      if (ev.name === 'up' || ev.name === 'w' || ev.name === 'k') return move(-1);
      if (ev.name === 'down' || ev.name === 's' || ev.name === 'j' || ev.name === 'tab') return move(1);
      const n = Number(ev.name);
      if (n >= 1 && n <= GAMES.length) return { kind: 'game', game: GAMES[n - 1], sel: n - 1 };
      if (ev.name === 'q' || ev.name === 'escape') return { kind: 'quit' };
      if (ev.name === 'enter' || ev.name === 'space') return { ...items[sel], sel };
      return undefined;
    },
    { animate: true },
  );
}

function settingsScreen(term) {
  let s = loadSettings();
  let sel = 0;
  let editing = null;
  const rows = [...SETTINGS, { key: '_reset', label: 'Reset to defaults' }, { key: '_back', label: 'Back' }];
  const fmt = (v) => (v === true ? 'on' : v === false ? 'off' : String(v));
  const cycle = (def, d) => {
    const i = def.options.indexOf(s[def.key]);
    s[def.key] = def.options[(i + d + def.options.length) % def.options.length];
    saveSettings(s);
  };

  const render = () => {
    const body = rows.map((def, i) => {
      const on = i === sel;
      const mark = on ? `${A.yellow}▶${A.reset}` : ' ';
      if (def.key.startsWith('_')) return ` ${mark} ${on ? A.bold + A.yellow : ''}${def.label}${A.reset}`;
      let value = fmt(s[def.key]);
      if (editing !== null && on) value = `${A.inverse}${editing}_${A.reset}`;
      else if (def.options) value = `${on ? '◀ ' : '  '}${A.cyan}${value}${A.reset}${on ? ' ▶' : ''}`;
      else value = `${A.cyan}${value}${A.reset}`;
      return ` ${mark} ${pad(on ? A.bold + def.label + A.reset : def.label, 22)}${value}`;
    });
    const help = rows[sel].help || '';
    paint(
      term,
      [
        ...box('SETTINGS', ['', ...body, ''], W),
        `  ${A.dim}${help}${A.reset}`,
        '',
        `  ${A.dim}↑↓ choose · ←→ change · enter edit/toggle · esc back${A.reset}`,
      ],
      { blockWidth: W },
    );
  };

  return screen(term, render, (ev) => {
    const def = rows[sel];
    if (editing !== null) {
      if (ev.name === 'enter' || ev.name === 'escape') {
        if (ev.name === 'enter' && editing.trim()) s[def.key] = editing.trim().toUpperCase();
        editing = null;
        saveSettings(s);
      } else if (ev.name === 'backspace') editing = editing.slice(0, -1);
      else if (ev.ch && /^[\w .-]$/.test(ev.ch) && editing.length < (def.max || 10)) editing += ev.ch.toUpperCase();
      return undefined;
    }
    if (ev.name === 'escape' || ev.name === 'q') return true;
    if (ev.name === 'up' || ev.name === 'w') sel = (sel - 1 + rows.length) % rows.length;
    else if (ev.name === 'down' || ev.name === 's') sel = (sel + 1) % rows.length;
    else if (def.options && (ev.name === 'left' || ev.name === 'a')) cycle(def, -1);
    else if (def.options && (ev.name === 'right' || ev.name === 'd' || ev.name === 'enter' || ev.name === 'space')) cycle(def, 1);
    else if (ev.name === 'enter' || ev.name === 'space') {
      if (def.key === '_back') return true;
      if (def.key === '_reset') {
        s = defaults();
        saveSettings(s);
      } else if (def.type === 'text') editing = String(s[def.key] || '');
    }
    return undefined;
  });
}

function scoresScreen(term) {
  let gi = 0;
  const render = () => {
    const g = GAMES[gi];
    const tabs = GAMES.map((x, i) => (i === gi ? `${A.inverse}${A.bold} ${x.title} ${A.reset}` : `${A.dim} ${x.title} ${A.reset}`)).join(' ');
    const list = topScores(g.id);
    const body = list.length
      ? list.map((e, i) => {
          const medal = ['🥇', '🥈', '🥉'][i] || '  ';
          const extra = Object.entries(e)
            .filter(([k]) => !['name', 'score', 'date'].includes(k))
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ');
          return `  ${medal} ${pad(String(i + 1) + '.', 4)}${pad(e.name, 12)}${A.yellow}${pad(String(e.score), 10)}${A.reset}${A.dim}${pad(extra, 24)}${e.date.slice(0, 10)}${A.reset}`;
        })
      : [`  ${A.dim}No scores yet. Go set one!${A.reset}`];
    paint(term, [...box('HIGH SCORES', ['', `  ${tabs}`, '', ...body, ''], W), '', `  ${A.dim}←→ switch game · esc back${A.reset}`], { blockWidth: W });
  };
  return screen(term, render, (ev) => {
    if (ev.name === 'left' || ev.name === 'a') gi = (gi - 1 + GAMES.length) % GAMES.length;
    else if (ev.name === 'right' || ev.name === 'd' || ev.name === 'tab') gi = (gi + 1) % GAMES.length;
    else if (['escape', 'q', 'enter'].includes(ev.name)) return true;
    return undefined;
  });
}

function prettySize(file) {
  try {
    const b = fs.statSync(file).size;
    return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`;
  } catch {
    return '';
  }
}

async function shareScreen(term, rec) {
  const info = shareInfo(rec);
  let message = '';
  let confirmUpload = false;
  const render = () => {
    const body = [
      '',
      `  ${A.bold}${info.title}${A.reset}${info.score ? `  ${A.yellow}score ${info.score}${A.reset}` : ''}`,
      '',
      `  ${A.dim}GIF ${A.reset} ${truncate(info.gifPath || '(missing)', 60)} ${A.dim}${info.gifPath ? prettySize(info.gifPath) : ''}${A.reset}`,
      `  ${A.dim}CAST${A.reset} ${truncate(info.castPath, 60)}`,
      '',
      `  ${A.dim}Share text:${A.reset}`,
      `  ${A.green}${truncate(info.text, 72)}${A.reset}`,
      '',
      `  ${A.cyan}c${A.reset} copy text   ${A.cyan}o${A.reset} show GIF in folder   ${A.cyan}x${A.reset} post on X   ${A.cyan}r${A.reset} replay`,
      `  ${A.cyan}u${A.reset} upload to asciinema.org ${A.dim}(public link)${A.reset}   ${A.cyan}esc${A.reset} back`,
      '',
    ];
    const msg = confirmUpload ? `${A.yellow}Upload this recording publicly to asciinema.org? (y/N)${A.reset}` : message;
    paint(term, [...box('SHARE', body, W), '', `  ${msg}`], { blockWidth: W });
  };
  return screen(term, render, async (ev) => {
    if (confirmUpload) {
      confirmUpload = false;
      if (ev.name !== 'y') {
        message = `${A.dim}Upload cancelled.${A.reset}`;
        return undefined;
      }
      message = `${A.dim}Uploading…${A.reset}`;
      render();
      try {
        const url = await uploadCast(info.castPath);
        const copied = await copyToClipboard(url);
        message = `${A.green}Uploaded: ${url}${copied ? ' (copied)' : ''}${A.reset}`;
      } catch (e) {
        message = `${A.red}${e.message}${A.reset}`;
      }
      return undefined;
    }
    switch (ev.name) {
      case 'c':
        message = (await copyToClipboard(info.text)) ? `${A.green}Copied to clipboard.${A.reset}` : `${A.red}No clipboard tool found.${A.reset}`;
        break;
      case 'o':
        if (info.gifPath) await reveal(info.gifPath);
        message = `${A.dim}Opened the recordings folder — drag the GIF into X, Discord, Slack or a GitHub README.${A.reset}`;
        break;
      case 'x':
        await openUrl(info.tweetUrl);
        message = `${A.dim}Opened your browser. Attach the GIF to the post.${A.reset}`;
        break;
      case 'r':
        await replayCast(term, info.castPath);
        term.clear();
        break;
      case 'u':
        confirmUpload = true;
        break;
      case 'escape':
      case 'q':
      case 'enter':
        return true;
    }
    return undefined;
  });
}

async function recordingsScreen(term) {
  let sel = 0;
  let confirmDelete = false;
  for (;;) {
    const recs = listRecordings();
    sel = Math.min(sel, Math.max(0, recs.length - 1));
    const action = await screen(term, () => {
      const visible = Math.max(3, term.rows - 12);
      const start = Math.max(0, Math.min(sel - Math.floor(visible / 2), recs.length - visible));
      const body = recs.length
        ? recs.slice(start, start + visible).map((r, k) => {
            const i = start + k;
            const on = i === sel;
            const when = new Date(r.mtime).toLocaleString();
            return ` ${on ? `${A.yellow}▶${A.reset}` : ' '} ${on ? A.bold : ''}${pad(r.name, 36)}${A.reset}${A.dim}${pad(when, 24)}${r.gifPath ? prettySize(r.gifPath) : ''}${A.reset}`;
          })
        : [`  ${A.dim}No recordings yet. Press R during any game to record.${A.reset}`];
      const foot = confirmDelete
        ? `${A.yellow}Delete ${recs[sel]?.name}? (y/N)${A.reset}`
        : `${A.dim}↑↓ choose · enter replay · s share · d delete · esc back${A.reset}`;
      paint(term, [...box('RECORDINGS', ['', ...body, ''], W), '', `  ${foot}`], { blockWidth: W });
    }, (ev) => {
      if (confirmDelete) {
        confirmDelete = false;
        return ev.name === 'y' ? 'delete' : undefined;
      }
      if (ev.name === 'escape' || ev.name === 'q') return 'back';
      if (!recs.length) return undefined;
      if (ev.name === 'up' || ev.name === 'k') sel = (sel - 1 + recs.length) % recs.length;
      else if (ev.name === 'down' || ev.name === 'j') sel = (sel + 1) % recs.length;
      else if (ev.name === 'enter' || ev.name === 'space') return 'replay';
      else if (ev.name === 's') return 'share';
      else if (ev.name === 'd') confirmDelete = true;
      return undefined;
    });
    const rec = recs[sel];
    if (action === 'back') return;
    if (action === 'replay') await replayCast(term, rec.castPath);
    if (action === 'share') await shareScreen(term, rec);
    if (action === 'delete') {
      for (const f of [rec.castPath, rec.gifPath]) if (f) fs.rmSync(f, { force: true });
    }
  }
}

async function afterGame(term, result) {
  if (!result.recordings.length) return;
  const last = result.recordings.at(-1);
  await shareScreen(term, { name: last.castPath, castPath: last.castPath, gifPath: last.gifPath });
}

export async function play(term, Game, overrides = {}, opts = {}) {
  const settings = { ...loadSettings(), ...overrides };
  const result = await playGame(term, Game, settings, opts);
  await afterGame(term, result);
  return result;
}

// Entry point for the interactive arcade.
export async function runArcade({ game, overrides = {}, opts = {} } = {}) {
  const term = new Terminal();
  term.enter();
  try {
    if (game) {
      await play(term, game, overrides, opts);
      if (opts.exitAfter) return;
    }
    let sel = 0;
    for (;;) {
      const settings = { ...loadSettings(), ...overrides };
      const choice = await mainMenu(term, settings, sel);
      sel = choice.sel ?? sel;
      if (choice.kind === 'quit') return;
      if (choice.kind === 'game') await play(term, choice.game, overrides, opts);
      if (choice.kind === 'settings') await settingsScreen(term);
      if (choice.kind === 'scores') await scoresScreen(term);
      if (choice.kind === 'recordings') await recordingsScreen(term);
    }
  } finally {
    term.exit();
  }
}

export async function runReplay(file) {
  const term = new Terminal();
  term.enter();
  try {
    await replayCast(term, file);
  } finally {
    term.exit();
  }
}

export async function runSettingsUI() {
  const term = new Terminal();
  term.enter();
  try {
    await settingsScreen(term);
  } finally {
    term.exit();
  }
}
