import { addDays } from './dates.js';

// Stage → days until the next review. Stage 1 is reached when a word is learned (Tag 1 → Tag 2),
// so the agreed rhythm Tag 2 / Tag 4 / Tag 8 falls out of stages 1–3.
export const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64];
export const MAX_STAGE = INTERVALS.length - 1;

export const MASTERY = { minStage: 5, minConsecutive: 3, minTypedCorrect: 1 };

export function newProgress(vocabId) {
  return {
    vocabId,
    status: 'new',
    stage: 0,
    intervalDays: 0,
    firstLearnedDay: null,
    lastReviewedDay: null,
    lastStageChangeDay: null,
    nextDueDay: null,
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    typedCorrectCount: 0,
    lapses: 0,
    knownDay: null,
  };
}

export function deriveStatus(p) {
  if (p.status === 'known') return 'known';
  if (!p.firstLearnedDay) return 'new';
  if (
    p.stage >= MASTERY.minStage &&
    p.consecutiveCorrect >= MASTERY.minConsecutive &&
    p.typedCorrectCount >= MASTERY.minTypedCorrect
  ) {
    return 'mastered';
  }
  return p.stage >= 3 ? 'reviewing' : 'learning';
}

export function isLearned(p) {
  return Boolean(p && p.firstLearnedDay && p.status !== 'known');
}

export function errorRate(p) {
  const total = p.correctCount + p.wrongCount;
  return total === 0 ? 0 : p.wrongCount / total;
}

// "Already Know" on first contact: excluded from learning, never counted as learned.
export function markKnown(p, today) {
  return { ...p, status: 'known', knownDay: today };
}

// "Practice Again" while a word is still being introduced in a lesson.
export function recordLessonMiss(p) {
  return { ...p, wrongCount: p.wrongCount + 1 };
}

// First "Remembered" for a new word inside a lesson → stage 1, due tomorrow.
export function learnWord(p, today) {
  const q = {
    ...p,
    stage: 1,
    intervalDays: INTERVALS[1],
    firstLearnedDay: today,
    lastReviewedDay: today,
    lastStageChangeDay: today,
    nextDueDay: addDays(today, INTERVALS[1]),
    correctCount: p.correctCount + 1,
  };
  q.status = deriveStatus(q);
  return q;
}

// How a word is going, from its own history only – simple and explainable:
// - 'hard': forgotten at least twice after it was learned, or wrong in at least a third of 3+ answers
// - 'easy': never wrong and at least 3 correct answers
// - 'normal': everything else
export function wordDifficulty(p) {
  const answers = p.correctCount + p.wrongCount;
  if ((p.lapses ?? 0) >= 2 || (answers >= 3 && p.wrongCount >= 2 && errorRate(p) >= 1 / 3)) return 'hard';
  if (p.wrongCount === 0 && p.correctCount >= 3) return 'easy';
  return 'normal';
}

export const isHardWord = (p) => isLearned(p) && wordDifficulty(p) === 'hard';

// Hard words come back a little sooner, easy words a little later than the base rhythm 1/2/4/8/16/32/64.
export const DIFFICULTY_FACTOR = Object.freeze({ hard: 0.7, normal: 1, easy: 1.25 });

export function intervalFor(stage, p) {
  const base = INTERVALS[stage];
  if (base <= 1) return base;
  return Math.max(1, Math.round(base * DIFFICULTY_FACTOR[wordDifficulty(p)]));
}

// A wrong answer on a well-known word (stage 4 = 8 days or more) costs two stages instead of everything.
export const WELL_KNOWN_STAGE = 4;
export const LAPSE_DROP = 2;

export function stageAfterMistake(stage) {
  return stage >= WELL_KNOWN_STAGE ? stage - LAPSE_DROP : 1;
}

// A review or test answer for an already learned word.
// - Only the first rating per calendar day may change the stage.
// - Correct: one stage up (only when the word is due, so early weekly-test answers don't skip intervals).
//   The interval follows the word's difficulty (see intervalFor).
// - Wrong: due again tomorrow. A well-known word falls back two stages, a young word starts again at stage 1.
export function applyAnswer(p, { correct, today, typed = false }) {
  const q = { ...p, lastReviewedDay: today };
  if (correct) {
    q.correctCount += 1;
    if (typed) q.typedCorrectCount += 1;
  } else {
    q.wrongCount += 1;
  }

  const firstToday = p.lastStageChangeDay !== today;
  if (firstToday) {
    if (correct) {
      if (p.nextDueDay && p.nextDueDay <= today) {
        q.stage = Math.min(p.stage + 1, MAX_STAGE);
        q.consecutiveCorrect = p.consecutiveCorrect + 1;
        q.intervalDays = intervalFor(q.stage, q);
        q.nextDueDay = addDays(today, q.intervalDays);
        q.lastStageChangeDay = today;
      }
    } else {
      if (p.stage >= 2) q.lapses = (p.lapses ?? 0) + 1;
      q.stage = stageAfterMistake(p.stage);
      q.consecutiveCorrect = 0;
      q.intervalDays = 1;
      q.nextDueDay = addDays(today, 1);
      q.lastStageChangeDay = today;
    }
  }

  q.status = deriveStatus(q);
  return q;
}

export function isDue(p, today) {
  return isLearned(p) && p.nextDueDay && p.nextDueDay <= today;
}
