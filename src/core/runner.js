import { resolveColorMode } from './config.js';
import { Framebuffer } from './framebuffer.js';
import { textWidth } from './font.js';
import { Input } from './input.js';
import { C } from './palette.js';
import { Renderer } from './renderer.js';
import { addScore, bestScore } from './scores.js';
import { Sound, silent } from './sound.js';
import { moveTo } from './terminal.js';
import { Recorder } from '../record/recorder.js';

const STEP_MS = 1000 / 60;

// Centred box with lines of text, drawn on top of the game.
export function drawPanel(fb, lines, { color = C.WHITE, border = C.WHITE, bg = C.BLACK } = {}) {
  const w = Math.min(fb.w - 4, Math.max(...lines.map((l) => textWidth(typeof l === 'string' ? l : l.text))) + 8);
  const h = lines.length * 7 + 5;
  const x = Math.floor((fb.w - w) / 2);
  const y = Math.floor((fb.h - h) / 2);
  fb.rect(x, y, w, h, bg);
  fb.frame(x + 1, y + 1, w - 2, h - 2, border);
  lines.forEach((l, i) => {
    const { text, c } = typeof l === 'string' ? { text: l, c: color } : l;
    fb.text(text, x + w / 2, y + 4 + i * 7, c, { align: 'center' });
  });
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Runs one game until the player leaves. Returns { score, recordings: [...] }.
export function playGame(term, Game, settings, opts = {}) {
  return new Promise((resolve) => {
    const colorMode = resolveColorMode(settings.colorMode);
    const renderer = new Renderer(colorMode);
    const fb = new Framebuffer(Game.width, Game.height);
    const input = new Input();
    const sound = settings.sound ? new Sound(true) : silent;
    const fps = opts.fps || settings.fps || 30;
    const recordings = [];
    let recorder = null;
    let game;
    let state; // playing | paused | over
    let overInfo = null;
    let best = bestScore(Game.id);
    let lastScore = 0;
    let statusCache = '';
    let tooSmall = false;
    let layout = { ox: 0, oy: 0 };
    let timer = null;
    let frames = 0;
    let fpsShown = 0;
    let fpsWindow = performance.now();

    const ctx = () => ({ sound, settings, difficulty: settings.difficulty, input, best });

    const newGame = () => {
      game = new Game(ctx());
      state = 'playing';
      overInfo = null;
      input.reset();
    };

    const startRecording = () => {
      recorder = new Recorder({ gameId: Game.id, title: Game.title, w: Game.width, h: Game.height, colorMode, gifScale: settings.gifScale });
      sound.play('select');
    };

    const stopRecording = () => {
      if (!recorder) return;
      const saved = recorder.save({ score: game?.score || lastScore, player: settings.playerName });
      if (saved) recordings.push(saved);
      recorder = null;
    };

    const relayout = () => {
      term.clear();
      renderer.invalidate();
      statusCache = '';
      const need = { cols: Game.width, rows: Game.height / 2 };
      tooSmall = term.cols < need.cols || term.rows < need.rows;
      layout.ox = Math.max(0, Math.floor((term.cols - need.cols) / 2));
      layout.oy = Math.max(0, Math.floor((term.rows - need.rows - 1) / 2));
      if (tooSmall) {
        const msg = `Terminal too small: need ${need.cols}x${need.rows}, have ${term.cols}x${term.rows}. Resize or press Q.`;
        term.write(moveTo(Math.floor(term.rows / 2), 0) + `\x1b[33m${msg.slice(0, term.cols)}\x1b[0m`);
      }
    };

    const finishGame = () => {
      lastScore = game.score || 0;
      const rank = addScore(Game.id, settings.playerName, lastScore, game.scoreExtra?.() || {});
      const wasBest = lastScore > 0 && lastScore > best;
      best = Math.max(best, lastScore);
      overInfo = { rank, wasBest, won: !!game.won, wait: 40 };
      state = 'over';
      sound.play(game.won ? 'win' : 'gameover');
    };

    const leave = () => {
      clearTimeout(timer);
      offInput();
      offResize();
      term.setMouse(false);
      stopRecording();
      term.clear();
      resolve({ score: lastScore || game?.score || 0, recordings });
    };

    const handleGlobalKeys = () => {
      if (input.pressed('record')) {
        if (recorder) stopRecording();
        else startRecording();
      }
      if (state === 'playing') {
        if (input.pressed('pause') || input.pressed('quit')) {
          state = 'paused';
          sound.play('select');
          input.endStep();
        }
      } else if (state === 'paused') {
        if (input.pressed('quit')) {
          lastScore = game.score || 0;
          if (lastScore) addScore(Game.id, settings.playerName, lastScore, game.scoreExtra?.() || {});
          return leave(), true;
        }
        if (input.pressed('pause') || input.pressed('confirm')) state = 'playing';
        input.endStep();
      } else if (state === 'over') {
        if (overInfo.wait > 0) {
          // Ignore keys for a moment so a held fire button doesn't skip the screen.
          overInfo.wait--;
          input.endStep();
          return false;
        }
        if (input.pressed('quit')) return leave(), true;
        if (input.pressed('enter') || input.pressed('space')) {
          sound.play('start');
          newGame();
        }
        input.endStep();
      }
      return false;
    };

    const step = () => {
      if (handleGlobalKeys()) return true;
      if (state === 'playing' && !tooSmall) {
        game.update(input);
        if (game.gameOver) finishGame();
      }
      input.endStep();
      return false;
    };

    const draw = () => {
      game.draw(fb);
      if (state === 'paused') {
        drawPanel(fb, ['PAUSED', { text: 'P RESUME', c: C.SILVER }, { text: 'Q QUIT', c: C.SILVER }], { border: C.YELLOW });
      } else if (state === 'over') {
        const lines = [
          { text: overInfo.won ? 'YOU WIN!' : 'GAME OVER', c: overInfo.won ? C.YELLOW : C.RED },
          `SCORE ${game.score}`,
        ];
        if (overInfo.wasBest) lines.push({ text: 'NEW HIGH SCORE!', c: C.YELLOW });
        else if (overInfo.rank) lines.push({ text: `RANK #${overInfo.rank}`, c: C.MINT });
        else lines.push({ text: `BEST ${best}`, c: C.SILVER });
        lines.push({ text: 'ENTER: RETRY', c: C.SILVER }, { text: 'Q: MENU', c: C.SILVER });
        drawPanel(fb, lines, { border: overInfo.won ? C.YELLOW : C.RED });
      }
      if (recorder) recorder.capture(fb);
    };

    const status = () => {
      const recTxt = recorder ? `● REC ${fmtTime(recorder.elapsed)}  ` : '';
      const fpsTxt = settings.showFps ? `${fpsShown}fps  ` : '';
      const room = Math.max(0, term.cols - layout.ox - recTxt.length - fpsTxt.length - 1);
      let hint = `${Game.title.toUpperCase()}  ·  ${Game.controls}  ·  P pause  R rec  Q quit`;
      if (hint.length > room) hint = `${Game.controls}  ·  P R Q`.slice(0, room);
      const text = `\x1b[31m${recTxt}\x1b[33m${fpsTxt}\x1b[0m\x1b[2m${hint}\x1b[0m`;
      const row = layout.oy + Game.height / 2;
      if (row >= term.rows || text === statusCache) return '';
      statusCache = text;
      return `${moveTo(row, layout.ox)}\x1b[0m\x1b[2K${text}`;
    };

    const toCell = () => {
      if (!Game.mouse) return;
      // Convert terminal mouse cell to game pixel coordinates.
      const m = input.mouse;
      game.pointer = { x: m.x - layout.ox, y: (m.y - layout.oy) * 2 + 1 };
      game.clicks = input.takeClicks().map((c) => ({ x: c.x - layout.ox, y: (c.y - layout.oy) * 2 + 1 }));
    };

    let acc = 0;
    let last = performance.now();
    const tick = () => {
      const start = performance.now();
      acc += Math.min(250, start - last);
      last = start;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        toCell();
        if (step()) return;
      }
      if (!tooSmall) {
        draw();
        term.write(renderer.render(fb, layout.ox, layout.oy) + status());
      }
      frames++;
      if (start - fpsWindow >= 1000) {
        fpsShown = frames;
        frames = 0;
        fpsWindow = start;
      }
      timer = setTimeout(tick, Math.max(0, 1000 / fps - (performance.now() - start)));
    };

    const offInput = term.onInput((ev) => {
      if (tooSmall && ev.type === 'key' && (ev.name === 'q' || ev.name === 'escape')) return leave();
      input.handle(ev);
    });
    const offResize = term.onResizeEvent(relayout);

    term.setMouse(!!Game.mouse);
    newGame();
    if (opts.record ?? settings.recordByDefault) startRecording();
    sound.play('start');
    relayout();
    tick();
  });
}
