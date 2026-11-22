// Learning English with your own songs. You add a song (title, artist, cover from the catalogue or your own picture)
// and paste its lyrics; the app picks the important words and lines of the song:
// - words: content words of the song (no "the", "oh", "yeah" …), the most frequent first. Words that are in the
//   app's vocabulary bring their checked German meaning and can be learned with the normal schedule; the others
//   get a translation (js/music-service.js) that you can correct.
// - lines: the lines that carry the most song words – as flashcards (English → German) and as a gap-fill quiz.
// The lyrics stay with you: they are saved in your learning state and never shipped with the app.

import { dayKey } from './dates.js';
import { directionsFor, topicLessonsOf } from './lesson.js';
import { shuffle, uuid } from './random.js';
import { isLearned } from './srs.js';
import { clone } from './state.js';
import { usedVocabIds } from './selection.js';

export const SONG_WORDS_MIN = 25;
export const SONG_WORDS_MAX = 40;
export const SONG_LINES_MAX = 12;
export const LYRICS_MAX = 12000;
export const SONG_TOPIC_PREFIX = 'song:';

// Words that carry no meaning of their own in a song: articles, pronouns, auxiliaries, fillers and sounds.
const STOP = new Set(
  `a an the and or but so if as at by for from in into of off on onto out over to up with without about than then
  i me my mine myself you your yours yourself he him his she her hers it its we us our they them their this that these those
  what who whom which when where why how there here
  am is are was were be been being do does did done have has had having will would shall should can could may might must
  not no yes yeah yea ya yo oh ooh ohh ah aah uh uhh huh mm mmm hmm hey woah whoa ayy ay la na da eh ha
  all just like get got gonna wanna gotta tryna let lets also too very really
  one ever every some any each other another more most much many own same such only
  'cause cause cos till til em`.split(/\s+/),
);

// The irregular forms that turn up in songs, to their dictionary form.
const IRREGULAR = {
  was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be',
  went: 'go', gone: 'go', goes: 'go', made: 'make', said: 'say', says: 'say', felt: 'feel', left: 'leave', knew: 'know', known: 'know',
  thought: 'think', took: 'take', taken: 'take', came: 'come', saw: 'see', seen: 'see', gave: 'give', given: 'give',
  told: 'tell', found: 'find', kept: 'keep', lost: 'lose', held: 'hold', ran: 'run', fell: 'fall', fallen: 'fall',
  brought: 'bring', bought: 'buy', did: 'do', done: 'do', had: 'have', has: 'have', got: 'get', gotten: 'get',
  began: 'begin', begun: 'begin', broke: 'break', broken: 'break', chose: 'choose', chosen: 'choose', drove: 'drive',
  driven: 'drive', ate: 'eat', eaten: 'eat', flew: 'fly', flown: 'fly', forgot: 'forget', forgotten: 'forget',
  forgave: 'forgive', forgiven: 'forgive', grew: 'grow', grown: 'grow', hid: 'hide', hidden: 'hide', hurt: 'hurt',
  led: 'lead', meant: 'mean', met: 'meet', paid: 'pay', rode: 'ride', rang: 'ring', rose: 'rise', risen: 'rise',
  sang: 'sing', sung: 'sing', sank: 'sink', sat: 'sit', slept: 'sleep', spoke: 'speak', spoken: 'speak', spent: 'spend',
  stood: 'stand', stole: 'steal', stolen: 'steal', swam: 'swim', taught: 'teach', tore: 'tear', torn: 'tear',
  threw: 'throw', thrown: 'throw', understood: 'understand', woke: 'wake', woken: 'wake', wore: 'wear', worn: 'wear',
  won: 'win', wrote: 'write', written: 'write', built: 'build', burnt: 'burn', caught: 'catch', dealt: 'deal',
  dreamt: 'dream', drew: 'draw', drawn: 'draw', drank: 'drink', drunk: 'drink', fought: 'fight', heard: 'hear',
  lay: 'lie', lain: 'lie', lit: 'light', sent: 'send', shook: 'shake', shot: 'shoot', sold: 'sell', sought: 'seek',
  struck: 'strike', swore: 'swear', sworn: 'swear', bled: 'bleed', fed: 'feed',
  children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth', lives: 'life', knives: 'knife',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
};

// Short forms of the spoken language, written out.
const SPOKEN = {
  gonna: ['going', 'to'], wanna: ['want', 'to'], gotta: ['got', 'to'], tryna: ['trying', 'to'], lemme: ['let', 'me'],
  gimme: ['give', 'me'], cuz: ['because'], cause: ['because'], cos: ['because'], ya: ['you'], em: ['them'], tho: ['though'],
  til: ['until'], till: ['until'], ain: ['not'], y: ['you'], bout: ['about'], round: ['around'], fore: ['before'],
};

const OWN = '(?:my|your|his|her|its|our|their)';

export function normalizeLyrics(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .slice(0, LYRICS_MAX);
}

// The lines of the lyrics without section labels like [Chorus] or (x2) and without empty lines.
export function lyricLines(text) {
  return normalizeLyrics(text)
    .split('\n')
    .map((l) => l.replace(/\[[^\]]*\]/g, '').replace(/\((?:x\s*\d+|\d+\s*x)\)/gi, '').replace(/\s+/g, ' ').trim())
    .filter((l) => /[a-z]/i.test(l));
}

// The words of a line, lower case, short forms written out ("don't" → do not, "nothin'" → nothing).
export function lineTokens(line) {
  const out = [];
  for (const raw of line.toLowerCase().match(/[a-z]+(?:'[a-z]+)*'?/g) ?? []) {
    let w = raw;
    if (w.endsWith("in'")) w = `${w.slice(0, -1)}g`;
    w = w.replace(/'$/, '');
    const parts = w.split("'");
    let base = parts[0];
    const tail = parts.slice(1);
    if (tail[0] === 't' && base.endsWith('n')) {
      base = base === 'won' ? 'will' : base === 'can' ? 'can' : base === 'ain' ? 'not' : base.slice(0, -1);
      out.push(base, 'not');
      continue;
    }
    if (SPOKEN[base]) out.push(...SPOKEN[base]);
    else out.push(base);
    for (const t of tail) {
      const add = { ll: 'will', re: 'are', ve: 'have', d: 'would', m: 'am' }[t];
      if (add) out.push(add);
    }
  }
  return out.filter(Boolean);
}

// Possible dictionary forms of a word: "loved" → love, "stopping" → stop, "cities" → city …
export function lemmaCandidates(w) {
  const c = [w];
  if (IRREGULAR[w]) c.push(IRREGULAR[w]);
  if (w.length > 4 && w.endsWith('ies')) c.push(`${w.slice(0, -3)}y`);
  if (w.length > 3 && w.endsWith('es')) c.push(w.slice(0, -2));
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) c.push(w.slice(0, -1));
  if (w.length > 4 && w.endsWith('ied')) c.push(`${w.slice(0, -3)}y`);
  if (w.length > 3 && w.endsWith('ed')) {
    const stem = w.slice(0, -2);
    c.push(stem, `${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) c.push(stem.slice(0, -1));
    c.push(w.slice(0, -1));
  }
  if (w.length > 4 && w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    c.push(stem, `${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) c.push(stem.slice(0, -1));
    if (stem.endsWith('y')) c.push(`${stem.slice(0, -1)}ie`);
  }
  if (w.length > 4 && w.endsWith('ly')) c.push(w.slice(0, -2));
  return [...new Set(c)];
}

// The forms a verb can take in a song ("show" → show|shows|showed|showing|shown).
function verbForms(base) {
  const forms = new Set([base, `${base}s`, `${base}es`, `${base}ed`, `${base}d`, `${base}ing`, `${base.replace(/e$/, '')}ing`]);
  if (base.endsWith('y')) forms.add(`${base.slice(0, -1)}ies`).add(`${base.slice(0, -1)}ied`);
  for (const [form, lemma] of Object.entries(IRREGULAR)) if (lemma === base) forms.add(form);
  return [...forms];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lookup of the vocabulary by dictionary form: single words and phrases ("to show up", "to change your mind").
export function vocabIndex(vocabulary) {
  const words = new Map();
  const phrases = [];
  for (const v of vocabulary) {
    const forms = [v.english]
      .flatMap((e) => String(e).split('/'))
      .map((e) =>
        e
          .toLowerCase()
          .replace(/\([^)]*\)/g, '')
          .replace(/[.?!…,]/g, '')
          .replace(/^to\s+/, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);
    for (const f of forms) {
      if (!/^[a-z' -]+$/.test(f)) continue;
      if (!f.includes(' ')) {
        if (!words.has(f)) words.set(f, v);
        continue;
      }
      const parts = lineTokens(f);
      if (parts.length < 2 || parts.length > 5 || parts.every((p) => STOP.has(p))) continue;
      const [first, ...rest] = parts;
      const head = `(?:${verbForms(first).map(escapeRe).join('|')})`;
      const body = rest.map((p) => (p === 'your' || p === 'one' || p === 'someone' ? OWN : escapeRe(p))).join(' ');
      phrases.push({ vocab: v, re: new RegExp(`(?:^| )${head} ${body}(?= |$)`) });
    }
  }
  return { words, phrases };
}

const WORD_BLOCK = new Set(['hong', 'kong']);

// The analysis of a song: its important words and lines.
// Returns { words: [{ key, en, vocabId, count }], lines: [{ en, keys }], total } – total: all different words found.
export function analyzeSong(lyrics, vocabulary, { index = vocabIndex(vocabulary), max = SONG_WORDS_MAX } = {}) {
  const lines = lyricLines(lyrics);
  const found = new Map(); // key -> { key, en, vocabId, count, first, phrase }
  const proper = new Map(); // surface word -> capitalised every time (names, places)
  const lineKeys = [];
  lines.forEach((line, li) => {
    const keys = new Set();
    const tokens = lineTokens(line);
    const joined = tokens.join(' ');
    const heads = new Set(); // the verb of a phrase found in this line is not counted again on its own
    for (const { vocab, re } of index.phrases) {
      if (!re.test(joined)) continue;
      heads.add(lineTokens(vocab.english.toLowerCase().replace(/^to\s+/, ''))[0]);
      const item = found.get(vocab.id) ?? { key: vocab.id, en: vocab.english, vocabId: vocab.id, count: 0, first: li, phrase: true };
      item.count += 1;
      found.set(vocab.id, item);
      keys.add(vocab.id);
    }
    const surface = line.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? [];
    surface.forEach((s, i) => {
      const capital = /^[A-Z]/.test(s) && i > 0 && s !== 'I';
      const low = s.toLowerCase();
      proper.set(low, (proper.get(low) ?? true) && capital);
    });
    for (const w of tokens) {
      if (STOP.has(w) || w.length < 3 || WORD_BLOCK.has(w)) continue;
      const lemmas = lemmaCandidates(w);
      if (lemmas.some((l) => heads.has(l))) continue;
      const hit = lemmas.map((l) => index.words.get(l)).find(Boolean);
      if (hit && STOP.has(lemmas.find((l) => index.words.get(l) === hit))) continue;
      if (hit && lemmas.some((l) => STOP.has(l))) continue;
      // Without a dictionary entry: plural nouns in the singular ("lights" → light), other forms as they are.
      const plain = w.length > 4 && /[^s]s$/.test(w) && !/(ous|ss|is|us)$/.test(w) ? w.slice(0, -1) : w;
      const key = hit ? hit.id : `w:${plain}`;
      const item = found.get(key) ?? { key, en: hit ? hit.english : plain, vocabId: hit?.id ?? null, count: 0, first: li, phrase: false, surface: w };
      item.count += 1;
      found.set(key, item);
      keys.add(key);
    }
    lineKeys.push(keys);
  });
  const all = [...found.values()].filter((x) => x.vocabId || !proper.get(x.surface));
  const vocabById = new Map(vocabulary.map((v) => [v.id, v]));
  const rank = (x) => (x.vocabId ? vocabById.get(x.vocabId)?.frequencyRank ?? 9999 : 9999);
  const words = all
    .sort((a, b) => Number(b.phrase) - Number(a.phrase) || b.count - a.count || Number(Boolean(b.vocabId)) - Number(Boolean(a.vocabId)) || rank(a) - rank(b) || a.first - b.first)
    .slice(0, max)
    .map(({ key, en, vocabId, count }) => ({ key, en, vocabId, count }));
  const chosen = new Set(words.map((w) => w.key));
  // Important lines: the ones with most song words, each line only once, in the order of the song.
  const seen = new Set();
  const scored = [];
  lines.forEach((line, li) => {
    const norm = lineTokens(line).join(' ');
    const n = norm.split(' ').length;
    if (seen.has(norm) || n < 3 || n > 18) return;
    seen.add(norm);
    const keys = [...lineKeys[li]].filter((k) => chosen.has(k));
    if (!keys.length) return;
    scored.push({ li, en: line, keys, score: keys.length + keys.filter((k) => found.get(k)?.phrase).length });
  });
  const lineList = scored
    .sort((a, b) => b.score - a.score || a.li - b.li)
    .slice(0, SONG_LINES_MAX)
    .sort((a, b) => a.li - b.li)
    .map(({ en, keys }) => ({ en, keys }));
  return { words, lines: lineList, total: all.length };
}

/* ---------------- songs in the learning state ---------------- */

export const songsOf = (state) => (state.songs ?? []).filter((s) => !s.deleted);
export const songById = (state, id) => songsOf(state).find((s) => s.id === id) ?? null;

const clean = (v, n) => String(v ?? '').trim().slice(0, n);

// meta: { title, artist, album, artwork, link, preview }; analysis: from analyzeSong with German meanings filled in.
export function addSong(state, { meta, lyrics, words, lines }, now = new Date()) {
  const s = clone(state);
  const id = uuid();
  const at = now.toISOString();
  s.songs = [
    ...(s.songs ?? []),
    {
      id,
      title: clean(meta.title, 120),
      artist: clean(meta.artist, 120),
      album: clean(meta.album, 120),
      artwork: String(meta.artwork ?? '').slice(0, 400000),
      link: clean(meta.link, 400),
      preview: clean(meta.preview, 400),
      lyrics: normalizeLyrics(lyrics),
      words: words.map((w) => ({ key: w.key, en: clean(w.en, 80), de: clean(w.de, 120), vocabId: w.vocabId ?? null, count: w.count ?? 1 })),
      lines: lines.map((l) => ({ en: clean(l.en, 200), de: clean(l.de, 300), keys: l.keys ?? [] })),
      known: {},
      quizBest: 0,
      addedAt: at,
      addedDay: dayKey(now),
      updatedAt: at,
    },
  ];
  return { state: s, id };
}

function patchSong(state, id, change, now) {
  const song = songById(state, id);
  if (!song) return state;
  const s = clone(state);
  const target = s.songs.find((x) => x.id === id);
  change(target);
  target.updatedAt = now.toISOString();
  return s;
}

export function updateSongMeta(state, id, meta, now = new Date()) {
  return patchSong(state, id, (song) => {
    for (const key of ['title', 'artist', 'album', 'link', 'preview']) if (key in meta) song[key] = clean(meta[key], key === 'link' || key === 'preview' ? 400 : 120);
    if ('artwork' in meta) song.artwork = String(meta.artwork ?? '').slice(0, 400000);
  }, now);
}

// Correct the German meaning of a song word or line.
export function setSongMeaning(state, id, { word = null, line = null, de }, now = new Date()) {
  return patchSong(state, id, (song) => {
    if (word !== null) {
      const w = song.words.find((x) => x.key === word);
      if (w) w.de = clean(de, 120);
    }
    if (line !== null && song.lines[line]) song.lines[line].de = clean(de, 300);
  }, now);
}

export function removeSongWord(state, id, key, now = new Date()) {
  return patchSong(state, id, (song) => {
    song.words = song.words.filter((w) => w.key !== key);
    for (const l of song.lines) l.keys = l.keys.filter((k) => k !== key);
  }, now);
}

// After a round of song cards: which cards you knew ("w:<key>" for words, "l:<index>" for lines).
export function recordSongCards(state, id, results, now = new Date()) {
  return patchSong(state, id, (song) => {
    song.known = { ...(song.known ?? {}) };
    for (const [card, ok] of Object.entries(results)) song.known[card] = ok;
    song.lastPracticedDay = dayKey(now);
  }, now);
}

// The round you are in (words, lines or the gap-fill), saved after every card so you can go on later – also on
// another device. null: the round is done or started again.
export const SONG_RUN_MODES = ['words', 'lines', 'quiz'];
export function saveSongRun(state, id, mode, run, now = new Date()) {
  if (!SONG_RUN_MODES.includes(mode)) return state;
  return patchSong(state, id, (song) => {
    const runs = { ...(song.runs ?? {}) };
    if (run) runs[mode] = { ...run, at: now.toISOString() };
    else delete runs[mode];
    song.runs = runs;
  }, now);
}

// The unfinished round of a song: of one mode, or the one you used last.
export function savedSongRun(song, mode = null) {
  const runs = song?.runs ?? {};
  const open = (m) => {
    const r = runs[m];
    if (!r) return null;
    if (m === 'quiz') return Array.isArray(r.quiz) && r.index < r.quiz.length ? { mode: m, ...r } : null;
    return Array.isArray(r.queue) && r.queue.length ? { mode: m, ...r } : null;
  };
  if (mode) return open(mode);
  return SONG_RUN_MODES.map(open).filter(Boolean).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0] ?? null;
}

export function recordSongQuiz(state, id, correct, total, now = new Date()) {
  return patchSong(state, id, (song) => {
    song.quizBest = Math.max(song.quizBest ?? 0, total ? Math.round((correct / total) * 100) : 0);
    song.lastPracticedDay = dayKey(now);
  }, now);
}

// The songs prepared in data/songs.js: added once (a song you deleted stays deleted). A prepared song that had no
// words yet gets them as soon as the app brings them – unless you have made its cards yourself in the meantime.
// A prepared word: { key, vocabId } takes English and German from the vocabulary, { key, en, de } stands for itself.
function presetWords(p, vocabulary) {
  const byId = new Map((vocabulary ?? []).map((v) => [v.id, v]));
  return p.words
    .map((w) => {
      const v = w.vocabId ? byId.get(w.vocabId) : null;
      if (w.vocabId && !v) return null;
      return { key: w.key, en: v ? v.english : w.en, de: v ? v.german : w.de, vocabId: w.vocabId ?? null, count: w.count ?? 1 };
    })
    .filter(Boolean);
}

export function ensurePresetSongs(state, presets, now = new Date(), vocabulary = []) {
  const all = state.songs ?? [];
  const missing = presets.filter((p) => !all.some((x) => x.id === p.id));
  const filled = presets.filter((p) => p.words.length && all.some((x) => x.id === p.id && !x.deleted && !x.words.length && !x.lyrics));
  if (!missing.length && !filled.length) return state;
  const s = clone(state);
  const at = now.toISOString();
  s.songs = s.songs ?? [];
  for (const p of missing) {
    s.songs.push({
      id: p.id,
      preset: true,
      title: p.title,
      artist: p.artist,
      album: p.album ?? '',
      artwork: p.artwork ?? '',
      link: p.link ?? '',
      preview: p.preview ?? '',
      lyrics: '',
      ...(p.themed ? { themed: true } : {}),
      words: presetWords(p, vocabulary),
      lines: p.lines.map((l) => ({ ...l, keys: l.keys ?? [] })),
      known: {},
      quizBest: 0,
      addedAt: at,
      addedDay: dayKey(now),
      updatedAt: at,
    });
  }
  for (const p of filled) {
    const song = s.songs.find((x) => x.id === p.id);
    song.words = presetWords(p, vocabulary);
    song.lines = p.lines.map((l) => ({ ...l, keys: l.keys ?? [] }));
    if (p.themed) song.themed = true;
    song.updatedAt = at;
  }
  return s;
}

// The cards of a song made from lyrics you pasted later (a prepared song without words, or to start again).
export function setSongContent(state, id, { lyrics, words, lines }, now = new Date()) {
  return patchSong(state, id, (song) => {
    song.lyrics = normalizeLyrics(lyrics);
    song.words = words.map((w) => ({ key: w.key, en: clean(w.en, 80), de: clean(w.de, 120), vocabId: w.vocabId ?? null, count: w.count ?? 1 }));
    song.lines = lines.map((l) => ({ en: clean(l.en, 200), de: clean(l.de, 300), keys: l.keys ?? [] }));
    song.known = {};
    song.quizBest = 0;
    delete song.themed;
  }, now);
}

// Deleting leaves a marker, so that a synced device does not bring the song back.
export function removeSong(state, id, now = new Date()) {
  if (!songById(state, id)) return state;
  const s = clone(state);
  s.songs = s.songs.map((x) => (x.id === id ? { id, deleted: true, updatedAt: now.toISOString() } : x));
  return s;
}

export function songStats(song) {
  const known = song.known ?? {};
  const words = song.words.filter((w) => known[`w:${w.key}`]).length;
  const lines = song.lines.filter((_, i) => known[`l:${i}`]).length;
  return { words, lines, wordTotal: song.words.length, lineTotal: song.lines.length };
}

// Two devices: per song the newer change wins (a deletion is a change too).
export function mergeSongs(a = [], b = []) {
  const map = new Map();
  for (const song of [...a, ...b]) {
    const have = map.get(song.id);
    if (!have || (song.updatedAt ?? '') > (have.updatedAt ?? '')) map.set(song.id, song);
  }
  return [...map.values()].sort((x, y) => (x.addedAt ?? x.updatedAt ?? '').localeCompare(y.addedAt ?? y.updatedAt ?? ''));
}

/* ---------------- learning the song's vocabulary with the normal schedule ---------------- */

export const songTopic = (id) => `${SONG_TOPIC_PREFIX}${id}`;
export const openSongLesson = (state, id) => topicLessonsOf(state).find((l) => l.topic === songTopic(id) && !l.completedAt) ?? null;

// The song's words that are in the vocabulary and not learned or planned yet.
export function songLessonCandidates(state, song) {
  const used = usedVocabIds(state);
  return song.words.filter((w) => w.vocabId && !used.has(w.vocabId) && !isLearned(state.progress[w.vocabId])).map((w) => w.vocabId);
}

export function songLearnedCount(state, song) {
  return song.words.filter((w) => w.vocabId && isLearned(state.progress[w.vocabId])).length;
}

export function startSongLesson(state, songId, now = new Date()) {
  const song = songById(state, songId);
  if (!song || openSongLesson(state, songId)) return state;
  const ids = songLessonCandidates(state, song).slice(0, SONG_WORDS_MAX);
  if (!ids.length) return state;
  const s = clone(state);
  const id = uuid();
  const dirs = directionsFor(ids.length, id);
  s.topicLessons = [
    ...topicLessonsOf(s),
    {
      id,
      topic: songTopic(songId),
      number: topicLessonsOf(s).filter((l) => l.topic === songTopic(songId)).length + 1,
      createdAt: now.toISOString(),
      createdDay: dayKey(now),
      completedAt: null,
      completedDay: null,
      items: ids.map((vocabId, i) => ({ vocabId, direction: dirs[i], status: 'pending', againCount: 0 })),
      queue: shuffle(ids, `${id}:order`),
      replacements: [],
      notices: [],
      version: 0,
    },
  ];
  return s;
}

/* ---------------- gap-fill quiz with the song's lines ---------------- */

// One question per important line: the line with one song word left out, three choices.
export function songQuiz(song, seed = 'quiz') {
  const single = song.words.filter((w) => !w.en.includes(' '));
  const questions = [];
  song.lines.forEach((line, i) => {
    const candidates = line.keys
      .map((k) => song.words.find((w) => w.key === k))
      .filter((w) => w && !w.en.includes(' '))
      .map((w) => ({ w, form: findForm(line.en, w) }))
      .filter((x) => x.form);
    if (!candidates.length) return;
    const pick = candidates[Math.floor(seededUnit(`${seed}:${i}`) * candidates.length)];
    // Lower case, so that a capital letter at the start of the line does not give the answer away.
    const answer = pick.form === 'I' ? pick.form : pick.form.toLowerCase();
    const others = shuffle(
      [...new Set(single.filter((w) => w.key !== pick.w.key).map((w) => w.en.replace(/^to /, '')))].filter((o) => o.toLowerCase() !== answer.toLowerCase()),
      `${seed}:${i}:o`,
    ).slice(0, 2);
    if (others.length < 2) return;
    const options = shuffle([answer, ...others], `${seed}:${i}:s`);
    questions.push({ line: i, answer, options, gap: line.en.replace(new RegExp(`\\b${escapeRe(answer)}\\b`, 'i'), '_____') });
  });
  return questions;
}

// The form of a song word as it is written in the line ("loved" for "love").
function findForm(line, word) {
  const base = word.en.toLowerCase().replace(/^to /, '');
  for (const m of line.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)*/g)) {
    const surface = m[0];
    if (lemmaCandidates(surface.toLowerCase()).includes(base) || surface.toLowerCase() === base) return surface;
  }
  return null;
}

function seededUnit(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

export function songTopicId(topic) {
  return typeof topic === 'string' && topic.startsWith(SONG_TOPIC_PREFIX) ? topic.slice(SONG_TOPIC_PREFIX.length) : null;
}
