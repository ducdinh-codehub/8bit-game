import { makeSprite } from '../core/framebuffer.js';
import { C } from '../core/palette.js';

const COLS = 25;
const ROWS = 13;
const CELL = 6;
const LEFT = 5; // field origin in pixels; a wall surrounds it
const TOP = 14;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SPEED = { easy: 7, normal: 9, hard: 12 };

const APPLE = makeSprite(['....gGG.', '.RRRgRR.', 'RWRRRRRR', 'RWRRRRRR', 'RRRRRRRD', 'RRRRRRRD', '.RRRRRD.', '..RRDD..'], {
  R: C.RED,
  W: C.SALMON,
  D: C.DARKRED,
  g: C.BROWN,
  G: C.GREEN,
});
const STAR = ['...Y....', '...Y....', '..YWY...', 'YYWYYYYO', '.YYYYYO.', '..YYYO..', '.YYO.YO.', '.YO...O.'];
const GEM = [
  makeSprite(STAR, { Y: C.YELLOW, W: C.WHITE, O: C.ORANGE }),
  makeSprite(STAR, { Y: C.PALEYELLOW, W: C.WHITE, O: C.YELLOW }),
];
// Field: two shades of grass in a checker.
const FIELD = [C.LIME, C.GREEN];

export default class Snake {
  static id = 'snake';
  static title = 'Snake';
  static short = 'snake';
  static aliases = ['snek', 'nokia'];
  static year = 1976;
  static description = 'Eat, grow longer, never bite your own tail.';
  static controls = 'arrows/WASD steer';
  static width = 160;
  static height = 96;

  constructor({ sound, difficulty = 'normal', best = 0 }) {
    this.sound = sound;
    this.wrap = difficulty === 'easy';
    this.speed = SPEED[difficulty] ?? 9;
    this.best = best;
    this.score = 0;
    this.eaten = 0;
    const y = Math.floor(ROWS / 2);
    this.body = [[11, y], [10, y], [9, y], [8, y]];
    this.dir = 'right';
    this.queue = [];
    this.grow = 0;
    this.moveTimer = 0;
    this.ready = 60;
    this.dead = 0;
    this.bonus = null;
    this.frame = 0;
    this.sparks = [];
    this.popups = [];
    this.placeFood();
  }

  occupied(x, y) {
    return this.body.some(([bx, by]) => bx === x && by === y);
  }

  freeCell() {
    for (let tries = 0; tries < 500; tries++) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (!this.occupied(x, y) && !(this.food && this.food[0] === x && this.food[1] === y)) return [x, y];
    }
    return [0, 0];
  }

  placeFood() {
    this.food = null;
    this.food = this.freeCell();
  }

  scoreExtra() {
    return { length: this.body.length };
  }

  burst(x, y, colors, text) {
    const cx = LEFT + x * CELL + CELL / 2;
    const cy = TOP + y * CELL + CELL / 2;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, t: 14, c: colors[i % colors.length] });
    }
    this.popups.push({ x: cx, y: cy - 6, text, t: 30 });
  }

  update(input) {
    this.frame++;
    for (const p of this.sparks) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.t--;
    }
    this.sparks = this.sparks.filter((p) => p.t > 0);
    for (const p of this.popups) {
      p.y -= 0.4;
      p.t--;
    }
    this.popups = this.popups.filter((p) => p.t > 0);
    if (this.dead) {
      if (++this.dead > 90) this.gameOver = true;
      return;
    }
    for (const d of ['up', 'down', 'left', 'right']) {
      if (!input.pressed(d)) continue;
      const lastDir = this.queue.at(-1) ?? this.dir;
      if (d !== lastDir && d !== OPP[lastDir] && this.queue.length < 3) this.queue.push(d);
      this.ready = Math.min(this.ready, 1);
    }
    if (this.ready > 0) {
      this.ready--;
      return;
    }
    if (this.bonus && --this.bonus.ttl <= 0) this.bonus = null;
    this.moveTimer += this.speed / 60;
    while (this.moveTimer >= 1 && !this.dead) {
      this.moveTimer -= 1;
      this.move();
    }
  }

  move() {
    if (this.queue.length) this.dir = this.queue.shift();
    const [dx, dy] = DIRS[this.dir];
    let [x, y] = this.body[0];
    x += dx;
    y += dy;
    if (this.wrap) {
      x = (x + COLS) % COLS;
      y = (y + ROWS) % ROWS;
    } else if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
      return this.die();
    }
    const tailMoves = this.grow === 0;
    const hit = this.body.some(([bx, by], i) => bx === x && by === y && !(tailMoves && i === this.body.length - 1));
    if (hit) return this.die();
    this.body.unshift([x, y]);
    if (this.grow > 0) this.grow--;
    else this.body.pop();

    if (x === this.food[0] && y === this.food[1]) {
      this.eaten++;
      const pts = 10 + Math.floor(this.speed - 7) * 2;
      this.score += pts;
      this.burst(x, y, [C.RED, C.SALMON, C.WHITE], `+${pts}`);
      this.grow += 2;
      this.speed = Math.min(22, this.speed + 0.3);
      this.sound.play('eat');
      this.placeFood();
      if (this.eaten % 5 === 0) {
        const [bx, by] = this.freeCell();
        this.bonus = { x: bx, y: by, ttl: 360 };
      }
    } else if (this.bonus && x === this.bonus.x && y === this.bonus.y) {
      const pts = 50 + Math.ceil(this.bonus.ttl / 6);
      this.score += pts;
      this.burst(x, y, [C.YELLOW, C.WHITE, C.ORANGE], `+${pts}`);
      this.grow += 4;
      this.bonus = null;
      this.sound.play('bonus');
    }
  }

  die() {
    this.dead = 1;
    this.sound.play('die');
  }

  // Direction from segment a to its neighbour b, accounting for wrap.
  side(a, b) {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    if (dx > 1) dx = -1;
    else if (dx < -1) dx = 1;
    if (dy > 1) dy = -1;
    else if (dy < -1) dy = 1;
    return dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
  }

  fieldAt(x, y) {
    return FIELD[((x >> 1) + (y >> 1)) & 1];
  }

  drawField(fb) {
    fb.clear(C.BLACK);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) fb.rect(LEFT + x * CELL, TOP + y * CELL, CELL, CELL, this.fieldAt(x, y));
    // a few grass tufts for texture
    for (let i = 0; i < 24; i++) {
      const x = LEFT + ((i * 53) % (COLS * CELL - 4)) + 1;
      const y = TOP + ((i * 31) % (ROWS * CELL - 4)) + 2;
      fb.set(x, y, C.FOREST);
      fb.set(x + 2, y, C.FOREST);
      fb.set(x + 1, y - 1, C.FOREST);
    }
    // Wall: solid bricks normally, a dashed teal fence when the edges wrap.
    const x1 = LEFT + COLS * CELL;
    const y1 = TOP + ROWS * CELL;
    const wall = (x, y, w, h) => {
      if (this.wrap) {
        fb.rect(x, y, w, h, C.BLACK);
        for (let i = 0; i < Math.max(w, h); i += 6) fb.rect(w > h ? x + i + 2 : x + 1, w > h ? y + 1 : y + i + 2, 2, 2, C.CYAN);
        return;
      }
      fb.rect(x, y, w, h, C.DARKGREEN);
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) if ((xx * 3 + yy * 5) % 7 === 0) fb.set(xx, yy, C.FOREST);
    };
    wall(0, TOP - 4, fb.w, 4);
    fb.rect(LEFT, TOP, COLS * CELL, 1, C.FOREST); // shadow under the top wall
    wall(0, y1, fb.w, fb.h - y1);
    wall(0, TOP, LEFT, ROWS * CELL);
    wall(x1, TOP, fb.w - x1, ROWS * CELL);
  }

  drawSnake(fb) {
    const flash = this.dead && this.dead % 12 < 6;
    const n = this.body.length;
    // Soft shadow one pixel down-right of the whole body.
    for (const [x, y] of this.body) fb.rect(LEFT + x * CELL + 1, TOP + y * CELL + 2, CELL, CELL - 1, C.FOREST);
    // Draw tail first so the head ends up on top.
    for (let i = n - 1; i >= 0; i--) {
      const seg = this.body[i];
      const px = LEFT + seg[0] * CELL;
      const py = TOP + seg[1] * CELL;
      const open = new Set();
      if (i > 0) open.add(this.side(seg, this.body[i - 1]));
      if (i < n - 1) open.add(this.side(seg, this.body[i + 1]));
      const body = flash ? C.WHITE : i === 0 ? C.SKYBLUE : (i >> 1) % 2 ? 0x11 : C.SKYBLUE;
      const edge = flash ? C.SILVER : C.NAVY;
      fb.rect(px, py, CELL, CELL, body);
      if (!open.has('up')) fb.rect(px, py, CELL, 1, edge);
      if (!open.has('down')) fb.rect(px, py + CELL - 1, CELL, 1, edge);
      if (!open.has('left')) fb.rect(px, py, 1, CELL, edge);
      if (!open.has('right')) fb.rect(px + CELL - 1, py, 1, CELL, edge);
      // Round off outer corners.
      const field = this.fieldAt(seg[0], seg[1]);
      const corner = (cx, cy, a, b) => !open.has(a) && !open.has(b) && fb.set(cx, cy, field);
      corner(px, py, 'up', 'left');
      corner(px + CELL - 1, py, 'up', 'right');
      corner(px, py + CELL - 1, 'down', 'left');
      corner(px + CELL - 1, py + CELL - 1, 'down', 'right');
      if (!flash && i > 0 && i % 2 === 1) fb.rect(px + 2, py + 2, 2, 2, C.PALEBLUE); // scale sheen
      if (i === n - 1 && n > 1) {
        // taper the tail: shave the sides perpendicular to its direction
        const d = this.side(seg, this.body[i - 1]);
        const horiz = d === 'left' || d === 'right';
        const tip = d === 'right' ? px : d === 'left' ? px + CELL - 2 : px;
        if (horiz) {
          fb.rect(tip, py, 2, 1, field);
          fb.rect(tip, py + CELL - 1, 2, 1, field);
          fb.rect(tip, py + 1, 2, 1, edge);
          fb.rect(tip, py + CELL - 2, 2, 1, edge);
        } else {
          const ty = d === 'down' ? py : py + CELL - 2;
          fb.rect(px, ty, 1, 2, field);
          fb.rect(px + CELL - 1, ty, 1, 2, field);
          fb.rect(px + 1, ty, 1, 2, edge);
          fb.rect(px + CELL - 2, ty, 1, 2, edge);
        }
      }
    }
    if (flash) return;
    // Eyes and a flicking tongue on the head.
    const [hx, hy] = this.body[0];
    const px = LEFT + hx * CELL;
    const py = TOP + hy * CELL;
    const [dx, dy] = DIRS[this.dir];
    // Two 2x2 eyes on the leading side, pupils looking forward.
    const eyes = dx ? [[dx > 0 ? 3 : 1, 0], [dx > 0 ? 3 : 1, 4]] : [[0, dy > 0 ? 3 : 1], [4, dy > 0 ? 3 : 1]];
    for (const [ex, ey] of eyes) {
      fb.rect(px + ex, py + ey, 2, 2, C.WHITE);
      fb.set(px + ex + (dx > 0 ? 1 : 0), py + ey + (dy > 0 ? 1 : 0), C.BLACK);
    }
    if (this.frame % 40 < 8) {
      const tx = px + (dx > 0 ? CELL : dx < 0 ? -2 : 2);
      const ty = py + (dy > 0 ? CELL : dy < 0 ? -2 : 2);
      fb.rect(tx, ty, 2, 2, C.RED);
    }
  }

  draw(fb) {
    this.drawField(fb);

    // HUD
    fb.rect(0, 0, fb.w, TOP - 4, C.BLACK);
    fb.text('SCORE', 3, 3, C.SILVER, { font: 'small' });
    fb.text(String(this.score).padStart(5, '0'), 25, 1, C.WHITE);
    fb.sprite(APPLE, 69, 1);
    fb.text(`x${String(this.eaten).padStart(2, '0')}`, 79, 1, C.WHITE);
    fb.text('HI', 119, 3, C.SILVER, { font: 'small' });
    fb.text(String(Math.max(this.best, this.score)).padStart(5, '0'), 157, 1, C.YELLOW, { align: 'right' });

    const [fx, fy] = this.food;
    const bob = this.frame % 40 < 20 ? 0 : 1;
    fb.rect(LEFT + fx * CELL, TOP + fy * CELL + 6, 7, 2, C.FOREST);
    fb.sprite(APPLE, LEFT + fx * CELL - 1, TOP + fy * CELL - 1 - bob);
    if (this.bonus && (this.bonus.ttl > 90 || this.frame % 10 < 6)) {
      fb.sprite(GEM[Math.floor(this.frame / 8) % 2], LEFT + this.bonus.x * CELL - 1, TOP + this.bonus.y * CELL - 1);
    }

    this.drawSnake(fb);
    for (const p of this.sparks) fb.rect(p.x, p.y, p.t > 7 ? 2 : 1, p.t > 7 ? 2 : 1, p.c);
    for (const p of this.popups) fb.text(p.text, p.x, p.y, C.WHITE, { align: 'center', font: 'small', outline: C.BLACK });

    if (this.ready > 0 && this.ready % 20 < 14)
      fb.text('READY?', fb.w / 2, 44, C.YELLOW, { align: 'center', outline: C.BLACK, scale: 2 });
  }
}
