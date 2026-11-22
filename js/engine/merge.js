// Joins two saved learning states of the same course – e.g. the phone and the laptop – into one, so nothing learned
// on either device is lost. The result is the same whichever device merges.
// - Word and sentence progress: per word the record with more answers (then the later review) wins.
// - Lessons, tests, sentence sessions, events: joined by id; for the same id the one that got further wins.
//   Lessons are renumbered in the order they were started.
// - Starred words are joined; settings come from the device that was used last.

import { mergeSongs } from './music.js';

import { mergeDialogs, mergeStories } from './dialogs.js';

const answers = (p) => (p?.correctCount ?? 0) + (p?.wrongCount ?? 0);

function betterProgress(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (
    answers(b) - answers(a) ||
    (b.lastReviewedDay ?? '').localeCompare(a.lastReviewedDay ?? '') ||
    (b.stage ?? 0) - (a.stage ?? 0) ||
    0
  ) > 0
    ? b
    : a;
}

function mergeProgress(a = {}, b = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) out[id] = betterProgress(a[id], b[id]);
  return out;
}

// Joins two lists by id; `further(x, y)` > 0 when y got further than x.
function mergeById(a = [], b = [], further) {
  const map = new Map();
  for (const item of [...a, ...b]) {
    const have = map.get(item.id);
    map.set(item.id, !have || further(have, item) > 0 ? item : have);
  }
  return [...map.values()];
}

const doneItems = (x) => (x.items ?? []).filter((i) => i.status !== 'pending').length;
const lessonFurther = (x, y) => Number(Boolean(y.completedAt)) - Number(Boolean(x.completedAt)) || doneItems(y) - doneItems(x) || (y.version ?? 0) - (x.version ?? 0);
const testFurther = (x, y) => Number(Boolean(y.completedAt)) - Number(Boolean(x.completedAt)) || y.answers.length - x.answers.length || (y.currentIndex ?? 0) - (x.currentIndex ?? 0);
const sessionFurther = (x, y) => Number(Boolean(y.completedAt)) - Number(Boolean(x.completedAt)) || (y.version ?? 0) - (x.version ?? 0);

const lastActivity = (s) => s.events.reduce((m, e) => (e.at && e.at > m ? e.at : m), s.savedAt ?? '');

// Topic lessons: joined by id like the main lessons; per topic only the newest may stay open.
function mergeTopicLessons(a = [], b = []) {
  const list = mergeById(a, b, lessonFurther).sort((x, y) => (x.createdAt ?? '').localeCompare(y.createdAt ?? '') || x.id.localeCompare(y.id));
  const lastOpen = new Map();
  for (const l of list) if (!l.completedAt) lastOpen.set(l.topic, l.id);
  return list.map((l) => (!l.completedAt && lastOpen.get(l.topic) !== l.id ? { ...l, completedAt: l.createdAt, completedDay: l.createdDay, queue: [] } : l));
}

export function mergeStates(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = lastActivity(b) > lastActivity(a) ? b : a;
  const lessons = mergeById(a.lessons, b.lessons, lessonFurther)
    .sort((x, y) => (x.createdAt ?? '').localeCompare(y.createdAt ?? '') || x.id.localeCompare(y.id))
    .map((l, i) => (l.number === i + 1 ? l : { ...l, number: i + 1 }));
  // Only one lesson may be open: the last one. An older open lesson (started on the other device) is closed with
  // what was learned in it – its learned words are kept in the progress records.
  const open = lessons.filter((l) => !l.completedAt);
  for (const l of open.slice(0, -1)) {
    const i = lessons.indexOf(l);
    lessons[i] = { ...l, completedAt: l.createdAt, completedDay: l.createdDay, queue: [] };
  }
  if (open.length && lessons.at(-1).completedAt) {
    const i = lessons.indexOf(open.at(-1));
    lessons[i] = { ...lessons[i], completedAt: lessons[i].createdAt, completedDay: lessons[i].createdDay, queue: [] };
  }
  const events = mergeById(a.events, b.events, () => 0).sort((x, y) => (x.at ?? '').localeCompare(y.at ?? '') || x.id.localeCompare(y.id));
  const review = !a.review ? b.review : !b.review ? a.review : a.review.day !== b.review.day ? (a.review.day > b.review.day ? a.review : b.review) : b.review.completed > a.review.completed ? b.review : a.review;
  const practice = !a.practice ? b.practice : !b.practice ? a.practice : (b.practice.startedAt ?? '') > (a.practice.startedAt ?? '') ? b.practice : a.practice;
  const activity = { ...(a.activity ?? {}) };
  for (const [day, n] of Object.entries(b.activity ?? {})) activity[day] = Math.max(activity[day] ?? 0, n);
  // Grammar: per topic the better result (then the later one) wins.
  const grammar = { ...(a.grammar ?? {}) };
  for (const [id, g] of Object.entries(b.grammar ?? {})) {
    const have = grammar[id];
    grammar[id] = !have || g.best > have.best || (g.best === have.best && (g.day ?? '') > (have.day ?? '')) ? g : have;
  }
  const merged = {
    ...newer,
    createdAt: [a.createdAt, b.createdAt].filter(Boolean).sort()[0] ?? newer.createdAt,
    settings: { ...(newer === a ? b : a).settings, ...newer.settings },
    progress: mergeProgress(a.progress, b.progress),
    sentenceProgress: mergeProgress(a.sentenceProgress, b.sentenceProgress),
    lessons,
    tests: mergeById(a.tests, b.tests, testFurther).sort((x, y) => (x.startedAt ?? '').localeCompare(y.startedAt ?? '')),
    sentences: mergeById(a.sentences, b.sentences, sessionFurther).sort((x, y) => (x.startedAt ?? '').localeCompare(y.startedAt ?? '')),
    starred: [...new Set([...(a.starred ?? []), ...(b.starred ?? [])])],
    ...(a.memos || b.memos ? { memos: mergeMemos(a.memos, b.memos) } : {}),
    events,
    review: review ?? null,
    ...(practice !== undefined ? { practice } : {}),
    ...(Object.keys(activity).length ? { activity } : {}),
    ...(Object.keys(grammar).length ? { grammar } : {}),
    ...(a.dialogs || b.dialogs ? { dialogs: mergeDialogs(a.dialogs, b.dialogs) } : {}),
    ...(a.stories || b.stories ? { stories: mergeStories(a.stories, b.stories) } : {}),
    ...(a.songs || b.songs ? { songs: mergeSongs(a.songs, b.songs) } : {}),
    ...(a.topicLessons || b.topicLessons ? { topicLessons: mergeTopicLessons(a.topicLessons, b.topicLessons) } : {}),
  };
  // At most one open test and one open sentence session (the newest), like on a single device.
  for (const key of ['tests', 'sentences']) {
    const openOnes = merged[key].filter((x) => !x.completedAt);
    for (const x of openOnes.slice(0, -1)) {
      const i = merged[key].indexOf(x);
      merged[key][i] = { ...x, completedAt: x.startedAt, completedDay: x.startedDay ?? x.day ?? null, abandoned: true };
    }
  }
  return merged;
}

// True when two states hold the same learning data (no need to save or upload anything).
export function sameLearning(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Own notes for words: per word the newer change wins (an emptied note is a change too).
function mergeMemos(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, memo] of Object.entries(b)) if (!out[id] || (memo.at ?? '') > (out[id].at ?? '')) out[id] = memo;
  return out;
}
