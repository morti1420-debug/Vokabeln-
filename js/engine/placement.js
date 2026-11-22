// Einstufungstest: a quick multiple-choice check of words you have not learned yet – ten per level. The words you
// know are sorted out, and a level you know almost completely can be skipped as a whole, so the lessons only teach
// what is really new. Everything can be taken back (see undoPlacement).

import { shuffle } from './random.js';
import { usedVocabIds } from './selection.js';
import { markKnown, newProgress } from './srs.js';
import { clone } from './state.js';

export const PLACEMENT_LEVELS = ['A1', 'A2', 'B1'];
export const PLACEMENT_PER_LEVEL = 10;
// A level can be skipped as a whole with at most one wrong answer.
export const PLACEMENT_PASS = 9;

const unusedOf = (vocabulary, state, level) => {
  const used = usedVocabIds(state);
  return vocabulary.filter((v) => v.cefr === level && !used.has(v.id)).sort((a, b) => a.frequencyRank - b.frequencyRank);
};

// [{ vocabId, level, options: [vocabId × 4] }] – the words are spread evenly over each level (common and rare ones),
// the wrong options have the same level and, where possible, the same kind of word.
export function placementQuestions(vocabulary, state, seed) {
  const out = [];
  for (const level of PLACEMENT_LEVELS) {
    const pool = unusedOf(vocabulary, state, level);
    const count = Math.min(PLACEMENT_PER_LEVEL, pool.length);
    if (count < 4) continue;
    const all = vocabulary.filter((v) => v.cefr === level);
    for (let i = 0; i < count; i += 1) {
      const word = pool[Math.floor(((i + 0.5) * pool.length) / count)];
      const others = all.filter((v) => v.id !== word.id && v.german !== word.german && v.english !== word.english);
      const same = others.filter((v) => v.partOfSpeech === word.partOfSpeech);
      const wrong = shuffle(same.length >= 3 ? same : others, `${seed}:${word.id}:w`).slice(0, 3);
      out.push({ vocabId: word.id, level, options: shuffle([word, ...wrong].map((v) => v.id), `${seed}:${word.id}:o`) });
    }
  }
  return out;
}

// answers[i]: the chosen vocabId, or null for "I don't know". → { A1: { correct, total, pass }, … } and the known ids.
export function placementResult(questions, answers) {
  const levels = {};
  const knownIds = [];
  questions.forEach((q, i) => {
    const row = (levels[q.level] ??= { correct: 0, total: 0, pass: false });
    row.total += 1;
    if (answers[i] === q.vocabId) {
      row.correct += 1;
      knownIds.push(q.vocabId);
    }
  });
  for (const row of Object.values(levels)) row.pass = row.total >= PLACEMENT_PER_LEVEL && row.correct >= PLACEMENT_PASS;
  return { levels, knownIds };
}

// How many new words skipping these levels would sort out (words you are learning are never touched).
export function placementSkipCount(vocabulary, state, levels) {
  return levels.reduce((n, level) => n + unusedOf(vocabulary, state, level).length, 0);
}

// Sorts out the words answered right and every new word of the chosen levels. They are marked `via: 'placement'`.
export function applyPlacement(state, vocabulary, { knownIds = [], levels = [] }, today) {
  const used = usedVocabIds(state);
  const ids = new Set(knownIds.filter((id) => !used.has(id)));
  for (const level of levels) for (const v of unusedOf(vocabulary, state, level)) ids.add(v.id);
  if (!ids.size) return state;
  const s = clone(state);
  for (const id of ids) s.progress[id] = { ...markKnown(newProgress(id), today), via: 'placement' };
  return s;
}

export const placementIds = (state) =>
  Object.values(state.progress)
    .filter((p) => p.via === 'placement' && p.status === 'known')
    .map((p) => p.vocabId);

// Takes the placement back: the sorted-out words are new again (they come up in the lessons as before).
export function undoPlacement(state) {
  const ids = placementIds(state);
  if (!ids.length) return state;
  const s = clone(state);
  for (const id of ids) delete s.progress[id];
  return s;
}
