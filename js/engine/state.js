import { addDays } from './dates.js';

export const SCHEMA_VERSION = 1;

// course: optional course config (see js/courses.js); without it the original English course is used.
export function createInitialState(now = new Date(), course = null) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    // Beginners: slower speech.
    settings: {
      accent: course?.defaultAccent ?? 'en-US',
      rate: 0.8,
      autoplay: true,
      lessonSize: 10,
      difficulty: course?.defaultDifficulty ?? 'medium',
      ...(course && course.id !== 'de-en' ? { course: course.id, dayOne: course.dayOne, categoryLabels: Object.fromEntries(Object.entries(course.categories).map(([k, v]) => [k, v.label])) } : {}),
    },
    progress: {},
    lessons: [],
    review: null,
    tests: [],
    sentences: [],
    sentenceProgress: {},
    starred: [],
    events: [],
  };
}

export function clone(state) {
  return structuredClone(state);
}

export function hasEvent(state, id) {
  return state.events.some((e) => e.id === id);
}

export function pushEvent(state, event) {
  state.events.push(event);
}

// Keeps the saved data small on every device (browser storage holds about 5 MB): answers older than three weeks
// are folded into one count per day (`activity`), finished review and practice sentence sessions of that age are
// dropped. Nothing that is shown or used for learning gets lost – the calendar and the weekly overview read the
// daily counts, the schedule lives in the progress records. Returns the same object when nothing is old enough.
export const HISTORY_DAYS = 21;

export function compactHistory(state, today) {
  const cutoff = addDays(today, -HISTORY_DAYS);
  const oldEvents = state.events.filter((e) => e.day && e.day < cutoff);
  const oldSessions = (state.sentences ?? []).filter((x) => x.type !== 'lesson' && x.completedAt && x.completedDay < cutoff);
  if (!oldEvents.length && !oldSessions.length) return state;
  const activity = { ...(state.activity ?? {}) };
  for (const e of oldEvents) activity[e.day] = (activity[e.day] ?? 0) + (e.vocabId ? 1 : 0);
  return {
    ...state,
    activity,
    events: state.events.filter((e) => !(e.day && e.day < cutoff)),
    ...(oldSessions.length ? { sentences: state.sentences.filter((x) => !oldSessions.includes(x)) } : {}),
  };
}
