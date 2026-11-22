// Learning courses. Every course has its own vocabulary, its own saved progress and its own voice language.
//  - de-en: German speakers learn English (the original course)
//  - zh-de: Chinese speakers learn German ("学德语")
// Historical naming in the engine: `english` = the word in the language being learned, `german` = the native translation.

import { CATEGORIES, DAY_ONE_IDS, RENAMED_IDS, VOCABULARY } from '../data/vocabulary.js';
import { CATEGORIES_ZH, DAY_ONE_IDS_ZH, VOCABULARY_ZH } from '../data/vocabulary-zh.js';

export const COURSES = Object.freeze({
  'de-en': {
    id: 'de-en',
    target: 'en',
    native: 'de',
    vocabulary: VOCABULARY,
    categories: CATEGORIES,
    dayOne: DAY_ONE_IDS,
    renamedIds: RENAMED_IDS,
    storageKey: 'english-vocabulary:state',
    defaultUiLang: 'de',
    defaultAccent: 'en-US',
    defaultDifficulty: 'medium',
    accents: [
      { value: 'en-US', label: 'set.accentUS' },
      { value: 'en-GB', label: 'set.accentUK' },
    ],
    brand: 'English Vocabulary',
  },
  'zh-de': {
    id: 'zh-de',
    target: 'de',
    native: 'zh',
    vocabulary: VOCABULARY_ZH,
    categories: CATEGORIES_ZH,
    dayOne: DAY_ONE_IDS_ZH,
    storageKey: 'english-vocabulary:state:zh-de',
    defaultUiLang: 'zh',
    defaultAccent: 'de-DE',
    defaultDifficulty: 'easy', // beginners start with the basics
    accents: [
      { value: 'de-DE', label: 'set.accentDE' },
      { value: 'de-AT', label: 'set.accentAT' },
    ],
    brand: '学德语 · Deutsch lernen',
  },
});

export const DEFAULT_COURSE = 'de-en';

export function courseFor(id) {
  return COURSES[id] ?? COURSES[DEFAULT_COURSE];
}
