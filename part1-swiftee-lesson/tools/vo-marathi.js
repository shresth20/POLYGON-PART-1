// vo-marathi.js — the Marathi voice-over: which line is which, who says it, and how it is generated.
'use strict';
const { recordings, derived } = require('./vo-hindi.js');   // the same lines as the Hindi take, in the same order

/* ElevenLabs library voices, both native Marathi and verified on the model below. Chosen for children in
   classes 6–7: clear, unhurried, friendly. */
const VOICES = {
  swiftee: { name: 'Sayali', id: 'ObcUVfo3RbQv9i2RBbAe', library: 'Sayali - Marathi User Onboarding Agent (warm, clear, welcoming)' },
  popo:    { name: 'Vardaan', id: 'ritE7mWIE55SDe0J11Kk', library: 'Vardaan - Expressive Marathi Care Agent (bright, upbeat)' }
};
const MODEL = 'eleven_v4';
const SETTINGS = { stability: 0.6, similarity_boost: 0.8, speed: 0.92 };   // a touch slower than talk, for a child listening
const SEED = 4107;

/* Part 1 speaks in Swiftee's voice (sw1-sw3 too: Swiftee says them over the game); the Frozen Rush lines are Popo's. */
const lines = recordings.map((r) => ({ id: r.id, plays: r.plays, speaker: r.plays === 1 ? 'swiftee' : 'popo',
  file: 'assets/VO-MR/' + r.id + '.mp3' }));

/* What is SAID where it differs from what is SHOWN (same number of words, so each word keeps its onset). */
const SPOKEN = {
  'p2-3-samevertex': (s) => s.replace(/(^|\s)2(\s)/, '$1दोन$2')
};

module.exports = { VOICES, MODEL, SETTINGS, SEED, lines, derived, SPOKEN };
