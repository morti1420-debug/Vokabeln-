import { grade, gradeSentence } from './answer.js';
import { SENTENCE_ALTERNATIVES } from '../../data/sentence-alternatives.js';
import { dayKey, diffDays, weekStart } from './dates.js';
import { directionsFor } from './lesson.js';
import { shuffle, uuid } from './random.js';
import { applyAnswer, errorRate, isHardWord, isLearned } from './srs.js';
import { clone, hasEvent, pushEvent } from './state.js';

export const DAILY_SIZE = 10;
export const WEEKLY_SIZE = 20;
export const DAILY_MAX = 30;

function learnedWords(state, today) {
  return Object.values(state.progress).filter((p) => isLearned(p) && p.firstLearnedDay <= today);
}

// A short sentence to type now and then: never every question, only short example sentences.
export const SENTENCE_MAX_WORDS = 7;
export const isShortSentence = (vocab) => Boolean(vocab?.exampleEn) && vocab.exampleEn.split(/\s+/).length <= SENTENCE_MAX_WORDS;

function newTest(type, vocabIds, now, extra, { sentences = 0, vocabById = null, from = vocabIds } = {}) {
  const id = uuid();
  const order = shuffle(vocabIds, id);
  const dirs = directionsFor(order.length, `${id}:dir`);
  // Sentence questions are asked native → learned, like all questions.
  const deEn = new Set(order.filter((_, i) => dirs[i] === 'de-en'));
  const sentenceIds = new Set(
    vocabById ? shuffle(from.filter((vid) => deEn.has(vid) && isShortSentence(vocabById.get(vid))), `${id}:sentence`).slice(0, sentences) : [],
  );
  return {
    id,
    type,
    ...extra,
    startedAt: now.toISOString(),
    startedDay: dayKey(now),
    completedAt: null,
    completedDay: null,
    questions: order.map((vocabId, i) => (sentenceIds.has(vocabId) ? { vocabId, direction: 'de-en', kind: 'sentence' } : { vocabId, direction: dirs[i] })),
    answers: [],
    currentIndex: 0,
  };
}

export function testToken(test) {
  return `${test.id}:${test.answers.length}`;
}

export function dailyTestFor(state, lessonId) {
  return state.tests.find((t) => t.type === 'daily' && t.lessonId === lessonId) ?? null;
}

export const REFRESH_COUNT = 2;

// Older words that deserve a check: the words marked difficult first, then the most error-prone, then the
// words not seen for the longest time.
function refreshCandidates(state, today, exclude) {
  return learnedWords(state, today)
    .filter((p) => !exclude.has(p.vocabId) && p.firstLearnedDay < today)
    .sort(
      (a, b) =>
        Number(isHardWord(b)) - Number(isHardWord(a)) ||
        errorRate(b) - errorRate(a) ||
        (a.lastReviewedDay ?? '').localeCompare(b.lastReviewedDay ?? '') ||
        a.vocabId.localeCompare(b.vocabId),
    );
}

// Daily test: the lesson's learned words (up to 30) plus two older words – difficult ones first – so older
// words are checked too. A small lesson is filled up to 10 questions with older words.
export function startDailyTest(state, lessonId, now = new Date(), vocabById = null) {
  const lesson = state.lessons.find((l) => l.id === lessonId);
  if (!lesson?.completedAt || dailyTestFor(state, lessonId)) return state;
  const today = dayKey(now);
  const ids = lesson.items.filter((i) => i.status === 'remembered').map((i) => i.vocabId).slice(0, DAILY_MAX - REFRESH_COUNT);
  const extra = Math.max(DAILY_SIZE - ids.length, REFRESH_COUNT);
  ids.push(...refreshCandidates(state, today, new Set(ids)).slice(0, extra).map((p) => p.vocabId));
  if (!ids.length) return state;
  const s = clone(state);
  const lessonIds = ids.filter((vid) => lesson.items.some((i) => i.vocabId === vid));
  s.tests.push(newTest('daily', ids.slice(0, DAILY_MAX), now, { lessonId }, { sentences: 1, vocabById, from: lessonIds }));
  return s;
}

export function weeklyStatus(state, now = new Date()) {
  const today = dayKey(now);
  const weekKey = weekStart(today);
  const open = state.tests.find((t) => t.type === 'weekly' && t.weekKey === weekKey && !t.completedAt) ?? null;
  const done = state.tests.find((t) => t.type === 'weekly' && t.weekKey === weekKey && t.completedAt) ?? null;
  const eligible = learnedWords(state, weekKey).length > 0;
  return { weekKey, open, done, available: !done && (Boolean(open) || eligible) };
}

// Weekly test – long-term memory: words learned at least a week ago (all words while there are too few).
// ~40 % difficult or often wrong, ~40 % solid words not seen for a long time, the rest still being learned.
export const WEEKLY_MIN_AGE = 7;

export function startWeeklyTest(state, now = new Date(), vocabById = null) {
  const status = weeklyStatus(state, now);
  if (!status.available || status.open) return state;
  const today = dayKey(now);
  const seed = `${status.weekKey}:${state.tests.length}`;
  const all = learnedWords(state, today);
  const old = all.filter((p) => diffDays(p.firstLearnedDay, today) >= WEEKLY_MIN_AGE);
  const pool = old.length >= WEEKLY_SIZE / 2 ? old : all;
  const n = Math.min(WEEKLY_SIZE, pool.length);
  const chosen = new Set();
  const take = (list, count) => {
    for (const p of list) {
      if (chosen.size >= n || count <= 0) break;
      if (!chosen.has(p.vocabId)) {
        chosen.add(p.vocabId);
        count--;
      }
    }
  };
  take([...pool].filter((p) => isHardWord(p) || p.wrongCount > 0).sort((a, b) => Number(isHardWord(b)) - Number(isHardWord(a)) || errorRate(b) - errorRate(a) || b.wrongCount - a.wrongCount), Math.round(n * 0.4));
  take([...pool].filter((p) => p.status === 'reviewing' || p.status === 'mastered').sort((a, b) => (a.lastReviewedDay ?? '').localeCompare(b.lastReviewedDay ?? '') || a.vocabId.localeCompare(b.vocabId)), Math.round(n * 0.4));
  take(shuffle(pool.filter((p) => p.status === 'learning'), `${seed}:u`), n);
  take(shuffle(pool, `${seed}:f`), n);
  if (!chosen.size) return state;
  const s = clone(state);
  s.tests.push(newTest('weekly', [...chosen], now, { weekKey: status.weekKey }, { sentences: 2, vocabById }));
  return s;
}

export function openTest(state) {
  return state.tests.find((t) => !t.completedAt) ?? null;
}

export function awaitingNext(test) {
  return test.answers.length === test.currentIndex + 1;
}

export function answerQuestion(state, vocabById, { testId, given, token, now = new Date() }) {
  const test = state.tests.find((t) => t.id === testId);
  if (!test || test.completedAt || test.answers.length !== test.currentIndex) return { state, changed: false };
  if (token !== testToken(test) || hasEvent(state, token)) return { state, changed: false };
  const q = test.questions[test.currentIndex];
  const vocab = vocabById.get(q.vocabId);
  if (!vocab) return { state, changed: false };

  const s = clone(state);
  const T = s.tests.find((t) => t.id === testId);
  const today = dayKey(now);
  const result = q.kind === 'sentence' ? gradeSentence(given, vocab, SENTENCE_ALTERNATIVES[vocab.id] ?? []) : grade(given, vocab, q.direction, vocabById.values());
  const before = s.progress[q.vocabId] ? structuredClone(s.progress[q.vocabId]) : null;
  if (before && isLearned(before)) {
    s.progress[q.vocabId] = applyAnswer(before, { correct: result.isCorrect, today, typed: true });
  }
  T.answers.push({
    vocabId: q.vocabId,
    direction: q.direction,
    ...(q.kind ? { kind: q.kind } : {}),
    given: String(given ?? '').trim(),
    verdict: result.verdict,
    isCorrect: result.isCorrect,
    expected: result.expected,
    ...(result.synonym ? { synonym: result.synonym } : {}),
    ...(result.confusedWith ? { confusedWith: result.confusedWith } : {}),
    overridden: false,
    before,
  });
  pushEvent(s, { id: token, type: 'test', testId, vocabId: q.vocabId, correct: result.isCorrect, at: now.toISOString(), day: today });
  return { state: s, changed: true, result };
}

// "Meine Antwort war richtig" – only for the answer currently on screen, so the snapshot is still valid.
export function overrideLastAnswer(state, { testId, now = new Date() }) {
  const test = state.tests.find((t) => t.id === testId);
  if (!test || test.completedAt || !awaitingNext(test)) return { state, changed: false };
  const last = test.answers.at(-1);
  if (last.isCorrect || last.overridden) return { state, changed: false };
  const s = clone(state);
  const T = s.tests.find((t) => t.id === testId);
  const a = T.answers.at(-1);
  if (a.before && isLearned(a.before)) {
    s.progress[a.vocabId] = applyAnswer(a.before, { correct: true, today: dayKey(now), typed: true });
  }
  a.isCorrect = true;
  a.overridden = true;
  return { state: s, changed: true };
}

export function nextQuestion(state, { testId, now = new Date() }) {
  const test = state.tests.find((t) => t.id === testId);
  if (!test || test.completedAt || !awaitingNext(test)) return { state, changed: false };
  const s = clone(state);
  const T = s.tests.find((t) => t.id === testId);
  delete T.answers.at(-1).before;
  T.currentIndex += 1;
  if (T.currentIndex >= T.questions.length) {
    T.completedAt = now.toISOString();
    T.completedDay = dayKey(now);
  }
  return { state: s, changed: true };
}

export function testSummary(test) {
  const correct = test.answers.filter((a) => a.isCorrect);
  const incorrect = test.answers.filter((a) => !a.isCorrect);
  const total = test.questions.length;
  return {
    total,
    correct: correct.length,
    accuracy: total ? Math.round((correct.length / total) * 100) : 0,
    // "Meine Antwort war richtig": counted as correct, but always shown separately.
    selfCorrected: test.answers.filter((a) => a.overridden).length,
    correctAnswers: correct,
    incorrectAnswers: incorrect,
    wordsToReview: [...new Set(incorrect.map((a) => a.vocabId))],
  };
}
