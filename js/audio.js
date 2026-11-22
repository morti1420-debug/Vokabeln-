// English-only pronunciation. Everything here accepts a vocabulary entry plus a field name and
// only ever reads the two English fields – German text can never reach a voice.

import { SHARED_SPEED, TtsError, elevenSpeed, spokenText } from './tts.js';

export const SPEAKABLE_FIELDS = Object.freeze(['english', 'exampleEn']);

function assertSpeakable(field) {
  if (!SPEAKABLE_FIELDS.includes(field)) throw new Error(`Field "${field}" is not speakable`);
}

const normLang = (lang) => String(lang ?? '').replace('_', '-').toLowerCase();

// macOS/iOS joke voices – never pick these automatically.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy)\b/i;

// 'premium' | 'enhanced' | 'standard'. iPhone and Mac reveal the quality in the name ("Ava (Premium)")
// or in the voice URI ("com.apple.voice.premium.en-US.Ava"); online neural voices count as premium.
export function voiceQuality(voice) {
  const id = `${voice?.name ?? ''} ${voice?.voiceURI ?? ''}`;
  if (/premium|natural|neural|online/i.test(id)) return 'premium';
  if (/enhanced|erweitert|verbessert|^google /i.test(id)) return 'enhanced';
  return 'standard';
}

// Higher = more natural. Premium/enhanced/neural system voices sound far less robotic.
export function voiceScore(voice, accent = 'en-US') {
  const name = voice.name ?? '';
  const id = `${name} ${voice.voiceURI ?? ''}`;
  let score = 0;
  if (normLang(voice.lang) === accent.toLowerCase()) score += 5;
  if (/premium/i.test(id)) score += 6;
  if (/enhanced|erweitert|verbessert/i.test(id)) score += 4;
  if (/natural|neural|online/i.test(name)) score += 4;
  if (/^google /i.test(name)) score += 2;
  if (/samantha|ava|zoe|allison|evan|nathan|serena|daniel|kate|moira|karen|aria|jenny|guy|sonia|libby|ryan|anna|petra|markus|yannick|viktor|katja|amala|conrad|vicki|seraphina/i.test(name)) score += 1;
  if (/compact/i.test(id)) score -= 2;
  if (NOVELTY.test(name)) score -= 20;
  return score;
}

export function createSpeaker({ synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance } = {}) {
  let voices = [];
  const listeners = new Set();
  const supported = Boolean(synth && Utterance);
  let language = 'en'; // the language that is being learned: only voices of this language are offered

  const refresh = () => {
    voices = supported ? (synth.getVoices() ?? []).filter((v) => new RegExp(`^${language}([-_]|$)`, 'i').test(v.lang)) : [];
    listeners.forEach((fn) => fn());
  };

  if (supported) {
    refresh();
    // Chrome and Safari load voices asynchronously.
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refresh);
    else synth.onvoiceschanged = refresh;
  }

  function rankedVoices(accent = 'en-US') {
    return [...voices].sort((a, b) => voiceScore(b, accent) - voiceScore(a, accent) || a.name.localeCompare(b.name));
  }

  function pickVoice(accent, preferredName) {
    if (preferredName) {
      const chosen = voices.find((v) => v.name === preferredName);
      if (chosen) return chosen;
    }
    return rankedVoices(accent)[0] ?? null;
  }

  return {
    get supported() {
      return supported;
    },
    // 'en' (default) or 'de': switches the language of the offered voices.
    setLanguage(code) {
      if (code === language) return;
      language = code;
      if (supported) refresh();
    },
    hasEnglishVoice() {
      return voices.length > 0;
    },
    englishVoices(accent) {
      return rankedVoices(accent);
    },
    // The voice that will actually be used.
    currentVoice(accent = 'en-US', preferredName = '') {
      return pickVoice(accent, preferredName);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // Must be called from a user gesture (required by iOS Safari).
    speakField(vocab, field, { accent = 'en-US', rate = 1, voiceName = '' } = {}) {
      assertSpeakable(field);
      if (!supported) return { ok: false, reason: 'unsupported' };
      const voice = pickVoice(accent, voiceName);
      if (!voice) return { ok: false, reason: 'no-voice' };
      const text = spokenText(vocab[field]);
      synth.cancel();
      const u = new Utterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      synth.speak(u);
      return { ok: true, text, source: 'device', voice: voice.name };
    },
    stop() {
      if (supported) synth.cancel();
    },
  };
}

// A 1-sample silent WAV. Playing it synchronously inside the tap unlocks the audio element on iOS,
// so the real clip may start after the network request has finished.
function silentWavUrl() {
  const bytes = new Uint8Array([
    82, 73, 70, 70, 38, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 68, 172, 0, 0, 136, 88, 1, 0, 2, 0, 16, 0,
    100, 97, 116, 97, 2, 0, 0, 0, 0, 0,
  ]);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

// Plays the natural recorded voice (or ElevenLabs with an own key); the device voice only when chosen on purpose.
export function createAudioPlayer({ speaker, eleven, shared, createAudio = () => new Audio(), createUrl = (b) => URL.createObjectURL(b), revokeUrl = (u) => URL.revokeObjectURL?.(u) }) {
  let audio = null;
  let silent = null;
  let request = 0;
  // Recordings that are already loaded (key -> object URL). iPhones only play sound that starts within the tap
  // itself; a loaded recording can start right away, without waiting for the network or the cache.
  const ready = new Map();
  const loading = new Map();
  const READY_MAX = 60;

  function element() {
    if (!audio) {
      audio = createAudio();
      audio.preload = 'auto';
    }
    return audio;
  }

  const keyOf = (vocab, field, voiceId) => `${voiceId}|${vocab.course ?? ''}|${vocab.id}|${field}|${vocab[field] ?? ''}`;

  function remember(key, blob) {
    const have = ready.get(key);
    if (have) return have;
    const url = createUrl(blob);
    ready.set(key, url);
    while (ready.size > READY_MAX) {
      const [oldKey, oldUrl] = ready.entries().next().value;
      if (audio?.src === oldUrl) break;
      ready.delete(oldKey);
      revokeUrl(oldUrl);
    }
    return url;
  }

  // Loads the shared voice's recording of a word or sentence ahead, so that tapping (or turning the card) plays it at once.
  function prefetch(vocab, field, { source = 'device', voiceId = '' } = {}) {
    if (source !== 'shared' || !shared || !voiceId || !vocab?.[field]) return Promise.resolve(false);
    const key = keyOf(vocab, field, voiceId);
    if (ready.has(key)) return Promise.resolve(true);
    if (!loading.has(key)) {
      loading.set(
        key,
        shared
          .synthesize(vocab, field, { voiceId })
          .then(({ blob }) => (remember(key, blob), true))
          .catch(() => false)
          .finally(() => loading.delete(key)),
      );
    }
    return loading.get(key);
  }

  function stop() {
    request++;
    speaker.stop();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  // A recording that cannot be loaded or played is never replaced by the robotic device voice: the caller gets
  // { ok:false, recordingFailed } and tells the user (a second tap usually works – the recording is loaded by then).
  function fallback(vocab, field, source, text, error) {
    const reason = error instanceof TtsError ? error.reason : 'playback';
    const detail = error instanceof TtsError ? error.detail : String(error?.message ?? '');
    return { ok: false, source, text, recordingFailed: true, reason, detail };
  }

  async function play(vocab, field, { source = 'device', apiKey = '', voiceId = '', accent = 'en-US', rate = 1, voiceName = '' } = {}) {
    assertSpeakable(field);
    const text = String(vocab[field] ?? '');
    const useShared = source === 'shared' && Boolean(shared) && Boolean(voiceId);
    const useOwn = source === 'elevenlabs' && Boolean(apiKey) && Boolean(eleven);
    if (!useShared && !useOwn) {
      return speaker.speakField(vocab, field, { accent, rate, voiceName });
    }

    stop();
    const id = request;
    const el = element();
    const speed = useShared ? SHARED_SPEED : elevenSpeed(rate);
    const setRate = () => {
      el.playbackRate = Math.round((rate / speed) * 100) / 100;
      el.preservesPitch = true;
    };

    // Already loaded: start inside the tap, with nothing to wait for (the reliable way on iPhones).
    const loaded = useShared ? ready.get(keyOf(vocab, field, voiceId)) : null;
    if (loaded) {
      try {
        el.src = loaded;
        setRate();
        await el.play();
        return { ok: true, source, text, cached: true };
      } catch (error) {
        if (id !== request) return { ok: true, source, text, cancelled: true };
        return fallback(vocab, field, source, text, error);
      }
    }

    // Not loaded yet: unlock the element synchronously, still inside the tap, then load and play.
    try {
      silent ??= silentWavUrl();
      el.src = silent;
      el.play()?.catch?.(() => {});
    } catch {}

    try {
      const { blob, cached } = useShared ? await shared.synthesize(vocab, field, { voiceId }) : await eleven.synthesize(text, { apiKey, voiceId, speed });
      if (id !== request) return { ok: true, source, text, cancelled: true };
      el.src = useShared ? remember(keyOf(vocab, field, voiceId), blob) : createUrl(blob);
      setRate();
      await el.play();
      return { ok: true, source, text, cached };
    } catch (error) {
      if (id !== request) return { ok: true, source, text, cancelled: true };
      return fallback(vocab, field, source, text, error);
    }
  }

  return { play, stop, prefetch };
}
