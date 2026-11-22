import { CATEGORIES } from '../../data/vocabulary.js';
import { TOPIC_OF } from '../../data/topics.js';

// Which words come first. "easy" starts with the basics (A1) and unlocks B1 later;
// "medium" (default) starts gently with the A2 words, then the harder B1 phrases, and leaves the basics you probably
// know for the end;
// "hard" starts with B1.
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
const CEFR_ORDER = {
  easy: { A1: 1, A2: 2, B1: 3, B2: 4 },
  medium: { A2: 1, B1: 2, A1: 3, B2: 4 },
  hard: { B1: 1, B2: 2, A2: 3, A1: 4 },
};

export function difficulty(state) {
  return DIFFICULTIES.includes(state.settings?.difficulty) ? state.settings.difficulty : 'medium';
}

export const B1_GATE = { minSolidWords: 60, minRecentAccuracy: 0.75, recentTests: 5 };

export function usedVocabIds(state) {
  const used = new Set(Object.keys(state.progress));
  for (const lesson of [...state.lessons, ...(state.topicLessons ?? [])]) {
    for (const item of lesson.items) used.add(item.vocabId);
    for (const r of lesson.replacements) used.add(r.knownId);
  }
  return used;
}

export function testAccuracy(test) {
  const answered = test.answers.length;
  if (!answered) return 0;
  return test.answers.filter((a) => a.isCorrect).length / answered;
}

export function isB1Unlocked(state) {
  const solid = Object.values(state.progress).filter((p) => p.status === 'reviewing' || p.status === 'mastered').length;
  if (solid < B1_GATE.minSolidWords) return false;
  const recent = state.tests.filter((t) => t.completedAt).slice(-B1_GATE.recentTests);
  if (recent.length < B1_GATE.recentTests) return false;
  const avg = recent.reduce((sum, t) => sum + testAccuracy(t), 0) / recent.length;
  return avg >= B1_GATE.minRecentAccuracy;
}

// New words that `belongs` accepts, easiest first for the chosen level.
function candidates(vocabulary, state, belongs, extraExcluded) {
  const used = usedVocabIds(state);
  const level = difficulty(state);
  const order = CEFR_ORDER[level];
  const allowB1 = level !== 'easy' || isB1Unlocked(state);
  return vocabulary
    .filter((v) => belongs(v) && !used.has(v.id) && !extraExcluded.has(v.id))
    .filter((v) => allowB1 || (v.cefr !== 'B1' && v.cefr !== 'B2'))
    .sort((a, b) => order[a.cefr] - order[b.cefr] || a.frequencyRank - b.frequencyRank);
}

export function candidatesFor(vocabulary, state, category, extraExcluded = new Set()) {
  return candidates(vocabulary, state, (v) => v.category === category, extraExcluded);
}

// New words of one topic (all categories), for a lesson you start from the topic page.
export function topicCandidates(vocabulary, state, topic, extraExcluded = new Set()) {
  return candidates(vocabulary, state, (v) => TOPIC_OF[v.id] === topic, extraExcluded);
}

// Returns { ids, shortfalls: [{category, missing}] }. Never duplicates and never borrows from another category.
// quotas: words per category (defaults to the 5 / 3 / 2 split); excluded: ids that are already planned elsewhere.
export function selectNewWords(vocabulary, state, quotas = defaultQuotas(), excluded = new Set()) {
  const ids = [];
  const shortfalls = [];
  for (const [category, quota] of Object.entries(quotas)) {
    if (quota <= 0) continue;
    const picked = candidatesFor(vocabulary, state, category, excluded).slice(0, quota).map((v) => v.id);
    ids.push(...picked);
    if (picked.length < quota) shortfalls.push({ category, missing: quota - picked.length });
  }
  return { ids, shortfalls };
}

export function defaultQuotas() {
  return Object.fromEntries(Object.entries(CATEGORIES).map(([c, { quota }]) => [c, quota]));
}

// Bigger lessons keep the same mix (50 % everyday, 30 % dating, 20 % fundamentals), largest remainder first.
export function quotasFor(size) {
  const base = defaultQuotas();
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  const raw = Object.entries(base).map(([c, q]) => ({ c, exact: (q * size) / total }));
  const out = Object.fromEntries(raw.map(({ c, exact }) => [c, Math.floor(exact)]));
  let left = size - Object.values(out).reduce((a, b) => a + b, 0);
  for (const { c } of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left-- <= 0) break;
    out[c] += 1;
  }
  return out;
}

// ---- Themed lessons (default since v1.37) --------------------------------------------------------------------
// Every lesson has one theme ("Essen & Trinken", "Gefühle" …): related words are easier to learn together than a
// random mix. The themes take turns in this order, so every lesson brings something new. Within the chosen level
// (see CEFR_ORDER) the most useful words of a theme come first; a theme that runs out is topped up with the next one.
export const LESSON_ORDERS = ['theme', 'mix'];
export const lessonOrder = (state) => (LESSON_ORDERS.includes(state.settings?.lessonOrder) ? state.settings.lessonOrder : 'theme');
export const THEME_ROTATION = ['talk', 'feelings', 'time', 'food', 'home', 'free', 'everyday', 'travel', 'work', 'dating', 'online', 'health', 'basics', 'business'];

// Inside a lesson: things first (nouns), then what you do with them (verbs), how they are (adjectives, adverbs),
// the small words, and the phrases that put it all together at the end.
const POS_ORDER = { noun: 1, verb: 2, 'phrasal verb': 3, 'modal verb': 3, adjective: 4, adverb: 5, phrase: 7 };
const posRank = (v) => POS_ORDER[v.partOfSpeech] ?? 6;

// The theme the last planned lesson ended with (the newest main lesson that has themes).
export function lastTheme(state) {
  for (let i = state.lessons.length - 1; i >= 0; i -= 1) {
    const themes = state.lessons[i].themes;
    if (themes?.length) return themes.at(-1);
  }
  return null;
}

// Returns { ids, themes } – the next `size` new words, grouped by theme, after the theme `after`.
export function selectThemedWords(vocabulary, state, size, excluded = new Set(), after = lastTheme(state)) {
  const order = CEFR_ORDER[difficulty(state)];
  const pool = candidates(vocabulary, state, () => true, excluded);
  if (!pool.length || size <= 0) return { ids: [], themes: [] };
  const byTheme = new Map();
  for (const v of pool) {
    const theme = TOPIC_OF[v.id] ?? 'everyday';
    if (!byTheme.has(theme)) byTheme.set(theme, []);
    byTheme.get(theme).push(v);
  }
  const rotation = [...THEME_ROTATION, ...[...byTheme.keys()].filter((th) => !THEME_ROTATION.includes(th))];
  const start = after ? rotation.indexOf(after) + 1 : 0;
  const turn = rotation.map((_, k) => rotation[(start + k) % rotation.length]);
  const picked = [];
  const themes = [];
  // Level by level (easiest first): a lesson never jumps ahead while easier words are still waiting.
  const ranks = [...new Set(pool.map((v) => order[v.cefr]))].sort((a, b) => a - b);
  for (const rank of ranks) {
    for (const theme of turn) {
      if (picked.length >= size) break;
      const words = (byTheme.get(theme) ?? []).filter((v) => order[v.cefr] === rank && !picked.includes(v));
      if (!words.length) continue;
      const take = words.slice(0, size - picked.length);
      picked.push(...take);
      if (!themes.includes(theme)) themes.push(theme);
    }
    if (picked.length >= size) break;
  }
  // Grouped by theme, inside a theme by kind of word, then by usefulness.
  const sorted = themes.flatMap((theme) =>
    picked.filter((v) => (TOPIC_OF[v.id] ?? 'everyday') === theme).sort((a, b) => posRank(a) - posRank(b) || a.frequencyRank - b.frequencyRank),
  );
  return { ids: sorted.map((v) => v.id), themes };
}
