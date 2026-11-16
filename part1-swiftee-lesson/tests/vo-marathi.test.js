// vo-marathi.test.js — the Marathi voice (?lan=mr) says the line on the screen, in step with its words.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LESSON = path.join(__dirname, '..');
const REPO = path.join(LESSON, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'polygon-locales.json'), 'utf8'));
const MR_DIR = path.join(LESSON, 'assets', 'vo', 'mr');

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
};

global.window = global;
global.POLYGON_LOCALES = DATA;
const I18N = require('../src/core/i18n.js');
const MR = I18N.make('mr');
const words = (s) => String(s).replace(/<\/?strong>/g, '').trim().split(/\s+/).filter(Boolean);
const shown = (id) => MR.tr(String(DATA.en[id]).replace(/<\/?strong>/g, ''));
t('Marathi is a voiced language', MR.on && MR.voice === true);

/* ---- PART 1 ---- */
const idx = JSON.parse(fs.readFileSync(path.join(MR_DIR, 'index.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(LESSON, 'assets', 'vo', 'index.json'), 'utf8'));
t('Part 1 has its Marathi clips', idx.clips.length >= 80, idx.clips.length);
const offDisk = fs.readFileSync(path.join(MR_DIR, 'index.js'), 'utf8');
t('the Marathi index is also a script, for a page opened off the disk', offDisk.indexOf(JSON.stringify(idx.clips)) > 0);
idx.clips.forEach((id) => {
  t(id + ': a line the game asks for', en.clips.indexOf(id) >= 0);
  t(id + ': ogg and its mp3 twin', fs.existsSync(path.join(MR_DIR, id + '.ogg')) && fs.existsSync(path.join(MR_DIR, id + '.mp3')));
  t(id + ': measured', idx.seconds[id] > 0.4 && !!idx.rev[id], [idx.seconds[id], idx.rev[id]]);
  const text = shown(id), on = idx.words[id] || [];
  t(id + ': the screen shows Marathi', text !== DATA.en[id] && /[ऀ-ॿ]/.test(text), text);
  t(id + ': one onset per word shown ("' + text + '")', on.length === words(text).length, [on.length, words(text).length]);
  t(id + ': the onsets run forward, inside the clip', on.every((ms, i) => ms >= 0 && (!i || ms >= on[i - 1]) && ms < idx.seconds[id] * 1000), on);
  t(id + ': the first word is said at once (no long silence before it)', on[0] <= 400, on[0]);
  if (idx.spoken[id]) t(id + ': the last word starts before the speech ends', on[on.length - 1] < idx.spoken[id], [on[on.length - 1], idx.spoken[id]]);
});
const unvoiced = en.clips.filter((id) => typeof DATA.en[id] === 'string' && typeof DATA.mr[id] === 'string' && idx.clips.indexOf(id) < 0);
t('every line the lesson says has its Marathi clip (docs/VO-MARATHI.md)', unvoiced.length === 0, unvoiced);
['sw1', 'sw2', 'sw3'].forEach((id) => t(id + ' (over the game) is a Part 1 clip', idx.clips.indexOf(id) >= 0));

/* ---- PART 2 ---- */
const GAME = path.join(REPO, 'part2-frozen-rush', 'game');
const mod = fs.readFileSync(path.join(GAME, 'js', 'vo-mr.js'), 'utf8');
const VO_MR = vm.runInNewContext('(' + mod.slice(mod.indexOf('{', mod.indexOf('export const VO_MR'))).replace(/;\s*$/, '') + ')');
const engine = fs.readFileSync(path.join(GAME, 'js', 'engine.js'), 'utf8');
const lines = Object.keys(VO_MR.lines);
t('Part 2 plays the Marathi take', VO_MR.src === 'assets/audio/vo-lines-mr.ogg' && fs.existsSync(path.join(GAME, VO_MR.src)));
t('the Marathi take has its mp3 twin', fs.existsSync(path.join(GAME, 'assets', 'audio', 'vo-lines-mr.mp3')));
t('Part 2 has its Marathi lines', lines.length >= 23, lines.length);
const versions = fs.readFileSync(path.join(GAME, 'js', 'asset-versions.js'), 'utf8');
t('the Marathi take is versioned (tools/build-bundle.mjs)', /"assets\/audio\/vo-lines-mr\.ogg": "[0-9a-f]{8}"/.test(versions) && /"assets\/audio\/vo-lines-mr\.mp3": "[0-9a-f]{8}"/.test(versions));
const bundle = fs.readFileSync(path.join(GAME, 'js', 'game.bundle.js'), 'utf8');
t('the bundle carries the Marathi take (tools/build-bundle.mjs)', bundle.indexOf(JSON.stringify(VO_MR.lines['p2-1-diagonal']).replace(/,/g, ', ')) > 0 || bundle.indexOf(JSON.stringify(VO_MR.lines['p2-1-diagonal'])) > 0);
let end = 0;
lines.forEach((id, i) => {
  const [at, dur, on] = VO_MR.lines[id];
  t(id + ': a line Frozen Rush says (its English window)', new RegExp("'" + id + "':\\s*\\[").test(engine));
  t(id + ': in order and apart from the line before', i ? at >= end + 0.3 : at >= 0, [at, end]);
  end = at + dur;
  if (typeof DATA.en[id] !== 'string') return;          // the cheer, which is shown nowhere
  const ws = words(DATA.mr[id]);
  t(id + ': one onset per word shown ("' + DATA.mr[id] + '")', on.length === ws.length, [on.length, ws.length]);
  t(id + ': the onsets run forward, inside the window', on.every((s, i) => s >= 0 && s < dur && (!i || (ws[i - 1] === '—' ? s >= on[i - 1] : s > on[i - 1]))), on);
});
t('the windows end inside the take', end < 200);
const hiLines = Object.keys(vm.runInNewContext('(' + (function () {
  const s = fs.readFileSync(path.join(GAME, 'js', 'vo-hi.js'), 'utf8');
  return s.slice(s.indexOf('{', s.indexOf('export const VO_HI'))).replace(/;\s*$/, '');
}()) + ')').lines);
t('Marathi says every Part 2 line Hindi says', hiLines.every((id) => lines.indexOf(id) >= 0), hiLines.filter((id) => lines.indexOf(id) < 0));

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
t('Marathi reads assets/vo/mr/', JSON.stringify(voIn('mr')) === '["assets/vo/mr/index.json"]', voIn('mr'));
t('engine.js swaps in the Marathi take when the game speaks Marathi', /import \{ VO_MR \} from '\.\/vo-mr\.js';/.test(engine) && /VO_TAKES\s*=\s*\{[^}]*\bmr:\s*VO_MR\b/.test(engine));

/* ---- THE MAP: what was generated, and who says it ---- */
const { lines: ALL, VOICES } = require('../tools/vo-marathi.js');
const rec = JSON.parse(fs.readFileSync(path.join(LESSON, 'docs', 'vo-marathi.json'), 'utf8'));
t('each line is generated once', new Set(ALL.map((l) => l.id)).size === ALL.length);
ALL.forEach((l) => {
  const r = rec.recordings.find((x) => x.id === l.id);
  t(l.id + ': generated for the words the game shows now (tools/make-vo-marathi.js)', r && r.text === String(DATA.mr[l.id]).replace(/<\/?strong>/g, '').trim());
  t(l.id + ': in ' + VOICES[l.speaker].name + '\'s voice', r && r.voice_id === VOICES[l.speaker].id);
  t(l.id + ': its master is in assets/VO-MR', fs.existsSync(path.join(LESSON, l.file)));
});
t('Swiftee\'s lines are Sayali, Frozen Rush\'s are Vardaan', ALL.every((l) => (l.plays === 1) === (l.speaker === 'swiftee')));
const preload = fs.readFileSync(path.join(LESSON, 'src', 'core', 'preload-list.js'), 'utf8');
t('the masters are never fetched by the game (not in the preload list)', preload.indexOf('assets/VO-MR/') < 0);
const ignore = fs.readFileSync(path.join(REPO, '.vercelignore'), 'utf8');
t('the masters are not deployed', /^\/part1-swiftee-lesson\/assets\/VO-MR$/m.test(ignore));

console.log((fail ? 'FAILED' : 'ok') + '  vo-marathi: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
