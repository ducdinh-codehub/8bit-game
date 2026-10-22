import { makeSprite } from '../core/framebuffer.js';
import { C } from '../core/palette.js';

const TOP = 10; // playfield starts below the HUD
const PLAYER_Y = 84;
const SHIP_SPEED = 1.5;
const BULLET_SPEED = 4;
const MAX_SHOTS = 2;
const LIVES = { easy: 5, normal: 3, hard: 2 };
const AGGRO = { easy: 0.7, normal: 1, hard: 1.4 };

const SHIP = makeSprite(
  [
    '.....W.....',
    '.....W.....',
    '....RWR....',
    '....WWW....',
    '.B..WWW..B.',
    '.W.WWBWW.W.',
    'RWWWBBBWWWR',
    'WWWRWWWRWWW',
    'WW.RR.RR.WW',
    'W.........W',
  ],
  { W: C.WHITE, R: C.RED, B: C.BLUE },
);
const MINI_SHIP = makeSprite(['..W..', '.WRW.', 'WWWWW', 'W.R.W'], { W: C.WHITE, R: C.RED });

const BUG_A = ['B.......B', 'BB.YYY.BB', '.BYRYRYB.', '..YYYYY..', '.BYYYYYB.', 'BB.Y.Y.BB', 'B..Y.Y..B'];
const BUG_B = ['.........', '.B.YYY.B.', 'BBYRYRYBB', 'B.YYYYY.B', '..YYYYY..', '.BBY.YBB.', '...Y.Y...'];
const MOTH_A = ['.W.....W.', '..W...W..', 'RRRYYYRRR', 'RWRYRYRWR', 'RRRYYYRRR', '.R.YYY.R.', '....Y....'];
const MOTH_B = ['.W.....W.', '..W...W..', '..RYYYR..', '.RWYRYWR.', 'RRRYYYRRR', 'R..YYY..R', '....Y....'];
const BOSS_A = ['...G...G...', '....G.G....', '..PPGGGPP..', '.PPWGGGWPP.', 'PPPGGGGGPPP', 'P.PGGYGGP.P', 'P..GG.GG..P', '...G...G...'];
const BOSS_B = ['...G...G...', '....G.G....', '...PGGGP...', '..PWGGGWP..', '.PPGGGGGPP.', 'PP.GGYGG.PP', '...GG.GG...', '...G...G...'];

const pair = (a, b, pal) => [makeSprite(a, pal), makeSprite(b, pal)];
const KINDS = {
  bug: { frames: pair(BUG_A, BUG_B, { B: C.BLUE, Y: C.YELLOW, R: C.RED }), points: [50, 100], hp: 1, colors: [C.YELLOW, C.BLUE, C.WHITE] },
  moth: { frames: pair(MOTH_A, MOTH_B, { R: C.RED, Y: C.YELLOW, W: C.WHITE }), points: [80, 160], hp: 1, colors: [C.RED, C.WHITE, C.YELLOW] },
  boss: { frames: pair(BOSS_A, BOSS_B, { G: C.GREEN, P: C.MAGENTA, W: C.WHITE, Y: C.YELLOW }), points: [150, 400], hp: 2, colors: [C.GREEN, C.MAGENTA, C.WHITE] },
};
// A boss that has taken one hit turns blue.
const BOSS_HURT = pair(BOSS_A, BOSS_B, { G: C.SKYBLUE, P: C.BLUE, W: C.WHITE, Y: C.YELLOW });

// Formation rows: [kind, first column, last column]
const ROWS = [
  ['boss', 3, 6],
  ['moth', 1, 8],
  ['moth', 1, 8],
  ['bug', 0, 9],
  ['bug', 0, 9],
];

const bezier = (p, t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i]);
};

export default class StarStriker {
  static id = 'star-striker';
  static title = 'Star Striker';
  static short = 'space';
  static aliases = ['space', 'spaceship', 'galaga', 'galaxian', 'shooter', 'shmup', 'invaders', 'stars'];
  static year = 1981;
  static inspiredBy = 'Galaga (1981)';
  static description = 'Blast the alien swarm before it dive-bombs you.';
  static controls = '←→ move (auto-fire)  SPACE extra shot';
  static width = 160;
  static height = 96;

  constructor({ sound, difficulty = 'normal', best = 0 }) {
    this.sound = sound;
    this.best = best;
    this.aggro = AGGRO[difficulty] ?? 1;
    this.lives = LIVES[difficulty] ?? 3;
    this.score = 0;
    this.stage = 0;
    this.frame = 0;
    this.stars = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random() * 160,
      y: Math.random() * 96,
      speed: [0.15, 0.35, 0.7][i % 3],
      c: [C.DARKGRAY, C.LIGHTGRAY, C.WHITE, C.SKYBLUE, C.YELLOW, C.SALMON][i % 6],
    }));
    this.ship = { x: 80, dead: 0, inv: 0 };
    this.nextStage();
  }

  scoreExtra() {
    return { stage: this.stage };
  }

  nextStage() {
    this.stage++;
    this.enemies = [];
    this.shots = [];
    this.bombs = [];
    this.booms = [];
    this.popups = [];
    this.fireCooldown = 0;
    this.diveTimer = 160;
    this.banner = { text: `STAGE ${this.stage}`, t: 120 };
    let n = 0;
    ROWS.forEach(([kind, c0, c1], row) => {
      for (let col = c0; col <= c1; col++) {
        const wave = Math.floor(n / 8);
        const side = wave % 2 ? 1 : -1;
        this.enemies.push({
          kind,
          row,
          col,
          hp: KINDS[kind].hp,
          state: 'enter',
          delay: 40 + wave * 60 + (n % 8) * 7,
          t: 0,
          side,
          x: side > 0 ? 175 : -15,
          y: 70,
        });
        n++;
      }
    });
  }

  // Where an enemy's formation slot currently is (the formation sways and breathes).
  slot(e) {
    const sway = Math.sin(this.frame / 90) * 8;
    const breath = this.settled() ? 1 + Math.sin(this.frame / 45) * 0.08 : 1;
    return [80 + (e.col - 4.5) * 13 * breath + sway, TOP + 8 + e.row * 10 * breath];
  }

  settled() {
    return this.enemies.every((e) => e.state !== 'enter');
  }

  get params() {
    const s = this.stage;
    return {
      diveEvery: Math.max(35, (150 - s * 12) / this.aggro),
      maxDivers: Math.min(6, 1 + Math.floor((s + 1) * this.aggro)),
      bombChance: Math.min(0.06, (0.015 + s * 0.006) * this.aggro),
      diveSpeed: Math.min(2.4, 1.2 + s * 0.12) * Math.sqrt(this.aggro),
    };
  }

  update(input) {
    this.frame++;
    for (const st of this.stars) {
      st.y += st.speed;
      if (st.y > 96) {
        st.y = TOP;
        st.x = Math.random() * 160;
      }
    }
    if (this.banner && --this.banner.t <= 0) this.banner = null;
    this.updateShip(input);
    this.updateEnemies();
    this.updateProjectiles();
    this.updateEffects();

    if (!this.enemies.length && !this.banner) {
      if (!this.clearTimer) {
        this.clearTimer = 90;
        this.sound.play('levelup');
        this.banner = { text: 'STAGE CLEAR!', t: 80 };
      }
    }
    if (this.clearTimer && --this.clearTimer <= 0) {
      this.clearTimer = 0;
      this.nextStage();
    }
  }

  updateShip(input) {
    const s = this.ship;
    if (s.dead) {
      s.dead++;
      if (s.dead === 70 && this.lives <= 0) this.gameOver = true;
      // Respawn once the sky near the bottom is clear of divers.
      if (s.dead > 100 && this.lives > 0 && !this.enemies.some((e) => e.state === 'dive')) {
        s.dead = 0;
        s.x = 80;
        s.inv = 120;
        this.banner = { text: 'READY', t: 50 };
      }
      return;
    }
    if (s.inv > 0) s.inv--;
    if (input.down('left')) s.x -= SHIP_SPEED;
    if (input.down('right')) s.x += SHIP_SPEED;
    s.x = Math.max(6, Math.min(154, s.x));
    if (this.fireCooldown > 0) this.fireCooldown--;
    // The ship fires on its own. Most terminals can't report two held keys at
    // once (holding an arrow and tapping Space stops the arrow), so auto-fire
    // keeps moving and shooting possible. Space still gives an instant shot.
    const wantFire = this.fireCooldown === 0 || (input.pressed('fire') && this.fireCooldown <= 4);
    if (wantFire && this.shots.length < MAX_SHOTS) {
      this.shots.push({ x: s.x, y: PLAYER_Y - 2 });
      this.fireCooldown = 12;
      this.sound.play('laser');
    }
  }

  updateEnemies() {
    const p = this.params;
    const s = this.ship;
    if (this.settled() && !s.dead && --this.diveTimer <= 0) {
      this.diveTimer = p.diveEvery * (0.6 + Math.random() * 0.8);
      const diving = this.enemies.filter((e) => e.state === 'dive').length;
      const ready = this.enemies.filter((e) => e.state === 'form');
      if (ready.length && diving < p.maxDivers) {
        const e = ready[Math.floor(Math.random() * ready.length)];
        e.state = 'dive';
        e.t = 0;
        e.dir = e.x < 80 ? -1 : 1;
        e.vx = 0;
        e.vy = 0;
        this.sound.play('dive');
      }
    }

    for (const e of this.enemies) {
      const [sx, sy] = this.slot(e);
      if (e.state === 'enter') {
        if (e.delay > 0) {
          e.delay--;
          continue;
        }
        e.t = Math.min(1, e.t + 1 / 100);
        const path = [
          [e.side > 0 ? 175 : -15, 72],
          [e.side > 0 ? 50 : 110, 100],
          [e.side > 0 ? 20 : 140, 0],
          [sx, sy],
        ];
        [e.x, e.y] = bezier(path, e.t);
        if (e.t >= 1) e.state = 'form';
      } else if (e.state === 'form') {
        e.x = sx;
        e.y = sy;
      } else if (e.state === 'dive') {
        e.t++;
        if (e.t < 30) {
          // a little loop up and outward before swooping down
          const a = (e.t / 30) * Math.PI;
          e.x += e.dir * Math.cos(a) * 1.4;
          e.y += -Math.sin(a) * 1.2 + 0.4;
        } else {
          e.vy = Math.min(p.diveSpeed, e.vy + 0.06);
          if (!s.dead) e.vx += Math.sign(s.x - e.x) * 0.05;
          e.vx = Math.max(-1.3, Math.min(1.3, e.vx));
          e.x += e.vx;
          e.y += e.vy;
          if (e.y > 30 && e.y < PLAYER_Y - 10 && Math.random() < p.bombChance) this.dropBomb(e);
        }
        if (e.y > 104) {
          e.state = 'return';
          e.y = TOP - 12;
          e.x = sx;
        }
      } else if (e.state === 'return') {
        const dx = sx - e.x;
        const dy = sy - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.6) e.state = 'form';
        else {
          e.x += (dx / d) * 1.6;
          e.y += (dy / d) * 1.6;
        }
      }
      // Rammed the ship?
      if (!s.dead && !s.inv && e.state !== 'enter' && Math.abs(e.x - s.x) < 8 && Math.abs(e.y - (PLAYER_Y + 4)) < 7) {
        this.killEnemy(e, true);
        this.killShip();
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  dropBomb(e) {
    const s = this.ship;
    const vx = Math.max(-0.6, Math.min(0.6, (s.x - e.x) / 60));
    this.bombs.push({ x: e.x, y: e.y + 4, vx, vy: 1.6 });
  }

  updateProjectiles() {
    const s = this.ship;
    for (const b of this.shots) {
      b.y -= BULLET_SPEED;
      for (const e of this.enemies) {
        if (e.hp <= 0 || (e.state === 'enter' && e.delay > 0)) continue;
        const w = e.kind === 'boss' ? 6 : 5;
        if (Math.abs(b.x - e.x) <= w && b.y <= e.y + 4 && b.y + 4 >= e.y - 4) {
          b.y = -99;
          e.hp--;
          if (e.hp > 0) {
            this.sound.play('bump');
            this.booms.push({ x: e.x, y: e.y, t: 8, small: true, colors: [C.WHITE, C.SKYBLUE] });
          } else this.killEnemy(e);
          break;
        }
      }
    }
    this.shots = this.shots.filter((b) => b.y > TOP - 4);

    for (const b of this.bombs) {
      b.x += b.vx;
      b.y += b.vy;
      if (!s.dead && !s.inv && Math.abs(b.x - s.x) < 4 && b.y > PLAYER_Y && b.y < PLAYER_Y + 9) {
        b.y = 999;
        this.killShip();
      }
    }
    this.bombs = this.bombs.filter((b) => b.y < 98);
  }

  killEnemy(e, rammed = false) {
    const k = KINDS[e.kind];
    const diving = e.state === 'dive' || e.state === 'return';
    const pts = k.points[diving ? 1 : 0];
    e.hp = 0;
    if (!rammed) {
      this.score += pts;
      if (diving) this.popups.push({ x: e.x, y: e.y - 6, text: String(pts), t: 40 });
    }
    this.booms.push({ x: e.x, y: e.y, t: 20, colors: k.colors });
    this.sound.play('boom');
  }

  killShip() {
    const s = this.ship;
    s.dead = 1;
    this.lives--;
    this.booms.push({ x: s.x, y: PLAYER_Y + 5, t: 40, big: true, colors: [C.WHITE, C.RED, C.YELLOW, C.BLUE] });
    this.bombs = [];
    this.sound.play('die');
    // Divers head home so the respawn isn't an instant death.
    for (const e of this.enemies) if (e.state === 'dive') e.vy = Math.max(e.vy, 2);
  }

  updateEffects() {
    for (const b of this.booms) b.t--;
    this.booms = this.booms.filter((b) => b.t > 0);
    for (const p of this.popups) {
      p.y -= 0.3;
      p.t--;
    }
    this.popups = this.popups.filter((p) => p.t > 0);
  }

  // ---------- drawing ----------

  drawBoom(fb, b) {
    const life = b.big ? 40 : b.small ? 8 : 20;
    const age = life - b.t;
    const r = b.big ? age * 0.6 : age * 0.5;
    if (age < (b.big ? 8 : 4)) fb.disc(b.x, b.y, b.big ? 4 - age / 3 : 2, C.WHITE);
    const n = b.big ? 16 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
      const rr = r * (i % 3 === 0 ? 1.3 : 1);
      const c = b.colors[i % b.colors.length];
      const sz = b.t > life / 2 ? 2 : 1;
      fb.rect(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, sz, sz, c);
    }
  }

  draw(fb) {
    fb.clear(C.BLACK);
    for (const st of this.stars) {
      const twinkle = st.speed > 0.5 || (this.frame + st.x * 7) % 40 > 6;
      if (twinkle) fb.set(st.x, st.y, st.c);
      if (st.speed > 0.5) fb.set(st.x, st.y - 1, C.DARKGRAY); // streak on the near layer
    }

    const flap = Math.floor(this.frame / 16) % 2;
    for (const e of this.enemies) {
      if (e.state === 'enter' && e.delay > 0) continue;
      const frames = e.kind === 'boss' && e.hp === 1 ? BOSS_HURT : KINDS[e.kind].frames;
      const spr = frames[e.state === 'dive' ? Math.floor(this.frame / 6) % 2 : flap];
      fb.sprite(spr, e.x - Math.floor(spr.w / 2), e.y - Math.floor(spr.h / 2));
    }

    for (const b of this.shots) {
      fb.rect(b.x, b.y, 1, 4, C.YELLOW);
      fb.set(b.x, b.y, C.WHITE);
      fb.set(b.x, b.y + 4, C.RED);
    }
    for (const b of this.bombs) {
      const blink = this.frame % 6 < 3;
      fb.rect(b.x - 1, b.y, 2, 3, blink ? C.WHITE : C.RED);
      fb.set(b.x - 1, b.y + 3, C.RED);
    }

    const s = this.ship;
    if (!s.dead && !(s.inv && this.frame % 6 < 3)) {
      fb.sprite(SHIP, s.x - 5, PLAYER_Y);
      // engine flame
      const f = this.frame % 4 < 2;
      fb.rect(s.x - 1, PLAYER_Y + 10, 3, 1, C.ORANGE);
      if (f) fb.set(s.x, PLAYER_Y + 11, C.YELLOW);
    }
    for (const b of this.booms) this.drawBoom(fb, b);
    for (const p of this.popups) fb.text(p.text, p.x, p.y, C.SKYBLUE, { align: 'center', font: 'small' });

    // HUD
    fb.rect(0, 0, fb.w, TOP - 1, C.BLACK);
    fb.rect(0, TOP - 1, fb.w, 1, C.NAVY);
    fb.text('1UP', 3, 2, C.RED, { font: 'small' });
    fb.text(String(this.score).padStart(6, '0'), 18, 1, C.WHITE);
    fb.text('HI', 66, 2, C.RED, { font: 'small' });
    fb.text(String(Math.max(this.best, this.score)).padStart(6, '0'), 76, 1, C.YELLOW);
    // stage badges, right aligned
    for (let i = 0; i < Math.min(this.stage, 8); i++) {
      const x = 155 - i * 5;
      fb.rect(x, 1, 3, 5, i % 5 === 4 ? C.YELLOW : C.RED);
      fb.set(x + 1, 6, C.WHITE);
    }
    // reserve ships, bottom-left
    for (let i = 0; i < Math.min(this.lives - (s.dead ? 0 : 1), 6); i++) fb.sprite(MINI_SHIP, 2 + i * 7, 91);

    if (this.banner && this.banner.t % 30 < 24) {
      const color = this.banner.text.startsWith('STAGE C') ? C.YELLOW : this.banner.text === 'READY' ? C.RED : C.SKYBLUE;
      fb.text(this.banner.text, 80, 64, color, { align: 'center', outline: C.BLACK });
    }
  }
}
