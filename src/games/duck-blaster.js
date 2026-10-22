import { makeSprite } from '../core/framebuffer.js';
import { C } from '../core/palette.js';

const GRASS_Y = 62;
const GROUND_Y = 76;
const DUCKS_PER_ROUND = 10;

const DUCK_UP = [
  '.ww.............',
  '.www............',
  '..www......GGG..',
  '..wwww....GGWKG.',
  '...wwww...GGGGYY',
  '....wwwww.GWW...',
  '.BBBBBBBBBBB....',
  'BBBBBBBBBBBB....',
  '.KBBBBBBBBB.....',
  '..KKBBBBBB......',
  '......Y..Y......',
];
const DUCK_DOWN = [
  '................',
  '................',
  '...........GGG..',
  '..........GGWKG.',
  '..........GGGGYY',
  '..........GWW...',
  '.BBBBBBBBBBB....',
  'BBBBwwwwwBBB....',
  '.KBBwwwwwBB.....',
  '..KKBwwwwB......',
  '.....wwww.......',
  '......ww........',
];
const DUCK_MID = [
  '................',
  '................',
  '...........GGG..',
  '..........GGWKG.',
  '.www......GGGGYY',
  '..wwwwww..GWW...',
  '.BBBwwwwwBBB....',
  'BBBBBBBBBBBB....',
  '.KBBBBBBBBB.....',
  '..KKBBBBBB......',
  '......Y..Y......',
];
const DUCK_HIT = [
  '...GGGGGG...',
  '..GGGGGGGG..',
  '.GWWGGGGWWG.',
  '.GWKGGGGKWG.',
  '.GGGGYYGGGG.',
  '..GGYYYYGG..',
  '...WWWWWW...',
  '.wBBBBBBBBw.',
  'wwBBBBBBBBww',
  'w.BBBBBBBB.w',
  '...BBBBBB...',
  '....Y..Y....',
];
const DOG = [
  '....BB........BB....',
  '...BBBB......BBBB...',
  '..BBBTTTTTTTTTTBBB..',
  '..BBTTTTTTTTTTTTBB..',
  '..BBTTTTTTTTTTTTBB..',
  '...BTKKTTTTTTKKTB...',
  '....TTTTTTTTTTTT....',
  '....TTTTTNNTTTTT....',
  '...TTTTTNNNNTTTTT...',
  '...TTTTTTTTTTTTTT...',
  '...TTKKKKKKKKKKTT...',
  '...TTTKMMMMMMKTTT...',
  '....TTTKKKKKKTTT....',
  '.....TTTTTTTTTT.....',
  '....BBTTTTTTTTBB....',
  '...BBBTTTTTTTTBBB...',
  '..BBBBTTTTTTTTBBBB..',
  '..BBBBTTTTTTTTBBBB..',
];
const DOG_SMILE = DOG.map((r, i) =>
  i === 5 ? '...BTWKTTTTTTKWTB...' : i === 10 ? '...TTKTTTTTTTTKTT...' : i === 11 ? '...TTTKKKKKKKKTTT...' : i === 12 ? '....TTTTTTTTTTTT....' : r,
);

const DUCK_TYPES = [
  { body: C.BROWN, wing: C.SKIN, speed: 1.1, points: 500 },
  { body: C.BLUE, wing: C.PALEBLUE, speed: 1.4, points: 1000 },
  { body: C.RED, wing: C.SALMON, speed: 1.7, points: 1500 },
];

const sprites = DUCK_TYPES.map((t) => {
  const pal = { G: C.FOREST, K: C.BLACK, Y: C.ORANGE, W: C.WHITE, B: t.body, w: t.wing };
  return {
    up: makeSprite(DUCK_UP, pal),
    mid: makeSprite(DUCK_MID, pal),
    down: makeSprite(DUCK_DOWN, pal),
    hit: makeSprite(DUCK_HIT, pal),
    fall: makeSprite([...DUCK_DOWN].reverse(), pal),
  };
});
const DOG_PAL = { B: C.BROWN, T: C.ORANGE, W: C.WHITE, K: C.BLACK, N: C.BLACK, M: C.SALMON };
const dogLaugh = makeSprite(DOG, DOG_PAL);
const dogSmile = makeSprite(DOG_SMILE, DOG_PAL);
const SPEED = { easy: 0.8, normal: 1, hard: 1.3 };

export default class DuckBlaster {
  static id = 'duck-blaster';
  static title = 'Duck Blaster';
  static short = 'duck';
  static aliases = ['duck', 'duckhunt', 'duck-hunt', 'hunt'];
  static year = 1984;
  static inspiredBy = 'Duck Hunt (1984)';
  static description = 'Point and click to shoot ducks before they fly away.';
  static controls = 'mouse aim+click, or arrows + SPACE';
  static width = 160;
  static height = 96;
  static mouse = true;

  constructor({ sound, difficulty = 'normal', best = 0 }) {
    this.sound = sound;
    this.speedMul = SPEED[difficulty] ?? 1;
    this.best = best;
    this.score = 0;
    this.round = 1;
    this.frame = 0;
    this.cross = { x: 80, y: 36 };
    this.pointer = null;
    this.clicks = [];
    this.lastPointer = null;
    this.clouds = [
      [12, 10],
      [88, 4],
      [128, 20],
    ];
    this.startRound();
  }

  scoreExtra() {
    return { round: this.round };
  }

  startRound() {
    this.results = [];
    this.duckIndex = 0;
    this.state = 'roundIntro';
    this.timer = 90;
  }

  required() {
    return Math.min(10, 5 + Math.ceil(this.round / 2));
  }

  spawnDuck() {
    const typeIdx = Math.random() < 0.15 + this.round * 0.03 ? 2 : Math.random() < 0.4 ? 1 : 0;
    const type = DUCK_TYPES[typeIdx];
    const speed = type.speed * this.speedMul * (1 + (this.round - 1) * 0.08);
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 1.6;
    this.duck = {
      x: 20 + Math.random() * 120,
      y: GRASS_Y - 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      type: typeIdx,
      t: 0,
      trail: [],
    };
    this.shots = 3;
    this.state = 'flying';
    this.flyTime = Math.max(180, 420 - this.round * 20);
    this.sound.play('quack');
  }

  endDuck(hit) {
    this.results.push(hit);
    this.duckIndex++;
    this.state = hit ? 'dogShow' : 'dogLaugh';
    this.timer = hit ? 70 : 90;
    this.dogX = hit ? Math.max(8, Math.min(132, this.duck.x)) : 70;
    if (!hit) this.sound.play('laugh');
  }

  aim(input) {
    const p = this.pointer;
    if (p && p.x >= 0 && (!this.lastPointer || p.x !== this.lastPointer.x || p.y !== this.lastPointer.y)) {
      this.cross.x = p.x;
      this.cross.y = p.y;
      this.lastPointer = { ...p };
    }
    const sp = 2.8;
    if (input.down('left')) this.cross.x -= sp;
    if (input.down('right')) this.cross.x += sp;
    if (input.down('up')) this.cross.y -= sp;
    if (input.down('down')) this.cross.y += sp;
    this.cross.x = Math.max(0, Math.min(159, this.cross.x));
    this.cross.y = Math.max(0, Math.min(GROUND_Y, this.cross.y));
    const shots = [...this.clicks];
    this.clicks = [];
    if (input.pressed('fire') || input.keyPressed('enter')) shots.push({ x: this.cross.x, y: this.cross.y });
    return shots;
  }

  shoot(x, y) {
    if (this.state !== 'flying' || this.shots <= 0) return;
    this.shots--;
    this.sound.play('shoot');
    this.burst = { x, y, t: 6 };
    const d = this.duck;
    const spr = sprites[d.type].up;
    // Test against where the duck was over the last few frames too: by the
    // time a click arrives the player has been aiming at an older frame.
    const near = ({ x: dx, y: dy }) => x >= dx - 3 && x <= dx + spr.w + 2 && y >= dy - 3 && y <= dy + spr.h + 2;
    if (near(d) || d.trail.some(near)) {
      this.state = 'hit';
      this.timer = 30;
      const pts = DUCK_TYPES[d.type].points * Math.ceil(this.round / 2);
      this.score += pts;
      this.popup = { x: d.x, y: Math.max(2, d.y - 10), text: String(pts), t: 60 };
      const t = DUCK_TYPES[d.type];
      this.feathers = Array.from({ length: 8 }, (_, i) => ({
        x: d.x + 8,
        y: d.y + 5,
        vx: Math.cos((i / 8) * Math.PI * 2) * 1.2,
        vy: Math.sin((i / 8) * Math.PI * 2) * 1.2 - 0.5,
        c: i % 2 ? t.wing : t.body,
        t: 60 + i * 4,
      }));
      this.sound.play('fall');
    } else if (this.shots === 0) {
      this.flyAway();
    }
  }

  flyAway() {
    this.state = 'flyaway';
    this.duck.vx = 0;
    this.duck.vy = -2.4;
  }

  update(input) {
    this.frame++;
    if (this.burst && --this.burst.t <= 0) this.burst = null;
    for (const f of this.feathers || []) {
      f.vx *= 0.92;
      f.vy = Math.min(0.4, f.vy * 0.92 + 0.03);
      f.x += f.vx + Math.sin((f.t + f.y) / 6) * 0.3;
      f.y += f.vy;
      f.t--;
    }
    if (this.feathers) this.feathers = this.feathers.filter((f) => f.t > 0);
    if (this.popup && --this.popup.t <= 0) this.popup = null;
    for (const s of this.aim(input)) this.shoot(s.x, s.y);
    const d = this.duck;

    switch (this.state) {
      case 'roundIntro':
        if (--this.timer <= 0) this.spawnDuck();
        break;
      case 'flying': {
        d.t++;
        d.trail.unshift({ x: d.x, y: d.y });
        if (d.trail.length > 8) d.trail.pop();
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > 144) d.vx = d.x < 0 ? Math.abs(d.vx) : -Math.abs(d.vx);
        if (d.y < 2) d.vy = Math.abs(d.vy);
        if (d.y > GRASS_Y - 16 && d.t > 40) d.vy = -Math.abs(d.vy);
        if (d.t % 50 === 0 && Math.random() < 0.5) {
          const a = Math.atan2(d.vy, d.vx) + (Math.random() - 0.5) * 2;
          d.vx = Math.cos(a) * d.speed;
          d.vy = Math.sin(a) * d.speed;
        }
        if (d.t % 90 === 0) this.sound.play('quack');
        if (--this.flyTime <= 0) this.flyAway();
        break;
      }
      case 'hit':
        if (--this.timer <= 0) this.state = 'falling';
        break;
      case 'falling':
        d.y += 2.6;
        if (d.y > GRASS_Y) this.endDuck(true);
        break;
      case 'flyaway':
        d.y += d.vy;
        if (d.y < -20) this.endDuck(false);
        break;
      case 'dogShow':
      case 'dogLaugh':
        if (--this.timer <= 0) {
          if (this.duckIndex < DUCKS_PER_ROUND) this.spawnDuck();
          else this.finishRound();
        }
        break;
      case 'roundEnd':
        if (--this.timer <= 0) {
          if (this.passed) {
            this.round++;
            this.startRound();
          } else this.gameOver = true;
        }
        break;
    }
  }

  finishRound() {
    const hits = this.results.filter(Boolean).length;
    this.passed = hits >= this.required();
    if (hits === DUCKS_PER_ROUND) this.score += 10000;
    this.state = 'roundEnd';
    this.timer = 120;
    this.sound.play(this.passed ? 'levelup' : 'gameover');
  }

  drawCloud(fb, x, y) {
    x = Math.round(x);
    for (const [dx, dy, r] of [[6, 6, 5], [14, 3, 6], [22, 6, 5], [14, 8, 4]]) fb.disc(x + dx, y + dy, r, C.WHITE);
    fb.rect(x + 2, y + 10, 26, 2, C.WHITE);
    fb.rect(x + 3, y + 12, 24, 1, C.PALEBLUE);
  }

  drawScene(fb) {
    fb.clear(C.SKYBLUE);
    // a paler band near the horizon
    fb.rect(0, 44, fb.w, 20, 0x31);
    for (let x = 0; x < fb.w; x += 2) fb.set(x + ((x >> 1) % 2), 43, 0x31);
    for (const [cx, cy] of this.clouds) this.drawCloud(fb, ((cx + this.frame / 60) % 192) - 32, cy);
    // tree: trunk with a branch, layered foliage
    fb.rect(18, 26, 6, GRASS_Y - 22, C.BROWN);
    fb.rect(20, 26, 2, GRASS_Y - 22, C.DIRT);
    fb.rect(23, 40, 6, 2, C.BROWN);
    const crown = [[21, 18, 11], [11, 26, 8], [31, 26, 8], [21, 30, 8]];
    for (const [x, y, r] of crown) fb.disc(x, y, r + 1, C.DARKGREEN);
    for (const [x, y, r] of crown) fb.disc(x, y, r, C.FOREST);
    for (const [x, y, r] of [[18, 15, 6], [9, 23, 4], [29, 23, 4]]) fb.disc(x, y, r, C.GREEN);
    for (const [x, y] of [[16, 12], [8, 21], [27, 21], [22, 17]]) fb.rect(x, y, 2, 2, C.LIME);
  }

  drawForeground(fb) {
    // jagged tall grass, two layers
    for (let x = 0; x < fb.w; x++) {
      const h = 6 + ((x * 7) % 9) + (x % 5 === 0 ? 4 : 0);
      fb.rect(x, GRASS_Y + 6 - h, 1, GROUND_Y - GRASS_Y + h, (x * 3) % 4 ? C.FOREST : C.DARKGREEN);
    }
    for (let x = 1; x < fb.w; x += 2) {
      const h = 3 + ((x * 5) % 7);
      fb.rect(x, GRASS_Y + 8 - h, 1, h, (x * 11) % 3 ? C.GREEN : C.LIME);
    }
    fb.rect(0, GRASS_Y + 8, fb.w, GROUND_Y - GRASS_Y - 8, C.FOREST);
    // dirt
    fb.rect(0, GROUND_Y, fb.w, fb.h - GROUND_Y, C.DIRT);
    fb.rect(0, GROUND_Y, fb.w, 1, C.BROWN);
    for (let i = 0; i < 40; i++) fb.set((i * 37) % fb.w, GROUND_Y + 2 + ((i * 13) % 17), C.BROWN);

    // HUD: three boxes like the original
    const hy = 79;
    const box = (x, w) => {
      fb.rect(x, hy, w, 15, C.BLACK);
      fb.frame(x, hy, w, 15, C.GREEN);
    };
    box(3, 26);
    fb.text(`R${this.round}`, 16, hy + 2, C.LIME, { align: 'center', font: 'small' });
    for (let i = 0; i < 3; i++) {
      const live = i < this.shots && this.state === 'flying';
      fb.rect(7 + i * 7, hy + 8, 3, 5, live ? C.YELLOW : C.DARKGRAY);
      fb.rect(7 + i * 7, hy + 8, 3, 1, live ? C.ORANGE : C.DARKGRAY);
    }
    box(32, 72);
    fb.text('HIT', 36, hy + 5, C.LIME, { font: 'small' });
    for (let i = 0; i < DUCKS_PER_ROUND; i++) {
      const res = this.results[i];
      const current = i === this.duckIndex && this.state !== 'roundEnd';
      let c = res === true ? C.RED : res === false ? C.WHITE : C.DARKGRAY;
      if (current && this.frame % 20 < 10) c = C.YELLOW;
      // tiny duck icon
      const x = 50 + i * 5;
      fb.rect(x, hy + 4, 4, 3, c);
      fb.set(x + 3, hy + 3, c);
    }
    // marker: hits needed to pass
    fb.rect(50 + this.required() * 5 - 1, hy + 9, 1, 3, C.SKYBLUE);
    for (let i = 0; i < DUCKS_PER_ROUND; i++) fb.set(51 + i * 5, hy + 10, i < this.required() ? C.SKYBLUE : C.DARKGRAY);
    box(107, 50);
    fb.text(String(this.score).padStart(6, '0'), 132, hy + 2, C.WHITE, { align: 'center' });
    fb.text('SCORE', 132, hy + 10, C.LIME, { align: 'center', font: 'small' });
  }

  draw(fb) {
    this.drawScene(fb);
    const d = this.duck;
    if (this.state === 'dogShow' || this.state === 'dogLaugh') {
      const t = this.timer;
      const rise = Math.min(30, (this.state === 'dogShow' ? 70 : 90) - t, t);
      const dy = GRASS_Y + 6 - rise;
      if (this.state === 'dogShow') {
        fb.sprite(dogSmile, this.dogX, dy);
        fb.sprite(sprites[d.type].hit, this.dogX + 4, dy - 12);
      } else {
        fb.sprite(Math.floor(this.frame / 6) % 2 ? dogLaugh : dogSmile, this.dogX, dy + (this.frame % 12 < 6 ? 0 : 1));
      }
    }
    if (d && ['flying', 'flyaway', 'hit', 'falling'].includes(this.state)) {
      const s = sprites[d.type];
      let spr = [s.up, s.mid, s.down, s.mid][Math.floor(this.frame / 5) % 4];
      if (this.state === 'hit') spr = s.hit;
      if (this.state === 'falling') spr = s.fall;
      fb.sprite(spr, d.x, d.y, d.vx < 0 && this.state !== 'falling');
    }
    this.drawForeground(fb);

    const banner = (text, y, c = C.WHITE) => fb.text(text, 80, y, c, { align: 'center', outline: C.NAVY });
    if (this.state === 'flyaway') banner('FLY AWAY', 30);
    if (this.state === 'roundIntro') {
      fb.rect(50, 22, 60, 26, C.BLACK);
      fb.frame(51, 23, 58, 24, C.WHITE);
      fb.text('ROUND', 80, 27, C.WHITE, { align: 'center' });
      fb.text(String(this.round), 80, 37, C.YELLOW, { align: 'center' });
    }
    if (this.state === 'roundEnd') {
      const hits = this.results.filter(Boolean).length;
      banner(hits === 10 ? 'PERFECT! +10000' : this.passed ? 'ROUND CLEAR!' : 'MISSED TOO MANY', 24, C.YELLOW);
      banner(`${hits}/${DUCKS_PER_ROUND} HITS`, 36);
    }
    for (const f of this.feathers || []) {
      fb.rect(f.x, f.y, 2, 1, f.c);
      fb.set(f.x + (Math.sin(f.t / 4) > 0 ? 2 : -1), f.y + 1, f.c);
    }
    if (this.popup) fb.text(this.popup.text, this.popup.x, this.popup.y, C.WHITE, { font: 'small', outline: C.NAVY });
    if (this.burst) {
      const { x, y, t } = this.burst;
      const r = (7 - t) * 2;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.4], [0, 1.4], [-1.4, 0], [1.4, 0]])
        fb.rect(x + dx * r, y + dy * r, 2, 2, t > 3 ? C.WHITE : C.YELLOW);
    }
    // crosshair: broken ring with a red centre
    const cx = Math.round(this.cross.x);
    const cy = Math.round(this.cross.y);
    const col = this.state === 'flying' ? C.WHITE : C.SILVER;
    for (let a = 0; a < 32; a++) {
      if (a % 8 === 0) continue;
      const ang = (a / 32) * Math.PI * 2;
      fb.set(cx + Math.round(Math.cos(ang) * 6), cy + Math.round(Math.sin(ang) * 6), col);
    }
    for (let i = 3; i <= 8; i++) {
      if (i === 6) continue;
      fb.set(cx - i, cy, col);
      fb.set(cx + i, cy, col);
      fb.set(cx, cy - i, col);
      fb.set(cx, cy + i, col);
    }
    fb.set(cx, cy, C.RED);
  }
}
