// Sentence flashcards: the example sentences of learned words, learned and reviewed exactly like
// vocabulary – flip, "Practice again" / "Remembered", and the same 1/2/4/8/16/32/64-day schedule.
// Sentences keep their own progress record, so they never change a word's schedule.

import { dayKey } from './dates.js';
import { REQUEUE_GAP, directionsFor } from './lesson.js';
import { shuffle, uuid } from './random.js';
import { applyAnswer, errorRate, isDue, isLearned, learnWord, newProgress, recordLessonMiss } from './srs.js';
import { clone, hasEvent, pushEvent } from './state.js';
import { sentenceReviewAllowance } from './load.js';
import { TOPIC_OF } from '../../data/topics.js';

export const SENTENCE_SESSION_SIZE = 10; // free practice
export const SENTENCE_LESSON_MIN = 25; // every sentence lesson has at least this many sentences

const CEFR_EASY = { A1: 1, A2: 2, B1: 3 };
const sessions = (state) => state.sentences ?? [];
const sentenceProgressOf = (state) => state.sentenceProgress ?? {};

function newSession(vocabIds, { type, lessonId = null, topic = null, now }) {
  const id = uuid();
  const dirs = directionsFor(vocabIds.length, `${id}:dir`);
  return {
    id,
    type, // 'lesson' | 'review' | 'practice' | 'topic'
    lessonId,
    ...(topic ? { topic } : {}),
    day: dayKey(now),
    startedAt: now.toISOString(),
    completedAt: null,
    completedDay: null,
    items: vocabIds.map((vocabId, i) => ({ vocabId, direction: dirs[i], status: 'pending', againCount: 0 })),
    queue: shuffle(vocabIds, `${id}:order`),
    version: 0,
  };
}

export function sentenceSessionFor(state, lessonId) {
  return sessions(state).find((s) => s.type === 'lesson' && s.lessonId === lessonId) ?? null;
}

export function openSentenceSession(state) {
  return sessions(state).find((s) => !s.completedAt) ?? null;
}

export function sentenceToken(session) {
  return `${session.id}:${session.version}`;
}

export function sentenceSessionProgress(session) {
  const done = session.items.filter((i) => i.status === 'remembered').length;
  return { done, total: session.items.length };
}

export function learnedSentenceIds(state) {
  return Object.values(sentenceProgressOf(state))
    .filter(isLearned)
    .map((p) => p.vocabId);
}

// Same order as word reviews: most overdue, then highest error rate, then lowest stage.
export function dueSentenceIds(state, today) {
  return Object.values(sentenceProgressOf(state))
    .filter((p) => isDue(p, today))
    .sort((a, b) => a.nextDueDay.localeCompare(b.nextDueDay) || errorRate(b) - errorRate(a) || a.stage - b.stage || a.vocabId.localeCompare(b.vocabId))
    .map((p) => p.vocabId);
}

// The sentences of a lesson's sentence lesson: those of the words learned in it ("Already know" words excluded),
// filled up to SENTENCE_LESSON_MIN with new sentences – the lesson's own themes first, sentences of words you
// already know before others, easy before hard. Words of lessons that still get their own sentence lesson and
// sentences you have learned already are left out.
export function lessonSentenceIds(state, vocabulary, lesson, min = SENTENCE_LESSON_MIN) {
  const own = lesson.completedAt ? lesson.items.filter((i) => i.status === 'remembered').map((i) => i.vocabId) : lesson.items.map((i) => i.vocabId);
  if (!own.length || own.length >= min || !vocabulary?.length) return own;
  const sp = sentenceProgressOf(state);
  const taken = new Set(own);
  for (const l of state.lessons) if (l.id !== lesson.id && !sentenceSessionFor(state, l.id)) for (const i of l.items) taken.add(i.vocabId);
  for (const x of sessions(state)) if (!x.completedAt) for (const i of x.items) taken.add(i.vocabId);
  const themes = new Set(lesson.themes?.length ? lesson.themes : own.map((id) => TOPIC_OF[id]).filter(Boolean));
  const knows = (id) => Number(isLearned(state.progress?.[id]));
  const inTheme = (id) => Number(themes.has(TOPIC_OF[id]));
  const fill = vocabulary
    .filter((v) => v.exampleEn && !taken.has(v.id) && !isLearned(sp[v.id]))
    .sort((a, b) => inTheme(b.id) - inTheme(a.id) || knows(b.id) - knows(a.id) || CEFR_EASY[a.cefr] - CEFR_EASY[b.cefr] || a.frequencyRank - b.frequencyRank || a.id.localeCompare(b.id))
    .slice(0, min - own.length)
    .map((v) => v.id);
  return [...own, ...fill];
}

// One sentence session per finished lesson.
export function startLessonSentences(state, lessonId, now = new Date(), vocabulary = null) {
  const lesson = state.lessons.find((l) => l.id === lessonId);
  if (!lesson?.completedAt || sentenceSessionFor(state, lessonId) || openSentenceSession(state)) return state;
  const ids = lessonSentenceIds(state, vocabulary, lesson);
  if (!ids.length) return state;
  const s = clone(state);
  s.sentences = [...sessions(s), newSession(ids, { type: 'lesson', lessonId, now })];
  return s;
}

// An open sentence lesson that was started with fewer sentences gets the missing ones at the end.
export function topUpLessonSentences(state, vocabulary, min = SENTENCE_LESSON_MIN) {
  const open = openSentenceSession(state);
  if (open?.type !== 'lesson' || open.items.length >= min) return state;
  const lesson = state.lessons.find((l) => l.id === open.lessonId);
  if (!lesson) return state;
  const have = new Set(open.items.map((i) => i.vocabId));
  const without = { ...state, sentences: sessions(state).filter((x) => x.id !== open.id) };
  const fill = lessonSentenceIds(without, vocabulary, lesson, min + have.size)
    .filter((id) => !have.has(id))
    .slice(0, min - have.size);
  if (!fill.length) return state;
  const s = clone(state);
  const S = s.sentences.find((x) => x.id === open.id);
  const dirs = directionsFor(fill.length, `${S.id}:dir:more`);
  S.items.push(...fill.map((vocabId, i) => ({ vocabId, direction: dirs[i], status: 'pending', againCount: 0 })));
  S.queue.push(...fill);
  return s;
}

// The due sentences that fit into today's review cap (word reviews come first).
export function sentenceReviewIds(state, today) {
  return dueSentenceIds(state, today).slice(0, sentenceReviewAllowance(state, today));
}

export function startSentenceReview(state, now = new Date()) {
  if (openSentenceSession(state)) return state;
  const ids = sentenceReviewIds(state, dayKey(now));
  if (!ids.length) return state;
  const s = clone(state);
  s.sentences = [...sessions(s), newSession(ids, { type: 'review', now })];
  return s;
}

// Free practice at any time: the hardest learned sentences first, or the sentences of one lesson.
// An unfinished practice session is replaced; lesson and review sessions are never interrupted.
export function startSentencePractice(state, now = new Date(), { lessonId = null, topic = null } = {}) {
  const open = openSentenceSession(state);
  if (open && open.type !== 'practice') return state;
  const learned = Object.values(sentenceProgressOf(state)).filter(isLearned);
  let pool = learned;
  if (lessonId) {
    const lesson = state.lessons.find((l) => l.id === lessonId);
    const inLesson = new Set(lesson?.items.map((i) => i.vocabId) ?? []);
    pool = learned.filter((p) => inLesson.has(p.vocabId));
  }
  if (topic) pool = learned.filter((p) => TOPIC_OF[p.vocabId] === topic);
  const ids = pool
    .sort((a, b) => errorRate(b) - errorRate(a) || a.stage - b.stage || a.vocabId.localeCompare(b.vocabId))
    .slice(0, SENTENCE_SESSION_SIZE)
    .map((p) => p.vocabId);
  if (!ids.length) return state;
  const s = clone(state);
  s.sentences = [...sessions(s).filter((x) => x !== open && x.id !== open?.id), newSession(ids, { type: 'practice', lessonId, now })];
  return s;
}

// The sentences of a topic still to learn, in the order its sentence lessons bring them: sentences of words you
// already know first, then the easy ones (A1 → B1).
export function topicSentenceQueue(state, vocabulary, topic) {
  const sp = sentenceProgressOf(state);
  const knows = (id) => Number(isLearned(state.progress?.[id]));
  return vocabulary
    .filter((v) => TOPIC_OF[v.id] === topic && v.exampleEn && !isLearned(sp[v.id]))
    .sort((a, b) => knows(b.id) - knows(a.id) || CEFR_EASY[a.cefr] - CEFR_EASY[b.cefr] || a.frequencyRank - b.frequencyRank)
    .map((v) => v.id);
}

// A sentence lesson of a topic: its next 25 sentences. Like every sentence session, only one is open at a time.
export function startTopicSentences(state, vocabulary, topic, now = new Date()) {
  if (openSentenceSession(state)) return state;
  const ids = topicSentenceQueue(state, vocabulary, topic).slice(0, SENTENCE_LESSON_MIN);
  if (!ids.length) return state;
  const s = clone(state);
  s.sentences = [...sessions(s), newSession(ids, { type: 'topic', topic, now })];
  return s;
}

// rating: 'remembered' | 'again'
export function rateSentence(state, { sessionId, vocabId, rating, token, now = new Date() }) {
  const session = sessions(state).find((x) => x.id === sessionId);
  if (!session || session.completedAt || session.queue[0] !== vocabId) return { state, changed: false };
  if (token !== sentenceToken(session) || hasEvent(state, token)) return { state, changed: false };
  if (rating !== 'remembered' && rating !== 'again') return { state, changed: false };

  const s = clone(state);
  const S = s.sentences.find((x) => x.id === sessionId);
  const today = dayKey(now);
  const item = S.items.find((i) => i.vocabId === vocabId);
  const progress = sentenceProgressOf(s)[vocabId] ?? newProgress(vocabId);
  let next;
  if (!isLearned(progress)) {
    next = rating === 'remembered' ? learnWord(progress, today) : recordLessonMiss(progress);
  } else {
    next = applyAnswer(progress, { correct: rating === 'remembered', today });
  }
  s.sentenceProgress = { ...sentenceProgressOf(s), [vocabId]: next };

  S.queue.shift();
  if (rating === 'remembered') item.status = 'remembered';
  else {
    item.againCount += 1;
    S.queue.splice(Math.min(REQUEUE_GAP, S.queue.length), 0, vocabId);
  }
  S.version += 1;
  pushEvent(s, { id: token, type: 'sentence', sessionId, vocabId, rating, at: now.toISOString(), day: today });
  if (!S.queue.length) {
    S.completedAt = now.toISOString();
    S.completedDay = today;
  }
  return { state: s, changed: true };
}

// v1.4: sentences changed from tile building to flashcards. Unfinished tile sessions are dropped,
// tile scores (which had no schedule) are discarded; finished lessons can be practised again as cards.
export function migrateSentences(state) {
  const list = sessions(state);
  const legacy = list.some((x) => Array.isArray(x.items) && x.items.some((i) => 'tiles' in i));
  const legacyProgress = Object.values(sentenceProgressOf(state)).some((p) => typeof p.stage !== 'number');
  if (!legacy && !legacyProgress && state.sentences && state.sentenceProgress) return state;
  return {
    ...state,
    sentences: list.filter((x) => !(Array.isArray(x.items) && x.items.some((i) => 'tiles' in i))),
    sentenceProgress: Object.fromEntries(Object.entries(sentenceProgressOf(state)).filter(([, p]) => typeof p.stage === 'number')),
  };
}
