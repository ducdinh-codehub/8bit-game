import { makeSprite } from '../../core/framebuffer.js';
import { C } from '../../core/palette.js';

export const T = 6; // tile size in pixels

const HERO = { R: C.RED, S: C.SKIN, K: C.BROWN, B: C.BLUE, W: C.WHITE };
const HERO_FIRE = { ...HERO, R: C.WHITE, B: C.RED };

const smallTop = ['.RRR..', '.RRRRR', '.KSKS.', '..SSS.'];
const SMALL = {
  stand: [...smallTop, '.RBBR.', '.K..K.'],
  walk1: [...smallTop, 'RRBBR.', 'K...K.'],
  walk2: [...smallTop, '.RBBRR', '..KK..'],
  jump: ['.RRR.S', '.RRRRR', '.KSKS.', 'RRSSS.', '.RBBBR', 'K....K'],
  dead: ['.RRRR.', 'RRRRRR', 'SKSSKS', '.SSSS.', 'RBBBBR', '.K..K.'],
};

const bigTop = ['..RRR.', '.RRRRR', '.KKSKS', '.KSSSS', '..SSS.', '.RRBRR', 'RRRBRR', 'RRBBBR', 'SBBBBS'];
const BIG = {
  stand: [...bigTop, '.BBBB.', '.KK.KK', 'KKK.KK'],
  walk1: [...bigTop, 'BBB.BB', 'KK...K', '.....K'],
  walk2: [...bigTop, '.BBB..', '..KK..', '..KKK.'],
  jump: ['..RRR.', '.RRRRR', '.KKSKS', '.KSSSS', 'S.SSS.', 'SRRBRR', '.RRBRR', 'RRBBBR', '.BBBBS', 'BBBBB.', 'K...KK', 'K.....'],
};

const build = (set, pal) => Object.fromEntries(Object.entries(set).map(([k, rows]) => [k, makeSprite(rows, pal)]));
export const heroSmall = build(SMALL, HERO);
export const heroBig = build(BIG, HERO);
export const heroBigFlash = build(BIG, HERO_FIRE);

const walkerPal = (H) => ({ H, k: C.BLACK, W: C.WHITE, F: C.SKIN });
const WALKER = {
  a: ['..HH..', '.HHHH.', 'HWkHWk', 'HHHHHH', '.FFFF.', 'kk..kk'],
  b: ['..HH..', '.HHHH.', 'HWkHWk', 'HHHHHH', '.FFFF.', '.kkkk.'],
  flat: ['......', '......', '......', '.HHHH.', 'HWkWkH', 'kkkkkk'],
};
export const walker = {
  overworld: build(WALKER, walkerPal(C.DIRT)),
  underground: build(WALKER, walkerPal(C.STEEL)),
};

const SPIKY = {
  a: ['W.W.W.', 'RWRWRW', 'RRRRRR', 'RRRRRR', '.K..K.'],
  b: ['.W.W.W', 'WRWRWR', 'RRRRRR', 'RRRRRR', 'K..K..'],
};
export const spiky = build(SPIKY, { W: C.WHITE, R: C.RED, K: C.BLACK });

export const mushroom = makeSprite(['.RRRR.', 'RWRRWR', 'RRRRRR', '.SSSS.', '.SKSK.', '.SSSS.'], {
  R: C.RED,
  W: C.WHITE,
  S: C.PEACH,
  K: C.BLACK,
});

export const coinFrames = [
  makeSprite(['.YY.', 'YyyY', 'YyyY', 'YyyY', 'YyyY', '.YY.'], { Y: C.ORANGE, y: C.YELLOW }),
  makeSprite(['.Y.', 'YyY', 'YyY', 'YyY', 'YyY', '.Y.'], { Y: C.ORANGE, y: C.YELLOW }),
  makeSprite(['Y', 'Y', 'Y', 'Y', 'Y', 'Y'], { Y: C.YELLOW }),
  makeSprite(['.Y.', 'YyY', 'YyY', 'YyY', 'YyY', '.Y.'], { Y: C.ORANGE, y: C.YELLOW }),
];

export const flag = makeSprite(['GGGGGG', '.GWWGG', '..GGGG', '...GGG', '....GG'], { G: C.WHITE, W: C.FOREST });

export const THEMES = {
  overworld: { sky: C.SKY, base: C.DIRT, light: C.PEACH, dark: C.BLACK, enemy: 'overworld' },
  underground: { sky: C.BLACK, base: C.STEEL, light: C.PALESTEEL, dark: C.BLACK, enemy: 'underground' },
};

const PATTERNS = {
  '#': ['lbbbdl', 'bbbbdb', 'bbbbdb', 'ddddbb', 'lbdbbb', 'bbdbbb'],
  B: ['bbdbbb', 'bbdbbb', 'dddddd', 'bbbbbd', 'bbbbbd', 'dddddd'],
  X: ['llllld', 'lbbbdd', 'lbbbdd', 'lbbbdd', 'lddddd', 'dddddd'],
  U: ['dddddd', 'dbbbbd', 'dbbbbd', 'dbbbbd', 'dbbbbd', 'dddddd'],
  '?': ['qqqqqQ', 'qkkkqQ', 'qqqkqQ', 'qqkqqQ', 'qqqqqQ', 'qqkqqQ'],
};

function drawPattern(fb, rows, px, py, pal) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) fb.set(px + x, py + y, pal[rows[y][x]]);
}

const PIPE = [C.DARKGREEN, C.MINT, C.MINT, C.GREEN, C.GREEN, C.GREEN, C.GREEN, C.GREEN, C.FOREST, C.FOREST, C.FOREST, C.DARKGREEN];

// Pipes are drawn as 12px-wide columns: left tile draws columns 0-5, right tile 6-11.
function drawPipe(fb, px, py, isRight, isTop) {
  for (let x = 0; x < T; x++) {
    const col = (isRight ? T : 0) + x;
    if (isTop) {
      fb.rect(px + x, py, 1, T, PIPE[col]);
      fb.set(px + x, py, C.DARKGREEN);
      fb.set(px + x, py + T - 1, C.DARKGREEN);
    } else {
      const inner = col - 1; // body is inset 1px each side (10px wide)
      const c = inner < 0 || inner > 9 ? null : inner === 0 || inner === 9 ? C.DARKGREEN : PIPE[Math.min(11, inner + 1)];
      if (c !== null) fb.rect(px + x, py, 1, T, c);
    }
  }
}

export function drawTile(fb, ch, px, py, theme, frame) {
  const pal = { b: theme.base, l: theme.light, d: theme.dark };
  switch (ch) {
    case '#':
    case 'B':
    case 'X':
    case 'U':
      return drawPattern(fb, PATTERNS[ch], px, py, ch === 'U' ? { ...pal, b: C.BROWN, d: C.BLACK } : pal);
    case '=':
      return drawPattern(fb, PATTERNS.B, px, py, { b: theme.dark === C.BLACK ? C.NAVY : theme.base, d: C.BLACK, l: theme.base });
    case '?':
    case 'M': {
      const shimmer = [C.ORANGE, C.ORANGE, C.YELLOW, C.PALEYELLOW][Math.floor(frame / 10) % 4];
      return drawPattern(fb, PATTERNS['?'], px, py, { q: shimmer, Q: C.BROWN, k: C.BROWN });
    }
    case '[':
      return drawPipe(fb, px, py, false, true);
    case ']':
      return drawPipe(fb, px, py, true, true);
    case '{':
      return drawPipe(fb, px, py, false, false);
    case '}':
      return drawPipe(fb, px, py, true, false);
    case 'F':
      return drawPattern(fb, PATTERNS.X, px, py, { b: C.FOREST, l: C.GREEN, d: C.DARKGREEN });
    case 'o': {
      const spr = coinFrames[Math.floor(frame / 8) % 4];
      return fb.sprite(spr, px + Math.floor((T - spr.w) / 2), py);
    }
    default:
  }
}

export function drawCastle(fb, px, py, theme) {
  // px,py = top-left of the bottom-left tile; castle is 5 tiles wide.
  const pal = { b: theme === 'underground' ? C.STEEL : C.DIRT, l: C.PEACH, d: C.BLACK };
  const brick = (x, y) => drawPattern(fb, PATTERNS.B, x, y, pal);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 5; tx++) brick(px + tx * T, py - ty * T);
  fb.rect(px, py - T - 3, T, 3, pal.b); // battlements on the base
  fb.rect(px + 4 * T, py - T - 3, T, 3, pal.b);
  for (let tx = 1; tx < 4; tx++) brick(px + tx * T, py - 2 * T); // tower
  fb.rect(px + T, py - 2 * T - 3, T, 3, pal.b);
  fb.rect(px + 3 * T, py - 2 * T - 3, T, 3, pal.b);
  fb.rect(px + 2 * T + 2, py - 2 * T + 1, 2, 3, C.BLACK); // window
  fb.rect(px + 2 * T, py - T + 2, T, T + 4, C.BLACK); // door
  fb.rect(px + 2 * T + 1, py - T + 1, T - 2, 1, C.BLACK);
}
