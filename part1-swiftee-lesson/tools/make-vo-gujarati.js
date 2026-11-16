#!/usr/bin/env node
// make-vo-gujarati.js — generates the Gujarati voice-over with ElevenLabs into assets/VO-GU/<id>.mp3, and records
// each line's word timings (the API's own character alignment) and cost in docs/vo-gujarati.json.
//
// PAID API: run it only with the owner's explicit go-ahead (CLAUDE.md). The key comes from the environment
// and is never written anywhere:
//   ELEVENLABS_API_KEY=... node tools/make-vo-gujarati.js [--only p01,p13] [--force]
// A line already generated for the same words, voice and settings is skipped; --force makes it again.
// Then: node tools/build-vo-gujarati.js (free) cuts the clips the game plays.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { VOICES, MODEL, SETTINGS, SEED, lines, SPOKEN } = require('./vo-gujarati.js');

const LESSON = path.resolve(__dirname, '..');
const REPO = path.resolve(LESSON, '..');
const OUT = path.join(LESSON, 'assets', 'VO-GU');
const RECORD = path.join(LESSON, 'docs', 'vo-gujarati.json');
const LOC = JSON.parse(fs.readFileSync(path.join(REPO, 'polygon-locales.json'), 'utf8'));
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('set ELEVENLABS_API_KEY'); process.exit(1); }

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('--only') ? arg('--only').split(',').map((s) => s.trim()).filter(Boolean) : null;
const force = process.argv.includes('--force');

const plain = (s) => String(s == null ? '' : s).replace(/<\/?strong>/g, '').trim();
const wordsOf = (s) => plain(s).split(/\s+/).filter(Boolean);
const shownOf = (id) => {
  if (typeof LOC.gu[id] !== 'string') throw new Error('no Gujarati text for ' + id + ' in polygon-locales.json');
  return plain(LOC.gu[id]);
};
const spokenOf = (id) => (SPOKEN[id] ? SPOKEN[id](shownOf(id)) : shownOf(id));
const isWord = (w) => /[\p{L}\p{N}]/u.test(w);          // an em dash is shown but not said

const record = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : { recordings: [] };
const byId = {};
(record.recordings || []).forEach((r) => { byId[r.id] = r; });
function save() {
  const doc = {
    note: 'The Gujarati voice-over, generated with ElevenLabs (tools/make-vo-gujarati.js) into assets/VO-GU/<id>.mp3. ' +
          'words: where each word shown falls in its file, in seconds, from the API\'s character alignment ' +
          '(an em dash is null). credits: the request\'s character-cost header. tools/build-vo-gujarati.js cuts the game\'s clips from this.',
    model: MODEL, settings: SETTINGS, seed: SEED, voices: VOICES,
    recordings: lines.filter((l) => byId[l.id]).map((l) => byId[l.id])
  };
  fs.writeFileSync(RECORD, JSON.stringify(doc, null, 1) + '\n');
}

function wordsFrom(al, spoken, shown) {
  const ch = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds;
  const out = [];
  let cur = null;
  ch.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) { out.push(cur); cur = null; } return; }
    if (!cur) cur = { text: '', start: null, end: null };
    cur.text += c;
    if (/[\p{L}\p{M}\p{N}]/u.test(c)) { if (cur.start == null) cur.start = st[i]; cur.end = en[i]; }
  });
  if (cur) out.push(cur);
  const ws = wordsOf(shown);
  if (out.length !== ws.length) throw new Error('alignment has ' + out.length + ' words, the screen shows ' + ws.length + ': ' + spoken);
  return ws.map((w, k) => (isWord(w) && out[k].start != null
    ? { w, start: Math.round(out[k].start * 1000) / 1000, end: Math.round(out[k].end * 1000) / 1000 }
    : { w, start: null, end: null }));
}

function seconds(file, fallback) {
  const r = spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  return d > 0 ? Math.round(d * 1000) / 1000 : fallback;
}

async function tts(line) {
  const voice = VOICES[line.speaker];
  const shown = shownOf(line.id), spoken = spokenOf(line.id);
  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voice.id + '/with-timestamps?output_format=mp3_44100_128';
  const body = { text: spoken, model_id: MODEL, language_code: 'gu', voice_settings: SETTINGS, seed: SEED };
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(line.id + ': HTTP ' + res.status + ' ' + (await res.text()).slice(0, 300));
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(line.id + ': HTTP ' + res.status + ' ' + (await res.text()).slice(0, 500));
    const j = await res.json();
    const ms = Date.now() - t0;
    const file = path.join(OUT, line.id + '.mp3');
    fs.writeFileSync(file, Buffer.from(j.audio_base64, 'base64'));
    const al = j.alignment || j.normalized_alignment;
    const words = wordsFrom(al, spoken, shown);
    const lastEnd = al.character_end_times_seconds[al.character_end_times_seconds.length - 1];
    const cost = parseInt(res.headers.get('character-cost') || res.headers.get('x-character-count') || '', 10);
    return {
      id: line.id, speaker: line.speaker, voice: voice.name, voice_id: voice.id, file: line.file,
      text: shown, spoken, words_count: words.filter((w) => isWord(w.w)).length, chars: [...spoken].length,
      credits: Number.isFinite(cost) ? cost : null, request_id: res.headers.get('request-id') || null,
      seconds: seconds(file, lastEnd), generated_ms: ms, words
    };
  }
}

const sameAs = (r, l) => r && r.spoken === spokenOf(l.id) && r.voice_id === VOICES[l.speaker].id &&
  r.model === MODEL && JSON.stringify(r.settings) === JSON.stringify(SETTINGS) && fs.existsSync(path.join(LESSON, l.file));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const todo = lines.filter((l) => (!only || only.includes(l.id)) && (force || !sameAs(byId[l.id], l)));
  if (only) only.filter((id) => !lines.some((l) => l.id === id)).forEach((id) => console.error('not a line: ' + id));
  console.log(todo.length + ' line' + (todo.length === 1 ? '' : 's') + ' to generate (' + MODEL + ')');
  const t0 = Date.now();
  let next = 0, failed = 0;
  const worker = async () => {
    while (next < todo.length) {
      const l = todo[next++];
      try {
        const r = await tts(l);
        byId[l.id] = Object.assign(r, { model: MODEL, settings: SETTINGS });
        save();
        console.log(l.id.padEnd(22) + r.voice.padEnd(13) + String(r.seconds).padStart(6) + ' s  ' + String(r.chars).padStart(4) + ' chars  ' +
          (r.credits == null ? '?' : r.credits) + ' credits   ' + r.text);
      } catch (e) { failed++; console.error('FAILED ' + e.message); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const done = todo.filter((l) => byId[l.id]);
  console.log('\n' + done.length + ' generated, ' + failed + ' failed, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(failed ? 1 : 0);
})();
