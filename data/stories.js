// Short stories for reading and listening (English course). Every story belongs to a topic and uses its everyday
// words. Each line has a German translation (shown on request) and a recording; three questions check that you
// understood it. Checked by tests/unit/stories.test.js.

export const STORIES = Object.freeze([
  {
    id: 'new-neighbor',
    topic: 'talk',
    icon: '👋',
    title: { de: 'Der neue Nachbar', en: 'The new neighbor' },
    lines: [
      { en: 'Yesterday a new neighbor moved into the apartment next door.', de: 'Gestern ist ein neuer Nachbar in die Wohnung nebenan gezogen.' },
      { en: 'I met him in the hallway and said hello.', de: 'Ich habe ihn im Flur getroffen und Hallo gesagt.' },
      { en: 'His name is Daniel, and he is from Canada.', de: 'Er heißt Daniel und kommt aus Kanada.' },
      { en: 'He asked me where the nearest grocery store is.', de: 'Er hat mich gefragt, wo der nächste Supermarkt ist.' },
      { en: 'I explained the way and recommended a good bakery, too.', de: 'Ich habe ihm den Weg erklärt und auch eine gute Bäckerei empfohlen.' },
      { en: 'He thanked me and invited me for coffee on the weekend.', de: 'Er hat sich bedankt und mich am Wochenende auf einen Kaffee eingeladen.' },
    ],
    questions: [
      { q: 'Where is Daniel from?', options: ['From Canada', 'From Germany', 'From Australia'], answer: 0 },
      { q: 'What did Daniel ask about?', options: ['A good restaurant', 'The nearest grocery store', 'The bus stop'], answer: 1 },
      { q: 'What will they do on the weekend?', options: ['Go shopping', 'Watch a movie', 'Have coffee together'], answer: 2 },
    ],
  },
  {
    id: 'bad-day',
    topic: 'feelings',
    icon: '😮‍💨',
    title: { de: 'Ein schlechter Tag wird besser', en: 'A bad day gets better' },
    lines: [
      { en: 'Lena was in a bad mood this morning.', de: 'Lena hatte heute Morgen schlechte Laune.' },
      { en: 'She missed her train and was late for work.', de: 'Sie hat ihren Zug verpasst und kam zu spät zur Arbeit.' },
      { en: 'Her boss was not angry, but Lena still felt nervous.', de: 'Ihre Chefin war nicht wütend, aber Lena war trotzdem nervös.' },
      { en: 'At lunch, a colleague noticed that she was worried.', de: 'Beim Mittagessen hat eine Kollegin bemerkt, dass sie besorgt war.' },
      { en: 'They talked for a while, and Lena calmed down.', de: 'Sie haben eine Weile geredet, und Lena hat sich beruhigt.' },
      { en: 'In the evening she was tired, but proud of herself.', de: 'Am Abend war sie müde, aber stolz auf sich.' },
    ],
    questions: [
      { q: 'Why was Lena late for work?', options: ['She overslept', 'She missed her train', 'Her car broke down'], answer: 1 },
      { q: 'How did her boss react?', options: ['She was not angry', 'She was very angry', 'She was not there'], answer: 0 },
      { q: 'What helped Lena calm down?', options: ['A long walk', 'A cup of tea', 'Talking to a colleague'], answer: 2 },
    ],
  },
  {
    id: 'busy-week',
    topic: 'time',
    icon: '🗓️',
    title: { de: 'Eine volle Woche', en: 'A busy week' },
    lines: [
      { en: 'Tom has a busy week ahead.', de: 'Tom hat eine volle Woche vor sich.' },
      { en: 'On Monday he has a doctor’s appointment at eight.', de: 'Am Montag hat er um acht einen Arzttermin.' },
      { en: 'On Wednesday he is meeting an old friend after work.', de: 'Am Mittwoch trifft er nach der Arbeit einen alten Freund.' },
      { en: 'He wanted to go to the gym on Thursday, but he has to work late.', de: 'Am Donnerstag wollte er ins Fitnessstudio gehen, aber er muss länger arbeiten.' },
      { en: 'So he decides to go on Friday morning instead.', de: 'Also beschließt er, stattdessen am Freitagmorgen zu gehen.' },
      { en: 'He is looking forward to a quiet weekend.', de: 'Er freut sich auf ein ruhiges Wochenende.' },
    ],
    questions: [
      { q: 'When is the doctor’s appointment?', options: ['On Monday at eight', 'On Wednesday after work', 'On Friday morning'], answer: 0 },
      { q: 'Why can’t Tom go to the gym on Thursday?', options: ['He is sick', 'He has to work late', 'The gym is closed'], answer: 1 },
      { q: 'What is Tom looking forward to?', options: ['A party', 'A business trip', 'A quiet weekend'], answer: 2 },
    ],
  },
  {
    id: 'dinner-out',
    topic: 'food',
    icon: '🍝',
    title: { de: 'Abendessen im Restaurant', en: 'Dinner at a restaurant' },
    lines: [
      { en: 'Anna and Mark booked a table at a small Italian restaurant.', de: 'Anna und Mark haben einen Tisch in einem kleinen italienischen Restaurant reserviert.' },
      { en: 'The waiter brought the menu and some water.', de: 'Der Kellner brachte die Speisekarte und etwas Wasser.' },
      { en: 'Anna ordered pasta with vegetables, and Mark had a pizza.', de: 'Anna bestellte Nudeln mit Gemüse, und Mark nahm eine Pizza.' },
      { en: 'The food was delicious, but the portions were huge.', de: 'Das Essen war köstlich, aber die Portionen waren riesig.' },
      { en: 'They were too full for dessert, so they just had coffee.', de: 'Sie waren zu satt für einen Nachtisch, also tranken sie nur Kaffee.' },
      { en: 'Mark paid the bill and left a tip.', de: 'Mark bezahlte die Rechnung und gab Trinkgeld.' },
    ],
    questions: [
      { q: 'What did Anna order?', options: ['A pizza', 'Pasta with vegetables', 'A salad'], answer: 1 },
      { q: 'Why did they not have dessert?', options: ['They were too full', 'It was too expensive', 'The restaurant was closing'], answer: 0 },
      { q: 'Who paid the bill?', options: ['Anna', 'They shared it', 'Mark'], answer: 2 },
    ],
  },
  {
    id: 'moving-in',
    topic: 'home',
    icon: '📦',
    title: { de: 'Der Umzug', en: 'Moving in' },
    lines: [
      { en: 'Sara moved into her new apartment last weekend.', de: 'Sara ist letztes Wochenende in ihre neue Wohnung gezogen.' },
      { en: 'Two friends helped her carry the boxes upstairs.', de: 'Zwei Freunde haben ihr geholfen, die Kartons nach oben zu tragen.' },
      { en: 'The kitchen is small, but the living room is bright.', de: 'Die Küche ist klein, aber das Wohnzimmer ist hell.' },
      { en: 'She still needs a table and a few chairs.', de: 'Sie braucht noch einen Tisch und ein paar Stühle.' },
      { en: 'In the evening they ordered pizza and sat on the floor.', de: 'Am Abend haben sie Pizza bestellt und auf dem Boden gesessen.' },
      { en: 'Sara was exhausted, but she already feels at home.', de: 'Sara war fix und fertig, aber sie fühlt sich schon zu Hause.' },
    ],
    questions: [
      { q: 'Who helped Sara?', options: ['Her parents', 'Two friends', 'Her neighbors'], answer: 1 },
      { q: 'What does Sara still need?', options: ['A table and chairs', 'A bed', 'A new kitchen'], answer: 0 },
      { q: 'Where did they eat in the evening?', options: ['At a restaurant', 'At the kitchen table', 'On the floor'], answer: 2 },
    ],
  },
  {
    id: 'day-off',
    topic: 'free',
    icon: '🚲',
    title: { de: 'Ein freier Tag', en: 'A day off' },
    lines: [
      { en: 'Ben had a day off and did not set an alarm.', de: 'Ben hatte einen freien Tag und hat sich keinen Wecker gestellt.' },
      { en: 'After breakfast he went for a bike ride along the river.', de: 'Nach dem Frühstück hat er eine Radtour am Fluss entlang gemacht.' },
      { en: 'The weather was sunny, so he stopped for an ice cream.', de: 'Das Wetter war sonnig, also hat er für ein Eis angehalten.' },
      { en: 'In the afternoon he met his sister at the cinema.', de: 'Am Nachmittag hat er seine Schwester im Kino getroffen.' },
      { en: 'The movie was a bit boring, but they had fun anyway.', de: 'Der Film war ein bisschen langweilig, aber sie hatten trotzdem Spaß.' },
      { en: 'Ben wants to do this more often.', de: 'Ben möchte das öfter machen.' },
    ],
    questions: [
      { q: 'What did Ben do after breakfast?', options: ['He went for a bike ride', 'He went back to bed', 'He went shopping'], answer: 0 },
      { q: 'Who did he meet in the afternoon?', options: ['A colleague', 'His sister', 'His neighbor'], answer: 1 },
      { q: 'How was the movie?', options: ['Very exciting', 'Too long', 'A bit boring'], answer: 2 },
    ],
  },
  {
    id: 'missed-flight',
    topic: 'travel',
    icon: '✈️',
    title: { de: 'Fast den Flug verpasst', en: 'Almost missed the flight' },
    lines: [
      { en: 'Julia had a flight to London at ten in the morning.', de: 'Julia hatte um zehn Uhr morgens einen Flug nach London.' },
      { en: 'She left home early, but the train to the airport was delayed.', de: 'Sie ist früh losgegangen, aber der Zug zum Flughafen hatte Verspätung.' },
      { en: 'At the airport, the line at security was very long.', de: 'Am Flughafen war die Schlange an der Sicherheitskontrolle sehr lang.' },
      { en: 'She asked a staff member for help and explained her situation.', de: 'Sie hat einen Mitarbeiter um Hilfe gebeten und ihre Lage erklärt.' },
      { en: 'He let her go first, and she ran to the gate.', de: 'Er ließ sie vor, und sie rannte zum Gate.' },
      { en: 'She got on the plane just two minutes before the doors closed.', de: 'Sie stieg nur zwei Minuten, bevor die Türen schlossen, ins Flugzeug.' },
    ],
    questions: [
      { q: 'Where was Julia flying to?', options: ['To Paris', 'To London', 'To New York'], answer: 1 },
      { q: 'Why was she late?', options: ['Her train was delayed', 'She overslept', 'She forgot her passport'], answer: 0 },
      { q: 'Did she catch her flight?', options: ['No, she missed it', 'She took a later flight', 'Yes, just in time'], answer: 2 },
    ],
  },
  {
    id: 'first-day',
    topic: 'work',
    icon: '💼',
    title: { de: 'Der erste Arbeitstag', en: 'The first day at work' },
    lines: [
      { en: 'Today was Mia’s first day at her new job.', de: 'Heute war Mias erster Tag in ihrem neuen Job.' },
      { en: 'Her manager showed her the office and introduced her to the team.', de: 'Ihre Chefin hat ihr das Büro gezeigt und sie dem Team vorgestellt.' },
      { en: 'In the morning she had a meeting about a new project.', de: 'Am Vormittag hatte sie eine Besprechung über ein neues Projekt.' },
      { en: 'She did not understand everything, so she asked a lot of questions.', de: 'Sie hat nicht alles verstanden, also hat sie viele Fragen gestellt.' },
      { en: 'Her colleagues were friendly and took her out for lunch.', de: 'Ihre Kollegen waren freundlich und haben sie zum Mittagessen mitgenommen.' },
      { en: 'On the way home she thought: this was a good decision.', de: 'Auf dem Heimweg dachte sie: Das war eine gute Entscheidung.' },
    ],
    questions: [
      { q: 'Who showed Mia the office?', options: ['A colleague', 'Her manager', 'Nobody'], answer: 1 },
      { q: 'What did Mia do when she did not understand?', options: ['She asked questions', 'She said nothing', 'She left the meeting'], answer: 0 },
      { q: 'How does Mia feel about the new job?', options: ['She wants to quit', 'She is not sure', 'It was a good decision'], answer: 2 },
    ],
  },
]);

export const storyById = (id) => STORIES.find((s) => s.id === id) ?? null;

// Every line gets a recording (audio/de-en/st-<story>-<line>-english.mp3), like the dialog lines.
export function storyAudioTexts() {
  return STORIES.flatMap((s) => s.lines.map((line, i) => ({ id: `st-${s.id}-${i}`, text: line.en })));
}
