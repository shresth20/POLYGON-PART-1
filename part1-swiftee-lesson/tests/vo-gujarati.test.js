// vo-gujarati.test.js — the Gujarati voice (?lan=gu) says the line on the screen, in step with its words.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LESSON = path.join(__dirname, '..');
const REPO = path.join(LESSON, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'polygon-locales.json'), 'utf8'));
const GU_DIR = path.join(LESSON, 'assets', 'vo', 'gu');

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

global.window = global;
global.POLYGON_LOCALES = DATA;
const I18N = require('../src/core/i18n.js');
const GU = I18N.make('gu');
const words = (s) => String(s).replace(/<\/?strong>/g, '').trim().split(/\s+/).filter(Boolean);
const shown = (id) => GU.tr(String(DATA.en[id]).replace(/<\/?strong>/g, ''));
t('Gujarati is a voiced language', GU.on && GU.voice === true);

/* ---- PART 1 ---- */
const idx = JSON.parse(fs.readFileSync(path.join(GU_DIR, 'index.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(LESSON, 'assets', 'vo', 'index.json'), 'utf8'));
t('Part 1 has its Gujarati clips', idx.clips.length >= 80, idx.clips.length);
const offDisk = fs.readFileSync(path.join(GU_DIR, 'index.js'), 'utf8');
t('the Gujarati index is also a script, for a page opened off the disk', offDisk.indexOf(JSON.stringify(idx.clips)) > 0);
idx.clips.forEach((id) => {
  t(id + ': a line the game asks for', en.clips.indexOf(id) >= 0);
  t(id + ': ogg and its mp3 twin', fs.existsSync(path.join(GU_DIR, id + '.ogg')) && fs.existsSync(path.join(GU_DIR, id + '.mp3')));
  t(id + ': measured', idx.seconds[id] > 0.4 && !!idx.rev[id], [idx.seconds[id], idx.rev[id]]);
  const text = shown(id), on = idx.words[id] || [];
  t(id + ': the screen shows Gujarati', text !== DATA.en[id] && /[\u0A80-\u0AFF]/.test(text), text);
  t(id + ': one onset per word shown ("' + text + '")', on.length === words(text).length, [on.length, words(text).length]);
  t(id + ': the onsets run forward, inside the clip', on.every((ms, i) => ms >= 0 && (!i || ms >= on[i - 1]) && ms < idx.seconds[id] * 1000), on);
  t(id + ': the first word is said at once (no long silence before it)', on[0] <= 400, on[0]);
  if (idx.spoken[id]) t(id + ': the last word starts before the speech ends', on[on.length - 1] < idx.spoken[id], [on[on.length - 1], idx.spoken[id]]);
});
const unvoiced = en.clips.filter((id) => typeof DATA.en[id] === 'string' && typeof DATA.gu[id] === 'string' && idx.clips.indexOf(id) < 0);
t('every line the lesson says has its Gujarati clip (docs/VO-GUJARATI.md)', unvoiced.length === 0, unvoiced);
['sw1', 'sw2', 'sw3'].forEach((id) => t(id + ' (over the game) is a Part 1 clip', idx.clips.indexOf(id) >= 0));

/* ---- PART 2 ---- */
const GAME = path.join(REPO, 'part2-frozen-rush', 'game');
const mod = fs.readFileSync(path.join(GAME, 'js', 'vo-gu.js'), 'utf8');
const VO_GU = vm.runInNewContext('(' + mod.slice(mod.indexOf('{', mod.indexOf('export const VO_GU'))).replace(/;\s*$/, '') + ')');
const engine = fs.readFileSync(path.join(GAME, 'js', 'engine.js'), 'utf8');
const lines = Object.keys(VO_GU.lines);
t('Part 2 plays the Gujarati take', VO_GU.src === 'assets/audio/vo-lines-gu.ogg' && fs.existsSync(path.join(GAME, VO_GU.src)));
t('the Gujarati take has its mp3 twin', fs.existsSync(path.join(GAME, 'assets', 'audio', 'vo-lines-gu.mp3')));
t('Part 2 has its Gujarati lines', lines.length >= 23, lines.length);
const versions = fs.readFileSync(path.join(GAME, 'js', 'asset-versions.js'), 'utf8');
t('the Gujarati take is versioned (tools/build-bundle.mjs)', /"assets\/audio\/vo-lines-gu\.ogg": "[0-9a-f]{8}"/.test(versions) && /"assets\/audio\/vo-lines-gu\.mp3": "[0-9a-f]{8}"/.test(versions));
const bundle = fs.readFileSync(path.join(GAME, 'js', 'game.bundle.js'), 'utf8');
t('the bundle carries the Gujarati take (tools/build-bundle.mjs)', bundle.indexOf(JSON.stringify(VO_GU.lines['p2-1-diagonal']).replace(/,/g, ', ')) > 0 || bundle.indexOf(JSON.stringify(VO_GU.lines['p2-1-diagonal'])) > 0);
let end = 0;
lines.forEach((id, i) => {
  const [at, dur, on] = VO_GU.lines[id];
  t(id + ': a line Frozen Rush says (its English window)', new RegExp("'" + id + "':\\s*\\[").test(engine));
  t(id + ': in order and apart from the line before', i ? at >= end + 0.3 : at >= 0, [at, end]);
  end = at + dur;
  if (typeof DATA.en[id] !== 'string') return;          // the cheer, which is shown nowhere
  const ws = words(DATA.gu[id]);
  t(id + ': one onset per word shown ("' + DATA.gu[id] + '")', on.length === ws.length, [on.length, ws.length]);
  t(id + ': the onsets run forward, inside the window', on.every((s, i) => s >= 0 && s < dur && (!i || (ws[i - 1] === '—' ? s >= on[i - 1] : s > on[i - 1]))), on);
});
t('the windows end inside the take', end < 200);
const hiLines = Object.keys(vm.runInNewContext('(' + (function () {
  const s = fs.readFileSync(path.join(GAME, 'js', 'vo-hi.js'), 'utf8');
  return s.slice(s.indexOf('{', s.indexOf('export const VO_HI'))).replace(/;\s*$/, '');
}()) + ')').lines);
t('Gujarati says every Part 2 line Hindi says', hiLines.every((id) => lines.indexOf(id) >= 0), hiLines.filter((id) => lines.indexOf(id) < 0));

/* ---- WHO SPEAKS: vo.js and engine.js ---- */
const voSrc = fs.readFileSync(path.join(LESSON, 'src', 'audio', 'vo.js'), 'utf8');
function voIn(lang) {
  const asked = [];
  const g = { I18N: I18N.make(lang), location: { protocol: 'http:' }, document: { createElement: () => ({ canPlayType: () => 'probably' }) },
              fetch: (u) => { asked.push(u); return Promise.resolve({ ok: false }); }, console };
  g.window = g;
  vm.runInNewContext(voSrc, g);
  return asked;
}
t('Gujarati reads assets/vo/gu/', JSON.stringify(voIn('gu')) === '["assets/vo/gu/index.json"]', voIn('gu'));
t('engine.js swaps in the Gujarati take when the game speaks Gujarati', /import \{ VO_GU \} from '\.\/vo-gu\.js';/.test(engine) && /VO_TAKES\s*=\s*\{[^}]*\bgu:\s*VO_GU\b/.test(engine));

/* ---- THE MAP: what was generated, and who says it ---- */
const { lines: ALL, VOICES } = require('../tools/vo-gujarati.js');
const rec = JSON.parse(fs.readFileSync(path.join(LESSON, 'docs', 'vo-gujarati.json'), 'utf8'));
t('each line is generated once', new Set(ALL.map((l) => l.id)).size === ALL.length);
ALL.forEach((l) => {
  const r = rec.recordings.find((x) => x.id === l.id);
  t(l.id + ': generated for the words the game shows now (tools/make-vo-gujarati.js)', r && r.text === String(DATA.gu[l.id]).replace(/<\/?strong>/g, '').trim());
  t(l.id + ': in ' + VOICES[l.speaker].name + '\'s voice', r && r.voice_id === VOICES[l.speaker].id);
  t(l.id + ': its master is in assets/VO-GU', fs.existsSync(path.join(LESSON, l.file)));
});
t('Swiftee\'s lines are Hetalben, Frozen Rush\'s are Bhavesh Bhai', ALL.every((l) => (l.plays === 1) === (l.speaker === 'swiftee')));
const preload = fs.readFileSync(path.join(LESSON, 'src', 'core', 'preload-list.js'), 'utf8');
t('the masters are never fetched by the game (not in the preload list)', preload.indexOf('assets/VO-GU/') < 0);
const ignore = fs.readFileSync(path.join(REPO, '.vercelignore'), 'utf8');
t('the masters are not deployed', /^\/part1-swiftee-lesson\/assets\/VO-GU$/m.test(ignore));

console.log((fail ? 'FAILED' : 'ok') + '  vo-gujarati: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
