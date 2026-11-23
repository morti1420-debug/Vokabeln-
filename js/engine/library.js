// Your own word collection: starred words, hard words, words you already know before a lesson,
// practice pools and the numbers behind the review forecast and the learning calendar.

import { situationById } from '../../data/situations.js';
import { TOPIC_OF } from '../../data/topics.js';
import { addDays, dayKey, diffDays } from './dates.js';
import { errorRate, isHardWord, isLearned, markKnown, newProgress } from './srs.js';
import { clone } from './state.js';

export const HARD_LIMIT = 20;
export const RECENT_LESSONS = 3;

// The last lessons that have learned words (for "practise what I just learned").
export function recentLessons(state, count = RECENT_LESSONS) {
  return state.lessons.filter((l) => l.items.some((i) => isLearned(state.progress[i.vocabId]))).slice(-count);
}

export function isStarred(state, vocabId) {
  return (state.starred ?? []).includes(vocabId);
}

export function toggleStar(state, vocabId) {
  const s = clone(state);
  const list = s.starred ?? [];
  s.starred = list.includes(vocabId) ? list.filter((id) => id !== vocabId) : [...list, vocabId];
  return s;
}

export function learnedIds(state) {
  return Object.values(state.progress)
    .filter(isLearned)
    .map((p) => p.vocabId);
}

// Words you got wrong at least once – the words marked difficult (forgotten again and again) first,
// then the highest error rate.
export function hardWordIds(state, limit = HARD_LIMIT) {
  return Object.values(state.progress)
    .filter((p) => isLearned(p) && p.wrongCount > 0)
    .sort((a, b) => Number(isHardWord(b)) - Number(isHardWord(a)) || errorRate(b) - errorRate(a) || b.wrongCount - a.wrongCount || a.vocabId.localeCompare(b.vocabId))
    .slice(0, limit)
    .map((p) => p.vocabId);
}

// scope: 'all' | 'starred' | 'hard' | a lesson id. Only words you have actually learned are practised.
// "days-7", "days-14", "days-30", "days-90": the words first learned in the last n days (today included).
export const RECENT_DAY_RANGES = Object.freeze([7, 14, 30, 90]);
export const daysOfScope = (scope) => {
  const n = Number(/^days-(\d+)$/.exec(scope ?? '')?.[1]);
  return RECENT_DAY_RANGES.includes(n) ? n : null;
};

// Free review rounds on the review page: today's new words, and the older words you have not seen for the longest time.
export const OLD_ROUND = 25;
export function poolFor(state, scope, today = dayKey()) {
  if (scope === 'all') return learnedIds(state);
  if (scope === 'today') return learnedIds(state).filter((id) => state.progress[id].firstLearnedDay === today);
  if (scope === 'old') {
    return learnedIds(state)
      .filter((id) => (state.progress[id].firstLearnedDay ?? '') < today)
      .sort((a, b) => {
        const pa = state.progress[a];
        const pb = state.progress[b];
        return (pa.lastReviewedDay ?? pa.firstLearnedDay ?? '').localeCompare(pb.lastReviewedDay ?? pb.firstLearnedDay ?? '') || pa.stage - pb.stage || a.localeCompare(b);
      });
  }
  const days = daysOfScope(scope);
  if (days) {
    const from = addDays(today, -(days - 1));
    return learnedIds(state).filter((id) => state.progress[id].firstLearnedDay >= from && state.progress[id].firstLearnedDay <= today);
  }
  if (scope?.startsWith('topic-')) return learnedIds(state).filter((id) => TOPIC_OF[id] === scope.slice(6));
  // An everyday or business situation: always its ten words, learned or not – ready to practise any time.
  // Like starred words, a word that is not learned yet is only practised; its learning plan does not change.
  if (scope?.startsWith('sit-')) return [...(situationById(scope.slice(4))?.words ?? [])];
  if (scope === 'hard') return hardWordIds(state);
  if (scope === 'recent') {
    const ids = recentLessons(state).flatMap((l) => l.items.map((i) => i.vocabId));
    return [...new Set(ids)].filter((id) => isLearned(state.progress[id]));
  }
  // Starred words are practised whether or not they are learned yet: you marked them to learn them again.
  // A word that is not learned yet is only practised – its learning plan does not change.
  if (scope === 'starred') return [...new Set(state.starred ?? [])];
  const lesson = state.lessons.find((l) => l.id === scope);
  if (!lesson) return [];
  return lesson.items.filter((i) => isLearned(state.progress[i.vocabId])).map((i) => i.vocabId);
}

// Sort out words you already know before their lesson starts – they are never taught or counted as learned.
export function markKnownAhead(state, vocabId, today) {
  if (state.progress[vocabId]) return state;
  const s = clone(state);
  s.progress[vocabId] = markKnown(newProgress(vocabId), today);
  return s;
}

// Undo is only possible while the word is not part of any lesson yet.
export function unmarkKnownAhead(state, vocabId) {
  const p = state.progress[vocabId];
  if (!p || p.status !== 'known') return state;
  const used = state.lessons.some((l) => l.items.some((i) => i.vocabId === vocabId) || l.replacements.some((r) => r.knownId === vocabId));
  if (used) return state;
  const s = clone(state);
  delete s.progress[vocabId];
  return s;
}

// How many words and sentences become due on each of the next days (today includes everything overdue).
export function reviewForecast(state, today, days = 7) {
  const out = Array.from({ length: days }, (_, i) => ({ day: addDays(today, i), words: 0, sentences: 0 }));
  const slot = (due) => {
    if (!due) return null;
    const d = Math.max(0, diffDays(today, due));
    return d < days ? out[d] : null;
  };
  for (const p of Object.values(state.progress)) {
    if (!isLearned(p)) continue;
    const s = slot(p.nextDueDay);
    if (s) s.words += 1;
  }
  for (const p of Object.values(state.sentenceProgress ?? {})) {
    if (!p.firstLearnedDay) continue;
    const s = slot(p.nextDueDay);
    if (s) s.sentences += 1;
  }
  return out;
}

// Answers per calendar day: the stored events plus the daily counts of older, compacted days.
export function activityByDay(state) {
  const map = new Map(Object.entries(state.activity ?? {}));
  for (const e of state.events) {
    if (!e.day) continue;
    map.set(e.day, (map.get(e.day) ?? 0) + 1);
  }
  return map;
}

// "Meine Merkhilfe": your own short note for a word (a mnemonic, a picture, a sentence of your own). An empty text
// removes it; the time is kept so the newer change wins when two devices are merged.
export const MEMO_MAX = 140;
export const memoOf = (state, vocabId) => state.memos?.[vocabId]?.text ?? '';
export function setMemo(state, vocabId, text, now = new Date()) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MEMO_MAX);
  if (clean === memoOf(state, vocabId)) return state;
  const s = clone(state);
  s.memos = { ...(s.memos ?? {}), [vocabId]: { text: clean, at: now.toISOString() } };
  return s;
}

// The words you did not know today (lesson, review or practice), newest first – for a short round at the end.
export function todayMistakeIds(state, today = dayKey()) {
  const ids = [];
  for (let i = state.events.length - 1; i >= 0; i -= 1) {
    const e = state.events[i];
    if (e.day === today && e.rating === 'again' && e.vocabId && isLearned(state.progress[e.vocabId]) && !ids.includes(e.vocabId)) ids.push(e.vocabId);
  }
  return ids;
}
