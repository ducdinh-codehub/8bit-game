import { makeSprite } from '../../core/framebuffer.js';
import { C } from '../../core/palette.js';

// Game logic works in units of T; everything is drawn at 2x, so a tile is
// TP pixels on screen.
export const T = 6;
export const SCALE = 2;
export const TP = T * SCALE;

const HERO = { R: C.RED, S: C.SKIN, K: C.BROWN, B: C.BLUE, Y: C.YELLOW };
const HERO_FIRE = { ...HERO, R: C.WHITE, B: C.RED };

const head = ['...RRRRR....', '..RRRRRRRRR.', '..KKKSSKS...', '.KSKSSSKSSS.', '.KKSSSSKKKK.', '...SSSSSSS..'];
const SMALL = {
  stand: [...head, '..RRBRRBR...', '.RRRBBBBRRR.', '.SSBYBBYBSS.', '..BBB..BBB..', '.KKK....KKK.', 'KKKK....KKKK'],
  walk1: [...head, '..RRRBRR....', '.SRRRBBBRRS.', '.SSBYBBYBSS.', '.BBBB..BBBB.', 'BBB.....KKKK', 'KKK......KK.'],
  walk2: [...head, '...RRBRR....', '..RRBBBRR...', '..SBYBBYS...', '...BBBBB....', '...KKKKK....', '...KKKKKK...'],
  jump: [
    '...RRRRR..SS',
    '..RRRRRRRRSS',
    '..KKKSSKS.RR',
    '.KSKSSSKSSRR',
    '.KKSSSSKKKR.',
    '...SSSSSSSR.',
    'RRRRBRRRBR..',
    'SRRRRBBBBB.K',
    'SS.BYBBYBBKK',
    '..BBBBBBBBKK',
    '.KKBBBBBB...',
    'KK..........',
  ],
  dead: [
    '....RRRR....',
    '.S.RRRRRR.S.',
    '.SKKSSSSKKS.',
    '.SKSKSSKSKS.',
    '.SSSSKKSSSS.',
    '..RSSSSSSR..',
    '..RRBRRBRR..',
    '..RBBBBBBR..',
    '...BYBBYB...',
    '...BBBBBB...',
    '..KKK..KKK..',
    '.KKKK..KKKK.',
  ],
};

const bigTop = [
  '...RRRRR....',
  '..RRRRRRRRR.',
  '..KKKSSKS...',
  '.KSKSSSKSSS.',
  '.KSKKSSSKSSS',
  '.KKSSSSKKKK.',
  '...SSSSSSS..',
  '..RRBRRR....',
  '.RRRBRRBRRR.',
  'RRRRBBBBRRRR',
  'SSRBYBBYBRSS',
  'SSSBBBBBBSSS',
  'SSBBBBBBBBSS',
  '..BBBBBBBB..',
];
const BIG = {
  stand: [...bigTop, '..BBB..BBB..', '..BBB..BBB..', '..BBB..BBB..', '..BBB..BBB..', '..BBB..BBB..', '.KKKK..KKKK.', '.KKKKK.KKKKK', '.KKKKK.KKKKK'],
  walk1: [...bigTop, '..BBBBBBBBB.', '.BBBB..BBBBK', '.BBB....BBKK', 'BBB.....KKKK', 'BBB......KK.', 'BBB.........', 'KKK.........', 'KKKK........'],
  walk2: [...bigTop, '...BBBBBB...', '...BBBBBB...', '....BBBBB...', '....BBBB....', '....BBBB....', '....BBBB....', '....KKKKK...', '...KKKKKKK..'],
  jump: [
    '...RRRRR..SS',
    '..RRRRRRRRSS',
    '..KKKSSKS.RR',
    '.KSKSSSKSSRR',
    '.KSKKSSSKSRR',
    '.KKSSSSKKKR.',
    '...SSSSSSSR.',
    '..RRBRRRRR..',
    '.RRRBRRBRR..',
    'RRRRBBBBR...',
    'SSRBYBBYB...',
    'SSSBBBBBB...',
    'SSBBBBBBBB..',
    '..BBBBBBBBB.',
    '.BBBB..BBBBK',
    'BBBB....BBKK',
    'BBB......KKK',
    'BB.......KK.',
    'KK..........',
    'KKK.........',
    'KKKK........',
    '............',
  ],
};

const build = (set, pal) => Object.fromEntries(Object.entries(set).map(([k, rows]) => [k, makeSprite(rows, pal)]));
export const heroSmall = build(SMALL, HERO);
export const heroBig = build(BIG, HERO);
export const heroBigFlash = build(BIG, HERO_FIRE);

const walkerPal = (H, F) => ({ H, F, k: C.BLACK, W: C.WHITE });
const walkerTop = [
  '....HHHH....',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '.HkkHHHHkkH.',
  '.HHWkHHkWHH.',
  'HHHWkHHkWHHH',
  'HHHHHHHHHHHH',
  '.HHHFFFFHHH.',
  '...FFFFFF...',
  '..FFFFFFFF..',
];
const WALKER = {
  a: [...walkerTop, '.kkkk...kk..', '.kkkk..kkkk.'],
  b: [...walkerTop, '..kk...kkkk.', '.kkkk..kkkk.'],
  flat: ['', '', '', '', '', '', '', '..HHHHHHHH..', '.HHkkHHkkHH.', 'HHHWkHHkWHHH', '.FFFFFFFFFF.', 'kkkk....kkkk'].map((r) => r.padEnd(12, '.')),
};
export const walker = {
  overworld: build(WALKER, walkerPal(C.DIRT, C.PEACH)),
  underground: build(WALKER, walkerPal(C.STEEL, C.PALESTEEL)),
};

const spikyBody = ['.RRRRRRRRRR.', 'RRSRRRRRRRRR', 'RSSRRRRRRRRR', 'RRRRRRRRRRRR', 'KWKRRRRRRRRR', 'FFFRRRRRRRR.', '.FFFFFFFFF..'];
const SPIKY = {
  a: ['...W..W..W..', '..WWRWWRWWR.', ...spikyBody, '.KK....KK...'],
  b: ['..W..W..W...', '.WWRWWRWWR..', ...spikyBody, '..KK....KK..'],
};
export const spiky = build(SPIKY, { W: C.WHITE, R: C.RED, S: C.SALMON, K: C.BLACK, F: C.ORANGE });

export const mushroom = makeSprite(
  [
    '....RRRR....',
    '..RRWWRRRR..',
    '.RRWWWWRRWR.',
    '.RRWWWWRWWWR',
    'RRRRWWRRWWWR',
    'RRRRRRRRRRRR',
    'RWRRRRRRRRWR',
    '.RRRRRRRRRR.',
    '...SSSSSS...',
    '..SSKSSKSS..',
    '..SSKSSKSS..',
    '...SSSSSS...',
  ],
  { R: C.RED, W: C.WHITE, S: C.PEACH, K: C.BLACK },
);

const COIN_PAL = { Y: C.BROWN, y: C.YELLOW, W: C.PALEYELLOW, o: C.ORANGE };
const coinFace = ['..YYYY..', '.YyyyyY.', ...Array(8).fill('YyWyoyyY'), '.YyyyyY.', '..YYYY..'];
const coinThin = ['.YYYY.', 'YyyyyY', ...Array(8).fill('YWyoyY'), 'YyyyyY', '.YYYY.'];
const coinEdge = ['.YY.', 'YyyY', ...Array(8).fill('YWyY'), 'YyyY', '.YY.'];
export const coinFrames = [makeSprite(coinFace, COIN_PAL), makeSprite(coinThin, COIN_PAL), makeSprite(coinEdge, COIN_PAL), makeSprite(coinThin, COIN_PAL)];
export const hudCoin = makeSprite(['.YY.', 'YyyY', 'YWoY', 'YWoY', 'YWoY', 'YyyY', '.YY.'], COIN_PAL);

export const flag = makeSprite(
  [
    'WWWWWWWWWWWW',
    '.WWWWWGGWWWW',
    '..WWWGGGGWWW',
    '...WWWGGWWWW',
    '....WWWWWWWW',
    '.....WWWWWWW',
    '......WWWWWW',
    '.......WWWWW',
    '........WWWW',
    '.........WWW',
  ],
  { W: C.WHITE, G: C.FOREST },
);

export const THEMES = {
  overworld: { sky: C.SKYBLUE, base: C.DIRT, light: C.PEACH, dark: C.BLACK, enemy: 'overworld' },
  underground: { sky: C.BLACK, base: C.STEEL, light: C.PALESTEEL, dark: C.BLACK, enemy: 'underground' },
};

// 12x12 tile patterns. b = base, l = light, d = dark.
const PATTERNS = {
  '#': [
    'llllllllldll',
    'lbbbbbbbbdlb',
    'lbbbbbbbbdlb',
    'lbbbbbbbbdlb',
    'lbbbbbbbbdlb',
    'lbbbbbbbbddd',
    'lbbbbbbbbdll',
    'lbbbbbbbbdlb',
    'lbbbbbbbbdlb',
    'ddbbbbbbbdlb',
    'lldbbbbbbdlb',
    'dddddddddddb',
  ],
  B: [
    'lllllldlllll',
    'bbbbbbdbbbbb',
    'bbbbbbdbbbbb',
    'dddddddddddd',
    'llldllllllld',
    'bbbdbbbbbbbd',
    'bbbdbbbbbbbd',
    'dddddddddddd',
    'lllllldlllll',
    'bbbbbbdbbbbb',
    'bbbbbbdbbbbb',
    'dddddddddddd',
  ],
  X: [
    'lllllllllllb',
    'llllllllllbd',
    'llbbbbbbbbdd',
    'llbbbbbbbbdd',
    'llbbbbbbbbdd',
    'llbbbbbbbbdd',
    'llbbbbbbbbdd',
    'llbbbbbbbbdd',
    'llbbbbbbbbdd',
    'llbbbbbbbbdd',
    'lbdddddddddd',
    'bddddddddddd',
  ],
  U: [
    'dddddddddddd',
    'dbbbbbbbbbbd',
    'dbdbbbbbbdbd',
    'dbbbbbbbbbbd',
    'dbbbbbbbbbbd',
    'dbbbbbbbbbbd',
    'dbbbbbbbbbbd',
    'dbbbbbbbbbbd',
    'dbbbbbbbbbbd',
    'dbdbbbbbbdbd',
    'dbbbbbbbbbbd',
    'dddddddddddd',
  ],
  '?': [
    'wwwwwwwwwwwk',
    'wqkqqqqqqkqk',
    'wqqqkkkkqqqk',
    'wqqkkqqkkqqk',
    'wqqkkqqkkqqk',
    'wqqqqqkkqqqk',
    'wqqqqkkqqqqk',
    'wqqqqkkqqqqk',
    'wqqqqqqqqqqk',
    'wqqqqkkqqqqk',
    'wqkqqqqqqkqk',
    'kkkkkkkkkkkk',
  ],
};

function drawPattern(fb, rows, px, py, pal) {
  for (let y = 0; y < TP; y++) for (let x = 0; x < TP; x++) fb.set(px + x, py + y, pal[rows[y][x]]);
}

// Pipes are two tiles (24px) wide. Column shades left to right: lit edge,
// highlight stripe, body, shadowed right side.
const G = C.GREEN;
const PIPE_TOP = [C.DARKGREEN, C.MINT, C.MINT, G, C.MINT, G, G, G, G, G, G, G, G, G, G, C.FOREST, G, C.FOREST, C.FOREST, C.FOREST, C.FOREST, C.FOREST, C.FOREST, C.DARKGREEN];
const PIPE_BODY = [C.DARKGREEN, C.MINT, G, C.MINT, G, G, G, G, G, G, G, G, G, C.FOREST, G, C.FOREST, C.FOREST, C.FOREST, C.FOREST, C.DARKGREEN];

function drawPipe(fb, px, py, isRight, isTop) {
  for (let x = 0; x < TP; x++) {
    const col = (isRight ? TP : 0) + x;
    if (isTop) {
      fb.rect(px + x, py, 1, TP, PIPE_TOP[col]);
      fb.set(px + x, py, C.DARKGREEN);
      fb.set(px + x, py + TP - 1, C.DARKGREEN);
    } else {
      const inner = col - 2; // body is inset 2px each side
      if (inner >= 0 && inner < PIPE_BODY.length) fb.rect(px + x, py, 1, TP, PIPE_BODY[inner]);
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
      const shimmer = [C.ORANGE, C.ORANGE, C.YELLOW, C.ORANGE][Math.floor(frame / 10) % 4];
      return drawPattern(fb, PATTERNS['?'], px, py, { q: shimmer, w: C.PALEYELLOW, k: C.BROWN });
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
      return fb.sprite(spr, px + Math.floor((TP - spr.w) / 2), py);
    }
    default:
  }
}

export function drawCastle(fb, px, py, theme) {
  // px,py = top-left of the bottom-left tile in pixels; castle is 5 tiles wide.
  const pal = { b: theme === 'underground' ? C.STEEL : C.DIRT, l: C.PEACH, d: C.BLACK };
  const brick = (x, y) => drawPattern(fb, PATTERNS.B, x, y, pal);
  const merlons = (x, y, n) => {
    for (let i = 0; i < n; i++) {
      fb.rect(x + i * 8 + 1, y - 5, 6, 5, pal.b);
      fb.rect(x + i * 8 + 1, y - 5, 6, 1, pal.l);
      fb.rect(x + i * 8 + 6, y - 4, 1, 4, pal.d);
    }
  };
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 5; tx++) brick(px + tx * TP, py - ty * TP);
  merlons(px, py - TP, 8);
  for (let tx = 1; tx < 4; tx++) brick(px + tx * TP, py - 2 * TP); // tower
  merlons(px + TP, py - 2 * TP, 5);
  // windows
  for (const wx of [px + TP + 4, px + 3 * TP + 4]) {
    fb.rect(wx, py - 2 * TP + 3, 4, 6, C.BLACK);
    fb.rect(wx + 1, py - 2 * TP + 2, 2, 1, C.BLACK);
  }
  // arched door
  fb.rect(px + 2 * TP + 1, py - TP + 4, TP - 2, TP + 8, C.BLACK);
  fb.rect(px + 2 * TP + 3, py - TP + 2, TP - 6, 2, C.BLACK);
}
