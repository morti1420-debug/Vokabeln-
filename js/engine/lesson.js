import { CATEGORIES, DAY_ONE_IDS } from '../../data/vocabulary.js';
import { TOPIC_OF } from '../../data/topics.js';
import { dayKey } from './dates.js';
import { shuffle, uuid } from './random.js';
import { candidatesFor, lastTheme, lessonOrder, quotasFor, selectNewWords, selectThemedWords, topicCandidates, usedVocabIds } from './selection.js';
import { learnWord, markKnown, newProgress, recordLessonMiss } from './srs.js';
import { clone, hasEvent, pushEvent } from './state.js';
import { dailyLoad } from './load.js';

export const LESSON_SIZE = 10;
export const LESSON_SIZES = [10, 15, 20, 30];
// Every card and question asks in your own language first (German); the word you learn is on the back.
export const DE_EN_SHARE = 1;
// "Practice Again" puts the card back after this many other cards.
export const REQUEUE_GAP = 3;

export function currentLesson(state) {
  const last = state.lessons.at(-1);
  return last && !last.completedAt ? last : null;
}

export function lastCompletedLesson(state) {
  return [...state.lessons].reverse().find((l) => l.completedAt) ?? null;
}

export function lessonCompletedToday(state, today) {
  return state.lessons.some((l) => l.completedDay === today);
}

export function lessonToken(lesson) {
  return `${lesson.id}:${lesson.version}`;
}

export function directionsFor(count, seed) {
  const deEn = Math.round(count * DE_EN_SHARE);
  const order = shuffle([...Array(count).keys()], seed);
  const dirs = Array(count).fill('en-de');
  order.slice(0, deEn).forEach((i) => (dirs[i] = 'de-en'));
  return dirs;
}

export function lessonSize(state) {
  const n = Number(state.settings?.lessonSize);
  return LESSON_SIZES.includes(n) ? n : LESSON_SIZE;
}

// The words a lesson with this number would get. Lesson 1 always starts with the agreed ten words;
// a bigger lesson size adds more words in the same category mix. After that every lesson has a theme
// (see selectThemedWords) – unless you chose the old mixed order in the settings.
function planWords(vocabulary, state, number, excluded = new Set(), size = lessonSize(state), after = lastTheme(state)) {
  const quotas = quotasFor(size);
  if (number !== 1 && lessonOrder(state) === 'theme') return { ...selectThemedWords(vocabulary, state, size, excluded, after), shortfalls: [] };
  if (number !== 1) return selectNewWords(vocabulary, state, quotas, excluded);
  const dayOne = state.settings?.dayOne ?? DAY_ONE_IDS;
  const fixed = dayOne.filter((vid) => !state.progress[vid] && !excluded.has(vid));
  const extra = { ...quotas };
  for (const vid of dayOne) {
    const category = vocabulary.find((v) => v.id === vid)?.category;
    if (category in extra) extra[category] -= 1;
  }
  const more = selectNewWords(vocabulary, state, extra, new Set([...excluded, ...dayOne]));
  return { ids: [...fixed, ...more.ids], shortfalls: more.shortfalls };
}

// Preview of the next lessons, exactly as they would be created now (later answers can still change them,
// e.g. B1 words unlock or a word is marked as already known).
export function upcomingLessons(vocabulary, state, count = 3) {
  const out = [];
  const excluded = new Set();
  let number = state.lessons.length + 1;
  let after = lastTheme(state);
  for (let k = 0; k < count; k += 1, number += 1) {
    const { ids, themes } = planWords(vocabulary, state, number, excluded, lessonSize(state), after);
    if (!ids.length) break;
    ids.forEach((id) => excluded.add(id));
    if (themes?.length) after = themes.at(-1);
    out.push({ number, ids, ...(themes?.length ? { themes } : {}) });
  }
  return out;
}

function shortfallNotice(category, state) {
  const label = state.settings?.categoryLabels?.[category] ?? CATEGORIES[category].label;
  if (state.settings?.course === 'zh-de') return `「${label}」类别里已经没有新单词了。`;
  return `In der Kategorie „${label}“ sind keine neuen Wörter mehr verfügbar.`;
}

// New words for the next lesson today: the chosen lesson size, fewer when many reviews are due (see load.js).
// Lesson 1 always has its agreed words.
export function lessonSizeToday(state, today) {
  const size = lessonSize(state);
  return state.lessons.length === 0 ? size : dailyLoad(state, today, size).newWords;
}

// Starting is idempotent: an open lesson is never replaced and never duplicated.
// With too many reviews due no lesson starts – the reviews come first.
// With a topic, the lesson takes the next new words of that topic (easiest first) instead of the usual mix.
// force: you tapped the lesson yourself – it starts with the full lesson size even when many reviews are due
// (the reviews stay in today's plan).
// words: you chose a smaller lesson yourself (e.g. while catching up on reviews).
export function startLesson(state, vocabulary, now = new Date(), { topic = null, force = false, words = null } = {}) {
  if (currentLesson(state)) return state;
  const size = words > 0 ? Math.min(words, lessonSize(state)) : force ? lessonSize(state) : lessonSizeToday(state, dayKey(now));
  if (size <= 0) return state;
  if (topic && !topicCandidates(vocabulary, state, topic).length) return state;
  const s = clone(state);
  const id = uuid();
  const number = s.lessons.length + 1;
  const { ids, shortfalls, themes } = topic ? { ids: topicCandidates(vocabulary, s, topic).slice(0, size).map((v) => v.id), shortfalls: [] } : planWords(vocabulary, s, number, new Set(), size);
  // A themed lesson keeps its logical order (grouped by theme and kind of word); the others are shuffled.
  const dirs = directionsFor(ids.length, id);
  s.lessons.push({
    id,
    number,
    createdAt: now.toISOString(),
    createdDay: dayKey(now),
    completedAt: ids.length ? null : now.toISOString(),
    completedDay: ids.length ? null : dayKey(now),
    items: ids.map((vocabId, i) => ({ vocabId, direction: dirs[i], status: 'pending', againCount: 0 })),
    queue: themes?.length ? [...ids] : shuffle(ids, `${id}:order`),
    replacements: [],
    notices: shortfalls.map((sf) => shortfallNotice(sf.category, s)),
    version: 0,
    ...(topic ? { topic } : {}),
    ...(themes?.length ? { themes } : {}),
  });
  return s;
}

// Topic lessons have their own row per topic (state.topicLessons), separate from the numbered main lessons: you can
// learn a topic at any time without touching the lesson you are on. One open lesson per topic.
export const topicLessonsOf = (state) => state.topicLessons ?? [];

export function openTopicLesson(state, topic) {
  return topicLessonsOf(state).find((l) => l.topic === topic && !l.completedAt) ?? null;
}

// situation: an everyday situation's unit (data/situations.js) – its words not learned or planned yet, in the unit's order.
export function startTopicLesson(state, vocabulary, topic, now = new Date(), situation = null) {
  if (openTopicLesson(state, topic)) return state;
  const size = dailyLoad(state, dayKey(now), lessonSize(state)).newWords;
  if (size <= 0) return state;
  const used = situation ? usedVocabIds(state) : null;
  const ids = situation
    ? situation.words.filter((id) => !used.has(id) && !state.progress[id] && vocabulary.some((v) => v.id === id))
    : topicCandidates(vocabulary, state, topic).slice(0, size).map((v) => v.id);
  if (!ids.length) return state;
  const s = clone(state);
  const id = uuid();
  const dirs = directionsFor(ids.length, id);
  s.topicLessons = [
    ...topicLessonsOf(s),
    {
      id,
      topic,
      ...(situation ? { situation: situation.id } : {}),
      number: topicLessonsOf(s).filter((l) => l.topic === topic).length + 1,
      createdAt: now.toISOString(),
      createdDay: dayKey(now),
      completedAt: null,
      completedDay: null,
      items: ids.map((vocabId, i) => ({ vocabId, direction: dirs[i], status: 'pending', againCount: 0 })),
      queue: shuffle(ids, `${id}:order`),
      replacements: [],
      notices: [],
      version: 0,
    },
  ];
  return s;
}

// A lesson of either row (main lessons or topic lessons).
const findLesson = (state, id) => state.lessons.find((l) => l.id === id) ?? topicLessonsOf(state).find((l) => l.id === id);

export function canMarkKnown(lesson, vocabId) {
  const item = lesson?.items.find((i) => i.vocabId === vocabId);
  return Boolean(item && item.status === 'pending' && item.againCount === 0 && !item.introduced);
}

// Beginner mode: a new word is first shown with its translation before it is ever asked.
export function needsIntro(lesson, vocabId) {
  const item = lesson?.items.find((i) => i.vocabId === vocabId);
  return Boolean(item && item.status === 'pending' && item.againCount === 0 && !item.introduced);
}

// rating: 'seen' (intro card) | 'remembered' | 'again' | 'known'
// Returns { state, changed }. Stale or repeated tokens (double clicks, old tabs) are ignored.
export function rateLessonCard(state, vocabulary, { lessonId, vocabId, rating, token, now = new Date() }) {
  const lesson = findLesson(state, lessonId);
  if (!lesson || lesson.completedAt || lesson.queue[0] !== vocabId) return { state, changed: false };
  if (token !== lessonToken(lesson) || hasEvent(state, token)) return { state, changed: false };
  if (rating === 'known' && !canMarkKnown(lesson, vocabId)) return { state, changed: false };
  if (rating === 'seen' && !needsIntro(lesson, vocabId)) return { state, changed: false };

  const s = clone(state);
  const L = findLesson(s, lessonId);
  const today = dayKey(now);
  const index = L.items.findIndex((i) => i.vocabId === vocabId);
  const item = L.items[index];
  const progress = s.progress[vocabId] ?? newProgress(vocabId);
  L.queue.shift();

  if (rating === 'seen') {
    // Not a recall attempt: no progress change, the card comes back for recall a few cards later.
    item.introduced = true;
    L.queue.splice(Math.min(REQUEUE_GAP, L.queue.length), 0, vocabId);
  } else if (rating === 'remembered') {
    item.status = 'remembered';
    s.progress[vocabId] = learnWord(progress, today);
  } else if (rating === 'again') {
    item.againCount += 1;
    s.progress[vocabId] = recordLessonMiss(progress);
    L.queue.splice(Math.min(REQUEUE_GAP, L.queue.length), 0, vocabId);
  } else if (rating === 'known') {
    s.progress[vocabId] = markKnown(progress, today);
    const category = vocabulary.find((v) => v.id === vocabId)?.category;
    // A topic lesson stays in its topic, a themed lesson in the theme of the word; otherwise the replacement comes
    // from the same category.
    const theme = L.topic ?? (L.themes?.length ? TOPIC_OF[vocabId] : null);
    const replacement = (theme ? topicCandidates(vocabulary, s, theme)[0] : null) ?? (!L.topic && category ? candidatesFor(vocabulary, s, category)[0] : null) ?? null;
    if (replacement) {
      L.items[index] = { vocabId: replacement.id, direction: item.direction, status: 'pending', againCount: 0 };
      L.queue.push(replacement.id);
      L.replacements.push({ knownId: vocabId, replacementId: replacement.id });
    } else {
      L.items.splice(index, 1);
      L.replacements.push({ knownId: vocabId, replacementId: null });
      const notice = shortfallNotice(category, s);
      if (!L.notices.includes(notice)) L.notices.push(notice);
    }
  } else {
    return { state, changed: false };
  }

  L.version += 1;
  pushEvent(s, { id: token, type: 'lesson', lessonId, vocabId, rating, at: now.toISOString(), day: today });
  if (L.queue.length === 0) {
    L.completedAt = now.toISOString();
    L.completedDay = today;
  }
  return { state: s, changed: true };
}

export function lessonProgress(lesson) {
  const done = lesson.items.filter((i) => i.status === 'remembered').length;
  return { done, total: lesson.items.length, position: Math.min(done + 1, lesson.items.length) };
}
