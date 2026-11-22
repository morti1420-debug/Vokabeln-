// Training games: "Paare finden" (matching), "Hören & Schreiben" (a word) and "Satz-Diktat" (a whole sentence).
// They are pure practice – they never change the review schedule – and live only in memory.

import { grade, gradeSentence } from './answer.js';
import { shuffle } from './random.js';

export const MATCH_ROUND = 6;
export const QUIZ_SIZE = 10;

export function newMatchGame(ids, seed) {
  const order = shuffle(ids, seed);
  const rounds = [];
  for (let i = 0; i < order.length; i += MATCH_ROUND) rounds.push(order.slice(i, i + MATCH_ROUND));
  // A last round with a single pair is no game – merge it into the round before.
  if (rounds.length > 1 && rounds.at(-1).length < 2) rounds.at(-2).push(...rounds.pop());
  return { type: 'match', seed, rounds, round: 0, selected: null, matched: [], misses: 0, missedIds: [], done: false, total: order.length };
}

export function matchTiles(game) {
  const ids = game.rounds[game.round] ?? [];
  return { en: shuffle(ids, `${game.seed}:${game.round}:en`), de: shuffle(ids, `${game.seed}:${game.round}:de`) };
}

export function matchedSoFar(game) {
  return game.rounds.slice(0, game.round).reduce((n, r) => n + r.length, 0) + game.matched.length;
}

// Returns { game, result: 'none' | 'select' | 'unselect' | 'match' | 'miss', ids }.
export function matchPick(game, side, id) {
  if (game.done || game.matched.includes(id)) return { game, result: 'none' };
  const sel = game.selected;
  if (!sel || sel.side === side) {
    if (sel && sel.id === id) return { game: { ...game, selected: null }, result: 'unselect' };
    return { game: { ...game, selected: { side, id } }, result: 'select' };
  }
  if (sel.id === id) {
    const matched = [...game.matched, id];
    const roundDone = matched.length === game.rounds[game.round].length;
    const last = game.round === game.rounds.length - 1;
    const next = roundDone
      ? { ...game, selected: null, matched: last ? matched : [], round: last ? game.round : game.round + 1, done: last }
      : { ...game, selected: null, matched };
    return { game: next, result: 'match', ids: [id] };
  }
  const missedIds = [...new Set([...game.missedIds, sel.id, id])];
  return { game: { ...game, selected: null, misses: game.misses + 1, missedIds }, result: 'miss', ids: [sel.id, id] };
}

// Dictation and speaking: up to ten words, answered in English.
export function newQuiz(type, ids, seed, size = QUIZ_SIZE) {
  return { type, seed, ids: shuffle(ids, seed).slice(0, size), index: 0, answers: [], phase: 'ask', tries: 0, heard: null, done: false };
}

export function quizCurrent(game) {
  return game.ids[game.index] ?? null;
}

// alternatives: what was typed, or every transcript the speech recogniser offered.
export function quizAnswer(game, vocab, alternatives) {
  if (game.phase !== 'ask' || game.done) return game;
  const list = (Array.isArray(alternatives) ? alternatives : [alternatives]).filter((a) => a && a.trim());
  const graded = list.map((given) => ({ given, ...grade(given, vocab, 'de-en') }));
  const best = graded.find((g) => g.isCorrect) ?? graded[0] ?? { given: '', isCorrect: false, verdict: 'wrong' };
  return { ...game, phase: 'feedback', heard: best.given, answers: [...game.answers, { id: vocab.id, given: best.given, isCorrect: best.isCorrect, verdict: best.verdict }] };
}

// Speaking: a miss can be retried before the solution is shown.
export function quizRetry(game) {
  if (game.phase !== 'feedback' || game.answers.at(-1)?.isCorrect) return game;
  return { ...game, phase: 'ask', tries: game.tries + 1, answers: game.answers.slice(0, -1) };
}

export function quizSkip(game, vocabId) {
  if (game.phase !== 'ask' || game.done) return game;
  return { ...game, phase: 'feedback', heard: null, answers: [...game.answers, { id: vocabId, given: '', isCorrect: false, verdict: 'wrong', skipped: true }] };
}

export function quizNext(game) {
  if (game.phase !== 'feedback') return game;
  const index = game.index + 1;
  return { ...game, index, phase: 'ask', tries: 0, heard: null, done: index >= game.ids.length };
}

// Satz-Diktat: the example sentence of a word is heard and typed. Case, punctuation and contractions never matter;
// one small slip (a word missing, extra or misspelled) still counts as right.
export function dictationAnswer(game, vocab, given) {
  if (game.phase !== 'ask' || game.done) return game;
  const r = gradeSentence(given, vocab);
  return { ...game, phase: 'feedback', heard: given, answers: [...game.answers, { id: vocab.id, given, isCorrect: r.isCorrect, verdict: r.verdict }] };
}

export function quizScore(game) {
  const correct = game.answers.filter((a) => a.isCorrect).length;
  return { correct, total: game.answers.length, wrong: game.answers.filter((a) => !a.isCorrect).map((a) => a.id) };
}
