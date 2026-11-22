import { SCHEMA_VERSION, createInitialState } from './engine/state.js';

export const STORAGE_KEY = 'english-vocabulary:state';
export const EXPORT_APP_ID = 'english-vocabulary';

export function storageAvailable(storage = globalThis.localStorage) {
  try {
    const probe = '__ev_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// Every course keeps its own state under its own key. `course` is a course config (js/courses.js) or null.
export function loadState(storage = globalThis.localStorage, now = new Date(), course = null) {
  const key = course?.storageKey ?? STORAGE_KEY;
  try {
    const raw = storage.getItem(key);
    if (!raw) return { state: createInitialState(now, course), error: null };
    const parsed = JSON.parse(raw);
    const check = validateState(parsed);
    if (!check.ok) return { state: createInitialState(now, course), error: `Gespeicherte Daten sind beschädigt (${check.error}).`, corruptRaw: raw };
    const migrated = renameVocabIds(parsed, course?.renamedIds);
    // Before the saved data is changed by an update, the untouched original is kept as a backup.
    if (migrated !== parsed) backupState(storage, key, raw, now, 'rename');
    return { state: migrated, error: null, migrated: migrated !== parsed };
  } catch (e) {
    return { state: createInitialState(now, course), error: 'Gespeicherte Daten konnten nicht gelesen werden.' };
  }
}

export const BACKUP_SUFFIX = ':backup';

// One backup slot per course: the stored data exactly as it was before the last data migration.
export function backupState(storage, key, raw, now = new Date(), reason = 'migration') {
  try {
    storage.setItem(`${key}${BACKUP_SUFFIX}`, JSON.stringify({ savedAt: now.toISOString(), reason, raw }));
    return true;
  } catch {
    return false;
  }
}

export function readBackup(storage, key) {
  try {
    const data = JSON.parse(storage.getItem(`${key}${BACKUP_SUFFIX}`) ?? 'null');
    return data && typeof data.raw === 'string' ? data : null;
  } catch {
    return null;
  }
}

// The backup is only needed for a while after an update; after 30 days it is removed to keep storage free.
export const BACKUP_DAYS = 30;
export function pruneBackup(storage, key, now = new Date()) {
  const backup = readBackup(storage, key);
  if (!backup) return false;
  if (now - new Date(backup.savedAt) < BACKUP_DAYS * 86400000) return false;
  try {
    storage.removeItem(`${key}${BACKUP_SUFFIX}`);
  } catch {}
  return true;
}

// Renamed vocabulary ids ({ old: new }) are replaced everywhere – as object keys and as values – so a renamed
// word keeps its whole history. Returns the same object when nothing had to change.
export function renameVocabIds(state, renamed) {
  if (!renamed || !Object.keys(renamed).length) return state;
  let changed = false;
  const walk = (v) => {
    if (typeof v === 'string') {
      if (Object.hasOwn(renamed, v)) {
        changed = true;
        return renamed[v];
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        const nk = Object.hasOwn(renamed, k) ? renamed[k] : k;
        if (nk !== k) changed = true;
        if (nk !== k && Object.hasOwn(v, nk)) continue; // the new id already has its own record
        out[nk] = walk(val);
      }
      return out;
    }
    return v;
  };
  const next = walk(state);
  return changed ? next : state;
}

// Throws on failure (quota exceeded, storage blocked) so the caller can keep the previous state.
export function saveState(state, storage = globalThis.localStorage, key = STORAGE_KEY) {
  storage.setItem(key, JSON.stringify(state));
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateState(s, knownVocabIds = null) {
  if (!isObject(s)) return { ok: false, error: 'kein Objekt' };
  if (s.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: `unbekannte Schema-Version ${s.schemaVersion}` };
  if (!isObject(s.settings)) return { ok: false, error: 'settings fehlt' };
  if (!isObject(s.progress)) return { ok: false, error: 'progress fehlt' };
  for (const key of ['lessons', 'tests', 'events']) {
    if (!Array.isArray(s[key])) return { ok: false, error: `${key} fehlt` };
  }
  if ('sentences' in s && !Array.isArray(s.sentences)) return { ok: false, error: 'sentences ungültig' };
  if ('starred' in s && (!Array.isArray(s.starred) || s.starred.some((id) => typeof id !== 'string'))) return { ok: false, error: 'starred ungültig' };
  if ('sentenceProgress' in s && !isObject(s.sentenceProgress)) return { ok: false, error: 'sentenceProgress ungültig' };
  if ('topicLessons' in s && (!Array.isArray(s.topicLessons) || s.topicLessons.some((l) => !isObject(l) || typeof l.id !== 'string' || typeof l.topic !== 'string' || !Array.isArray(l.items) || !Array.isArray(l.queue)))) return { ok: false, error: 'topicLessons ungültig' };
  if ('grammar' in s && (!isObject(s.grammar) || Object.values(s.grammar).some((g) => !isObject(g) || typeof g.best !== 'number'))) return { ok: false, error: 'grammar ungültig' };
  if ('dialogs' in s && (!isObject(s.dialogs) || Object.values(s.dialogs).some((d) => !isObject(d) || typeof d.runs !== 'number'))) return { ok: false, error: 'dialogs ungültig' };
  if ('songs' in s && (!Array.isArray(s.songs) || s.songs.some((x) => !isObject(x) || typeof x.id !== 'string' || (!x.deleted && (!Array.isArray(x.words) || !Array.isArray(x.lines)))))) return { ok: false, error: 'songs ungültig' };
  if ('activity' in s && (!isObject(s.activity) || Object.values(s.activity).some((n) => typeof n !== 'number'))) return { ok: false, error: 'activity ungültig' };
  for (const [id, p] of Object.entries(s.progress)) {
    if (!isObject(p) || p.vocabId !== id || typeof p.stage !== 'number') return { ok: false, error: `Fortschritt für ${id} ungültig` };
    if (knownVocabIds && !knownVocabIds.has(id)) return { ok: false, error: `unbekannte Vokabel ${id}` };
  }
  for (const l of s.lessons) {
    if (!isObject(l) || typeof l.id !== 'string' || !Array.isArray(l.items) || !Array.isArray(l.queue)) {
      return { ok: false, error: 'Lektion ungültig' };
    }
  }
  for (const t of s.tests) {
    if (!isObject(t) || typeof t.id !== 'string' || !Array.isArray(t.questions) || !Array.isArray(t.answers)) {
      return { ok: false, error: 'Test ungültig' };
    }
  }
  const eventIds = new Set();
  for (const e of s.events) {
    if (!isObject(e) || typeof e.id !== 'string') return { ok: false, error: 'Ereignis ungültig' };
    if (eventIds.has(e.id)) return { ok: false, error: 'doppelte Ereignis-ID' };
    eventIds.add(e.id);
  }
  return { ok: true };
}

export function exportData(state, now = new Date()) {
  return JSON.stringify({ app: EXPORT_APP_ID, exportedAt: now.toISOString(), state }, null, 2);
}

export function parseImport(text, knownVocabIds = null, renamed = null) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  if (!isObject(data) || data.app !== EXPORT_APP_ID || !isObject(data.state)) {
    return { ok: false, error: 'Die Datei ist kein Export von English Vocabulary.' };
  }
  const imported = renameVocabIds(data.state, renamed);
  const check = validateState(imported, knownVocabIds);
  if (!check.ok) return { ok: false, error: `Die Datei ist ungültig: ${check.error}.` };
  return { ok: true, state: imported, exportedAt: data.exportedAt ?? null };
}

export function hasLearningData(state) {
  return state.lessons.length > 0 || state.tests.length > 0 || Object.keys(state.progress).length > 0;
}
