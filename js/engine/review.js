import { dayKey } from './dates.js';
import { uuid } from './random.js';
import { REQUEUE_GAP } from './lesson.js';
import { applyAnswer, errorRate, isDue } from './srs.js';
import { clone, hasEvent, pushEvent } from './state.js';
import { wordReviewCap } from './load.js';

export const REVIEW_BRAKE = 40;
// Reviews come in rounds of this many cards: a short pause after each one, and one more round on request.
export const REVIEW_ROUND = 25;

// Most overdue first, then highest error rate, then lowest stage.
export function dueVocabIds(state, today) {
  return Object.values(state.progress)
    .filter((p) => isDue(p, today))
    .sort(
      (a, b) =>
        a.nextDueDay.localeCompare(b.nextDueDay) ||
        errorRate(b) - errorRate(a) ||
        a.stage - b.stage ||
        a.vocabId.localeCompare(b.vocabId),
    )
    .map((p) => p.vocabId);
}

// Reviews also always show German first and English on the back.
export function reviewDirection() {
  return 'de-en';
}

export function reviewToken(review) {
  return `${review.id}:${review.version}`;
}

// One review session per calendar day, at most one day's cap (see load.js). Newly due words are appended while
// there is room; words over the cap are never dropped – they stay due and come first on the next day.
export function ensureReviewSession(state, now = new Date()) {
  const today = dayKey(now);
  const cap = wordReviewCap(state, today);
  const due = dueVocabIds(state, today);
  const current = state.review;
  if (current && current.day === today) {
    const missing = due.filter((id) => !current.queue.includes(id) && state.progress[id].lastReviewedDay !== today).slice(0, Math.max(0, cap - current.total));
    if (!missing.length) return state;
    const s = clone(state);
    s.review.queue.push(...missing);
    s.review.total += missing.length;
    return s;
  }
  if (!due.length && !current) return state;
  const s = clone(state);
  const queue = due.slice(0, cap);
  s.review = { id: uuid(), day: today, queue, total: queue.length, completed: 0, version: 0 };
  return s;
}

// The word reviews still to do today: what is left of today's session, or – before it was opened – what it
// will hold. This is the one number shown everywhere (tab badge, start page, plan); the pile beyond the day's
// cap stays due but is not counted (see waitingVocabIds).
export function reviewsLeftToday(state, now = new Date()) {
  const s = ensureReviewSession(state, now);
  return s.review?.day === dayKey(now) ? s.review.queue.length : 0;
}

export function rateReviewCard(state, { vocabId, rating, token, now = new Date() }) {
  const review = state.review;
  if (!review || review.queue[0] !== vocabId) return { state, changed: false };
  if (token !== reviewToken(review) || hasEvent(state, token)) return { state, changed: false };
  if (rating !== 'remembered' && rating !== 'again') return { state, changed: false };

  const s = clone(state);
  const today = dayKey(now);
  const R = s.review;
  const correct = rating === 'remembered';
  s.progress[vocabId] = applyAnswer(s.progress[vocabId], { correct, today });
  R.queue.shift();
  if (correct) {
    R.completed += 1;
  } else {
    R.queue.splice(Math.min(REQUEUE_GAP, R.queue.length), 0, vocabId);
  }
  R.version += 1;
  pushEvent(s, { id: token, type: 'review', vocabId, rating, at: now.toISOString(), day: today });
  return { state: s, changed: true };
}

// Due words that are not part of today's session yet (beyond the day's cap) – for catching up.
export function waitingVocabIds(state, today) {
  const current = state.review?.day === today ? state.review : null;
  return dueVocabIds(state, today).filter((id) => !current?.queue.includes(id) && state.progress[id].lastReviewedDay !== today);
}

// Catching up: you asked for one more round – the most overdue waiting words join today's session, also beyond
// the day's cap. Nothing happens without a session of today or when nothing is waiting.
export function extendReview(state, now = new Date(), count = REVIEW_ROUND) {
  const today = dayKey(now);
  if (state.review?.day !== today) return state;
  const more = waitingVocabIds(state, today).slice(0, count);
  if (!more.length) return state;
  const s = clone(state);
  s.review.queue.push(...more);
  s.review.total += more.length;
  s.review.version += 1;
  return s;
}
