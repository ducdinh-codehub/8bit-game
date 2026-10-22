import { C } from '../core/palette.js';

const W = 10;
const H = 22; // 2 hidden rows on top
const HIDDEN = 2;
const CELL = 4;
const BX = 60;
const BY = 10;

const SHAPES = {
  I: ['....', '####', '....', '....'],
  J: ['#..', '###', '...'],
  L: ['..#', '###', '...'],
  O: ['##', '##'],
  S: ['.##', '##.', '...'],
  T: ['.#.', '###', '...'],
  Z: ['##.', '.##', '...'],
};
// [base, light, dark] per piece.
const COLORS = {
  I: [C.CYAN, C.PALECYAN, C.STEEL],
  J: [C.BLUE, C.PALEBLUE, C.NAVY],
  L: [C.ORANGE, C.SKIN, C.BROWN],
  O: [C.YELLOW, C.PALEYELLOW, C.OLIVE],
  S: [C.GREEN, C.MINT, C.FOREST],
  T: [C.MAGENTA, 0x34, C.PURPLE],
  Z: [C.RED, C.SALMON, C.DARKRED],
};
// Bevelled 4x4 block: l = light edge, b = base, d = dark edge, w = glint.
const BLOCK = ['lllb', 'lwbd', 'lbbd', 'bddd'];

function rotateCW(m) {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}

// Precompute 4 rotation states as lists of [x, y] cells.
const STATES = Object.fromEntries(
  Object.entries(SHAPES).map(([k, rows]) => {
    let m = rows.map((r) => [...r].map((c) => c === '#'));
    const states = [];
    for (let r = 0; r < 4; r++) {
      const cells = [];
      m.forEach((row, y) => row.forEach((v, x) => v && cells.push([x, y])));
      states.push(cells);
      m = rotateCW(m);
    }
    return [k, states];
  }),
);

// SRS kick tables (y down). Key: `${from}${to}`.
const flip = (t) => t.map(([x, y]) => [x, -y]);
const JLSTZ = {
  '01': flip([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  '10': flip([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  '12': flip([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  '21': flip([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  '23': flip([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
  '32': flip([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  '30': flip([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  '03': flip([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
};
const IKICK = {
  '01': flip([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  '10': flip([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  '12': flip([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
  '21': flip([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  '23': flip([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  '32': flip([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  '30': flip([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  '03': flip([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
};

const GRAVITY = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3];
const gravityFor = (level) => (level < GRAVITY.length ? GRAVITY[level] : level < 29 ? 2 : 1);
const LINE_SCORES = [0, 40, 100, 300, 1200];
const START_LEVEL = { easy: 0, normal: 3, hard: 7 };
const LOCK_DELAY = 30;
const MAX_RESETS = 15;

export default class Blockfall {
  static id = 'blockfall';
  static title = 'Blockfall';
  static short = 'tetris';
  static aliases = ['tetris', 'blocks', 'tetromino'];
  static year = 1984;
  static inspiredBy = 'Tetris (1984)';
  static description = 'Stack falling tetrominoes and clear lines.';
  static controls = '←→ move ↑/X rotate Z ccw ↓ soft SPACE drop C hold';
  static width = 160;
  static height = 96;

  constructor({ sound, difficulty = 'normal', best = 0 }) {
    this.sound = sound;
    this.best = best;
    this.board = Array.from({ length: H }, () => new Array(W).fill(null));
    this.startLevel = START_LEVEL[difficulty] ?? 3;
    this.level = this.startLevel;
    this.lines = 0;
    this.score = 0;
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.holdUsed = false;
    this.clearing = null;
    this.topOut = 0;
    this.flash = null; // cells that just locked, drawn bright for a few frames
    this.trail = null; // hard-drop streaks
    this.sparks = [];
    this.bigFlash = 0; // 4-line clear
    this.frame = 0;
    this.fillQueue();
    this.spawn();
  }

  scoreExtra() {
    return { lines: this.lines, level: this.level };
  }

  fillQueue() {
    while (this.queue.length < 4) {
      if (!this.bag.length) {
        this.bag = Object.keys(SHAPES);
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  spawn(type) {
    if (!type) {
      type = this.queue.shift();
      this.fillQueue();
    }
    const size = SHAPES[type].length;
    this.piece = { type, rot: 0, x: Math.floor((W - size) / 2), y: type === 'I' ? 0 : 1 };
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (this.collides(this.piece)) {
      this.topOut = 1;
      this.sound.play('die');
    }
  }

  cells(p) {
    return STATES[p.type][p.rot].map(([x, y]) => [p.x + x, p.y + y]);
  }

  collides(p) {
    return this.cells(p).some(([x, y]) => x < 0 || x >= W || y >= H || (y >= 0 && this.board[y][x]));
  }

  tryMove(dx, dy) {
    const p = { ...this.piece, x: this.piece.x + dx, y: this.piece.y + dy };
    if (this.collides(p)) return false;
    this.piece = p;
    this.onMoved();
    return true;
  }

  tryRotate(dir) {
    const p = this.piece;
    if (p.type === 'O') return;
    const to = (p.rot + dir + 4) % 4;
    const kicks = (p.type === 'I' ? IKICK : JLSTZ)[`${p.rot}${to}`];
    for (const [kx, ky] of kicks) {
      const np = { ...p, rot: to, x: p.x + kx, y: p.y + ky };
      if (!this.collides(np)) {
        this.piece = np;
        this.onMoved();
        this.sound.play('rotate');
        return;
      }
    }
  }

  onMoved() {
    if (this.grounded() && this.lockResets < MAX_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  grounded() {
    return this.collides({ ...this.piece, y: this.piece.y + 1 });
  }

  ghostY() {
    let y = this.piece.y;
    while (!this.collides({ ...this.piece, y: y + 1 })) y++;
    return y;
  }

  lock() {
    const cells = this.cells(this.piece);
    for (const [x, y] of cells) if (y >= 0) this.board[y][x] = this.piece.type;
    this.flash = { cells, t: 8 };
    this.holdUsed = false;
    const full = [];
    this.board.forEach((row, y) => row.every(Boolean) && full.push(y));
    if (full.length) {
      this.clearing = { rows: full, t: 0 };
      if (full.length === 4) this.bigFlash = 24;
      for (const y of full)
        for (let i = 0; i < 6; i++)
          this.sparks.push({ x: BX + Math.random() * W * CELL, y: BY + (y - HIDDEN) * CELL + 2, vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 1.5 - 0.3, t: 20 + Math.random() * 15 });
      this.sound.play(full.length === 4 ? 'tetris' : 'line');
      this.piece = null;
    } else {
      this.sound.play('drop');
      this.spawn();
    }
  }

  finishClear() {
    const n = this.clearing.rows.length;
    this.board = this.board.filter((_, y) => !this.clearing.rows.includes(y));
    while (this.board.length < H) this.board.unshift(new Array(W).fill(null));
    this.score += LINE_SCORES[n] * (this.level + 1);
    const prevLevel = this.level;
    this.lines += n;
    this.level = Math.max(this.startLevel, Math.floor(this.lines / 10));
    if (this.level > prevLevel) this.sound.play('levelup');
    this.clearing = null;
    this.spawn();
  }

  update(input) {
    this.frame++;
    if (this.flash && --this.flash.t <= 0) this.flash = null;
    if (this.trail && --this.trail.t <= 0) this.trail = null;
    if (this.bigFlash > 0) this.bigFlash--;
    for (const p of this.sparks) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.t--;
    }
    this.sparks = this.sparks.filter((p) => p.t > 0);
    if (this.topOut) {
      if (++this.topOut > H * 3 + 30) this.gameOver = true;
      return;
    }
    if (this.clearing) {
      if (++this.clearing.t >= 20) this.finishClear();
      return;
    }
    const k = (...names) => names.some((n) => input.keyPressed(n));

    if (k('c', 'shift') && !this.holdUsed) {
      const cur = this.piece.type;
      if (this.hold) this.spawn(this.hold);
      else this.spawn();
      this.hold = cur;
      this.holdUsed = true;
      this.sound.play('select');
      return;
    }
    if (input.pressed('left') && this.tryMove(-1, 0)) this.sound.play('move');
    if (input.pressed('right') && this.tryMove(1, 0)) this.sound.play('move');
    if (k('up', 'w', 'x', 'k')) this.tryRotate(1);
    if (k('z', 'j')) this.tryRotate(-1);
    if (k('space')) {
      const y = this.ghostY();
      if (y > this.piece.y) this.trail = { cells: this.cells(this.piece), dy: y - this.piece.y, type: this.piece.type, t: 6 };
      this.score += (y - this.piece.y) * 2;
      this.piece.y = y;
      return this.lock();
    }
    if (input.pressed('down')) {
      if (this.tryMove(0, 1)) {
        this.score += 1;
        this.gravityTimer = 0;
      }
    }

    if (this.grounded()) {
      if (++this.lockTimer >= LOCK_DELAY) this.lock();
    } else if (++this.gravityTimer >= gravityFor(this.level)) {
      this.gravityTimer = 0;
      this.tryMove(0, 1);
    }
  }

  block(fb, px, py, type, ghost = false, size = CELL) {
    const [b, l, d] = COLORS[type];
    if (ghost) {
      fb.frame(px, py, size, size, b);
      fb.rect(px + 1, py + 1, size - 2, size - 2, C.BLACK);
      return;
    }
    if (size !== CELL) {
      fb.rect(px, py, size, size, b);
      fb.rect(px, py, size, 1, l);
      fb.rect(px, py + size - 1, size, 1, d);
      return;
    }
    const pal = { l, b, d, w: C.WHITE };
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) fb.set(px + x, py + y, pal[BLOCK[y][x]]);
  }

  preview(fb, type, cx, cy, size = CELL) {
    const cells = STATES[type][0];
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
    for (const [x, y] of cells) {
      const px = Math.round(cx - w / 2) + (x - Math.min(...xs)) * size;
      const py = Math.round(cy - h / 2) + (y - Math.min(...ys)) * size;
      this.block(fb, px, py, type, false, size);
    }
  }

  panel(fb, x, y, w, h, label, dim = false) {
    fb.rect(x + 2, y + 2, w, h, C.BLACK);
    fb.rect(x, y, w, h, C.BLACK);
    fb.frame(x, y, w, h, C.SILVER);
    fb.frame(x + 1, y + 1, w - 2, h - 2, C.GRAY);
    if (label) {
      const lw = label.length * 4 + 3;
      fb.rect(x + (w - lw) / 2, y - 2, lw, 7, C.BLACK);
      fb.text(label, x + w / 2, y - 1, dim ? C.GRAY : C.SKYBLUE, { align: 'center', font: 'small' });
    }
  }

  draw(fb) {
    // Backdrop: navy with a faint diagonal weave.
    fb.clear(this.bigFlash && this.bigFlash % 6 < 3 ? C.PURPLE : C.NAVY);
    for (let y = 0; y < fb.h; y++) for (let x = (y * 3) % 8; x < fb.w; x += 8) fb.set(x, y, 0x02);
    for (let y = 0; y < fb.h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < fb.w; x += 8) fb.set(x, y, C.PURPLE);

    // well
    const bw = W * CELL;
    const bh = (H - HIDDEN) * CELL;
    fb.rect(BX - 2, BY - 2, bw + 6, bh + 6, C.BLACK);
    fb.rect(BX - 3, BY - 3, bw + 6, bh + 6, C.GRAY);
    fb.frame(BX - 3, BY - 3, bw + 6, bh + 6, C.SILVER);
    fb.frame(BX - 1, BY - 1, bw + 2, bh + 2, C.DARKGRAY);
    fb.rect(BX, BY, bw, bh, C.BLACK);
    for (let y = 1; y < H - HIDDEN; y++) for (let x = 1; x < W; x++) fb.set(BX + x * CELL - 1, BY + y * CELL - 1, C.DARKGRAY);

    // Clearing rows wipe out from the middle, two columns every 4 frames.
    const wiped = this.clearing ? Math.min(5, Math.floor(this.clearing.t / 4) + 1) : 0;
    for (let y = HIDDEN; y < H; y++) {
      const clearingRow = this.clearing?.rows.includes(y);
      const topped = this.topOut && H - y <= this.topOut / 3;
      for (let x = 0; x < W; x++) {
        const px = BX + x * CELL;
        const py = BY + (y - HIDDEN) * CELL;
        if (topped) {
          fb.rect(px, py, CELL, CELL, C.GRAY);
          fb.rect(px, py, CELL - 1, 1, C.LIGHTGRAY);
        } else if (clearingRow) {
          if (Math.abs(x - 4.5) < wiped) fb.rect(px, py, CELL, CELL, Math.abs(x - 4.5) > wiped - 1 ? C.WHITE : C.BLACK);
          else this.block(fb, px, py, this.board[y][x]);
        }
        else if (this.board[y][x]) this.block(fb, px, py, this.board[y][x]);
      }
    }
    if (this.trail) {
      const [b, l] = COLORS[this.trail.type];
      for (const [x, y] of this.trail.cells) {
        const top = Math.max(y, HIDDEN);
        const h = (y + this.trail.dy - top) * CELL;
        if (h <= 0) continue;
        for (let i = 0; i < h; i += 2) fb.set(BX + x * CELL + 1 + (i % 4 ? 1 : 0), BY + (top - HIDDEN) * CELL + i, this.trail.t > 3 ? l : b);
      }
    }
    if (this.flash) {
      for (const [x, y] of this.flash.cells)
        if (y >= HIDDEN && this.board[y][x]) {
          const px = BX + x * CELL;
          const py = BY + (y - HIDDEN) * CELL;
          if (this.flash.t > 4) fb.rect(px, py, CELL, CELL, C.WHITE);
          else fb.rect(px, py, CELL, 1, C.WHITE);
        }
    }
    for (const p of this.sparks) fb.set(p.x, p.y, p.t > 12 ? C.WHITE : C.YELLOW);
    if (this.piece && !this.topOut) {
      const gy = this.ghostY();
      for (const [x, y] of this.cells({ ...this.piece, y: gy }))
        if (y >= HIDDEN) this.block(fb, BX + x * CELL, BY + (y - HIDDEN) * CELL, this.piece.type, true);
      for (const [x, y] of this.cells(this.piece))
        if (y >= HIDDEN) this.block(fb, BX + x * CELL, BY + (y - HIDDEN) * CELL, this.piece.type);
    }

    // left column
    this.panel(fb, 4, 10, 48, 18, 'SCORE');
    fb.text(String(this.score).padStart(6, '0'), 28, 16, C.WHITE, { align: 'center' });
    this.panel(fb, 4, 34, 48, 18, 'BEST');
    fb.text(String(Math.max(this.best, this.score)).padStart(6, '0'), 28, 40, C.YELLOW, { align: 'center' });
    this.panel(fb, 4, 58, 22, 18, 'LV');
    fb.text(String(this.level).padStart(2, '0'), 15, 64, C.MINT, { align: 'center' });
    this.panel(fb, 30, 58, 22, 18, 'LINE');
    fb.text(String(this.lines).padStart(3, '0'), 41, 64, C.WHITE, { align: 'center' });
    fb.text('BLOCKFALL', 28, 84, C.YELLOW, { align: 'center', font: 'small', shadow: C.BLACK });

    // right column
    this.panel(fb, 108, 10, 48, 48, 'NEXT');
    this.preview(fb, this.queue[0], 132, 20);
    fb.rect(112, 29, 40, 1, C.DARKGRAY);
    this.preview(fb, this.queue[1], 132, 37);
    this.preview(fb, this.queue[2], 132, 50);
    this.panel(fb, 108, 64, 48, 26, 'HOLD', this.holdUsed);
    if (this.hold) this.preview(fb, this.hold, 132, 78);
  }
}
