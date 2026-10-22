// The NES (2C02) master palette. Every pixel in the arcade is an index into
// this table, which keeps frames tiny and makes GIF export trivial.
// 0x28 and 0x38 are warmed up from the stock (olive) values to read as yellow.
export const NES = [
  [84, 84, 84], [0, 30, 116], [8, 16, 144], [48, 0, 136], [68, 0, 100], [92, 0, 48], [84, 4, 0], [60, 24, 0],
  [32, 42, 0], [8, 58, 0], [0, 64, 0], [0, 60, 0], [0, 50, 60], [0, 0, 0], [0, 0, 0], [0, 0, 0],
  [152, 150, 152], [8, 76, 196], [48, 50, 236], [92, 30, 228], [136, 20, 176], [160, 20, 100], [152, 34, 32], [120, 60, 0],
  [84, 90, 0], [40, 114, 0], [8, 124, 0], [0, 118, 40], [0, 102, 120], [0, 0, 0], [0, 0, 0], [0, 0, 0],
  [236, 238, 236], [76, 154, 236], [120, 124, 236], [176, 98, 236], [228, 84, 236], [236, 88, 180], [236, 106, 100], [212, 136, 32],
  [244, 192, 32], [116, 196, 0], [76, 208, 32], [56, 204, 108], [56, 180, 204], [60, 60, 60], [0, 0, 0], [0, 0, 0],
  [236, 238, 236], [168, 204, 236], [188, 188, 236], [212, 178, 236], [236, 174, 236], [236, 174, 212], [236, 180, 176], [228, 196, 144],
  [248, 224, 136], [180, 222, 120], [168, 226, 144], [152, 226, 180], [160, 214, 228], [160, 162, 160], [0, 0, 0], [0, 0, 0],
];

// Named colours used across games.
export const C = {
  BLACK: 0x0f,
  DARKGRAY: 0x2d,
  GRAY: 0x00,
  LIGHTGRAY: 0x10,
  SILVER: 0x3d,
  WHITE: 0x30,
  NAVY: 0x01,
  BLUE: 0x12,
  SKYBLUE: 0x21,
  SKY: 0x22,
  PALEBLUE: 0x31,
  CYAN: 0x2c,
  PALECYAN: 0x3c,
  PURPLE: 0x13,
  VIOLET: 0x23,
  MAGENTA: 0x24,
  PINK: 0x25,
  DARKRED: 0x06,
  RED: 0x16,
  SALMON: 0x26,
  BROWN: 0x07,
  DIRT: 0x17,
  ORANGE: 0x27,
  SKIN: 0x37,
  PEACH: 0x36,
  OLIVE: 0x18,
  YELLOW: 0x28,
  PALEYELLOW: 0x38,
  DARKGREEN: 0x0a,
  FOREST: 0x1a,
  GREEN: 0x2a,
  LIME: 0x29,
  MINT: 0x3a,
  TEAL: 0x1b,
  STEEL: 0x1c,
  PALESTEEL: 0x2c,
  SEA: 0x2b,
};

export const TRANSPARENT = 255;

// Nearest xterm-256 colour for terminals without truecolor.
function nearest256([r, g, b]) {
  const levels = [0, 95, 135, 175, 215, 255];
  const q = (v) => levels.reduce((bi, l, i) => (Math.abs(l - v) < Math.abs(levels[bi] - v) ? i : bi), 0);
  const [qr, qg, qb] = [q(r), q(g), q(b)];
  const cube = 16 + 36 * qr + 6 * qg + qb;
  const cubeDist = (levels[qr] - r) ** 2 + (levels[qg] - g) ** 2 + (levels[qb] - b) ** 2;
  const avg = (r + g + b) / 3;
  const gi = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const gv = 8 + gi * 10;
  const grayDist = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return grayDist < cubeDist ? 232 + gi : cube;
}

export const NES_256 = NES.map(nearest256);

export function fgCode(index, mode) {
  const [r, g, b] = NES[index];
  return mode === 'truecolor' ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${NES_256[index]}m`;
}

export function bgCode(index, mode) {
  const [r, g, b] = NES[index];
  return mode === 'truecolor' ? `\x1b[48;2;${r};${g};${b}m` : `\x1b[48;5;${NES_256[index]}m`;
}

// Arbitrary RGB, used by the text UI (banner gradients etc).
export function rgbFg(r, g, b, mode) {
  return mode === 'truecolor' ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${nearest256([r, g, b])}m`;
}
