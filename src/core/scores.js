import { paths, readJSON, writeJSON } from './config.js';

const MAX = 10;

export function loadScores() {
  return readJSON(paths.scores, {});
}

export function topScores(gameId) {
  return loadScores()[gameId] || [];
}

export function bestScore(gameId) {
  return topScores(gameId)[0]?.score || 0;
}

// Returns the 1-based rank if the score made the table, otherwise 0.
export function addScore(gameId, name, score, extra = {}) {
  if (!score) return 0;
  const all = loadScores();
  const list = all[gameId] || [];
  const entry = { name, score, date: new Date().toISOString(), ...extra };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  all[gameId] = list.slice(0, MAX);
  writeJSON(paths.scores, all);
  const rank = all[gameId].indexOf(entry) + 1;
  return rank;
}
