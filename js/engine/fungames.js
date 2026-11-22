// Three more training games: "Blitz" (60 seconds, multiple choice), "Wort bauen" (letter tiles) and "Memory" (turn cards).
// Like the other games they are pure practice – they never touch the review schedule and live only in memory.
// All functions are pure; time is passed in by the app (milliseconds), so everything is testable.

import { shuffle } from './random.js';

/* ---------------- Blitz ---------------- */

export const BLITZ_SECONDS = 60;
export const BLITZ_OPTIONS = 4;
export const BLITZ_PENALTY_MS = 3000;

export function newBlitz(ids, seed, nowMs, seconds = BLITZ_SECONDS) {
  return { type: 'blitz', seed, ids: shuffle(ids, seed), index: 0, seconds, startedAt: nowMs, penaltyMs: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, wrong: 0, missedIds: [], done: false, last: null };
}

export function blitzRemainingMs(game, nowMs) {
  return Math.max(0, game.seconds * 1000 - (nowMs - game.startedAt) - game.penaltyMs);
}

// The text of a word on the side that is shown/answered ("en" = the language being learned, "de" = the native one).
const sideText = (v, side) => (side === 'en' ? v.english : v.german);

// Question number `index`: a word, the direction and four options (one correct), the same for the same seed.
export function blitzQuestion(game, vocabulary, byId) {
  const id = game.ids[game.index % game.ids.length];
  const v = byId.get(id);
  const dir = 'de'; // dir = side of the PROMPT: always German, the English answer is picked
  const answerSide = dir === 'en' ? 'de' : 'en';
  const correctText = sideText(v, answerSide);
  const seen = new Set([correctText.toLowerCase()]);
  const sameKind = shuffle(vocabulary.filter((w) => w.id !== id && w.partOfSpeech === v.partOfSpeech), `${game.seed}:o:${game.index}`);
  const others = shuffle(vocabulary.filter((w) => w.id !== id && w.partOfSpeech !== v.partOfSpeech), `${game.seed}:p:${game.index}`);
  const options = [{ id, text: correctText }];
  for (const w of [...sameKind, ...others]) {
    const text = sideText(w, answerSide);
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    options.push({ id: w.id, text });
    if (options.length === BLITZ_OPTIONS) break;
  }
  return { id, dir, prompt: sideText(v, dir), options: shuffle(options, `${game.seed}:s:${game.index}`) };
}

// Finishes the game when the time is up. Returns the same object when nothing changes.
export function blitzTick(game, nowMs) {
  if (game.done || blitzRemainingMs(game, nowMs) > 0) return game;
  return { ...game, done: true };
}

// Returns { game, result: 'correct' | 'wrong' | 'none', points }.
export function blitzAnswer(game, questionId, optionId, nowMs) {
  const ticked = blitzTick(game, nowMs);
  if (ticked.done) return { game: ticked, result: 'none', points: 0 };
  if (optionId === questionId) {
    const points = 10 + Math.min(game.streak, 10) * 2; // a streak earns a growing bonus
    const streak = game.streak + 1;
    return { game: { ...game, index: game.index + 1, score: game.score + points, streak, bestStreak: Math.max(game.bestStreak, streak), correct: game.correct + 1, last: { result: 'correct', points } }, result: 'correct', points };
  }
  return {
    game: { ...game, index: game.index + 1, streak: 0, wrong: game.wrong + 1, penaltyMs: game.penaltyMs + BLITZ_PENALTY_MS, missedIds: [...new Set([...game.missedIds, questionId])], last: { result: 'wrong', points: 0 } },
    result: 'wrong',
    points: 0,
  };
}

/* ---------------- Wort bauen (letter tiles) ---------------- */

export const SCRAMBLE_SIZE = 8;
const ARTICLES = /^(der|die|das|ein|eine|el|la)\s+/i;

// The word to build: single words made of letters only (without "to " or an article), 3 to 12 letters.
export function scrambleTarget(text) {
  const word = String(text ?? '').trim().replace(/^to\s+/i, '').replace(ARTICLES, '');
  return /^\p{L}{3,12}$/u.test(word) ? word : null;
}

export function scrambleEligible(vocabulary, ids) {
  const set = new Set(ids);
  return vocabulary.filter((v) => set.has(v.id) && scrambleTarget(v.english)).map((v) => v.id);
}

function tilesFor(target, seed) {
  const letters = [...target.toLowerCase()];
  let tiles = shuffle(letters, seed);
  for (let i = 1; tiles.join('') === letters.join('') && i < 6; i += 1) tiles = shuffle(letters, `${seed}:${i}`); // never hand out the solved word
  return tiles;
}

export function newScramble(ids, byId, seed, size = SCRAMBLE_SIZE) {
  const picked = shuffle(ids, seed).slice(0, size);
  return { type: 'scramble', seed, ids: picked, index: 0, tiles: tilesFor(scrambleTarget(byId.get(picked[0]).english), `${seed}:0`), placed: [], hints: 0, mistakes: 0, phase: 'ask', results: [], done: false };
}

export const scrambleStars = (mistakes, hints) => (mistakes + hints === 0 ? 3 : mistakes + hints === 1 ? 2 : 1);

// tileIndex: which tile was tapped. A full wrong word clears the board (a mistake); the right one ends the word.
// Returns { game, result: 'place' | 'wrong' | 'correct' | 'none' }.
export function scramblePlace(game, target, tileIndex) {
  if (game.phase !== 'ask' || game.done || game.placed.includes(tileIndex) || tileIndex < 0 || tileIndex >= game.tiles.length) return { game, result: 'none' };
  const placed = [...game.placed, tileIndex];
  if (placed.length < game.tiles.length) return { game: { ...game, placed }, result: 'place' };
  const built = placed.map((i) => game.tiles[i]).join('');
  if (built === target.toLowerCase()) {
    const stars = scrambleStars(game.mistakes, game.hints);
    return { game: { ...game, placed, phase: 'feedback', results: [...game.results, { id: game.ids[game.index], stars, revealed: false }] }, result: 'correct' };
  }
  return { game: { ...game, placed: [], mistakes: game.mistakes + 1 }, result: 'wrong' };
}

export function scrambleUndo(game) {
  return game.phase === 'ask' && game.placed.length ? { ...game, placed: game.placed.slice(0, -1) } : game;
}

// A hint puts the next correct letter in place (and clears the letters that were wrong so far).
export function scrambleHint(game, target) {
  if (game.phase !== 'ask' || game.done) return { game, result: 'none' };
  const word = [...target.toLowerCase()];
  let placed = [];
  for (const i of game.placed) {
    if (game.tiles[i] === word[placed.length]) placed.push(i);
    else break;
  }
  const want = word[placed.length];
  const tile = game.tiles.findIndex((ch, i) => ch === want && !placed.includes(i));
  if (tile < 0) return { game, result: 'none' };
  return scramblePlace({ ...game, placed, hints: game.hints + 1 }, target, tile);
}

export function scrambleSkip(game) {
  if (game.phase !== 'ask' || game.done) return game;
  return { ...game, phase: 'feedback', placed: [], results: [...game.results, { id: game.ids[game.index], stars: 0, revealed: true }] };
}

export function scrambleNext(game, byId) {
  if (game.phase !== 'feedback') return game;
  const index = game.index + 1;
  if (index >= game.ids.length) return { ...game, index, phase: 'ask', done: true };
  return { ...game, index, tiles: tilesFor(scrambleTarget(byId.get(game.ids[index]).english), `${game.seed}:${index}`), placed: [], hints: 0, mistakes: 0, phase: 'ask' };
}

export function scrambleScore(game) {
  const stars = game.results.reduce((n, r) => n + r.stars, 0);
  return { stars, max: game.results.length * 3, solved: game.results.filter((r) => !r.revealed).length, total: game.results.length, missed: game.results.filter((r) => r.revealed || r.stars < 3).map((r) => r.id) };
}

/* ---------------- Memory ---------------- */

export const MEMORY_PAIRS = 6;

export function newMemory(ids, seed, pairs = MEMORY_PAIRS) {
  const picked = shuffle(ids, seed).slice(0, pairs);
  const cards = shuffle(picked.flatMap((id) => [{ id, side: 'en' }, { id, side: 'de' }]), `${seed}:cards`);
  return { type: 'memory', seed, cards, open: [], matched: [], moves: 0, missedIds: [], pending: false, done: false, pairs: picked.length };
}

// Returns { game, result: 'none' | 'flip' | 'match' | 'miss' }. After a miss the two cards stay open until memoryClose().
export function memoryFlip(game, index) {
  if (game.done || game.pending || index < 0 || index >= game.cards.length) return { game, result: 'none' };
  const card = game.cards[index];
  if (game.matched.includes(card.id) || game.open.includes(index)) return { game, result: 'none' };
  if (game.open.length === 0) return { game: { ...game, open: [index] }, result: 'flip' };
  const first = game.cards[game.open[0]];
  const moves = game.moves + 1;
  if (first.id === card.id && first.side !== card.side) {
    const matched = [...game.matched, card.id];
    return { game: { ...game, open: [], matched, moves, done: matched.length === game.pairs }, result: 'match' };
  }
  return { game: { ...game, open: [...game.open, index], moves, pending: true, missedIds: [...new Set([...game.missedIds, first.id, card.id])] }, result: 'miss' };
}

export function memoryClose(game) {
  return game.pending ? { ...game, open: [], pending: false } : game;
}

// 3 stars for a very efficient game (about one extra try per pair at most 1.5 x pairs), 2 for up to 2.2 x, else 1.
export function memoryStars(game) {
  const ratio = game.moves / Math.max(1, game.pairs);
  return ratio <= 1.7 ? 3 : ratio <= 2.6 ? 2 : 1;
}
