// Irregular verbs: type the simple past and the past participle (go – went – gone). A round has ten verbs, the ones
// you got wrong most first, then new ones; a verb you got wrong comes back a few verbs later in the same round.
// Per verb: how often right and wrong, and the right answers in a row (2 in a row = "sicher").

import { clone } from './state.js';

export const VERB_ROUND = 10;
export const VERB_SURE = 2;

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^a-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Right when it is one of the accepted forms; "was/were" or "was, were" for both is right too.
export function checkForm(given, accepted) {
  const g = norm(given);
  if (!g) return false;
  const want = accepted.map(norm);
  if (want.includes(g)) return true;
  const parts = String(given).split(/[/,]| or /).map(norm).filter(Boolean);
  return parts.length > 1 && parts.every((p) => want.includes(p));
}

export const verbStatsOf = (state) => state.verbs ?? {};
export const isSure = (st) => (st?.streak ?? 0) >= VERB_SURE;

export function verbRound(verbs, state, size = VERB_ROUND) {
  const stats = verbStatsOf(state);
  const order = (v) => {
    const s = stats[v.id];
    // Often wrong first, then new verbs, then the ones still in practice, the sure ones last.
    if (!s) return [1, 0];
    if (isSure(s)) return [3, s.day ?? ''];
    return s.wrong > s.right ? [0, -(s.wrong - s.right)] : [2, s.day ?? ''];
  };
  // Inside a group the list order stays: the most common verbs first.
  return verbs
    .map((v, i) => ({ v, i, o: order(v) }))
    .sort((a, b) => a.o[0] - b.o[0] || (typeof a.o[1] === 'number' ? a.o[1] - b.o[1] : String(a.o[1]).localeCompare(String(b.o[1]))) || a.i - b.i)
    .slice(0, size)
    .map((x) => x.v.id);
}

export function recordVerb(state, id, right, day) {
  const s = clone(state);
  const all = { ...(s.verbs ?? {}) };
  const have = all[id] ?? { right: 0, wrong: 0, streak: 0 };
  all[id] = { right: have.right + (right ? 1 : 0), wrong: have.wrong + (right ? 0 : 1), streak: right ? have.streak + 1 : 0, day };
  s.verbs = all;
  return s;
}

// Two devices: per verb the record with more answers (then the later day) wins.
export function mergeVerbs(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, v] of Object.entries(b)) {
    const have = out[id];
    const n = (x) => (x?.right ?? 0) + (x?.wrong ?? 0);
    if (!have || n(v) > n(have) || (n(v) === n(have) && (v.day ?? '') > (have.day ?? ''))) out[id] = v;
  }
  return out;
}
