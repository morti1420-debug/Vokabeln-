import { COURSES, courseFor } from './courses.js';
import { createAudioPlayer, createSpeaker, voiceQuality } from './audio.js';
import { promptFor, expectedFor, grade } from './engine/answer.js';
import { addDays, dayKey, formatDay, weekStart } from './engine/dates.js';
import {
  LESSON_SIZES,
  canMarkKnown,
  currentLesson,
  lastCompletedLesson,
  lessonCompletedToday,
  lessonProgress,
  lessonSize,
  lessonToken,
  rateLessonCard,
  startLesson,
  openTopicLesson,
  startTopicLesson,
  topicLessonsOf,
  upcomingLessons,
} from './engine/lesson.js';
import { MEMO_MAX, activityByDay, hardWordIds, memoOf, recentLessons, isStarred, markKnownAhead, RECENT_DAY_RANGES, daysOfScope, poolFor, reviewForecast, setMemo, todayMistakeIds, toggleStar, unmarkKnownAhead } from './engine/library.js';
import { confusablesOf } from '../data/confusables.js';
import { applyPlacement, placementIds, placementQuestions, placementResult, placementSkipCount, undoPlacement } from './engine/placement.js';
import { matchPick, matchTiles, matchedSoFar, newMatchGame, newQuiz, dictationAnswer, quizAnswer, quizCurrent, quizNext, quizScore, quizSkip } from './engine/games.js';
import { newPuzzle, puzzleEligible, puzzleNext, puzzlePlace, puzzleReveal, puzzleRetry, puzzleScore, puzzleUndo } from './engine/puzzle.js';
import { BLITZ_SECONDS, blitzAnswer, blitzQuestion, blitzRemainingMs, blitzTick, memoryClose, memoryFlip, memoryStars, newBlitz, newMemory, newScramble, scrambleEligible, scrambleHint, scrambleNext, scramblePlace, scrambleScore, scrambleSkip, scrambleTarget, scrambleUndo } from './engine/fungames.js';
import { REVIEW_ROUND, ensureReviewSession, extendReview, rateReviewCard, reviewDirection, reviewToken, reviewsLeftToday, waitingVocabIds } from './engine/review.js';
import { INTENSIVE_FROM, backlog, dailyLoad } from './engine/load.js';
import {
  sentenceReviewIds,
  learnedSentenceIds,
  migrateSentences,
  openSentenceSession,
  rateSentence,
  sentenceSessionFor,
  sentenceSessionProgress,
  sentenceToken,
  SENTENCE_LESSON_MIN,
  lessonSentenceIds,
  topUpLessonSentences,
  startLessonSentences,
  startSentencePractice,
  startSentenceReview,
  startTopicSentences,
  topicSentenceQueue,
} from './engine/sentences.js';
import { HARD_ROUND_MAX, PRACTICE_MAX, practiceProgress, practiceToken, practiceWordIds, ratePractice, startHardRound, startWordPractice } from './engine/practice.js';
import { INTERVALS, MASTERY, isHardWord, isLearned } from './engine/srs.js';
import { DIFFICULTIES, LESSON_ORDERS, difficulty, lessonOrder, topicCandidates } from './engine/selection.js';
import { APP_VERSION } from './version.js';
import { compactHistory, createInitialState } from './engine/state.js';
import { computeStats, daySummary, lastSevenDays, learningStreak, mistakeOverview } from './engine/stats.js';
import {
  answerQuestion,
  awaitingNext,
  dailyTestFor,
  nextQuestion,
  openTest,
  overrideLastAnswer,
  startDailyTest,
  startWeeklyTest,
  testSummary,
  testToken,
  weeklyStatus,
} from './engine/tests.js';
import { LANGUAGES, createTranslator } from './i18n.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { TOPICS, TOPIC_OF, isTopic, topicsFor } from '../data/topics.js';
import { GRAMMAR, grammarById, grammarSpoken } from '../data/grammar.js';
import { gradeGrammar, recordGrammar } from './engine/grammar.js';
import { SITUATIONS, situationById, situationsOfTopic } from '../data/situations.js';
import { recordDialog, recordStory } from './engine/dialogs.js';
import { STORIES, storyById } from '../data/stories.js';
import { shuffle } from './engine/random.js';
import { exportData, hasLearningData, loadState, parseImport, pruneBackup, saveState, storageAvailable } from './store.js';
import { ELEVEN_VOICES, createElevenLabs, createSharedTts } from './tts.js';
import { createSync } from './sync.js';
import { PRESET_SONGS, songLineAudioId, songWordAudioId } from '../data/songs.js';
import { addSong, analyzeSong, ensurePresetSongs, saveSongRun, savedSongRun, setSongContent, lemmaCandidates, lineTokens, lyricLines, openSongLesson, recordSongCards, recordSongQuiz, removeSong, removeSongWord, setSongMeaning, songById, songLearnedCount, songLessonCandidates, songQuiz, songStats, songsOf, startSongLesson, updateSongMeta } from './engine/music.js';
import { pictureToCover, searchCatalog, translateTexts } from './music-service.js';
import { REMINDER_HOURS, createReminder } from './reminder.js';

// Device preferences first: they decide which course (and therefore which vocabulary and saved progress) is used.
let prefs = loadPrefs();
// v1.26.2: the natural recorded voice is used everywhere. A device voice picked earlier (it sounds robotic) is switched
// back once to the automatic choice; it can still be picked again in the settings.
// v1.30.3: the recorded natural voice is the voice of the app – a device voice chosen before is reset once more.
if (!prefs.naturalVoiceOnly) {
  prefs = { ...prefs, ...(prefs.voiceChoice === 'manual' && prefs.voiceSource === 'device' ? { voiceChoice: 'auto', voiceSource: 'shared' } : {}), naturalVoiceOnly: true, naturalVoiceReset: true };
  savePrefs(prefs);
}
if (!prefs.naturalVoiceReset) {
  prefs = prefs.voiceChoice === 'manual' && prefs.voiceSource === 'device' ? { ...prefs, voiceChoice: 'auto', voiceSource: 'shared', naturalVoiceReset: true } : { ...prefs, naturalVoiceReset: true };
  savePrefs(prefs);
}
{
  // A link like …/english-vocabulary/?course=zh-de opens the German course for Chinese speakers (with the Chinese interface).
  const wanted = new URLSearchParams(location.search).get('course');
  if (wanted && COURSES[wanted] && wanted !== prefs.course) {
    prefs = { ...prefs, course: wanted, lang: COURSES[wanted].defaultUiLang };
    savePrefs(prefs);
  }
  if (wanted) history.replaceState(null, '', location.pathname + location.hash);
}
const course = courseFor(prefs.course);
const VOCABULARY = course.vocabulary;
// Category names follow the interface language (e.g. 'Alltagsenglisch'); a course without translations keeps its own labels.
const CATEGORIES = Object.fromEntries(
  Object.entries(course.categories).map(([key, c]) => [
    key,
    {
      ...c,
      get label() {
        const id = `cat.${course.id}.${key}`;
        const text = t(id);
        return text === id ? c.label : text;
      },
    },
  ]),
);
const TL = course.target; // language that is being learned (en | de)
const NL = course.native; // language of the translations (de | zh)
const LOCALES = { de: 'de-DE', en: 'en-GB', zh: 'zh-CN' };
const fmtDay = (key) => formatDay(key, LOCALES[prefs.lang] ?? 'de-DE');
const vocabById = new Map(VOCABULARY.map((v) => [v.id, v]));
const knownVocabIds = new Set(vocabById.keys());

// The clock can be pinned for automated tests (window.__EV_NOW__ = ISO string).
const now = () => (globalThis.__EV_NOW__ ? new Date(globalThis.__EV_NOW__) : new Date());
const today = () => dayKey(now());

const root = document.getElementById('app');
const live = document.getElementById('live');
const speaker = createSpeaker();
speaker.setLanguage(TL);
const eleven = createElevenLabs();
const sharedTts = createSharedTts();
const player = createAudioPlayer({ speaker, eleven, shared: sharedTts });
const SHARED_INFO_KEY = 'english-vocabulary:shared';
const storageOk = storageAvailable();
const loaded = storageOk ? loadState(undefined, now(), course) : { state: createInitialState(now(), course), error: null };

// v1.2: slower default speech for beginners.
function migrateSettings(s) {
  if (s.settings.v12) return s;
  const rate = Number(s.settings.rate);
  return {
    ...s,
    settings: { ...s.settings, rate: rate >= 0.95 || rate === 0.75 ? 0.8 : rate || 0.8, v12: true },
  };
}

let state = compactHistory(migrateSentences(migrateSettings(loaded.state)), today());
if (storageOk) pruneBackup(localStorage, course.storageKey, now());
if (storageOk && (state !== loaded.state || loaded.migrated)) {
  try {
    saveState(state, localStorage, course.storageKey);
  } catch {}
}
let t = createTranslator(prefs.lang);
const ui = {
  // What is typed in the account form survives the page being drawn again (e.g. after switching to another app).
  accDraft: { email: '', password: '' },
  flipped: false,
  lockUntil: 0,
  saveError: null,
  pending: null,
  loadError: loaded.error,
  toast: null,
  toastTimer: null,
  online: navigator.onLine,
  lastRoute: null,
  revealed: false, // the answer side has been seen at least once – rating is possible from both sides
  search: '',
  wordFilter: 'all',
  lessonsTab: 'mine',
  sentencesTab: 'lessons',
  topicMode: 'words',
  upcomingCount: 3,
  trainScope: 'recent',
  game: null, // training game in memory: match / listen / speak
  flash: null, // match game: ids that were just matched or missed
  listening: false,
  shared: readSharedInfo(), // what the server offers: { ok, voices } – the last known value until the probe answers
  voiceError: null, // last ElevenLabs failure { reason, detail } – shown until it works again
  newRecord: false, // blitz: the last game beat the best score
  blitzTimer: null,
  memoryTimer: null,
  advancedOpen: false, // settings: the "Advanced" section is open
  sharedTest: null, // connection test of the shared voice in the settings { state, reason, detail }
  elevenTest: null, // connection test in the settings { state, reason, detail }
};

/* ---------------- helpers ---------------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const pad = (n) => String(n).padStart(2, '0');

function announce(text) {
  live.textContent = '';
  requestAnimationFrame(() => (live.textContent = text));
}

// Screens with a card or question on them: no reload and no change from another device while one is open.
const STUDY_ROUTES = ['learn', 'song-cards', 'song-learn', 'review', 'sentence', 'practice', 'test', 'match', 'listen', 'dictation', 'blitz', 'scramble', 'memory', 'puzzle'];

/* ---------------- account & sync ---------------- */

const sync = createSync();
const reminder = createReminder();
// Back from "Mit Google anmelden": the session is in the address (#access_token=… or #error=…). It is taken out of
// the address at once (so it is never bookmarked or shared) and the account page opens.
const authReturn = /^#(access_token|error)=/.test(location.hash) ? location.hash : /[?&]error=/.test(location.search) ? `#${location.search.slice(1)}` : null;
if (authReturn) history.replaceState(null, '', `${location.pathname}#/settings`);
let syncTimer = null;
let syncRunning = null;

// Uploads a little after the last change (several answers in a row become one upload).
function scheduleSync(delay = 3000) {
  if (!sync.enabled || !sync.account()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(), delay);
}

async function runSync({ manual = false } = {}) {
  if (!sync.enabled || !sync.account() || !storageOk) return;
  if (syncRunning) return syncRunning;
  ui.account = { ...ui.account, busy: true };
  if (manual) render();
  syncRunning = (async () => {
    try {
      const res = await sync.sync(course.id, state, { allowApply: !STUDY_ROUTES.includes(route().name) });
      ui.account = { ...ui.account, busy: false, error: null, deferred: Boolean(res.deferred) };
      if (res.changed && res.state !== state) {
        saveState(res.state, localStorage, course.storageKey);
        state = res.state;
        if (!STUDY_ROUTES.includes(route().name)) toast(t('acc.updated'));
      }
      if (manual) toast(t('acc.synced'));
    } catch (e) {
      ui.account = { ...ui.account, busy: false, error: e.reason ?? 'server' };
      if (manual) toast(t(`acc.err.${e.reason ?? 'server'}`));
    } finally {
      syncRunning = null;
      render();
    }
  })();
  return syncRunning;
}

// Vercel gives every single upload its own fixed address (…-abc123xyz-….vercel.app). Such an address never gets
// updates – the app says so and links to the address that always has the newest version.
const LIVE_URL = 'https://quiet-phone-git-main-iiiiiiiiiii.vercel.app/english-vocabulary/';
const FROZEN_HOST = /^quiet-phone(?:-2ynm)?-(?!git-)[a-z0-9]{7,}-[a-z0-9-]+\.vercel\.app$/;
function oldAddressNotice() {
  if (!FROZEN_HOST.test(location.hostname)) return '';
  return `<div class="notice" role="note" style="margin-bottom:16px">${esc(t('dash.oldAddress'))} <a href="${LIVE_URL}">${esc(t('dash.oldAddressLink'))}</a></div>`;
}

// Always visible at the top: which account is signed in (or a short way to sign in).
// Google's "G" in its own colours (shown on the sign-in button, as Google asks for).
const GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

// The profile picture of the account (from Google) – or the person icon when there is none.
function avatar(a, size = 22) {
  if (a?.avatar && !ui.avatarFailed) {
    return `<img class="avatar" src="${esc(a.avatar)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer" data-avatar="1" />`;
  }
  return icon('user', Math.min(size, 16));
}

// Always visible at the top: which account is signed in (or a short way to sign in).
function accountChip() {
  if (!sync.enabled) return '';
  const a = sync.account();
  if (!a) return `<a class="account-chip is-out" href="#/settings">${GOOGLE_G}<span>${esc(t('acc.signIn'))}</span></a>`;
  return `<a class="account-chip" href="#/settings" title="${esc(t('acc.signedIn', { e: a.email }))}" aria-label="${esc(t('acc.signedIn', { e: a.email }))}">${avatar(a)}<span class="account-email">${esc(a.email.split('@')[0])}<span class="account-domain">@${esc(a.email.split('@').slice(1).join('@'))}</span></span></a>`;
}

function accountSection() {
  if (!sync.enabled) return '';
  const a = sync.account();
  const st = ui.account ?? {};
  if (a) {
    const last = sync.lastSync(course.id);
    const when = last ? new Intl.DateTimeFormat(LOCALES[prefs.lang] ?? 'de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(last)) : '–';
    return `
    <section class="section card account" aria-labelledby="acc-title">
      <h2 class="section-title" id="acc-title">${esc(t('acc.title'))}</h2>
      <div class="account-who">
        ${avatar(a, 48)}
        <div>
          ${a.name ? `<p class="account-name">${esc(a.name)}</p>` : ''}
          <p class="small">${esc(a.email)}</p>
          <p class="muted small">${icon('check', 14)} ${esc(t(a.provider === 'google' ? 'acc.viaGoogle' : 'acc.signedInShort'))}</p>
        </div>
      </div>
      <p class="muted small">${esc(st.busy ? t('acc.syncing') : st.error ? t(`acc.err.${st.error}`) : t('acc.lastSync', { d: when }))}</p>
      <div class="hero-actions">
        <button class="btn btn-sm" data-action="sync-now" ${st.busy ? 'disabled' : ''}>${esc(t('acc.syncNow'))}</button>
        <button class="btn btn-sm btn-ghost" data-action="sign-out">${esc(t('acc.signOut'))}</button>
      </div>
    </section>`;
  }
  return `
    <section class="section card account" aria-labelledby="acc-title">
      <h2 class="section-title" id="acc-title">${esc(t('acc.title'))}</h2>
      <p class="muted small">${esc(t('acc.lead'))}</p>
      <div class="hero-actions"><button class="btn btn-google btn-wide" data-action="google-sign-in" ${st.busy ? 'disabled' : ''}>${GOOGLE_G} ${esc(t('acc.google'))}</button></div>
      <details class="account-more" ${ui.emailOpen === false ? '' : 'open'}><summary>${esc(t('acc.withEmail'))}</summary>
      <form class="account-form" data-form="account" autocomplete="on">
        <label class="sr-only" for="acc-email">${esc(t('acc.email'))}</label>
        <input class="input" id="acc-email" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="${esc(t('acc.email'))}" value="${esc(ui.accDraft.email || st.email || '')}" required />
        <label class="sr-only" for="acc-password">${esc(t('acc.password'))}</label>
        <input class="input" id="acc-password" name="password" type="password" autocomplete="current-password" minlength="8" placeholder="${esc(t('acc.password'))}" value="${esc(ui.accDraft.password)}" required />
        <div class="hero-actions">
          <button class="btn btn-primary" type="submit" name="mode" value="signin" ${st.busy ? 'disabled' : ''}>${esc(t('acc.signIn'))}</button>
          <button class="btn" type="submit" name="mode" value="signup" ${st.busy ? 'disabled' : ''}>${esc(t('acc.signUp'))}</button>
        </div>
      </form>
      </details>
      ${st.error ? `<p class="notice" role="alert" style="margin-top:10px">${esc(t(`acc.err.${st.error}`))}</p>` : ''}
    </section>`;
}

function toast(text) {
  ui.toast = text;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => {
    ui.toast = null;
    render();
  }, 3500);
  render();
  announce(text);
}

function commit(next) {
  if (next === state) return false;
  try {
    if (storageOk) saveState(next, localStorage, course.storageKey);
    state = next;
    ui.saveError = null;
    ui.pending = null;
    render();
    scheduleSync();
    reportStudied();
    return true;
  } catch {
    ui.saveError = t('msg.saveError');
    ui.pending = next;
    render();
    return false;
  }
}

// With the daily reminder on: tell the server once a day that you have learned, so no reminder comes that day.
function reportStudied() {
  if (!reminder.status().on || !learningStreak(state, today()).today) return;
  reminder.studied(today()).catch(() => {});
}

async function setReminder(on, hour) {
  ui.reminderError = null;
  ui.reminderBusy = true;
  render();
  try {
    if (on) await reminder.enable({ hour, lang: prefs.lang, studiedDay: learningStreak(state, today()).today ? today() : null });
    else await reminder.disable();
  } catch (error) {
    ui.reminderError = error?.reason ?? 'network';
  }
  ui.reminderBusy = false;
  render();
}

// Settings block for the daily reminder. Off until you switch it on; the phone then asks for permission once.
function reminderSection() {
  const s = reminder.status();
  const head = `<h2 class="section-title">${esc(t('rem.title'))}</h2>`;
  if (!reminder.supported()) {
    const standalone = navigator.standalone === true || globalThis.matchMedia?.('(display-mode: standalone)').matches;
    return `<section class="section card" id="reminder">${head}<p class="muted small">${esc(t(IS_IOS && !standalone ? 'rem.iosInstall' : 'rem.unsupported'))}</p></section>`;
  }
  const busy = ui.reminderBusy ? 'disabled' : '';
  const option = (value, label) => `<label><input type="radio" name="reminder" value="${value}" ${String(s.on) === value ? 'checked' : ''} ${busy} data-reminder="on"><span>${esc(label)}</span></label>`;
  return `<section class="section card" id="reminder">
      ${head}
      <div class="segmented">${option('true', t('set.on'))}${option('false', t('set.off'))}</div>
      ${s.on
        ? `<div class="field" style="margin:16px 0 0"><label for="reminder-hour">${esc(t('rem.hour'))}</label>
      <select class="input select" id="reminder-hour" data-reminder="hour" ${busy}>${REMINDER_HOURS.map((h) => `<option value="${h}" ${h === s.hour ? 'selected' : ''}>${esc(t('rem.at', { h: String(h).padStart(2, '0') }))}</option>`).join('')}</select></div>`
        : ''}
      ${ui.reminderError ? `<p class="notice" role="alert" style="margin-top:10px">${esc(t(`rem.err.${ui.reminderError}`))}</p>` : ''}
      <p class="muted small field-note">${esc(t(s.on ? 'rem.noteOn' : 'rem.note'))}</p>
    </section>`;
}

function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  savePrefs(prefs);
  t = createTranslator(prefs.lang);
  applyLanguage();
  render();
}

function applyLanguage() {
  document.documentElement.lang = prefs.lang;
  document.title = course.brand;
  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = t('skip');
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name = '', param = null] = hash.split('/');
  return { name: name || 'home', param };
}

function go(path) {
  if (location.hash === `#/${path}`) render();
  else location.hash = `#/${path}`;
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  today: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  review: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  tests: '<path d="M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2"/><path d="m9 13 2 2 4-4"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  grammar: '<path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 8h6M8 12h4"/><path d="m14.5 14.5 1.5 1.5 3-3"/>',
  topics: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 13.5v7.5M13.5 17.25H21"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  lessons: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6M9 11h4"/>',
  sentences: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  match: '<rect x="3" y="4" width="7.5" height="7" rx="1.5"/><rect x="13.5" y="13" width="7.5" height="7" rx="1.5"/><path d="M10.5 7.5h3a2 2 0 0 1 2 2V13M13.5 16.5h-3a2 2 0 0 1-2-2V11"/>',
  listen: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>',
  train: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  crossCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
  letters: '<path d="M3.5 18 8 6l4.5 12M5.2 14h5.6M15 9.5h5.5M15 14h5.5M15 18.5h5.5"/>',
  memory: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
};
const icon = (name, size) =>
  `<svg viewBox="0 0 24 24" ${size ? `width="${size}" height="${size}"` : ''} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const NAV = [
  { name: 'home', href: '#/' },
  { name: 'lessons', href: '#/lessons' },
  { name: 'sentences', href: '#/sentences' },
  { name: 'grammar', href: '#/grammar' },
  { name: 'review', href: '#/review' },
  { name: 'train', href: '#/train' },
  { name: 'tests', href: '#/tests' },
  { name: 'topics', href: '#/topics' },
  { name: 'progress', href: '#/progress' },
];
// Phones: five tabs in the order you learn – Start, Lernen (words, sentences, grammar), Wiederholen, Üben (games,
// tests, topics), Fortschritt. Each tab stays lit on every page that belongs to it.
const BOTTOM_NAV = [
  { name: 'home', href: '#/' },
  { name: 'lessons', href: '#/lessons', label: 'nav.learn', group: ['lessons', 'sentences', 'grammar'] },
  { name: 'review', href: '#/review' },
  { name: 'train', href: '#/train', group: ['train', 'tests', 'topics'] },
  { name: 'progress', href: '#/progress' },
];
// English grammar is part of the English course only.
const hasGrammar = () => course.id === 'de-en';
// Everyday situations with their units and dialogs exist in the English course only.
const hasSituations = () => course.id === 'de-en';
const situationTitle = (sit) => sit.title[prefs.lang] ?? sit.title.de;
const hardCount = () => hardWordIds(state).length;
// "Schwierige Wörter üben" – the same button on the start page, the tests and the test results.
const hardButton = (cls = 'btn btn-primary') =>
  hardCount() ? `<button class="${cls}" data-action="start-hard-round">${esc(t('hard.start', { n: Math.min(hardCount(), HARD_ROUND_MAX) }))}</button>` : '';
const NAV_GROUP = {
  learn: 'lessons',
  lesson: 'lessons',
  preview: 'lessons',
  practice: 'train',
  today: 'lessons',
  test: 'tests',
  result: 'tests',
  placement: 'tests',
  stories: 'train',
  story: 'train',
  music: 'train',
  'song-add': 'train',
  song: 'train',
  'song-cards': 'train',
  'song-learn': 'train',
  sentence: 'sentences',
  'sentence-lesson': 'sentences',
  'sentence-category': 'home',
  topic: 'topics',
  'topic-learn': 'topics',
  'grammar-topic': 'grammar',
  'grammar-quiz': 'grammar',
  match: 'train',
  listen: 'train',
  dictation: 'train',
  blitz: 'train',
  scramble: 'train',
  memory: 'train',
  puzzle: 'train',
};

// "1 Wort", "2 Wörter"
const wordCount = (n) => (n === 1 ? t('path.word1') : t('path.words', { n }));

const dirLabel = (direction) => (direction === 'de-en' ? `${NL.toUpperCase()} → ${TL.toUpperCase()}` : `${TL.toUpperCase()} → ${NL.toUpperCase()}`);
const testName = (test) => t(test.type === 'daily' ? 'tests.daily' : 'tests.weekly');

/* ---------------- shell ---------------- */

function renderShell(content, current, animate = true) {
  const due = reviewsLeftToday(state, now());
  const active = NAV_GROUP[current] ?? current;
  const isActive = (item) => active === item.name || Boolean(item.group?.includes(active));
  const link = (item) => `
    <a class="nav-link" href="${item.href}" ${isActive(item) ? 'aria-current="page"' : ''}>
      <span class="nav-icon">${icon(item.name)}${item.name === 'review' && due ? `<span class="nav-badge" aria-label="${esc(t('nav.due', { n: due }))}">${due > 99 ? '99+' : due}</span>` : ''}</span>
      <span class="nav-label">${esc(t(item.label ?? `nav.${item.name}`))}</span>
    </a>`;
  return `
    <nav class="sidebar" aria-label="${esc(t('nav.main'))}">
      <a class="brand" href="#/">${esc(course.brand)}</a>
      ${NAV.filter((n) => n.name !== 'grammar' || hasGrammar()).map(link).join('')}
      <div class="spacer"></div>
      <a class="nav-link" href="#/settings" ${current === 'settings' ? 'aria-current="page"' : ''}>${icon('settings')}<span>${esc(t('nav.settings'))}</span></a>
    </nav>
    <div>
      <main id="main" class="main" tabindex="-1">
        <header class="topbar">
          <a class="brand" href="#/">${esc(course.brand)}</a>
          <span class="topbar-actions">
            ${streakChip()}
            ${accountChip()}
            <a class="icon-btn topbar-progress" href="#/progress" aria-label="${esc(t('nav.progress'))}">${icon('progress')}</a>
            <a class="icon-btn" href="#/settings" aria-label="${esc(t('nav.settings'))}">${icon('settings')}</a>
          </span>
        </header>
        ${renderBanners()}
        <div class="view-enter${animate ? '' : ' no-anim'}">${content}</div>
      </main>
    </div>
    <nav class="bottom-nav" aria-label="${esc(t('nav.main'))}">${BOTTOM_NAV.map(link).join('')}</nav>
    ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}`;
}

// "🔥 Streak · 7 Tage" – shown at the top while you learn with cards (the card screens are dark and golden).
function streakChip() {
  const streak = learningStreak(state, today());
  return `<a class="streak-chip" href="#/progress" aria-label="${esc(t('card.streakLabel', { n: streak.days }))}"><span class="streak-flame" aria-hidden="true">🔥</span><span class="streak-text"><span class="streak-title">${esc(t('card.streak'))}</span><span class="streak-days">${esc(t(streak.days === 1 ? 'card.streakDay' : 'card.streakDays', { n: streak.days }))}</span></span></a>`;
}

function renderBanners() {
  const out = [];
  if (!storageOk) out.push(`<div class="notice error" role="alert">${esc(t('msg.storageBlocked'))}</div>`);
  if (ui.loadError) out.push(`<div class="notice error" role="alert">${esc(t('msg.loadError', { e: ui.loadError }))}</div>`);
  if (ui.saveError) {
    out.push(`<div class="notice error" role="alert">${esc(ui.saveError)}<br><button class="btn btn-sm" data-action="retry-save">${esc(t('msg.retry'))}</button></div>`);
  }
  if (!ui.online) out.push(`<div class="notice">${esc(t('msg.offline'))}</div>`);
  return out.length ? `<div class="section" style="margin-top:0;margin-bottom:20px">${out.join('')}</div>` : '';
}

/* ---------------- dashboard ---------------- */

// Where a lesson stands: words → sentences → daily test.
function lessonInfo(lesson) {
  const p = lessonProgress(lesson);
  const sentences = sentenceSessionFor(state, lesson.id);
  const daily = dailyTestFor(state, lesson.id);
  const wordsDone = Boolean(lesson.completedAt);
  const hasWords = lesson.items.some((i) => i.status === 'remembered');
  return {
    p,
    sentences,
    daily,
    wordsDone,
    sentencesDone: Boolean(sentences?.completedAt) || (wordsDone && !hasWords),
    testDone: Boolean(daily?.completedAt) || (wordsDone && !hasWords),
    get complete() {
      return this.wordsDone && this.sentencesDone && this.testDone;
    },
  };
}

// The next thing to do inside one lesson, or null when the lesson is complete.
function lessonNextStep(lesson) {
  const info = lessonInfo(lesson);
  if (!info.wordsDone) return { label: t(info.p.done ? 'act.continueLesson' : 'act.startLesson', { n: lesson.number }), sub: t('sub.vocabPos', { p: pad(info.p.position), t: pad(info.p.total) }), href: '#/learn' };
  if (!info.sentencesDone) {
    if (info.sentences) return { label: t('act.continueSentences'), sub: t('sub.sentencePos', { p: sentenceSessionProgress(info.sentences).done + 1, t: info.sentences.items.length }), href: `#/sentence/${info.sentences.id}` };
    return { label: t('act.practiceSentences'), sub: t('sub.sentencesFor', { n: lesson.number }), action: 'start-sentences', data: lesson.id };
  }
  if (!info.testDone) {
    if (info.daily) return { label: t('act.continueDaily'), sub: t('sub.question', { p: info.daily.currentIndex + 1, t: info.daily.questions.length }), href: `#/test/${info.daily.id}` };
    return { label: t('act.takeDaily'), sub: t('sub.dailyFor', { n: lesson.number }), action: 'start-daily', data: lesson.id };
  }
  return null;
}

function learnAheadTarget() {
  if (currentLesson(state)) return null;
  const n = state.lessons.length + 1;
  const ahead = lessonCompletedToday(state, today());
  // Tapping it starts a full lesson of new words, also when reviews are due.
  const size = lessonSize(state);
  return { label: t(ahead ? 'act.learnAhead' : 'act.startLesson', { n }), sub: t(ahead ? 'sub.learnAhead' : 'sub.newLesson', { n: size, m: minutesFor(size) }), action: 'start-lesson' };
}

const minutesFor = (size) => `${Math.round(size * 1.5)}–${size * 2}`;
// Questions in a lesson's daily test: every learned word of the lesson plus two older ones, 10 to 30.
const dailyCount = (lesson) => Math.min(30, Math.max(10, lesson.items.filter((i) => i.status === 'remembered').length + 2));

function continueTarget() {
  const day = today();
  const lesson = currentLesson(state);
  if (lesson) return lessonNextStep(lesson);
  const sentences = openSentenceSession(state);
  if (sentences) {
    return { label: t('act.continueSentences'), sub: t('sub.sentencePos', { p: sentenceSessionProgress(sentences).done + 1, t: sentences.items.length }), href: `#/sentence/${sentences.id}` };
  }
  const test = openTest(state);
  if (test) {
    return { label: t(test.type === 'daily' ? 'act.continueDaily' : 'act.continueWeekly'), sub: t('sub.question', { p: test.currentIndex + 1, t: test.questions.length }), href: `#/test/${test.id}` };
  }
  const due = reviewsLeftToday(state, now());
  if (due) return { label: t('act.startReview'), sub: due === 1 ? t('sub.reviewDue') : t('sub.reviewsDue', { n: due }), href: '#/review' };
  const dueSentences = sentenceReviewIds(state, day).length;
  if (dueSentences) return { label: t('act.reviewSentences'), sub: t('sub.sentencesDue', { n: dueSentences }), action: 'start-sentence-review' };
  const last = lastCompletedLesson(state);
  const step = last ? lessonNextStep(last) : null;
  if (step) return step;
  return learnAheadTarget();
}

// "Heute lernen": the next step of today in the best order – first the due reviews (words, then sentences), then the
// lesson you are on (words → sentences → test), then new words in today's size (fewer while many reviews are due).
// null: everything for today is done.
const SMALL_LESSON = 10;
function todayTarget() {
  const day = today();
  const reviewLeft = reviewsLeftToday(state, now());
  if (reviewLeft) return { key: 'review', label: t('today.stepReview', { n: reviewLeft }), href: '#/review' };
  const dueSentences = sentenceReviewIds(state, day).length;
  if (dueSentences) return { key: 'sreview', label: t('today.stepSentenceReview', { n: dueSentences }), action: 'start-sentence-review' };
  const focus = currentLesson(state) ?? lastCompletedLesson(state);
  const step = focus ? lessonNextStep(focus) : null;
  if (step) return { ...step, key: 'lesson' };
  if (lessonCompletedToday(state, day) || !upcomingLessons(VOCABULARY, state, 1).length) return null;
  const size = state.lessons.length ? dailyLoad(state, day, lessonSize(state)).newWords : lessonSize(state);
  if (size <= 0) return null;
  return { key: 'new', label: t('today.stepNew', { n: size }), action: 'start-lesson', data: String(size) };
}
const todayNextButton = (cls = 'btn btn-primary') => {
  const target = todayTarget();
  return target ? actionButton({ ...target, label: t('today.nextStep', { s: target.label }) }, cls) : '';
};

// The pile of due reviews on the start page: how much waits, what is done today, and one round at a time.
function catchUpCard() {
  const b = backlog(state, today());
  if (!b.active) return '';
  const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
  const open = currentLesson(state);
  return `<section class="section card catch-up" aria-labelledby="catch-title">
      <div class="section-head"><h2 class="section-title" id="catch-title">${esc(t('catch.title'))}</h2><span class="catch-count">${esc(t('catch.count', { n: b.due }))}</span></div>
      <p class="muted small">${esc(t('catch.text', { d: b.due, r: REVIEW_ROUND }))}</p>
      <div class="bar catch-bar" role="progressbar" aria-label="${esc(t('catch.today', { n: b.done }))}" aria-valuemin="0" aria-valuemax="${b.total}" aria-valuenow="${b.done}"><span style="width:${pct}%"></span></div>
      <p class="small catch-today">${esc(t('catch.today', { n: b.done }))}</p>
      <div class="hero-actions"><a class="btn btn-primary" href="#/review">${esc(t('catch.go', { r: Math.min(REVIEW_ROUND, b.due) }))}</a>${open || lessonSize(state) <= SMALL_LESSON || !upcomingLessons(VOCABULARY, state, 1).length ? '' : `<button class="btn" data-action="start-lesson" data-id="${SMALL_LESSON}">${esc(t('catch.small', { n: SMALL_LESSON }))}</button>`}</div>
      ${lessonSize(state) > SMALL_LESSON ? `<p class="muted small" style="margin-top:10px">${esc(t('catch.tip'))}</p>` : ''}
    </section>`;
}

function actionButton(target, cls = 'btn btn-primary') {
  if (target.href) return `<a class="${cls}" href="${target.href}">${esc(target.label)}</a>`;
  return `<button class="${cls}" data-action="${target.action}" ${target.data ? `data-id="${esc(target.data)}"` : ''}>${esc(target.label)}</button>`;
}

const hourFormatter = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Berlin' });
function greeting() {
  const h = Number(hourFormatter.format(now()));
  return t(h < 11 ? 'dash.morning' : h < 18 ? 'dash.day' : 'dash.evening');
}
function longDate() {
  return new Intl.DateTimeFormat(LOCALES[prefs.lang] ?? 'de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' }).format(now());
}

function ring(done, total) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const off = c * (1 - (total ? done / total : 0));
  return `<svg class="ring" viewBox="0 0 60 60" role="img" aria-label="${esc(t('dash.ringLabel', { d: done, t: total }))}">
    <circle class="ring-track" cx="30" cy="30" r="${r}"/>
    <circle class="ring-value" cx="30" cy="30" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="--ring-c:${c.toFixed(1)};--ring-off:${off.toFixed(1)}" transform="rotate(-90 30 30)"/>
    <text x="30" y="35" text-anchor="middle">${done}/${total}</text>
  </svg>`;
}

// Today's plan for the lesson you are working on: review → words → sentences → test.
function planSteps(stats) {
  const day = today();
  const focus = currentLesson(state) ?? state.lessons.at(-1) ?? null;
  const info = focus ? lessonInfo(focus) : null;
  const dueS = sentenceReviewIds(state, day).length;
  const wordsLeft = reviewsLeftToday(state, now());
  const reviewedToday = state.review?.day === day && state.review.completed > 0;
  const wordsAction = focus ? (info.wordsDone ? null : { label: t(info.p.done ? 'plan.continue' : 'plan.go'), href: '#/learn' }) : { label: t('plan.go'), action: 'start-lesson' };
  const sentencesAction = !info?.wordsDone || info.sentencesDone ? null : info.sentences ? { label: t('plan.continue'), href: `#/sentence/${info.sentences.id}` } : { label: t('plan.go'), action: 'start-sentences', data: focus.id };
  const testAction = !info?.wordsDone || info.testDone ? null : info.daily ? { label: t('plan.continue'), href: `#/test/${info.daily.id}` } : { label: t('plan.go'), action: 'start-daily', data: focus.id };
  return {
    focus,
    steps: [
      {
        key: 'review',
        done: wordsLeft === 0 && dueS === 0,
        detail: wordsLeft ? t('plan.reviewDue', { n: wordsLeft }) : dueS ? t('sub.sentencesDue', { n: dueS }) : reviewedToday ? t('plan.reviewDone', { n: state.review.completed }) : t('plan.nothingDue'),
        action: wordsLeft ? { label: t('plan.go'), href: '#/review' } : dueS ? { label: t('plan.go'), action: 'start-sentence-review' } : null,
      },
      {
        key: 'words',
        done: Boolean(info?.wordsDone),
        active: Boolean(focus && !info.wordsDone && info.p.done),
        detail: !focus ? t('plan.wordsOpen', { n: lessonSize(state) }) : info.wordsDone ? t('plan.wordsLearned', { n: info.p.total }) : t('plan.wordsProgress', { d: info.p.done, t: info.p.total }),
        action: wordsAction,
      },
      {
        key: 'sentences',
        done: Boolean(info?.sentencesDone),
        active: Boolean(info?.sentences && !info.sentences.completedAt),
        locked: !info?.wordsDone,
        detail: info?.sentences && !info.sentences.completedAt
          ? t('plan.sentencesRunning', { p: sentenceSessionProgress(info.sentences).done, t: info.sentences.items.length })
          : info?.sentencesDone
            ? t('plan.sentencesLearned', { t: info.sentences?.items.length ?? 0 })
            : t('plan.sentencesOpen'),
        action: sentencesAction,
      },
      {
        key: 'test',
        done: Boolean(info?.testDone),
        active: Boolean(info?.daily && !info.daily.completedAt),
        locked: !info?.wordsDone,
        detail: info?.daily?.completedAt ? scoreLine(info.daily) : t('plan.testOpen', { n: focus ? dailyCount(focus) : 10 }),
        action: testAction,
      },
    ],
  };
}

function planSection(plan) {
  const row = (s, i) => `
    <li class="tl-step ${s.done ? 'is-done' : s.active ? 'is-active' : s.locked ? 'is-locked' : ''}">
      <span class="tl-dot" aria-hidden="true">${s.done ? icon('check', 14) : i + 1}</span>
      <span class="tl-text"><span class="tl-title">${esc(t(`plan.${s.key}`))}</span><span class="tl-detail">${esc(s.detail)}</span></span>
      <span class="sr-only">${esc(t(s.done ? 'plan.srDone' : s.locked ? 'plan.srLocked' : 'plan.srOpen'))}</span>
      ${s.action && !s.done ? actionButton(s.action, 'btn btn-sm tl-action') : ''}
    </li>`;
  return `
    <section class="section card plan" aria-labelledby="plan-title">
      <div class="section-head"><h2 class="section-title" id="plan-title">${esc(t('plan.title'))}</h2>${plan.focus ? `<a class="section-link" href="#/lesson/${plan.focus.id}">${esc(t('path.lesson', { n: plan.focus.number }))}</a>` : ''}</div>
      <ol class="timeline">${plan.steps.map(row).join('')}</ol>
    </section>`;
}

// A tap on the open lesson goes on with it; a finished lesson opens its page (nothing is asked again unasked).
function pathTile(lesson) {
  const info = lessonInfo(lesson);
  const cls = info.complete ? 'is-done' : 'is-current';
  const dots = [info.wordsDone, info.sentencesDone, info.testDone].map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('');
  const inner = `
      <span class="path-num">${info.complete ? icon('check', 16) : lesson.number}</span>
      <span class="path-title">${esc(t('path.lesson', { n: lesson.number }))}</span>
      <span class="path-sub">${esc(wordCount(lesson.items.length))} · ${esc(fmtDay(lesson.createdDay))}</span>
      ${lesson.themes?.length ? `<span class="path-peek">${esc(themeText(lesson.themes))}</span>` : ''}
      <span class="path-steps" aria-hidden="true">${dots}</span>
      ${info.wordsDone ? '' : `<span class="path-go">${esc(t('path.continueLesson'))}</span>`}`;
  if (!info.wordsDone) return `<a class="path-tile ${cls}" href="#/learn" role="listitem">${inner}</a>`;
  return `<a class="path-tile ${cls}" href="#/lesson/${lesson.id}" role="listitem">${inner}</a>`;
}

function nextTile(plan) {
  const n = state.lessons.length + 1;
  const ahead = lessonCompletedToday(state, today());
  return `<button class="path-tile is-next" data-action="start-lesson" role="listitem">
      <span class="path-num">+</span><span class="path-title">${esc(t('path.lesson', { n }))}</span>
      <span class="path-sub">${esc(t(ahead ? 'path.ahead' : 'path.start'))} · ${esc(wordCount(lessonSize(state)))}</span>
      ${plan?.themes?.length ? `<span class="path-peek">${esc(themeText(plan.themes))}</span>` : ''}
      <span class="path-go">${esc(t('path.newWords'))}</span>
    </button>`;
}

// Locked tiles for the lessons after that – tap to see their words in advance.
function previewTile(plan) {
  const open = currentLesson(state);
  const sub = open && plan.number === open.number + 1 ? t('path.afterCurrent', { n: open.number }) : t('path.preview');
  return `<a class="path-tile is-preview" href="#/preview/${plan.number}" role="listitem" aria-label="${esc(t('preview.title', { n: plan.number }))}">
      <span class="path-num">${icon('lock', 15)}</span>
      <span class="path-title">${esc(t('path.lesson', { n: plan.number }))}</span>
      <span class="path-sub">${esc(sub)}</span>
      ${plan.themes?.length ? `<span class="path-peek">${esc(themeText(plan.themes))}</span>` : `<span class="path-peek" lang="${TL}">${esc(plan.ids.slice(0, 2).map((id) => vocabById.get(id).english).join(' · '))}</span>`}
    </a>`;
}

function pathSection() {
  const open = currentLesson(state);
  const upcoming = upcomingLessons(VOCABULARY, state, 3);
  const previews = (open ? upcoming : upcoming.slice(1)).slice(0, 2);
  return `
    <section class="section" aria-labelledby="path-title">
      <div class="section-head"><h2 class="section-title" id="path-title">${esc(t('path.title'))}</h2><a class="section-link" href="#/lessons">${esc(t('path.all'))}</a></div>
      <div class="path" role="list">${state.lessons.map(pathTile).join('')}${open || !upcoming.length ? '' : nextTile(upcoming[0])}${previews.map(previewTile).join('')}</div>
    </section>`;
}

// "Meine schwierigen Wörter" on the start page – only when there are some.
function hardStrip() {
  const n = hardCount();
  if (!n) return '';
  return `<section class="section card hard-strip" aria-labelledby="hard-title">
      <div><h2 class="section-title" id="hard-title">${esc(t('hard.title'))}</h2><p class="muted small">${esc(t(n === 1 ? 'hard.sub1' : 'hard.sub', { n }))}</p></div>
      ${hardButton()}
    </section>`;
}

// Quick entry into the training games with everything you have learned so far.
function trainStrip() {
  const n = poolFor(state, 'all', today()).length;
  if (n < 2) return '';
  const tile = (key, iconName, attrs) => `<${attrs.href ? 'a' : 'button'} class="train-tile" ${attrs.href ? `href="${attrs.href}"` : `data-action="${attrs.action}" data-id="all"`}>
      <span class="train-icon">${icon(iconName, 22)}</span><span class="train-name">${esc(t(`train.${key}`))}</span><span class="train-sub">${esc(t(`train.${key}Short`))}</span>
    </${attrs.href ? 'a' : 'button'}>`;
  return `
    <section class="section" aria-labelledby="quick-title">
      <div class="section-head"><h2 class="section-title" id="quick-title">${esc(t('train.quick'))}</h2><a class="section-link" href="#/train">${esc(t('train.all'))}</a></div>
      <div class="train-strip">
        ${tile('match', 'match', { href: '#/match/all' })}
        ${tile('blitz', 'timer', { href: '#/blitz/all' })}
        ${tile('listen', 'listen', { href: '#/listen/all' })}
        ${tile('cards', 'cards', { action: 'start-word-practice' })}
      </div>
    </section>`;
}

// "Wörter lernen | Sätze lernen" at the very top of the start page.
function homeSwitch() {
  const mode = prefs.homeMode === 'sentences' ? 'sentences' : 'words';
  const btn = (key, label) => `<button class="tab" role="tab" data-action="home-mode" data-id="${key}" aria-selected="${mode === key}" ${mode === key ? '' : 'tabindex="-1"'}>${esc(label)}</button>`;
  const grammar = hasGrammar() ? `<a class="tab" href="#/grammar" role="tab" aria-selected="false">${esc(t('nav.grammar'))}</a>` : '';
  return `<div class="tabs learn-switch home-switch" role="tablist" aria-label="${esc(t('learn.switch'))}">${btn('words', t('learn.tabWords'))}${btn('sentences', t('learn.tabSentences'))}${grammar}</div>`;
}

function viewDashboard() {
  return `${homeSwitch()}${prefs.homeMode === 'sentences' ? viewSentenceHome() : viewWordHome()}`;
}

// The learning streak in one short line on the start page; links to today's progress.
function streakLine() {
  const streak = learningStreak(state, today());
  if (!streak.days) return '';
  const key = `${streak.today ? 'prog.streakOn' : 'prog.streakKeep'}${streak.days === 1 ? '1' : ''}`;
  return `<p class="small streak-line"><a href="#/progress">${esc(t(key, { n: streak.days }))}</a></p>`;
}

function viewWordHome() {
  const day = today();
  const stats = computeStats(state, day);
  if (!state.lessons.length) {
    return `
      <section class="card hero hero-welcome" aria-labelledby="hero-title">
        <p class="eyebrow">${esc(greeting())} · ${esc(longDate())}</p>
        <h1 id="hero-title" class="page-title" tabindex="-1">${esc(t('dash.firstTitle'))}</h1>
        <p class="lead">${esc(t('dash.firstLead', { n: lessonSize(state) }))}</p>
        <div class="hero-actions"><button class="btn btn-primary" data-action="start-lesson">${esc(t('act.startLesson', { n: 1 }))}</button></div>
        <p class="muted small" style="margin-top:20px">${esc(t('place.welcome'))} <a href="#/placement">${esc(t('place.open'))}</a></p>
        <p class="muted small" style="margin-top:20px">${esc(t('course.question'))}</p>
        <div class="hero-actions" style="margin-top:8px"><button class="btn btn-sm" data-action="switch-course" data-id="${otherCourse().id}">${esc(t(`course.switch.${otherCourse().id}`))}</button></div>
      </section>`;
  }

  const plan = planSteps(stats);
  const doneCount = plan.steps.filter((s) => s.done).length;
  // First thing on the start page: go on with the lessons, no thinking needed.
  const open = currentLesson(state);
  const hasMore = open || upcomingLessons(VOCABULARY, state, 1).length > 0;
  const number = open ? open.number : state.lessons.length + 1;
  const progress = open ? lessonProgress(open) : null;
  const size = lessonSize(state);
  // "Heute lernen" leads through the day (reviews first); the lesson button stays for going straight to new words.
  const guide = todayTarget();
  const guided = guide && guide.key !== 'lesson' && guide.key !== 'new';
  const lessonCls = guided ? 'btn' : 'btn btn-primary btn-go';
  const lessonBtn = !hasMore
    ? ''
    : open
      ? `<a class="${lessonCls}" href="#/learn">${esc(t('cont.goOn', { n: number }))}</a>`
      : `<button class="${lessonCls}" data-action="start-lesson">${esc(t('cont.start', { n: number }))}</button>`;
  const go = `${guided ? actionButton({ ...guide, label: t('today.go') }, 'btn btn-primary btn-go') : ''}${lessonBtn}`;
  const hero = `
    <section class="card hero hero-grid continue-card">
      <div class="hero-main">
        <p class="eyebrow">${esc(greeting())} · ${esc(longDate())}</p>
        <h1 class="page-title" tabindex="-1">${esc(hasMore ? t('path.lesson', { n: number }) : t('cont.allDone'))}</h1>
        <p class="lead">${esc(!hasMore ? t('cont.allDoneLead') : open ? t('cont.subOpen', { d: progress.done, t: progress.total }) : t('cont.subNew', { n: size, m: minutesFor(size) }))}</p>
        ${open ? `<div class="bar continue-bar" aria-hidden="true"><span style="width:${progress.total ? (progress.done / progress.total) * 100 : 0}%"></span></div>` : ''}
        ${streakLine()}
        ${guided ? `<p class="small today-first">${esc(t('today.first', { s: guide.label }))}</p>` : ''}
        <div class="hero-actions">${go}</div>
      </div>
      <div class="hero-ring">${ring(doneCount, plan.steps.length)}<span class="ring-caption">${esc(t('dash.ringCaption'))}</span></div>
    </section>`;

  const metric = (href, label, value, sub) => `<a class="card metric-card" href="${href}"><p class="metric-label">${esc(label)}</p><p class="metric-value">${value}</p><p class="metric-sub">${esc(sub)}</p></a>`;
  return `
    ${oldAddressNotice()}
    ${hero}
    ${catchUpCard()}
    ${pathSection()}
    ${planSection(plan)}
    ${hardStrip()}
    <section class="section grid grid-3 dash-metrics" aria-label="${esc(t('dash.overview'))}">
      ${metric('#/progress', t('dash.vocabProgress'), stats.totalVocabulary, t('dash.vocabSub', { m: stats.mastered, l: stats.learning }))}
      ${metric('#/sentences', t('nav.sentences'), learnedSentenceIds(state).length, t('dash.sentencesSub'))}
      ${metric('#/tests', t('prog.accuracy'), stats.testAccuracy === null ? '–' : `${stats.testAccuracy} %`, t(stats.testAccuracy === null ? 'prog.accuracyNone' : 'prog.accuracySub'))}
    </section>
    ${trainStrip()}`;
}

/* ---------------- lessons ---------------- */

function stepChips(info) {
  const chip = (labelKey, done, running, detail) =>
    `<span class="chip ${done ? 'is-done' : running ? 'is-active' : ''}">${done ? icon('check', 12) : ''}${esc(t(labelKey))}${detail ? ` · ${esc(detail)}` : ''}</span>`;
  return `<div class="chips">
    ${chip('lesson.words', info.wordsDone, !info.wordsDone && info.p.done > 0, `${info.p.done}/${info.p.total}`)}
    ${chip('lesson.sentences', info.sentencesDone, Boolean(info.sentences && !info.sentences.completedAt), info.sentences ? `${sentenceSessionProgress(info.sentences).done}/${info.sentences.items.length}` : '')}
    ${chip('lesson.test', info.testDone, Boolean(info.daily && !info.daily.completedAt), info.daily?.completedAt ? `${testSummary(info.daily).accuracy} %` : '')}
  </div>`;
}

function upcomingCard(plan, index) {
  const open = currentLesson(state);
  const first = index === 0 && !open;
  const words = plan.ids.map((id) => vocabById.get(id).english);
  const badge = first ? t('lessons.next') : open && plan.number === open.number + 1 ? t('path.afterCurrent', { n: open.number }) : t('upcoming.after', { n: plan.number - 1 });
  return `<a class="card lesson-card is-upcoming" href="#/preview/${plan.number}">
      <span class="lesson-num">${first ? plan.number : icon('lock', 16)}</span>
      <span class="lesson-body">
        <span class="lesson-title">${esc(t('path.lesson', { n: plan.number }))} <span class="muted small">· ${esc(badge)}</span></span>
        ${plan.themes?.length ? `<span class="lesson-theme">${esc(themeText(plan.themes))}</span>` : ''}
        <span class="lesson-words" lang="${TL}">${esc(words.slice(0, 5).join(' · '))}${words.length > 5 ? ' …' : ''}</span>
        <span class="chips"><span class="chip">${esc(wordCount(plan.ids.length))}</span><span class="chip">${icon('eye', 12)}${esc(t('upcoming.peek'))}</span></span>
      </span>
    </a>`;
}

function viewLessons() {
  const learned = computeStats(state, today()).totalVocabulary;
  const ahead = learnAheadTarget();
  // Sentences or the test of the newest lesson still open? That step comes first, learning ahead second.
  const latest = currentLesson(state) ?? lastCompletedLesson(state);
  const openStep = latest ? lessonNextStep(latest) : null;
  const featured = openStep ?? ahead;
  const tab = ui.lessonsTab;
  const upcoming = upcomingLessons(VOCABULARY, state, ui.upcomingCount + 1);
  const shown = upcoming.slice(0, ui.upcomingCount);
  const cards = [...state.lessons]
    .reverse()
    .map((lesson) => {
      const info = lessonInfo(lesson);
      const words = lesson.items.slice(0, 4).map((i) => vocabById.get(i.vocabId).english).join(' · ');
      return `<a class="card lesson-card ${info.complete ? 'is-done' : 'is-current'}" href="#/lesson/${lesson.id}">
          <span class="lesson-num">${info.complete ? icon('check', 18) : lesson.number}</span>
          <span class="lesson-body">
            <span class="lesson-title">${esc(t('path.lesson', { n: lesson.number }))} <span class="muted small">· ${esc(fmtDay(lesson.createdDay))} · ${esc(wordCount(lesson.items.length))}${lesson.topic ? ` · ${esc(topicLabel(lesson.topic))}` : ''}</span></span>
            ${lesson.themes?.length ? `<span class="lesson-theme">${esc(themeText(lesson.themes))}</span>` : ''}
            <span class="lesson-words" lang="${TL}">${esc(words)}${lesson.items.length > 4 ? ' …' : ''}</span>
            ${stepChips(info)}
          </span>
        </a>`;
    })
    .join('');
  const remaining = VOCABULARY.length - Object.keys(state.progress).length;
  const tabBtn = (key, label) => `<button class="tab" role="tab" data-action="lessons-tab" data-id="${key}" aria-selected="${tab === key}" ${tab === key ? '' : 'tabindex="-1"'}>${esc(label)}</button>`;
  const mine = `<div class="section lesson-list">${cards || `<p class="muted">${esc(t('today.noneText', { n: lessonSize(state) }))}</p>`}</div>`;
  const next = shown.length
    ? `<p class="muted small" style="margin-top:16px">${esc(t('upcoming.lead', { n: lessonSize(state) }))}</p>
       <div class="section lesson-list" style="margin-top:12px">${shown.map(upcomingCard).join('')}</div>
       ${upcoming.length > shown.length ? `<div class="hero-actions" style="justify-content:center"><button class="btn" data-action="more-upcoming">${esc(t('upcoming.more'))}</button></div>` : `<p class="muted small" style="margin-top:16px;text-align:center">${esc(t('upcoming.end', { n: remaining }))}</p>`}`
    : `<p class="muted" style="margin-top:16px">${esc(t('upcoming.none'))}</p>`;
  return `
    <p class="eyebrow">${esc(t('nav.lessons'))}</p>
    ${learnSwitch('words')}
    <h1 class="page-title" tabindex="-1">${esc(t('lessons.title'))}</h1>
    <p class="lead">${esc(t('lessons.lead'))}</p>
    <p class="muted small" style="margin-top:4px">${esc(t(state.lessons.length === 1 ? 'lessons.countOne' : 'lessons.count', { l: state.lessons.length, w: learned, total: VOCABULARY.length }))}</p>
    ${featured ? `<section class="section card next-lesson"><div><p class="eyebrow">${esc(t('lessons.next'))}</p><h2 class="section-title" style="margin:4px 0 2px">${esc(featured.label)}</h2><p class="muted small">${esc(featured.sub)}</p></div><div class="next-lesson-actions">${actionButton(featured)}${openStep && ahead && ahead.label !== openStep.label ? actionButton(ahead, 'btn btn-sm btn-ghost') : ''}</div></section>` : ''}
    <div class="tabs section" role="tablist" aria-label="${esc(t('nav.lessons'))}">${tabBtn('mine', t('lessons.tabMine', { n: state.lessons.length }))}${tabBtn('upcoming', t('lessons.tabUpcoming'))}</div>
    <div role="tabpanel">${tab === 'upcoming' ? next : mine}</div>`;
}

// What a coming lesson will teach – listen to the words already and sort out the ones you know.
function viewPreview(param) {
  const number = Number(param);
  const upcoming = upcomingLessons(VOCABULARY, state, Math.max(1, number - state.lessons.length));
  const plan = upcoming.find((u) => u.number === number);
  const done = state.lessons.find((l) => l.number === number);
  if (done) return viewLesson(done.id);
  if (!plan) return emptyState(t('upcoming.none'), t('upcoming.noneText'), `<a class="btn btn-primary" href="#/lessons">${esc(t('nav.lessons'))}</a>`);
  const open = currentLesson(state);
  const isNext = !open && number === state.lessons.length + 1;
  const knownAhead = Object.values(state.progress).filter((p) => p.status === 'known' && p.via !== 'placement' && !state.lessons.some((l) => l.replacements.some((r) => r.knownId === p.vocabId)));
  const rows = plan.ids
    .map((id) => {
      const v = vocabById.get(id);
      return `<li><div><div class="word" lang="${TL}">${wordDot(v.id)}${esc(v.english)}</div><div class="meaning" lang="${NL}">${esc(v.german)}</div><div class="meaning small">${plan.themes?.length === 1 ? '' : `${esc(TOPIC_OF[v.id] ? topicLabel(TOPIC_OF[v.id]) : CATEGORIES[v.category].label)} · `}${esc(v.cefr)}</div></div>
        <span class="sentence-meta">
          <button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button>
          <button class="btn btn-sm btn-ghost" data-action="preview-known" data-id="${v.id}" aria-label="${esc(t('preview.knowIt'))}: ${esc(v.english)}">${esc(t('preview.knowIt'))}</button>
        </span></li>`;
    })
    .join('');
  const knownRows = knownAhead
    .map((p) => {
      const v = vocabById.get(p.vocabId);
      return `<li><div><div class="word" lang="${TL}">${esc(v.english)}</div><div class="meaning">${esc(v.german)}</div></div><button class="btn btn-sm btn-ghost" data-action="preview-undo" data-id="${v.id}">${esc(t('preview.undo'))}</button></li>`;
    })
    .join('');
  const status = isNext ? t('preview.ready') : open && number === open.number + 1 ? t('preview.afterOpen', { n: open.number }) : t('preview.later', { n: number - 1 });
  return `
    <p class="eyebrow"><a href="#/lessons" class="back-link">${esc(t('nav.lessons'))}</a> · ${esc(t('preview.eyebrow'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('preview.title', { n: number }))}</h1>
    ${plan.themes?.length ? `<p class="lesson-theme lesson-theme-lg">${esc(themeText(plan.themes))}</p>` : ''}
    <p class="lead">${esc(t('preview.lead', { n: plan.ids.length }))}</p>
    <p class="muted small" style="margin-top:6px">${esc(status)}</p>
    <div class="hero-actions">
      ${isNext ? `<button class="btn btn-primary" data-action="start-lesson">${esc(t('act.startLesson', { n: number }))}</button>` : open ? `<a class="btn btn-primary" href="#/learn">${esc(t('act.continueLesson', { n: open.number }))}</a>` : ''}
      ${number > state.lessons.length + 1 ? `<a class="btn" href="#/preview/${number - 1}">${esc(t('preview.prev', { n: number - 1 }))}</a>` : ''}
      <a class="btn" href="#/preview/${number + 1}">${esc(t('preview.next', { n: number + 1 }))}</a>
    </div>
    <section class="section card"><h2 class="section-title">${esc(t('preview.words'))}</h2><p class="muted small">${esc(t('preview.knowHint'))}</p><ul class="list">${rows}</ul></section>
    ${knownRows ? `<section class="section card"><h2 class="section-title">${esc(t('preview.sorted', { n: knownAhead.length }))}</h2><ul class="list">${knownRows}</ul></section>` : ''}`;
}

function starButton(v) {
  const on = isStarred(state, v.id);
  return `<button class="icon-btn star-btn ${on ? 'is-on' : ''}" data-action="star" data-id="${v.id}" aria-pressed="${on}" aria-label="${esc(t(on ? 'star.remove' : 'star.add'))}: ${esc(v.english)}">${icon('star')}</button>`;
}

// The training modes for a pool of words (a lesson, starred, hard or all learned words).
function modeGrid(scope, { sentences = false, title } = {}) {
  const n = poolFor(state, scope, today()).length;
  const audioOk = audioOn() && (usingCloud() || speaker.hasEnglishVoice());
  const scrambleOk = scrambleEligible(VOCABULARY, poolFor(state, scope, today())).length >= 3;
  const puzzleOk = puzzleEligible(VOCABULARY, poolFor(state, scope, today())).length >= 2;
  const mode = (key, iconName, target, enabled, note = '') => {
    const inner = `<span class="mode-icon">${icon(iconName, 22)}</span><span class="mode-text"><span class="mode-name">${esc(t(`train.${key}`))}</span><span class="mode-desc">${esc(note || t(`train.${key}Desc`))}</span></span>`;
    if (!enabled) return `<div class="mode-card is-disabled" aria-disabled="true">${inner}</div>`;
    return target.href ? `<a class="mode-card" href="${target.href}">${inner}</a>` : `<button class="mode-card" data-action="${target.action}" data-id="${esc(scope)}">${inner}</button>`;
  };
  return `
    <section class="section" aria-labelledby="modes-title">
      <div class="section-head"><h2 class="section-title" id="modes-title">${esc(title)}</h2><span class="muted small">${esc(wordCount(n))}</span></div>
      <div class="mode-grid">
        ${mode('cards', 'cards', { action: 'start-word-practice' }, n > 0)}
        ${mode('match', 'match', { href: `#/match/${scope}` }, n > 1, n > 1 ? '' : t('train.needTwo'))}
        ${mode('listen', 'listen', { href: `#/listen/${scope}` }, n > 0 && audioOk, audioOk ? '' : t(audioOn() ? 'train.noAudio' : 'train.audioOff'))}
        ${mode('dictation', 'sentences', { href: `#/dictation/${scope}` }, n > 0 && audioOk, audioOk ? '' : t(audioOn() ? 'train.noAudio' : 'train.audioOff'))}
        ${mode('blitz', 'timer', { href: `#/blitz/${scope}` }, n > 0)}
        ${mode('scramble', 'letters', { href: `#/scramble/${scope}` }, scrambleOk, scrambleOk ? '' : t('train.scrambleNeed'))}
        ${mode('memory', 'memory', { href: `#/memory/${scope}` }, n > 2, n > 2 ? '' : t('train.memoryNeed'))}
        ${mode('puzzle', 'sentences', { href: `#/puzzle/${scope}` }, puzzleOk, puzzleOk ? '' : t('train.puzzleNeed'))}
        ${sentences ? mode('sentences', 'sentences', { action: 'start-lesson-sentence-practice' }, true, t('train.sentencesLesson')) : ''}
      </div>
    </section>`;
}

function viewLesson(id) {
  const lesson = state.lessons.find((l) => l.id === id);
  if (!lesson) {
    return emptyState(t('today.none'), t('today.noneText', { n: lessonSize(state) }), `<button class="btn btn-primary" data-action="start-lesson">${esc(t('act.startLesson', { n: state.lessons.length + 1 }))}</button>`);
  }
  const info = lessonInfo(lesson);
  const next = lessonNextStep(lesson);
  const sp = state.sentenceProgress ?? {};
  const canPracticeWords = practiceWordIds(state, lesson.id).length > 0;
  const canPracticeSentences = lesson.items.some((i) => sp[i.vocabId]?.firstLearnedDay);
  const isLast = state.lessons.at(-1)?.id === lesson.id;
  const ahead = isLast ? learnAheadTarget() : null;

  const statusPill = (item) => {
    const p = state.progress[item.vocabId];
    if (item.status !== 'remembered') return `<span class="pill">${esc(t('today.open'))}</span>`;
    return `<span class="pill good">${esc(t(STATUS_KEY[p?.status] ?? 'prog.sLearning'))}</span>`;
  };
  const items = lesson.items
    .map((item) => {
      const v = vocabById.get(item.vocabId);
      return `<li><div><div class="word" lang="${TL}">${wordDot(v.id)}${esc(v.english)}</div><div class="meaning">${esc(v.german)} · ${esc(CATEGORIES[v.category].label)}</div></div>
        <span class="sentence-meta">${statusPill(item)}${item.status === 'remembered' ? starButton(v) : ''}<button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button></span></li>`;
    })
    .join('');
  const known = lesson.replacements
    .map((r) => {
      const v = vocabById.get(r.knownId);
      return `<li><div><div class="word" lang="${TL}">${esc(v.english)}</div><div class="meaning">${esc(v.german)}</div></div><span class="pill">${esc(t('today.alreadyKnown'))}</span></li>`;
    })
    .join('');

  const actions = [
    next ? actionButton(next) : '',
    info.daily?.completedAt ? `<a class="btn btn-ghost" href="#/result/${info.daily.id}">${esc(t('today.viewTest'))}</a>` : '',
    ahead ? actionButton(ahead, next ? 'btn' : 'btn btn-primary') : '',
  ].join('');

  return `
    <p class="eyebrow"><a href="#/lessons" class="back-link">${esc(t('nav.lessons'))}</a> · ${esc(fmtDay(lesson.createdDay))}${lesson.topic ? ` · <a href="#/topic/${lesson.topic}">${esc(topicLabel(lesson.topic))}</a>` : ''}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('path.lesson', { n: lesson.number }))}</h1>
    ${lesson.themes?.length ? `<p class="lesson-theme lesson-theme-lg">${esc(themeText(lesson.themes))}</p>` : ''}
    <p class="lead">${esc(info.complete ? t('lesson.leadDone') : !info.wordsDone ? t('today.leadOpen', { d: info.p.done, t: info.p.total }) : t('lesson.leadNext'))}</p>
    ${stepChips(info)}
    ${lesson.notices.map((n) => `<div class="notice" style="margin-top:12px">${esc(n)}</div>`).join('')}
    <div class="hero-actions">${actions}</div>
    ${canPracticeWords ? modeGrid(lesson.id, { sentences: canPracticeSentences, title: t('lesson.practiceTitle') }) : ''}
    <section class="section card"><h2 class="section-title">${esc(t('today.vocab'))}</h2><ul class="list">${items}</ul></section>
    ${known ? `<section class="section card"><h2 class="section-title">${esc(t('today.known'))}</h2><ul class="list">${known}</ul></section>` : ''}`;
}

function viewPractice(id) {
  const session = state.practice?.id === id ? state.practice : null;
  if (!session) return viewTrain();
  if (session.mode === 'type') return viewHardRound(session);
  const p = practiceProgress(session);
  const back = session.lessonId && state.lessons.some((l) => l.id === session.lessonId) ? `#/lesson/${session.lessonId}` : backHref(session.scope);
  if (session.completedAt) {
    return emptyState(t('practice.done'), t('practice.doneText', { t: p.total }), `<a class="btn btn-primary" href="${back}">${esc(t(session.lessonId ? 'practice.back' : session.scope?.startsWith('sit-') ? 'sit.back' : 'train.back'))}</a><a class="btn" href="#/">${esc(t('act.dashboard'))}</a>`);
  }
  const vocabId = session.queue[0];
  const item = session.items.find((i) => i.vocabId === vocabId);
  return studyCard({
    vocab: vocabById.get(vocabId),
    direction: item.direction,
    label: t('practice.label'),
    done: p.done,
    total: p.total,
    showKnown: false,
    token: practiceToken(session),
    kind: 'practice',
    pauseHref: back,
  });
}

/* ---------------- my difficult words ---------------- */

// German first, you type the English answer, then the solution with its example sentence.
// A wrong answer comes back a few cards later; "Meine Antwort war richtig" corrects a strict check.
function viewHardRound(session) {
  const p = practiceProgress(session);
  if (session.completedAt) {
    const first = session.items.filter((i) => i.againCount === 0).length;
    return emptyState(
      t('hard.doneTitle'),
      t('hard.doneText', { f: first, t: session.items.length }),
      `${hardCount() ? `<button class="btn btn-primary" data-action="start-hard-round">${esc(t('hard.again'))}</button>` : ''}<a class="btn" href="#/">${esc(t('act.dashboard'))}</a>`,
    );
  }
  const vocab = vocabById.get(session.queue[0]);
  const token = practiceToken(session);
  const item = session.items.find((i) => i.vocabId === vocab.id);
  const answered = ui.revealed;
  const typed = ui.typed?.id === vocab.id && ui.typed.token === token ? ui.typed : null;
  const right = Boolean(typed && (typed.verdict !== 'wrong' || typed.override));
  const result = !answered
    ? ''
    : typed
      ? `<p class="type-result is-${right ? (typed.verdict === 'almost' ? 'almost' : 'ok') : 'wrong'}" role="status">${
          right
            ? `${icon('check', 16)} ${esc(t(typed.override ? 'hard.overridden' : typed.verdict === 'almost' ? 'type.almost' : 'type.right'))}`
            : `${icon('cross', 16)} ${esc(t(typed.given ? 'type.wrong' : 'type.empty', { a: typed.given }))}`
        }</p>`
      : `<p class="type-result is-wrong" role="status">${icon('cross', 16)} ${esc(t('hard.unknown'))}</p>`;
  const solution = answered
    ? `<span class="card-divider" aria-hidden="true"></span>
       <span class="card-answer" lang="${TL}">${esc(vocab.english)}</span>
       <span class="card-example" lang="${TL}">${esc(vocab.exampleEn)}</span>
       <span class="card-example-de" lang="${NL}">${esc(vocab.exampleDe)}</span>
       ${noteLine(vocab)}
       ${audioButtons(vocab)}`
    : `<span class="card-hint">${esc(t('type.hint', { l: t('test.lang.en') }))}</span>`;
  const form = answered
    ? `<div class="hard-actions">
        <button class="btn btn-primary" id="hard-next" data-action="hard-next" data-id="${vocab.id}" data-token="${esc(token)}">${esc(t(right ? 'hard.next' : 'hard.nextAgain'))}</button>
        ${typed && typed.given && !right ? `<button class="btn btn-ghost" data-action="hard-override">${esc(t('hard.override'))}</button>` : ''}
      </div>`
    : `<form class="type-answer" data-form="type-answer" data-id="${vocab.id}" data-token="${esc(token)}" autocomplete="off">
        <label class="sr-only" for="type-input">${esc(t('type.label', { l: t('test.lang.en') }))}</label>
        <input id="type-input" class="input" name="answer" lang="${TL}" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${esc(t('type.placeholder', { l: t('test.lang.en') }))}" value="${esc(ui.typeDraft ?? '')}">
        <div class="type-actions">
          <button class="btn btn-primary" type="submit">${esc(t('type.check'))}</button>
          <button class="btn" type="button" data-action="hard-unknown">${esc(t('type.dontKnow'))}</button>
        </div>
      </form>`;
  return `
    <div class="study" data-prefetch="${vocab.id}" data-prefetch-fields="english,exampleEn">
      <div class="progress-head"><span>${esc(t('hard.label'))} · ${esc(t('hard.progress', { d: p.done, t: p.total }))}</span><a class="btn btn-ghost btn-sm" href="#/">${esc(t('act.pause'))}</a></div>
      <div class="bar" role="progressbar" aria-label="${esc(t('card.progress'))}" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}"><span style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></span></div>
      <h1 class="sr-only" tabindex="-1">${esc(t('hard.label'))}</h1>
      <div class="flashcard"><div class="flashcard-face hard-face${answered ? ' is-answered' : ''}">
        <span class="card-dir">${dirLabel('de-en')}</span>
        ${item.againCount ? `<span class="card-corner"><span class="pill">${esc(t('hard.again1'))}</span></span>` : ''}
        ${result}
        <span class="card-prompt" lang="${NL}">${esc(vocab.german)}</span>
        ${solution}
      </div></div>
      ${form}
    </div>`;
}

/* ---------------- everyday situations ---------------- */

function situationCard(sit) {
  const learned = sit.words.filter((id) => isLearned(state.progress[id])).length;
  const runs = state.dialogs?.[sit.id]?.runs ?? 0;
  return `<a class="card topic-card situation-card" href="#/situation/${sit.id}">
      <span class="topic-icon" aria-hidden="true">${sit.icon}</span>
      <span class="topic-body">
        <span class="topic-name">${esc(situationTitle(sit))}</span>
        <span class="muted small">${esc(t('sit.cardSub', { l: learned, t: sit.words.length }))}${runs ? ` · ${esc(t('sit.dialogRuns', { n: runs }))}` : ''}</span>
        <span class="topic-bar" aria-hidden="true"><i style="width:${Math.round((learned / sit.words.length) * 100)}%"></i></span>
      </span>
    </a>`;
}

function situationSection(list, titleKey = 'sit.title') {
  if (!hasSituations() || !list.length) return '';
  return `<section class="section"><div class="section-head"><h2 class="section-title">${esc(t(titleKey))}</h2></div>
    <div class="topic-grid">${list.map(situationCard).join('')}</div></section>`;
}

function viewSituation(id) {
  const sit = hasSituations() ? situationById(id) : null;
  if (!sit) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/topics">${esc(t('nav.topics'))}</a>`);
  const words = sit.words.map((wid) => vocabById.get(wid)).filter(Boolean);
  const open = openTopicLesson(state, sit.topic);
  const used = new Set([...state.lessons, ...topicLessonsOf(state)].flatMap((l) => l.items.map((i) => i.vocabId)));
  const fresh = words.filter((v) => !state.progress[v.id] && !used.has(v.id)).length;
  let action;
  if (open) action = `<a class="btn btn-primary" href="#/topic-learn/${sit.topic}">${esc(t('topics.continue', { n: open.number, d: lessonProgress(open).done, t: lessonProgress(open).total }))}</a>`;
  else if (fresh) action = `<button class="btn btn-primary" data-action="start-situation" data-id="${sit.id}">${esc(t('sit.learn', { n: fresh }))}</button>`;
  else action = `<p class="muted small" style="flex-basis:100%">${esc(t('sit.allLearned'))}</p>`;
  const row = (v) => {
    const st = state.progress[v.id];
    const status = isLearned(st) ? `<span class="pill good">${esc(t(STATUS_KEY[st.status] ?? 'prog.sLearning'))}</span>` : used.has(v.id) ? `<span class="pill">${esc(t('sit.inLesson'))}</span>` : '';
    return `<li><div><div class="word" lang="${TL}">${wordDot(v.id)}${esc(v.english)}</div><div class="meaning" lang="${NL}">${esc(v.german)}</div><div class="meaning small" lang="${TL}">${esc(v.exampleEn)}</div><div class="meaning small" lang="${NL}">${esc(v.exampleDe)}</div></div>
      <span class="sentence-meta">${status}<button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button></span></li>`;
  };
  return `
    <p class="eyebrow"><a href="#/topic/${sit.topic}" class="back-link">${esc(topicLabel(sit.topic))}</a></p>
    <h1 class="page-title" tabindex="-1"><span aria-hidden="true">${sit.icon}</span> ${esc(situationTitle(sit))}</h1>
    <p class="lead">${esc(t('sit.lead', { n: words.length }))}</p>
    <div class="hero-actions">${action}<button class="btn" data-action="start-word-practice" data-id="sit-${sit.id}">${icon('cards', 18)} ${esc(t('sit.cards'))}</button><a class="btn" href="#/dialog/${sit.id}">${esc(t('sit.dialog'))}</a></div>
    ${modeGrid(`sit-${sit.id}`, { title: t('sit.howLearn') })}
    <section class="section card"><h2 class="section-title">${esc(t('sit.words', { n: words.length }))}</h2><ul class="list">${words.map(row).join('')}</ul></section>`;
}

// A short dialog: the other person's lines are shown, for your turns you get a task in German.
// You answer in your head or type it (optional), then show one possible answer – never graded.
function viewDialog(id) {
  const sit = hasSituations() ? situationById(id) : null;
  if (!sit) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/topics">${esc(t('nav.topics'))}</a>`);
  const turns = sit.dialog.turns;
  let d = ui.dialog;
  if (!d || d.id !== id) d = ui.dialog = { id, step: 0, answers: {}, recorded: false };
  while (d.step < turns.length && turns[d.step].who === 'them') d.step += 1;
  const speakBtn = (text, i) => (audioOn() ? `<button class="icon-btn" data-action="speak-text" data-text="${esc(text)}" data-id="dl-${sit.id}-${i}" aria-label="${esc(t('audio.listen'))}: ${esc(text)}">${icon('speaker')}</button>` : '');
  const bubble = (turn, i) => {
    if (turn.who === 'them') {
      return `<li class="dialog-turn is-them"><div class="dialog-bubble"><span class="dialog-who">${esc(t('dlg.them'))}</span><span class="dialog-en" lang="en">${esc(turn.en)}</span><span class="dialog-de" lang="de">${esc(turn.de)}</span></div>${speakBtn(turn.en, i)}</li>`;
    }
    const mine = d.answers[i];
    return `<li class="dialog-turn is-you"><div class="dialog-bubble">
        <span class="dialog-task">${esc(turn.task)}</span>
        ${mine ? `<span class="dialog-mine"><span class="dialog-who">${esc(t('dlg.yours'))}</span><span lang="en">${esc(mine)}</span></span>` : ''}
        <span class="dialog-who">${esc(t('dlg.possible'))}</span>
        <span class="dialog-en" lang="en">${esc(turn.en)}</span>
        <span class="dialog-de" lang="de">${esc(turn.de)}</span>
      </div>${speakBtn(turn.en, i)}</li>`;
  };
  const history = turns.slice(0, d.step).map(bubble).join('');
  const done = d.step >= turns.length;
  const current = done
    ? `<section class="card section dialog-done" role="status">
        <h2 class="section-title">${esc(t('dlg.doneTitle'))}</h2>
        <p class="muted small">${esc(t('dlg.doneText'))}</p>
        <div class="hero-actions"><button class="btn btn-primary" data-action="dialog-restart" data-id="${sit.id}">${esc(t('dlg.again'))}</button><a class="btn" href="#/situation/${sit.id}">${esc(situationTitle(sit))}</a></div>
      </section>`
    : `<section class="card section dialog-now">
        <p class="eyebrow">${esc(t('dlg.yourTurn'))}</p>
        <p class="dialog-task-now">${esc(turns[d.step].task)}</p>
        <form data-form="dialog" data-id="${sit.id}" autocomplete="off">
          <label class="small muted" for="dialog-input">${esc(t('dlg.typeOptional'))}</label>
          <textarea id="dialog-input" class="input dialog-input" name="answer" rows="2" lang="en" autocapitalize="sentences" spellcheck="true" placeholder="${esc(t('dlg.placeholder'))}">${esc(ui.dialogDraft ?? '')}</textarea>
          <div class="hero-actions"><button class="btn btn-primary" type="submit">${esc(t('dlg.reveal'))}</button></div>
        </form>
      </section>`;
  return `
    <p class="eyebrow"><a href="#/situation/${sit.id}" class="back-link">${esc(situationTitle(sit))}</a></p>
    <h1 class="page-title" tabindex="-1">${esc(t('dlg.title'))}</h1>
    <p class="lead">${esc(sit.dialog.scene)}</p>
    <p class="muted small" style="margin-top:4px">${esc(t('dlg.note'))}</p>
    <ol class="dialog section" aria-label="${esc(t('dlg.title'))}">${history}</ol>
    ${current}`;
}

/* ---------------- stories ---------------- */

// Short stories to read and listen to (English course): the list, then one story with its three questions.
const hasStories = () => course.id === 'de-en';
const storyTitle = (story) => story.title[prefs.lang] ?? story.title.de;

function viewStories() {
  if (!hasStories()) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/train">${esc(t('nav.train'))}</a>`);
  const cards = STORIES.map((story) => {
    const done = state.stories?.[story.id];
    return `<a class="card lesson-card ${done ? 'is-done' : ''}" href="#/story/${story.id}">
        <span class="lesson-num" aria-hidden="true">${done ? icon('check', 18) : story.icon}</span>
        <span class="lesson-body">
          <span class="lesson-title">${esc(storyTitle(story))}</span>
          <span class="lesson-words" lang="${TL}">${esc(story.title.en)}</span>
          <span class="chips"><span class="chip">${esc(topicLabel(story.topic))}</span>${done ? `<span class="chip">${esc(t('story.best', { c: done.best, t: done.total }))}</span>` : ''}</span>
        </span>
      </a>`;
  }).join('');
  const read = STORIES.filter((story) => state.stories?.[story.id]).length;
  return `
    <p class="eyebrow"><a href="#/train" class="back-link">${esc(t('nav.train'))}</a></p>
    <h1 class="page-title" tabindex="-1">${esc(t('story.title'))}</h1>
    <p class="lead">${esc(t('story.lead'))}</p>
    <p class="muted small" style="margin-top:4px">${esc(t('story.count', { d: read, t: STORIES.length }))}</p>
    <div class="section lesson-list">${cards}</div>`;
}

function viewStory(id) {
  const story = hasStories() ? storyById(id) : null;
  if (!story) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/stories">${esc(t('story.title'))}</a>`);
  let st = ui.story;
  if (!st || st.id !== id) st = ui.story = { id, showDe: false, answers: [], recorded: false };
  const lines = story.lines
    .map(
      (line, i) => `<li class="story-line">
        ${audioOn() ? `<button class="icon-btn" data-action="speak-text" data-text="${esc(line.en)}" data-id="st-${story.id}-${i}" aria-label="${esc(t('audio.listen'))}: ${esc(line.en)}">${icon('speaker')}</button>` : ''}
        <span class="story-text"><span class="story-en" lang="en">${esc(line.en)}</span>${st.showDe ? `<span class="story-de" lang="de">${esc(line.de)}</span>` : ''}</span>
      </li>`,
    )
    .join('');
  const total = story.questions.length;
  const answered = st.answers.length;
  const correct = st.answers.filter((a, i) => a === story.questions[i].answer).length;
  const questions = story.questions
    .slice(0, Math.min(answered + 1, total))
    .map((q, i) => {
      const given = st.answers[i];
      const open = given === undefined;
      const options = q.options
        .map((option, k) => {
          const cls = open ? '' : k === q.answer ? ' is-right' : k === given ? ' is-wrong' : '';
          return `<button class="btn story-option${cls}" data-action="story-answer" data-id="${k}" ${open ? '' : 'disabled'} lang="en">${!open && k === q.answer ? icon('check', 14) : ''}${esc(option)}</button>`;
        })
        .join('');
      return `<li class="story-question"><p class="story-q" lang="en">${i + 1}. ${esc(q.q)}</p><div class="story-options">${options}</div></li>`;
    })
    .join('');
  const done = answered >= total;
  const next = STORIES[STORIES.indexOf(story) + 1];
  const result = done
    ? `<section class="card section" role="status">
        <h2 class="section-title">${esc(t('story.doneTitle', { c: correct, t: total }))}</h2>
        <p class="muted small">${esc(t(correct === total ? 'story.doneAll' : 'story.doneSome'))}</p>
        <div class="hero-actions">${next ? `<a class="btn btn-primary" href="#/story/${next.id}">${esc(t('story.next'))}</a>` : ''}<button class="btn" data-action="story-restart">${esc(t('story.again'))}</button><a class="btn" href="#/stories">${esc(t('story.all'))}</a></div>
      </section>`
    : '';
  return `
    <p class="eyebrow"><a href="#/stories" class="back-link">${esc(t('story.title'))}</a> · ${esc(topicLabel(story.topic))}</p>
    <h1 class="page-title" tabindex="-1" lang="en">${esc(story.title.en)}</h1>
    <p class="lead">${esc(story.title.de)}</p>
    <div class="hero-actions"><button class="btn btn-sm" data-action="story-toggle-de" aria-pressed="${st.showDe}">${esc(t(st.showDe ? 'story.hideDe' : 'story.showDe'))}</button></div>
    <section class="section card"><ol class="story-lines">${lines}</ol></section>
    <section class="section card"><h2 class="section-title">${esc(t('story.questions'))}</h2><ol class="story-questions">${questions}</ol></section>
    ${result}`;
}

/* ---------------- music: learning with your own songs ---------------- */

const hasMusic = () => course.id === 'de-en';
const songWordLabel = (w) => (w.vocabId ? vocabById.get(w.vocabId)?.english ?? w.en : w.en);

// The cover of a song: the original from the catalogue, your own picture, or the initials on a golden tile.
function songCover(song, cls = '') {
  const initials = (song.title || '?').split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
  const art = song.artwork ? `<img src="${esc(song.artwork)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<span class="song-cover ${cls}" aria-hidden="true"><span class="song-cover-initials">${esc(initials)}</span>${art}</span>`;
}

function viewMusic() {
  if (!hasMusic()) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/train">${esc(t('nav.train'))}</a>`);
  const songs = songsOf(state);
  const cards = [...songs]
    .reverse()
    .map((song) => {
      const st = songStats(song);
      return `<a class="card song-card" href="#/song/${song.id}">
        ${songCover(song)}
        <span class="song-card-body">
          <span class="song-card-title">${esc(song.title)}</span>
          <span class="muted small">${esc(song.artist)}</span>
          <span class="chips">${st.wordTotal ? `<span class="chip">${esc(t('music.wordsChip', { n: st.wordTotal }))}</span><span class="chip">${esc(t('music.knownChip', { d: st.words, t: st.wordTotal }))}</span>` : `<span class="chip is-active">${esc(t('music.needLyrics'))}</span>`}${song.preset ? `<span class="chip">${esc(t('music.prepared'))}</span>` : ''}</span>
        </span>
      </a>`;
    })
    .join('');
  return `
    <p class="eyebrow"><a href="#/train" class="back-link">${esc(t('nav.train'))}</a></p>
    <h1 class="page-title" tabindex="-1">${esc(t('music.title'))}</h1>
    <p class="lead">${esc(t('music.lead'))}</p>
    <div class="hero-actions"><a class="btn btn-primary" href="#/song-add">${esc(t('music.add'))}</a></div>
    ${songs.length
      ? `<div class="section song-list">${cards}</div>`
      : `<section class="section card music-empty">
          <h2 class="section-title">${esc(t('music.howTitle'))}</h2>
          <ol class="music-steps"><li>${esc(t('music.how1'))}</li><li>${esc(t('music.how2'))}</li><li>${esc(t('music.how3'))}</li></ol>
        </section>`}`;
}

function songAddState() {
  if (!ui.songAdd) ui.songAdd = { query: '', results: null, searching: false, error: null, pick: null, manual: false, lyrics: '', busy: false, title: '', artist: '', artwork: '' };
  return ui.songAdd;
}

function viewSongAdd() {
  if (!hasMusic()) return viewMusic();
  const a = songAddState();
  const results = a.results
    ? a.results.length
      ? `<ul class="song-results" aria-label="${esc(t('music.results'))}">${a.results
          .map(
            (r, i) => `<li><button class="song-result" data-action="song-pick" data-id="${i}">
              <span class="song-cover is-small" aria-hidden="true"><span class="song-cover-initials">♪</span>${r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
              <span class="song-result-text"><span class="song-result-title">${esc(r.title)}</span><span class="muted small">${esc(r.artist)}${r.year ? ` · ${esc(r.year)}` : ''}</span></span>
            </button></li>`,
          )
          .join('')}</ul>`
      : `<p class="muted small">${esc(t('music.noResults'))}</p>`
    : '';
  const chosen = a.pick ?? (a.manual ? { title: a.title, artist: a.artist, artwork: a.artwork } : null);
  const step1 = `
    <section class="section card">
      <h2 class="section-title">${esc(t('music.step1'))}</h2>
      <form class="song-search" data-form="song-search" autocomplete="off">
        <label class="sr-only" for="song-query">${esc(t('music.searchLabel'))}</label>
        <input id="song-query" class="input" name="q" enterkeyhint="search" placeholder="${esc(t('music.searchPlaceholder'))}" value="${esc(a.query)}">
        <button class="btn btn-primary" type="submit" ${a.searching ? 'disabled' : ''}>${esc(t(a.searching ? 'music.searching' : 'music.search'))}</button>
      </form>
      ${a.error === 'search' ? `<p class="notice" role="alert" style="margin-top:10px">${esc(t('music.searchError'))}</p>` : ''}
      ${results}
      <button class="link-btn" data-action="song-manual" style="margin-top:12px">${esc(t('music.manual'))}</button>
    </section>`;
  if (!chosen) return `
    <p class="eyebrow"><a href="#/music" class="back-link">${esc(t('music.title'))}</a></p>
    <h1 class="page-title" tabindex="-1">${esc(t('music.addTitle'))}</h1>
    ${step1}`;
  const manualFields = a.manual
    ? `<div class="field"><label for="song-title">${esc(t('music.fTitle'))}</label><input id="song-title" class="input" data-song-field="title" value="${esc(a.title)}" maxlength="120"></div>
       <div class="field" style="margin-top:10px"><label for="song-artist">${esc(t('music.fArtist'))}</label><input id="song-artist" class="input" data-song-field="artist" value="${esc(a.artist)}" maxlength="120"></div>`
    : '';
  return `
    <p class="eyebrow"><a href="#/music" class="back-link">${esc(t('music.title'))}</a></p>
    <h1 class="page-title" tabindex="-1">${esc(t('music.addTitle'))}</h1>
    <section class="section card song-chosen">
      ${songCover(chosen, 'is-medium')}
      <div class="song-chosen-text">
        <p class="song-card-title">${esc(chosen.title || t('music.untitled'))}</p>
        <p class="muted small">${esc(chosen.artist)}</p>
        <div class="hero-actions">
          <label class="btn btn-sm" for="song-cover-file">${esc(t(chosen.artwork ? 'music.coverChange' : 'music.coverOwn'))}</label>
          <input class="sr-only" id="song-cover-file" type="file" accept="image/*" data-action="song-cover-file">
          <button class="btn btn-sm btn-ghost" data-action="song-unpick">${esc(t('music.otherSong'))}</button>
        </div>
      </div>
    </section>
    ${manualFields ? `<section class="section card">${manualFields}</section>` : ''}
    <section class="section card">
      <h2 class="section-title">${esc(t('music.step2'))}</h2>
      <p class="muted small">${esc(t('music.lyricsHint'))}</p>
      <form data-form="song-create">
        <label class="sr-only" for="song-lyrics">${esc(t('music.lyricsLabel'))}</label>
        <textarea id="song-lyrics" class="input song-lyrics-input" rows="10" lang="en" placeholder="${esc(t('music.lyricsPlaceholder'))}" spellcheck="false">${esc(a.lyrics)}</textarea>
        ${a.error === 'few' ? `<p class="notice" role="alert" style="margin-top:10px">${esc(t('music.tooFew'))}</p>` : ''}
        ${a.error === 'title' ? `<p class="notice" role="alert" style="margin-top:10px">${esc(t('music.needTitle'))}</p>` : ''}
        <div class="hero-actions"><button class="btn btn-primary" type="submit" ${a.busy ? 'disabled' : ''}>${esc(t(a.busy ? 'music.working' : 'music.create'))}</button></div>
        <p class="muted small field-note">${esc(t('music.privacy'))}</p>
      </form>
    </section>`;
}

async function createSong(lyrics) {
  const a = songAddState();
  const chosen = a.pick ?? { title: a.title, artist: a.artist, artwork: a.artwork };
  if (!String(chosen.title ?? '').trim()) {
    a.error = 'title';
    render();
    return;
  }
  const analysis = analyzeSong(lyrics, VOCABULARY);
  if (analysis.words.length < 5) {
    a.error = 'few';
    render();
    return;
  }
  a.busy = true;
  a.error = null;
  render();
  const { words, lines } = await songCards(analysis);
  const { state: next, id } = addSong(state, { meta: chosen, lyrics, words, lines }, now());
  ui.songAdd = null;
  commit(next);
  go(`song/${id}`);
}

// The cards of a song: German meanings from the vocabulary, the rest translated.
async function songCards(analysis) {
  const words = analysis.words.map((w) => ({ ...w, en: songWordLabel(w), de: w.vocabId ? vocabById.get(w.vocabId)?.german ?? '' : '' }));
  const lines = analysis.lines.map((l) => ({ ...l, de: '' }));
  // Only what is not in the vocabulary is translated: the other words and the lines.
  const missing = words.filter((w) => !w.de);
  const texts = [...missing.map((w) => w.en), ...lines.map((l) => l.en)];
  let translated = texts.map(() => '');
  if (texts.length) {
    try {
      translated = await translateTexts(texts);
    } catch {
      ui.songNotice = 'translate';
    }
  }
  missing.forEach((w, i) => (w.de = translated[i] ?? ''));
  lines.forEach((l, i) => (l.de = translated[missing.length + i] ?? ''));
  return { words, lines };
}

// A song without cards yet (a prepared one): paste the lyrics on its page.
async function fillSong(id, lyrics) {
  const analysis = analyzeSong(lyrics, VOCABULARY);
  if (analysis.words.length < 5) {
    ui.songFill = { id, error: 'few', lyrics };
    render();
    return;
  }
  ui.songFill = { id, busy: true, lyrics };
  render();
  const { words, lines } = await songCards(analysis);
  ui.songFill = null;
  commit(setSongContent(state, id, { lyrics, words, lines }, now()));
}

function songFillForm(song) {
  const f = ui.songFill?.id === song.id ? ui.songFill : {};
  return `<section class="section card">
      <h2 class="section-title">${esc(t('music.fillTitle'))}</h2>
      <p class="muted small">${esc(t('music.fillText'))}</p>
      <form data-form="song-fill" data-id="${song.id}">
        <label class="sr-only" for="song-lyrics">${esc(t('music.lyricsLabel'))}</label>
        <textarea id="song-lyrics" class="input song-lyrics-input" rows="10" lang="en" placeholder="${esc(t('music.lyricsPlaceholder'))}" spellcheck="false">${esc(f.lyrics ?? '')}</textarea>
        ${f.error === 'few' ? `<p class="notice" role="alert" style="margin-top:10px">${esc(t('music.tooFew'))}</p>` : ''}
        <div class="hero-actions"><button class="btn btn-primary" type="submit" ${f.busy ? 'disabled' : ''}>${esc(t(f.busy ? 'music.working' : 'music.create'))}</button></div>
        <p class="muted small field-note">${esc(t('music.privacy'))}</p>
      </form>
    </section>`;
}

function viewSong(id) {
  const song = hasMusic() ? songById(state, id) : null;
  if (!song) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/music">${esc(t('music.title'))}</a>`);
  const st = songStats(song);
  const learnable = songLessonCandidates(state, song).length;
  const open = openSongLesson(state, id);
  const inVocab = song.words.filter((w) => w.vocabId).length;
  const learned = songLearnedCount(state, song);
  const editing = ui.songEdit?.id === id ? ui.songEdit : null;
  const editForm = (kind, key, value) => `<form class="song-edit" data-form="song-meaning" data-id="${id}" data-kind="${kind}" data-key="${esc(key)}" autocomplete="off">
      <label class="sr-only" for="song-edit-input">${esc(t('music.meaning'))}</label>
      <input id="song-edit-input" class="input" name="de" lang="de" value="${esc(value)}" maxlength="${kind === 'w' ? 120 : 300}">
      <button class="btn btn-primary btn-sm" type="submit">${esc(t('memo.save'))}</button>
      <button class="btn btn-sm" type="button" data-action="song-edit-cancel">${esc(t('memo.cancel'))}</button>
    </form>`;
  const known = song.known ?? {};
  const wordRows = song.words
    .map((w) => {
      const learnedWord = w.vocabId && isLearned(state.progress[w.vocabId]);
      const tag = learnedWord ? `<span class="pill good">${esc(t('music.tagLearned'))}</span>` : w.vocabId ? `<span class="pill">${esc(t('music.tagVocab'))}</span>` : '';
      const isEdit = editing?.kind === 'w' && editing.key === w.key;
      return `<li class="song-word${known[`w:${w.key}`] ? ' is-known' : ''}">
        <div class="song-word-text">
          <span class="word" lang="en">${esc(w.en)}</span>
          ${isEdit ? editForm('w', w.key, w.de) : `<span class="meaning" lang="de">${w.de ? esc(w.de) : `<em class="muted">${esc(t('music.noMeaning'))}</em>`}</span>`}
        </div>
        <span class="song-word-meta"><span class="muted small" title="${esc(t('music.countHint'))}">${w.count}×</span>${tag}
          ${isEdit ? '' : `<button class="icon-btn" data-action="song-edit" data-id="${id}" data-kind="w" data-key="${esc(w.key)}" aria-label="${esc(t('music.editMeaning', { w: w.en }))}">✎</button>`}
          <button class="icon-btn" data-action="song-word-remove" data-id="${id}" data-key="${esc(w.key)}" aria-label="${esc(t('music.removeWord', { w: w.en }))}">${icon('cross', 16)}</button>
        </span>
      </li>`;
    })
    .join('');
  const lineRows = song.lines
    .map((l, i) => {
      const isEdit = editing?.kind === 'l' && editing.key === String(i);
      return `<li class="story-line">
        ${audioOn() ? `<button class="icon-btn" ${song.preset ? `data-action="speak-text" data-id="${songLineAudioId(id, i)}"` : 'data-action="speak-device"'} data-text="${esc(l.en)}" aria-label="${esc(t('audio.listen'))}: ${esc(l.en)}">${icon('speaker')}</button>` : ''}
        <span class="story-text"><span class="story-en" lang="en">${esc(l.en)}</span>
          ${isEdit ? editForm('l', String(i), l.de) : `<span class="story-de" lang="de">${l.de ? esc(l.de) : esc(t('music.noMeaning'))} <button class="link-btn" data-action="song-edit" data-id="${id}" data-kind="l" data-key="${i}">${esc(t('music.edit'))}</button></span>`}
        </span>
      </li>`;
    })
    .join('');
  const links = [
    song.link ? `<a class="btn btn-sm" href="${esc(song.link)}" target="_blank" rel="noopener">${esc(t('music.openApple'))}</a>` : '',
    `<a class="btn btn-sm" href="https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}" target="_blank" rel="noopener">${esc(t('music.openSpotify'))}</a>`,
  ].join('');
  const learnBtn = open
    ? `<a class="btn" href="#/song-learn/${id}">${esc(t('music.srsContinue', { d: lessonProgress(open).done, t: lessonProgress(open).total }))}</a>`
    : learnable
      ? `<button class="btn" data-action="song-srs" data-id="${id}">${esc(t('music.srsStart', { n: learnable }))}</button>`
      : '';
  return `
    <p class="eyebrow"><a href="#/music" class="back-link">${esc(t('music.title'))}</a></p>
    <section class="song-hero">
      ${songCover(song, 'is-large')}
      <div class="song-hero-text">
        <h1 class="page-title" tabindex="-1">${esc(song.title)}</h1>
        <p class="song-hero-artist">${esc(song.artist)}</p>
        ${song.album ? `<p class="muted small">${esc(song.album)}</p>` : ''}
        ${song.preview ? `<audio class="song-preview" controls preload="none" src="${esc(song.preview)}" aria-label="${esc(t('music.preview'))}"></audio>` : ''}
        <div class="hero-actions">${links}</div>
      </div>
    </section>
    ${ui.songNotice === 'translate' ? `<p class="notice" role="status">${esc(t('music.translateFailed'))}</p>` : ''}
    ${song.themed ? `<p class="notice" role="note">${esc(t('music.themedNote'))}</p>` : ''}
    ${song.words.length ? '' : songFillForm(song)}
    ${song.words.length ? `<section class="section card">
      <h2 class="section-title">${esc(t('music.learnTitle'))}</h2>
      <div class="song-modes">
        ${songModeButton(song, 'words', '🃏', t('music.modeWords', { n: song.words.length }), t('music.modeWordsSub', { d: st.words, t: st.wordTotal }))}
        ${song.lines.length ? songModeButton(song, 'lines', '🎤', t('music.modeLines', { n: song.lines.length }), t('music.modeLinesSub', { d: st.lines, t: st.lineTotal })) : ''}
        ${songQuiz(song).length >= 3 ? songModeButton(song, 'quiz', '🧩', t('music.modeQuiz'), song.quizBest ? t('music.quizBest', { p: song.quizBest }) : t('music.modeQuizSub')) : ''}
      </div>
      ${inVocab ? `<p class="muted small field-note">${esc(t(song.themed ? 'music.srsNoteThemed' : 'music.srsNote', { n: inVocab, l: learned }))}</p><div class="hero-actions">${learnBtn}</div>` : ''}
    </section>
    <section class="section card">
      <h2 class="section-title">${esc(t(song.themed ? 'music.wordsTitleThemed' : 'music.wordsTitle', { n: song.words.length }))}</h2>
      <ul class="list song-words">${wordRows}</ul>
    </section>` : ''}
    ${song.lines.length ? `<section class="section card"><h2 class="section-title">${esc(t(song.themed ? 'music.linesTitleThemed' : 'music.linesTitle', { n: song.lines.length }))}</h2><ol class="story-lines">${lineRows}</ol></section>` : ''}
    ${song.lyrics ? `<details class="section card song-lyrics">
      <summary>${esc(t('music.lyrics'))}</summary>
      <pre class="song-lyrics-text" lang="en">${esc(song.lyrics)}</pre>
    </details>` : ''}
    <section class="section song-manage">
      <label class="btn btn-sm" for="song-cover-edit">${esc(t('music.coverChange'))}</label>
      <input class="sr-only" id="song-cover-edit" type="file" accept="image/*" data-action="song-cover-edit" data-id="${id}">
      <button class="btn btn-sm btn-ghost" data-action="song-delete" data-id="${id}">${esc(t('music.delete'))}</button>
    </section>`;
}

// A way to learn the song; with a saved round: "Weiter bei n von m" and "Neu beginnen".
function songModeButton(song, mode, emoji, title, sub) {
  const saved = savedSongRun(song, mode);
  const pos = saved ? (mode === 'quiz' ? { d: saved.index + 1, t: saved.quiz.length } : { d: Object.keys(saved.results ?? {}).length + 1, t: saved.total }) : null;
  return `<div class="song-mode-wrap">
      <button class="song-mode${saved ? ' is-running' : ''}" data-action="song-run" data-id="${song.id}" data-mode="${mode}">
        <span class="song-mode-icon" aria-hidden="true">${emoji}</span>
        <span class="song-mode-text"><span class="song-mode-title">${esc(title)}</span><span class="muted small">${esc(saved ? t('music.resume', { d: Math.min(pos.d, pos.t), t: pos.t }) : sub)}</span></span>
      </button>
      ${saved ? `<button class="link-btn song-mode-restart" data-action="song-run-new" data-id="${song.id}" data-mode="${mode}">${esc(t('music.restart'))}</button>` : ''}
    </div>`;
}

// A round of song cards (words or lines) or the gap-fill quiz. It is saved after every card (song.runs), so leaving
// and coming back – or another device – goes on where you stopped; "Neu beginnen" starts it again.
function startSongRun(id, mode, fresh = false) {
  const song = songById(state, id);
  if (!song) return;
  const saved = fresh ? null : savedSongRun(song, mode);
  if (saved) {
    ui.songRun = { ...saved, id, mode, recorded: false };
  } else {
    const seed = String(now().getTime());
    if (mode === 'quiz') {
      ui.songRun = { id, mode, quiz: songQuiz(song, seed), index: 0, answers: [], recorded: false };
    } else {
      const cards = mode === 'words' ? song.words.map((w) => `w:${w.key}`) : song.lines.map((_, i) => `l:${i}`);
      // Cards you did not know yet come first.
      const order = shuffle(cards, seed).sort((x, y) => Number(Boolean(song.known?.[x])) - Number(Boolean(song.known?.[y])));
      ui.songRun = { id, mode, queue: order, total: order.length, results: {}, recorded: false };
    }
    persistSongRun();
  }
  ui.flipped = false;
  ui.revealed = false;
  go(`song-cards/${id}`);
}

// Saves the round as it is now (or clears it when it is done).
function persistSongRun(extra = (s) => s) {
  const run = ui.songRun;
  if (!run) return false;
  const done = run.mode === 'quiz' ? run.index >= run.quiz.length : !run.queue.length;
  const { id, mode, recorded, ...data } = run;
  return commit(extra(saveSongRun(state, id, mode, done ? null : data, now())));
}

function viewSongCards(id) {
  const song = songById(state, id);
  // After a reload (or on another device): go on with the saved round.
  if (song && (!ui.songRun || ui.songRun.id !== id)) {
    const saved = savedSongRun(song);
    if (saved) ui.songRun = { ...saved, id, recorded: false };
  }
  const run = ui.songRun;
  if (!song || !run || run.id !== id) return viewSong(id);
  const back = `#/song/${id}`;
  if (run.mode === 'quiz') return songQuizView(song, run, back);
  const done = Object.keys(run.results).length;
  if (!run.queue.length) {
    const knew = Object.values(run.results).filter(Boolean).length;
    return `<section class="card empty song-done" role="status">
        ${songCover(song, 'is-medium')}
        <h1 class="page-title" tabindex="-1">${esc(t('music.roundDone'))}</h1>
        <p class="lead" style="margin:0 auto">${esc(t('music.roundScore', { k: knew, t: run.total }))}</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="song-run" data-id="${id}" data-mode="${run.mode}">${esc(t('music.again'))}</button>
          <a class="btn" href="${back}">${esc(t('music.backToSong'))}</a>
        </div>
      </section>`;
  }
  const card = run.queue[0];
  const isWord = card.startsWith('w:');
  const word = isWord ? song.words.find((w) => `w:${w.key}` === card) : null;
  const line = isWord ? null : song.lines[Number(card.slice(2))];
  if (!word && !line) {
    run.queue.shift();
    return viewSongCards(id);
  }
  const en = isWord ? word.en : line.en;
  const de = (isWord ? word.de : line.de) || t('music.noMeaning');
  const vocab = isWord && word.vocabId ? vocabById.get(word.vocabId) : null;
  // The example on the back: the song's sentence with this word, else the vocabulary's own example.
  const songLine = isWord ? song.lines.find((l) => l.keys.includes(word.key)) : null;
  const example = songLine ? { en: songLine.en, de: songLine.de } : vocab ? { en: vocab.exampleEn, de: vocab.exampleDe } : null;
  const gloss = isWord
    ? ''
    : line.keys
        .map((k) => song.words.find((w) => w.key === k))
        .filter(Boolean)
        .map((w) => `<strong lang="${TL}">${esc(w.en)}</strong> = <span lang="${NL}">${esc(w.de || '–')}</span>`)
        .join(' · ');
  const label = t(isWord ? 'music.runWords' : 'music.runLines');
  const textCls = isWord ? '' : ' is-sentence';
  // Listening like on every card: vocabulary words and the prepared songs' words and sentences in the recorded voice;
  // the words and lines of songs you added yourself are read out by the phone's voice.
  const lineIndex = (text) => song.lines.findIndex((l) => l.en === text);
  const recordedId = (text) => {
    if (!song.preset) return null;
    if (isWord && text === en && !word.vocabId) return songWordAudioId(song.id, word.key);
    const i = lineIndex(text);
    return i >= 0 ? songLineAudioId(song.id, i) : null;
  };
  const speakBtn = (text, cls, inner, labelText, field = 'english') => {
    if (vocab && (text === vocab.english || text === vocab.exampleEn)) return `<button class="${cls}" data-action="speak" data-field="${field}" data-id="${vocab.id}" aria-label="${esc(labelText)}">${inner}</button>`;
    const rec = recordedId(text);
    return rec
      ? `<button class="${cls}" data-action="speak-text" data-text="${esc(text)}" data-id="${rec}" aria-label="${esc(labelText)}">${inner}</button>`
      : `<button class="${cls}" data-action="speak-device" data-text="${esc(text)}" aria-label="${esc(labelText)}">${inner}</button>`;
  };
  const sentenceText = isWord ? example?.en : line.en;
  const audioRow = audioOn()
    ? `<div class="audio-row">
        ${isWord ? speakBtn(en, 'btn btn-sm', `${icon('speaker')} ${audioLabel('audio.word')}`, `${t('audio.word')} ${t('audio.listen')}`) : ''}
        ${sentenceText ? speakBtn(sentenceText, 'btn btn-sm', `${icon('speaker')} ${audioLabel('audio.sentence')}`, `${t('audio.sentence')} ${t('audio.listen')}`, 'exampleEn') : ''}
      </div>`
    : `<div class="audio-row"><button class="btn btn-sm btn-ghost speed-btn" data-action="toggle-audio">${esc(t('card.audioOff'))}</button></div>`;
  const details = isWord
    ? example
      ? `<span class="card-divider" aria-hidden="true"></span>
         <span class="card-example-row">
           ${audioOn() ? speakBtn(example.en, 'icon-btn card-example-speak', icon('speaker'), `${t('audio.sentence')}${t('audio.listen')}`, 'exampleEn') : ''}
           <span class="card-example-text">
             <span class="card-example" lang="${TL}">${esc(example.en)}</span>
             ${example.de ? `<span class="card-example-de" lang="${NL}">${esc(example.de)}</span>` : ''}
           </span>
         </span>`
      : ''
    : gloss
      ? `<span class="card-divider" aria-hidden="true"></span><span class="card-example-de">${esc(t('sent.keyWord'))}: ${gloss}</span>`
      : '';
  const front = `
    <button class="flashcard-face" data-action="flip" id="card-front" aria-describedby="flip-hint">
      <span class="card-dir" aria-label="${esc(t('card.dirDeEn'))}">${dirLabel('de-en')}</span>
      <span class="card-prompt${textCls}" lang="${NL}">${esc(de)}</span>
      <span class="sr-only" id="flip-hint">${esc(t(ui.revealed ? 'card.flipAgain' : isWord ? 'card.flipHint' : 'card.flipHintSentence', { l: t('test.lang.en') }))}</span>
    </button>`;
  const backFace = `
    <div class="flashcard-face is-back" id="card-back" tabindex="-1" role="group" aria-label="${esc(t('card.solution'))}" data-action="flip">
      <span class="card-dir">${dirLabel('de-en')}</span>
      <span class="card-de${textCls}" lang="${NL}">${esc(de)}</span>
      <span class="card-divider is-between" aria-hidden="true"></span>
      <span class="card-answer${textCls}" lang="${TL}">${esc(en)}</span>
      ${details}
      ${audioRow}
    </div>`;
  const rateBtn = (rating, cls, labelKey, key, iconName) =>
    `<button class="rate-btn ${cls}" data-action="song-rate" data-rating="${rating}" data-id="${id}"><span class="rate-icon">${icon(iconName, 26)}</span><span class="rate-label">${esc(t(labelKey))}</span> <kbd>${key}</kbd></button>`;
  return `
    <div class="study">
      <div class="progress-head"><span>${esc(label)} ${pad(Math.min(done + 1, run.total))} / ${pad(run.total)}<span class="progress-theme"> · ${esc(song.title)}</span></span><a class="btn btn-ghost btn-sm" href="${back}">${esc(t('act.pause'))}</a></div>
      <div class="bar" role="progressbar" aria-label="${esc(t('card.progress'))}" aria-valuemin="0" aria-valuemax="${run.total}" aria-valuenow="${done}"><span style="width:${run.total ? (done / run.total) * 100 : 0}%"></span></div>
      <h1 class="sr-only" tabindex="-1">${esc(label)} ${esc(t('card.of', { p: done + 1, t: run.total }))}</h1>
      <div class="flashcard">${ui.flipped ? backFace : front}</div>
      ${ui.revealed ? `<div class="rating" role="group" aria-label="${esc(t('card.rating'))}">${rateBtn('again', 'is-again', 'card.again', 1, 'crossCircle')}${rateBtn('remembered', 'is-remembered', 'card.remembered', 2, 'check')}</div>` : ''}
      ${tapZone()}
    </div>`;
}

function rateSongCard(id, rating) {
  const run = ui.songRun;
  if (!run || run.id !== id || !run.queue.length || !ui.revealed || Date.now() < ui.lockUntil) return;
  ui.lockUntil = Date.now() + 350;
  const card = run.queue.shift();
  // The first answer counts; a card you did not know comes back a few cards later in the same round.
  if (!(card in run.results)) run.results[card] = rating === 'remembered';
  if (rating === 'again') run.queue.splice(Math.min(3, run.queue.length), 0, card);
  ui.flipped = false;
  ui.revealed = false;
  if (!run.queue.length && !run.recorded) {
    run.recorded = true;
    persistSongRun((s) => recordSongCards(s, id, run.results, now()));
  } else if (!persistSongRun()) render();
  root.querySelector('#card-front')?.focus({ preventScroll: true });
}

function songQuizView(song, run, back) {
  const total = run.quiz.length;
  if (run.index >= total) {
    const correct = run.answers.filter((a, i) => a === run.quiz[i].answer).length;
    return `<section class="card empty song-done" role="status">
        ${songCover(song, 'is-medium')}
        <h1 class="page-title" tabindex="-1">${esc(t('music.quizDone', { c: correct, t: total }))}</h1>
        <p class="lead" style="margin:0 auto">${esc(t(correct === total ? 'story.doneAll' : 'music.quizSome'))}</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="song-run" data-id="${song.id}" data-mode="quiz">${esc(t('music.again'))}</button>
          <a class="btn" href="${back}">${esc(t('music.backToSong'))}</a>
        </div>
      </section>`;
  }
  const q = run.quiz[run.index];
  const given = run.answers[run.index];
  const answered = given !== undefined;
  const options = q.options
    .map((o) => {
      const cls = !answered ? '' : o === q.answer ? ' is-right' : o === given ? ' is-wrong' : '';
      return `<button class="btn story-option${cls}" data-action="song-quiz-answer" data-id="${song.id}" data-answer="${esc(o)}" ${answered ? 'disabled' : ''} lang="en">${answered && o === q.answer ? icon('check', 14) : ''}${esc(o)}</button>`;
    })
    .join('');
  const line = song.lines[q.line];
  return `
    <div class="study">
      <div class="progress-head"><span>${esc(t('music.modeQuiz'))} ${pad(run.index + 1)} / ${pad(total)}<span class="progress-theme"> · ${esc(song.title)}</span></span><a class="btn btn-ghost btn-sm" href="${back}">${esc(t('act.pause'))}</a></div>
      <div class="bar" role="progressbar" aria-label="${esc(t('card.progress'))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${run.index}"><span style="width:${(run.index / total) * 100}%"></span></div>
      <section class="card section song-quiz">
        <h1 class="sr-only" tabindex="-1">${esc(t('music.modeQuiz'))}</h1>
        <p class="muted small">${esc(t('music.quizAsk'))}</p>
        <p class="song-quiz-line" lang="en">${esc(q.gap).replace('_____', '<span class="song-gap">_____</span>')}</p>
        ${answered && line?.de ? `<p class="story-de" lang="de">${esc(line.de)}</p>` : ''}
        <div class="story-options">${options}</div>
        ${answered ? `<div class="hero-actions"><button class="btn btn-primary" data-action="song-quiz-next" data-id="${song.id}">${esc(t(run.index + 1 >= total ? 'music.quizFinish' : 'music.quizNext'))}</button></div>` : ''}
      </section>
    </div>`;
}

function viewSongLearn(id) {
  const song = songById(state, id);
  if (!song) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/music">${esc(t('music.title'))}</a>`);
  const lesson = openSongLesson(state, id);
  if (!lesson) {
    return emptyState(t('music.srsDone'), t('music.srsDoneText'), `<a class="btn btn-primary" href="#/song/${id}">${esc(t('music.backToSong'))}</a><a class="btn" href="#/review">${esc(t('nav.review'))}</a>`);
  }
  const vocabId = lesson.queue[0];
  const item = lesson.items.find((i) => i.vocabId === vocabId);
  const p = lessonProgress(lesson);
  return studyCard({
    vocab: vocabById.get(vocabId),
    direction: item.direction,
    label: song.title,
    done: p.done,
    total: p.total,
    showKnown: canMarkKnown(lesson, vocabId),
    token: lessonToken(lesson),
    kind: 'song',
    pauseHref: `#/song/${id}`,
  });
}

/* ---------------- flashcards ---------------- */

function audioLabel(key) {
  const word = esc(t(key));
  const listen = `<span class="lt">${esc(t('audio.listen'))}</span>`;
  return `<span>${prefs.lang !== 'de' ? `${listen}${word}` : `${word}${listen}`}</span>`;
}

// The recorded voices that ship with the app (audio/manifest.json) – known before any network answer.
const BUILT_IN_VOICES = [
  { id: 'piper-lessac', name: 'Lessac', gender: 'f', accent: 'US', course: 'de-en' },
  { id: 'piper-ryan', name: 'Ryan', gender: 'm', accent: 'US', course: 'de-en' },
  { id: 'piper-thorsten', name: 'Thorsten', gender: 'm', accent: 'DE', course: 'zh-de' },
  { id: 'piper-ramona', name: 'Ramona', gender: 'f', accent: 'DE', course: 'zh-de' },
  { id: 'piper-kerstin', name: 'Kerstin', gender: 'f', accent: 'DE', course: 'zh-de' },
];

function readSharedInfo() {
  try {
    return JSON.parse(localStorage.getItem(SHARED_INFO_KEY));
  } catch {
    return null;
  }
}

// The voice that is really used: the shared server voice and the own key fall back to the device voice when unavailable.
// "Automatic" (the default) always prefers the natural shared voice, so nobody has to find a setting first.
// The natural recorded voice is always used – it ships with the app, so it never depends on a check that has not
// answered yet. The device voice is only used when somebody picks it on purpose in the settings.
function activeSource() {
  const choice = chosenSource();
  if (choice === 'elevenlabs' && prefs.elevenKey) return 'elevenlabs';
  if (choice === 'device') return 'device';
  return 'shared';
}

// What the user has selected (or what the automatic mode selects for them).
function chosenSource() {
  if (prefs.voiceChoice === 'manual') return prefs.voiceSource;
  if (prefs.elevenKey && prefs.voiceSource === 'elevenlabs') return 'elevenlabs';
  return 'shared';
}

// The recorded voices that speak the language of the current course (the built-in list until the app has read its list).
function sharedVoiceList() {
  const known = (ui.shared?.voices ?? []).filter((v) => !v.course || v.course === course.id);
  return known.length ? known : BUILT_IN_VOICES.filter((v) => v.course === course.id);
}

function sharedVoiceId() {
  const voices = sharedVoiceList();
  return voices.find((v) => v.id === prefs.sharedVoice)?.id ?? voices[0]?.id ?? '';
}

const voiceLabel = (v) => [v.name, v.gender === 'f' ? t('set.voiceFemale') : v.gender === 'm' ? t('set.voiceMale') : '', v.accent].filter(Boolean).join(' · ');

const usingCloud = () => activeSource() !== 'device';

const SPEEDS = [1, 0.8, 0.6];
const SPEED_LABEL = { 1: 'set.normal', 0.8: 'set.slow', 0.6: 'set.verySlow' };
const speedLabel = (rate) => t(SPEED_LABEL[Number(rate)] ?? 'set.slow');

// Master switch: with the voice off the app is completely silent – no buttons, no automatic read-aloud.
const audioOn = () => state.settings.audio !== false;
const autoplayOn = () => state.settings.autoplay !== false;
const autoReadActive = () => audioOn() && autoplayOn();
// Optional: type the answer before turning the card (word cards only).
const typeAnswerOn = () => state.settings.typeAnswer === true;

// Always say which voice is really used – so "robotic" is never a mystery.
function voiceStatusText() {
  if (chosenSource() === 'elevenlabs' && !prefs.elevenKey && activeSource() === 'device') return t('voice.status.noKey');
  // Only people who picked the shared voice themselves are told that it is not reachable.
  if (prefs.voiceChoice === 'manual' && chosenSource() === 'shared' && activeSource() === 'device') return t('voice.status.sharedDown');
  if (usingCloud()) {
    if (ui.voiceError) return t('voice.status.error', { r: t(`audio.reason.${ui.voiceError.reason}`) });
    if (activeSource() === 'shared') return t('voice.status.shared', { v: sharedVoiceList().find((v) => v.id === sharedVoiceId())?.name ?? '' });
    return t('voice.status.eleven', { v: ELEVEN_VOICES.find((v) => v.id === prefs.elevenVoice)?.name ?? 'ElevenLabs' });
  }
  const voice = speaker.currentVoice(state.settings.accent, prefs.deviceVoice);
  return voice ? t('voice.status.device', { v: voice.name }) : '';
}

function audioButtons(vocab, sentenceFirst = false) {
  if (!audioOn()) {
    return `<div class="audio-row"><button class="btn btn-sm btn-ghost speed-btn" data-action="toggle-audio">${esc(t('card.audioOff'))}</button></div>`;
  }
  const available = usingCloud() || speaker.hasEnglishVoice();
  // The card stays clean: the voice in use is only spoken to screen readers, and shown when something is wrong.
  const problem = Boolean(ui.voiceError && usingCloud()) || (chosenSource() === 'elevenlabs' && !prefs.elevenKey && activeSource() === 'device') || (prefs.voiceChoice === 'manual' && chosenSource() === 'shared' && activeSource() === 'device');
  const disabled = available ? '' : 'disabled aria-describedby="no-voice"';
  const wordBtn = `<button class="btn btn-sm" data-action="speak" data-field="english" data-id="${vocab.id}" ${disabled}>${icon('speaker')} ${audioLabel('audio.word')}</button>`;
  const sentenceBtn = `<button class="btn btn-sm" data-action="speak" data-field="exampleEn" data-id="${vocab.id}" ${disabled}>${icon('speaker')} ${audioLabel('audio.sentence')}</button>`;
  return `
    <div class="audio-row">
      ${sentenceFirst ? sentenceBtn + wordBtn : wordBtn + sentenceBtn}
      <span class="voice-status ${problem ? 'is-error' : 'sr-only'}" role="status">${esc(voiceStatusText())}</span>
    </div>
    ${available ? '' : `<p id="no-voice" class="card-hint">${esc(t(speaker.supported ? 'audio.noVoice' : 'audio.unsupported'))}</p>`}`;
}

// A short note only for words with several meanings. (Word type and level are never shown on the card.)
const noteLine = (v) => (v.note ? `<span class="card-note" lang="${NL}">${esc(v.note)}</span>` : '');
// "Nicht verwechseln": the look-alike words with their meaning – only where the word has no note of its own.
const confuseLine = (v) => {
  const others = v.note ? [] : confusablesOf(v.id).map((id) => vocabById.get(id)).filter(Boolean);
  return others.length ? `<span class="card-note card-confuse">${esc(t('confuse.label'))}: ${others.map((o) => `<strong lang="${TL}">${esc(o.english)}</strong> = <span lang="${NL}">${esc(o.german)}</span>`).join(' · ')}</span>` : '';
};
// "Meine Merkhilfe": your own note on the card (tap to change it) and the small button that adds one.
const memoLine = (v) => {
  const memo = memoOf(state, v.id);
  return memo ? `<button class="card-memo" data-action="memo-edit" data-id="${v.id}" aria-label="${esc(t('memo.change'))}: ${esc(memo)}" lang="${NL}">💡 ${esc(memo)}</button>` : '';
};
const memoButton = (v) => `<button class="icon-btn memo-btn ${memoOf(state, v.id) ? 'is-on' : ''}" data-action="memo-edit" data-id="${v.id}" aria-label="${esc(t(memoOf(state, v.id) ? 'memo.change' : 'memo.add'))}: ${esc(v.english)}">${icon('bulb')}</button>`;
// The words you did not know today, as one short typed round (see startHardRound).
const mistakesButton = (cls = 'btn') => {
  const n = Math.min(todayMistakeIds(state, today()).length, HARD_ROUND_MAX);
  return n ? `<button class="${cls}" data-action="start-mistakes-round">${esc(t('mistakes.start', { n }))}</button>` : '';
};

// The empty space under the buttons is one big tap target that only turns the card (like tapping the card itself).
const tapAnywhereOn = () => state.settings.tapAnywhere !== false;
const tapZone = () => (tapAnywhereOn() ? '<div class="tap-zone" data-action="tap-zone" aria-hidden="true"></div>' : '');

function studyCard({ vocab, direction: _saved, label, done, total, showKnown, token, kind, mode = 'word', pauseHref = '#/', theme = null }) {
  const sentence = mode === 'sentence';
  // Always German on the front, English on the back – also for cards saved before (they are rated by yourself).
  const direction = 'de-en';
  const promptLang = direction === 'de-en' ? NL : TL;
  const prompt = sentence ? (direction === 'de-en' ? vocab.exampleDe : vocab.exampleEn) : promptFor(vocab, direction);
  // The solution side always shows German on top and the English you are learning large below it.
  const german = sentence ? vocab.exampleDe : vocab.german;
  const english = sentence ? vocab.exampleEn : vocab.english;
  const textCls = sentence ? ' is-sentence' : '';
  const typing = !sentence && typeAnswerOn();
  const front = `
    <button class="flashcard-face" data-action="flip" id="card-front" aria-describedby="flip-hint">
      <span class="card-dir" aria-label="${esc(t(direction === 'de-en' ? 'card.dirDeEn' : 'card.dirEnDe'))}">${dirLabel(direction)}</span>
      ${sentence || isFamiliar(vocab.id) ? '' : `<span class="card-status">${wordDot(vocab.id)}</span>`}
      <span class="card-prompt${textCls}" lang="${promptLang}">${esc(prompt)}</span>
      <span class="${typing && !ui.revealed ? 'card-hint' : 'sr-only'}" id="flip-hint">${esc(t(ui.revealed ? 'card.flipAgain' : sentence ? 'card.flipHintSentence' : typing ? 'type.hint' : 'card.flipHint', { l: t('test.lang.en') }))}</span>
    </button>`;
  const details = sentence
    ? `<span class="card-divider" aria-hidden="true"></span>
       <span class="card-example-de">${esc(t('sent.keyWord'))}: <strong lang="${TL}">${esc(vocab.english)}</strong> = <span lang="${NL}">${esc(vocab.german)}</span></span>`
    : `<span class="card-divider" aria-hidden="true"></span>
       <span class="card-example-row">
         ${audioOn() ? `<button class="icon-btn card-example-speak" data-action="speak" data-field="exampleEn" data-id="${vocab.id}" aria-label="${esc(t('audio.sentence'))}${esc(t('audio.listen'))}">${icon('speaker')}</button>` : ''}
         <span class="card-example-text">
           <span class="card-example" lang="${TL}">${esc(vocab.exampleEn)}</span>
           <span class="card-example-de" lang="${NL}">${esc(vocab.exampleDe)}</span>
         </span>
       </span>
       ${noteLine(vocab)}${confuseLine(vocab)}${memoLine(vocab)}`;
  // Type the answer first (optional): checked like in the tests, the rating stays yours.
  const typed = ui.typed?.id === vocab.id && ui.typed.token === token ? ui.typed : null;
  const typeForm =
    !sentence && !ui.revealed
      ? typing
        ? `<form class="type-answer" data-form="type-answer" data-id="${vocab.id}" data-token="${esc(token)}" autocomplete="off">
            <label class="sr-only" for="type-input">${esc(t('type.label', { l: t('test.lang.en') }))}</label>
            <input id="type-input" class="input" name="answer" lang="${TL}" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${esc(t('type.placeholder', { l: t('test.lang.en') }))}" value="${esc(ui.typeDraft ?? '')}">
            <div class="type-actions">
              <button class="btn btn-primary" type="submit">${esc(t('type.check'))}</button>
              <button class="btn" type="button" data-action="flip">${esc(t('type.dontKnow'))}</button>
            </div>
            <button class="link-btn type-toggle" type="button" data-action="toggle-type">${esc(t('type.off'))}</button>
          </form>`
        : `<div class="type-switch"><button class="link-btn type-toggle" type="button" data-action="toggle-type">${esc(t('type.on'))}</button></div>`
      : '';
  const typeResult = typed
    ? `<p class="type-result is-${typed.verdict === 'wrong' ? 'wrong' : typed.verdict === 'almost' ? 'almost' : 'ok'}" role="status">${
        typed.verdict === 'wrong'
          ? `${icon('cross', 16)} ${esc(t(typed.given ? 'type.wrong' : 'type.empty', { a: typed.given }))}`
          : `${icon('check', 16)} ${esc(t(typed.verdict === 'almost' ? 'type.almost' : 'type.right'))}`
      }</p>`
    : '';
  const back = `
    <div class="flashcard-face is-back" id="card-back" tabindex="-1" role="group" aria-label="${esc(t('card.solution'))}" data-action="flip">
      <span class="card-dir">${dirLabel(direction)}</span>
      <span class="card-corner">${sentence ? '' : memoButton(vocab)}${starButton(vocab)}</span>
      ${typeResult}
      <span class="card-de${textCls}" lang="${NL}">${esc(german)}</span>
      <span class="card-divider is-between" aria-hidden="true"></span>
      <span class="card-answer${textCls}" lang="${TL}">${esc(english)}</span>
      ${details}
      ${audioButtons(vocab, sentence)}
    </div>`;
  // Three coloured answers under the card: not known (red), known (light), sure – already known (green).
  const rateBtn = (rating, cls, labelKey, key, iconName, hintKey) =>
    `<button class="rate-btn ${cls}" data-action="rate" data-rating="${rating}" data-kind="${kind}" data-token="${esc(token)}" data-id="${vocab.id}"${hintKey ? ` title="${esc(t(hintKey))}" aria-description="${esc(t(hintKey))}"` : ''}><span class="rate-icon">${icon(iconName, 26)}</span><span class="rate-label">${esc(t(labelKey))}</span> <kbd>${key}</kbd></button>`;
  const rating = ui.revealed
    ? `<div class="rating${showKnown ? ' has-three' : ''}" role="group" aria-label="${esc(t('card.rating'))}">
        ${rateBtn('again', 'is-again', 'card.again', 1, 'crossCircle')}
        ${rateBtn('remembered', 'is-remembered', 'card.remembered', 2, 'check')}
        ${showKnown ? rateBtn('known', 'is-known', 'card.known', 3, 'checkCircle', 'card.knownHint') : ''}
      </div>`
    : '';
  const memoForm =
    !sentence && ui.memoEdit === vocab.id
      ? `<form class="type-answer memo-form" data-form="memo" data-id="${vocab.id}" autocomplete="off">
          <label class="memo-label" for="memo-input">${esc(t('memo.title'))} · <span lang="${TL}">${esc(vocab.english)}</span></label>
          <input id="memo-input" class="input" name="memo" lang="${NL}" maxlength="${MEMO_MAX}" enterkeyhint="done" placeholder="${esc(t('memo.placeholder'))}" value="${esc(memoOf(state, vocab.id))}">
          <div class="type-actions">
            <button class="btn btn-primary" type="submit">${esc(t('memo.save'))}</button>
            <button class="btn" type="button" data-action="memo-cancel">${esc(t('memo.cancel'))}</button>
          </div>
        </form>`
      : '';
  return `
    <div class="study" data-prefetch="${vocab.id}" data-prefetch-fields="${sentence ? 'exampleEn,english' : 'english,exampleEn'}">
      <div class="progress-head"><span>${esc(label)} ${pad(Math.min(done + 1, total))} / ${pad(total)}${theme ? `<span class="progress-theme"> · ${esc(themeText([theme]))}</span>` : ''}</span><a class="btn btn-ghost btn-sm" href="${pauseHref}">${esc(t('act.pause'))}</a></div>
      <div class="bar" role="progressbar" aria-label="${esc(t('card.progress'))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>
      <h1 class="sr-only" tabindex="-1">${esc(label)} ${esc(t('card.of', { p: done + 1, t: total }))}</h1>
      <div class="flashcard">${ui.flipped ? back : front}</div>
      ${typeForm}
      ${memoForm || rating}
      ${memoForm ? '' : tapZone()}
    </div>`;
}

function viewLearn() {
  const lesson = currentLesson(state);
  if (!lesson) {
    const last = lastCompletedLesson(state);
    if (!last) return emptyState(t('today.none'), t('today.noneText', { n: lessonSize(state) }), `<button class="btn btn-primary" data-action="start-lesson">${esc(t('act.startLesson', { n: 1 }))}</button>`);
    const daily = dailyTestFor(state, last.id);
    const sentenceSession = sentenceSessionFor(state, last.id);
    // First choice: straight on to the next lesson (new words). Sentences and the daily test stay as choices.
    const more = upcomingLessons(VOCABULARY, state, 1).length > 0;
    const nextBtn = more ? `<button class="btn btn-primary" data-action="start-lesson">${esc(t('cont.start', { n: state.lessons.length + 1 }))}</button>` : '';
    const sentencesBtn = !sentenceSession && last.items.some((i) => i.status === 'remembered') ? `<button class="btn" data-action="start-sentences" data-id="${last.id}">${esc(t('act.practiceSentences'))}</button>` : '';
    const dailyBtn = !daily ? `<button class="btn" data-action="start-daily" data-id="${last.id}">${esc(t('act.takeDaily'))}</button>` : '';
    const buttons = `${nextBtn}${sentencesBtn}${dailyBtn}${mistakesButton()}<a class="btn btn-ghost" href="#/">${esc(t('act.dashboard'))}</a>`;
    return emptyState(t('today.complete'), `${t('learn.completeText', { n: last.number })} ${t('learn.chooseNext')}`, more ? buttons : buttons.replace('class="btn"', 'class="btn btn-primary"'));
  }
  const vocabId = lesson.queue[0];
  const item = lesson.items.find((i) => i.vocabId === vocabId);
  const p = lessonProgress(lesson);
  return studyCard({
    vocab: vocabById.get(vocabId),
    direction: item.direction,
    label: t('card.vocab'),
    done: p.done,
    total: p.total,
    showKnown: canMarkKnown(lesson, vocabId),
    token: lessonToken(lesson),
    kind: 'lesson',
    theme: lesson.themes?.length ? TOPIC_OF[vocabId] : null,
  });
}

function viewReview() {
  const review = state.review;
  if (!review || review.day !== today() || !review.queue.length) {
    const upcoming = Object.values(state.progress)
      .filter((p) => p.nextDueDay && p.status !== 'known')
      .map((p) => p.nextDueDay)
      .sort()[0];
    const doneToday = review && review.day === today() && review.completed > 0;
    const next = upcoming ? ` ${t('review.next', { d: fmtDay(upcoming) })}` : '';
    // Catching up: more words are waiting beyond today's share – one more round on request.
    const waiting = doneToday ? waitingVocabIds(state, today()).length : 0;
    const onward = todayNextButton(waiting ? 'btn' : 'btn btn-primary');
    const more = waiting ? `<button class="btn btn-primary" data-action="review-more">${esc(t('review.more', { n: Math.min(REVIEW_ROUND, waiting) }))}</button>` : '';
    return emptyState(
      t(doneToday ? 'review.complete' : 'review.none'),
      doneToday ? t('review.completeText', { n: review.completed }) + (waiting ? ` ${t('review.waiting', { n: waiting })}` : next) : upcoming ? t('review.noneText') + next : t('review.empty'),
      `${more}${onward}${mistakesButton()}<a class="btn${more || onward ? '' : ' btn-primary'}" href="#/">${esc(t('act.dashboard'))}</a>`,
    );
  }
  // A short pause after every round: what is done, what is left, and a free choice to go on or stop.
  const roundKey = `${review.id}:${review.completed}`;
  if (review.completed > 0 && review.completed % REVIEW_ROUND === 0 && ui.roundAck !== roundKey) {
    return emptyState(
      t('round.title', { n: review.completed / REVIEW_ROUND }),
      t('round.text', { d: review.completed, q: review.queue.length }),
      `<button class="btn btn-primary" data-action="review-continue" data-id="${esc(roundKey)}">${esc(t('round.next', { n: Math.min(REVIEW_ROUND, review.queue.length) }))}</button><a class="btn" href="#/">${esc(t('round.pause'))}</a>`,
    );
  }
  const vocabId = review.queue[0];
  return studyCard({
    vocab: vocabById.get(vocabId),
    direction: reviewDirection(vocabId, review.day),
    label: t('card.review'),
    done: review.completed,
    total: review.total,
    showKnown: false,
    token: reviewToken(review),
    kind: 'review',
  });
}

/* ---------------- sentences ---------------- */

// A red dot marks a new word – never answered right yet. Learned words get no mark.
const isFamiliar = (id) => {
  const p = state.progress[id];
  return Boolean(p && ((p.correctCount ?? 0) >= 1 || p.status === 'known'));
};
const wordDot = (id) => (isFamiliar(id) ? '' : `<span class="word-dot is-new" role="img" lang="${NL}" aria-label="${esc(t('dot.new'))}"></span>`);

const STATUS_KEY = { learning: 'prog.sLearning', reviewing: 'prog.sReviewing', mastered: 'prog.sMastered' };

/* ---------------- grammar ---------------- */

const grammarScore = (g) => state.grammar?.[g.id] ?? null;

// Grammar from easy to harder: A1 first, then A2, then B1 (the order inside a level stays as written).
const LEVEL_RANK = { A1: 0, A2: 1, B1: 2, B2: 3 };
const GRAMMAR_ORDER = [...GRAMMAR].sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9));
const nextGrammar = (g) => GRAMMAR_ORDER[GRAMMAR_ORDER.indexOf(g) + 1];

function viewGrammar() {
  if (!hasGrammar()) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/">${esc(t('act.dashboard'))}</a>`);
  const done = GRAMMAR.filter(grammarScore).length;
  const card = (g) => {
    const sc = grammarScore(g);
    const pct = sc ? Math.round((sc.best / sc.total) * 100) : 0;
    return `<a class="card topic-card" href="#/grammar-topic/${g.id}">
        <span class="topic-icon grammar-level" aria-hidden="true">${esc(g.level)}</span>
        <span class="topic-body">
          <span class="topic-name">${esc(g.title)}</span>
          <span class="muted small">${esc(g.summary)}</span>
          <span class="muted small">${esc(sc ? t('grammar.best', { b: sc.best, t: sc.total }) : t('grammar.notYet'))}</span>
          <span class="topic-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        </span>
      </a>`;
  };
  return `
    ${learnSwitch('grammar')}
    <h1 class="page-title" tabindex="-1">${esc(t('grammar.title'))}</h1>
    <p class="lead">${esc(t('grammar.lead'))}</p>
    <p class="muted small" style="margin-top:4px">${esc(t('grammar.count', { d: done, t: GRAMMAR.length }))}</p>
    <a class="card topic-card grammar-mix section" href="#/grammar-quiz/mix">
      <span class="topic-icon" aria-hidden="true">🎯</span>
      <span class="topic-body"><span class="topic-name">${esc(t('grammar.mixTitle'))}</span><span class="muted small">${esc(t('grammar.mixDesc', { n: GRAMMAR_MIX_SIZE }))}</span></span>
    </a>
    <div class="section topic-grid">${GRAMMAR_ORDER.map(card).join('')}</div>`;
}

const speakTextButton = (text, audioId) => `<button class="icon-btn" data-action="speak-text" data-text="${esc(text)}" data-id="${esc(audioId)}" aria-label="${esc(t('audio.listen'))}: ${esc(text)}">${icon('speaker')}</button>`;

function viewGrammarTopic(id) {
  const g = grammarById(id);
  if (!g || !hasGrammar()) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/grammar">${esc(t('nav.grammar'))}</a>`);
  const sc = grammarScore(g);
  const next = nextGrammar(g);
  return `
    <p class="eyebrow"><a href="#/grammar" class="back-link">${esc(t('nav.grammar'))}</a> · ${esc(g.level)}</p>
    <h1 class="page-title" tabindex="-1">${esc(g.title)}</h1>
    <p class="lead">${esc(g.summary)}</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#/grammar-quiz/${g.id}">${esc(t('grammar.start', { n: g.exercises.length }))}</a>
      ${sc ? `<span class="muted small" style="align-self:center">${esc(t('grammar.best', { b: sc.best, t: sc.total }))}</span>` : ''}
    </div>
    <section class="section card"><h2 class="section-title">${esc(t('grammar.explain'))}</h2><p>${esc(g.explain)}</p></section>
    <section class="section card"><h2 class="section-title">${esc(t('grammar.form'))}</h2><ul class="grammar-form">${g.form.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <h3 class="grammar-sub">${esc(t('grammar.signals'))}</h3><div class="chips">${g.signals.map((x) => `<span class="chip" lang="en">${esc(x)}</span>`).join('')}</div></section>
    <section class="section card"><h2 class="section-title">${esc(t('grammar.examples'))}</h2><ul class="list sentence-list">${g.examples.map(([en, de], i) => `<li><div><div class="word" lang="en">${esc(en)}</div><div class="meaning" lang="de">${esc(de)}</div></div>${speakTextButton(en, `gr-${g.id}-e${i}`)}</li>`).join('')}</ul></section>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#/grammar-quiz/${g.id}">${esc(t('grammar.practise', { x: g.title }))}</a>
      ${next ? `<a class="btn" href="#/grammar-topic/${next.id}">${esc(t('grammar.next', { x: next.title }))}</a>` : ''}
    </div>`;
}

// The quiz: one sentence at a time, choose the form, see right away why. A topic quiz has all exercises of that topic;
// "mix" asks 15 from every topic (weak topics more often); "mistakes" repeats the sentences you just got wrong.
const GRAMMAR_MIX_SIZE = 15;
function grammarMixItems() {
  const weight = (g) => { const sc = grammarScore(g); return sc ? 1 + (1 - sc.best / sc.total) * 3 : 2; };
  const pool = GRAMMAR.flatMap((g) => g.exercises.map((_, n) => ({ item: [g.id, n], w: weight(g) * Math.random() })));
  return pool.sort((x, y) => y.w - x.w).slice(0, GRAMMAR_MIX_SIZE).map((x) => x.item);
}
function grammarQuizItems(id) {
  if (id === 'mix') return grammarMixItems();
  if (id === 'mistakes') return ui.grammarMistakes?.length ? shuffle([...ui.grammarMistakes], `m:${Date.now()}`) : null;
  const g = grammarById(id);
  return g ? shuffle([...g.exercises.keys()], `${id}:${Date.now()}`).map((n) => [id, n]) : null;
}

function viewGrammarQuiz(id) {
  const special = id === 'mix' || id === 'mistakes';
  const topic = special ? null : grammarById(id);
  const backToList = `<a class="btn btn-primary" href="#/grammar">${esc(t('nav.grammar'))}</a>`;
  if ((!special && !topic) || !hasGrammar()) return emptyState(t('msg.notFound'), t('msg.notFoundText'), backToList);
  let q = ui.grammarQuiz;
  if (!q || q.id !== id) {
    const items = grammarQuizItems(id);
    if (!items) return emptyState(t('grammar.noMistakes'), t('grammar.noMistakesText'), backToList);
    q = ui.grammarQuiz = { id, items, index: 0, correct: 0, choice: null, wrong: [] };
  }
  const total = q.items.length;
  if (q.index >= total) {
    const next = topic && nextGrammar(topic);
    const result = t(q.correct === total ? 'grammar.donePerfect' : q.correct >= total * 0.7 ? 'grammar.doneGood' : 'grammar.doneMore');
    const wrongList = q.wrong.length
      ? `<ul class="list sentence-list grammar-review">${q.wrong.map(([gid, n]) => {
        const [sentence, options, answer, why] = grammarById(gid).exercises[n];
        return `<li><div><div class="word" lang="en">${esc(grammarSpoken(sentence, options[answer]))}</div><div class="meaning">${esc(why)}</div></div></li>`;
      }).join('')}</ul>`
      : '';
    return `${emptyState(
      t('grammar.doneTitle', { c: q.correct, t: total }),
      result,
      `${q.wrong.length ? `<button class="btn btn-primary" data-action="grammar-mistakes">${esc(t('grammar.mistakes', { n: q.wrong.length }))}</button>` : ''}
       <button class="btn${q.wrong.length ? '' : ' btn-primary'}" data-action="grammar-again" data-id="${id}">${esc(t(id === 'mix' ? 'grammar.mixAgain' : 'grammar.again'))}</button>
       ${topic ? `<a class="btn" href="#/grammar-topic/${id}">${esc(t('grammar.back'))}</a>` : `<a class="btn" href="#/grammar">${esc(t('nav.grammar'))}</a>`}
       ${next ? `<a class="btn" href="#/grammar-topic/${next.id}">${esc(t('grammar.next', { x: next.title }))}</a>` : ''}`,
    )}${wrongList ? `<section class="section card"><h2 class="section-title">${esc(t('grammar.wrongTitle'))}</h2>${wrongList}</section>` : ''}`;
  }
  const [gid, n] = q.items[q.index];
  const g = grammarById(gid);
  const [sentence, options, answer, why] = g.exercises[n];
  const [before, after] = sentence.split('___');
  const answered = q.choice !== null;
  const shown = answered ? `<strong class="grammar-fill ${q.choice === answer ? 'is-right' : 'is-wrong'}">${esc(options[answer])}</strong>` : '<span class="grammar-gap">_____</span>';
  const opt = (o, k) => {
    const cls = answered ? (k === answer ? ' is-right' : k === q.choice ? ' is-wrong' : '') : '';
    return `<button class="btn grammar-option${cls}" data-action="grammar-pick" data-id="${k}" ${answered ? 'disabled' : ''} lang="en">${esc(o)}</button>`;
  };
  const head = special ? t(id === 'mix' ? 'grammar.mixTitle' : 'grammar.mistakesTitle') : g.title;
  return `
    <div class="progress-head"><span>${esc(head)}</span><span>${q.index + 1} / ${total}</span></div>
    <section class="card grammar-card">
      <p class="eyebrow">${esc(special ? `${g.title} · ${t('grammar.choose')}` : t('grammar.choose'))}</p>
      <h1 class="grammar-sentence" tabindex="-1" lang="en">${esc(before)}${shown}${esc(after ?? '')}</h1>
      <div class="grammar-options">${options.map(opt).join('')}</div>
      ${answered ? `<div class="notice ${q.choice === answer ? 'good' : ''}" role="status" style="margin-top:16px"><strong>${esc(t(q.choice === answer ? 'grammar.right' : 'grammar.wrong'))}</strong> ${esc(why)}</div>
        <div class="hero-actions">${speakTextButton(grammarSpoken(sentence, options[answer]), `gr-${gid}-x${n}`)}<button class="btn btn-primary" data-action="grammar-next" id="grammar-next">${esc(t(q.index + 1 === total ? 'grammar.finish' : 'grammar.continue'))}</button></div>` : ''}
    </section>
    <div class="hero-actions"><a class="btn btn-ghost" href="#/grammar${special ? '' : `-topic/${gid}`}">${esc(t(special ? 'nav.grammar' : 'grammar.pause'))}</a></div>`;
}

/* ---------------- topics ---------------- */

const topicLabel = (id) => t(`topic.${id}`);
// The theme(s) of a lesson, e.g. "🍽️ Essen & Trinken" (themed lessons, see selectThemedWords).
const themeText = (themes) => (themes ?? []).map((id) => `${TOPICS.find((tp) => tp.id === id)?.icon ?? ''} ${topicLabel(id)}`.trim()).join(' · ');

function topicStats(id) {
  const words = VOCABULARY.filter((v) => TOPIC_OF[v.id] === id);
  const learned = words.filter((v) => isLearned(state.progress[v.id])).length;
  const fresh = topicCandidates(VOCABULARY, state, id).length;
  return { words, learned, fresh };
}

function topicCard(topic) {
  const st = topicStats(topic.id);
  const pct = st.words.length ? Math.round((st.learned / st.words.length) * 100) : 0;
  return `<a class="card topic-card" href="#/topic/${topic.id}">
      <span class="topic-icon" aria-hidden="true">${topic.icon}</span>
      <span class="topic-body">
        <span class="topic-name">${esc(topicLabel(topic.id))}</span>
        <span class="muted small">${esc(t('topics.cardSub', { l: st.learned, t: st.words.length }))}</span>
        <span class="topic-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
      </span>
    </a>`;
}

function viewTopics() {
  return `
    <p class="eyebrow">${esc(t('nav.topics'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('topics.title'))}</h1>
    <p class="lead">${esc(t('topics.lead'))}</p>
    ${situationSection(SITUATIONS, 'sit.titleAll')}
    <h2 class="section-title section">${esc(t('topics.allTopics'))}</h2>
    <div class="topic-grid" style="margin-top:12px">${topicsFor(course.id).map(topicCard).join('')}</div>`;
}

// "Wörter lernen | Sätze lernen" at the top of a topic page.
function topicSwitch(id, mode) {
  const btn = (key, label) => `<button class="tab" role="tab" data-action="topic-mode" data-id="${key}" aria-selected="${mode === key}" ${mode === key ? '' : 'tabindex="-1"'}>${esc(label)}</button>`;
  return `<div class="tabs learn-switch" role="tablist" aria-label="${esc(t('learn.switch'))}">${btn('words', t('topics.tabWords'))}${btn('sentences', t('learn.sentences'))}</div>`;
}

// The coming lessons of a topic as a list of foldable cards, ten words or sentences each.
function topicChunks(ids, { first, sentences }) {
  const chunks = [];
  const size = sentences ? SENTENCE_LESSON_MIN : 10;
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks
    .map((chunk, k) => {
      const rows = chunk
        .map((vid) => {
          const v = vocabById.get(vid);
          const main = sentences ? v.exampleEn : v.english;
          const sub = sentences ? v.exampleDe : v.german;
          return `<li><div><div class="word" lang="${TL}">${sentences ? '' : wordDot(v.id)}${esc(main)}</div><div class="meaning" lang="${NL}">${esc(sub)}</div>${sentences ? '' : `<div class="meaning small" lang="${TL}">${esc(v.exampleEn)}</div>`}</div>
            <span class="sentence-meta"><span class="pill">${esc(v.cefr)}</span><button class="icon-btn" data-action="speak" data-field="${sentences ? 'exampleEn' : 'english'}" data-id="${v.id}" aria-label="${esc(t(sentences ? 'sent.listen' : 'audio.listen'))}: ${esc(main)}">${icon('speaker')}</button></span></li>`;
        })
        .join('');
      const peek = chunk.slice(0, 3).map((vid) => (sentences ? vocabById.get(vid).exampleEn : vocabById.get(vid).english)).join(' · ');
      return `<details class="card topic-lesson">
          <summary><span class="lesson-title">${esc(t(sentences ? 'topics.sLesson' : 'topics.wLesson', { n: first + k }))}</span> <span class="muted small">· ${esc(sentences ? sentenceCount(chunk.length) : wordCount(chunk.length))}</span><span class="lesson-words" lang="${TL}">${esc(peek)}${chunk.length > 3 ? ' …' : ''}</span></summary>
          <ul class="list">${rows}</ul>
        </details>`;
    })
    .join('');
}

// Learning a topic lesson: the same cards as a normal lesson, in the topic's own row.
function viewTopicLearn(id) {
  if (!isTopic(id)) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/topics">${esc(t('nav.topics'))}</a>`);
  const lesson = openTopicLesson(state, id);
  if (!lesson) {
    const last = topicLessonsOf(state).filter((l) => l.topic === id).at(-1);
    const more = topicCandidates(VOCABULARY, state, id).length > 0;
    const sit = last?.situation ? situationById(last.situation) : null;
    if (sit && last.completedAt) {
      // A situation's unit is done: its dialog is the natural next step.
      return emptyState(
        t('sit.doneTitle', { x: situationTitle(sit) }),
        t('sit.doneText'),
        `<a class="btn btn-primary" href="#/dialog/${sit.id}">${esc(t('sit.dialog'))}</a><button class="btn" data-action="topic-sentences-now" data-id="${id}">${esc(t('topics.toSentences'))}</button><a class="btn" href="#/situation/${sit.id}">${esc(situationTitle(sit))}</a>`,
      );
    }
    return emptyState(
      last ? t('topics.lessonDone', { n: last.number }) : topicLabel(id),
      last ? t('topics.lessonDoneText', { x: topicLabel(id) }) : t('topics.allLearned'),
      `${more ? `<button class="btn btn-primary" data-action="start-topic-lesson" data-id="${id}">${esc(t('topics.nextLesson'))}</button>` : ''}<button class="btn" data-action="topic-sentences-now" data-id="${id}">${esc(t('topics.toSentences'))}</button><a class="btn" href="#/topic/${id}">${esc(topicLabel(id))}</a>`,
    );
  }
  const vocabId = lesson.queue[0];
  const item = lesson.items.find((i) => i.vocabId === vocabId);
  const p = lessonProgress(lesson);
  return studyCard({
    vocab: vocabById.get(vocabId),
    direction: item.direction,
    label: lesson.situation && situationById(lesson.situation) ? situationTitle(situationById(lesson.situation)) : `${topicLabel(id)} · ${t('topics.wLesson', { n: lesson.number })}`,
    done: p.done,
    total: p.total,
    showKnown: canMarkKnown(lesson, vocabId),
    token: lessonToken(lesson),
    kind: 'topic',
    pauseHref: `#/topic/${id}`,
  });
}

function viewTopic(id) {
  if (!isTopic(id)) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/topics">${esc(t('nav.topics'))}</a>`);
  const topic = TOPICS.find((x) => x.id === id);
  const mode = ui.topicMode === 'sentences' ? 'sentences' : 'words';
  const head = `
    <p class="eyebrow"><a href="#/topics" class="back-link">${esc(t('nav.topics'))}</a></p>
    ${topicSwitch(id, mode)}
    <h1 class="page-title" tabindex="-1"><span aria-hidden="true">${topic.icon}</span> ${esc(topicLabel(id))}</h1>`;
  return head + (mode === 'sentences' ? topicSentencesBody(id) : topicWordsBody(id));
}

function topicWordsBody(id) {
  const st = topicStats(id);
  const size = Math.min(dailyLoad(state, today(), lessonSize(state)).newWords, st.fresh);
  let action;
  // Topic lessons run on their own, next to the main lessons: no need to finish or end another lesson first.
  const topicOpen = openTopicLesson(state, id);
  if (topicOpen) action = `<a class="btn btn-primary" href="#/topic-learn/${id}">${esc(t('topics.continue', { n: topicOpen.number, d: lessonProgress(topicOpen).done, t: lessonProgress(topicOpen).total }))}</a>`;
  else if (!st.fresh) action = `<p class="muted small">${esc(t('topics.allLearned'))}</p>`;
  else if (size <= 0) action = `<p class="muted small">${esc(t('topics.reviewsFirst'))}</p><a class="btn btn-primary" href="#/review">${esc(t('act.startReview'))}</a>`;
  else action = `<button class="btn btn-primary" data-action="start-topic-lesson" data-id="${id}">${esc(t('topics.start', { n: size }))}</button>`;
  const learnedWords = st.words.filter((v) => isLearned(state.progress[v.id]));
  const coming = topicCandidates(VOCABULARY, state, id).map((v) => v.id);
  const doneLessons = [...state.lessons, ...topicLessonsOf(state)].filter((l) => l.topic === id && l.completedAt).length;
  const lessonsLeft = Math.ceil(coming.length / 10);
  const row = (v) => `<li><div><div class="word" lang="${TL}">${wordDot(v.id)}${esc(v.english)}</div><div class="meaning" lang="${NL}">${esc(v.german)}</div><div class="meaning small" lang="${TL}">${esc(v.exampleEn)}</div></div>
      <span class="sentence-meta"><span class="pill good">${esc(t(STATUS_KEY[state.progress[v.id]?.status] ?? 'prog.sLearning'))}</span><button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button></span></li>`;
  return `
    <p class="lead">${esc(t('topics.lead1', { l: st.learned, t: st.words.length }))}</p>
    <p class="muted small" style="margin-top:4px">${esc(t('topics.lessonsLeft', { n: lessonsLeft, d: doneLessons }))}</p>
    <div class="hero-actions">${action}${learnedWords.length && !topicOpen ? `<button class="btn" data-action="start-word-practice" data-id="topic-${id}">${esc(t('topics.quickPractice'))}</button>` : ''}</div>
    ${situationSection(situationsOfTopic(id))}
    ${learnedWords.length ? `<details class="advanced section card more-modes"><summary>${esc(t('topics.moreModes'))}</summary>${modeGrid(`topic-${id}`, { title: t('topics.practice') })}</details>` : ''}
    ${coming.length ? `<section class="section"><div class="section-head"><h2 class="section-title">${esc(t('topics.comingLessons', { n: lessonsLeft }))}</h2></div><p class="muted small" style="margin-bottom:10px">${esc(t('topics.comingHint'))}</p><div class="lesson-list">${topicChunks(coming, { first: doneLessons + 1, sentences: false })}</div></section>` : ''}
    ${learnedWords.length ? `<section class="section card"><h2 class="section-title">${esc(t('topics.learned', { n: learnedWords.length }))}</h2><ul class="list">${learnedWords.map(row).join('')}</ul></section>` : ''}`;
}

function topicSentencesBody(id) {
  const sp = state.sentenceProgress ?? {};
  const words = VOCABULARY.filter((v) => TOPIC_OF[v.id] === id && v.exampleEn);
  const learned = words.filter((v) => isLearned(sp[v.id]));
  const queue = topicSentenceQueue(state, VOCABULARY, id);
  const open = openSentenceSession(state);
  const doneLessons = (state.sentences ?? []).filter((x) => x.type === 'topic' && x.topic === id && x.completedAt).length;
  const lessonsLeft = Math.ceil(queue.length / SENTENCE_LESSON_MIN);
  let action;
  if (open?.type === 'topic' && open.topic === id) action = `<a class="btn btn-primary" href="#/sentence/${open.id}">${esc(t('act.continueSentences'))}</a>`;
  else if (open) action = `<a class="btn btn-primary" href="#/sentence/${open.id}">${esc(t('act.continueSentences'))}</a><p class="muted small" style="flex-basis:100%">${esc(t('topics.sOpenFirst'))}</p>`;
  else if (queue.length) action = `<button class="btn btn-primary" data-action="start-topic-sentences" data-id="${id}">${esc(t('topics.sStart', { n: doneLessons + 1 }))}</button>`;
  else action = `<p class="muted small">${esc(t('topics.sAllLearned'))}</p>`;
  if (learned.length && !open) action += `<button class="btn" data-action="start-topic-sentence-practice" data-id="${id}">${esc(t('topics.sPractice'))}</button>`;
  const row = (v) => `<li><div><div class="word" lang="${TL}">${esc(v.exampleEn)}</div><div class="meaning" lang="${NL}">${esc(v.exampleDe)}</div><div class="meaning small">${esc(t(STATUS_KEY[sp[v.id]?.status] ?? 'prog.sLearning'))} · ${esc(t('words.next', { d: fmtDay(sp[v.id].nextDueDay) }))}</div></div>
      <button class="icon-btn" data-action="speak" data-field="exampleEn" data-id="${v.id}" aria-label="${esc(t('sent.listen'))}: ${esc(v.exampleEn)}">${icon('speaker')}</button></li>`;
  return `
    <p class="lead">${esc(t('topics.sLead', { l: learned.length, t: words.length }))}</p>
    <p class="muted small" style="margin-top:4px">${esc(t('topics.sLessonsLeft', { n: lessonsLeft, d: doneLessons }))}</p>
    <div class="hero-actions">${action}</div>
    ${queue.length ? `<section class="section"><div class="section-head"><h2 class="section-title">${esc(t('topics.sComingLessons', { n: lessonsLeft }))}</h2></div><p class="muted small" style="margin-bottom:10px">${esc(t('topics.sComingHint'))}</p><div class="lesson-list">${topicChunks(queue, { first: doneLessons + 1, sentences: true })}</div></section>` : ''}
    ${learned.length ? `<section class="section card"><h2 class="section-title">${esc(t('topics.sLearned', { n: learned.length }))}</h2><ul class="list sentence-list">${learned.map(row).join('')}</ul></section>` : ''}`;
}

// "Wörter lernen | Sätze lernen | Grammatik" at the top of the pages of the "Lernen" tab.
function learnSwitch(active) {
  const link = (key, href, label) => `<a class="tab" href="${href}" role="tab" aria-selected="${active === key}" ${active === key ? 'aria-current="page"' : ''}>${esc(label)}</a>`;
  return `<nav class="tabs learn-switch" role="tablist" aria-label="${esc(t('learn.switch'))}">${link('words', '#/lessons', t('learn.tabWords'))}${link('sentences', '#/sentences', t('learn.tabSentences'))}${hasGrammar() ? link('grammar', '#/grammar', t('nav.grammar')) : ''}</nav>`;
}

// The sentence lesson of a word lesson: its sentences are those of the words learned in it.
function sentenceLessonInfo(lesson) {
  const session = sentenceSessionFor(state, lesson.id);
  // Once started, the lesson shows exactly the sentences of its session.
  const ids = session ? session.items.map((i) => i.vocabId) : lessonSentenceIds(state, VOCABULARY, lesson);
  const status = !lesson.completedAt ? 'locked' : !ids.length ? 'empty' : !session ? 'ready' : session.completedAt ? 'done' : 'running';
  return { session, ids, status, progress: session ? sentenceSessionProgress(session) : null };
}

function sentenceLessonCard(lesson) {
  const info = sentenceLessonInfo(lesson);
  const cls = info.status === 'done' ? 'is-done' : info.status === 'locked' || info.status === 'empty' ? 'is-upcoming' : 'is-current';
  const num = info.status === 'done' ? icon('check', 18) : info.status === 'locked' ? icon('lock', 15) : lesson.number;
  const preview = info.ids.slice(0, 2).map((id) => vocabById.get(id).exampleEn).join(' · ');
  const chip = {
    locked: `<span class="chip">${esc(t('slesson.locked'))}</span>`,
    empty: `<span class="chip">${esc(t('slesson.empty'))}</span>`,
    ready: `<span class="chip is-active">${esc(t('slesson.ready'))}</span>`,
    running: `<span class="chip is-active">${esc(t('slesson.running', { d: info.progress?.done ?? 0, t: info.progress?.total ?? 0 }))}</span>`,
    done: `<span class="chip is-done">${icon('check', 12)}${esc(t('slesson.done', { t: info.progress?.total ?? 0 }))}</span>`,
  }[info.status];
  return `<a class="card lesson-card ${cls}" href="#/sentence-lesson/${lesson.id}">
      <span class="lesson-num">${num}</span>
      <span class="lesson-body">
        <span class="lesson-title">${esc(t('slesson.title', { n: lesson.number }))} <span class="muted small">· ${esc(sentenceCount(info.ids.length))}</span></span>
        <span class="lesson-words" lang="${TL}">${esc(preview)}${info.ids.length > 2 ? ' …' : ''}</span>
        <span class="chips">${chip}</span>
      </span>
    </a>`;
}

const sentenceCount = (n) => (n === 1 ? t('slesson.count1') : t('slesson.count', { n }));

// The next sentence step: an open session, due reviews, or the oldest sentence lesson not started yet.
function nextSentenceStep() {
  const open = openSentenceSession(state);
  if (open) return { label: t('act.continueSentences'), sub: t('sub.sentencePos', { p: sentenceSessionProgress(open).done + 1, t: open.items.length }), href: `#/sentence/${open.id}` };
  const due = sentenceReviewIds(state, today());
  if (due.length) return { label: t('act.reviewSentences'), sub: t('sub.sentencesDue', { n: due.length }), action: 'start-sentence-review' };
  const ready = state.lessons.find((l) => sentenceLessonInfo(l).status === 'ready');
  if (ready) return { label: t('slesson.start', { n: ready.number }), sub: sentenceCount(sentenceLessonInfo(ready).ids.length), action: 'start-sentences', data: ready.id };
  return null;
}

// The start page in sentence mode: what to do next, the sentence lessons, the categories and the sentence games.
function viewSentenceHome() {
  const learned = learnedSentenceIds(state);
  const next = nextSentenceStep();
  const lessons = [...state.lessons].reverse().slice(0, 3);
  const sp = state.sentenceProgress ?? {};
  const hero = `
    <section class="card hero">
      <p class="eyebrow">${esc(greeting())} · ${esc(longDate())}</p>
      <h1 class="page-title" tabindex="-1">${esc(next ? next.label : state.lessons.length ? t('shome.doneTitle') : t('shome.firstTitle'))}</h1>
      <p class="lead">${esc(next ? next.sub : state.lessons.length ? t('shome.doneLead', { n: learned.length }) : t('shome.firstLead'))}</p>
      <div class="hero-actions">${next ? actionButton(next) : state.lessons.length ? '' : `<button class="btn btn-primary" data-action="home-mode" data-id="words">${esc(t('shome.toWords'))}</button>`}</div>
    </section>`;
  const lessonSection = lessons.length
    ? `<section class="section" aria-labelledby="slessons-title">
        <div class="section-head"><h2 class="section-title" id="slessons-title">${esc(t('slesson.tabLessons', { n: state.lessons.length }))}</h2><a class="section-link" href="#/sentences">${esc(t('path.all'))}</a></div>
        <div class="lesson-list">${lessons.map(sentenceLessonCard).join('')}</div>
      </section>`
    : '';
  const cats = Object.entries(CATEGORIES)
    .map(([key, c]) => {
      const all = VOCABULARY.filter((v) => v.category === key);
      const done = all.filter((v) => sp[v.id]?.firstLearnedDay).length;
      return `<a class="card" href="#/sentence-category/${key}" style="text-decoration:none">
          <p class="metric-label">${esc(c.label)}</p>
          <p class="metric-value">${done}</p>
          <p class="metric-sub">${esc(t('shome.catSub', { t: all.length }))}</p>
        </a>`;
    })
    .join('');
  const open = openSentenceSession(state);
  const due = sentenceReviewIds(state, today()).length;
  const puzzleOk = puzzleEligible(VOCABULARY, poolFor(state, 'all', today())).length >= 2;
  const tile = (key, iconName, attrs, enabled = true) => {
    const inner = `<span class="train-icon">${icon(iconName, 22)}</span><span class="train-name">${esc(t(`shome.${key}`))}</span><span class="train-sub">${esc(t(`shome.${key}Sub`, { n: due }))}</span>`;
    if (!enabled) return `<div class="train-tile is-disabled" aria-disabled="true">${inner}</div>`;
    return attrs.href ? `<a class="train-tile" href="${attrs.href}">${inner}</a>` : `<button class="train-tile" data-action="${attrs.action}">${inner}</button>`;
  };
  const games = `
    <section class="section" aria-labelledby="sgames-title">
      <div class="section-head"><h2 class="section-title" id="sgames-title">${esc(t('shome.practiceTitle'))}</h2></div>
      <div class="train-strip">
        ${tile('review', 'review', { action: 'start-sentence-review' }, due > 0 && !open)}
        ${tile('cards', 'cards', { action: 'start-practice' }, learned.length > 0 && !open)}
        ${tile('puzzle', 'sentences', { href: '#/puzzle/all' }, puzzleOk)}
        ${tile('mine', 'lessons', { href: '#/sentences' })}
      </div>
    </section>`;
  return `
    ${oldAddressNotice()}
    ${hero}
    ${lessonSection}
    <section class="section" aria-labelledby="scats-title">
      <div class="section-head"><h2 class="section-title" id="scats-title">${esc(t('shome.categories'))}</h2></div>
      <div class="grid grid-3">${cats}</div>
    </section>
    ${games}`;
}

// All sentences of one category: the learned ones with their status, the others as a preview of what comes.
function viewSentenceCategory(key) {
  const c = CATEGORIES[key];
  if (!c) return emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/">${esc(t('act.dashboard'))}</a>`);
  const sp = state.sentenceProgress ?? {};
  const all = VOCABULARY.filter((v) => v.category === key);
  const learned = all.filter((v) => sp[v.id]?.firstLearnedDay);
  const rest = all.filter((v) => !sp[v.id]?.firstLearnedDay);
  const row = (v, p) => `<li><div><div class="word" lang="${TL}">${esc(v.exampleEn)}</div><div class="meaning" lang="${NL}">${esc(v.exampleDe)}</div>
      <div class="meaning small">${p ? `${esc(t(STATUS_KEY[p.status] ?? 'prog.sLearning'))} · ${esc(t('words.next', { d: fmtDay(p.nextDueDay) }))}` : `<span lang="${TL}">${esc(v.english)}</span>`}</div></div>
      <button class="icon-btn" data-action="speak" data-field="exampleEn" data-id="${v.id}" aria-label="${esc(t('sent.listen'))}: ${esc(v.exampleEn)}">${icon('speaker')}</button></li>`;
  return `
    <p class="eyebrow"><a href="#/" class="back-link">${esc(t('learn.sentences'))}</a> · ${esc(t('shome.categories'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(c.label)}</h1>
    <p class="lead">${esc(t('shome.catLead', { d: learned.length, t: all.length }))}</p>
    <section class="section card"><h2 class="section-title">${esc(t('shome.catLearned', { n: learned.length }))}</h2>${learned.length ? `<ul class="list sentence-list">${learned.map((v) => row(v, sp[v.id])).join('')}</ul>` : `<p class="muted small">${esc(t('sent.empty'))}</p>`}</section>
    ${rest.length ? `<section class="section card"><h2 class="section-title">${esc(t('shome.catComing', { n: rest.length }))}</h2><p class="muted small">${esc(t('shome.catComingHint'))}</p><ul class="list sentence-list is-preview">${rest.map((v) => row(v, null)).join('')}</ul></section>` : ''}`;
}

function viewSentences() {
  const learned = learnedSentenceIds(state);
  const sp = state.sentenceProgress ?? {};
  const open = openSentenceSession(state);
  const next = nextSentenceStep();
  const tab = ui.sentencesTab;
  const small = (text) => `<p class="muted small">${esc(text)}</p>`;
  const tabBtn = (key, label) => `<button class="tab" role="tab" data-action="sentences-tab" data-id="${key}" aria-selected="${tab === key}" ${tab === key ? '' : 'tabindex="-1"'}>${esc(label)}</button>`;

  const lessonCards = [...state.lessons].reverse().map(sentenceLessonCard).join('');
  const lessonsPanel = `<div class="section lesson-list">${lessonCards || small(t('sent.lockedLesson'))}</div>`;

  const practice = learned.length
    ? `<div class="hero-actions"><button class="btn" data-action="start-practice" ${open ? 'disabled' : ''}>${esc(t('act.practiceAll'))}</button></div>`
    : '';
  const list = learned.length
    ? `<ul class="list sentence-list">${learned
        .map((id) => sp[id])
        .sort((a, b) => b.firstLearnedDay.localeCompare(a.firstLearnedDay) || a.vocabId.localeCompare(b.vocabId))
        .map((p) => {
          const v = vocabById.get(p.vocabId);
          return `<li><div><div class="word" lang="${TL}">${esc(v.exampleEn)}</div><div class="meaning" lang="${NL}">${esc(v.exampleDe)}</div>
              <div class="meaning small">${esc(t(STATUS_KEY[p.status] ?? 'prog.sLearning'))} · ${esc(t('words.next', { d: fmtDay(p.nextDueDay) }))}</div></div>
            <button class="icon-btn" data-action="speak" data-field="exampleEn" data-id="${p.vocabId}" aria-label="${esc(t('sent.listen'))}: ${esc(v.exampleEn)}">${icon('speaker')}</button></li>`;
        })
        .join('')}</ul>`
    : small(t('sent.empty'));
  const minePanel = `<section class="section card">${learned.length ? small(t('sent.practiceInfo', { n: Math.min(10, learned.length) })) : ''}${practice}${list}</section>`;

  return `
    <p class="eyebrow">${esc(t('nav.lessons'))}</p>
    ${learnSwitch('sentences')}
    <h1 class="page-title" tabindex="-1">${esc(t('sent.title'))}</h1>
    <p class="lead">${esc(t('sent.lead'))}</p>
    <p class="muted small" style="margin-top:4px">${esc(t('slesson.summary', { n: learned.length }))}</p>
    ${next ? `<section class="section card next-lesson"><div><p class="eyebrow">${esc(t('lessons.next'))}</p><h2 class="section-title" style="margin:4px 0 2px">${esc(next.label)}</h2><p class="muted small">${esc(next.sub)}</p></div>${actionButton(next)}</section>` : ''}
    <div class="tabs section" role="tablist" aria-label="${esc(t('nav.sentences'))}">${tabBtn('lessons', t('slesson.tabLessons', { n: state.lessons.length }))}${tabBtn('mine', t('sent.mine', { n: learned.length }))}</div>
    <div role="tabpanel">${tab === 'mine' ? minePanel : lessonsPanel}</div>`;
}

// One sentence lesson: all its sentences like a catalogue, with the button to learn them.
function viewSentenceLesson(id) {
  const lesson = state.lessons.find((l) => l.id === id);
  if (!lesson) return emptyState(t('tests.notFound'), t('tests.notFoundText'), `<a class="btn btn-primary" href="#/sentences">${esc(t('nav.sentences'))}</a>`);
  const info = sentenceLessonInfo(lesson);
  const open = openSentenceSession(state);
  const sp = state.sentenceProgress ?? {};
  const busy = open && open.id !== info.session?.id;
  let action = '';
  if (info.status === 'locked') action = `<a class="btn btn-primary" href="${currentLesson(state)?.id === lesson.id ? '#/learn' : `#/lesson/${lesson.id}`}">${esc(t('slesson.wordsFirst', { n: lesson.number }))}</a>`;
  else if (info.status === 'ready') action = `<button class="btn btn-primary" data-action="start-sentences" data-id="${lesson.id}" ${busy ? 'disabled' : ''}>${esc(t('slesson.start', { n: lesson.number }))}</button>`;
  else if (info.status === 'running') action = `<a class="btn btn-primary" href="#/sentence/${info.session.id}">${esc(t('act.continueSentences'))}</a>`;
  else if (info.status === 'done') action = `<button class="btn btn-primary" data-action="start-lesson-sentence-practice" data-id="${lesson.id}" ${busy ? 'disabled' : ''}>${esc(t('slesson.again'))}</button>`;
  const lead = {
    locked: t('slesson.leadLocked', { n: lesson.number }),
    empty: t('slesson.leadEmpty'),
    ready: t('slesson.leadReady', { t: info.ids.length }),
    running: t('slesson.leadRunning', { d: info.progress?.done ?? 0, t: info.progress?.total ?? 0 }),
    done: t('slesson.leadDone', { t: info.ids.length }),
  }[info.status];
  const rows = info.ids
    .map((vid) => {
      const v = vocabById.get(vid);
      const p = sp[vid];
      const pill = p?.firstLearnedDay ? `<span class="pill good">${esc(t(STATUS_KEY[p.status] ?? 'prog.sLearning'))}</span>` : `<span class="pill">${esc(t('today.open'))}</span>`;
      return `<li><div><div class="word" lang="${TL}">${esc(v.exampleEn)}</div><div class="meaning" lang="${NL}">${esc(v.exampleDe)}</div><div class="meaning small" lang="${TL}">${esc(v.english)}</div></div>
        <span class="sentence-meta">${info.status === 'locked' ? '' : pill}<button class="icon-btn" data-action="speak" data-field="exampleEn" data-id="${v.id}" aria-label="${esc(t('sent.listen'))}: ${esc(v.exampleEn)}">${icon('speaker')}</button></span></li>`;
    })
    .join('');
  return `
    <p class="eyebrow"><a href="#/sentences" class="back-link">${esc(t('learn.sentences'))}</a> · ${esc(fmtDay(lesson.createdDay))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('slesson.title', { n: lesson.number }))}</h1>
    <p class="lead">${esc(lead)}</p>
    ${busy && info.status !== 'locked' && info.status !== 'running' ? `<div class="notice" style="margin-top:12px">${esc(t('slesson.busy'))} <a href="#/sentence/${open.id}">${esc(t('act.continueSentences'))}</a></div>` : ''}
    <div class="hero-actions">${action}<a class="btn btn-ghost" href="#/lesson/${lesson.id}">${esc(t('slesson.toWords', { n: lesson.number }))}</a></div>
    <section class="section card"><h2 class="section-title">${esc(t('slesson.list', { n: info.ids.length }))}</h2>${rows ? `<ul class="list sentence-list">${rows}</ul>` : `<p class="muted small">${esc(t('slesson.leadEmpty'))}</p>`}</section>`;
}

function viewSentence(id) {
  const session = (state.sentences ?? []).find((x) => x.id === id);
  if (!session) return emptyState(t('tests.notFound'), t('tests.notFoundText'), `<a class="btn btn-primary" href="#/sentences">${esc(t('nav.sentences'))}</a>`);
  const p = sentenceSessionProgress(session);
  if (session.completedAt) {
    const lesson = session.lessonId ? state.lessons.find((l) => l.id === session.lessonId) : null;
    const daily = lesson ? dailyTestFor(state, lesson.id) : null;
    const next =
      lesson && !daily
        ? `<button class="btn btn-primary" data-action="start-daily" data-id="${lesson.id}">${esc(t('act.takeDaily'))}</button><a class="btn" href="#/">${esc(t('act.dashboard'))}</a>`
        : session.type === 'topic'
          ? `<a class="btn btn-primary" href="#/topic/${session.topic}">${esc(topicLabel(session.topic))}</a><a class="btn" href="#/">${esc(t('act.dashboard'))}</a>`
          : `<a class="btn btn-primary" href="#/">${esc(t('act.dashboard'))}</a><a class="btn" href="#/sentences">${esc(t('nav.sentences'))}</a>`;
    return emptyState(t('sent.complete'), t(session.type === 'lesson' || session.type === 'topic' ? 'sent.completeText' : 'sent.completeReview', { t: p.total }), next);
  }
  const vocabId = session.queue[0];
  const item = session.items.find((i) => i.vocabId === vocabId);
  return studyCard({
    vocab: vocabById.get(vocabId),
    direction: item.direction,
    label: t('card.sentence'),
    done: p.done,
    total: p.total,
    showKnown: false,
    token: sentenceToken(session),
    kind: 'sentence',
    mode: 'sentence',
    pauseHref: session.type === 'topic' ? `#/topic/${session.topic}` : '#/sentences',
  });
}

/* ---------------- training ---------------- */

const SCOPES = ['recent', 'all', 'starred', 'hard'];
const GAMES = ['match', 'listen', 'dictation', 'blitz', 'scramble', 'memory', 'puzzle'];
// Hören & Schreiben (one word) and Satz-Diktat (its example sentence) share one screen.
const isListenGame = (type) => type === 'listen' || type === 'dictation';

function validScope(scope) {
  const known = SCOPES.includes(scope) || daysOfScope(scope) || state.lessons.some((l) => l.id === scope);
  const topic = scope?.startsWith('topic-') && isTopic(scope.slice(6));
  const situation = scope?.startsWith('sit-') && hasSituations() && situationById(scope.slice(4));
  return known || topic || situation ? scope : 'all';
}

function scopeName(scope) {
  if (scope?.startsWith('topic-')) return topicLabel(scope.slice(6));
  if (scope?.startsWith('sit-') && situationById(scope.slice(4))) return situationTitle(situationById(scope.slice(4)));
  if (daysOfScope(scope)) return t('train.scope.days', { n: daysOfScope(scope) });
  const lesson = state.lessons.find((l) => l.id === scope);
  return lesson ? t('path.lesson', { n: lesson.number }) : t(`train.scope.${scope}`);
}

function backHref(scope) {
  if (scope?.startsWith('topic-')) return `#/topic/${scope.slice(6)}`;
  if (scope?.startsWith('sit-')) return `#/situation/${scope.slice(4)}`;
  return state.lessons.some((l) => l.id === scope) ? `#/lesson/${scope}` : '#/train';
}

// The last lessons, each opening its page (word list, practice modes).
function recentLessonsList() {
  const lessons = recentLessons(state).reverse();
  if (!lessons.length) return '';
  return `
    <section class="section card">
      <h2 class="section-title">${esc(t('train.recentTitle'))}</h2>
      <ul class="list">
        ${lessons
          .map((l) => `<li><a class="list-link" href="#/lesson/${l.id}"><span class="word">${esc(t('path.lesson', { n: l.number }))}</span><span class="meaning small">${esc(wordCount(poolFor(state, l.id, today()).length))}</span></a></li>`)
          .join('')}
      </ul>
    </section>`;
}

// Themen, everyday situations and grammar – reachable from Üben (on the phone they are not in the bottom bar).
function moreAreas() {
  const tile = (href, iconText, name, sub) => `<a class="area-link card" href="${href}"><span class="topic-icon" aria-hidden="true">${iconText}</span><span class="topic-body"><span class="topic-name">${esc(name)}</span><span class="muted small">${esc(sub)}</span></span></a>`;
  return `<section class="section more-areas" aria-labelledby="more-title">
      <h2 class="section-title" id="more-title">${esc(t('more.title'))}</h2>
      <div class="area-grid">
        ${hasMusic() ? tile('#/music', '🎵', t('music.title'), t('more.music')) : ''}
        ${tile('#/tests', '✅', t('nav.tests'), t('more.tests'))}
        ${tile('#/topics', '🗂️', t('nav.topics'), t('more.topics'))}
        ${hasSituations() ? tile('#/topics', '💬', t('sit.title'), t('more.situations')) : ''}
        ${hasGrammar() ? tile('#/grammar', '📘', t('nav.grammar'), t('more.grammar')) : ''}
        ${hasStories() ? tile('#/stories', '📖', t('story.title'), t('more.stories')) : ''}
      </div>
    </section>`;
}

// "Markierte Wörter nochmal lernen": the words you starred (★), as cards right away or with every other exercise.
function starredCard() {
  const n = poolFor(state, 'starred', today()).length;
  if (!n) return '';
  return `<section class="section card starred-card" aria-labelledby="starred-title">
      <h2 class="section-title" id="starred-title">${icon('star', 18)} ${esc(t('train.starredTitle'))}</h2>
      <p class="muted small">${esc(t('train.starredText', { n }))}</p>
      <div class="hero-actions">
        <button class="btn btn-primary" data-action="start-word-practice" data-id="starred">${esc(t('train.starredCards', { n: Math.min(n, PRACTICE_MAX) }))}</button>
        <button class="btn" data-action="train-scope" data-id="starred">${esc(t('train.starredMore'))}</button>
      </div>
    </section>`;
}

function viewTrain() {
  const learned = poolFor(state, 'all', today()).length;
  if (!learned) {
    return emptyState(t('train.emptyTitle'), t('train.emptyText'), `<button class="btn btn-primary" data-action="start-lesson">${esc(t('act.startLesson', { n: state.lessons.length + 1 }))}</button>`) + moreAreas();
  }
  const scope = validScope(ui.trainScope);
  const chip = (value, count) =>
    `<label class="scope-chip"><input type="radio" name="trainScope" value="${value}" data-ui="trainScope" ${scope === value ? 'checked' : ''}><span>${value === 'starred' ? icon('star', 14) : ''}${esc(t(`train.scope.${value}`))} <b>${count}</b></span></label>`;
  const lessons = state.lessons.filter((l) => poolFor(state, l.id, today()).length);
  const isLesson = !SCOPES.includes(scope) && !daysOfScope(scope);
  // Words first learned in the last 7 / 14 / 30 / 90 days – you choose how far back.
  const dayChip = (n) => {
    const value = `days-${n}`;
    return `<label class="scope-chip"><input type="radio" name="trainScope" value="${value}" data-ui="trainScope" ${scope === value ? 'checked' : ''}><span>${esc(t('train.daysChip', { n }))} <b>${poolFor(state, value, today()).length}</b></span></label>`;
  };
  const select = lessons.length
    ? `<label class="sr-only" for="train-lesson">${esc(t('train.scope.lesson'))}</label>
       <select class="input select scope-select ${isLesson ? 'is-on' : ''}" id="train-lesson" data-ui="trainScope">
         <option value="" ${isLesson ? '' : 'selected'} disabled>${esc(t('train.scope.lesson'))}</option>
         ${[...lessons].reverse().map((l) => `<option value="${l.id}" ${scope === l.id ? 'selected' : ''}>${esc(t('path.lesson', { n: l.number }))} · ${esc(wordCount(poolFor(state, l.id, today()).length))}</option>`).join('')}
       </select>`
    : '';
  const empty = poolFor(state, scope, today()).length === 0;
  const dueS = sentenceReviewIds(state, today()).length;
  const sentencesLearned = learnedSentenceIds(state).length;
  return `
    <p class="eyebrow">${esc(t('nav.train'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('train.title'))}</h1>
    <p class="lead">${esc(t('train.lead'))}</p>
    ${starredCard()}
    ${moreAreas()}
    <section class="section">
      <h2 class="section-title">${esc(t('train.what'))}</h2>
      <div class="scope-row" role="radiogroup" aria-label="${esc(t('train.what'))}">
        ${chip('recent', poolFor(state, 'recent', today()).length)}${chip('all', learned)}${chip('starred', poolFor(state, 'starred', today()).length)}${chip('hard', hardWordIds(state).length)}
        ${select}
      </div>
      <h3 class="scope-subtitle">${esc(t('train.recentDays'))}</h3>
      <div class="scope-row" role="radiogroup" aria-label="${esc(t('train.recentDays'))}">
        ${RECENT_DAY_RANGES.map(dayChip).join('')}
      </div>
      ${empty ? `<p class="notice" style="margin-top:12px">${esc(t(scope === 'starred' ? 'train.starredEmpty' : daysOfScope(scope) ? 'train.daysEmpty' : scope === 'hard' ? 'train.hardEmpty' : 'train.poolEmpty', { n: daysOfScope(scope) }))}</p>` : ''}
    </section>
    ${empty ? '' : modeGrid(scope, { title: t('train.modes', { s: scopeName(scope) }) })}
    ${recentLessonsList()}
    <a class="section card sentence-teaser" href="#/sentences">
      <span class="mode-icon">${icon('sentences', 22)}</span>
      <span class="mode-text"><span class="mode-name">${esc(t('nav.sentences'))}</span><span class="mode-desc">${esc(dueS ? t('sub.sentencesDue', { n: dueS }) : t('train.sentencesDesc', { n: sentencesLearned }))}</span></span>
      <span class="teaser-arrow" aria-hidden="true">→</span>
    </a>`;
}

function newGame(type, scope) {
  const pool = poolFor(state, scope, today());
  const seed = `${type}:${scope}:${Date.now()}:${Math.random()}`;
  if (type === 'match') return pool.length < 2 ? { type, scope, empty: true } : { ...newMatchGame(pool, seed), scope };
  if (type === 'blitz') return pool.length ? { ...newBlitz(pool, seed, Date.now(), globalThis.__EV_BLITZ_SECONDS__ ?? BLITZ_SECONDS), scope } : { type, scope, empty: true };
  if (type === 'scramble') {
    const eligible = scrambleEligible(VOCABULARY, pool);
    return eligible.length < 3 ? { type, scope, empty: true } : { ...newScramble(eligible, vocabById, seed), scope };
  }
  if (type === 'puzzle') {
    const eligible = puzzleEligible(VOCABULARY, pool);
    return eligible.length < 2 ? { type, scope, empty: true } : { ...newPuzzle(eligible, vocabById, seed), scope };
  }
  if (type === 'memory') return pool.length < 3 ? { type, scope, empty: true } : { ...newMemory(pool, seed), scope };
  return pool.length ? { ...newQuiz(type, pool, seed), scope } : { type, scope, empty: true };
}

function gameHeader(label, done, total, scope, counter = `${pad(Math.min(done + 1, total))} / ${pad(total)}`) {
  return `
    <div class="progress-head"><span>${esc(label)} · ${esc(scopeName(scope))} · ${esc(counter)}</span><a class="btn btn-ghost btn-sm" href="${backHref(scope)}">${esc(t('act.pause'))}</a></div>
    <div class="bar" role="progressbar" aria-label="${esc(t('card.progress'))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>`;
}

function gameEmpty(scope) {
  return emptyState(t('train.emptyPool'), t('train.emptyPoolText'), `<a class="btn btn-primary" href="${backHref(scope)}">${esc(t('train.back'))}</a>`);
}

function viewMatch() {
  const g = ui.game;
  if (!g || g.type !== 'match') return '';
  if (g.empty) return gameEmpty(g.scope);
  if (g.done) {
    const missed = g.missedIds
      .map((id) => vocabById.get(id))
      .map((v) => `<li><div><div class="word" lang="${TL}">${esc(v.english)}</div><div class="meaning" lang="${NL}">${esc(v.german)}</div></div><span class="sentence-meta">${starButton(v)}<button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button></span></li>`)
      .join('');
    return `
      <section class="card empty game-result">
        <p class="result-score">${g.total} / ${g.total}</p>
        <h1 class="page-title" tabindex="-1">${esc(t('match.done'))}</h1>
        <p class="lead" style="margin:0 auto">${esc(g.misses ? t('match.doneMisses', { n: g.total, m: g.misses }) : t('match.donePerfect', { n: g.total }))}</p>
        <div class="hero-actions"><button class="btn btn-primary" data-action="restart-game">${esc(t('train.again'))}</button><a class="btn" href="${backHref(g.scope)}">${esc(t('train.back'))}</a></div>
      </section>
      ${missed ? `<section class="section card"><h2 class="section-title">${esc(t('match.missed'))}</h2><ul class="list">${missed}</ul></section>` : ''}`;
  }
  const tiles = matchTiles(g);
  const flash = ui.flash ?? { keys: [] };
  const tile = (side, id) => {
    const v = vocabById.get(id);
    const key = `${side}:${id}`;
    const matched = g.matched.includes(id);
    const selected = g.selected?.side === side && g.selected.id === id;
    const cls = matched ? 'is-matched' : flash.keys.includes(key) ? `is-${flash.kind}` : selected ? 'is-selected' : '';
    return `<button class="match-tile ${cls}" data-action="match-pick" data-side="${side}" data-id="${id}" lang="${side === 'en' ? TL : NL}" aria-pressed="${selected}" ${matched ? 'disabled aria-label="' + esc(t('match.found')) + '"' : ''}>${esc(side === 'en' ? v.english : v.german)}</button>`;
  };
  const done = matchedSoFar(g);
  return `
    <div class="study">
      ${gameHeader(t('train.match'), done, g.total, g.scope, t('match.pairs', { d: done, t: g.total }))}
      <h1 class="sr-only" tabindex="-1">${esc(t('train.match'))}</h1>
      <p class="game-hint">${esc(t('match.hint'))}${g.rounds.length > 1 ? ` · ${esc(t('match.round', { r: g.round + 1, t: g.rounds.length }))}` : ''}</p>
      <div class="match-board">
        <div class="match-col" role="group" aria-label="${esc(t(`lang.name.${TL}`))}">${tiles.en.map((id) => tile('en', id)).join('')}</div>
        <div class="match-col" role="group" aria-label="${esc(t(`lang.name.${NL}`))}">${tiles.de.map((id) => tile('de', id)).join('')}</div>
      </div>
      <div class="study-footer"><span class="kbd-hint">${esc(t('match.misses', { n: g.misses }))}</span></div>
    </div>`;
}

// Solution block used by the games: German on top, the English you are learning large below.
function solutionBlock(v) {
  return `
    <div class="flashcard-face is-back game-solution">
      <span class="card-de" lang="${NL}">${esc(v.german)}</span>
      <span class="card-answer" lang="${TL}">${esc(v.english)}</span>
      <span class="card-divider" aria-hidden="true"></span>
      <span class="card-example" lang="${TL}">${esc(v.exampleEn)}</span>
      <span class="card-example-de" lang="${NL}">${esc(v.exampleDe)}</span>
      ${noteLine(v)}
      ${audioButtons(v)}
    </div>`;
}

function quizFeedback(g, v) {
  const a = g.answers.at(-1);
  const good = a.isCorrect;
  const title = good ? t(a.verdict === 'almost' ? 'quiz.almost' : 'quiz.good') : a.skipped ? t('quiz.solution') : t('quiz.wrong');
  const heard = a.given ? `<p class="small" style="margin-top:6px">${esc(t('test.yourAnswer'))}: <strong lang="${TL}">${esc(a.given)}</strong></p>` : '';
  const model = g.type === 'dictation' && a.verdict !== 'correct' ? `<p class="small dict-model" style="margin-top:6px">${esc(t('dict.model'))}: <strong lang="${TL}">${esc(v.exampleEn)}</strong></p>` : '';
  const last = g.index + 1 === g.ids.length;
  return `
    <div class="feedback ${good ? 'good' : a.skipped ? '' : 'bad'}" role="status">
      <p class="feedback-title">${icon(good ? 'check' : a.skipped ? 'eye' : 'cross', 20)} ${esc(title)}</p>
      ${heard}${model}
    </div>
    ${solutionBlock(v)}
    <div class="rating">
      <button class="btn btn-primary" data-action="quiz-next" id="quiz-next">${esc(t(last ? 'quiz.result' : 'test.next'))}</button>
    </div>`;
}

function quizResult(g) {
  const sc = quizScore(g);
  const wrong = sc.wrong
    .map((id) => vocabById.get(id))
    .map((v) => `<li><div><div class="word" lang="${TL}">${esc(v.english)}</div><div class="meaning" lang="${NL}">${esc(v.german)}</div></div><span class="sentence-meta">${starButton(v)}<button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button></span></li>`)
    .join('');
  return `
    <section class="card empty game-result">
      <p class="result-score">${sc.correct} / ${sc.total}</p>
      <h1 class="page-title" tabindex="-1">${esc(t(g.type === 'dictation' ? 'dict.done' : 'listen.done'))}</h1>
      <p class="lead" style="margin:0 auto">${esc(sc.wrong.length ? t('quiz.doneSome', { n: sc.wrong.length }) : t('quiz.donePerfect'))}</p>
      <div class="hero-actions">
        <button class="btn btn-primary" data-action="restart-game">${esc(t('train.again'))}</button>
        ${sc.wrong.length ? `<button class="btn" data-action="star-wrong">${icon('star', 16)} ${esc(t('quiz.starWrong'))}</button>` : ''}
        <a class="btn" href="${backHref(g.scope)}">${esc(t('train.back'))}</a>
      </div>
    </section>
    ${wrong ? `<section class="section card"><h2 class="section-title">${esc(t('quiz.wrongList', { n: sc.wrong.length }))}</h2><ul class="list">${wrong}</ul></section>` : ''}`;
}

function viewListen() {
  const g = ui.game;
  if (!g || !isListenGame(g.type)) return '';
  if (g.empty) return gameEmpty(g.scope);
  if (g.done) return quizResult(g);
  // k('task') → 'listen.task' for a word, 'dict.task' for a sentence
  const sentence = g.type === 'dictation';
  const k = (key) => `${sentence ? 'dict' : 'listen'}.${key}`;
  const name = t(sentence ? 'train.dictation' : 'train.listen');
  if (!audioOn()) return emptyState(name, t('train.audioOff'), `<button class="btn btn-primary" data-action="toggle-audio">${esc(t('card.audioOff'))}</button><a class="btn" href="${backHref(g.scope)}">${esc(t('train.back'))}</a>`);
  const v = vocabById.get(quizCurrent(g));
  const audioOk = usingCloud() || speaker.hasEnglishVoice();
  const body =
    g.phase === 'ask'
      ? `<form class="answer-form" data-form="quiz" autocomplete="off">
           <label class="sr-only" for="quiz-input">${esc(t(k('input')))}</label>
           <input class="input" id="quiz-input" name="answer" type="text" lang="${TL}" autocomplete="off" autocapitalize="${sentence ? 'sentences' : 'off'}" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${esc(t(k('input')))}" required />
           <button class="btn btn-primary btn-block" type="submit">${esc(t('test.check'))}</button>
         </form>
         <div class="game-actions">
           <button class="btn btn-sm btn-ghost" data-action="quiz-hint" aria-expanded="${Boolean(ui.quizHint)}">${esc(t(ui.quizHint ? 'listen.hideHint' : 'listen.hint'))}</button>
           <button class="btn btn-sm btn-ghost" data-action="quiz-skip">${esc(t('quiz.skip'))}</button>
         </div>
         ${ui.quizHint ? `<p class="game-hint" lang="${NL}">${esc(t('listen.meaning'))}: <strong>${esc(sentence ? v.exampleDe : v.german)}</strong></p>` : ''}`
      : quizFeedback(g, v);
  return `
    <div class="study">
      ${gameHeader(name, g.index, g.ids.length, g.scope)}
      <h1 class="sr-only" tabindex="-1">${esc(name)} ${esc(t('card.of', { p: g.index + 1, t: g.ids.length }))}</h1>
      ${g.phase === 'ask'
        ? `<div class="flashcard-face listen-stage">
             <button class="play-big" data-action="quiz-play" data-id="${v.id}" ${audioOk ? '' : 'disabled'} aria-label="${esc(t(k('play')))}">${icon('speaker', 40)}</button>
             <span class="card-hint">${esc(t(audioOk ? k('task') : 'audio.noVoice'))}</span>
             <button class="btn btn-sm btn-ghost" data-action="quiz-play-slow" data-id="${v.id}" ${audioOk ? '' : 'disabled'}>${esc(t('listen.slow'))}</button>
           </div>`
        : ''}
      ${body}
    </div>`;
}

// ---- More games: Blitz (60 seconds), Wort bauen (letter tiles) and Memory (turn cards).

// Words you missed in a game, with the star and the listen button.
function missedWordList(ids, titleKey) {
  const items = ids
    .map((id) => vocabById.get(id))
    .map((v) => `<li><div><div class="word" lang="${TL}">${esc(v.english)}</div><div class="meaning" lang="${NL}">${esc(v.german)}</div></div><span class="sentence-meta">${starButton(v)}<button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button></span></li>`)
    .join('');
  return items ? `<section class="section card"><h2 class="section-title">${esc(t(titleKey, { n: ids.length }))}</h2><ul class="list">${items}</ul></section>` : '';
}

const starsText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function gameResult({ score, title, lead, record = '', again = true, missedIds = [], scope }) {
  return `
    <section class="card empty game-result">
      <p class="result-score">${esc(score)}</p>
      <h1 class="page-title" tabindex="-1">${esc(title)}</h1>
      ${record ? `<p class="record-badge">${esc(record)}</p>` : ''}
      <p class="lead" style="margin:0 auto">${esc(lead)}</p>
      <div class="hero-actions">
        ${again ? `<button class="btn btn-primary" data-action="restart-game">${esc(t('train.again'))}</button>` : ''}
        ${missedIds.length ? `<button class="btn" data-action="star-missed">${icon('star', 16)} ${esc(t('quiz.starWrong'))}</button>` : ''}
        <a class="btn" href="${backHref(scope)}">${esc(t('train.back'))}</a>
      </div>
    </section>
    ${missedWordList(missedIds, 'quiz.wrongList')}`;
}

function viewBlitz() {
  const g = ui.game;
  if (!g || g.type !== 'blitz') return '';
  if (g.empty) return gameEmpty(g.scope);
  const best = prefs.blitzBest?.[course.id] ?? 0;
  if (g.done) {
    return gameResult({
      score: `${g.score}`,
      title: t('blitz.done'),
      lead: t('blitz.result', { c: g.correct, s: g.bestStreak }),
      record: ui.newRecord ? t('blitz.record') : best ? t('blitz.best', { n: best }) : '',
      missedIds: g.missedIds,
      scope: g.scope,
    });
  }
  const q = blitzQuestion(g, VOCABULARY, vocabById);
  const rem = blitzRemainingMs(g, Date.now());
  const answerLang = q.dir === 'en' ? NL : TL;
  let last = '';
  if (g.last?.result === 'correct') last = `<span class="blitz-last is-good">+${g.last.points}</span>`;
  else if (g.last?.result === 'wrong') {
    const prev = blitzQuestion({ ...g, index: g.index - 1 }, VOCABULARY, vocabById);
    last = `<span class="blitz-last is-bad">${esc(t('blitz.wasCorrect', { a: prev.options.find((o) => o.id === prev.id).text }))}</span>`;
  }
  return `
    <div class="study">
      <div class="progress-head"><span>${esc(t('train.blitz'))} · ${esc(scopeName(g.scope))}</span><a class="btn btn-ghost btn-sm" href="${backHref(g.scope)}">${esc(t('act.pause'))}</a></div>
      <div class="blitz-hud">
        <span class="blitz-stat"><b>${g.score}</b><small>${esc(t('blitz.score'))}</small></span>
        <span class="blitz-stat ${g.streak >= 3 ? 'is-hot' : ''}"><b>×${g.streak}</b><small>${esc(t('blitz.streak'))}</small></span>
        <span class="blitz-stat"><b><span id="blitz-seconds">${Math.ceil(rem / 1000)}</span></b><small>${esc(t('blitz.time'))}</small></span>
      </div>
      <div class="bar blitz-bar" aria-hidden="true"><span id="blitz-bar" style="width:${(rem / (g.seconds * 1000)) * 100}%"></span></div>
      <h1 class="sr-only" tabindex="-1">${esc(t('train.blitz'))}</h1>
      <div class="flashcard-face blitz-stage">
        <span class="card-dir">${dirLabel(q.dir === 'en' ? 'en-de' : 'de-en')}</span>
        <span class="card-prompt" lang="${q.dir === 'en' ? TL : NL}">${esc(q.prompt)}</span>
      </div>
      <div class="blitz-options" role="group" aria-label="${esc(t('blitz.hint'))}">
        ${q.options.map((o) => `<button class="btn blitz-option" data-action="blitz-pick" data-id="${esc(o.id)}" data-question="${esc(q.id)}" lang="${answerLang}">${esc(o.text)}</button>`).join('')}
      </div>
      <p class="blitz-feedback" role="status">${last}</p>
    </div>`;
}

function viewScramble() {
  const g = ui.game;
  if (!g || g.type !== 'scramble') return '';
  if (g.empty) return gameEmpty(g.scope);
  if (g.done) {
    const sc = scrambleScore(g);
    return gameResult({ score: starsText(Math.round((sc.stars / Math.max(1, sc.max)) * 3)), title: t('scramble.done'), lead: t('scramble.result', { s: sc.solved, t: sc.total, n: sc.stars, m: sc.max }), missedIds: sc.missed, scope: g.scope });
  }
  const v = vocabById.get(g.ids[g.index]);
  const target = scrambleTarget(v.english);
  const letters = [...target];
  const filled = g.placed.map((i) => g.tiles[i]);
  const shown = (ch) => (ch === 'ß' ? 'ß' : ch.toUpperCase());
  const feedback = g.phase === 'feedback';
  const last = g.results.at(-1);
  const slots = letters
    .map((ch, i) => `<span class="letter-slot ${feedback ? (last.revealed ? 'is-reveal' : 'is-good') : filled[i] ? 'is-filled' : ''} ${ui.flash?.kind === 'shake' ? 'is-shake' : ''}">${esc(shown(feedback ? ch.toLowerCase() : filled[i] ?? ''))}</span>`)
    .join('');
  const tiles = g.tiles
    .map((ch, i) => `<button class="letter-tile" data-action="scramble-tile" data-index="${i}" ${g.placed.includes(i) || feedback ? 'disabled' : ''}>${esc(shown(ch))}</button>`)
    .join('');
  const body = feedback
    ? `<div class="feedback ${last.revealed ? '' : 'good'}" role="status"><p class="feedback-title">${icon(last.revealed ? 'eye' : 'check', 20)} ${esc(last.revealed ? t('quiz.solution') : t('scramble.good'))} <span class="stars">${esc(starsText(last.stars))}</span></p></div>
       ${solutionBlock(v)}
       <div class="rating"><button class="btn btn-primary btn-wide" data-action="scramble-next" id="scramble-next">${esc(t(g.index + 1 === g.ids.length ? 'quiz.result' : 'test.next'))}</button></div>`
    : `<div class="letter-tiles" role="group" aria-label="${esc(t('scramble.hint'))}">${tiles}</div>
       <div class="game-actions">
         <button class="btn btn-sm btn-ghost" data-action="scramble-undo" ${g.placed.length ? '' : 'disabled'}>⌫ ${esc(t('scramble.undo'))}</button>
         <button class="btn btn-sm btn-ghost" data-action="scramble-hint">${esc(t('scramble.tip'))}</button>
         <button class="btn btn-sm btn-ghost" data-action="scramble-skip">${esc(t('quiz.skip'))}</button>
       </div>`;
  return `
    <div class="study">
      ${gameHeader(t('train.scramble'), g.index, g.ids.length, g.scope)}
      <h1 class="sr-only" tabindex="-1">${esc(t('train.scramble'))} ${esc(t('card.of', { p: g.index + 1, t: g.ids.length }))}</h1>
      <div class="flashcard-face scramble-stage">
        <span class="card-dir">${esc(t('scramble.hint'))}</span>
        <span class="card-prompt" lang="${NL}">${esc(v.german)}</span>
        <div class="letter-slots" aria-live="polite" aria-label="${esc(filled.join(''))}">${slots}</div>
      </div>
      ${body}
    </div>`;
}

// Satz-Puzzle: build the sentence from its words. A wrong order shows where it goes wrong.
function viewPuzzle() {
  const g = ui.game;
  if (!g || g.type !== 'puzzle') return '';
  if (g.empty) return gameEmpty(g.scope);
  if (g.done) {
    const sc = puzzleScore(g);
    return gameResult({ score: starsText(Math.round((sc.stars / Math.max(1, sc.max)) * 3)), title: t('scramble.done'), lead: t('puzzle.result', { s: sc.solved, t: sc.total, n: sc.stars, m: sc.max }), missedIds: sc.missed, scope: g.scope });
  }
  const v = vocabById.get(g.ids[g.index]);
  const feedback = g.phase === 'feedback';
  const check = g.phase === 'check';
  const last = g.results.at(-1);
  const built = g.placed.map((i) => g.tiles[i]);
  const line = feedback
    ? `<span class="puzzle-line is-done" lang="${TL}">${esc(v.exampleEn)}</span>`
    : `<span class="puzzle-line" lang="${TL}" aria-live="polite">${built.length ? built.map((w, k) => `<span class="puzzle-word ${check && k >= g.firstWrong ? 'is-wrong' : check ? 'is-good' : ''}">${esc(w)}</span>`).join(' ') + (built.length === g.words.length ? esc(g.end) : '') : `<span class="muted">${esc(t('puzzle.empty'))}</span>`}</span>`;
  const tiles = g.tiles
    .map((w, i) => `<button class="word-tile" data-action="puzzle-tile" data-index="${i}" lang="${TL}" ${g.placed.includes(i) || feedback || check ? 'disabled' : ''}>${esc(w)}</button>`)
    .join('');
  const body = feedback
    ? `<div class="feedback ${last.revealed ? '' : 'good'}" role="status"><p class="feedback-title">${icon(last.revealed ? 'eye' : 'check', 20)} ${esc(last.revealed ? t('quiz.solution') : t('scramble.good'))} <span class="stars">${esc(starsText(last.stars))}</span></p></div>
       ${solutionBlock(v)}
       <div class="rating"><button class="btn btn-primary btn-wide" data-action="puzzle-next" id="puzzle-next">${esc(t(g.index + 1 === g.ids.length ? 'quiz.result' : 'test.next'))}</button></div>`
    : check
      ? `<div class="feedback bad" role="status"><p class="feedback-title">${icon('cross', 20)} ${esc(t('puzzle.wrongFrom', { n: g.firstWrong + 1 }))}</p>
           <div class="feedback-actions">
             <button class="btn btn-primary" data-action="puzzle-retry" id="puzzle-retry">${esc(t('puzzle.retry'))}</button>
             <button class="btn" data-action="puzzle-reveal">${esc(t('quiz.solution'))}</button>
           </div></div>`
      : `<div class="word-tiles" role="group" aria-label="${esc(t('puzzle.hint'))}">${tiles}</div>
         <div class="game-actions">
           <button class="btn btn-sm btn-ghost" data-action="puzzle-undo" ${g.placed.length ? '' : 'disabled'}>⌫ ${esc(t('scramble.undo'))}</button>
           <button class="btn btn-sm btn-ghost" data-action="puzzle-reveal">${esc(t('quiz.skip'))}</button>
         </div>`;
  return `
    <div class="study">
      ${gameHeader(t('train.puzzle'), g.index, g.ids.length, g.scope)}
      <h1 class="sr-only" tabindex="-1">${esc(t('train.puzzle'))} ${esc(t('card.of', { p: g.index + 1, t: g.ids.length }))}</h1>
      <div class="flashcard-face puzzle-stage">
        <span class="card-dir">${esc(t('puzzle.hint'))}</span>
        <span class="card-prompt is-sentence" lang="${NL}">${esc(v.exampleDe)}</span>
        ${line}
      </div>
      ${body}
    </div>`;
}

function viewMemory() {
  const g = ui.game;
  if (!g || g.type !== 'memory') return '';
  if (g.empty) return gameEmpty(g.scope);
  if (g.done) return gameResult({ score: starsText(memoryStars(g)), title: t('memory.done'), lead: t('memory.result', { m: g.moves, p: g.pairs }), missedIds: g.missedIds, scope: g.scope });
  const cards = g.cards
    .map((c, i) => {
      const v = vocabById.get(c.id);
      const matched = g.matched.includes(c.id);
      const open = g.open.includes(i);
      const face = matched || open;
      const text = c.side === 'en' ? v.english : v.german;
      const cls = matched ? 'is-matched' : open ? (g.pending ? 'is-miss' : 'is-open') : '';
      return `<button class="memory-card ${cls}" data-action="memory-flip" data-index="${i}" ${matched ? 'disabled' : ''} aria-label="${esc(face ? text : t('memory.hidden'))}" aria-pressed="${face}">${face ? `<span lang="${c.side === 'en' ? TL : NL}">${esc(text)}</span>` : '<span class="memory-back" aria-hidden="true">?</span>'}</button>`;
    })
    .join('');
  return `
    <div class="study">
      ${gameHeader(t('train.memory'), g.matched.length, g.pairs, g.scope, t('match.pairs', { d: g.matched.length, t: g.pairs }))}
      <h1 class="sr-only" tabindex="-1">${esc(t('train.memory'))}</h1>
      <p class="game-hint">${esc(t('memory.hint'))}</p>
      <div class="memory-board">${cards}</div>
      <div class="study-footer"><span class="kbd-hint">${esc(t('memory.moves', { n: g.moves }))}</span></div>
    </div>`;
}

/* ---------------- tests ---------------- */

function scoreLine(test) {
  const s = testSummary(test);
  return `${s.correct} / ${s.total} · ${s.accuracy} %`;
}

function viewTests() {
  const day = today();
  const lesson = currentLesson(state);
  const last = lastCompletedLesson(state);
  const daily = last ? dailyTestFor(state, last.id) : null;
  const small = (text) => `<p class="muted small">${esc(text)}</p>`;
  let dailyBody;
  if (!last) dailyBody = small(t('tests.dailyLocked'));
  else if (!daily) dailyBody = `${small(t('tests.dailyInfo', { n: last.number, q: dailyCount(last) }))}<div class="hero-actions"><button class="btn btn-primary" data-action="start-daily" data-id="${last.id}">${esc(t('act.startDaily'))}</button></div>`;
  else if (!daily.completedAt) dailyBody = `${small(t('tests.progressInfo', { p: daily.currentIndex + 1, t: daily.questions.length }))}<div class="hero-actions"><a class="btn btn-primary" href="#/test/${daily.id}">${esc(t('act.continueDaily'))}</a></div>`;
  else dailyBody = `${small(t('tests.dailyScore', { n: last.number, s: scoreLine(daily) }))}<div class="hero-actions"><a class="btn" href="#/result/${daily.id}">${esc(t('act.viewResult'))}</a></div>`;
  if (lesson && (!daily || daily.completedAt)) dailyBody += `<p class="muted small" style="margin-top:12px">${esc(t('tests.nextDaily', { n: lesson.number }))}</p>`;

  const weekly = weeklyStatus(state, now());
  let weeklyBody;
  if (weekly.done) weeklyBody = `${small(t('tests.weekScore', { s: scoreLine(weekly.done) }))}<div class="hero-actions"><a class="btn" href="#/result/${weekly.done.id}">${esc(t('act.viewResult'))}</a></div>`;
  else if (weekly.open) weeklyBody = `${small(t('tests.progressInfo', { p: weekly.open.currentIndex + 1, t: weekly.open.questions.length }))}<div class="hero-actions"><a class="btn btn-primary" href="#/test/${weekly.open.id}">${esc(t('act.continueWeekly'))}</a></div>`;
  else if (weekly.available) weeklyBody = `${small(t('tests.weeklyInfo'))}<div class="hero-actions"><button class="btn btn-primary" data-action="start-weekly">${esc(t('act.startWeekly'))}</button></div>`;
  else weeklyBody = small(t('tests.weeklyLocked', { d: fmtDay(addDays(weekStart(day), 7)) }));

  const completed = state.tests.filter((x) => x.completedAt).slice(-10).reverse();
  const results = completed.length
    ? `<ul class="list">${completed
        .map((x) => `<li><a href="#/result/${x.id}" style="text-decoration:none;flex:1"><div class="word">${esc(testName(x))}</div><div class="meaning">${esc(fmtDay(x.completedDay))}</div></a><span class="pill">${scoreLine(x)}</span></li>`)
        .join('')}</ul>`
    : small(t('tests.noResults'));

  const mistakes = mistakeOverview(state);
  const mistakeList = mistakes.length
    ? `<ul class="list">${mistakes
        .map((p) => {
          const v = vocabById.get(p.vocabId);
          return `<li><div><div class="word" lang="${TL}">${esc(v.english)}</div><div class="meaning">${esc(v.german)}</div></div><span class="pill bad">${esc(t('tests.wrongCount', { n: p.wrongCount }))}</span></li>`;
        })
        .join('')}</ul>`
    : small(t('tests.noMistakes'));
  const mistakeIntro = mistakes.length ? small(t('tests.mistakesLead')) : '';
  const mistakeAction = hardCount() ? `<div class="hero-actions">${hardButton()}</div>` : '';

  return `
    <p class="eyebrow">${esc(t('tests.eyebrow'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('tests.title'))}</h1>
    <div class="section grid grid-2">
      <section class="card"><h2 class="section-title">${esc(t('tests.dailyTitle'))}</h2>${dailyBody}</section>
      <section class="card"><h2 class="section-title">${esc(t('tests.weeklyTitle'))}</h2>${weeklyBody}</section>
    </div>
    ${placementCard()}
    <section class="section card"><h2 class="section-title">${esc(t('tests.recent'))}</h2>${results}</section>
    <section class="section card"><h2 class="section-title">${esc(t('tests.mistakes'))}</h2>${mistakeIntro}${mistakeList}${mistakeAction}</section>`;
}

/* ---------------- placement test ---------------- */

// Einstufungstest (see engine/placement.js): the card on the tests page, the questions and the result.
function placementCard() {
  const placed = placementIds(state).length;
  return `<section class="section card"><h2 class="section-title">${esc(t('place.title'))}</h2>
      <p class="muted small">${esc(t('place.cardText'))}</p>
      ${placed ? `<p class="small" style="margin-top:8px">${esc(t('place.placed', { n: placed }))}</p>` : ''}
      <div class="hero-actions"><a class="btn${placed ? '' : ' btn-primary'}" href="#/placement">${esc(t(ui.placement ? 'place.resume' : 'place.open'))}</a>${placed ? `<button class="btn btn-ghost" data-action="placement-undo">${esc(t('place.undo'))}</button>` : ''}</div>
    </section>`;
}

function viewPlacement() {
  const p = ui.placement;
  if (!p) {
    return emptyState(t('place.title'), t('place.lead'), `<button class="btn btn-primary" data-action="placement-start">${esc(t('place.start'))}</button><a class="btn" href="#/tests">${esc(t('place.back'))}</a>`);
  }
  const total = p.questions.length;
  if (p.index < total) {
    const q = p.questions[p.index];
    const v = vocabById.get(q.vocabId);
    return `
    <div class="study">
      <div class="progress-head"><span>${esc(t('place.label'))} ${pad(p.index + 1)} / ${pad(total)}</span><button class="btn btn-ghost btn-sm" data-action="placement-discard">${esc(t('place.cancel'))}</button></div>
      <div class="bar" role="progressbar" aria-label="${esc(t('card.progress'))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${p.index}"><span style="width:${(p.index / total) * 100}%"></span></div>
      <h1 class="sr-only" tabindex="-1">${esc(t('place.label'))} ${esc(t('card.of', { p: p.index + 1, t: total }))}</h1>
      <div class="flashcard-face place-stage">
        <span class="card-dir">${esc(t('place.question', { l: t('test.lang.en') }))}</span>
        <span class="card-prompt" lang="${NL}">${esc(v.german)}</span>
      </div>
      <div class="place-options">${q.options.map((id) => `<button class="btn place-option" data-action="placement-answer" data-id="${id}" lang="${TL}">${esc(vocabById.get(id).english)}</button>`).join('')}</div>
      <div class="place-skip"><button class="btn btn-ghost" data-action="placement-answer" data-id="">${esc(t('place.dontKnow'))}</button></div>
    </div>`;
  }
  const r = placementResult(p.questions, p.answers);
  const skip = p.skip ?? [];
  const rows = Object.entries(r.levels)
    .map(([level, row]) => {
      const count = placementSkipCount(VOCABULARY, state, [level]);
      const on = skip.includes(level);
      return `<li class="place-row"><div><div class="word">${esc(level)} · ${esc(t(`place.level.${level}`))}</div><div class="meaning">${esc(t('place.score', { c: row.correct, t: row.total }))}</div></div>
        ${row.pass ? `<button class="btn btn-sm place-toggle${on ? ' is-on' : ''}" data-action="placement-toggle" data-id="${level}" aria-pressed="${on}">${on ? icon('check', 14) : ''}${esc(t('place.skip', { n: count }))}</button>` : `<span class="pill">${esc(t('place.keep'))}</span>`}</li>`;
    })
    .join('');
  const bulk = placementSkipCount(VOCABULARY, state, skip);
  const single = r.knownIds.filter((id) => !skip.includes(vocabById.get(id).cefr)).length;
  const sum = bulk + single;
  return `
    <p class="eyebrow"><a href="#/tests" class="back-link">${esc(t('nav.tests'))}</a> · ${esc(t('place.title'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('place.resultTitle', { c: r.knownIds.length, t: total }))}</h1>
    <p class="lead">${esc(t('place.resultLead'))}</p>
    <section class="section card"><ul class="list">${rows}</ul><p class="muted small" style="margin-top:12px">${esc(t('place.passHint'))}</p></section>
    <section class="section card"><p>${esc(t(sum ? 'place.summary' : 'place.summaryNone', { n: sum }))}</p>
      <div class="hero-actions">${sum ? `<button class="btn btn-primary" data-action="placement-apply">${esc(t('place.apply', { n: sum }))}</button>` : ''}<button class="btn${sum ? '' : ' btn-primary'}" data-action="placement-discard">${esc(t('place.discard'))}</button></div>
      <p class="muted small" style="margin-top:10px">${esc(t('place.undoHint'))}</p>
    </section>`;
}

const VERDICT_KEY = { correct: 'test.correct', almost: 'test.almost', synonym: 'test.synonym', wrong: 'test.wrong' };

function viewTest(id) {
  const test = state.tests.find((x) => x.id === id);
  if (!test) return emptyState(t('tests.notFound'), t('tests.notFoundText'), `<a class="btn btn-primary" href="#/tests">${esc(t('nav.tests'))}</a>`);
  if (test.completedAt) return viewResult(id);
  const q = test.questions[test.currentIndex];
  const vocab = vocabById.get(q.vocabId);
  const total = test.questions.length;
  const isSentence = q.kind === 'sentence';
  const answered = awaitingNext(test);
  const target = t(q.direction === 'de-en' ? 'test.lang.en' : 'test.lang.de');
  const promptLang = q.direction === 'de-en' ? NL : TL;
  const answerLang = q.direction === 'de-en' ? TL : NL;

  let body;
  if (!answered) {
    body = `
      <form class="answer-form" data-form="answer" data-id="${test.id}" data-token="${esc(testToken(test))}" autocomplete="off">
        <label class="sr-only" for="answer-input">${esc(t('test.inputLabel', { lang: target }))}</label>
        <input class="input" id="answer-input" name="answer" type="text" lang="${answerLang}"
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${esc(t('test.placeholder', { lang: target }))}" required />
        <button class="btn btn-primary btn-block" type="submit">${esc(t('test.check'))}</button>
      </form>`;
  } else {
    const a = test.answers.at(-1);
    const good = a.isCorrect;
    const title = t(a.overridden ? 'test.overridden' : VERDICT_KEY[a.verdict]);
    body = `
      <div class="feedback ${good ? 'good' : 'bad'}" role="status">
        <p class="feedback-title">${icon(good ? 'check' : 'cross', 20)} ${esc(title)}</p>
        <p class="small" style="margin-top:6px">${esc(t('test.yourAnswer'))}: <strong>${esc(a.given || '–')}</strong></p>
        <p class="small">${esc(t(a.synonym ? 'test.asked' : 'test.solution'))}: <strong lang="${answerLang}">${esc(a.expected)}</strong></p>
        ${!good && a.confusedWith ? `<p class="small">${esc(t('test.confused', { g: a.given, w: a.confusedWith }))}</p>` : ''}
        ${isSentence ? `<p class="small" style="margin-top:6px">${esc(t('sent.keyWord'))}: <strong lang="${TL}">${esc(vocab.english)}</strong> = <span lang="${NL}">${esc(vocab.german)}</span></p>` : `<p class="small muted" style="margin-top:6px" lang="${TL}">${esc(vocab.exampleEn)}</p>
        <p class="small muted" lang="${NL}">${esc(vocab.exampleDe)}</p>`}
        ${vocab.note ? `<p class="small muted" style="margin-top:6px" lang="${NL}">${esc(vocab.note)}</p>` : ''}
        <div class="feedback-actions">
          <button class="btn btn-primary" data-action="next-question" data-id="${test.id}" id="next-btn">${esc(t(test.currentIndex + 1 === total ? 'test.showResult' : 'test.next'))}</button>
          ${!good && !a.overridden ? `<button class="btn" data-action="override" data-id="${test.id}">${esc(t('test.override'))}</button>` : ''}
        </div>
      </div>`;
  }

  return `
    <div class="study">
      <div class="progress-head"><span>${esc(testName(test))} · ${esc(t('test.question', { p: pad(test.currentIndex + 1), t: pad(total) }))}</span><a class="btn btn-ghost btn-sm" href="#/tests">${esc(t('act.pause'))}</a></div>
      <div class="bar" role="progressbar" aria-label="${esc(t('test.progress'))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${test.answers.length}"><span style="width:${(test.answers.length / total) * 100}%"></span></div>
      <div class="flashcard-face" style="min-height:200px;cursor:default">
        <span class="card-dir">${dirLabel(q.direction)}</span>
        <h1 class="card-prompt${isSentence ? ' is-sentence' : ''}" lang="${promptLang}" tabindex="-1">${esc(isSentence ? vocab.exampleDe : promptFor(vocab, q.direction))}</h1>
        <span class="card-hint">${esc(t(isSentence ? 'test.translateSentence' : 'test.translateTo', { lang: target }))}</span>
      </div>
      ${body}
    </div>`;
}

function viewResult(id) {
  const test = state.tests.find((x) => x.id === id);
  if (!test || !test.completedAt) return viewTest(id);
  const s = testSummary(test);
  let comparison = '';
  if (test.type === 'weekly') {
    const previous = state.tests.filter((x) => x.type === 'weekly' && x.completedAt && x.completedAt < test.completedAt).at(-1);
    if (previous) {
      const diff = s.accuracy - testSummary(previous).accuracy;
      comparison = `<p class="metric-sub">${esc(diff === 0 ? t('result.same') : t(diff > 0 ? 'result.better' : 'result.worse', { n: diff }))}</p>`;
    } else {
      comparison = `<p class="metric-sub">${esc(t('result.firstWeekly'))}</p>`;
    }
  }
  const row = (a) => {
    const v = vocabById.get(a.vocabId);
    const note = a.isCorrect
      ? a.overridden
        ? t('result.manual')
        : a.verdict === 'almost'
          ? t('result.typo', { g: a.given })
          : a.verdict === 'synonym'
            ? t('result.synonym', { g: a.given })
            : ''
      : t('result.given', { g: a.given || '–' });
    return `<li><div><div class="word" lang="${a.direction === 'de-en' ? 'en' : 'de'}">${esc(a.expected)}</div><div class="meaning">${esc(a.kind === 'sentence' ? v.exampleDe : promptFor(v, a.direction))}${esc(note)}</div></div></li>`;
  };
  return `
    <p class="eyebrow">${esc(testName(test))} · ${esc(fmtDay(test.completedDay))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('result.title'))}</h1>
    <section class="card section">
      <p class="result-score">${s.correct} / ${s.total} <span class="muted" style="font-size:20px;font-weight:550">${esc(t('result.correct'))}</span></p>
      <p class="metric-sub">${esc(t('result.accuracy', { n: s.accuracy }))}</p>
      ${s.selfCorrected ? `<p class="metric-sub">${esc(t('result.selfCorrected', { n: s.selfCorrected }))}</p>` : ''}
      ${comparison}
    </section>
    <div class="section grid grid-2">
      <section class="card"><h2 class="section-title">${esc(t('result.correctList', { n: s.correctAnswers.length }))}</h2>${s.correctAnswers.length ? `<ul class="list">${s.correctAnswers.map(row).join('')}</ul>` : `<p class="muted small">${esc(t('result.none'))}</p>`}</section>
      <section class="card"><h2 class="section-title">${esc(t('result.incorrectList', { n: s.incorrectAnswers.length }))}</h2>${s.incorrectAnswers.length ? `<ul class="list">${s.incorrectAnswers.map(row).join('')}</ul>` : `<p class="muted small">${esc(t('result.noneWrong'))}</p>`}${s.incorrectAnswers.length ? `<div class="hero-actions">${hardButton()}</div>` : ''}</section>
    </div>
    <section class="section card">
      <h2 class="section-title">${esc(t('result.toReview'))}</h2>
      ${s.wordsToReview.length ? `<p class="muted small">${s.wordsToReview.map((vid) => `<span lang="${TL}">${esc(vocabById.get(vid).english)}</span>`).join(' · ')}</p><p class="muted small" style="margin-top:8px">${esc(t('result.toReviewHint'))}</p>` : `<p class="muted small">${esc(t('result.allGood'))}</p>`}
    </section>
    <div class="hero-actions">${learnAheadTarget() ? actionButton(learnAheadTarget()) : ''}<a class="btn${learnAheadTarget() ? '' : ' btn-primary'}" href="#/">${esc(t('act.dashboard'))}</a><a class="btn" href="#/tests">${esc(t('act.allTests'))}</a></div>`;
}

/* ---------------- progress ---------------- */

function lineChart(points, { label, max }) {
  const w = 600;
  const h = 180;
  const padL = 32;
  const padB = 24;
  const padT = 12;
  const top = Math.max(max ?? Math.max(...points.map((p) => p.value)), 1);
  const x = (i) => padL + (points.length === 1 ? (w - padL) / 2 : (i * (w - padL - 8)) / (points.length - 1));
  const y = (v) => padT + (h - padT - padB) * (1 - v / top);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${h - padB} L${x(0).toFixed(1)},${h - padB} Z`;
  const ticks = [0, Math.round(top / 2), top];
  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return `
    <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
      ${ticks.map((tick) => `<line class="axis" x1="${padL}" x2="${w}" y1="${y(tick)}" y2="${y(tick)}" stroke-dasharray="${tick ? '2 4' : ''}"/><text x="0" y="${y(tick) + 4}">${tick}</text>`).join('')}
      ${points.length > 1 ? `<path class="area" d="${area}"/><path class="series" d="${path}"/>` : ''}
      ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="${points.length > 12 ? 2.5 : 3.5}"/>`).join('')}
      ${labelIdx.map((i) => `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(points[i].label)}</text>`).join('')}
    </svg>`;
}

// Searchable list of every word you have met – like the card browser in Anki or the word list in Quizlet.
const WORD_FILTERS = {
  all: () => true,
  starred: (p) => isStarred(state, p.vocabId),
  hard: (p) => isHardWord(p) || (p.wrongCount > 0 && p.status !== 'known'),
  mastered: (p) => p.status === 'mastered',
  known: (p) => p.status === 'known',
};

function wordList() {
  const q = ui.search.trim().toLowerCase();
  const filter = WORD_FILTERS[ui.wordFilter] ? ui.wordFilter : 'all';
  const met = Object.values(state.progress).filter((p) => p.firstLearnedDay || p.status === 'known');
  const rows = met
    .filter(WORD_FILTERS[filter])
    .map((p) => ({ p, v: vocabById.get(p.vocabId) }))
    .filter(({ v }) => !q || v.english.toLowerCase().includes(q) || v.german.toLowerCase().includes(q))
    .sort((a, b) => a.v.english.replace(/^to /, '').localeCompare(b.v.english.replace(/^to /, '')));
  const status = (p) => (p.status === 'known' ? t('prog.known') : t(STATUS_KEY[p.status] ?? 'prog.sLearning'));
  const items = rows
    .map(
      ({ p, v }) => `<li><div><div class="word" lang="${TL}">${esc(v.english)}</div><div class="meaning" lang="${NL}">${esc(v.german)}</div>
        <div class="meaning small">${esc(status(p))}${p.nextDueDay && p.status !== 'known' ? ` · ${esc(t('words.next', { d: fmtDay(p.nextDueDay) }))}` : ''}${p.wrongCount ? ` · ${esc(t('tests.wrongCount', { n: p.wrongCount }))}` : ''}</div></div>
        <span class="sentence-meta">${p.status === 'known' ? '' : starButton(v)}<button class="icon-btn" data-action="speak" data-field="english" data-id="${v.id}" aria-label="${esc(t('audio.word'))}${esc(t('audio.listen'))}: ${esc(v.english)}">${icon('speaker')}</button></span></li>`,
    )
    .join('');
  const total = met.length;
  const chip = (key) => {
    const n = met.filter(WORD_FILTERS[key]).length;
    return `<label class="scope-chip"><input type="radio" name="wordFilter" value="${key}" data-ui="wordFilter" ${filter === key ? 'checked' : ''}><span>${key === 'starred' ? icon('star', 14) : ''}${esc(t(`words.f.${key}`))} <b>${n}</b></span></label>`;
  };
  return `
    <section class="section card">
      <h2 class="section-title">${esc(t('words.title', { n: total }))}</h2>
      ${total
        ? `<div class="scope-row" role="radiogroup" aria-label="${esc(t('words.filter'))}" style="margin-bottom:12px">${Object.keys(WORD_FILTERS).map(chip).join('')}</div>
           <label class="sr-only" for="word-search">${esc(t('words.search'))}</label>
           <input class="input" id="word-search" type="search" placeholder="${esc(t('words.search'))}" value="${esc(ui.search)}" autocomplete="off" spellcheck="false" />
           ${rows.length ? `<ul class="list word-list">${items}</ul>` : `<p class="muted small" style="margin-top:12px">${esc(t('words.noMatch'))}</p>`}`
        : `<p class="muted small">${esc(t('words.empty'))}</p>`}
    </section>`;
}

// Bars for the next seven days: words and sentences that will be due.
function forecastChart() {
  const days = reviewForecast(state, today(), 7);
  const max = Math.max(1, ...days.map((d) => d.words + d.sentences));
  const fmt = new Intl.DateTimeFormat(LOCALES[prefs.lang] ?? 'de-DE', { weekday: 'short', timeZone: 'UTC' });
  const label = (d, i) => (i === 0 ? t('forecast.today') : fmt.format(new Date(`${d.day}T12:00:00Z`)));
  const total = days.reduce((n, d) => n + d.words + d.sentences, 0);
  if (!total) return `<p class="muted small">${esc(t('forecast.empty'))}</p>`;
  return `<div class="forecast" role="list">${days
    .map(
      (d, i) => `<div class="fc-day" role="listitem" aria-label="${esc(`${label(d, i)}: ${t('forecast.aria', { w: d.words, s: d.sentences })}`)}">
        <span class="fc-num">${d.words + d.sentences || ''}</span>
        <span class="fc-bar"><span class="fc-s" style="height:${(d.sentences / max) * 100}%"></span><span class="fc-w" style="height:${(d.words / max) * 100}%"></span></span>
        <span class="fc-label">${esc(label(d, i))}</span>
      </div>`,
    )
    .join('')}</div>
    <div class="legend"><span><i class="c-reviewing"></i>${esc(t('forecast.words'))}</span><span><i class="c-sentences"></i>${esc(t('forecast.sentences'))}</span></div>`;
}

// Learning calendar: one square per day for the last 18 weeks, darker = more answers.
function activityCalendar() {
  const map = activityByDay(state);
  const day = today();
  const weeks = 18;
  const start = addDays(weekStart(day), -7 * (weeks - 1));
  const cells = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = addDays(start, i);
    const n = d > day ? -1 : map.get(d) ?? 0;
    const level = n <= 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
    cells.push(`<i class="cal-cell l${n < 0 ? 'x' : level}" title="${esc(`${fmtDay(d)}: ${Math.max(n, 0)}`)}"></i>`);
  }
  const active = [...map.keys()].filter((d) => d >= start).length;
  return `<div class="calendar" role="img" aria-label="${esc(t('cal.aria', { n: active, w: weeks }))}">${cells.join('')}</div>
    <p class="muted small" style="margin-top:10px">${esc(t(map.size === 1 ? 'cal.summary1' : 'cal.summary', { n: map.size, a: [...map.values()].reduce((x, y) => x + y, 0) }))}</p>`;
}

// Progress: today first – the plan, what you did, how long, the streak.
function progressToday(stats) {
  const day = today();
  const d = daySummary(state, day);
  const plan = planSteps(stats);
  const doneCount = plan.steps.filter((x) => x.done).length;
  const streak = learningStreak(state, day);
  const target = continueTarget();
  const item = (value, label, tone, i = 0) => `<div class="today-stat tone-${tone}" style="--i:${i}"><span class="today-num">${value}</span><span class="today-label">${esc(label)}</span></div>`;
  const items = [
    item(d.newWords, t('prog.tNewWords'), 'green', 0),
    item(d.reviews, t('prog.tReviews'), 'blue', 1),
    item(d.sentences, t('prog.tSentences'), 'violet', 2),
    item(d.practice, t('prog.tPractice'), 'amber', 3),
    item(d.tests ? `${d.tests}${d.testAccuracy === null ? '' : ` · ${d.testAccuracy} %`}` : 0, t('prog.tTests'), 'rose', 4),
    hasGrammar() ? item(d.grammar, t('prog.tGrammar'), 'teal', 5) : '',
  ].join('');
  const headline = d.answered ? t('prog.todayLine', { n: d.answered, m: d.minutes }) : t('prog.todayNone');
  return `
    <section class="section card today-card" aria-labelledby="today-title">
      <div class="today-head">
        <div>
          <p class="eyebrow" id="today-title">${esc(t('prog.today'))} · ${esc(longDate())}</p>
          <h2 class="today-headline">${esc(headline)}</h2>
          <p class="muted small streak ${streak.days ? 'is-on' : ''}">${esc(streak.days ? t(`${streak.today ? 'prog.streakOn' : 'prog.streakKeep'}${streak.days === 1 ? '1' : ''}`, { n: streak.days }) : t('prog.streakNone'))}</p>
        </div>
        <div class="hero-ring">${ring(doneCount, plan.steps.length)}<span class="ring-caption">${esc(t('dash.ringCaption'))}</span></div>
      </div>
      <div class="today-stats">${items}</div>
      ${target ? `<div class="hero-actions">${actionButton(target)}</div>` : ''}
    </section>`;
}

// The last seven days as bars: answered cards per day.
function progressWeek() {
  const days = lastSevenDays(state, today());
  const max = Math.max(1, ...days.map((x) => x.answered));
  const total = days.reduce((n, x) => n + x.answered, 0);
  const active = days.filter((x) => x.answered).length;
  const wd = new Intl.DateTimeFormat(LOCALES[prefs.lang] ?? 'de-DE', { weekday: 'short', timeZone: 'UTC' });
  const bar = (x, i) => `<div class="week-bar ${x.day === today() ? 'is-today' : ''}" style="--i:${i}" title="${esc(fmtDay(x.day))}: ${x.answered}">
      <span class="week-count">${x.answered || ''}</span>
      <span class="week-fill" style="height:${Math.round((x.answered / max) * 100)}%"></span>
      <span class="week-day">${esc(wd.format(new Date(`${x.day}T12:00:00Z`)))}</span>
    </div>`;
  return `
    <section class="section card" aria-labelledby="week-title">
      <h2 class="section-title" id="week-title">${esc(t('prog.week7'))}</h2>
      <p class="muted small">${esc(t('prog.week7Sub', { a: active, n: total }))}</p>
      <div class="week-bars" role="img" aria-label="${esc(days.map((x) => `${fmtDay(x.day)}: ${x.answered}`).join(', '))}">${days.map(bar).join('')}</div>
    </section>`;
}

// Everything you can learn here, at a glance: words, sentences, topics, grammar.
function progressAreas(stats) {
  const sp = state.sentenceProgress ?? {};
  const sentencesLearned = Object.values(sp).filter((p) => p.firstLearnedDay && p.status !== 'known').length;
  const area = (href, label, value, total, sub, tone) => {
    const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
    return `<a class="card area-card tone-${tone}" href="${href}">
        <p class="metric-label">${esc(label)}</p>
        <p class="metric-value">${value}<span class="area-total"> / ${total}</span></p>
        <span class="topic-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        <p class="metric-sub">${esc(sub)}</p>
      </a>`;
  };
  const topicsStarted = topicsFor(course.id).filter((tp) => VOCABULARY.some((v) => TOPIC_OF[v.id] === tp.id && isLearned(state.progress[v.id]))).length;
  const grammarDone = GRAMMAR.filter((g) => state.grammar?.[g.id]).length;
  const grammarAvg = grammarDone ? Math.round((GRAMMAR.reduce((n, g) => n + (state.grammar?.[g.id] ? state.grammar[g.id].best / state.grammar[g.id].total : 0), 0) / grammarDone) * 100) : null;
  return `
    <section class="section" aria-labelledby="areas-title">
      <div class="section-head"><h2 class="section-title" id="areas-title">${esc(t('prog.areas'))}</h2></div>
      <div class="area-grid">
        ${area('#/lessons', t('prog.aWords'), stats.totalVocabulary, VOCABULARY.length, t('prog.aWordsSub', { m: stats.mastered, d: stats.reviewsDue }), 'green')}
        ${area('#/sentences', t('prog.aSentences'), sentencesLearned, VOCABULARY.filter((v) => v.exampleEn).length, t('prog.aSentencesSub'), 'violet')}
        ${area('#/topics', t('prog.aTopics'), topicsStarted, topicsFor(course.id).length, t('prog.aTopicsSub'), 'amber')}
        ${hasGrammar() ? area('#/grammar', t('prog.aGrammar'), grammarDone, GRAMMAR.length, grammarAvg === null ? t('grammar.notYet') : t('prog.aGrammarSub', { p: grammarAvg }), 'teal') : ''}
      </div>
    </section>`;
}

function viewProgress() {
  const stats = computeStats(state, today());
  const metric = (labelKey, value, subText) =>
    `<div class="card"><p class="metric-label">${esc(t(labelKey))}</p><p class="metric-value">${esc(value)}</p><p class="metric-sub">${esc(subText)}</p></div>`;
  const statusTotal = stats.learningOnly + stats.reviewing + stats.mastered;
  const pct = (n) => (statusTotal ? (n / statusTotal) * 100 : 0);
  const sL = t('prog.sLearning');
  const sR = t('prog.sReviewing');
  const sM = t('prog.sMastered');

  const growth = stats.growth.length
    ? lineChart(stats.growth.map((g) => ({ value: g.total, label: fmtDay(g.day) })), { label: t('prog.growthSub') })
    : `<p class="muted small">${esc(t('prog.growthEmpty'))}</p>`;
  const tests = stats.testSeries.length
    ? lineChart(stats.testSeries.slice(-20).map((x) => ({ value: x.accuracy, label: fmtDay(x.day) })), { label: t('prog.tests'), max: 100 })
    : `<p class="muted small">${esc(t('prog.testsEmpty'))}</p>`;

  return `
    <div class="progress-page">
    <p class="eyebrow">${esc(t('prog.eyebrow'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('prog.title'))}</h1>
    <p class="lead">${esc(t('prog.lead'))}</p>
    ${progressToday(stats)}
    ${progressWeek()}
    ${progressAreas(stats)}
    </div>
    <h2 class="section-title section" style="margin-bottom:0">${esc(t('prog.details'))}</h2>
    <div class="section grid grid-2">
      ${metric('prog.mastered', stats.mastered, t('prog.masteredSub'))}
      ${metric('prog.learning', stats.learning, t('prog.learningSub'))}
      ${metric('prog.accuracy', stats.testAccuracy === null ? '–' : `${stats.testAccuracy} %`, t(stats.testAccuracy === null ? 'prog.accuracyNone' : 'prog.accuracySub'))}
      ${metric('prog.known', stats.known, t('prog.knownSub'))}
      ${metric('prog.hard', stats.hard, t('prog.hardSub'))}
    </div>
    <section class="section card">
      <h2 class="section-title">${esc(t('prog.weeks'))}</h2>
      <ul class="list weeks-list">${[...stats.weeks].reverse().map((w) => `<li><div><div class="word">${esc(t('prog.weekOf', { d: fmtDay(w.week) }))}</div><div class="meaning">${esc(t('prog.weekLine', { l: w.learned, a: w.answered }))}${w.accuracy === null ? '' : esc(t('prog.weekTest', { p: w.accuracy }))}</div></div></li>`).join('')}</ul>
    </section>
    <div class="section grid grid-2">
      <section class="card"><h2 class="section-title">${esc(t('forecast.title'))}</h2>${forecastChart()}</section>
      <section class="card"><h2 class="section-title">${esc(t('cal.title'))}</h2>${activityCalendar()}</section>
    </div>
    ${wordList()}
    <section class="section card">
      <h2 class="section-title">${esc(t('prog.growth'))}</h2>
      <p class="muted small">${esc(t('prog.growthSub'))}</p>
      ${growth}
    </section>
    <section class="section card">
      <h2 class="section-title">${esc(t('prog.status'))}</h2>
      ${statusTotal
        ? `<div class="stack" role="img" aria-label="${esc(`${sL} ${stats.learningOnly}, ${sR} ${stats.reviewing}, ${sM} ${stats.mastered}`)}">
            <span class="c-learning" style="width:${pct(stats.learningOnly)}%"></span>
            <span class="c-reviewing" style="width:${pct(stats.reviewing)}%"></span>
            <span class="c-mastered" style="width:${pct(stats.mastered)}%"></span>
          </div>
          <div class="legend"><span><i class="c-learning"></i>${esc(sL)} ${stats.learningOnly}</span><span><i class="c-reviewing"></i>${esc(sR)} ${stats.reviewing}</span><span><i class="c-mastered"></i>${esc(sM)} ${stats.mastered}</span></div>`
        : `<p class="muted small">${esc(t('prog.statusEmpty'))}</p>`}
      <p class="muted small" style="margin-top:12px">${esc(t('prog.rule', { d: INTERVALS[MASTERY.minStage], c: MASTERY.minConsecutive, t: MASTERY.minTypedCorrect }))}</p>
      <p class="muted small" style="margin-top:8px">${esc(t('prog.srs'))}</p>
    </section>
    <section class="section card">
      <h2 class="section-title">${esc(t('prog.tests'))}</h2>
      ${tests}
    </section>`;
}

/* ---------------- settings ---------------- */

function radio(name, value, current, label, kind = 'setting', hint = '') {
  return `<label><input type="radio" name="${name}" value="${esc(value)}" ${String(current) === String(value) ? 'checked' : ''} data-${kind}="${name}"><span>${esc(label)}${hint ? `<small class="opt-hint">${esc(hint)}</small>` : ''}</span></label>`;
}

const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Which voice is used, how natural it is, and – if it is a robotic standard voice – how to get a better one.
function voiceQualityBlock(accent) {
  const voice = speaker.currentVoice(accent, prefs.deviceVoice);
  if (!voice) return `<p class="muted small" style="margin-top:8px">${esc(t('set.deviceTip'))}</p>`;
  const quality = voiceQuality(voice);
  const line = `<p class="small" style="margin-top:10px">${esc(t('voice.current'))}: <strong>${esc(voice.name)}</strong> <span class="pill ${quality === 'standard' ? 'bad' : 'good'}">${esc(t(`voice.q.${quality}`))}</span></p>`;
  if (quality !== 'standard') return `${line}<p class="muted small" style="margin-top:6px">${esc(t('voice.good'))}</p>`;
  const steps = (IS_IOS ? ['voice.ios1', 'voice.ios2', 'voice.ios3', 'voice.ios4'] : ['voice.mac1', 'voice.mac2', 'voice.mac3']).map((k) => `<li>${esc(t(k))}</li>`).join('');
  return `${line}
    <div class="notice voice-help" style="margin-top:10px">
      <p><strong>${esc(t('voice.robotic'))}</strong></p>
      <ol>${steps}</ol>
      <p style="margin-top:8px">${esc(t('voice.orEleven'))}</p>
      <div class="hero-actions" style="margin-top:8px"><button class="btn btn-sm" data-action="use-eleven">${esc(t('voice.useEleven'))}</button></div>
    </div>`;
}

// Result of a connection test with an explanation and what to do. `shared` picks the wording for the server's own key.
function testResult(r, shared = false) {
  if (!r) return '';
  if (r.state === 'running') return `<p class="small" style="margin-top:8px" role="status">${esc(t('set.testRunning'))}</p>`;
  if (r.state === 'ok') return `<p class="notice" style="margin-top:8px;background:var(--good-bg);color:var(--good)" role="status">${icon('check', 14)} ${esc(t(shared ? 'set.sharedTestOk' : 'set.testOk'))}</p>`;
  const helpKey = shared && t(`audio.help.${r.reason}.shared`) !== `audio.help.${r.reason}.shared` ? `audio.help.${r.reason}.shared` : `audio.help.${r.reason}`;
  return `<div class="notice error" style="margin-top:8px" role="alert"><strong>${esc(t(`audio.reason.${r.reason}`))}</strong>
      <p class="small" style="margin-top:4px">${esc(t(helpKey))}</p>
      ${r.detail ? `<p class="small muted" style="margin-top:4px">${esc(t('set.testDetail'))}: ${esc(r.detail)}</p>` : ''}</div>`;
}

function sharedTestBlock() {
  const r = ui.sharedTest;
  return `<div class="hero-actions" style="margin-top:8px"><button class="btn btn-sm" data-action="test-shared" ${r?.state === 'running' ? 'disabled' : ''}>${esc(t('set.sharedTest'))}</button></div>${testResult(r, true)}`;
}

function elevenTestBlock() {
  const r = ui.elevenTest;
  return `<div class="hero-actions" style="margin-top:8px"><button class="btn btn-sm" data-action="test-eleven" ${r?.state === 'running' ? 'disabled' : ''}>${esc(t('set.elevenTest'))}</button></div>${testResult(r)}`;
}

const otherCourse = () => Object.values(COURSES).find((c) => c.id !== course.id);

function switchCourse(id) {
  setPrefs({ course: id, lang: courseFor(id).defaultUiLang });
  location.hash = '';
  location.reload();
}

function viewSettings() {
  const s = state.settings;
  const source = chosenSource();
  const eleven = source === 'elevenlabs';
  const voices = speaker.englishVoices(s.accent);

  const deviceBlock = `
    <fieldset class="field" style="border:0;padding:0;margin:16px 0 0">
      <legend>${esc(t('set.accent'))}</legend>
      <div class="segmented">${course.accents.map((a) => radio('accent', a.value, s.accent, t(a.label))).join('')}</div>
    </fieldset>
    <div class="field" style="margin-top:16px">
      <label for="device-voice">${esc(t('set.deviceVoice'))}</label>
      <select class="input select" id="device-voice" data-pref="deviceVoice" ${voices.length ? '' : 'disabled'}>
        <option value="">${esc(t('set.deviceAuto'))}${voices[0] ? ` (${esc(voices[0].name)})` : ''}</option>
        ${voices.map((v) => `<option value="${esc(v.name)}" ${prefs.deviceVoice === v.name ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)} · ${esc(t(`voice.q.${voiceQuality(v)}`))}</option>`).join('')}
      </select>
    </div>
    ${voiceQualityBlock(s.accent)}`;

  const sharedVoices = sharedVoiceList();
  const voicePicker = sharedVoices.length > 1 && activeSource() === 'shared'
    ? `<fieldset class="field" style="border:0;padding:0;margin:16px 0 0"><legend>${esc(t('set.sharedVoice'))}</legend>
        <div class="segmented stacked">${sharedVoices.map((v) => radio('sharedVoice', v.id, sharedVoiceId(), voiceLabel(v), 'pref')).join('')}</div>
        <div class="hero-actions">${sharedVoices.map((v) => `<button class="btn btn-sm" data-action="sample-voice" data-voice="${esc(v.id)}" aria-label="${esc(`${t('set.voiceTry')}: ${v.name}`)}">${icon('volume', 14)} ${esc(v.name)}</button>`).join('')}</div></fieldset>`
    : '';
  const sharedBlock = `
    <p class="small" style="margin-top:12px">${esc(activeSource() === 'shared' ? t('set.sharedOn') : t('set.sharedOff'))}</p>
    ${sharedTestBlock()}`;

  const keyBlock = prefs.elevenKey
    ? `<p class="small" style="margin-top:4px">${icon('check', 14)} ${esc(t('set.elevenSaved', { k: prefs.elevenKey.slice(-4) }))}</p>
       <div class="hero-actions" style="margin-top:8px"><button class="btn btn-sm" data-action="remove-key">${esc(t('set.elevenRemove'))}</button></div>`
    : `<form class="answer-form" data-form="eleven-key" style="margin-top:4px" autocomplete="off">
         <input class="input" id="eleven-key" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk_…" aria-describedby="eleven-key-hint" />
         <button class="btn" type="submit">${esc(t('set.elevenSave'))}</button>
       </form>
       <p class="notice" style="margin-top:8px">${esc(t('set.elevenMissing'))}</p>`;

  const elevenBlock = `
    <div class="field" style="margin-top:16px">
      <label for="eleven-key">${esc(t('set.elevenKey'))}</label>
      <p class="muted small" id="eleven-key-hint">${esc(t('set.elevenKeyHint'))}</p>
      ${keyBlock}
      ${prefs.elevenKey ? elevenTestBlock() : ''}
    </div>
    <fieldset class="field" style="border:0;padding:0;margin:16px 0 0">
      <legend>${esc(t('set.elevenVoice'))}</legend>
      <div class="segmented stacked">${ELEVEN_VOICES.map((v) => radio('elevenVoice', v.id, prefs.elevenVoice, `${v.name} (${v.accent})`, 'pref', v[prefs.lang] ?? v.en)).join('')}</div>
    </fieldset>
    <p class="muted small" style="margin-top:8px">${esc(t('set.elevenCost'))}</p>`;

  const canTest = usingCloud() || speaker.hasEnglishVoice();
  const fieldset = (legend, body, first = false) => `<fieldset class="field" style="border:0;padding:0;margin:${first ? 0 : 16}px 0 0"><legend>${esc(legend)}</legend>${body}</fieldset>`;
  const onOff = (name, current) => `<div class="segmented">${radio(name, 'true', String(current), t('set.on'))}${radio(name, 'false', String(current), t('set.off'))}</div>`;
  return `
    <p class="eyebrow">${esc(t('nav.settings'))}</p>
    <h1 class="page-title" tabindex="-1">${esc(t('set.title'))}</h1>
    ${accountSection()}
    <section class="section card">
      <h2 class="section-title">${esc(t('set.learning'))}</h2>
      ${fieldset(t('set.lessonSize'), `<div class="segmented">${LESSON_SIZES.map((n) => radio('lessonSize', n, lessonSize(state), String(n), 'setting', n >= INTENSIVE_FROM ? t('set.intensive') : '')).join('')}</div>`, true)}
      ${fieldset(t('set.lessonOrder'), `<div class="segmented stacked">${LESSON_ORDERS.map((o) => radio('lessonOrder', o, lessonOrder(state), t(`set.order.${o}`), 'setting', t(`set.order.${o}Hint`))).join('')}</div>`)}
      ${fieldset(t('set.difficulty'), `<div class="segmented stacked">${DIFFICULTIES.map((d) => radio('difficulty', d, difficulty(state), t(`set.diff.${d}`), 'setting', t(`set.diff.${d}Hint`))).join('')}</div>`)}
      ${fieldset(t('set.typeAnswer'), onOff('typeAnswer', typeAnswerOn()))}
      <p class="muted small field-note">${esc(t('set.typeAnswerNote'))}</p>
    </section>
    ${reminderSection()}
    <section class="section card">
      <h2 class="section-title">${esc(t('set.audio'))}</h2>
      ${fieldset(t('set.audioMaster'), onOff('audio', audioOn()), true)}
      ${audioOn()
        ? `${fieldset(t('set.autoplay'), onOff('autoplay', s.autoplay !== false))}
      ${voicePicker}
      ${fieldset(t('set.speed'), `<div class="segmented">${radio('rate', 0.6, s.rate, t('set.verySlow'))}${radio('rate', 0.8, s.rate, t('set.slow'))}${radio('rate', 1, s.rate, t('set.normal'))}</div>`)}
      <div class="hero-actions">
        <button class="btn" data-action="speak" data-field="exampleEn" data-id="${course.dayOne[0]}" ${canTest ? '' : 'disabled'}>${icon('speaker')} ${esc(t('set.test'))}</button>
      </div>
      ${canTest ? '' : `<p class="muted small" style="margin-top:8px">${esc(t(speaker.supported ? 'audio.noVoice' : 'audio.unsupported'))}</p>`}`
        : `<p class="muted small" style="margin-top:8px">${esc(t('set.audioOffNote'))}</p>`}
    </section>
    <section class="section card">
      <h2 class="section-title">${esc(t('set.general'))}</h2>
      ${fieldset(t('set.theme'), `<div class="theme-picker">${THEMES.map((name) => `<label class="theme-option"><input type="radio" name="theme" value="${name}" ${(THEMES.includes(prefs.theme) ? prefs.theme : 'black') === name ? 'checked' : ''} data-pref="theme"><span><span class="theme-swatch is-${name}" aria-hidden="true"></span>${esc(t(`set.theme.${name}`))}</span></label>`).join('')}</div>`, true)}
      ${fieldset(t('set.language'), `<div class="segmented">${Object.entries(LANGUAGES).map(([code, label]) => `<label><input type="radio" name="lang" value="${code}" ${prefs.lang === code ? 'checked' : ''} data-pref="lang" lang="${code}"><span lang="${code}">${label}</span></label>`).join('')}</div>`, true)}
      ${fieldset(t('set.course'), `<div class="segmented stacked">${Object.values(COURSES).map((c) => radio('course', c.id, course.id, t(`course.${c.id}`), 'pref')).join('')}</div>`)}
    </section>
    <details class="section card advanced" ${ui.advancedOpen ? 'open' : ''}>
      <summary>${esc(t('set.advanced'))}</summary>
      ${audioOn()
        ? `${fieldset(t('set.source'), `<div class="segmented stacked">
          ${ui.shared?.ok || source === 'shared' ? radio('voiceSource', 'shared', source, t('set.sourceShared'), 'pref') : ''}
          ${radio('voiceSource', 'device', source, t('set.sourceDevice'), 'pref')}
          ${radio('voiceSource', 'elevenlabs', source, t('set.sourceEleven'), 'pref')}
        </div>`, true)}
      ${source === 'shared' ? sharedBlock + (activeSource() === 'device' ? deviceBlock : '') : eleven ? elevenBlock : deviceBlock}`
        : ''}
      ${fieldset(t('set.tapAnywhere'), onOff('tapAnywhere', tapAnywhereOn()), !audioOn())}
      <h2 class="section-title" style="margin-top:24px">${esc(t('set.backup'))}</h2>
      <div class="hero-actions">
        <button class="btn" data-action="export">${esc(t('set.export'))}</button>
        <label class="btn" for="import-file">${esc(t('set.import'))}</label>
        <input class="sr-only" id="import-file" type="file" accept="application/json,.json" data-action="import" />
      </div>
      <h2 class="section-title" style="margin-top:24px">${esc(t('set.reset'))}</h2>
      <div class="hero-actions"><button class="btn" data-action="reset">${esc(t('set.resetBtn'))}</button></div>
    </details>
    <p class="muted small app-version">${esc(t('set.version', { v: APP_VERSION }))} · <button class="link-btn" data-action="update-app">${esc(t('set.updateBtn'))}</button></p>`;
}

function emptyState(title, text, actions) {
  return `<section class="card empty"><h1 class="page-title" tabindex="-1">${esc(title)}</h1><p class="lead" style="margin:0 auto">${esc(text)}</p><div class="hero-actions">${actions}</div></section>`;
}

/* ---------------- render ---------------- */

const VIEWS = {
  home: viewDashboard,
  today: () => viewLesson((currentLesson(state) ?? state.lessons.at(-1))?.id),
  lessons: viewLessons,
  lesson: viewLesson,
  preview: viewPreview,
  practice: viewPractice,
  train: viewTrain,
  match: viewMatch,
  listen: viewListen,
  dictation: viewListen,
  blitz: viewBlitz,
  scramble: viewScramble,
  memory: viewMemory,
  puzzle: viewPuzzle,
  learn: viewLearn,
  review: viewReview,
  sentences: viewSentences,
  sentence: viewSentence,
  'sentence-lesson': viewSentenceLesson,
  'sentence-category': viewSentenceCategory,
  topics: viewTopics,
  grammar: viewGrammar,
  'grammar-topic': viewGrammarTopic,
  'grammar-quiz': viewGrammarQuiz,
  topic: viewTopic,
  'topic-learn': viewTopicLearn,
  situation: viewSituation,
  dialog: viewDialog,
  tests: viewTests,
  placement: viewPlacement,
  stories: viewStories,
  story: viewStory,
  music: viewMusic,
  'song-add': viewSongAdd,
  song: viewSong,
  'song-cards': viewSongCards,
  'song-learn': viewSongLearn,
  test: viewTest,
  result: viewResult,
  progress: viewProgress,
  settings: viewSettings,
};

// The look of the whole app: "Schwarz" (dark, golden) or "Beige" (light, golden) – chosen in the settings.
const THEMES = ['black', 'beige'];
const THEME_BAR = { black: '#0c0b0a', beige: '#f4ece0' };
function applyTheme() {
  const theme = THEMES.includes(prefs.theme) ? prefs.theme : 'black';
  const body = document.body;
  body.classList.add('themed');
  for (const name of THEMES) body.classList.toggle(`theme-${name}`, name === theme);
  document.documentElement.style.colorScheme = theme === 'black' ? 'dark' : 'light';
  // The chosen look decides light or dark – not the phone's own dark mode.
  document.documentElement.dataset.theme = theme === 'black' ? 'dark' : 'light';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', THEME_BAR[theme]);
}

function render() {
  const r = route();
  const view = VIEWS[r.name];
  const content = view ? view(r.param) : emptyState(t('msg.notFound'), t('msg.notFoundText'), `<a class="btn btn-primary" href="#/">${esc(t('act.dashboard'))}</a>`);
  const active = document.activeElement;
  const activeKey = active?.dataset?.action
    ? `[data-action="${active.dataset.action}"]${active.dataset.field ? `[data-field="${active.dataset.field}"]` : ''}${active.dataset.id ? `[data-id="${CSS.escape(active.dataset.id)}"]` : ''}${active.dataset.side ? `[data-side="${active.dataset.side}"]` : ''}`
    : active?.id
      ? `#${active.id}`
      : active?.dataset?.pref
        ? `[data-pref="${active.dataset.pref}"][value="${CSS.escape(active.value)}"]`
        : null;
  // The page fades in only when you arrive on it – not on every tap inside a game or card.
  root.innerHTML = renderShell(content, r.name, ui.lastRoute !== location.hash);
  applyTheme();
  // Card screens (lesson, review, practice cards) fit on one screen.
  const cardScreen = Boolean(root.querySelector('.study .flashcard'));
  document.body.classList.toggle('is-card-screen', cardScreen);
  // The page itself is locked too, so the iPhone cannot drag or bounce it while you learn.
  document.documentElement.classList.toggle('is-card-screen-root', cardScreen);
  prefetchOnScreen();
  const path = root.querySelector('.path');
  // Show the lesson you are on together with the one before it.
  const target = path?.querySelector('.is-current, .is-next');
  const focusTile = target?.previousElementSibling ?? target ?? path?.querySelector('.path-tile:last-child');
  if (path && focusTile) path.scrollLeft = Math.max(0, focusTile.offsetLeft - path.offsetLeft - 16);
  const routeKey = location.hash;
  if (ui.lastRoute !== routeKey) {
    ui.lastRoute = routeKey;
    root.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } else if (activeKey) {
    root.querySelector(activeKey)?.focus({ preventScroll: true });
  }
}

/* ---------------- actions ---------------- */

function onEnterRoute({ navigated = false } = {}) {
  const r = route();
  ui.flipped = false;
  ui.revealed = false;
  ui.typed = null;
  ui.typeDraft = '';
  if (navigated && r.name !== 'dialog') {
    ui.dialog = null;
    ui.dialogDraft = '';
  }
  if (navigated && !GAMES.includes(r.name)) stopGameTimers();
  if (navigated && r.name === 'grammar-quiz') ui.grammarQuiz = null;
  if (GAMES.includes(r.name)) {
    const scope = validScope(r.param ?? 'all');
    if (navigated || !ui.game || ui.game.type !== r.name || ui.game.scope !== scope) startGame(r.name, scope);
  }
  if (r.name === 'review') {
    const next = ensureReviewSession(state, now());
    if (next !== state) {
      commit(next);
      return;
    }
  }
  render();
  if (navigated && isListenGame(r.name) && ui.game && !ui.game.empty && !ui.game.done) playQuizWord(quizCurrent(ui.game));
}

function startGame(type, scope) {
  stopGameTimers();
  ui.game = newGame(type, scope);
  ui.flash = null;
  ui.quizHint = false;
  ui.newRecord = false;
  if (type === 'blitz' && !ui.game.empty) ui.blitzTimer = setInterval(tickBlitz, 200);
}

function stopGameTimers() {
  clearInterval(ui.blitzTimer);
  clearTimeout(ui.memoryTimer);
  clearTimeout(ui.flashTimer);
  ui.blitzTimer = null;
  ui.memoryTimer = null;
}

// Blitz: the clock only moves the bar and the number (no re-render per tick); at zero the game ends.
function tickBlitz() {
  const g = ui.game;
  if (!g || g.type !== 'blitz' || g.done || route().name !== 'blitz') {
    clearInterval(ui.blitzTimer);
    ui.blitzTimer = null;
    return;
  }
  const rem = blitzRemainingMs(g, Date.now());
  const seconds = root.querySelector('#blitz-seconds');
  const bar = root.querySelector('#blitz-bar');
  if (seconds) seconds.textContent = String(Math.ceil(rem / 1000));
  if (bar) bar.style.width = `${(rem / (g.seconds * 1000)) * 100}%`;
  if (rem <= 0) finishBlitz(blitzTick(g, Date.now()));
}

function finishBlitz(game) {
  ui.game = game;
  clearInterval(ui.blitzTimer);
  ui.blitzTimer = null;
  const best = prefs.blitzBest?.[course.id] ?? 0;
  ui.newRecord = game.score > best && game.score > 0;
  if (ui.newRecord) setPrefs({ blitzBest: { ...(prefs.blitzBest ?? {}), [course.id]: game.score } });
  render();
}

// Plays the current dictation word at normal speed – listening is practised as it really sounds;
// "slow" repeats it slowly on request.
const LISTEN_RATE = 1;
// Hören & Schreiben plays the word, Satz-Diktat its example sentence.
function playQuizWord(id, slow = false) {
  speak(id, ui.game?.type === 'dictation' ? 'exampleEn' : 'english', { quiet: true, rate: slow ? 0.6 : LISTEN_RATE });
}

function quizUpdate(next) {
  ui.game = next;
  ui.quizHint = false;
  render();
}

// Cards can be turned back and forth as often as you like; rating unlocks once the answer was seen.
function flip() {
  ui.flipped = !ui.flipped;
  const firstReveal = ui.flipped && !ui.revealed;
  if (ui.flipped) ui.revealed = true;
  render();
  root.querySelector(ui.flipped ? '#card-back' : '#card-front')?.focus({ preventScroll: true });
  if (firstReveal && autoReadActive()) {
    // Song cards: the first listen button on the back (the word, or the line) – recorded voice or read out.
    const first = route().name === 'song-cards' ? root.querySelector('#card-back .audio-row [data-action^="speak"]') : null;
    if (first?.dataset.action === 'speak-text') speakVocab(textVocab(first.dataset.id, first.dataset.text), 'english', { quiet: true });
    else if (first?.dataset.action === 'speak-device') first.click();
    else if (first) speak(first.dataset.id, first.dataset.field, { quiet: true });
    else {
      const id = root.querySelector('#card-back [data-action="speak"]')?.dataset.id;
      if (id) speak(id, route().name === 'sentence' ? 'exampleEn' : 'english', { quiet: true });
    }
  }
}

function rate(kind, vocabId, rating, token, intro = false) {
  if (Date.now() < ui.lockUntil || (!ui.revealed && !intro)) return;
  const result =
    kind === 'lesson' || kind === 'topic' || kind === 'song'
      ? rateLessonCard(state, VOCABULARY, { lessonId: kind === 'topic' ? openTopicLesson(state, route().param)?.id : kind === 'song' ? openSongLesson(state, route().param)?.id : currentLesson(state)?.id, vocabId, rating, token, now: now() })
      : kind === 'sentence'
        ? rateSentence(state, { sessionId: openSentenceSession(state)?.id, vocabId, rating, token, now: now() })
        : kind === 'practice'
          ? ratePractice(state, { vocabId, rating, token, now: now() })
          : rateReviewCard(state, { vocabId, rating, token, now: now() });
  if (!result.changed) return;
  ui.lockUntil = Date.now() + 350;
  ui.flipped = false;
  ui.revealed = false;
  ui.typed = null;
  ui.typeDraft = '';
  player.stop();
  if (commit(result.state)) {
    const lesson = kind === 'lesson' ? state.lessons.at(-1) : kind === 'topic' ? topicLessonsOf(state).filter((l) => l.topic === route().param).at(-1) : kind === 'song' ? topicLessonsOf(state).filter((l) => l.topic === `song:${route().param}`).at(-1) : null;
    if (lesson?.completedAt) announce(t('msg.lessonDone'));
    else if (rating === 'known') announce(t('msg.knownReplaced'));
    (root.querySelector('#type-input') ?? root.querySelector('#card-front') ?? root.querySelector('[data-rating="seen"]'))?.focus({ preventScroll: true });
  }
}

async function speak(vocabId, field, options) {
  const vocab = vocabById.get(vocabId);
  if (vocab) await speakVocab(vocab, field, options);
}

// Loads the recordings of what is on screen ahead (the card's word and sentence, a dialog's lines), so that
// turning the card or tapping "Wort" / "Satz" plays at once – iPhones only allow sound that starts with the tap.
function prefetchAudio(vocab, fields) {
  if (!vocab || !audioOn() || activeSource() !== 'shared') return;
  for (const field of fields) player.prefetch(vocab, field, { source: 'shared', voiceId: sharedVoiceId() });
}
function textVocab(id, text) {
  return { id, course: course.id, english: text };
}
function prefetchOnScreen() {
  const card = root.querySelector('[data-prefetch]');
  if (card) prefetchAudio(vocabById.get(card.dataset.prefetch), card.dataset.prefetchFields.split(','));
  if (route().name === 'dialog') for (const b of root.querySelectorAll('[data-action="speak-text"]')) prefetchAudio(textVocab(b.dataset.id, b.dataset.text), ['english']);
}

async function speakVocab(vocab, field, { quiet = false, rate } = {}) {
  if (!vocab || !audioOn()) return;
  const res = await player.play(vocab, field, {
    source: activeSource(),
    apiKey: prefs.elevenKey,
    voiceId: activeSource() === 'shared' ? sharedVoiceId() : prefs.elevenVoice,
    accent: state.settings.accent,
    rate: rate ?? Number(state.settings.rate),
    voiceName: prefs.deviceVoice,
  });
  if (res.recordingFailed) {
    // No robotic replacement: say what happened, a second tap usually plays it (it is loaded by then).
    if (res.source === 'elevenlabs') {
      // Own ElevenLabs key: say exactly what is wrong with it.
      ui.voiceError = { reason: res.reason, detail: res.detail ?? '' };
      toast(t(`audio.fallback.${res.reason}`));
      render();
    } else toast(t(navigator.onLine === false ? 'audio.recordingOffline' : 'audio.recordingRetry'));
  } else if (res.fallbackReason) {
    ui.voiceError = { reason: res.fallbackReason, detail: res.fallbackDetail ?? '' };
    toast(t(`audio.fallback.${res.fallbackReason}`));
  } else if (res.source === 'elevenlabs' && res.ok && !res.cancelled) {
    if (ui.voiceError) {
      ui.voiceError = null;
      render();
    }
  } else if (!res.ok && !quiet) toast(t(res.reason === 'unsupported' ? 'audio.unsupported' : 'audio.noVoice'));
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const parsed = parseImport(await file.text(), knownVocabIds, course.renamedIds);
  if (!parsed.ok) {
    toast(parsed.error);
    return;
  }
  if (hasLearningData(state) && !confirm(t('msg.importConfirm'))) return;
  if (commit(parsed.state)) toast(t('msg.importOk'));
}

root.addEventListener('pointerdown', (event) => {
  const el = event.target.closest('[data-action="speak"], [data-action="speak-text"]');
  if (!el) return;
  if (el.dataset.action === 'speak-text') prefetchAudio(textVocab(el.dataset.id, el.dataset.text), ['english']);
  else prefetchAudio(vocabById.get(el.dataset.id), [el.dataset.field]);
});

root.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'tap-zone': {
      if (!tapAnywhereOn()) break;
      flip();
      break;
    }
    case 'update-app': {
      // Forces the newest version: forget the cached app files (not the learning data, not the audio) and reload.
      (async () => {
        try {
          const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
          await Promise.all(registrations.map((r) => r.unregister()));
          const keys = (await caches?.keys?.()) ?? [];
          await Promise.all(keys.filter((k) => k.startsWith('ev-v')).map((k) => caches.delete(k)));
        } catch {}
        location.reload();
      })();
      break;
    }
    case 'google-sign-in':
      // Only when Google is switched on in the project – otherwise Supabase would show an error page.
      ui.account = { busy: true };
      render();
      sync.providers().then((p) => {
        if (!p.google) {
          ui.account = { error: 'googleOff' };
          render();
          return;
        }
        // Back at this exact address afterwards (the address must be allowed in Supabase → Auth → URL Configuration).
        location.href = sync.googleUrl(`${location.origin}${location.pathname}`);
      });
      break;
    case 'sync-now':
      runSync({ manual: true });
      break;
    case 'sign-out':
      if (!confirm(t('acc.signOutConfirm'))) break;
      sync.signOut();
      ui.account = {};
      toast(t('acc.signedOut'));
      render();
      break;
    case 'story-toggle-de':
      if (ui.story) ui.story.showDe = !ui.story.showDe;
      render();
      break;
    case 'story-restart':
      if (ui.story) ui.story = { id: ui.story.id, showDe: ui.story.showDe, answers: [], recorded: false };
      render();
      break;
    case 'story-answer': {
      const st = ui.story;
      const story = st ? storyById(st.id) : null;
      if (!story || st.answers.length >= story.questions.length) break;
      st.answers.push(Number(id));
      if (st.answers.length >= story.questions.length && !st.recorded) {
        st.recorded = true;
        const correct = st.answers.filter((a, i) => a === story.questions[i].answer).length;
        commit(recordStory(state, story.id, { correct, total: story.questions.length }, today()));
      } else render();
      break;
    }
    case 'placement-start': {
      const questions = placementQuestions(VOCABULARY, state, String(now().getTime()));
      if (!questions.length) {
        toast(t('place.none'));
        break;
      }
      ui.placement = { questions, index: 0, answers: [], skip: null };
      render();
      break;
    }
    case 'placement-answer': {
      const p = ui.placement;
      if (!p || p.index >= p.questions.length) break;
      p.answers.push(id || null);
      p.index += 1;
      // Skipping a whole level is a choice you make yourself on the result page – nothing is preselected.
      if (p.index >= p.questions.length) p.skip = [];
      render();
      break;
    }
    case 'placement-toggle': {
      const p = ui.placement;
      if (!p?.skip) break;
      p.skip = p.skip.includes(id) ? p.skip.filter((l) => l !== id) : [...p.skip, id];
      render();
      break;
    }
    case 'placement-apply': {
      const p = ui.placement;
      if (!p?.skip) break;
      const before = placementIds(state).length;
      const next = applyPlacement(state, VOCABULARY, { knownIds: placementResult(p.questions, p.answers).knownIds, levels: p.skip }, today());
      ui.placement = null;
      if (next !== state && commit(next)) toast(t('place.applied', { n: placementIds(state).length - before }));
      go('lessons');
      break;
    }
    case 'placement-discard':
      ui.placement = null;
      go('tests');
      break;
    case 'placement-undo': {
      const n = placementIds(state).length;
      if (n && commit(undoPlacement(state))) toast(t('place.undone', { n }));
      break;
    }
    case 'memo-edit':
      ui.memoEdit = id;
      ui.flipped = true;
      ui.revealed = true;
      render();
      root.querySelector('#memo-input')?.focus();
      break;
    case 'memo-cancel':
      ui.memoEdit = null;
      render();
      break;
    case 'start-mistakes-round': {
      if (commit(startHardRound(state, now(), todayMistakeIds(state, today())))) go(`practice/${state.practice.id}`);
      break;
    }
    case 'review-continue':
      ui.roundAck = id;
      render();
      break;
    case 'review-more': {
      const next = extendReview(state, now());
      if (next !== state) commit(next);
      else render();
      break;
    }
    case 'start-lesson': {
      // You tapped it yourself: new words now, even when reviews are due (they stay in today's plan).
      // With a number: a lesson of that size (today's reduced size, or a small lesson while catching up).
      const next = startLesson(state, VOCABULARY, now(), { force: true, words: Number(id) || null });
      if (next === state && !currentLesson(state)) {
        // Too many reviews due: they come first (see load.js).
        const load = dailyLoad(state, today(), lessonSize(state));
        toast(t('dash.loadNone', { d: load.due }));
        go(load.wordsDue ? 'review' : '');
        break;
      }
      if (next !== state) commit(next);
      go('learn');
      break;
    }
    case 'grammar-pick': {
      const q = ui.grammarQuiz;
      if (!q || q.choice !== null) break;
      q.choice = Number(id);
      const [gid, n] = q.items[q.index];
      if (gradeGrammar(gid, n, q.choice)) q.correct += 1;
      else q.wrong.push([gid, n]);
      render();
      root.querySelector('#grammar-next')?.focus({ preventScroll: true });
      break;
    }
    case 'grammar-next': {
      const q = ui.grammarQuiz;
      if (!q || q.choice === null) break;
      q.index += 1;
      q.choice = null;
      // The result of a topic quiz is saved once, when the last answer is done (and synced like everything else).
      if (q.index < q.items.length) render();
      else {
        ui.grammarMistakes = q.wrong;
        if (grammarById(q.id)) commit(recordGrammar(state, q.id, q.correct, q.items.length, today()));
        else render();
      }
      break;
    }
    case 'grammar-again':
      ui.grammarQuiz = null;
      render();
      break;
    case 'grammar-mistakes':
      ui.grammarQuiz = null;
      go('grammar-quiz/mistakes');
      break;
    case 'speak-device': {
      // Your own songs' words and lines: read out by the phone's voice (they have no recording).
      const text = el.dataset.text;
      if (text && audioOn()) speaker.speakField({ id: 'own', english: text }, 'english', { accent: state.settings.accent, rate: Number(state.settings.rate), voiceName: prefs.deviceVoice });
      break;
    }
    case 'speak-text': {
      // Grammar sentences are recorded like the words (audio/de-en/gr-…), so they play in the same natural voice.
      const text = el.dataset.text;
      if (text) speakVocab(textVocab(id, text), 'english');
      break;
    }
    case 'topic-sentences-now':
      ui.topicMode = 'sentences';
      go(`topic/${id}`);
      break;
    case 'topic-mode':
      ui.topicMode = id === 'sentences' ? 'sentences' : 'words';
      render();
      root.querySelector(`[data-action="topic-mode"][data-id="${ui.topicMode}"]`)?.focus({ preventScroll: true });
      break;
    case 'start-topic-sentences': {
      commit(startTopicSentences(state, VOCABULARY, id, now()));
      const session = openSentenceSession(state);
      if (session) go(`sentence/${session.id}`);
      break;
    }
    case 'start-topic-sentence-practice': {
      commit(startSentencePractice(state, now(), { topic: id }));
      const session = openSentenceSession(state);
      if (session) go(`sentence/${session.id}`);
      break;
    }
    case 'start-hard-round': {
      if (commit(startHardRound(state, now()))) go(`practice/${state.practice.id}`);
      break;
    }
    case 'hard-unknown':
      if (!ui.revealed) {
        ui.typed = null;
        ui.typeDraft = '';
        ui.revealed = true;
        render();
        root.querySelector('#hard-next')?.focus({ preventScroll: true });
      }
      break;
    case 'hard-override':
      if (ui.typed) {
        ui.typed = { ...ui.typed, override: true };
        render();
        root.querySelector('#hard-next')?.focus({ preventScroll: true });
      }
      break;
    case 'hard-next': {
      const typed = ui.typed?.id === id ? ui.typed : null;
      const right = Boolean(typed && (typed.verdict !== 'wrong' || typed.override));
      rate('practice', id, right ? 'remembered' : 'again', el.dataset.token);
      break;
    }
    case 'start-situation': {
      const sit = situationById(id);
      if (!sit) break;
      const next = startTopicLesson(state, VOCABULARY, sit.topic, now(), sit);
      if (next === state) {
        toast(t(openTopicLesson(state, sit.topic) ? 'sit.openFirst' : 'topics.reviewsFirst'));
        break;
      }
      if (commit(next)) go(`topic-learn/${sit.topic}`);
      break;
    }
    case 'dialog-restart':
      ui.dialog = { id, step: 0, answers: {}, recorded: false };
      ui.dialogDraft = '';
      render();
      root.querySelector('#dialog-input')?.focus({ preventScroll: true });
      break;
    case 'song-pick': {
      const a = songAddState();
      a.pick = a.results?.[Number(id)] ?? null;
      a.manual = false;
      a.error = null;
      render();
      root.querySelector('#song-lyrics')?.focus({ preventScroll: true });
      break;
    }
    case 'song-manual': {
      const a = songAddState();
      a.manual = true;
      a.pick = null;
      a.title = a.title || a.query;
      render();
      root.querySelector('#song-title')?.focus({ preventScroll: true });
      break;
    }
    case 'song-unpick': {
      const a = songAddState();
      a.pick = null;
      a.manual = false;
      a.error = null;
      render();
      break;
    }
    case 'song-run':
      startSongRun(id, el.dataset.mode);
      break;
    case 'song-run-new':
      startSongRun(id, el.dataset.mode, true);
      break;
    case 'song-rate':
      rateSongCard(id, el.dataset.rating);
      break;
    case 'song-quiz-answer': {
      const run = ui.songRun;
      if (!run || run.id !== id || run.mode !== 'quiz' || run.answers[run.index] !== undefined) break;
      run.answers[run.index] = el.dataset.answer;
      if (!persistSongRun()) render();
      root.querySelector('[data-action="song-quiz-next"]')?.focus({ preventScroll: true });
      break;
    }
    case 'song-quiz-next': {
      const run = ui.songRun;
      if (!run || run.id !== id || run.mode !== 'quiz') break;
      run.index += 1;
      if (run.index >= run.quiz.length && !run.recorded) {
        run.recorded = true;
        persistSongRun((s) => recordSongQuiz(s, id, run.answers.filter((a, i) => a === run.quiz[i].answer).length, run.quiz.length, now()));
      } else if (!persistSongRun()) render();
      break;
    }
    case 'song-edit':
      ui.songEdit = { id, kind: el.dataset.kind, key: el.dataset.key };
      render();
      root.querySelector('#song-edit-input')?.focus({ preventScroll: true });
      break;
    case 'song-edit-cancel':
      ui.songEdit = null;
      render();
      break;
    case 'song-word-remove':
      commit(removeSongWord(state, id, el.dataset.key, now()));
      break;
    case 'song-delete':
      if (confirm(t('music.deleteConfirm'))) {
        commit(removeSong(state, id, now()));
        go('music');
      }
      break;
    case 'song-srs': {
      const next = startSongLesson(state, id, now());
      if (next !== state) commit(next);
      go(`song-learn/${id}`);
      break;
    }
    case 'start-topic-lesson': {
      const next = startTopicLesson(state, VOCABULARY, id, now());
      if (next === state && !openTopicLesson(state, id)) {
        toast(t('topics.reviewsFirst'));
        break;
      }
      if (next !== state) commit(next);
      go(`topic-learn/${id}`);
      break;
    }
    case 'flip':
      flip();
      break;
    case 'rate':
      rate(el.dataset.kind, id, el.dataset.rating, el.dataset.token, el.dataset.intro === '1');
      break;
    case 'start-sentences': {
      commit(startLessonSentences(state, id, now(), VOCABULARY));
      const session = sentenceSessionFor(state, id);
      if (session) go(`sentence/${session.id}`);
      break;
    }
    case 'train-scope': {
      // Choose what to practise from a button (e.g. "Alle Übungen" on the starred card) and jump to the exercises.
      ui.trainScope = id;
      render();
      document.getElementById('modes-title')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      break;
    }
    case 'start-word-practice': {
      if (commit(startWordPractice(state, id, now()))) go(`practice/${state.practice.id}`);
      break;
    }
    case 'start-lesson-sentence-practice': {
      commit(startSentencePractice(state, now(), { lessonId: id }));
      const session = openSentenceSession(state);
      if (session) go(`sentence/${session.id}`);
      break;
    }
    case 'start-sentence-review':
    case 'start-practice': {
      commit(action === 'start-practice' ? startSentencePractice(state, now()) : startSentenceReview(state, now()));
      const session = openSentenceSession(state);
      if (session) go(`sentence/${session.id}`);
      break;
    }
    case 'cycle-speed': {
      const current = SPEEDS.indexOf(Number(state.settings.rate));
      const rate = SPEEDS[(current + 1) % SPEEDS.length];
      if (commit({ ...state, settings: { ...state.settings, rate } })) announce(t('card.speed', { s: speedLabel(rate) }));
      break;
    }
    case 'speak':
      speak(id, el.dataset.field);
      break;
    case 'toggle-audio': {
      const on = !audioOn();
      if (!on) player.stop();
      if (commit({ ...state, settings: { ...state.settings, audio: on } })) announce(t(on ? 'set.audioOnNow' : 'set.audioOffNow'));
      break;
    }
    case 'toggle-type': {
      const on = !typeAnswerOn();
      if (commit({ ...state, settings: { ...state.settings, typeAnswer: on } })) {
        announce(t(on ? 'type.onNow' : 'type.offNow'));
        if (on) root.querySelector('#type-input')?.focus();
      }
      break;
    }
    case 'toggle-autoplay': {
      const on = !autoplayOn();
      if (on === false) player.stop();
      if (commit({ ...state, settings: { ...state.settings, autoplay: on } })) announce(t(on ? 'card.autoOn' : 'card.autoOff'));
      break;
    }
    case 'stop-audio':
      player.stop();
      break;
    case 'start-daily': {
      commit(startDailyTest(state, id, now(), vocabById));
      const test = dailyTestFor(state, id);
      if (test) go(`test/${test.id}`);
      break;
    }
    case 'start-weekly': {
      commit(startWeeklyTest(state, now(), vocabById));
      const open = weeklyStatus(state, now()).open;
      if (open) go(`test/${open.id}`);
      break;
    }
    case 'next-question': {
      const result = nextQuestion(state, { testId: id, now: now() });
      if (result.changed && commit(result.state)) {
        const test = state.tests.find((x) => x.id === id);
        if (test.completedAt) go(`result/${id}`);
        else root.querySelector('#answer-input')?.focus();
      }
      break;
    }
    case 'override': {
      const result = overrideLastAnswer(state, { testId: id, now: now() });
      if (result.changed && commit(result.state)) {
        announce(t('msg.overridden'));
        root.querySelector('#next-btn')?.focus();
      }
      break;
    }
    case 'star': {
      const on = !isStarred(state, id);
      if (commit(toggleStar(state, id))) announce(t(on ? 'star.added' : 'star.removed'));
      break;
    }
    case 'star-wrong': {
      const wrong = ui.game ? quizScore(ui.game).wrong : [];
      if (wrong.length && commit({ ...state, starred: [...new Set([...(state.starred ?? []), ...wrong])] })) toast(t('quiz.starred', { n: wrong.length }));
      break;
    }
    case 'preview-known':
      if (commit(markKnownAhead(state, id, today()))) toast(t('preview.sortedToast', { w: vocabById.get(id).english }));
      break;
    case 'preview-undo':
      commit(unmarkKnownAhead(state, id));
      break;
    case 'more-upcoming':
      ui.upcomingCount += 5;
      render();
      break;
    case 'home-mode':
      prefs.homeMode = id === 'sentences' ? 'sentences' : 'words';
      savePrefs(prefs);
      render();
      root.querySelector(`[data-action="home-mode"][data-id="${prefs.homeMode}"]`)?.focus({ preventScroll: true });
      break;
    case 'sentences-tab':
      ui.sentencesTab = id;
      render();
      break;
    case 'lessons-tab':
      ui.lessonsTab = id;
      render();
      root.querySelector(`[data-action="lessons-tab"][data-id="${id}"]`)?.focus({ preventScroll: true });
      break;
    case 'blitz-pick': {
      const g = ui.game;
      if (!g || g.type !== 'blitz' || g.done) break;
      const res = blitzAnswer(g, el.dataset.question, id, Date.now());
      if (res.game.done) finishBlitz(res.game);
      else {
        ui.game = res.game;
        render();
      }
      break;
    }
    case 'scramble-tile':
    case 'scramble-undo':
    case 'scramble-hint':
    case 'scramble-skip':
    case 'scramble-next': {
      const g = ui.game;
      if (!g || g.type !== 'scramble' || g.done) break;
      const v = vocabById.get(g.ids[g.index]);
      const target = scrambleTarget(v.english);
      let result = 'none';
      if (action === 'scramble-undo') ui.game = scrambleUndo(g);
      else if (action === 'scramble-skip') ui.game = scrambleSkip(g);
      else if (action === 'scramble-next') ui.game = scrambleNext(g, vocabById);
      else {
        const res = action === 'scramble-hint' ? scrambleHint(g, target) : scramblePlace(g, target, Number(el.dataset.index));
        ui.game = res.game;
        result = res.result;
      }
      clearTimeout(ui.flashTimer);
      ui.flash = result === 'wrong' ? { kind: 'shake' } : null;
      if (result === 'wrong') {
        ui.flashTimer = setTimeout(() => {
          ui.flash = null;
          render();
        }, 500);
        announce(t('quiz.wrong'));
      }
      render();
      if (result === 'correct') {
        announce(t('scramble.good'));
        if (autoReadActive()) speak(v.id, 'english', { quiet: true });
        root.querySelector('#scramble-next')?.focus({ preventScroll: true });
      } else if (action === 'scramble-next') root.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
      break;
    }
    case 'puzzle-tile':
    case 'puzzle-undo':
    case 'puzzle-retry':
    case 'puzzle-reveal':
    case 'puzzle-next': {
      const g = ui.game;
      if (!g || g.type !== 'puzzle' || g.done) break;
      const v = vocabById.get(g.ids[g.index]);
      let result = 'none';
      if (action === 'puzzle-undo') ui.game = puzzleUndo(g);
      else if (action === 'puzzle-retry') ui.game = puzzleRetry(g);
      else if (action === 'puzzle-reveal') ui.game = puzzleReveal(g);
      else if (action === 'puzzle-next') ui.game = puzzleNext(g, vocabById);
      else {
        const res = puzzlePlace(g, Number(el.dataset.index));
        ui.game = res.game;
        result = res.result;
      }
      render();
      if (result === 'wrong') {
        announce(t('puzzle.wrongFrom', { n: ui.game.firstWrong + 1 }));
        root.querySelector('#puzzle-retry')?.focus({ preventScroll: true });
      } else if (result === 'correct' || action === 'puzzle-reveal') {
        if (result === 'correct') announce(t('scramble.good'));
        if (autoReadActive()) speak(v.id, 'exampleEn', { quiet: true });
        root.querySelector('#puzzle-next')?.focus({ preventScroll: true });
      } else if (action === 'puzzle-next' || action === 'puzzle-retry') root.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
      break;
    }
    case 'memory-flip': {
      const g = ui.game;
      if (!g || g.type !== 'memory') break;
      const res = memoryFlip(g, Number(el.dataset.index));
      if (res.result === 'none') break;
      ui.game = res.game;
      clearTimeout(ui.memoryTimer);
      if (res.result === 'miss') {
        ui.memoryTimer = setTimeout(() => {
          if (ui.game?.type === 'memory') {
            ui.game = memoryClose(ui.game);
            render();
          }
        }, globalThis.__EV_MEMORY_DELAY__ ?? 1100);
      } else if (res.result === 'match') {
        const matchedId = g.cards[Number(el.dataset.index)].id;
        announce(res.game.done ? t('memory.done') : t('match.found'));
        if (autoReadActive()) speak(matchedId, 'english', { quiet: true });
      }
      render();
      break;
    }
    case 'star-missed': {
      const g = ui.game;
      const missed = !g ? [] : g.type === 'blitz' || g.type === 'memory' ? g.missedIds : g.type === 'scramble' ? scrambleScore(g).missed : g.type === 'puzzle' ? puzzleScore(g).missed : [];
      if (missed.length && commit({ ...state, starred: [...new Set([...(state.starred ?? []), ...missed])] })) toast(t('quiz.starred', { n: missed.length }));
      break;
    }
    case 'match-pick': {
      const g = ui.game;
      if (!g || g.type !== 'match') break;
      const res = matchPick(g, el.dataset.side, id);
      ui.game = res.game;
      clearTimeout(ui.flashTimer);
      if (res.result === 'miss') {
        ui.flash = { kind: 'miss', keys: [`${g.selected.side}:${g.selected.id}`, `${el.dataset.side}:${id}`] };
        ui.flashTimer = setTimeout(() => {
          ui.flash = null;
          render();
        }, 700);
        announce(t('match.wrong'));
      } else if (res.result === 'match') {
        ui.flash = null;
        announce(res.game.done ? t('match.done') : t('match.found'));
        if (autoReadActive()) speak(id, 'english', { quiet: true });
      }
      render();
      if (res.result === 'match') root.querySelector('.match-tile:not([disabled])')?.focus({ preventScroll: true });
      break;
    }
    case 'restart-game':
      if (ui.game) {
        startGame(ui.game.type, ui.game.scope);
        ui.lastRoute = null;
        render();
        if (isListenGame(ui.game.type) && !ui.game.empty) playQuizWord(quizCurrent(ui.game));
      }
      break;
    case 'quiz-play':
    case 'quiz-play-slow':
      playQuizWord(id, action === 'quiz-play-slow');
      root.querySelector('#quiz-input')?.focus({ preventScroll: true });
      break;
    case 'quiz-hint':
      ui.quizHint = !ui.quizHint;
      render();
      break;
    case 'quiz-skip':
      if (ui.game) {
        quizUpdate(quizSkip(ui.game, quizCurrent(ui.game)));
        root.querySelector('#quiz-next')?.focus({ preventScroll: true });
      }
      break;
    case 'quiz-next':
      if (ui.game) {
        player.stop();
        quizUpdate(quizNext(ui.game));
        if (ui.game.done) {
          ui.lastRoute = null;
          render();
        } else if (isListenGame(ui.game.type)) {
          playQuizWord(quizCurrent(ui.game));
          root.querySelector('#quiz-input')?.focus({ preventScroll: true });
        } else root.querySelector('.mic-big')?.focus({ preventScroll: true });
      }
      break;
    case 'test-eleven': {
      ui.elevenTest = { state: 'running' };
      render();
      eleven
        .synthesize('Hello.', { apiKey: prefs.elevenKey, voiceId: prefs.elevenVoice, speed: 1, fresh: true })
        .then(() => {
          ui.elevenTest = { state: 'ok' };
          ui.voiceError = null;
        })
        .catch((e) => {
          ui.elevenTest = { state: 'error', reason: e?.reason ?? 'server', detail: e?.detail || e?.message || '' };
        })
        .finally(render);
      break;
    }
    case 'switch-course':
      switchCourse(id);
      break;
    case 'copy-course-link': {
      const link = `${location.origin}${location.pathname}?course=${id}`;
      (navigator.clipboard?.writeText(link) ?? Promise.reject()).then(
        () => toast(t('set.courseLinkCopied')),
        () => toast(link),
      );
      break;
    }
    case 'sample-voice': {
      // Plays an example sentence with the voice of the button, so the voices can be compared before choosing.
      const sample = VOCABULARY.find((v) => v.exampleEn);
      if (sample) {
        player.play(sample, 'exampleEn', { source: 'shared', voiceId: el.dataset.voice, accent: state.settings.accent, rate: Number(state.settings.rate) });
      }
      break;
    }
    case 'test-shared': {
      ui.sharedTest = { state: 'running' };
      render();
      sharedTts
        .check()
        .then((res) => {
          ui.sharedTest = res.ok ? { state: 'ok' } : { state: 'error', reason: res.reason ?? 'server', detail: res.detail ?? '' };
          if (res.ok) ui.voiceError = null;
        })
        .finally(() => {
          // the server's answer also tells whether the voice is offered at all
          sharedTts.probe().then((info) => {
            if (!info) return;
            ui.shared = info;
            try {
              localStorage.setItem(SHARED_INFO_KEY, JSON.stringify(info));
            } catch {}
            render();
          });
          render();
        });
      break;
    }
    case 'use-eleven':
      setPrefs({ voiceSource: 'elevenlabs' });
      root.querySelector('#eleven-key')?.focus();
      break;
    case 'remove-key':
      setPrefs({ elevenKey: '' });
      toast(t('set.keyRemoved'));
      break;
    case 'retry-save':
      if (ui.pending) commit(ui.pending);
      break;
    case 'export':
      download(`english-vocabulary-backup-${today()}.json`, exportData(state, now()));
      break;
    case 'reset':
      if (confirm(t('msg.resetConfirm'))) {
        commit(createInitialState(now(), course));
        toast(t('msg.resetDone'));
      }
      break;
    default:
      break;
  }
});

root.addEventListener('submit', (event) => {
  const songSearch = event.target.closest('[data-form="song-search"]');
  if (songSearch) {
    event.preventDefault();
    const a = songAddState();
    a.query = songSearch.querySelector('input').value.trim();
    if (!a.query) return;
    a.searching = true;
    a.error = null;
    render();
    searchCatalog(a.query)
      .then((results) => {
        a.results = results;
      })
      .catch(() => {
        a.results = null;
        a.error = 'search';
      })
      .finally(() => {
        a.searching = false;
        render();
      });
    return;
  }
  const songCreate = event.target.closest('[data-form="song-create"]');
  if (songCreate) {
    event.preventDefault();
    const a = songAddState();
    a.lyrics = songCreate.querySelector('textarea').value;
    if (a.busy) return;
    createSong(a.lyrics).catch(() => {
      a.busy = false;
      render();
    });
    return;
  }
  const songFillEl = event.target.closest('[data-form="song-fill"]');
  if (songFillEl) {
    event.preventDefault();
    if (ui.songFill?.busy) return;
    const id = songFillEl.dataset.id;
    fillSong(id, songFillEl.querySelector('textarea').value).catch(() => {
      ui.songFill = null;
      render();
    });
    return;
  }
  const songMeaning = event.target.closest('[data-form="song-meaning"]');
  if (songMeaning) {
    event.preventDefault();
    const { id, kind, key } = songMeaning.dataset;
    const de = songMeaning.querySelector('input').value;
    ui.songEdit = null;
    commit(setSongMeaning(state, id, kind === 'w' ? { word: key, de } : { line: Number(key), de }, now()));
    return;
  }
  const memoForm = event.target.closest('[data-form="memo"]');
  if (memoForm) {
    event.preventDefault();
    const next = setMemo(state, memoForm.dataset.id, memoForm.querySelector('input').value, now());
    ui.memoEdit = null;
    if (next !== state) commit(next);
    else render();
    return;
  }
  const dialogForm = event.target.closest('[data-form="dialog"]');
  if (dialogForm) {
    event.preventDefault();
    const sit = situationById(dialogForm.dataset.id);
    const d = ui.dialog;
    if (!sit || !d || d.id !== sit.id || d.step >= sit.dialog.turns.length) return;
    const typed = dialogForm.querySelector('textarea').value.trim();
    if (typed) d.answers[d.step] = typed;
    d.step += 1;
    while (d.step < sit.dialog.turns.length && sit.dialog.turns[d.step].who === 'them') d.step += 1;
    ui.dialogDraft = '';
    if (d.step >= sit.dialog.turns.length && !d.recorded) {
      d.recorded = true;
      commit(recordDialog(state, sit.id, today()));
    } else render();
    (root.querySelector('#dialog-input') ?? root.querySelector('.dialog-done .btn'))?.focus({ preventScroll: true });
    return;
  }
  const typeForm = event.target.closest('[data-form="type-answer"]');
  if (typeForm) {
    event.preventDefault();
    if (ui.revealed) return;
    const vocab = vocabById.get(typeForm.dataset.id);
    if (!vocab) return;
    const given = typeForm.querySelector('input[name="answer"]').value.trim();
    const result = grade(given, vocab, 'de-en', VOCABULARY);
    ui.typed = { id: vocab.id, token: typeForm.dataset.token, given, verdict: given ? result.verdict : 'wrong' };
    ui.typeDraft = '';
    if (state.practice?.mode === 'type' && route().name === 'practice') {
      ui.revealed = true;
      render();
      root.querySelector('#hard-next')?.focus({ preventScroll: true });
      return;
    }
    flip();
    return;
  }
  const accountForm = event.target.closest('[data-form="account"]');
  if (accountForm) {
    event.preventDefault();
    const mode = event.submitter?.value === 'signup' ? 'signup' : 'signin';
    const email = (accountForm.querySelector('input[name="email"]').value || ui.accDraft.email).trim();
    const password = accountForm.querySelector('input[name="password"]').value || ui.accDraft.password;
    if (!email || password.length < 8) {
      toast(t('acc.err.weak'));
      return;
    }
    ui.account = { busy: true, error: null, email };
    render();
    (mode === 'signup' ? sync.signUp(email, password) : sync.signIn(email, password))
      .then(() => {
        ui.accDraft = { email: '', password: '' };
        ui.account = { busy: false, error: null };
        toast(t(mode === 'signup' ? 'acc.created' : 'acc.welcome'));
        return runSync({ manual: false });
      })
      .catch((e) => {
        ui.account = { busy: false, error: e.reason ?? 'server', email };
        render();
      });
    return;
  }
  const keyForm = event.target.closest('[data-form="eleven-key"]');
  if (keyForm) {
    event.preventDefault();
    const key = keyForm.querySelector('input[name="key"]').value.trim();
    if (!key) return;
    // The secret key starts with "sk_". The key list only shows an ID – pasting that is the most common mistake.
    if (!key.startsWith('sk_')) {
      toast(t('set.keyFormat'));
      return;
    }
    ui.voiceError = null;
    ui.elevenTest = null;
    setPrefs({ elevenKey: key, voiceSource: 'elevenlabs', voiceChoice: 'manual' });
    toast(t('set.keySaved'));
    return;
  }
  const quizForm = event.target.closest('[data-form="quiz"]');
  if (quizForm) {
    event.preventDefault();
    const given = quizForm.querySelector('input[name="answer"]').value;
    const g = ui.game;
    if (!given.trim() || !g || g.phase !== 'ask') return;
    const v = vocabById.get(quizCurrent(g));
    quizUpdate(g.type === 'dictation' ? dictationAnswer(g, v, given) : quizAnswer(g, v, given));
    const a = ui.game.answers.at(-1);
    announce(a.isCorrect ? t('quiz.good') : t('msg.wrong', { s: g.type === 'dictation' ? v.exampleEn : v.english }));
    root.querySelector('#quiz-next')?.focus({ preventScroll: true });
    return;
  }
  const form = event.target.closest('[data-form="answer"]');
  if (!form) return;
  event.preventDefault();
  const given = form.querySelector('input[name="answer"]').value;
  if (!given.trim()) return;
  const result = answerQuestion(state, vocabById, { testId: form.dataset.id, given, token: form.dataset.token, now: now() });
  if (result.changed && commit(result.state)) {
    announce(result.result.isCorrect ? t('msg.correct') : t('msg.wrong', { s: result.result.expected }));
    root.querySelector('#next-btn')?.focus();
  }
});

root.addEventListener('input', (event) => {
  if (event.target.dataset.songField) {
    songAddState()[event.target.dataset.songField] = event.target.value;
    return;
  }
  if (event.target.id === 'song-lyrics') {
    const fill = event.target.closest('[data-form="song-fill"]');
    if (fill) ui.songFill = { ...(ui.songFill?.id === fill.dataset.id ? ui.songFill : {}), id: fill.dataset.id, lyrics: event.target.value };
    else songAddState().lyrics = event.target.value;
    return;
  }
  if (event.target.id === 'type-input') {
    ui.typeDraft = event.target.value;
    return;
  }
  if (event.target.id === 'acc-email' || event.target.id === 'acc-password') {
    ui.accDraft[event.target.id === 'acc-email' ? 'email' : 'password'] = event.target.value;
    return;
  }
  if (event.target.id === 'dialog-input') {
    ui.dialogDraft = event.target.value;
    return;
  }
  if (event.target.id !== 'word-search') return;
  ui.search = event.target.value;
  render();
  const input = root.querySelector('#word-search');
  input?.setSelectionRange(input.value.length, input.value.length);
});

root.addEventListener('change', (event) => {
  const el = event.target;
  if (el.dataset.action === 'import') {
    importFile(el);
    return;
  }
  if (el.dataset.action === 'song-cover-file' || el.dataset.action === 'song-cover-edit') {
    const file = el.files?.[0];
    if (!file) return;
    pictureToCover(file)
      .then((artwork) => {
        if (el.dataset.action === 'song-cover-edit') commit(updateSongMeta(state, el.dataset.id, { artwork }, now()));
        else {
          const a = songAddState();
          if (a.pick) a.pick = { ...a.pick, artwork };
          else a.artwork = artwork;
          render();
        }
      })
      .catch(() => toast(t('music.coverError')));
    return;
  }
  if (el.dataset.reminder) {
    if (el.dataset.reminder === 'on') setReminder(el.value === 'true', reminder.status().hour);
    else setReminder(true, Number(el.value));
    return;
  }
  if (el.dataset.pref === 'course') {
    switchCourse(el.value);
    return;
  }
  if (el.dataset.pref === 'voiceSource') {
    ui.voiceError = null;
    setPrefs({ voiceSource: el.value, voiceChoice: 'manual' });
    return;
  }
  if (el.dataset.pref) {
    setPrefs({ [el.dataset.pref]: el.value });
    return;
  }
  if (el.dataset.ui) {
    ui[el.dataset.ui] = el.value;
    render();
    return;
  }
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    const value = key === 'rate' || key === 'lessonSize' ? Number(el.value) : key === 'autoplay' || key === 'audio' || key === 'tapAnywhere' || key === 'typeAnswer' ? el.value === 'true' : el.value;
    commit({ ...state, settings: { ...state.settings, [key]: value } });
  }
});

// The "Advanced" section stays open while its options are changed (every change re-renders the page).
document.addEventListener(
  'toggle',
  (event) => {
    if (event.target.matches?.('details.advanced')) ui.advancedOpen = event.target.open;
    if (event.target.matches?.('details.account-more')) ui.emailOpen = event.target.open;
  },
  true,
);

document.addEventListener('keydown', (event) => {
  const r = route().name;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  // Games: Enter goes on after the feedback.
  if (isListenGame(r) && ui.game && !ui.game.done && tag !== 'BUTTON' && tag !== 'A') {
    if (ui.game.phase === 'feedback' && event.key === 'Enter') {
      event.preventDefault();
      root.querySelector('#quiz-next')?.click();
    }
    return;
  }
  if (r === 'scramble' && ui.game && ui.game.type === 'scramble' && !ui.game.done && tag !== 'BUTTON' && tag !== 'A') {
    const g = ui.game;
    if (g.phase === 'feedback') {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        root.querySelector('#scramble-next')?.click();
      }
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      root.querySelector('[data-action="scramble-undo"]')?.click();
    } else if (event.key.length === 1) {
      const want = event.key.toLowerCase();
      const tile = [...root.querySelectorAll('.letter-tile:not([disabled])')].find((b) => g.tiles[Number(b.dataset.index)] === want);
      if (tile) {
        event.preventDefault();
        tile.click();
      }
    }
    return;
  }
  if (r === 'practice' && state.practice?.mode === 'type') {
    if ((event.key === 'Enter' || event.key === ' ') && ui.revealed && tag !== 'BUTTON' && tag !== 'A') {
      event.preventDefault();
      root.querySelector('#hard-next')?.click();
    }
    return;
  }
  if (!['learn', 'review', 'sentence', 'practice', 'song-learn', 'song-cards'].includes(r)) return;
  if (r === 'song-cards' && ui.songRun?.mode === 'quiz') return;
  const introNext = root.querySelector('[data-rating="seen"]');
  if (introNext) {
    const target = event.key === ' ' || event.key === 'Enter' || event.key === '2' ? introNext : event.key === '3' ? root.querySelector('[data-rating="known"]') : null;
    if (target && !(tag === 'BUTTON' && (event.key === ' ' || event.key === 'Enter'))) {
      event.preventDefault();
      target.click();
    }
    return;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    if (tag === 'BUTTON' || tag === 'A') return; // native activation handles it
    event.preventDefault();
    flip();
    return;
  }
  if (!ui.revealed) return;
  const map = { 1: 'again', 2: 'remembered', 3: 'known' };
  const rating = map[event.key];
  if (!rating) return;
  const btn = root.querySelector(`[data-action="rate"][data-rating="${rating}"], [data-action="song-rate"][data-rating="${rating}"]`);
  if (btn) {
    event.preventDefault();
    btn.click();
  }
});

window.addEventListener('hashchange', () => onEnterRoute({ navigated: true }));
window.addEventListener('online', () => {
  ui.online = true;
  render();
});
window.addEventListener('offline', () => {
  ui.online = false;
  render();
});
// A new calendar day may have started while the app was in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onEnterRoute();
});
// Another tab changed the data – reload it instead of overwriting.
window.addEventListener('storage', (event) => {
  if (!event.key?.startsWith('english-vocabulary')) return;
  state = loadState(undefined, now(), course).state;
  prefs = loadPrefs();
  t = createTranslator(prefs.lang);
  applyLanguage();
  render();
});
speaker.onChange(() => render());

if (storageOk && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !globalThis.__EV_NO_SW__) {
  // Updates arrive by themselves: the app looks for a new version whenever it is opened again and every half hour,
  // and reloads as soon as a new version has taken over – never in the middle of a card.
  let controlled = Boolean(navigator.serviceWorker.controller);
  let updateReady = false;
  const reloadIfIdle = () => {
    if (!updateReady) return;
    if (!document.hidden && STUDY_ROUTES.includes(route().name)) return;
    updateReady = false;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true; // first installation takes control – nothing to replace yet
      return;
    }
    updateReady = true;
    reloadIfIdle();
  });
  window.addEventListener('hashchange', reloadIfIdle);
  document.addEventListener('visibilitychange', reloadIfIdle);
  navigator.serviceWorker
    .register('sw.js')
    .then((registration) => {
      const check = () => registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check();
      });
      setInterval(check, 30 * 60 * 1000);
    })
    .catch(() => {});
}

applyLanguage();
onEnterRoute();
reportStudied();
// A sentence lesson that was started with fewer sentences is filled up to the minimum.
commit(topUpLessonSentences(state, VOCABULARY));
// The songs prepared in the app (data/songs.js) are in the music area from the start.
if (hasMusic()) commit(ensurePresetSongs(state, PRESET_SONGS, now(), VOCABULARY));
// Sync: on start, when the app comes back to the screen, when the connection returns, after leaving a card
// (when a change from another device had to wait) and every 5 minutes.
if (authReturn) {
  ui.account = { busy: true };
  sync
    .completeRedirect(authReturn)
    .then((a) => {
      ui.account = {};
      if (a) toast(t('acc.welcomeName', { e: a.name ?? a.email }));
      return runSync();
    })
    .catch((e) => {
      ui.account = { error: e.reason ?? 'google' };
      render();
    });
} else runSync();
// Which sign-in ways are switched on (the Google button appears once Google is set up in Supabase).
if (sync.enabled) sync.providers().then(() => render());
// A profile picture that cannot be loaded (offline, blocked) is replaced by the person icon.
root.addEventListener('error', (event) => {
  if (event.target?.dataset?.avatar && !ui.avatarFailed) {
    ui.avatarFailed = true;
    render();
  }
}, true);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) runSync();
});
window.addEventListener('online', () => runSync());
window.addEventListener('hashchange', () => {
  if (ui.account?.deferred && !STUDY_ROUTES.includes(route().name)) runSync();
});
setInterval(() => runSync(), 5 * 60 * 1000);
// Ask the server whether the shared voice is set up (keeps the last known answer when offline).
sharedTts.probe().then((info) => {
  if (!info) return;
  ui.shared = info;
  try {
    localStorage.setItem(SHARED_INFO_KEY, JSON.stringify(info));
  } catch {}
  render();
});
