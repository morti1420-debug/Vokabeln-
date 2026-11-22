// Device-only preferences. Kept outside the learning state on purpose:
// they are never exported, so a backup file can never contain the ElevenLabs API key.

export const PREFS_KEY = 'english-vocabulary:prefs';

export const DEFAULT_PREFS = Object.freeze({
  lang: 'de', // UI language: 'de' | 'en' | 'zh'
  course: 'de-en', // learning course: 'de-en' (English for German speakers) | 'zh-de' (German for Chinese speakers)
  voiceChoice: 'auto', // 'auto' = use the shared natural voice whenever the server offers it; 'manual' = the user picked a source
  voiceSource: 'shared', // 'shared' (server voice, no account needed) | 'device' | 'elevenlabs' (own key)
  sharedVoice: '', // id of the shared voice, '' = the first one offered by the server
  deviceVoice: '', // name of a system voice, '' = pick the best automatically
  elevenKey: '',
  elevenVoice: '21m00Tcm4TlvDq8ikWAM',
  blitzBest: {}, // best Blitz score per course
  homeMode: 'words', // start page shows 'words' or 'sentences'
  theme: 'black', // look of the app: 'black' (dark, golden) | 'beige' (light, golden)
});

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
