// Grammar practice: choose the right form, see why, keep the best result per topic (synced with the account).

import { grammarById } from '../../data/grammar.js';

export function gradeGrammar(topicId, index, choice) {
  const exercise = grammarById(topicId)?.exercises[index];
  return Boolean(exercise) && exercise[2] === choice;
}

export function recordGrammar(state, topicId, correct, total, day) {
  const before = state.grammar?.[topicId];
  const entry = { best: Math.max(before?.best ?? 0, correct), total, last: correct, day, runs: (before?.runs ?? 0) + 1 };
  return { ...state, grammar: { ...(state.grammar ?? {}), [topicId]: entry } };
}
