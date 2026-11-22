// Network helpers of the music area (js/engine/music.js):
// - the song catalogue (Apple's public iTunes search): title, artist, album, the original cover and a 30-second
//   preview; nothing about you is sent, only what you type into the search,
// - translations of the song words and lines that are not in the app's vocabulary (MyMemory, a free translation
//   service; only these words and lines are sent),
// - your own cover picture, made small enough to keep in the learning state.

const CATALOG = 'https://itunes.apple.com/search';
// The app's own server asks Apple's catalogues of several countries and the translation service (server/music-proxy.js);
// asking them directly is the fallback, e.g. when the app runs without that server.
const PROXY = () => (globalThis.location?.origin?.startsWith('http') ? `${globalThis.location.origin}/api/music` : null);
const TRANSLATE = 'https://api.mymemory.translated.net/get';
const CHUNK = 450; // MyMemory takes at most 500 bytes per request

export class MusicError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason; // 'network' | 'empty' | 'quota'
  }
}

// The catalogue cover in a size that looks sharp on a phone.
export const bigArtwork = (url, size = 600) => String(url ?? '').replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);

export async function searchCatalog(term, { fetchImpl = globalThis.fetch?.bind(globalThis), country = 'DE', limit = 12 } = {}) {
  const q = String(term ?? '').trim();
  if (!q) return [];
  const proxy = PROXY();
  if (proxy) {
    try {
      const res = await fetchImpl(`${proxy}?${new URLSearchParams({ q })}`);
      const data = res.ok ? await res.json() : null;
      if (Array.isArray(data?.results)) return data.results;
    } catch {}
  }
  let data;
  try {
    const res = await fetchImpl(`${CATALOG}?${new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: String(limit), country })}`);
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    throw new MusicError('network');
  }
  return (data?.results ?? [])
    .filter((r) => r.trackName && r.artistName)
    .map((r) => ({
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName ?? '',
      artwork: bigArtwork(r.artworkUrl100),
      thumb: r.artworkUrl100 ?? '',
      link: r.trackViewUrl ?? '',
      preview: r.previewUrl ?? '',
      year: String(r.releaseDate ?? '').slice(0, 4),
    }));
}

// Translates English texts to German; texts that could not be translated come back as ''.
export async function translateTexts(texts, { fetchImpl = globalThis.fetch?.bind(globalThis), from = 'en', to = 'de' } = {}) {
  const out = texts.map(() => '');
  // Several texts per request, one per line – the service keeps the lines.
  const chunks = [];
  let current = [];
  let size = 0;
  texts.forEach((text, i) => {
    const len = encodeURIComponent(text).length + 3;
    if (current.length && size + len > CHUNK * 3) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(i);
    size += len;
  });
  if (current.length) chunks.push(current);
  let failed = null;
  for (const chunk of chunks) {
    const q = chunk.map((i) => texts[i].replace(/\n/g, ' ')).join('\n');
    try {
      const data = await translateOnce(q.slice(0, CHUNK * 3), { fetchImpl, from, to });
      if (data?.quotaFinished || data?.responseStatus === 429) throw new MusicError('quota');
      const lines = String(data?.responseData?.translatedText ?? '').split('\n');
      if (lines.length === chunk.length) chunk.forEach((i, k) => (out[i] = cleanTranslation(lines[k], texts[i])));
      else if (chunk.length === 1) out[chunk[0]] = cleanTranslation(lines.join(' '), texts[chunk[0]]);
    } catch (error) {
      failed = error instanceof MusicError ? error : new MusicError('network');
      break;
    }
  }
  if (failed && out.every((x) => !x)) throw failed;
  return out;
}

async function translateOnce(q, { fetchImpl, from, to }) {
  const proxy = from === 'en' && to === 'de' ? PROXY() : null;
  if (proxy) {
    try {
      const res = await fetchImpl(`${proxy}?${new URLSearchParams({ translate: q })}`);
      if (res.status === 429) return { quotaFinished: true };
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.text === 'string') return { responseData: { translatedText: data.text } };
      }
    } catch {}
  }
  const res = await fetchImpl(`${TRANSLATE}?${new URLSearchParams({ q, langpair: `${from}|${to}` })}`);
  return res.json();
}

function cleanTranslation(text, source) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  // The service answers with the English text (or a warning in capitals) when it has nothing.
  if (!t || t.toLowerCase() === source.toLowerCase() || /^(MYMEMORY|QUERY LENGTH|PLEASE SELECT)/.test(t)) return '';
  return t;
}

// Your own picture as the cover: square, 480 × 480, as a small JPEG.
export function pictureToCover(file, { size = 480, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new MusicError('empty'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new MusicError('empty'));
    };
    img.src = url;
  });
}
