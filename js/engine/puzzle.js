// Satz-Puzzle: the example sentence of a learned word is shown in your language; you build it in the language you
// learn from its shuffled words. No time limit. A wrong order is not simply cleared: the game shows from which
// word on the order is wrong, you can fix it from there or look at the solution.

import { shuffle } from './random.js';

export const PUZZLE_SIZE = 6;
export const PUZZLE_MIN_WORDS = 3;
export const PUZZLE_MAX_WORDS = 9;

// "Can I try this on?" → { words: ['can', 'I', 'try', 'this', 'on'], end: '?' }.
// Sentences with two speakers ("Coffee or tea? – I don't mind.") are left out.
export function puzzleParts(sentence, { lowerFirst = true } = {}) {
  const text = String(sentence ?? '').trim();
  if (!text || /\s[–—-]\s/.test(text) || /[.!?]\s/.test(text)) return null;
  const end = /[.!?]$/.test(text) ? text.at(-1) : '';
  const words = text
    .slice(0, end ? -1 : undefined)
    .split(/\s+/)
    .map((w) => w.replace(/^[„“"(]+|[,;:"“”)]+$/g, ''))
    .filter(Boolean);
  if (words.length < PUZZLE_MIN_WORDS || words.length > PUZZLE_MAX_WORDS) return null;
  // The capital letter of the first word would give the answer away. German keeps it (nouns are written with one).
  const first = words[0];
  if (lowerFirst && first !== 'I' && !/^I'/.test(first) && first.length > 1 && first[1] === first[1].toLowerCase()) words[0] = first[0].toLowerCase() + first.slice(1);
  return { words, end };
}

const partsOptions = (v) => ({ lowerFirst: v.course !== 'zh-de' });

export function puzzleEligible(vocabulary, ids) {
  const set = new Set(ids);
  return vocabulary.filter((v) => set.has(v.id) && puzzleParts(v.exampleEn, partsOptions(v))).map((v) => v.id);
}

// The words as tiles, never already in the right order.
function tilesFor(words, seed) {
  let tiles = shuffle([...words.keys()], seed);
  for (let i = 1; tiles.every((t, k) => words[t] === words[k]) && i < 8; i += 1) tiles = shuffle([...words.keys()], `${seed}:${i}`);
  return tiles.map((k) => words[k]);
}

function roundFor(game, index, byId) {
  const v = byId.get(game.ids[index]);
  const parts = puzzleParts(v.exampleEn, partsOptions(v));
  return { index, words: parts.words, end: parts.end, tiles: tilesFor(parts.words, `${game.seed}:${index}`), placed: [], mistakes: 0, firstWrong: null, phase: 'ask' };
}

export function newPuzzle(ids, byId, seed, size = PUZZLE_SIZE) {
  const game = { type: 'puzzle', seed, ids: shuffle(ids, seed).slice(0, size), results: [], done: false };
  return { ...game, ...roundFor(game, 0, byId) };
}

export const puzzleStars = (mistakes) => (mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1);

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// Returns { game, result: 'place' | 'wrong' | 'correct' | 'none' }.
export function puzzlePlace(game, tileIndex) {
  if (game.phase !== 'ask' || game.done || game.placed.includes(tileIndex) || tileIndex < 0 || tileIndex >= game.tiles.length) return { game, result: 'none' };
  const placed = [...game.placed, tileIndex];
  if (placed.length < game.tiles.length) return { game: { ...game, placed }, result: 'place' };
  const built = placed.map((i) => game.tiles[i]);
  const firstWrong = built.findIndex((w, k) => !same(w, game.words[k]));
  if (firstWrong < 0) {
    return { game: { ...game, placed, phase: 'feedback', results: [...game.results, { id: game.ids[game.index], stars: puzzleStars(game.mistakes), revealed: false }] }, result: 'correct' };
  }
  return { game: { ...game, placed, phase: 'check', firstWrong, mistakes: game.mistakes + 1 }, result: 'wrong' };
}

// After a wrong order: keep the correct beginning, put the rest back.
export function puzzleRetry(game) {
  if (game.phase !== 'check') return game;
  return { ...game, placed: game.placed.slice(0, game.firstWrong), firstWrong: null, phase: 'ask' };
}

export function puzzleUndo(game) {
  return game.phase === 'ask' && game.placed.length ? { ...game, placed: game.placed.slice(0, -1) } : game;
}

export function puzzleReveal(game) {
  if (game.done || (game.phase !== 'ask' && game.phase !== 'check')) return game;
  return { ...game, phase: 'feedback', firstWrong: null, results: [...game.results, { id: game.ids[game.index], stars: 0, revealed: true }] };
}

export function puzzleNext(game, byId) {
  if (game.phase !== 'feedback') return game;
  const index = game.index + 1;
  if (index >= game.ids.length) return { ...game, index, done: true };
  return { ...game, ...roundFor(game, index, byId) };
}

export function puzzleScore(game) {
  const stars = game.results.reduce((n, r) => n + r.stars, 0);
  return { stars, max: game.results.length * 3, solved: game.results.filter((r) => !r.revealed).length, total: game.results.length, missed: game.results.filter((r) => r.revealed || r.stars < 3).map((r) => r.id) };
}
