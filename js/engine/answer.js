// Rule-based answer validation (no paid service involved).

const PUNCTUATION = /[.,!?;:"“”„«»()…–—，。！？、；：（）《》‘’]/g;
const GERMAN_ARTICLE = /^(?:(?:der|die|das|den|dem|des)(?:\/(?:der|die|das))*|ein|eine|einen|einem|einer)\s+/;

export function normalize(text, lang) {
  let s = String(text ?? '')
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/\.\.\./g, ' ')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/-$/, '');
  if (lang === 'en') {
    s = s.replace(/^to /, '');
  } else if (lang === 'de') {
    s = s.replace(GERMAN_ARTICLE, '');
  } else if (lang === 'zh') {
    s = s.replace(/\s+/g, ''); // Chinese is written without spaces
  }
  // 'de-target': German words that are being learned – the article is part of the word and must be typed.
  return s.trim();
}

// "(sich) entscheiden" → ["entscheiden", "sich entscheiden"], "(ver)ändern" → ["ändern", "verändern"]
function parenthesisVariants(text) {
  if (!text.includes('(')) return [text];
  const without = text.replace(/\s*\([^)]*\)\s*/g, (m) => (m.startsWith(' ') && m.endsWith(' ') ? ' ' : '')).trim();
  const withContent = text.replace(/[()]/g, '').trim();
  return [without, withContent];
}

// Splits on " / " outside parentheses: "Lust haben (auf / zu)" stays one meaning.
function splitMeanings(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && text.startsWith(' / ', i)) {
      parts.push(current);
      current = '';
      i += 2;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((s) => s.trim()).filter(Boolean);
}

// Direction 'de-en' = native prompt → answer in the language being learned.
// Entries of the Chinese course (vocab.course === 'zh-de') are answered in German (with article) or in Chinese.
export function targetLanguage(direction, vocab = null) {
  if (vocab?.course === 'zh-de') return direction === 'de-en' ? 'de-target' : 'zh';
  return direction === 'de-en' ? 'en' : 'de';
}

export function promptFor(vocab, direction) {
  return direction === 'de-en' ? vocab.german : vocab.english;
}

export function expectedFor(vocab, direction) {
  return direction === 'de-en' ? vocab.english : vocab.german;
}

// Vocabulary entries never change at runtime, so their accepted answers are worked out only once.
const acceptedCache = new WeakMap();
export function acceptedAnswers(vocab, direction) {
  let byDir = acceptedCache.get(vocab);
  if (!byDir) acceptedCache.set(vocab, (byDir = {}));
  return (byDir[direction] ??= computeAccepted(vocab, direction));
}

function computeAccepted(vocab, direction) {
  const lang = targetLanguage(direction, vocab);
  const raw = direction === 'de-en' ? [vocab.english, ...(vocab.acceptedEnglish ?? [])] : [vocab.german, ...(vocab.acceptedGerman ?? [])];
  const set = new Set();
  for (const entry of raw) {
    // Typing the full displayed solution ("verfügbar / Zeit haben") is correct as well.
    set.add(normalize(entry, lang));
    for (const meaning of splitMeanings(entry)) {
      for (const variant of parenthesisVariants(meaning)) {
        const n = normalize(variant, lang);
        if (n) set.add(n);
      }
    }
  }
  return [...set];
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// verdict: 'correct' | 'almost' (one typo, counts as correct) | 'synonym' (an accepted alternative that is a word
// of its own in the course – counts as correct and names the word that was asked for) | 'wrong'.
// lexicon (optional): all words of the course. With it a typo is only forgiven when the typed text is not a
// different real word ("lend" is never a typo of "borrow"), and a mix-up names the word that was typed.
// Alternatives are never guessed from shared meanings: they are listed per word in the vocabulary data.
export function grade(given, vocab, direction, lexicon = null) {
  const lang = targetLanguage(direction, vocab);
  const answer = normalize(given, lang);
  const expected = expectedFor(vocab, direction);
  if (!answer) return { verdict: 'wrong', expected, isCorrect: false };
  const others = lexicon ? [...lexicon].filter((o) => o.id !== vocab.id && (o.course ?? null) === (vocab.course ?? null)) : [];
  const accepted = acceptedAnswers(vocab, direction);
  if (accepted.includes(answer)) {
    const own = direction === 'de-en' ? normalize(vocab.english, lang) : null;
    const other = own && answer !== own ? others.find((o) => normalize(o.english, lang) === answer) : null;
    return other ? { verdict: 'synonym', expected, isCorrect: true, synonym: other.english } : { verdict: 'correct', expected, isCorrect: true };
  }
  const typedOther = others.find((o) => acceptedAnswers(o, direction).includes(answer));
  const near = !typedOther && accepted.find((solution) => solution.length >= 6 && levenshtein(answer, solution) === 1);
  if (near) return { verdict: 'almost', expected, isCorrect: true };
  return { verdict: 'wrong', expected, isCorrect: false, ...(typedOther ? { confusedWith: direction === 'de-en' ? typedOther.english : typedOther.german } : {}) };
}

// ---------- whole sentences ----------

const CONTRACTIONS = [
  [/\bwon't\b/g, 'will not'],
  [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\blet's\b/g, 'let us'],
  [/n't\b/g, ' not'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/'d\b/g, ' would'],
  [/\bi'm\b/g, 'i am'],
  [/\b(it|that|what|there|he|she|who|where|how)'s\b/g, '$1 is'],
];

// Sentences are compared word by word: case, punctuation and (in English) contractions never matter.
export function sentenceWords(text, lang) {
  let s = normalize(text, lang === 'de-target' ? 'de-target' : lang === 'en' ? 'en-sentence' : lang);
  if (lang === 'en') for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  return s.split(/\s+/).filter(Boolean);
}

const KEY_STOPWORDS = new Set(['to', 'be', 'a', 'an', 'the', 'your', 'my', 'someone', 'something', 'it', 'der', 'die', 'das', 'sich', 'ein', 'eine']);

function wordDistance(a, b) {
  return levenshtein(a, b);
}

// A typed translation of the example sentence (native → learned language).
// - 'correct': the example sentence or one of the listed natural alternatives
// - 'almost': one small slip – one word missing, extra or misspelled – while the key word is there
// - 'wrong': otherwise; the model sentence is shown (and "My answer was right" stays possible)
export function gradeSentence(given, vocab, alternatives = []) {
  const lang = targetLanguage('de-en', vocab);
  const expected = vocab.exampleEn;
  const answer = sentenceWords(given, lang);
  if (!answer.length) return { verdict: 'wrong', expected, isCorrect: false };
  const solutions = [expected, ...alternatives].map((x) => sentenceWords(x, lang));
  const joined = answer.join(' ');
  if (solutions.some((sol) => sol.join(' ') === joined)) return { verdict: 'correct', expected, isCorrect: true };
  // The key word ("to" and articles aside) has to be in the answer for any credit.
  const key = sentenceWords(vocab.english, lang).filter((k) => !KEY_STOPWORDS.has(k));
  const stem = (k) => (k.endsWith('e') ? k.slice(0, -1) : k);
  const has = (words) => key.every((k) => words.some((w) => w === k || w.startsWith(stem(k)) || (k.length >= 5 && levenshtein(w, k) <= 1)));
  const close = solutions.some((sol) => {
    const a = answer;
    const b = sol;
    // word-level edit distance, where a misspelled word (one letter) costs nothing extra
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const same = a[i - 1] === b[j - 1] ? 0 : wordDistance(a[i - 1], b[j - 1]) === 1 && b[j - 1].length >= 4 ? 0.5 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + same);
      }
    }
    return d[a.length][b.length] <= 1;
  });
  if (close && has(answer)) return { verdict: 'almost', expected, isCorrect: true };
  return { verdict: 'wrong', expected, isCorrect: false };
}
