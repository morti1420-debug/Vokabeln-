// Practise the words of any finished lesson – or your starred, hard or all learned words – whenever you like.
// Answers go through the normal review rules: a correct answer on a word that is not due yet
// never skips an interval, a wrong answer brings it back tomorrow.

import { dayKey } from './dates.js';
import { REQUEUE_GAP, directionsFor } from './lesson.js';
import { OLD_ROUND, hardWordIds, poolFor } from './library.js';
import { shuffle, uuid } from './random.js';
import { applyAnswer, isLearned } from './srs.js';
import { clone, hasEvent, pushEvent } from './state.js';

export function openPractice(state) {
  const p = state.practice;
  return p && !p.completedAt ? p : null;
}

export function practiceToken(session) {
  return `${session.id}:${session.version}`;
}

export const PRACTICE_MAX = 20;

export function practiceWordIds(state, lessonId) {
  return state.lessons.some((l) => l.id === lessonId) ? poolFor(state, lessonId) : [];
}

// Starting a new practice replaces an unfinished one – practice is optional and never blocks learning.
// scope: a lesson id, 'all', 'starred' or 'hard'.
export function startWordPractice(state, scope, now = new Date()) {
  const pool = poolFor(state, scope, dayKey(now));
  if (!pool.length) return state;
  const s = clone(state);
  const id = uuid();
  // A lesson and today's new words are practised with all of their words; the older words are the 25 you have not
  // seen for the longest time; other pools are cut to 20 random cards.
  const isLessonScope = state.lessons.some((l) => l.id === scope);
  const ids =
    scope === 'old'
      ? pool.slice(0, OLD_ROUND)
      : shuffle(pool, `${id}:pick`).slice(0, isLessonScope || scope === 'today' ? pool.length : PRACTICE_MAX);
  const dirs = directionsFor(ids.length, `${id}:dir`);
  const lessonId = state.lessons.some((l) => l.id === scope) ? scope : null;
  s.practice = {
    id,
    scope,
    lessonId,
    startedAt: now.toISOString(),
    completedAt: null,
    items: ids.map((vocabId, i) => ({ vocabId, direction: dirs[i], status: 'pending', againCount: 0 })),
    queue: shuffle(ids, `${id}:order`),
    version: 0,
  };
  return s;
}

// "Meine schwierigen Wörter": at most ten different words, the most difficult first. You type every answer;
// a wrong one comes back a few cards later in the same round. The learning state of a word changes only
// with its first answer in the round – coming back only practises it.
export const HARD_ROUND_MAX = 10;

// ids: a round with these words instead (e.g. the words you did not know today).
export function startHardRound(state, now = new Date(), ids = hardWordIds(state)) {
  ids = ids.slice(0, HARD_ROUND_MAX);
  if (!ids.length) return state;
  const s = clone(state);
  const id = uuid();
  s.practice = {
    id,
    scope: 'hard',
    mode: 'type',
    lessonId: null,
    startedAt: now.toISOString(),
    completedAt: null,
    items: ids.map((vocabId) => ({ vocabId, direction: 'de-en', status: 'pending', againCount: 0, counted: false })),
    queue: shuffle(ids, `${id}:order`),
    version: 0,
  };
  return s;
}

export function ratePractice(state, { vocabId, rating, token, now = new Date() }) {
  const session = openPractice(state);
  if (!session || session.queue[0] !== vocabId) return { state, changed: false };
  if (token !== practiceToken(session) || hasEvent(state, token)) return { state, changed: false };
  if (rating !== 'remembered' && rating !== 'again') return { state, changed: false };
  const s = clone(state);
  const P = s.practice;
  const today = dayKey(now);
  const item = P.items.find((i) => i.vocabId === vocabId);
  const once = P.mode === 'type';
  if (isLearned(s.progress[vocabId]) && !(once && item.counted)) {
    s.progress[vocabId] = applyAnswer(s.progress[vocabId], { correct: rating === 'remembered', today });
  }
  if (once) item.counted = true;
  P.queue.shift();
  if (rating === 'remembered') item.status = 'remembered';
  else {
    item.againCount += 1;
    P.queue.splice(Math.min(REQUEUE_GAP, P.queue.length), 0, vocabId);
  }
  P.version += 1;
  pushEvent(s, { id: token, type: 'practice', lessonId: P.lessonId, vocabId, rating, at: now.toISOString(), day: today });
  if (!P.queue.length) P.completedAt = now.toISOString();
  return { state: s, changed: true };
}

export function practiceProgress(session) {
  return { done: session.items.filter((i) => i.status === 'remembered').length, total: session.items.length };
}
