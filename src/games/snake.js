import { C } from '../core/palette.js';

const COLS = 40;
const ROWS = 21;
const CELL = 2;
const TOP = 6;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SPEED = { easy: 7, normal: 9, hard: 12 };

export default class Snake {
  static id = 'snake';
  static title = 'Snake';
  static short = 'snake';
  static aliases = ['snek', 'nokia'];
  static year = 1976;
  static description = 'Eat, grow longer, never bite your own tail.';
  static controls = 'arrows/WASD steer';
  static width = 80;
  static height = 48;

  constructor({ sound, difficulty = 'normal', best = 0 }) {
    this.sound = sound;
    this.wrap = difficulty === 'easy';
    this.speed = SPEED[difficulty] ?? 9;
    this.best = best;
    this.score = 0;
    this.eaten = 0;
    const y = Math.floor(ROWS / 2);
    this.body = [[12, y], [11, y], [10, y], [9, y]];
    this.dir = 'right';
    this.queue = [];
    this.grow = 0;
    this.moveTimer = 0;
    this.ready = 60;
    this.dead = 0;
    this.bonus = null;
    this.frame = 0;
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

  update(input) {
    this.frame++;
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
      this.score += 10 + Math.floor(this.speed - 7) * 2;
      this.grow += 2;
      this.speed = Math.min(22, this.speed + 0.3);
      this.sound.play('eat');
      this.placeFood();
      if (this.eaten % 5 === 0) {
        const [bx, by] = this.freeCell();
        this.bonus = { x: bx, y: by, ttl: 360 };
      }
    } else if (this.bonus && x === this.bonus.x && y === this.bonus.y) {
      this.score += 50 + Math.ceil(this.bonus.ttl / 6);
      this.grow += 4;
      this.bonus = null;
      this.sound.play('bonus');
    }
  }

  die() {
    this.dead = 1;
    this.sound.play('die');
  }

  cell(fb, x, y, c) {
    fb.rect(x * CELL, TOP + y * CELL, CELL, CELL, c);
  }

  draw(fb) {
    fb.clear(C.BLACK);
    // HUD
    fb.rect(0, 0, fb.w, TOP - 1, C.NAVY);
    fb.rect(0, TOP - 1, fb.w, 1, this.wrap ? C.TEAL : C.FOREST);
    fb.text(`SCORE ${String(this.score).padStart(4, '0')}`, 1, 0, C.WHITE);
    fb.text(`HI ${String(Math.max(this.best, this.score)).padStart(4, '0')}`, fb.w - 2, 0, C.YELLOW, { align: 'right' });

    // subtle board dots
    for (let y = 1; y < ROWS; y += 4) for (let x = 2; x < COLS; x += 4) fb.set(x * CELL, TOP + y * CELL, C.DARKGRAY);

    // food: apple with highlight
    const [fx, fy] = this.food;
    this.cell(fb, fx, fy, C.RED);
    fb.set(fx * CELL, TOP + fy * CELL, C.SALMON);
    if (this.bonus && (this.bonus.ttl > 90 || this.frame % 10 < 6)) {
      this.cell(fb, this.bonus.x, this.bonus.y, this.frame % 20 < 10 ? C.YELLOW : C.ORANGE);
    }

    const flash = this.dead && this.dead % 12 < 6;
    this.body.forEach(([x, y], i) => {
      const c = flash ? C.WHITE : i === 0 ? C.MINT : i % 2 ? C.GREEN : C.LIME;
      this.cell(fb, x, y, c);
    });
    // eye
    if (!flash) {
      const [hx, hy] = this.body[0];
      const [dx, dy] = DIRS[this.dir];
      const ex = hx * CELL + (dx > 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) * 0;
      const ey = TOP + hy * CELL + (dy > 0 ? 1 : 0);
      fb.set(ex, ey, C.BLACK);
    }
    if (this.ready > 0 && this.ready % 20 < 14) fb.text('READY?', fb.w / 2, 24, C.YELLOW, { align: 'center', shadow: C.BROWN });
  }
}
