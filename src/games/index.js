import Blockfall from './blockfall.js';
import DuckBlaster from './duck-blaster.js';
import PipeRunner from './pipe-runner/index.js';
import Snake from './snake.js';

export const GAMES = [PipeRunner, Snake, Blockfall, DuckBlaster];

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export function findGame(name) {
  if (!name) return null;
  const n = norm(name);
  const idx = Number(name);
  if (Number.isInteger(idx) && idx >= 1 && idx <= GAMES.length) return GAMES[idx - 1];
  return GAMES.find((g) => norm(g.id) === n || norm(g.title) === n || (g.aliases || []).some((a) => norm(a) === n)) || null;
}
