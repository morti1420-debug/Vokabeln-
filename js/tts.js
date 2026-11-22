// Natural English voices via ElevenLabs, with a persistent cache so every word and
// sentence is generated (and paid for) only once per voice.

export const ELEVEN_API = 'https://api.elevenlabs.io/v1/text-to-speech';
export const ELEVEN_MODEL = 'eleven_multilingual_v2';
export const ELEVEN_CACHE = 'ev-tts-v1';

// ElevenLabs default ("premade") voices – available on every account, including the free plan.
export const ELEVEN_VOICES = Object.freeze([
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', accent: 'US', de: 'weiblich, ruhig', en: 'female, calm' },
  { id: 'EXAVITQu4vr4xnZDxvEL', name: 'Sarah', accent: 'US', de: 'weiblich, warm', en: 'female, warm' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'US', de: 'männlich, tief', en: 'male, deep' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', accent: 'UK', de: 'weiblich, klar', en: 'female, clear' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', accent: 'UK', de: 'männlich, warm', en: 'male, warm' },
]);

// ElevenLabs accepts speed 0.7–1.2; anything slower is done with playbackRate on top.
export function elevenSpeed(rate) {
  return Math.round(Math.min(1.2, Math.max(0.7, Number(rate) || 1)) * 100) / 100;
}

export class TtsError extends Error {
  constructor(reason, message, detail = '') {
    super(message ?? reason);
    // 'no-key' | 'invalid-key' | 'unusual-activity' | 'paid-plan' | 'quota' | 'voice' | 'network' | 'server'
    this.reason = reason;
    this.detail = detail; // ElevenLabs' own message, shown to the user to find the real cause
  }
}

const KNOWN_REASONS = ['invalid-key', 'key-id', 'unusual-activity', 'paid-plan', 'quota', 'voice', 'rate-limit', 'network', 'server', 'server-key'];

// ElevenLabs explains failures in the JSON body: { detail: { status, message } }.
export function classifyError(status, body) {
  const detail = body?.detail;
  const code = String(typeof detail === 'object' ? detail?.status ?? '' : '').toLowerCase();
  const message = String(typeof detail === 'string' ? detail : detail?.message ?? '').slice(0, 240);
  let reason = 'server';
  // The shared-voice server passes ElevenLabs' classification on as the status code.
  if (KNOWN_REASONS.includes(code)) reason = code;
  else if (/rate_limited/.test(code)) reason = 'rate-limit';
  else if (/key id|only valid api keys/i.test(message)) reason = 'key-id';
  else if (/unusual_activity/.test(code) || /unusual activity/i.test(message)) reason = 'unusual-activity';
  else if (/paid_plan|payment_required|only_for_creator|library_voice/.test(code) || /paid plan|upgrade|subscription/i.test(message)) reason = 'paid-plan';
  else if (/quota|character_limit|credits/.test(code) || /quota|credits/i.test(message)) reason = 'quota';
  else if (/voice_not_found|voice_does_not_exist|voice_not_allowed/.test(code) || status === 404) reason = 'voice';
  else if (status === 401 || status === 403) reason = 'invalid-key';
  else if (status === 402 || status === 429) reason = 'quota';
  return new TtsError(reason, `HTTP ${status}`, message || code);
}

function memoryCache() {
  const map = new Map();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async put(key, blob) {
      map.set(key, blob);
    },
  };
}

// Cache Storage survives reloads and works offline; falls back to memory where unavailable.
export function browserCache(cachesApi = globalThis.caches) {
  if (!cachesApi?.open) return memoryCache();
  const url = (key) => `https://tts.cache.local/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      try {
        const cache = await cachesApi.open(ELEVEN_CACHE);
        const hit = await cache.match(url(key));
        return hit ? await hit.blob() : null;
      } catch {
        return null;
      }
    },
    async put(key, blob) {
      try {
        const cache = await cachesApi.open(ELEVEN_CACHE);
        await cache.put(url(key), new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }));
      } catch {}
    },
  };
}

// The shared voice: the server (api/tts) holds the ElevenLabs key, so nobody needs an account of their own.
export const SHARED_API = '/api/tts';
export const SHARED_SPEED = 0.8; // the server always generates at this speed; the app adjusts with playbackRate

// Ready-made audio shipped with the app (created once by scripts/generate-audio.mjs): the same recorded voice on
// every device, no key and no server needed, works offline once played.
export const PACKAGED_AUDIO = 'audio/';
export const packagedName = (vocab, field) => `${vocab.course ?? 'de-en'}/${vocab.id}-${field}.mp3`;
// The exact text a recording was made from, and a short fingerprint of it: the manifest stores the fingerprint of
// every file, so a recording whose word or sentence was corrected later is never played with the old text.
// What the voice really says for a text – the written form is for reading, not always for speaking:
// - hints in brackets are not read aloud ("loud (person)" → "loud", German remarks behind grammar examples);
// - "read" as in "left on read" / "read receipts" is the past form and sounds like "red";
// - "..." becomes one pause.
export function spokenText(text) {
  return String(text ?? '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\bon read\b/g, 'on red')
    .replace(/\b([Rr])ead receipts\b/g, (m, r) => `${r}ed receipts`)
    .replace(/\.\.\./g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}
export const recordedText = (vocab, field) => spokenText(vocab[field]);

// Words the recording voice (Piper) reads with the wrong one of two pronunciations – found with the
// "Check pronunciation" workflow. For these exact texts the word's sounds are given directly in [[ ]].
// Only the recordings use this; a changed entry changes the fingerprint, so the text is recorded again.
const SOUNDS = Object.freeze({
  'Close the door, please.': ['Close', 'klˈoʊz'],
  "Close the window, it's freezing!": ['Close', 'klˈoʊz'],
  'Are you close to your family?': ['close', 'klˈoʊs'],
  'Use olive oil for the salad.': ['Use', 'jˈuːz'],
  'Use sunscreen to protect your skin.': ['Use', 'jˈuːz'],
  'My sister lives in Paris.': ['lives', 'lˈɪvz'],
  'My aunt lives nearby.': ['lives', 'lˈɪvz'],
  'My brother lives in Berlin.': ['lives', 'lˈɪvz'],
  'My grandparents live on a farm.': ['live', 'lˈɪv'],
});
export function piperText(spoken) {
  const fix = SOUNDS[spoken];
  return fix ? spoken.replace(fix[0], `[[ ${fix[1]} ]]`) : spoken;
}
export const PIPER_FIXED_TEXTS = Object.freeze(Object.keys(SOUNDS));
// Short English texts (up to three words) are recorded inside a carrier phrase, cut out and checked by speech
// recognition (scripts/record-word.py), because the voice swallows the first sound of a lone word ("still" → "till").
// The method is part of the fingerprint, so every short text recorded the old way is recorded again.
export const isShortRecording = (spoken, course = 'de-en') => course === 'de-en' && String(spoken).trim().split(/\s+/).length <= 3;
// Short texts the recording audit still heard wrong after the first word recording: recorded again with more carrier
// phrases and tries (record-word.py --hard). Being listed changes the fingerprint, so they are recorded again.
export const HARD_SHORT_TEXTS = Object.freeze(new Set([
  'noon', 'tent', 'shoes', 'stomachache', 'boss', 'skill', 'but', 'aunt', 'hostel', 'gym', 'then', 'than', 'line',
  'raw', 'to owe', 'along', 'view', 'convenient', 'anymore', 'even', 'sick', 'cold', 'to borrow', 'to adore',
  'to stay', 'to be honest', 'to move', 'to wash', 'bus stop', 'to lend', 'to arrive', 'business trip',
  'credit card', 'tourist trap', 'travel insurance', 'to want', 'to seem', 'to hurt', 'junk food', 'to save',
  'to tidy up',
]));
const shortMarker = (spoken) => (HARD_SHORT_TEXTS.has(spoken) ? '\u0000short-v3' : '\u0000short-v2');
export const recordingHash = (spoken, course = 'de-en') => textHash(piperText(spoken) + (isShortRecording(spoken, course) ? shortMarker(spoken) : ''));
export function textHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function createSharedTts({ fetchImpl = globalThis.fetch?.bind(globalThis), cache = browserCache(), base = SHARED_API, packagedBase = typeof document !== 'undefined' ? new URL(PACKAGED_AUDIO, document.baseURI).href : PACKAGED_AUDIO } = {}) {
  let packaged = null; // { voice, files:Set } once the manifest has been read
  let unreadable = false; // the list could not be loaded at all (network) – as opposed to "nothing recorded"
  async function loadPackaged() {
    try {
      const response = await fetchImpl(`${packagedBase}manifest.json`, { cache: 'no-store' });
      unreadable = !response.ok;
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data?.files) || !data.files.length) return null;
      // Older manifests describe a single voice for every course.
      const voices = Array.isArray(data.voices) && data.voices.length ? data.voices : data.voice?.id ? [{ ...data.voice, prefix: '' }] : [];
      if (!voices.length) return null;
      return { voices, files: new Set(data.files), hashes: data.hashes && typeof data.hashes === 'object' ? data.hashes : null };
    } catch {
      unreadable = true;
      return null;
    }
  }
  return {
    // Resolves { ok, voices, speed } or null when the server cannot be reached.
    async probe() {
      packaged = await loadPackaged();
      if (packaged) return { ok: true, voices: packaged.voices.map(({ id, name, gender, accent, course }) => ({ id, name, gender, accent: accent ?? 'US', course })), speed: SHARED_SPEED, packaged: true };
      try {
        const response = await fetchImpl(`${base}?status=1`, { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json();
        return data && Array.isArray(data.voices) ? { ok: Boolean(data.ok), voices: data.voices, speed: SHARED_SPEED } : null;
      } catch {
        return null;
      }
    },
    // Asks the server to test its ElevenLabs key. Resolves { ok } or { ok:false, reason, detail }.
    async check() {
      if (packaged) return { ok: true, packaged: true };
      try {
        const response = await fetchImpl(`${base}?check=1`, { cache: 'no-store' });
        if (!response.ok) {
          let body = null;
          try {
            body = await response.json();
          } catch {}
          const e = classifyError(response.status, body);
          return { ok: false, reason: e.reason, detail: e.detail || e.message };
        }
        return await response.json();
      } catch {
        return { ok: false, reason: 'network', detail: '' };
      }
    },
    async synthesize(vocab, field, { voiceId }) {
      const key = `shared|${voiceId}|${SHARED_SPEED}|${vocab[field]}`;
      const cached = await cache.get(key);
      if (cached) return { blob: cached, cached: true };
      // Played before the start-up check finished: read the list of recordings first, so a recorded text is never
      // spoken by the device voice just because it was tapped too early.
      if (!packaged) packaged = await loadPackaged();
      // The chosen recorded voice; an unknown one (e.g. from another course) falls back to the course's first voice.
      const own = packaged?.voices.filter((v) => !v.course || v.course === (vocab.course ?? 'de-en')) ?? [];
      const chosen = own.find((v) => v.id === voiceId) ?? own[0];
      // Texts recorded with the main voice only (topic words, grammar) are played in that voice rather than falling
      // back to the robotic device voice.
      const fileOf = (voice) => `${voice?.prefix ?? ''}${packagedName(vocab, field)}`;
      const usable = (voice) => voice && packaged.files.has(fileOf(voice)) && (!packaged.hashes || packaged.hashes[fileOf(voice)] === recordingHash(recordedText(vocab, field), vocab.course ?? 'de-en'));
      // The list of recordings could not be read (e.g. a bad connection at the start): the file names are fixed, so
      // the main voice's file is asked for directly.
      const recorded = packaged ? [chosen, own[0]].find(usable) : unreadable ? { prefix: '' } : null;
      const name = fileOf(recorded);
      if (recorded) {
        try {
          const file = await fetchImpl(`${packagedBase}${name}`);
          if (file.ok) {
            const blob = await file.blob();
            await cache.put(key, blob);
            return { blob, cached: false };
          }
        } catch {}
      }
      let response;
      try {
        response = await fetchImpl(`${base}?id=${encodeURIComponent(vocab.id)}&f=${encodeURIComponent(field)}&v=${encodeURIComponent(voiceId)}&c=${encodeURIComponent(vocab.course ?? 'de-en')}`);
      } catch {
        throw new TtsError('network');
      }
      if (!response.ok) {
        let body = null;
        try {
          body = await response.json();
        } catch {}
        throw classifyError(response.status, body);
      }
      const blob = await response.blob();
      await cache.put(key, blob);
      return { blob, cached: false };
    },
  };
}

export function createElevenLabs({ fetchImpl = globalThis.fetch?.bind(globalThis), cache = browserCache() } = {}) {
  return {
    cacheKey(voiceId, text, speed = 1) {
      return `${voiceId}|${ELEVEN_MODEL}|${speed}|${text}`;
    },
    // fresh: skip the cache (used by the connection test, so it really talks to ElevenLabs).
    async synthesize(text, { apiKey, voiceId, speed = 1, fresh = false }) {
      if (!apiKey) throw new TtsError('no-key');
      const voiceSpeed = elevenSpeed(speed);
      const key = this.cacheKey(voiceId, text, voiceSpeed);
      const cached = fresh ? null : await cache.get(key);
      if (cached) return { blob: cached, cached: true };

      let response;
      try {
        response = await fetchImpl(`${ELEVEN_API}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text,
            model_id: ELEVEN_MODEL,
            // speed slows the voice itself (natural), instead of stretching the audio afterwards.
            voice_settings: { stability: 0.6, similarity_boost: 0.75, speed: voiceSpeed },
          }),
        });
      } catch {
        throw new TtsError('network');
      }
      if (!response.ok) {
        let body = null;
        try {
          body = await response.json();
        } catch {}
        throw classifyError(response.status, body);
      }
      const blob = await response.blob();
      if (!fresh) await cache.put(key, blob);
      return { blob, cached: false };
    },
  };
}
