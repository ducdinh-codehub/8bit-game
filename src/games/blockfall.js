import { C } from '../core/palette.js';

const W = 10;
const H = 22; // 2 hidden rows on top
const HIDDEN = 2;
const CELL = 2;
const BX = 30;
const BY = 7;

const SHAPES = {
  I: ['....', '####', '....', '....'],
  J: ['#..', '###', '...'],
  L: ['..#', '###', '...'],
  O: ['##', '##'],
  S: ['.##', '##.', '...'],
  T: ['.#.', '###', '...'],
  Z: ['##.', '.##', '...'],
};
const COLORS = {
  I: [C.CYAN, C.PALECYAN],
  J: [C.BLUE, C.PALEBLUE],
  L: [C.ORANGE, C.SKIN],
  O: [C.YELLOW, C.PALEYELLOW],
  S: [C.GREEN, C.MINT],
  T: [C.MAGENTA, 0x34],
  Z: [C.RED, C.SALMON],
};

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
  static width = 80;
  static height = 48;

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
    for (const [x, y] of this.cells(this.piece)) if (y >= 0) this.board[y][x] = this.piece.type;
    this.holdUsed = false;
    const full = [];
    this.board.forEach((row, y) => row.every(Boolean) && full.push(y));
    if (full.length) {
      this.clearing = { rows: full, t: 0 };
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

  block(fb, px, py, type, ghost = false) {
    const [base, light] = COLORS[type];
    if (ghost) {
      fb.set(px, py, base);
      fb.set(px + 1, py + 1, C.DARKGRAY);
      fb.set(px + 1, py, C.DARKGRAY);
      fb.set(px, py + 1, C.DARKGRAY);
      return;
    }
    fb.rect(px, py, CELL, CELL, base);
    fb.set(px, py, light);
  }

  preview(fb, type, cx, cy) {
    const cells = STATES[type][0];
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * CELL;
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * CELL;
    for (const [x, y] of cells) {
      this.block(fb, Math.round(cx - w / 2) + (x - Math.min(...xs)) * CELL, Math.round(cy - h / 2) + (y - Math.min(...ys)) * CELL, type);
    }
  }

  draw(fb) {
    fb.clear(C.NAVY);
    // checkerboard backdrop
    for (let y = 0; y < fb.h; y += 4) for (let x = (y / 4) % 2 ? 0 : 4; x < fb.w; x += 8) fb.rect(x, y, 4, 4, C.BLACK);

    // well
    fb.rect(BX - 2, BY - 2, W * CELL + 4, (H - HIDDEN) * CELL + 4, C.GRAY);
    fb.frame(BX - 1, BY - 1, W * CELL + 2, (H - HIDDEN) * CELL + 2, C.SILVER);
    fb.rect(BX, BY, W * CELL, (H - HIDDEN) * CELL, C.BLACK);

    const flashRow = this.clearing && this.clearing.t % 8 < 4;
    for (let y = HIDDEN; y < H; y++) {
      const clearingRow = this.clearing?.rows.includes(y);
      const topped = this.topOut && H - y <= this.topOut / 3;
      for (let x = 0; x < W; x++) {
        const px = BX + x * CELL;
        const py = BY + (y - HIDDEN) * CELL;
        if (topped) fb.rect(px, py, CELL, CELL, (x + y) % 2 ? C.GRAY : C.LIGHTGRAY);
        else if (clearingRow) fb.rect(px, py, CELL, CELL, flashRow ? C.WHITE : C.BLACK);
        else if (this.board[y][x]) this.block(fb, px, py, this.board[y][x]);
      }
    }
    if (this.piece && !this.topOut) {
      const gy = this.ghostY();
      for (const [x, y] of this.cells({ ...this.piece, y: gy }))
        if (y >= HIDDEN) this.block(fb, BX + x * CELL, BY + (y - HIDDEN) * CELL, this.piece.type, true);
      for (const [x, y] of this.cells(this.piece))
        if (y >= HIDDEN) this.block(fb, BX + x * CELL, BY + (y - HIDDEN) * CELL, this.piece.type);
    }

    // left panel
    const panel = (x, y, w, h) => {
      fb.rect(x, y, w, h, C.BLACK);
      fb.frame(x, y, w, h, C.SILVER);
    };
    panel(2, 4, 24, 28);
    fb.text('SCORE', 14, 6, C.SILVER, { align: 'center' });
    fb.text(String(this.score).padStart(6, '0'), 14, 12, C.WHITE, { align: 'center' });
    fb.text('LEVEL', 14, 19, C.SILVER, { align: 'center' });
    fb.text(String(this.level), 14, 25, C.YELLOW, { align: 'center' });
    panel(2, 34, 24, 12);
    fb.text('LINES', 14, 36, C.SILVER, { align: 'center' });
    fb.text(String(this.lines).padStart(3, '0'), 14, 42 - 1, C.WHITE, { align: 'center' });

    // right panel
    panel(54, 4, 24, 30);
    fb.text('NEXT', 66, 6, C.SILVER, { align: 'center' });
    this.preview(fb, this.queue[0], 66, 15);
    this.preview(fb, this.queue[1], 66, 23);
    this.preview(fb, this.queue[2], 66, 29);
    panel(54, 35, 24, 11);
    fb.text('HOLD', 66, 37, this.holdUsed ? C.GRAY : C.SILVER, { align: 'center' });
    if (this.hold) this.preview(fb, this.hold, 66, 43);

    fb.text(`HI ${Math.max(this.best, this.score)}`, BX + (W * CELL) / 2, 0, C.YELLOW, { align: 'center' });
  }
}
