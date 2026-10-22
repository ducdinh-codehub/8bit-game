import { makeSprite } from '../core/framebuffer.js';
import { C } from '../core/palette.js';

const GRASS_Y = 31;
const GROUND_Y = 38;
const DUCKS_PER_ROUND = 10;

const DUCK_UP = ['..ww....', '..www.GG', '...wwGKY', '.BBBBWW.', 'BBBBBBB.', '.BBBBB..'];
const DUCK_DOWN = ['......GG', '.....GKY', '.BBBBWW.', 'BBBBBBB.', '.BwwwB..', '..www...'];
const DUCK_HIT = ['.GGGG.', 'GWGGWG', '.GYYG.', 'BBWWBB', '.BBBB.', '..BB..'];
const DOG = [
  '.BB....BB.',
  'BBTTTTTTBB',
  '.TWKTTKWT.',
  '.TTTTTTTT.',
  '..TTNNTT..',
  '..TTNNTT..',
  '.TTMMMMTT.',
  '..TTTTTT..',
  '.TTTTTTTT.',
];
const DOG_SMILE = DOG.map((r, i) => (i === 6 ? '.TTTTTTTT.' : r));

const DUCK_TYPES = [
  { body: C.BROWN, wing: C.SKIN, speed: 0.55, points: 500 },
  { body: C.BLUE, wing: C.PALEBLUE, speed: 0.7, points: 1000 },
  { body: C.RED, wing: C.SALMON, speed: 0.85, points: 1500 },
];

const sprites = DUCK_TYPES.map((t) => {
  const pal = { G: C.FOREST, K: C.BLACK, Y: C.ORANGE, W: C.WHITE, B: t.body, w: t.wing };
  return {
    up: makeSprite(DUCK_UP, pal),
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
  static width = 80;
  static height = 48;
  static mouse = true;

  constructor({ sound, difficulty = 'normal', best = 0 }) {
    this.sound = sound;
    this.speedMul = SPEED[difficulty] ?? 1;
    this.best = best;
    this.score = 0;
    this.round = 1;
    this.frame = 0;
    this.cross = { x: 40, y: 18 };
    this.pointer = null;
    this.clicks = [];
    this.lastPointer = null;
    this.clouds = [
      [6, 6],
      [44, 3],
      [64, 11],
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
      x: 10 + Math.random() * 60,
      y: GRASS_Y - 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      type: typeIdx,
      t: 0,
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
    this.dogX = hit ? Math.max(4, Math.min(66, this.duck.x)) : 35;
    if (!hit) this.sound.play('laugh');
  }

  aim(input) {
    const p = this.pointer;
    if (p && p.x >= 0 && (!this.lastPointer || p.x !== this.lastPointer.x || p.y !== this.lastPointer.y)) {
      this.cross.x = p.x;
      this.cross.y = p.y;
      this.lastPointer = { ...p };
    }
    const sp = 1.4;
    if (input.down('left')) this.cross.x -= sp;
    if (input.down('right')) this.cross.x += sp;
    if (input.down('up')) this.cross.y -= sp;
    if (input.down('down')) this.cross.y += sp;
    this.cross.x = Math.max(0, Math.min(79, this.cross.x));
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
    if (x >= d.x - 1.5 && x <= d.x + spr.w + 0.5 && y >= d.y - 1.5 && y <= d.y + spr.h + 0.5) {
      this.state = 'hit';
      this.timer = 30;
      const pts = DUCK_TYPES[d.type].points * Math.ceil(this.round / 2);
      this.score += pts;
      this.popup = { x: d.x, y: d.y - 6, text: String(pts), t: 60 };
      this.sound.play('fall');
    } else if (this.shots === 0) {
      this.flyAway();
    }
  }

  flyAway() {
    this.state = 'flyaway';
    this.duck.vx = 0;
    this.duck.vy = -1.2;
  }

  update(input) {
    this.frame++;
    if (this.burst && --this.burst.t <= 0) this.burst = null;
    if (this.popup && --this.popup.t <= 0) this.popup = null;
    for (const s of this.aim(input)) this.shoot(s.x, s.y);
    const d = this.duck;

    switch (this.state) {
      case 'roundIntro':
        if (--this.timer <= 0) this.spawnDuck();
        break;
      case 'flying': {
        d.t++;
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > 72) d.vx = d.x < 0 ? Math.abs(d.vx) : -Math.abs(d.vx);
        if (d.y < 1) d.vy = Math.abs(d.vy);
        if (d.y > GRASS_Y - 8 && d.t > 40) d.vy = -Math.abs(d.vy);
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
        d.y += 1.3;
        if (d.y > GRASS_Y) this.endDuck(true);
        break;
      case 'flyaway':
        d.y += d.vy;
        if (d.y < -10) this.endDuck(false);
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
    fb.rect(x + 2, y, 8, 2, C.WHITE);
    fb.rect(x, y + 2, 13, 3, C.WHITE);
    fb.rect(x + 4, y - 1, 4, 1, C.WHITE);
    fb.rect(x, y + 4, 13, 1, C.PALEBLUE);
  }

  drawScene(fb) {
    fb.clear(C.SKYBLUE);
    for (const [cx, cy] of this.clouds) this.drawCloud(fb, (cx + this.frame / 120) % 92 - 12, cy);
    // tree
    fb.rect(9, 12, 3, GRASS_Y - 12, C.BROWN);
    fb.rect(10, 12, 1, GRASS_Y - 12, C.DIRT);
    for (const [x, y, r] of [[10, 9, 5], [6, 13, 4], [14, 13, 4], [10, 15, 4]]) {
      for (let yy = -r; yy <= r; yy++)
        for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) fb.set(x + xx, y + yy, (xx + yy) % 3 ? C.FOREST : C.TEAL);
    }
  }

  drawForeground(fb) {
    // jagged tall grass
    for (let x = 0; x < fb.w; x++) {
      const h = 3 + ((x * 7) % 5) + (x % 3 === 0 ? 2 : 0);
      fb.rect(x, GRASS_Y - h + 4, 1, GROUND_Y - GRASS_Y + h, x % 2 ? C.GREEN : C.LIME);
    }
    fb.rect(0, GRASS_Y + 3, fb.w, GROUND_Y - GRASS_Y - 3, C.FOREST);
    fb.rect(0, GROUND_Y, fb.w, fb.h - GROUND_Y, C.DIRT);
    fb.rect(0, GROUND_Y, fb.w, 1, C.BROWN);

    // HUD
    const hy = 41;
    fb.text(`R${this.round}`, 1, hy, C.WHITE);
    for (let i = 0; i < 3; i++) fb.rect(11 + i * 3, hy, 2, 5, i < this.shots && this.state === 'flying' ? C.YELLOW : C.BROWN);
    for (let i = 0; i < DUCKS_PER_ROUND; i++) {
      const res = this.results[i];
      const current = i === this.duckIndex && this.state !== 'roundEnd';
      let c = res === true ? C.RED : res === false ? C.WHITE : C.BROWN;
      if (current && this.frame % 20 < 10) c = C.YELLOW;
      fb.rect(22 + i * 3, hy + 1, 2, 3, c);
    }
    fb.rect(22 + this.required() * 3 - 1, hy + 4, 1, 1, C.SKY);
    fb.text(String(this.score).padStart(6, '0'), 78, hy, C.WHITE, { align: 'right' });
  }

  draw(fb) {
    this.drawScene(fb);
    const d = this.duck;
    if (d && ['flying', 'flyaway', 'hit', 'falling'].includes(this.state)) {
      const s = sprites[d.type];
      let spr = Math.floor(this.frame / 8) % 2 ? s.up : s.down;
      if (this.state === 'hit') spr = s.hit;
      if (this.state === 'falling') spr = s.fall;
      fb.sprite(spr, d.x, d.y, d.vx < 0 && this.state !== 'falling');
    }
    if (this.state === 'dogShow' || this.state === 'dogLaugh') {
      const t = this.timer;
      const rise = Math.min(10, (this.state === 'dogShow' ? 70 : 90) - t, t);
      const dy = GRASS_Y + 2 - rise;
      if (this.state === 'dogShow') {
        fb.sprite(dogSmile, this.dogX, dy);
        fb.sprite(sprites[d.type].hit, this.dogX + 2, dy - 6);
      } else {
        fb.sprite(Math.floor(this.frame / 6) % 2 ? dogLaugh : dogSmile, this.dogX, dy + (this.frame % 12 < 6 ? 0 : 1));
      }
    }
    this.drawForeground(fb);

    if (this.state === 'flyaway') fb.text('FLY AWAY', 40, 14, C.WHITE, { align: 'center', shadow: C.NAVY });
    if (this.state === 'roundIntro') fb.text(`ROUND ${this.round}`, 40, 14, C.WHITE, { align: 'center', shadow: C.NAVY });
    if (this.state === 'roundEnd') {
      const hits = this.results.filter(Boolean).length;
      fb.text(hits === 10 ? 'PERFECT! +10000' : this.passed ? 'ROUND CLEAR!' : 'MISSED TOO MANY', 40, 12, C.YELLOW, { align: 'center', shadow: C.NAVY });
      fb.text(`${hits}/${DUCKS_PER_ROUND} HITS`, 40, 19, C.WHITE, { align: 'center', shadow: C.NAVY });
    }
    if (this.popup) fb.text(this.popup.text, this.popup.x, this.popup.y, C.WHITE, { shadow: C.NAVY });
    if (this.burst) {
      const { x, y, t } = this.burst;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fb.set(x + dx * (7 - t), y + dy * (7 - t), C.YELLOW);
    }
    // crosshair
    const cx = Math.round(this.cross.x);
    const cy = Math.round(this.cross.y);
    const col = this.state === 'flying' ? C.WHITE : C.SILVER;
    for (let i = 2; i <= 4; i++) {
      fb.set(cx - i, cy, col);
      fb.set(cx + i, cy, col);
      fb.set(cx, cy - i, col);
      fb.set(cx, cy + i, col);
    }
    fb.set(cx, cy, C.RED);
  }
}
