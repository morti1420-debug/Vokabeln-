// Dialog practice: how often a situation's dialog was played through, and when last (synced with the account).
// Free answers are never graded – there is no reliable check for them.

export function recordDialog(state, situationId, day) {
  const before = state.dialogs?.[situationId];
  const entry = { runs: (before?.runs ?? 0) + 1, day };
  return { ...state, dialogs: { ...(state.dialogs ?? {}), [situationId]: entry } };
}

// Two devices: the higher number of runs wins, then the later day.
export function mergeDialogs(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, d] of Object.entries(b)) {
    const have = out[id];
    out[id] = !have || d.runs > have.runs || (d.runs === have.runs && (d.day ?? '') > (have.day ?? '')) ? d : have;
  }
  return out;
}

// Stories: how often a story was finished, the best score of its questions, and when last.
export function recordStory(state, storyId, { correct, total }, day) {
  const before = state.stories?.[storyId];
  const entry = { runs: (before?.runs ?? 0) + 1, best: Math.max(before?.best ?? 0, correct), total, day };
  return { ...state, stories: { ...(state.stories ?? {}), [storyId]: entry } };
}

// Two devices: the higher number of runs wins, then the later day; the best score is kept from both.
export function mergeStories(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, d] of Object.entries(b)) {
    const have = out[id];
    const pick = !have || d.runs > have.runs || (d.runs === have.runs && (d.day ?? '') > (have.day ?? '')) ? d : have;
    out[id] = { ...pick, best: Math.max(d.best ?? 0, have?.best ?? 0) };
  }
  return out;
}
