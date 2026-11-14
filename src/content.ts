/* ============================================================
   CONTENT — the single source of truth for every word on the site.
   Nothing is hard-coded inside sections: copy lives here so it can
   be reviewed, corrected and translated in one place.
   ============================================================ */

export const RECIPIENT = {
  fullName: 'Fitria Cahaya Aulia',
  firstName: 'Fitria',
  nickname: 'Fitri',
} as const;

export const AUTHOR = {
  name: 'Agis',
  signature: 'Agis',
} as const;

export const SITE = {
  title: 'Fitria — A Little World Made For You',
  description: 'A handmade digital birthday scrapbook for Fitria Cahaya Aulia, made by Agis.',
  /** Where the site actually lives — used by the link preview tags in index.html. */
  url: 'https://rann-xyz.github.io/hbd/',
  /** The social card, relative to the site root. */
  ogImage: 'assets/og-cover.png',
  ogImageAlt: 'A handmade birthday card: Fitria — a little world made for you.',
} as const;

/** The one real photograph. Never regenerated, never altered, never cropped square. */
export const PORTRAIT = {
  src: './assets/fitria-portrait.jpg',
  width: 720,
  height: 1280,
  alt: 'Portrait of Fitria Cahaya Aulia',
  orientation: 'portrait' as const,
} as const;

/** The day this little world is counting towards (WIB / UTC+7). */
export const BIRTHDAY = {
  iso: '2026-11-17T00:00:00+07:00',
  isoEnd: '2026-11-17T23:59:59.999+07:00',
  timeZone: 'Asia/Jakarta',
  label: '17 November',
  year: 2026,
} as const;

export const OPENING = {
  eyebrow: 'A handmade little something',
  headline: 'A LITTLE WORLD MADE FOR YOU',
  intro: 'Some people make ordinary days feel a little more beautiful.',
  nameLine: RECIPIENT.fullName,
  cta: 'OPEN YOUR SURPRISE',
  ctaMark: '→',
  handNote: 'made slowly, on a phone, with a lot of feeling',
  stamp: { year: '17.11.2026', label: 'for you' },
} as const;

export const COUNTDOWN_COPY = {
  eyebrow: 'The countdown',
  headingLead: 'Until the seventeenth,',
  headingAccent: 'when the world turns a little softer',
  intro: 'Every second between now and then is a second closer to a day that belongs to you.',
  units: {
    days: 'Days',
    hours: 'Hours',
    minutes: 'Minutes',
    seconds: 'Seconds',
  },
  birthdayHeading: 'Today is the day.',
  birthdayLine: 'Happy birthday, Fitria — the whole day is yours.',
  birthdayNote: 'No countdown needed today. Just this.',
  afterHeading: 'The day has passed, but the wish did not.',
  afterLine: 'Belated or early, the wish keeps the same shape: I hope this year is gentle with you.',
  ariaLivePrefix: 'Time left until your birthday:',
} as const;

export const PORTRAIT_SECTION = {
  eyebrow: 'A portrait, kept close',
  heading: 'THE GIRL WHO MAKES THIS WORLD A LITTLE BRIGHTER',
  body: [
    'I only have one photograph of you that I keep like something borrowed from a better day. So instead of scattering a hundred pictures across a page, I built a whole page around this one.',
    'Look at it for a second — the ordinary, unhurried way you exist in it. That is the part I like most. Not a performance, not a pose. Just you, quietly being the reason some days feel worth writing down.',
  ],
  caption: 'one photograph, and still my favourite view',
  stamp: { year: 'No. 01', label: 'kept safe' },
} as const;

export const LETTER = {
  eyebrow: 'A letter',
  heading: 'The part I kept rehearsing',
  envelopeHint: 'Open it, if you have a moment',
  envelopeAria: 'Open the birthday letter',
  closeAria: 'Close the letter',
  salutation: 'Dear Fitria,',
  body: [
    'I wanted to hand you something in person this year. Something small and finished, with a bow on it, that you could hold. I do not have that yet — so this is what I have instead: a page, built one line at a time, on the only device I own, because you deserve more than a message that disappears.',
  ],
  apology:
    "I'm sorry I haven't been able to give you something special yet. I'm still trying my best to make it happen. Maybe I can't give you everything you deserve right now, but please know that I'm working on it. I hope one day I can give you something that makes you feel as special as you truly are.",
  closing: [
    'Until then, take this as proof: you are being thought about, carefully, on purpose, right now.',
  ],
  signOff: 'With love,',
  postscript: 'p.s. this page is not finished. Neither am I. Both of us are getting there.',
} as const;

export type NoteId = 'tired' | 'doubt' | 'miss' | 'difficult' | 'because';

export interface NoteEntry {
  readonly id: NoteId;
  /** What the note says on the outside of the fold. */
  readonly label: string;
  readonly sublabel: string;
  /** What is inside. Written in Agis's voice, never inventing events. */
  readonly message: string;
}

export const NOTES_INTRO = {
  eyebrow: 'Little notes',
  heading: 'Five notes for the days that need them',
  intro:
    'Not every day needs a celebration. Some need a sentence. Open whichever one matches the day you are having.',
  openHint: 'Tap a note to open it',
  closeHint: 'Tap again to fold it back',
} as const;

export const NOTES: readonly NoteEntry[] = [
  {
    id: 'tired',
    label: 'When you feel tired',
    sublabel: 'read this one lying down',
    message:
      'Then put it all down for a while. You are not behind, and nothing you are carrying has to be carried in one go. Drink something warm, let the day finish without you, and sleep like someone who is allowed to rest. I will still be here on the other side of it.',
  },
  {
    id: 'doubt',
    label: 'When you doubt yourself',
    sublabel: 'for the loud days inside your head',
    message:
      'You do not have to be certain to be doing well. Take it from someone who watches you from a distance and still sees it clearly: you are not less than anyone, and you are not late. The things you are quietly working on count even on the days nobody claps. I clap.',
  },
  {
    id: 'miss',
    label: 'When you miss me',
    sublabel: 'same sky, same night',
    message:
      'Then treat this page as a hand reaching back. Wherever you are reading it, I am probably thinking about you around the same hour, in the same quiet way. Miss me a little less, please. I am not going anywhere.',
  },
  {
    id: 'difficult',
    label: 'When life gets difficult',
    sublabel: 'small pieces only',
    message:
      'You were never meant to get through everything alone. Take it in small pieces — one breath, one hour, one thing at a time — and let the rest wait. If you cannot be strong today, then today I will hold it for you. You are allowed to be tired here.',
  },
  {
    id: 'because',
    label: 'Just because',
    sublabel: 'no occasion attached',
    message:
      'No reason. No condition. No special day required. I just wanted one note, somewhere in the world, that says the plain truth without decoration: you are so loved, Fitria. That is all this one says.',
  },
] as const;

export const CAKE = {
  eyebrow: 'Make a wish',
  heading: 'One candle, one wish, no rules',
  intro: 'Blow it out whenever you are ready. I will pretend not to listen, so it comes true.',
  candleAria: 'Blow out the candle',
  litLabel: 'The candle is lit',
  outLabel: 'You blew it out',
  wishPrompt: 'Now hold it in your head for a second before you let it go.',
  wishDone: 'Wish sent. Nothing to do now but wait for the year to be kind.',
  relight: 'Light it again',
  /** Unfurls once the candle is out — the page throws the party itself. */
  banner: 'Happy Birthday, Fitria',
  cutLabel: 'Cut the cake',
  cutAria: 'Cut the cake open',
  cutStatus: 'Cut open. Whatever is inside is yours.',
  cutNote:
    'There is nothing here you can actually eat, so here is what I would have written on the plate: I hope this year gives you back everything you quietly hand to everyone else.',
  singLabel: 'Sing it with me',
  singAria: 'Play the birthday song',
  againLabel: 'One more time',
  againAria: 'Throw the confetti again',
  balloons: [
    { id: 'first', aria: 'Pop the first balloon', line: 'One more year of you being exactly this lovely.' },
    { id: 'second', aria: 'Pop the second balloon', line: 'You are the best thing an ordinary year ever handed me.' },
    { id: 'third', aria: 'Pop the third balloon', line: 'Whatever this year brings, you will not carry it alone.' },
  ],
} as const;

export const JOURNAL = {
  eyebrow: 'A wish for your future',
  heading: 'A Wish for Your Future',
  intro:
    'Write down what you want the next year to hold. Keep it here for yourself — I am not reading this page. These wishes belong to you, not to me.',
  formHeading: 'Write a wish',
  listHeading: 'Your wishes so far',
  fields: {
    title: { label: 'Title', placeholder: 'Give the wish a name' },
    description: { label: 'What it means', placeholder: 'Say it properly, in your own words' },
  },
  submit: 'Keep this wish',
  submitting: 'Keeping it…',
  removeLabel: 'Delete this wish',
  removeConfirm: 'Delete this wish? It cannot be undone.',
  empty: 'Nothing here yet. The first wish is always the hardest to write down.',
  loading: 'Looking through your wishes…',
  errorTitle: 'That did not save',
  retry: 'Try again',
  savedTitle: 'Saved',
  savedBody: 'Kept for you. Come back and read it whenever you want.',
  deviceNotice:
    'Saved privately on this device only. These wishes stay in this browser and nowhere else — not even I can read them.',
  cloudNotice: 'Saved privately in your own database. Only you can read this.',
  localCountLabel: 'wishes kept on this device',
  localCountLabelOne: 'wish kept on this device',
  cloudCountLabel: 'wishes kept in your database',
  cloudCountLabelOne: 'wish kept in your database',
} as const;

export const CLOSING = {
  eyebrow: 'And finally',
  heading: 'Happy Birthday, Fitria Cahaya Aulia.',
  lines: [
    'Thank you for existing in the same timeline as me.',
    'I hope this year is softer, kinder, and closer to the things you quietly want.',
  ],
  signOff: 'With love,',
  signature: AUTHOR.signature,
  caption: 'the last page, for now',
  restart: 'Read it again from the start',
} as const;

export const FOOT = {
  format: 'Made by hand for {name} — {year}',
  note: 'no templates, no shortcuts, one photograph',
} as const;

export const MUSIC = {
  /** The control is a single button, so its label carries the whole meaning. */
  playLabel: 'Play the birthday song',
  pauseLabel: 'Pause the birthday song',
  hint: 'Happy Birthday, played on a music box',
} as const;

/** Navigation is generated from the sections, so it can never drift out of sync. */
export interface NavEntry {
  readonly id: string;
  readonly label: string;
}

export const NAV: readonly NavEntry[] = [
  { id: 'opening', label: 'Opening' },
  { id: 'countdown', label: 'Countdown' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'letter', label: 'Letter' },
  { id: 'notes', label: 'Notes' },
  { id: 'wish', label: 'Wish' },
  { id: 'journal', label: 'Journal' },
  { id: 'closing', label: 'Closing' },
];

/** Section ids that actually exist right now — kept honest as phases land. */
export const BUILT_SECTIONS: readonly string[] = [
  'opening',
  'countdown',
  'portrait',
  'letter',
  'notes',
  'wish',
  'journal',
  'closing',
];

export function navEntriesFor(ids: readonly string[]): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const id of ids) {
    const found = NAV.find((entry) => entry.id === id);
    if (found) entries.push({ id: found.id, label: found.label });
  }
  return entries;
}
