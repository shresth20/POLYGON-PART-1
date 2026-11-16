#!/usr/bin/env node
// build-vo-gujarati.js — cuts the Gujarati recordings (assets/VO-GU, made by tools/make-vo-gujarati.js) into what
// the game plays with ?lan=gu: the lesson's clips in assets/vo/gu/ and Frozen Rush's one take,
// part2-frozen-rush/game/assets/audio/vo-lines-gu (+ game/js/vo-gu.js), and writes docs/VO-GUJARATI.md.
// No API call. Needs ffmpeg and ffprobe on PATH, and PYTHON=<python with numpy soundfile lameenc scipy> for the
// MP3 twins (tools/mp3-twins.py). Then, in part2-frozen-rush: node tools/build-bundle.mjs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { lines, derived, VOICES, MODEL } = require('./vo-gujarati.js');

const LESSON = path.resolve(__dirname, '..');
const REPO = path.resolve(LESSON, '..');
const P2 = path.join(REPO, 'part2-frozen-rush', 'game');
const RECORD = path.join(LESSON, 'docs', 'vo-gujarati.json');
const OUT1 = path.join(LESSON, 'assets', 'vo', 'gu');
const TAKE = path.join(P2, 'assets', 'audio', 'vo-lines-gu');
const MODULE = path.join(P2, 'js', 'vo-gu.js');
const DOC = path.join(LESSON, 'docs', 'VO-GUJARATI.md');
const LOC = JSON.parse(fs.readFileSync(path.join(REPO, 'polygon-locales.json'), 'utf8'));
const TARGET_LUFS = -21;   // the Hindi take's level, so the two languages sound alike in the game
const RATE = 44100;
const LEAD = 0.04;

const plain = (s) => String(s == null ? '' : s).replace(/<\/?strong>/g, '').trim();
const textOf = (id) => {
  if (typeof LOC.gu[id] !== 'string') throw new Error('no Gujarati text for ' + id + ' in polygon-locales.json');
  return plain(LOC.gu[id]);
};
const abs = (f) => path.resolve(LESSON, f);
const run = (cmd, args, input) => {
  const r = spawnSync(cmd, args, { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(cmd + ' ' + args.join(' ') + '\n' + (r.stderr || '').toString());
  return r;
};

const A = JSON.parse(fs.readFileSync(RECORD, 'utf8'));
const byId = {};
A.recordings.forEach((r) => { byId[r.id] = r; });
const stale = lines.filter((l) => !byId[l.id] || byId[l.id].text !== textOf(l.id) || !fs.existsSync(abs(l.file)));
if (stale.length) {
  console.error('not generated for the words the game shows now: ' + stale.map((l) => l.id).join(' ') +
    '\n  -> ELEVENLABS_API_KEY=... node tools/make-vo-gujarati.js (paid: ask first)');
  process.exit(1);
}

/** Each word's start, a little early; a silent word (an em dash) takes the next word's. */
function onsets(r) {
  const out = r.words.map((w) => (w.start == null ? null : Math.max(0, w.start - LEAD)));
  for (let i = out.length - 1; i >= 0; i--) if (out[i] == null) out[i] = i + 1 < out.length ? out[i + 1] : r.words[i - 1].end;
  return out;
}
function speech(file) {
  const log = run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-45dB:d=0.08', '-f', 'null', '-']).stderr.toString();
  const dur = parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout.toString());
  const st = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, parseFloat(m[1])));
  const en = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const sil = st.map((s, i) => [s, en[i] != null ? en[i] : dur]);
  const start = sil.length && sil[0][0] < 0.01 ? sil[0][1] : 0;
  const last = sil[sil.length - 1];
  const end = last && last[1] >= dur - 0.01 && last[0] > start ? last[0] : dur;
  return { dur, start, end, pauses: sil.filter((p) => p[0] > start + 0.01 && p[1] < end - 0.01) };
}
function lufs(file) {
  const log = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-']).stderr.toString();
  const m = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/.exec(log);
  return m ? parseFloat(m[1]) : null;
}
/** A piece of a recording as mono 16-bit PCM at 44.1 kHz, the gain applied. */
function pcm(file, from, to, gainDb) {
  return run('ffmpeg', ['-v', 'error', '-i', file, '-af', 'atrim=start=' + from.toFixed(4) + (to != null ? ':end=' + to.toFixed(4) : '') +
    ',asetpts=PTS-STARTPTS,volume=' + gainDb.toFixed(2) + 'dB', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-']).stdout;
}
const pcmIn = ['-f', 's16le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-fflags', '+bitexact', '-flags:a', '+bitexact'];
const opus = (out, raw) => run('ffmpeg', ['-v', 'error', '-y', ...pcmIn, '-c:a', 'libopus', '-b:a', '40k', '-vbr', 'on', '-application', 'voip', '-map_metadata', '-1', '-f', 'ogg', out], raw);
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;

/* one level per voice: each voice's median recording to the target */
const GAIN = {};
Object.keys(VOICES).forEach((sp) => {
  const levels = lines.filter((l) => l.speaker === sp).map((l) => lufs(abs(l.file))).filter((x) => x != null).sort((a, b) => a - b);
  const median = levels[Math.floor(levels.length / 2)];
  GAIN[sp] = Math.max(-12, Math.min(6, TARGET_LUFS - median));
  console.log('loudness, ' + VOICES[sp].name + ': median ' + median.toFixed(1) + ' LUFS of ' + levels.length + ' recordings -> ' +
    (GAIN[sp] >= 0 ? '+' : '') + GAIN[sp].toFixed(1) + ' dB to ' + TARGET_LUFS);
});
const speakerOf = (id) => lines.find((l) => l.id === id).speaker;

/* ---- Part 1: one clip per line ---- */
fs.mkdirSync(OUT1, { recursive: true });
const want1 = new Set(lines.filter((l) => l.plays === 1).map((l) => l.id));
for (const f of fs.readdirSync(OUT1)) {                 // a clip whose line is no longer mapped goes
  const id = f.replace(/\.(mp3|ogg)$/, '');
  if (/\.(mp3|ogg)$/.test(f) && !want1.has(id)) fs.unlinkSync(path.join(OUT1, f));
}
const timings1 = {};
lines.filter((l) => l.plays === 1).forEach((l) => {
  const file = abs(l.file), r = byId[l.id], sp = speech(file), on = onsets(r);
  const cut = Math.max(0, Math.min(sp.start, on[0]) - 0.06);
  const to = Math.min(sp.dur, sp.end + 0.15);
  opus(path.join(OUT1, l.id + '.ogg'), pcm(file, cut, to, GAIN[l.speaker]));
  let prev = -1;
  timings1[l.id] = on.map((t) => { const ms = Math.max(prev, Math.round((t - cut) * 100) * 10, 0); prev = ms; return ms; });
});
fs.writeFileSync(path.join(OUT1, 'word-timings.json'), JSON.stringify(timings1, null, 2) + '\n');
execFileSync(process.execPath, [path.join(__dirname, 'build-vo-index.js'), '--lang', 'gu'], { stdio: 'inherit' });

/* ---- Part 2: one take, a window per line ---- */
const lines2 = lines.filter((l) => l.plays === 2).map((l) => {
  const file = abs(l.file), r = byId[l.id], sp = speech(file), on = onsets(r);
  const from = Math.max(0, Math.min(sp.start, on[0]) - 0.06), to = Math.min(sp.dur, sp.end + 0.12);
  return { id: l.id, text: r.text, file, from, to, speaker: l.speaker, words: on.map((t) => t - from) };
}).concat(derived.filter((d) => d.plays === 2).map((d) => {
  const r = byId[d.from], file = abs(r.file), sp = speech(file), on = onsets(r);
  const from = Math.max(0, Math.min(sp.start, on[0]) - 0.06);
  const after = sp.pauses.find((p) => p[0] > on[d.words - 1]);
  const to = after ? Math.min(after[0] + 0.12, after[1]) : sp.end + 0.12;
  return { id: d.id, text: r.words.slice(0, d.words).map((w) => w.w).join(' '), file, from, to, speaker: speakerOf(d.from),
           words: on.slice(0, d.words).map((t) => t - from) };
}));
const GAP = Buffer.alloc(Math.round(RATE * 0.65) * 2);
const parts = [], windows = [];
let samples = 0;
lines2.forEach((ln, i) => {
  if (i) { parts.push(GAP); samples += GAP.length / 2; }
  const raw = pcm(ln.file, ln.from, ln.to, GAIN[ln.speaker]);
  const dur = raw.length / 2 / RATE;
  let prev = -1;
  const words = ln.words.map((t) => { const v = Math.max(prev, r2(t), 0); prev = v; return v; });
  windows.push({ id: ln.id, text: ln.text, at: r3(samples / RATE), dur: r3(dur), words });
  parts.push(raw); samples += raw.length / 2;
});
opus(TAKE + '.ogg', Buffer.concat(parts));
const pad = Math.max(...windows.map((w) => w.id.length)) + 3;
fs.writeFileSync(MODULE,
  '/* GENERATED by part1-swiftee-lesson/tools/build-vo-gujarati.js from the Gujarati recordings — DO NOT EDIT.\n' +
  ' *\n' +
  ' * THE GUJARATI TAKE (?lan=gu): every Part 2 line in Gujarati (ElevenLabs, Bhavesh Bhai; the cheer is Swiftee\'s), one after\n' +
  ' * another in one file, and a window per line in the English take\'s form — [start, length, word onsets], seconds —\n' +
  ' * with one onset per Gujarati word shown. engine.js plays this instead of CFG.vo when the game speaks Gujarati\n' +
  ' * (VO_TAKES). A line with no window here is not heard. */\n' +
  'export const VO_GU = {\n' +
  "  src: 'assets/audio/vo-lines-gu.ogg', gain: 1,\n" +
  '  lines: {\n' +
  windows.map((w) => '    ' + (JSON.stringify(w.id) + ':').padEnd(pad) + JSON.stringify([w.at, w.dur, w.words]).replace(/,/g, ', ') + ',   // ' + w.text).join('\n') + '\n' +
  '  }\n' +
  '};\n');
console.log('vo-lines-gu  ' + windows.length + ' windows, ' + (samples / RATE).toFixed(2) + ' s  (part2-frozen-rush/game/js/vo-gu.js)');

/* ---- MP3 twins, for browsers without Ogg (older iPads) ---- */
if (process.env.PYTHON) {
  execFileSync(process.env.PYTHON, [path.join(__dirname, 'mp3-twins.py'), '--mode', 'voice', OUT1, TAKE + '.ogg'], { stdio: 'inherit' });
} else {
  console.warn('PYTHON not set: the MP3 twins (assets/vo/gu/*.mp3, vo-lines-gu.mp3) were NOT remade — run tools/mp3-twins.py --mode voice');
}

/* ---- the record of it ---- */
const EN = LOC.en;
const cell = (s) => String(s).replace(/\|/g, '\\|');
const recs = lines.map((l) => byId[l.id]);
const sum = (k) => recs.reduce((a, r) => a + (r[k] || 0), 0);
const fmt = (s) => Math.floor(s / 60) + ' min ' + (s % 60).toFixed(1) + ' s';
fs.writeFileSync(DOC,
  '# Gujarati voice-over — which recording is which line\n\n' +
  '_Generated by `node tools/build-vo-gujarati.js` from `docs/vo-gujarati.json`; do not edit by hand._\n\n' +
  'With `?lan=gu` both halves speak Gujarati: the lesson plays `assets/vo/gu/<id>.ogg` (or `.mp3`) and Frozen Rush its Gujarati take ' +
  '(`game/assets/audio/vo-lines-gu`), each word shown as the voice says it.\n\n' +
  '**Recordings:** generated with ElevenLabs (`' + MODEL + '`, Gujarati) by `tools/make-vo-gujarati.js` into `assets/VO-GU/<id>.mp3` — a paid API, ' +
  'run only with the owner\'s go-ahead (CLAUDE.md). Swiftee is **' + VOICES.swiftee.name + '** (`' + VOICES.swiftee.id + '`, ' + VOICES.swiftee.library + '); ' +
  'the Frozen Rush lines are **' + VOICES.popo.name + '** (`' + VOICES.popo.id + '`, ' + VOICES.popo.library + '). ' +
  'A line re-worded in `polygon-locales.json` is made again by the same command (only the changed lines are sent), then `node tools/build-vo-gujarati.js` ' +
  'and, in `part2-frozen-rush`, `node tools/build-bundle.mjs`.\n\n' +
  '## Totals\n\n' +
  '| Lines | Words | Characters sent | Credits | Audio |\n|---|---|---|---|---|\n' +
  '| ' + recs.length + ' | ' + sum('words_count') + ' | ' + sum('chars') + ' | ' + sum('credits') + ' | ' + fmt(sum('seconds')) + ' |\n\n' +
  '## Recorded (' + recs.length + ')\n\n' +
  '| # | Line | Voice | Played by | Gujarati (on screen and spoken) | English | Seconds | Credits |\n|---|---|---|---|---|---|---|---|\n' +
  lines.map((l, i) => {
    const r = byId[l.id];
    return '| ' + (i + 1) + ' | `' + l.id + '` | ' + r.voice + ' | Part ' + l.plays + ' | ' + cell(r.text) + (r.spoken !== r.text ? ' (said: ' + cell(r.spoken) + ')' : '') +
      ' | ' + cell(plain(EN[l.id])) + ' | ' + r.seconds + ' | ' + (r.credits == null ? '?' : r.credits) + ' |';
  }).join('\n') + '\n' +
  derived.map((d) => '| — | `' + d.id + '` | ' + byId[d.from].voice + ' | Part ' + d.plays + ' | ' + cell(lines2.find((l) => l.id === d.id).text) +
    ' (the opening of `' + d.from + '`) | (the ending\'s cheer) | | |').join('\n') + '\n');
console.log('docs/VO-GUJARATI.md');
