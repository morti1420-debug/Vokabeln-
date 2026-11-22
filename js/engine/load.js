// Daily workload: keeps a normal day at about 10–15 minutes.
// - Due reviews always come first; word and sentence cards are counted together.
// - When many reviews are due, fewer new words are offered (down to none), so the pile can never grow into a
//   30–45 minute backlog.
// - One day's reviews are capped; the rest stay due and come first on the next days (most overdue first).
// - After a break of a week or more the first days start gently: a smaller cap and no new words until the
//   backlog is small again.

import { diffDays } from './dates.js';
import { dueSentenceIds } from './sentences.js';
import { dueVocabIds } from './review.js';

export const REVIEW_CAP = 80; // cards per day (words + sentences) ≈ 11–13 minutes
// Sentence cards always keep up to a third of the day's cap, so they never pile up behind the words.
export const SENTENCE_SHARE = 1 / 3;
export const RETURN_CAP = 30; // the first days after a break
export const BREAK_DAYS = 7;
export const SECONDS = Object.freeze({ review: 8, newWord: 45 });
// Lesson sizes above this are "intensive" (more than ~15 minutes on a normal day).
export const INTENSIVE_FROM = 20;

export function lastActiveDay(state, today) {
  let last = null;
  for (const e of state.events) if (e.day && e.day < today && (!last || e.day > last)) last = e.day;
  for (const day of Object.keys(state.activity ?? {})) if (day < today && (!last || day > last)) last = day;
  return last;
}

// The new words to offer today for a lesson of `size` words, given all review cards of today (done or still due):
// the full lesson while today's reviews fit in three quarters of the cap, half a lesson (at least 5 words) while
// they fit in the cap, none when there is a backlog beyond the cap.
export function newWordsFor(size, dueToday, { cap = REVIEW_CAP, afterBreak = false } = {}) {
  if (afterBreak && dueToday > RETURN_CAP / 2) return 0;
  if (dueToday <= cap * 0.75) return size;
  if (dueToday <= cap) return Math.max(5, Math.ceil(size / 2));
  return 0;
}

// Review cards already answered today (word and sentence reviews), so finishing the reviews does not
// suddenly open the door to a full lesson while the day's load is high.
export function reviewedToday(state, today) {
  const words = state.review?.day === today ? state.review.completed : 0;
  const sentences = (state.sentences ?? []).filter((x) => x.type === 'review' && x.day === today).reduce((n, x) => n + x.items.filter((i) => i.status === 'remembered').length, 0);
  return words + sentences;
}

export function dailyLoad(state, today, size) {
  const wordsDue = dueVocabIds(state, today).length;
  const sentencesDue = dueSentenceIds(state, today).length;
  const due = wordsDue + sentencesDue;
  const last = lastActiveDay(state, today);
  const afterBreak = Boolean(last) && diffDays(last, today) >= BREAK_DAYS;
  const cap = reviewCapFor(state, today);
  const reviewsToday = Math.min(due, cap);
  const newWords = newWordsFor(size, due + reviewedToday(state, today), { cap, afterBreak });
  const reason = newWords < size ? (afterBreak ? 'break' : 'load') : null;
  return {
    wordsDue,
    sentencesDue,
    due,
    cap,
    reviewsToday,
    held: due - reviewsToday, // stay due and come first tomorrow
    newWords,
    reason,
    afterBreak,
    minutes: Math.max(1, Math.round((reviewsToday * SECONDS.review + newWords * SECONDS.newWord) / 60)),
  };
}

export function reviewCapFor(state, today) {
  const last = lastActiveDay(state, today);
  return last && diffDays(last, today) >= BREAK_DAYS ? RETURN_CAP : REVIEW_CAP;
}

// The word reviews' part of today's cap: everything except the share kept for due sentences.
export function wordReviewCap(state, today) {
  const cap = reviewCapFor(state, today);
  return cap - Math.min(dueSentenceIds(state, today).length, Math.floor(cap * SENTENCE_SHARE));
}

// Today's share of the cap for sentence reviews: what the word reviews of today leave over.
export function sentenceReviewAllowance(state, today) {
  const cap = reviewCapFor(state, today);
  const words = state.review?.day === today ? state.review.total : Math.min(dueVocabIds(state, today).length, wordReviewCap(state, today));
  const sentencesToday = (state.sentences ?? []).filter((x) => x.type === 'review' && x.day === today).reduce((n, x) => n + x.items.length, 0);
  return Math.max(0, cap - words - sentencesToday);
}

// The pile of due word reviews ("Wiederholungsberg"): from this many cards on, the app helps you catch up.
export const BACKLOG_FROM = 40;
export function backlog(state, today) {
  const due = dueVocabIds(state, today).length;
  const done = state.review?.day === today ? state.review.completed : 0;
  const total = due + done;
  return { due, done, total, active: total >= BACKLOG_FROM && due > 0 };
}
