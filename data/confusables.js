// Words that are easily mixed up (similar look, sound or meaning). The card of one word shows the others with their
// meaning ("Nicht verwechseln"). Words with their own note (NOTES in vocabulary.js) keep that note instead.
// Checked by tests/unit/confusables.test.js: every id exists, no word is in two groups.
export const CONFUSABLE_GROUPS = Object.freeze([
  ['ev-to-bring', 'ev-to-take'],
  ['ev-to-remember', 'tp-to-remind'],
  ['ev-to-lose', 'ev-to-miss'],
  ['ev-bored', 'tp-boring'],
  ['ev-excited', 'tp-exciting'],
  ['fu-eventually', 'fu-maybe'],
  ['fu-still', 'fu-yet', 'ev-already'],
  ['ev-quiet', 'tp-quite'],
  ['ev-receipt', 'tp-recipe'],
  ['ev-kitchen', 'tp-chicken'],
  ['ev-to-wear', 'tp-to-carry'],
  ['fu-to-know', 'dt-to-get-to-know'],
  ['tp-to-win', 'ev-to-earn'],
  ['ev-to-rent', 'tp-to-hire'],
  ['ev-late', 'fu-lately'],
  ['tp-lonely', 'tp-alone'],
  ['ev-to-look-for', 'ev-to-look-after', 'ev-to-look-forward-to'],
  ['ev-to-get-up', 'ev-to-wake-up'],
  ['ev-to-turn-on', 'ev-to-turn-off'],
  ['ev-to-pick-up', 'ev-to-drop-off'],
  ['tp-to-put-on', 'tp-to-take-off'],
  ['tp-to-check-in', 'tp-to-check-out'],
  ['ev-to-fall-asleep', 'ev-to-oversleep'],
  ['ev-to-hurt', 'tp-to-injure'],
  ['dt-to-break-up', 'tp-to-make-up'],
  ['ev-to-borrow', 'ev-to-lend'],
]);

const PARTNERS = new Map();
for (const group of CONFUSABLE_GROUPS) for (const id of group) PARTNERS.set(id, group.filter((other) => other !== id));

// The ids of the words that are easily mixed up with this one (empty for most words).
export const confusablesOf = (vocabId) => PARTNERS.get(vocabId) ?? [];
