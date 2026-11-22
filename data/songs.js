// Songs prepared for you: they are in the music area from the start (js/engine/music.js, ensurePresetSongs).
// Each entry: the song's details from the music catalogue (cover, 30-second preview, link) and its words and lines.
// A word is { key, vocabId } for a word of the app's vocabulary (meaning and schedule from there) or { key, en, de };
// a line is { en, de, keys } with the keys of the words in it. themed: words around the song, not from its lyrics. The lyrics themselves are never part of the app; without words, the song
// page asks you to paste the lyrics once and makes the cards from them.

export const PRESET_SONGS = Object.freeze([
  {
    id: 'preset-hong-kong',
    title: 'Hong Kong',
    artist: 'The Weeknd feat. Faye Wong',
    album: 'Hong Kong (feat. 王菲季候風) – Single · 2026',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/0b/b2/81/0bb281a4-14af-a403-4af4-c39aa3f0d872/ticket.kusbehtm.jpg/600x600bb.jpg',
    link: 'https://music.apple.com/hk/album/hong-kong-feat-%E7%8E%8B%E8%8F%B2%E5%AD%A3%E5%80%99%E9%A2%A8/6829122413?i=6829122414',
    preview: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/25/bc/8f/25bc8fa6-d5ce-1bb3-b0dc-6d756c8e0167/mzaf_11986309454262643541.plus.aac.p.m4a',
    // The lyrics of this song could not be read here, so these are words and sentences AROUND the song – its city at
    // night, the harbour, the monsoon, longing and love – not words taken from the lyrics. The app says so on the page.
    themed: true,
    words: [
      { key: 'w:city-never-sleeps', en: 'the city that never sleeps', de: 'die Stadt, die niemals schläft' },
      { key: 'w:skyline', en: 'skyline', de: 'die Skyline (Silhouette der Stadt)' },
      { key: 'w:harbour', en: 'harbour', de: 'der Hafen' },
      { key: 'w:neon-lights', en: 'neon lights', de: 'die Neonlichter' },
      { key: 'w:monsoon', en: 'monsoon', de: 'der Monsun' },
      { key: 'w:ferry', en: 'ferry', de: 'die Fähre' },
      { key: 'w:rooftop', en: 'rooftop', de: 'das Dach / die Dachterrasse' },
      { key: 'w:crowded', en: 'crowded', de: 'überfüllt / voll' },
      { key: 'w:miss', en: 'to miss someone', de: 'jemanden vermissen' },
      { key: 'w:heartbreak', en: 'heartbreak', de: 'der Liebeskummer' },
      { key: 'w:long-for', en: 'to long for', de: 'sich sehnen nach' },
      { key: 'w:let-go', en: 'to let go', de: 'loslassen' },
      { key: 'w:far-away', en: 'far away', de: 'weit weg' },
      { key: 'w:distance', en: 'distance', de: 'die Entfernung / die Distanz' },
      { key: 'w:memory', en: 'memory', de: 'die Erinnerung' },
      { key: 'w:stranger', en: 'stranger', de: 'der/die Fremde' },
      { key: 'w:fade', en: 'to fade', de: 'verblassen' },
      { key: 'w:come-back', en: 'to come back', de: 'zurückkommen' },
      { key: 'dt-to-fall-in-love', vocabId: 'dt-to-fall-in-love' },
      { key: 'tp-lonely', vocabId: 'tp-lonely' },
      { key: 'ev-to-forget', vocabId: 'ev-to-forget' },
      { key: 'ev-to-remember', vocabId: 'ev-to-remember' },
      { key: 'ev-to-wait', vocabId: 'ev-to-wait' },
      { key: 'ev-to-stay', vocabId: 'ev-to-stay' },
      { key: 'ev-tonight', vocabId: 'ev-tonight' },
      { key: 'tp-to-hold', vocabId: 'tp-to-hold' },
      { key: 'tp-forever', vocabId: 'tp-forever' },
      { key: 'tp-island', vocabId: 'tp-island' },
      { key: 'tp-tears', vocabId: 'tp-tears' },
      { key: 'ev-to-lose', vocabId: 'ev-to-lose' },
    ],
    lines: [
      { en: 'Hong Kong is the city that never sleeps.', de: 'Hongkong ist die Stadt, die niemals schläft.', keys: ['w:city-never-sleeps'] },
      { en: 'From the rooftop I can see the whole skyline.', de: 'Vom Dach aus sehe ich die ganze Skyline.', keys: ['w:rooftop', 'w:skyline'] },
      { en: 'We took the ferry across the harbour at night.', de: 'Nachts sind wir mit der Fähre über den Hafen gefahren.', keys: ['w:ferry', 'w:harbour'] },
      { en: 'I still miss you when the monsoon rain comes.', de: 'Ich vermisse dich immer noch, wenn der Monsunregen kommt.', keys: ['w:miss', 'w:monsoon'] },
      { en: 'Even in a crowded street I feel lonely without you.', de: 'Selbst in einer vollen Straße fühle ich mich ohne dich einsam.', keys: ['w:crowded', 'tp-lonely'] },
      { en: 'I fell in love with you under the neon lights.', de: 'Unter den Neonlichtern habe ich mich in dich verliebt.', keys: ['dt-to-fall-in-love', 'w:neon-lights'] },
      { en: 'You are so far away, and the distance hurts.', de: 'Du bist so weit weg, und die Entfernung tut weh.', keys: ['w:far-away', 'w:distance'] },
      { en: "I don't want to let go of this memory.", de: 'Ich will diese Erinnerung nicht loslassen.', keys: ['w:let-go', 'w:memory'] },
      { en: 'Please stay tonight and hold me forever.', de: 'Bitte bleib heute Nacht und halt mich für immer.', keys: ['ev-to-stay', 'ev-tonight', 'tp-to-hold', 'tp-forever'] },
      { en: 'Will you come back, or will our love fade?', de: 'Kommst du zurück, oder verblasst unsere Liebe?', keys: ['w:come-back', 'w:fade'] },
      { en: 'We were strangers on an island of lights.', de: 'Wir waren Fremde auf einer Insel aus Lichtern.', keys: ['w:stranger', 'tp-island'] },
      { en: 'I long for you – this heartbreak is hard to forget.', de: 'Ich sehne mich nach dir – diesen Liebeskummer kann man kaum vergessen.', keys: ['w:long-for', 'w:heartbreak', 'ev-to-forget'] },
    ],
  },
]);

// The recordings of a prepared song: its own words (vocabulary words have theirs) and its sentences, in the natural
// voice like the words of the app (scripts/generate-audio.mjs). ids: sg-<song>-w-<word> and sg-<song>-l-<line>.
export const songSlug = (id) => String(id).replace(/^preset-/, '');
export const songWordAudioId = (songId, key) => `sg-${songSlug(songId)}-w-${String(key).replace(/^w:/, '')}`;
export const songLineAudioId = (songId, index) => `sg-${songSlug(songId)}-l-${index}`;

export function songAudioTexts() {
  return PRESET_SONGS.flatMap((song) => [
    ...song.words.filter((w) => !w.vocabId).map((w) => ({ id: songWordAudioId(song.id, w.key), text: w.en })),
    ...song.lines.map((l, i) => ({ id: songLineAudioId(song.id, i), text: l.en })),
  ]);
}
