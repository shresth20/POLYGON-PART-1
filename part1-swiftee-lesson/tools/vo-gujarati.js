// vo-gujarati.js — the Gujarati voice-over: which line is which, who says it, and how it is generated.
'use strict';
const { recordings, derived } = require('./vo-hindi.js');   // the same lines as the Hindi take, in the same order

/* ElevenLabs library voices, both native Gujarati and verified on the model below. Chosen for children in
   classes 6–7: clear, unhurried, friendly. */
const VOICES = {
  swiftee: { name: 'Hetalben', id: '1wX3DrX9Q7x2fkeiljyg', library: 'Hetalben - Young Gujarati Customer Care (bright, warm, young)' },
  popo:    { name: 'Bhavesh Bhai', id: 'UHwU6ReRgTsCs68KHc6C', library: 'Bhavesh Bhai - Expressive Gujarati Friend (expressive, made for cartoon characters)' }
};
const MODEL = 'eleven_v4';
const SETTINGS = { stability: 0.6, similarity_boost: 0.8, speed: 0.92 };   // a touch slower than talk, for a child listening
const SEED = 4107;

/* Part 1 speaks in Swiftee's voice (sw1-sw3 too: Swiftee says them over the game); the Frozen Rush lines are Popo's. */
const lines = recordings.map((r) => ({ id: r.id, plays: r.plays, speaker: r.plays === 1 ? 'swiftee' : 'popo',
  file: 'assets/VO-GU/' + r.id + '.mp3' }));

/* What is SAID where it differs from what is SHOWN (same number of words, so each word keeps its onset). */
const SPOKEN = {
  'p2-3-samevertex': (s) => s.replace(/(^|\s)2(\s)/, '$1બે$2')
};

module.exports = { VOICES, MODEL, SETTINGS, SEED, lines, derived, SPOKEN };
