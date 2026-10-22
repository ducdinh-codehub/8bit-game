import fs from 'node:fs';
import readline from 'node:readline/promises';
import { coerceSetting, defaults, loadSettings, paths, resolveColorMode, saveSettings, SETTINGS } from './core/config.js';
import { loadScores } from './core/scores.js';
import { findGame, GAMES } from './games/index.js';
import { listRecordings } from './record/recorder.js';
import { copyToClipboard, resolveRecording, reveal, shareInfo, uploadCast } from './share.js';
import { BANNER_WIDTH, bannerLines, colorBanner, smallBanner } from './ui/banner.js';
import { A as RAW_A, pad } from './ui/text.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const A = useColor ? RAW_A : Object.fromEntries(Object.keys(RAW_A).map((k) => [k, '']));

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (k.startsWith('no-')) flags[k.slice(3)] = false;
      else if (v !== undefined) flags[k] = v;
      else if (['difficulty', 'fps', 'color'].includes(k) && argv[i + 1] && !argv[i + 1].startsWith('-')) flags[k] = argv[++i];
      else flags[k] = true;
    } else if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) flags[{ h: 'help', v: 'version', r: 'record' }[ch] || ch] = true;
    } else args.push(a);
  }
  return { args, flags };
}

function printBanner() {
  if (!process.stdout.isTTY) return console.log('8-BIT ARCADE');
  const mode = resolveColorMode(loadSettings().colorMode);
  if ((process.stdout.columns || 80) >= BANNER_WIDTH) console.log(colorBanner(bannerLines(), mode, 0).join('\n'));
  else console.log(smallBanner(mode));
}

const HELP = () => `
${A.bold}Usage${A.reset}
  8bit                         open the arcade menu
  8bit play <game> [options]   jump straight into a game
  8bit list                    list games
  8bit scores [game]           show high scores
  8bit settings                edit settings (interactive)
  8bit settings get [key]      print settings
  8bit settings set <k> <v>    change a setting
  8bit settings reset          restore defaults
  8bit recordings              list saved recordings
  8bit replay [file|latest]    replay a recording in the terminal
  8bit share [file|latest]     share a recording (GIF, text, X link)
      --copy                   copy share text to the clipboard
      --open                   reveal the GIF in your file manager
      --upload                 upload the .cast to asciinema.org (asks first)

${A.bold}Play options${A.reset}
  -r, --record                 record this session (.gif + .cast)
  --difficulty easy|normal|hard
  --fps 20|30|60
  --no-sound

${A.bold}Games${A.reset}
${GAMES.map((g) => `  ${pad(g.short, 8)} ${A.dim}also: ${g.id}, ${g.aliases.join(', ')}${A.reset}`).join('\n')}

${A.bold}In game${A.reset}  P pause · R start/stop recording · Q quit
${A.dim}Data lives in ${paths.home} (override with EIGHTBIT_HOME)${A.reset}
`;

function overridesFrom(flags) {
  const o = {};
  if (flags.difficulty) o.difficulty = coerceSetting('difficulty', flags.difficulty);
  if (flags.fps) o.fps = coerceSetting('fps', flags.fps);
  if (flags.sound === false) o.sound = false;
  if (flags.color) o.colorMode = coerceSetting('colorMode', flags.color);
  return o;
}

function requireTTY() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('This command needs an interactive terminal.');
    process.exit(1);
  }
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function cmdShare(target, flags) {
  const rec = resolveRecording(target);
  if (!rec) {
    console.error('No recording found. Record one with `8bit play <game> --record` or press R in game.');
    process.exit(1);
  }
  const info = shareInfo(rec);
  console.log(`\n${A.bold}${info.title}${A.reset}${info.score ? `  ${A.yellow}score ${info.score}${A.reset}` : ''}`);
  console.log(`  GIF   ${info.gifPath || '(missing)'}`);
  console.log(`  CAST  ${info.castPath}`);
  console.log(`\n  ${A.green}${info.text}${A.reset}`);
  console.log(`\n  Post on X: ${A.cyan}${info.tweetUrl}${A.reset}`);
  console.log(`  ${A.dim}Attach the GIF to your post, Discord message, Slack thread or README.${A.reset}`);
  if (flags.copy) console.log((await copyToClipboard(info.text)) ? '\n  Copied share text to clipboard.' : '\n  No clipboard tool found.');
  if (flags.open && info.gifPath) await reveal(info.gifPath);
  if (flags.upload) {
    const ok = flags.yes || (await confirm('\n  Upload this recording publicly to asciinema.org? (y/N) '));
    if (!ok) return console.log('  Upload cancelled.');
    try {
      const url = await uploadCast(info.castPath);
      console.log(`  ${A.green}Uploaded:${A.reset} ${url}`);
    } catch (e) {
      console.error(`  ${A.red}${e.message}${A.reset}`);
      process.exitCode = 1;
    }
  }
  console.log('');
}

export async function main(argv) {
  const { args, flags } = parseArgs(argv);
  const [cmd, ...rest] = args;

  if (flags.version) return console.log(pkg.version);
  if (flags.help || cmd === 'help') {
    printBanner();
    return console.log(HELP());
  }

  switch (cmd) {
    case undefined: {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        printBanner();
        return console.log(HELP());
      }
      const { runArcade } = await import('./app.js');
      return runArcade({ overrides: overridesFrom(flags), opts: { record: flags.record } });
    }
    case 'play':
    case 'record': {
      const name = rest[0];
      const game = findGame(name);
      if (!game) {
        console.error(name ? `Unknown game "${name}".` : 'Which game?', `Try: ${GAMES.map((g) => g.id).join(', ')}`);
        process.exit(1);
      }
      requireTTY();
      const { runArcade } = await import('./app.js');
      return runArcade({
        game,
        overrides: overridesFrom(flags),
        opts: { record: cmd === 'record' || flags.record || undefined, exitAfter: true },
      });
    }
    case 'list':
    case 'ls':
    case 'games': {
      printBanner();
      console.log('');
      GAMES.forEach((g, i) => {
        console.log(`  ${A.yellow}${i + 1}.${A.reset} ${A.bold}${pad(g.title, 14)}${A.reset}${pad(g.description, 54)}${A.dim}8bit ${g.short}${A.reset}`);
        if (g.inspiredBy) console.log(`     ${A.dim}tribute to ${g.inspiredBy}${A.reset}`);
      });
      return console.log('');
    }
    case 'scores':
    case 'highscores': {
      const all = loadScores();
      const games = rest[0] ? [findGame(rest[0])].filter(Boolean) : GAMES;
      for (const g of games) {
        console.log(`\n${A.bold}${g.title}${A.reset}`);
        const list = all[g.id] || [];
        if (!list.length) console.log(`  ${A.dim}no scores yet${A.reset}`);
        list.forEach((e, i) => console.log(`  ${pad(String(i + 1) + '.', 4)}${pad(e.name, 12)}${A.yellow}${e.score}${A.reset}  ${A.dim}${e.date.slice(0, 10)}${A.reset}`));
      }
      return console.log('');
    }
    case 'settings':
    case 'config': {
      const [sub, key, ...val] = rest;
      if (!sub) {
        requireTTY();
        const { runSettingsUI } = await import('./app.js');
        return runSettingsUI();
      }
      if (sub === 'path') return console.log(paths.config);
      if (sub === 'reset') {
        saveSettings(defaults());
        return console.log('Settings reset to defaults.');
      }
      if (sub === 'get' || sub === 'list') {
        const s = loadSettings();
        if (key) return console.log(String(s[key]));
        for (const d of SETTINGS) console.log(`  ${pad(d.key, 18)}${A.cyan}${s[d.key]}${A.reset}  ${A.dim}${d.options ? d.options.join('|') : 'text'}${A.reset}`);
        return;
      }
      if (sub === 'set') {
        const s = loadSettings();
        s[key] = coerceSetting(key, val.join(' '));
        saveSettings(s);
        return console.log(`${key} = ${s[key]}`);
      }
      console.error(`Unknown settings command "${sub}".`);
      process.exit(1);
      break;
    }
    case 'recordings':
    case 'recs': {
      const recs = listRecordings();
      if (!recs.length) return console.log('No recordings yet. Press R in any game, or run `8bit play <game> --record`.');
      for (const r of recs) console.log(`  ${pad(r.name, 36)}${A.dim}${new Date(r.mtime).toLocaleString()}${A.reset}`);
      return console.log(`\n  ${A.dim}${paths.recordings}${A.reset}`);
    }
    case 'replay': {
      const rec = resolveRecording(rest[0]);
      if (!rec) {
        console.error('No recording found.');
        process.exit(1);
      }
      requireTTY();
      const { runReplay } = await import('./app.js');
      return runReplay(rec.castPath);
    }
    case 'share':
      return cmdShare(rest[0], flags);
    default: {
      // `8bit snake` works as a shortcut for `8bit play snake`.
      const game = findGame(cmd);
      if (game) {
        requireTTY();
        const { runArcade } = await import('./app.js');
        return runArcade({ game, overrides: overridesFrom(flags), opts: { record: flags.record || undefined, exitAfter: true } });
      }
      console.error(`Unknown command "${cmd}". Run \`8bit --help\`.`);
      process.exit(1);
    }
  }
}
