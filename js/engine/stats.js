import { dueVocabIds } from './review.js';
import { testAccuracy } from './selection.js';
import { isHardWord, isLearned } from './srs.js';
import { addDays, weekStart } from './dates.js';

// Every number here is derived from stored learning events – never estimated.
export function computeStats(state, today) {
  const all = Object.values(state.progress);
  const learned = all.filter(isLearned);
  const count = (status) => learned.filter((p) => p.status === status).length;
  const completedTests = state.tests.filter((t) => t.completedAt);
  const accuracy = completedTests.length
    ? Math.round((completedTests.reduce((sum, t) => sum + testAccuracy(t), 0) / completedTests.length) * 100)
    : null;

  const perDay = new Map();
  for (const p of learned) perDay.set(p.firstLearnedDay, (perDay.get(p.firstLearnedDay) ?? 0) + 1);
  let running = 0;
  const growth = [...perDay.keys()]
    .sort()
    .map((day) => ({ day, total: (running += perDay.get(day)) }))
    .slice(-30);

  return {
    totalVocabulary: learned.length,
    mastered: count('mastered'),
    reviewing: count('reviewing'),
    learningOnly: count('learning'),
    learning: count('learning') + count('reviewing'),
    known: all.filter((p) => p.status === 'known').length,
    reviewsDue: dueVocabIds(state, today).length,
    hard: all.filter(isHardWord).length,
    weeks: weeklyDevelopment(state, today),
    testAccuracy: accuracy,
    growth,
    testSeries: completedTests.map((t) => ({ day: t.completedDay, type: t.type, accuracy: Math.round(testAccuracy(t) * 100) })),
  };
}

// Words answered wrong most often across all tests and reviews.
export function mistakeOverview(state, limit = 10) {
  return Object.values(state.progress)
    .filter((p) => p.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount || a.vocabId.localeCompare(b.vocabId))
    .slice(0, limit);
}

// The last weeks at a glance: new words, answered cards (lessons, reviews, practice, sentences, tests) and the test score.
export function weeklyDevelopment(state, today, count = 6) {
  const current = weekStart(today);
  const weeks = Array.from({ length: count }, (_, i) => addDays(current, -7 * (count - 1 - i)));
  const weekOf = (day) => (day ? weekStart(day) : null);
  const rows = weeks.map((week) => {
    const learned = Object.values(state.progress).filter((p) => isLearned(p) && weekOf(p.firstLearnedDay) === week).length;
    const answered =
      state.events.filter((e) => weekOf(e.day) === week && e.vocabId).length +
      Object.entries(state.activity ?? {}).reduce((n, [day, count]) => n + (weekOf(day) === week ? count : 0), 0);
    const tests = state.tests.filter((t) => t.completedAt && weekOf(t.completedDay) === week);
    const accuracy = tests.length ? Math.round((tests.reduce((sum, t) => sum + testAccuracy(t), 0) / tests.length) * 100) : null;
    return { week, learned, answered, accuracy };
  });
  // Weeks before you started are left out; the current week is always shown.
  const first = rows.findIndex((r) => r.learned || r.answered);
  return first < 0 ? rows.slice(-1) : rows.slice(first);
}

// What you did on one day: new words and sentences, answered cards per kind, finished tests, grammar topics.
export function daySummary(state, day) {
  const events = state.events.filter((e) => e.day === day);
  const kind = (type) => events.filter((e) => e.type === type).length;
  const newWords = Object.values(state.progress).filter((p) => isLearned(p) && p.firstLearnedDay === day).length;
  const newSentences = Object.values(state.sentenceProgress ?? {}).filter((p) => isLearned(p) && p.firstLearnedDay === day).length;
  const tests = state.tests.filter((t) => t.completedAt && t.completedDay === day);
  const grammar = Object.values(state.grammar ?? {}).filter((g) => g.day === day).length;
  // Older days are folded into state.activity (see compactHistory); count them as answered cards.
  const answered = events.length + (state.activity?.[day] ?? 0);
  return {
    newWords,
    newSentences,
    lessonCards: kind('lesson'),
    reviews: kind('review'),
    practice: kind('practice'),
    sentences: kind('sentence'),
    testAnswers: kind('test'),
    tests: tests.length,
    testAccuracy: tests.length ? Math.round((tests.reduce((sum, t) => sum + testAccuracy(t), 0) / tests.length) * 100) : null,
    grammar,
    answered,
    // About 8 seconds per answered card, as in the daily load estimate.
    minutes: answered ? Math.max(1, Math.round((answered * 8) / 60)) : 0,
  };
}

// Days in a row with at least one answered card, up to today (or yesterday, while today is still open).
export function learningStreak(state, today) {
  const days = new Set([...state.events.map((e) => e.day).filter(Boolean), ...Object.keys(state.activity ?? {})]);
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return { days: n, today: days.has(today) };
}

// The last seven days with their answered cards, oldest first.
export function lastSevenDays(state, today) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, answered: daySummary(state, day).answered };
  });
}
