import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Framebuffer } from '../src/core/framebuffer.js';
import { Input, parseInput } from '../src/core/input.js';
import { NES } from '../src/core/palette.js';
import { Renderer } from '../src/core/renderer.js';
import { synth, wav } from '../src/core/sound.js';
import { findGame, GAMES } from '../src/games/index.js';
import { LEVELS } from '../src/games/pipe-runner/levels.js';
import { encodeGif } from '../src/record/gif.js';

const silent = { play() {} };

test('parses legacy, kitty and mouse input', () => {
  assert.deepEqual(
    parseInput('\x1b[Aq\r').map((e) => e.name),
    ['up', 'q', 'enter'],
  );
  const [rel] = parseInput('\x1b[1;1:3C');
  assert.equal(rel.name, 'right');
  assert.equal(rel.event, 'release');
  const [k] = parseInput('\x1b[97;2u');
  assert.equal(k.name, 'a');
  assert.equal(k.ch, 'A');
  const [m] = parseInput('\x1b[<0;10;5M');
  assert.deepEqual([m.type, m.x, m.y, m.action], ['mouse', 9, 4, 'down']);
  const [cc] = parseInput('\x03');
  assert.ok(cc.ctrl && cc.name === 'c');
});

test('input tracks held keys with release events', () => {
  const input = new Input();
  input.handle({ type: 'key', name: 'right', event: 'press', kitty: true });
  input.handle({ type: 'key', name: 'right', event: 'release', kitty: true });
  assert.equal(input.down('right'), false);
  input.handle({ type: 'key', name: 'left', event: 'press', kitty: true });
  assert.equal(input.down('left'), true);
  assert.equal(input.pressed('left'), true);
  input.endStep();
  assert.equal(input.pressed('left'), false);
  assert.equal(input.down('left'), true);
});

test('finds games by alias', () => {
  assert.equal(findGame('mario').id, 'pipe-runner');
  assert.equal(findGame('Tetris').id, 'blockfall');
  assert.equal(findGame('duck-hunt').id, 'duck-blaster');
  assert.equal(findGame('2').id, 'snake');
  assert.equal(findGame('nope'), null);
});

test('levels are rectangular and finishable', () => {
  for (const lvl of LEVELS) {
    assert.equal(lvl.rows.length, 8);
    const w = lvl.rows[0].length;
    for (const r of lvl.rows) assert.equal(r.length, w, `${lvl.name} row width`);
    assert.ok(lvl.rows.some((r) => r.includes('F')), `${lvl.name} has a flag`);
    assert.ok(lvl.rows.some((r) => r.includes('P')), `${lvl.name} has a start`);
  }
});

// Fake input driven by a script of key presses per frame.
function fakeInput() {
  const input = new Input();
  input.hasReleaseEvents = true;
  return input;
}

const KEYS = ['up', 'down', 'left', 'right', 'space', 'z', 'x', 'c', 'enter'];

for (const Game of GAMES) {
  test(`${Game.id} survives 6000 random frames`, () => {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const input = fakeInput();
      const game = new Game({ sound: silent, difficulty, best: 0, input });
      const fb = new Framebuffer(Game.width, Game.height);
      const r = new Renderer('256');
      let rng = 42;
      const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let f = 0; f < 6000 && !game.gameOver; f++) {
        if (rand() < 0.15) {
          const k = KEYS[Math.floor(rand() * KEYS.length)];
          if (rand() < 0.5) input.handle({ type: 'key', name: k, event: 'press', kitty: true });
          else input.handle({ type: 'key', name: k, event: 'release', kitty: true });
        }
        if (Game.mouse) {
          game.pointer = { x: Math.floor(rand() * 80), y: Math.floor(rand() * 48) };
          if (rand() < 0.05) game.clicks = [{ ...game.pointer }];
        }
        game.update(input);
        input.endStep();
        if (f % 7 === 0) {
          game.draw(fb);
          for (const p of fb.px) assert.ok(p < 64, 'pixel within palette');
          r.render(fb);
        }
      }
      assert.ok(Number.isFinite(game.score));
    }
  });
}

test('pipe runner: holding right + jumping makes progress', () => {
  const Game = findGame('mario');
  const input = fakeInput();
  const game = new Game({ sound: silent, difficulty: 'easy', best: 0 });
  input.handle({ type: 'key', name: 'right', event: 'press', kitty: true });
  let maxX = 0;
  for (let f = 0; f < 1500; f++) {
    if (f % 40 === 0) input.handle({ type: 'key', name: 'space', event: 'press', kitty: true });
    if (f % 40 === 30) input.handle({ type: 'key', name: 'space', event: 'release', kitty: true });
    game.update(input);
    input.endStep();
    maxX = Math.max(maxX, game.player.x);
  }
  assert.ok(maxX > 150, `player reached x=${maxX.toFixed(0)}`);
});

test('blockfall: hard dropping forever tops out', () => {
  const Game = findGame('tetris');
  const input = fakeInput();
  const game = new Game({ sound: silent, difficulty: 'normal', best: 0 });
  for (let f = 0; f < 20000 && !game.gameOver; f++) {
    if (f % 3 === 0) input.handle({ type: 'key', name: 'space', event: 'press', kitty: true });
    game.update(input);
    input.endStep();
  }
  assert.ok(game.gameOver);
  assert.ok(game.score > 0);
});

test('snake: eating food grows and scores', () => {
  const Game = findGame('snake');
  const game = new Game({ sound: silent, difficulty: 'normal', best: 0 });
  const input = fakeInput();
  const [hx, hy] = game.body[0];
  game.food = [hx + 1, hy];
  game.ready = 0;
  const len = game.body.length;
  for (let f = 0; f < 10; f++) game.update(input);
  assert.ok(game.score > 0);
  for (let f = 0; f < 30; f++) game.update(input);
  assert.ok(game.body.length > len);
});

test('gif encoder produces a well-formed file', () => {
  const w = 16;
  const h = 8;
  const frames = [];
  for (let i = 0; i < 5; i++) {
    const px = new Uint8Array(w * h).map((_, j) => (j + i) % 64);
    frames.push({ px, t: i * 66 });
  }
  frames.push({ px: frames[4].px.slice(), t: 400 }); // duplicate is merged
  const buf = encodeGif(frames, w, h, NES, 2);
  assert.equal(buf.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(buf.readUInt16LE(6), 32);
  assert.equal(buf.readUInt16LE(8), 16);
  assert.equal(buf.at(-1), 0x3b);
});

test('wav synth produces audio', () => {
  const s = synth([{ wave: 'square', f0: 440, f1: 440, ms: 100, vol: 0.5, duty: 0.5 }]);
  assert.ok(s.length > 2000);
  const w = wav(s);
  assert.equal(w.subarray(0, 4).toString(), 'RIFF');
});
