import { C } from '../../core/palette.js';
import { LEVELS } from './levels.js';
import { T, THEMES, coinFrames, drawCastle, drawTile, flag, heroBig, heroBigFlash, heroSmall, mushroom, spiky, walker } from './sprites.js';

const ROWS = 8;
const VIEW_W = 80;
const SOLID = new Set(['#', 'B', '?', 'M', 'U', 'X', '[', ']', '{', '}', 'F']);
const PHYS = { acc: 0.045, dec: 0.06, skid: 0.12, max: 0.78, jump: -2.25, gHold: 0.1, g: 0.32, maxFall: 3 };
const ENEMY_SPEED = { easy: 0.22, normal: 0.3, hard: 0.4 };
const LIVES = { easy: 5, normal: 3, hard: 2 };
const SMALL_H = 6;
const BIG_H = 11;

const overlap = (a, b, m = 1) => a.x + m < b.x + b.w && a.x + a.w - m > b.x && a.y + m < b.y + b.h && a.y + a.h - m > b.y;

export default class PipeRunner {
  static id = 'pipe-runner';
  static title = 'Pipe Runner';
  static short = 'mario';
  static aliases = ['mario', 'super-mario', 'smb', 'platformer', 'runner'];
  static year = 1985;
  static inspiredBy = 'Super Mario Bros. (1985)';
  static description = 'Run, jump, stomp enemies and reach the flag.';
  static controls = '←→ run  ↑/SPACE jump';
  static width = 80;
  static height = 48;

  constructor({ sound, difficulty = 'normal', best = 0 }) {
    this.sound = sound;
    this.best = best;
    this.enemySpeed = ENEMY_SPEED[difficulty] ?? 0.3;
    this.lives = LIVES[difficulty] ?? 3;
    this.score = 0;
    this.coins = 0;
    this.levelIndex = 0;
    this.frame = 0;
    this.loadLevel(false);
  }

  scoreExtra() {
    return { world: LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)].name };
  }

  loadLevel(big) {
    const lvl = LEVELS[this.levelIndex];
    this.level = lvl;
    this.theme = THEMES[lvl.theme];
    this.map = lvl.rows.map((r) => [...r]);
    this.mapW = this.map[0].length;
    this.enemies = [];
    this.items = [];
    this.particles = [];
    this.popups = [];
    this.bumps = new Map();
    this.flagPos = null;
    this.castle = null;
    let start = { tx: 2, ty: 5 };
    this.map.forEach((row, ty) =>
      row.forEach((ch, tx) => {
        if (ch === 'P') start = { tx, ty };
        else if (ch === 'G' || ch === 'S') this.enemies.push(this.makeEnemy(ch === 'G' ? 'walker' : 'spiky', tx, ty));
        else if (ch === 'F') this.flagPos = { tx, ty };
        else if (ch === 'c') this.castle = { tx, ty };
        else return;
        if (ch !== 'F') row[tx] = '.';
      }),
    );
    const h = big ? BIG_H : SMALL_H;
    this.player = { x: start.tx * T + 1, y: (start.ty + 1) * T - h, w: 4, h, vx: 0, vy: 0, onGround: true, facing: 1, big, inv: 0, airTime: 0 };
    this.camX = 0;
    this.time = lvl.time;
    this.timeTick = 0;
    this.jumpBuffer = 0;
    this.flagY = T + 1;
    this.state = 'intro';
    this.timer = 110;
    this.hidden = false;
  }

  makeEnemy(type, tx, ty) {
    const h = type === 'spiky' ? 5 : 6;
    return { type, x: tx * T, y: (ty + 1) * T - h, w: 6, h, vx: -this.enemySpeed, vy: 0, active: false, dead: null, timer: 0 };
  }

  tile(tx, ty) {
    if (ty < 0 || ty >= ROWS) return '.';
    if (tx < 0 || tx >= this.mapW) return 'X';
    return this.map[ty][tx];
  }

  solid(tx, ty) {
    return SOLID.has(this.tile(tx, ty));
  }

  moveX(e) {
    e.x += e.vx;
    const top = Math.floor(e.y / T);
    const bot = Math.floor((e.y + e.h - 0.01) / T);
    if (e.vx > 0) {
      const tx = Math.floor((e.x + e.w - 0.01) / T);
      for (let ty = top; ty <= bot; ty++)
        if (this.solid(tx, ty)) {
          e.x = tx * T - e.w;
          return true;
        }
    } else if (e.vx < 0) {
      const tx = Math.floor(e.x / T);
      for (let ty = top; ty <= bot; ty++)
        if (this.solid(tx, ty)) {
          e.x = (tx + 1) * T;
          return true;
        }
    }
    return false;
  }

  // Returns the tile bumped from below, if any.
  moveY(e) {
    e.y += e.vy;
    e.onGround = false;
    const l = Math.floor(e.x / T);
    const r = Math.floor((e.x + e.w - 0.01) / T);
    if (e.vy > 0) {
      const ty = Math.floor((e.y + e.h) / T);
      for (let tx = l; tx <= r; tx++)
        if (this.solid(tx, ty)) {
          e.y = ty * T - e.h;
          e.vy = 0;
          e.onGround = true;
          return null;
        }
    } else if (e.vy < 0) {
      const ty = Math.floor(e.y / T);
      const hits = [];
      for (let tx = l; tx <= r; tx++) if (this.solid(tx, ty)) hits.push(tx);
      if (hits.length) {
        e.y = (ty + 1) * T;
        e.vy = 0;
        const cx = Math.floor((e.x + e.w / 2) / T);
        return { tx: hits.includes(cx) ? cx : hits[0], ty };
      }
    }
    return null;
  }

  popup(x, y, text) {
    this.popups.push({ x, y, text: String(text), t: 40 });
  }

  addCoin(x, y) {
    this.coins++;
    this.score += 200;
    this.sound.play('coin');
    if (this.coins >= 100) {
      this.coins -= 100;
      this.lives++;
      this.popup(x, y - 6, '1UP');
    }
  }

  bumpTile({ tx, ty }) {
    const ch = this.tile(tx, ty);
    const key = `${tx},${ty}`;
    if (ch === '?') {
      this.map[ty][tx] = 'U';
      this.items.push({ type: 'coinpop', x: tx * T + 1, y: ty * T - 6, vy: -2.2, t: 26 });
      this.addCoin(tx * T, ty * T);
    } else if (ch === 'M') {
      this.map[ty][tx] = 'U';
      this.items.push({ type: 'mushroom', x: tx * T, y: ty * T, w: 6, h: 6, vx: 0, vy: 0, emerge: 30 });
      this.sound.play('bump');
    } else if (ch === 'B' && this.player.big) {
      this.map[ty][tx] = '.';
      this.score += 50;
      this.sound.play('break');
      for (const [vx, vy] of [[-0.6, -2.4], [0.6, -2.4], [-0.5, -1.4], [0.5, -1.4]])
        this.particles.push({ x: tx * T + 3, y: ty * T + 3, vx, vy, t: 60 });
      return this.killEnemiesOn(tx, ty);
    } else {
      this.sound.play('bump');
    }
    this.bumps.set(key, 8);
    this.killEnemiesOn(tx, ty);
  }

  killEnemiesOn(tx, ty) {
    for (const e of this.enemies) {
      if (e.dead || !e.active) continue;
      const onTop = Math.abs(e.y + e.h - ty * T) < 1.5 && e.x + e.w > tx * T && e.x < (tx + 1) * T;
      if (onTop) this.killEnemy(e, 'flip');
    }
  }

  killEnemy(e, how) {
    e.dead = how;
    e.timer = how === 'flat' ? 30 : 0;
    e.vy = how === 'flip' ? -2 : 0;
    this.score += 100;
    this.popup(e.x, e.y - 4, 100);
    this.sound.play('stomp');
  }

  hurt() {
    const p = this.player;
    if (p.inv > 0 || this.state !== 'play') return;
    if (p.big) {
      p.big = false;
      p.y += BIG_H - SMALL_H;
      p.h = SMALL_H;
      p.inv = 120;
      this.sound.play('hurt');
    } else {
      this.die(false);
    }
  }

  die(pit) {
    this.state = 'dying';
    this.timer = pit ? 40 : 0;
    this.player.vy = 0;
    this.player.vx = 0;
    this.sound.play('die');
  }

  update(input) {
    this.frame++;
    for (const [k, v] of this.bumps) v <= 1 ? this.bumps.delete(k) : this.bumps.set(k, v - 1);
    this.updateEffects();
    switch (this.state) {
      case 'intro':
        if (--this.timer <= 0) this.state = 'play';
        return;
      case 'play':
        this.updatePlayer(input);
        this.updateEnemies();
        this.updateItems();
        this.updateClock();
        return;
      case 'grow':
        if (--this.timer <= 0) this.state = 'play';
        return;
      case 'dying':
        return this.updateDying();
      case 'flag':
        return this.updateFlag();
      case 'walk':
        return this.updateWalk();
      case 'tally':
        return this.updateTally();
    }
  }

  updatePlayer(input) {
    const p = this.player;
    const left = input.down('left');
    const right = input.down('right');
    const jumpHeld = input.down('up') || input.down('fire');
    if (input.pressed('up') || input.pressed('fire')) this.jumpBuffer = 6;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;

    if (left && !right) {
      p.vx -= p.vx > 0 ? PHYS.skid : PHYS.acc;
      p.facing = -1;
    } else if (right && !left) {
      p.vx += p.vx < 0 ? PHYS.skid : PHYS.acc;
      p.facing = 1;
    } else {
      const d = p.onGround ? PHYS.dec : PHYS.dec * 0.4;
      p.vx = Math.abs(p.vx) <= d ? 0 : p.vx - Math.sign(p.vx) * d;
    }
    p.vx = Math.max(-PHYS.max, Math.min(PHYS.max, p.vx));

    p.airTime = p.onGround ? 0 : p.airTime + 1;
    if (this.jumpBuffer > 0 && p.airTime < 5 && p.vy >= 0) {
      p.vy = PHYS.jump - Math.abs(p.vx) * 0.25;
      p.airTime = 5;
      this.jumpBuffer = 0;
      this.sound.play('jump');
    }
    p.vy = Math.min(PHYS.maxFall, p.vy + (p.vy < 0 && jumpHeld ? PHYS.gHold : PHYS.g));

    if (this.moveX(p)) p.vx = 0;
    if (p.x < this.camX) {
      p.x = this.camX;
      p.vx = Math.max(0, p.vx);
    }
    const bump = this.moveY(p);
    if (bump) this.bumpTile(bump);
    if (p.inv > 0) p.inv--;

    // collect floating coins
    const l = Math.floor(p.x / T);
    const r = Math.floor((p.x + p.w - 0.01) / T);
    const t = Math.floor(p.y / T);
    const b = Math.floor((p.y + p.h - 0.01) / T);
    for (let ty = t; ty <= b; ty++)
      for (let tx = l; tx <= r; tx++)
        if (this.tile(tx, ty) === 'o') {
          this.map[ty][tx] = '.';
          this.addCoin(tx * T, ty * T);
        }

    const maxCam = this.mapW * T - VIEW_W;
    this.camX = Math.max(this.camX, Math.min(maxCam, p.x - 34));

    if (p.y > ROWS * T + 4) return this.die(true);

    if (this.flagPos) {
      const poleX = this.flagPos.tx * T + 2;
      if (p.x + p.w >= poleX && p.x <= poleX + 2 && p.y + p.h <= this.flagPos.ty * T + 0.5) this.startFlag(poleX);
    }
  }

  startFlag(poleX) {
    const p = this.player;
    const y = p.y + p.h;
    const bonus = y < 14 ? 5000 : y < 20 ? 2000 : y < 26 ? 800 : y < 32 ? 400 : 100;
    this.score += bonus;
    this.popup(poleX + 4, p.y, bonus);
    this.state = 'flag';
    p.vx = 0;
    p.vy = 0;
    p.x = poleX - p.w;
    this.sound.play('flag');
  }

  updateFlag() {
    const p = this.player;
    const base = this.flagPos.ty * T;
    let done = true;
    if (p.y + p.h < base) {
      p.y = Math.min(base - p.h, p.y + 1.2);
      done = false;
    }
    if (this.flagY < base - 6) {
      this.flagY = Math.min(base - 6, this.flagY + 1.2);
      done = false;
    }
    if (done) {
      this.state = 'walk';
      p.x += p.w + 3;
      p.facing = 1;
    }
  }

  updateWalk() {
    const p = this.player;
    p.vx = 0.5;
    p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.g);
    this.moveX(p);
    this.moveY(p);
    const door = this.castle ? (this.castle.tx + 2) * T + 1 : this.mapW * T - 6;
    if (p.x >= door) {
      this.hidden = true;
      this.state = 'tally';
      this.timer = 50;
    }
  }

  updateTally() {
    if (this.time > 0) {
      const step = Math.min(this.time, 3);
      this.time -= step;
      this.score += step * 50;
      if (this.frame % 4 === 0) this.sound.play('select');
      return;
    }
    if (--this.timer > 0) return;
    this.levelIndex++;
    if (this.levelIndex >= LEVELS.length) {
      this.won = true;
      this.gameOver = true;
      return;
    }
    this.loadLevel(this.player.big);
  }

  updateDying() {
    const p = this.player;
    this.timer++;
    if (this.timer === 30) p.vy = -2.6;
    if (this.timer > 30 && p.y < 80) {
      p.vy += 0.12;
      p.y += p.vy;
    }
    if (this.timer > 170) {
      this.lives--;
      if (this.lives <= 0) {
        this.gameOver = true;
        this.timer = 170;
        return;
      }
      this.loadLevel(false);
    }
  }

  updateClock() {
    if (++this.timeTick % 24 === 0) {
      this.time--;
      if (this.time <= 0) this.die(false);
    }
  }

  updateEnemies() {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.active) {
        if (e.x < this.camX + VIEW_W + T) e.active = true;
        else continue;
      }
      if (e.dead === 'flat') {
        e.timer--;
        continue;
      }
      if (e.dead === 'flip') {
        e.vy += 0.15;
        e.y += e.vy;
        continue;
      }
      e.vy = Math.min(3, e.vy + 0.25);
      const vx = e.vx;
      if (this.moveX(e)) e.vx = -vx;
      this.moveY(e);
      for (const o of this.enemies) {
        if (o !== e && !o.dead && o.active && overlap(e, o, 0.5)) {
          e.vx = o.x > e.x ? -Math.abs(e.vx) : Math.abs(e.vx);
        }
      }
      if (overlap(p, e)) {
        const prevBottom = p.y + p.h - p.vy;
        const stomp = e.type === 'walker' && p.vy > 0 && prevBottom <= e.y + 2;
        if (stomp) {
          this.killEnemy(e, 'flat');
          p.vy = -1.8;
          this.jumpBuffer = 0;
        } else this.hurt();
      }
    }
    this.enemies = this.enemies.filter(
      (e) => e.y < ROWS * T + 10 && !(e.dead === 'flat' && e.timer <= 0) && e.x > this.camX - 4 * T,
    );
  }

  updateItems() {
    const p = this.player;
    for (const it of this.items) {
      if (it.type === 'coinpop') {
        it.vy += 0.16;
        it.y += it.vy;
        if (--it.t <= 0) {
          it.gone = true;
          this.popup(it.x, it.y, 200);
        }
      } else if (it.type === 'mushroom') {
        if (it.emerge > 0) {
          it.emerge--;
          it.y -= 0.2;
          if (it.emerge === 0) it.vx = 0.45;
          continue;
        }
        it.vy = Math.min(3, it.vy + 0.25);
        const vx = it.vx;
        if (this.moveX(it)) it.vx = -vx;
        this.moveY(it);
        if (it.y > ROWS * T) it.gone = true;
        if (overlap(p, it, 0)) {
          it.gone = true;
          this.score += 1000;
          this.popup(it.x, it.y - 4, 1000);
          this.sound.play('powerup');
          if (!p.big) {
            p.big = true;
            p.y -= BIG_H - SMALL_H;
            p.h = BIG_H;
            this.state = 'grow';
            this.timer = 40;
          }
        }
      }
    }
    this.items = this.items.filter((i) => !i.gone);
  }

  updateEffects() {
    for (const pt of this.particles) {
      pt.vy += 0.15;
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.t--;
    }
    this.particles = this.particles.filter((pt) => pt.t > 0 && pt.y < 60);
    for (const pp of this.popups) {
      pp.y -= 0.3;
      pp.t--;
    }
    this.popups = this.popups.filter((pp) => pp.t > 0);
  }

  // ---------- drawing ----------

  drawDecor(fb, cx) {
    if (this.level.theme !== 'overworld') return;
    // hills (scroll at full speed, sit on the ground)
    for (let i = 0; i * 96 < this.mapW * T; i++) {
      const hx = i * 96 + 10 - cx;
      const r = i % 2 ? 7 : 11;
      for (let y = -r; y <= 0; y++)
        for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) fb.set(hx + x, 6 * T + y - 1, (x + y) % 5 ? C.FOREST : C.TEAL);
      // bush
      const bx = i * 96 + 58 - cx;
      for (let k = 0; k < 3; k++)
        for (let y = -3; y <= 0; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10) fb.set(bx + k * 5 + x, 6 * T + y - 1, C.GREEN);
    }
    // clouds (parallax)
    const pc = Math.floor(cx * 0.5);
    for (let i = 0; i * 70 < this.mapW * T; i++) {
      const x = i * 70 + 20 - pc;
      const y = 8 + (i % 3) * 4;
      fb.rect(x + 2, y, 8, 2, C.WHITE);
      fb.rect(x, y + 2, 12, 3, C.WHITE);
      fb.rect(x + 1, y + 4, 10, 1, C.PALEBLUE);
    }
  }

  drawHUD(fb) {
    const s = C.BLACK;
    fb.text(String(this.score).padStart(6, '0'), 1, 1, C.WHITE, { shadow: s });
    fb.sprite(coinFrames[Math.floor(this.frame / 12) % 4], 27, 0);
    fb.text(`x${String(this.coins).padStart(2, '0')}`, 32, 1, C.WHITE, { shadow: s });
    fb.text(this.level.name, 52, 1, C.WHITE, { align: 'center', shadow: s });
    fb.text(String(Math.max(0, this.time)).padStart(3, '0'), 78, 1, this.time < 100 && this.frame % 30 < 15 ? C.YELLOW : C.WHITE, {
      align: 'right',
      shadow: s,
    });
  }

  drawIntro(fb) {
    fb.clear(C.BLACK);
    fb.text(`WORLD ${this.level.name}`, 40, 14, C.WHITE, { align: 'center' });
    fb.sprite(heroSmall.stand, 30, 24);
    fb.text(`x ${this.lives}`, 40, 24, C.WHITE);
    fb.text(`SCORE ${this.score}`, 40, 36, C.SILVER, { align: 'center' });
  }

  heroSprite() {
    const p = this.player;
    if (this.state === 'dying') return heroSmall.dead;
    const set = p.big ? (this.state === 'grow' && this.frame % 8 < 4 ? heroBigFlash : heroBig) : heroSmall;
    if (this.state === 'grow' && this.frame % 10 < 5) return heroSmall.stand;
    if (!p.onGround && this.state !== 'flag') return set.jump;
    if (Math.abs(p.vx) > 0.05) return Math.floor(this.frame / (p.vx ? 6 : 8)) % 2 ? set.walk1 : set.walk2;
    return set.stand;
  }

  draw(fb) {
    if (this.state === 'intro') return this.drawIntro(fb);
    const cx = Math.floor(this.camX);
    fb.clear(this.theme.sky);
    this.drawDecor(fb, cx);

    const t0 = Math.floor(cx / T);
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = t0; tx <= t0 + Math.ceil(VIEW_W / T); tx++) {
        const ch = this.tile(tx, ty);
        if (ch === '.') continue;
        const bump = this.bumps.get(`${tx},${ty}`);
        const off = bump ? -Math.round(Math.sin((bump / 8) * Math.PI) * 2) : 0;
        drawTile(fb, ch, tx * T - cx, ty * T + off, this.theme, this.frame);
      }
    }

    if (this.flagPos) {
      const px = this.flagPos.tx * T + 2 - cx;
      fb.rect(px, T, 2, this.flagPos.ty * T - T, C.MINT);
      fb.rect(px - 1, T - 3, 4, 3, C.FOREST);
      fb.sprite(flag, px - 6, this.flagY);
    }
    if (this.castle) drawCastle(fb, this.castle.tx * T - cx, this.castle.ty * T, this.level.theme);

    for (const it of this.items) {
      if (it.type === 'coinpop') fb.sprite(coinFrames[Math.floor(this.frame / 3) % 4], it.x - cx, it.y);
      else if (it.type === 'mushroom') fb.sprite(mushroom, it.x - cx, it.y);
    }

    const ws = walker[this.theme.enemy];
    for (const e of this.enemies) {
      if (!e.active) continue;
      const step = Math.floor(this.frame / 10) % 2;
      if (e.type === 'walker') {
        const spr = e.dead === 'flat' ? ws.flat : step ? ws.a : ws.b;
        if (e.dead === 'flip') {
          const flipped = { ...spr, data: spr.data.slice().reverse() };
          fb.sprite(flipped, e.x - cx, e.y);
        } else fb.sprite(spr, e.x - cx, e.y);
      } else {
        fb.sprite(step ? spiky.a : spiky.b, e.x - cx, e.y, e.vx > 0);
      }
    }

    const p = this.player;
    if (!this.hidden && !(p.inv > 0 && this.frame % 6 < 3)) {
      const spr = this.heroSprite();
      fb.sprite(spr, p.x - 1 - cx, p.y + p.h - spr.h, p.facing < 0);
    }

    for (const pt of this.particles) fb.rect(pt.x - cx, pt.y, 2, 2, this.theme.base);
    for (const pp of this.popups) fb.text(pp.text, pp.x - cx, pp.y, C.WHITE, { shadow: C.BLACK });
    this.drawHUD(fb);
  }
}
