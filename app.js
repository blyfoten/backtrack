'use strict';
/* Backtrack — backing track generator. All sound is synthesized with Web Audio. */

const $ = (s) => document.querySelector(s);

// ---------- Music theory ----------
const LETTERS = 'CDEFGAB';
const NAT = [0, 2, 4, 5, 7, 9, 11];          // natural pitch classes for C D E F G A B
const MAJ = NAT;                              // major scale degrees from tonic
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const KEY_MAJ = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const KEY_MIN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
const ACC = { '-2': '♭♭', '-1': '♭', '0': '', '1': '♯', '2': '♯♯' };
// semitone from tonic -> [degree, accidental], used when spelling can't be kept
const FALLBACK = [[1, 0], [2, -1], [2, 0], [3, -1], [3, 0], [4, 0], [4, 1], [5, 0], [6, -1], [6, 0], [7, -1], [7, 0]];

// iv = intervals, minor = lower-case Roman numeral, rs/ls = Roman / letter suffix, label = editor button
const QUAL = {
  maj:  { iv: [0, 4, 7],          rs: '',     ls: '',     label: 'maj' },
  m:    { iv: [0, 3, 7],          rs: '',     ls: 'm',    label: 'm', minor: true },
  '7':  { iv: [0, 4, 7, 10],      rs: '7',    ls: '7',    label: '7' },
  maj7: { iv: [0, 4, 7, 11],      rs: 'maj7', ls: 'maj7', label: 'maj7' },
  m7:   { iv: [0, 3, 7, 10],      rs: '7',    ls: 'm7',   label: 'm7', minor: true },
  '6':  { iv: [0, 4, 7, 9],       rs: '6',    ls: '6',    label: '6' },
  m6:   { iv: [0, 3, 7, 9],       rs: '6',    ls: 'm6',   label: 'm6', minor: true },
  '9':  { iv: [0, 4, 7, 10, 14],  rs: '9',    ls: '9',    label: '9' },
  m9:   { iv: [0, 3, 7, 10, 14],  rs: '9',    ls: 'm9',   label: 'm9', minor: true },
  sus2: { iv: [0, 2, 7],          rs: 'sus2', ls: 'sus2', label: 'sus2' },
  sus4: { iv: [0, 5, 7],          rs: 'sus4', ls: 'sus4', label: 'sus4' },
  '5':  { iv: [0, 7],             rs: '5',    ls: '5',    label: '5' },
  dim:  { iv: [0, 3, 6],          rs: '°',    ls: 'dim',  label: 'dim', minor: true },
  dim7: { iv: [0, 3, 6, 9],       rs: '°7',   ls: 'dim7', label: 'dim7', minor: true },
  m7b5: { iv: [0, 3, 6, 10],      rs: 'ø7',   ls: 'm7♭5', label: 'm7♭5', minor: true },
  aug:  { iv: [0, 4, 8],          rs: '+',    ls: '+',    label: 'aug' },
};

const RSUF_UP = { '': 'maj', maj: 'maj', '7': '7', maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', '6': '6', '9': '9',
  sus2: 'sus2', sus4: 'sus4', sus: 'sus4', '5': '5', '+': 'aug', aug: 'aug', o: 'dim', '°': 'dim', dim: 'dim',
  o7: 'dim7', '°7': 'dim7', dim7: 'dim7', 'ø': 'm7b5', 'ø7': 'm7b5', m7b5: 'm7b5', m: 'm', m7: 'm7', m6: 'm6', m9: 'm9' };
const RSUF_LO = { '': 'm', '7': 'm7', '6': 'm6', '9': 'm9', o: 'dim', '°': 'dim', dim: 'dim', o7: 'dim7', '°7': 'dim7',
  dim7: 'dim7', 'ø': 'm7b5', 'ø7': 'm7b5', m7b5: 'm7b5', '5': '5', sus2: 'sus2', sus4: 'sus4', sus: 'sus4' };
const LSUF = { '': 'maj', M: 'maj', maj: 'maj', m: 'm', min: 'm', '-': 'm', '7': '7', maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7',
  'Δ7': 'maj7', m7: 'm7', min7: 'm7', '-7': 'm7', '6': '6', m6: 'm6', '9': '9', m9: 'm9', sus2: 'sus2', sus4: 'sus4',
  sus: 'sus4', '5': '5', dim: 'dim', '°': 'dim', o: 'dim', dim7: 'dim7', '°7': 'dim7', o7: 'dim7', m7b5: 'm7b5',
  'ø': 'm7b5', 'ø7': 'm7b5', '+': 'aug', aug: 'aug' };

const accOf = (s) => (s === 'b' || s === '♭' ? -1 : s === '#' || s === '♯' ? 1 : 0);
const mod12 = (n) => ((n % 12) + 12) % 12;
const wrapAcc = (n) => mod12(n + 6) - 6;      // -6..5

function keyName(pc = state.key, mode = state.mode) { return (mode === 'minor' ? KEY_MIN : KEY_MAJ)[pc]; }
function tonicLetter() { return LETTERS.indexOf(keyName()[0]); }
function chordPc(ch) { return mod12(state.key + MAJ[ch.d - 1] + ch.acc); }

function parseToken(raw) {
  let tok = raw, beats = 4;
  const lm = tok.match(/^(.*?):(\d+)$/);
  if (lm) {
    tok = lm[1]; beats = +lm[2];
    if (beats < 1 || beats > 16) throw new Error(`"${raw}": length must be 1–16 beats.`);
  }
  tok = tok.replace(/♭5$/, 'b5');
  let m = tok.match(/^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (m) {
    const up = m[2] === m[2].toUpperCase();
    const q = (up ? RSUF_UP : RSUF_LO)[m[3]];
    if (!q) throw new Error(`"${raw}": unknown chord type "${m[3]}".`);
    return { d: ROMAN.indexOf(m[2].toUpperCase()) + 1, acc: accOf(m[1]), q, beats };
  }
  m = tok.match(/^([A-G])([b#♭♯]?)(.*)$/);
  if (m) {
    const q = LSUF[m[3]];
    if (!q) throw new Error(`"${raw}": unknown chord type "${m[3]}".`);
    const li = LETTERS.indexOf(m[1]);
    const pc = mod12(NAT[li] + accOf(m[2]));
    let d = mod12(li - tonicLetter() + 7) % 7 + 1;
    let acc = wrapAcc(pc - state.key - MAJ[d - 1]);
    if (Math.abs(acc) > 1) [d, acc] = FALLBACK[mod12(pc - state.key)];
    return { d, acc, q, beats };
  }
  throw new Error(`Can't read "${raw}". Try G, Em7, F♯m or I, vi7, ♭VII.`);
}
function parseProg(text) {
  const toks = text.replace(/[|,–—]/g, ' ').replace(/(^|\s)-(\s|$)/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!toks.length) throw new Error('Type at least one chord.');
  if (toks.length > 64) throw new Error('That is more than 64 chords. Try a shorter loop.');
  return toks.map(parseToken);
}

function nameParts(ch, notation = state.notation) {
  const q = QUAL[ch.q];
  if (notation === 'roman') {
    let r = ROMAN[ch.d - 1];
    if (q.minor) r = r.toLowerCase();
    return [ACC[ch.acc] + r, q.rs];
  }
  const li = (tonicLetter() + ch.d - 1) % 7;
  const a = wrapAcc(chordPc(ch) - NAT[li]);
  return [LETTERS[li] + (ACC[a] ?? ''), q.ls];
}
const nameText = (ch, n) => nameParts(ch, n).join('');
function nameHTML(ch, n) {
  const [r, s] = nameParts(ch, n);
  return esc(r) + (s ? `<sup>${esc(s)}</sup>` : '');
}
function progText(prog, n = state.notation) {
  return prog.map((c) => nameText(c, n) + (c.beats !== 4 ? ':' + c.beats : '')).join(' ');
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- Grooves ----------
// Drum lanes are 16 sixteenth-notes: X accent, x normal, g ghost.
// bass: [step, tone, lengthInSteps]; comp.hits: [step, lengthInSteps]
const STYLES = {
  pop: { name: 'Pop', swing: 0,
    drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 3], [6, 'R', 2], [8, 'R', 3], [11, '5', 1], [12, 'R', 2], [14, '8', 2]],
    comp: { sound: 'keys', hits: [[0, 6], [6, 2], [8, 6], [14, 2]] } },
  rock: { name: 'Rock', swing: 0,
    drums: { k: 'X.....x.X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, 'R', 2], [14, 'R', 2]],
    comp: { sound: 'drive', power: true, hits: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]] } },
  shuffle: { name: 'Blues shuffle', swing: 67,
    drums: { k: 'x.......x.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 2], [2, '3', 2], [4, '5', 2], [6, '6', 2], [8, 'b7', 2], [10, '6', 2], [12, '5', 2], [14, '3', 2]],
    comp: { sound: 'organ', hits: [[4, 2], [6, 1], [12, 2], [14, 1]] } },
  jazz: { name: 'Jazz swing', swing: 66,
    drums: { r: 'x...x.x.x...x.x.', h: '....x.......x...', k: 'g...g...g...g...' },
    bass: 'walk',
    comp: { sound: 'keys', hits: [[0, 3], [6, 2]], rootless: true } },
  funk: { name: 'Funk', swing: 0,
    drums: { k: 'X.....x...X..x..', s: '....X..g.g..X..g', h: 'XxxxXxxxXxxxXxxx' },
    bass: [[0, 'R', 2], [3, '8', 1], [6, 'R', 1], [7, 'b7', 1], [10, 'R', 2], [13, '5', 1], [14, '8', 1]],
    comp: { sound: 'pluck', hits: [[2, 1], [3, 1], [6, 1], [10, 1], [11, 1], [14, 1]] } },
  reggae: { name: 'Reggae one drop', swing: 58,
    drums: { k: '........X.......', c: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
    bass: [[2, 'R', 3], [6, '3', 1], [8, '5', 4], [14, '8', 2]],
    comp: { sound: 'pluck', hits: [[4, 1], [12, 1]], organ: [[6, 1], [14, 1]] } },
  bossa: { name: 'Bossa nova', swing: 0,
    drums: { k: 'x..x....x..x....', c: 'x..x..x...x..x..', h: 'gggggggggggggggg' },
    bass: [[0, 'R', 6], [6, '5', 2], [8, '5', 6], [14, 'R', 2]],
    comp: { sound: 'nylon', hits: [[0, 2], [3, 2], [6, 2], [10, 2], [13, 2]] } },
  ballad: { name: 'Ballad', swing: 0,
    drums: { k: 'x.....x.........', s: '....x.......x...', h: 'g.g.g.g.g.g.g.g.' },
    bass: [[0, 'R', 6], [6, 'R', 2], [8, '5', 8]],
    comp: { sound: 'keys', pad: true, arp: true, hits: [] } },
  country: { name: 'Country two-step', swing: 0,
    drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 4], [8, '5', 4]],
    comp: { sound: 'pluck', hits: [[4, 2], [6, 1], [12, 2], [14, 1]] } },
  dance: { name: 'Four on the floor', swing: 0,
    drums: { k: 'X...X...X...X...', s: '....x.......x...', o: '..x...x...x...x.', h: 'x...x...x...x...' },
    bass: [[2, 'R', 2], [6, 'R', 2], [10, '8', 2], [14, 'R', 2]],
    comp: { sound: 'pad', pad: true, hits: [] } },
};

// ---------- Progressions ----------
const PRESETS = [
  { g: 'Pop', name: 'Axis of Awesome', p: 'I V vi IV', style: 'pop', bpm: 100 },
  { g: 'Pop', name: 'Sensitive female', p: 'vi IV I V', style: 'pop', bpm: 92 },
  { g: 'Pop', name: '’50s doo-wop', p: 'I vi IV V', style: 'ballad', bpm: 76 },
  { g: 'Pop', name: 'Royal road', p: 'IVmaj7 V7 iii7 vi', style: 'pop', bpm: 118 },
  { g: 'Pop', name: 'Pachelbel’s canon', p: 'I V vi iii IV I IV V', style: 'ballad', bpm: 70 },
  { g: 'Rock', name: 'Mixolydian', p: 'I ♭VII IV I', style: 'rock', bpm: 124 },
  { g: 'Rock', name: 'Epic minor', p: 'i ♭VI ♭III ♭VII', style: 'rock', bpm: 112, mode: 'minor' },
  { g: 'Rock', name: 'Three-chord punk', p: 'I IV V IV', style: 'rock', bpm: 172 },
  { g: 'Rock', name: 'Andalusian cadence', p: 'i ♭VII ♭VI V', style: 'ballad', bpm: 92, mode: 'minor' },
  { g: 'Blues', name: '12-bar blues', p: 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', style: 'shuffle', bpm: 96 },
  { g: 'Blues', name: 'Quick-change 12-bar', p: 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', style: 'shuffle', bpm: 112 },
  { g: 'Blues', name: 'Minor blues', p: 'i7 i7 i7 i7 iv7 iv7 i7 i7 ♭VI7 V7 i7 V7', style: 'shuffle', bpm: 72, mode: 'minor' },
  { g: 'Jazz', name: 'ii–V–I', p: 'ii7 V7 Imaj7 Imaj7', style: 'jazz', bpm: 140 },
  { g: 'Jazz', name: 'Minor ii–V–i', p: 'iiø7 V7 i6 i6', style: 'jazz', bpm: 130, mode: 'minor' },
  { g: 'Jazz', name: 'I–vi–ii–V turnaround', p: 'Imaj7 vi7 ii7 V7', style: 'jazz', bpm: 160 },
  { g: 'Jazz', name: 'Circle of fifths', p: 'ii7 V7 Imaj7 IVmaj7 viiø7 III7 vi7 vi7', style: 'jazz', bpm: 150 },
  { g: 'Funk', name: 'Dorian vamp', p: 'i7 i7 IV7 IV7', style: 'funk', bpm: 100, mode: 'minor' },
  { g: 'Funk', name: 'Dominant 9 vamp', p: 'I9 I9 I9 IV9', style: 'funk', bpm: 108 },
  { g: 'Reggae', name: 'One drop', p: 'I IV V IV', style: 'reggae', bpm: 76 },
  { g: 'Reggae', name: 'Minor skank', p: 'i iv i ♭VII', style: 'reggae', bpm: 80, mode: 'minor' },
  { g: 'Latin', name: 'Bossa turnaround', p: 'Imaj7 Imaj7 II7 II7 ii7 ♭II7 Imaj7 ♭II7', style: 'bossa', bpm: 128 },
  { g: 'Country', name: 'Boom-chick', p: 'I I IV IV V V I I', style: 'country', bpm: 116 },
  { g: 'Soul', name: 'Gospel plagal', p: 'Imaj7 iii7 IVmaj7 iv6', style: 'ballad', bpm: 68 },
  { g: 'Dance', name: 'Minor house', p: 'i7 ♭VImaj7 ♭IIImaj7 ♭VII', style: 'dance', bpm: 122, mode: 'minor' },
];
PRESETS.forEach((p, i) => { p.id = 'p' + i; });

// ---------- State ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('backtrack.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('backtrack.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const state = {
  notation: store.get('notation', 'letters'),
  key: store.get('key', 7),
  mode: 'major',
  style: 'pop',
  bpm: 100,
  swing: 0,
  countIn: store.get('countIn', true),
  mix: store.get('mix', { drums: 80, bass: 80, chords: 70 }),
  prog: [],
  title: '',
  presetId: null,
  selected: null,
  saved: store.get('saved', []),
};

function loadPreset(p, { keepTempo = false } = {}) {
  state.mode = p.mode || 'major';
  state.prog = parseRoman(p.p);
  state.style = p.style;
  if (!keepTempo) state.bpm = p.bpm;
  state.swing = STYLES[p.style].swing;
  state.title = p.name;
  state.presetId = p.id;
  state.selected = null;
  renderAll();
}
function parseRoman(text) { return parseProg(text); } // Roman tokens never depend on the key

function markCustom() {
  if (state.presetId) { state.title = state.title + ' (edited)'; state.presetId = null; }
}

// ---------- Audio engine ----------
let ctx = null, master = null, buses = null, noiseBuf = null, driveCurve = null;

function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  driveCurve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; driveCurve[i] = Math.tanh(x * 4); }
  makeBuses();
}
function makeBuses() {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
  comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
  buses = {};
  for (const k of ['drums', 'bass', 'chords']) { buses[k] = ctx.createGain(); buses[k].connect(master); }
  applyMix();
}
function silence() {
  // Fade the current graph out and start a fresh one, which drops anything already scheduled.
  if (!master) return;
  const old = master, t = ctx.currentTime;
  old.gain.setTargetAtTime(0, t, 0.02);
  setTimeout(() => old.disconnect(), 300);
  makeBuses();
}
function applyMix() {
  if (!buses) return;
  const g = (v) => Math.pow(v / 100, 2) * 1.3;
  buses.drums.gain.value = g(state.mix.drums);
  buses.bass.gain.value = g(state.mix.bass);
  buses.chords.gain.value = g(state.mix.chords);
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function osc(type, freq, t, end, dest, detune = 0) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  o.connect(dest); o.start(t); o.stop(end); return o;
}
function gainNode(dest, v = 0) { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
function noise(t, end, dest) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(dest); s.start(t); s.stop(end); return s;
}
function filter(type, freq, dest, q = 0.7) {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(dest); return f;
}

// Drums
let openHat = null;
const DRUM = {
  k(t, v) {
    const g = gainNode(buses.drums);
    g.gain.setValueAtTime(v * 1.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    const o = osc('sine', 150, t, t + 0.45, g);
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  },
  s(t, v) {
    const g = gainNode(buses.drums);
    g.gain.setValueAtTime(v * 0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise(t, t + 0.22, filter('highpass', 1300, g));
    const g2 = gainNode(buses.drums);
    g2.gain.setValueAtTime(v * 0.4, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc('triangle', 190, t, t + 0.12, g2);
  },
  h(t, v) {
    if (openHat) { openHat.gain.cancelScheduledValues(t); openHat.gain.setTargetAtTime(0, t, 0.01); openHat = null; }
    const g = gainNode(buses.drums);
    g.gain.setValueAtTime(v * 0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    noise(t, t + 0.06, filter('highpass', 7500, g));
  },
  o(t, v) {
    const g = gainNode(buses.drums);
    g.gain.setValueAtTime(v * 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise(t, t + 0.36, filter('highpass', 7000, g));
    openHat = g;
  },
  r(t, v) {
    const g = gainNode(buses.drums);
    g.gain.setValueAtTime(v * 0.13, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    noise(t, t + 0.62, filter('bandpass', 6200, g, 0.9));
    const g2 = gainNode(buses.drums);
    g2.gain.setValueAtTime(v * 0.025, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc('square', 2400, t, t + 0.5, g2); osc('square', 3510, t, t + 0.5, g2);
  },
  c(t, v) {
    const g = gainNode(buses.drums);
    g.gain.setValueAtTime(v * 0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc('triangle', 1750, t, t + 0.06, g);
  },
};
const VEL = { X: 1, x: 0.72, g: 0.3 };

// Pitched voices: play(midi, start, duration, velocity, bus)
const VOICE = {
  bass(m, t, dur, v) {
    const end = t + dur;
    const g = gainNode(buses.bass);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.55, t + 0.006);
    g.gain.setTargetAtTime(v * 0.35, t + 0.01, 0.25); g.gain.setTargetAtTime(0, end, 0.03);
    const f = filter('lowpass', 1500, g, 1.5);
    f.frequency.setValueAtTime(1500, t); f.frequency.setTargetAtTime(420, t + 0.01, 0.08);
    osc('sawtooth', mtof(m), t, end + 0.2, f);
    osc('sine', mtof(m), t, end + 0.2, f);
  },
  keys(m, t, dur, v) {
    const end = t + dur;
    const g = gainNode(buses.chords);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.2, t + 0.008);
    g.gain.setTargetAtTime(v * 0.06, t + 0.01, 0.5); g.gain.setTargetAtTime(0, end, 0.08);
    const f = filter('lowpass', 3200, g);
    osc('sine', mtof(m), t, end + 0.5, f);
    const g2 = gainNode(f, 0.18);
    osc('triangle', mtof(m) * 2, t, end + 0.5, g2);
  },
  pad(m, t, dur, v) {
    const end = t + dur;
    const g = gainNode(buses.chords);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.075, t + Math.min(0.25, dur / 3));
    g.gain.setTargetAtTime(0, end, 0.15);
    const f = filter('lowpass', 1500, g);
    osc('sawtooth', mtof(m), t, end + 0.9, f, -8);
    osc('sawtooth', mtof(m), t, end + 0.9, f, 8);
  },
  pluck(m, t, dur, v) {
    const end = t + Math.min(dur, 0.3);
    const g = gainNode(buses.chords);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.17, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, 0.07); g.gain.setTargetAtTime(0, end, 0.02);
    const f = filter('lowpass', 3800, g, 2);
    f.frequency.setValueAtTime(3800, t); f.frequency.setTargetAtTime(700, t, 0.06);
    osc('sawtooth', mtof(m), t, end + 0.2, f);
  },
  organ(m, t, dur, v) {
    const end = t + dur;
    const g = gainNode(buses.chords);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.08, t + 0.01);
    g.gain.setTargetAtTime(0, end, 0.03);
    osc('sine', mtof(m), t, end + 0.2, g);
    osc('sine', mtof(m) * 2, t, end + 0.2, gainNode(g, 0.5));
    osc('sine', mtof(m) * 3, t, end + 0.2, gainNode(g, 0.25));
  },
  drive(m, t, dur, v) {
    const end = t + dur;
    const g = gainNode(buses.chords);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.07, t + 0.004);
    g.gain.setTargetAtTime(v * 0.05, t + 0.01, 0.1); g.gain.setTargetAtTime(0, end, 0.02);
    const f = filter('lowpass', 2600, g);
    const ws = ctx.createWaveShaper(); ws.curve = driveCurve; ws.connect(f);
    const pre = gainNode(ws, 0.6);
    osc('sawtooth', mtof(m), t, end + 0.2, pre, -6);
    osc('sawtooth', mtof(m), t, end + 0.2, pre, 6);
  },
  nylon(m, t, dur, v) {
    const end = t + dur;
    const g = gainNode(buses.chords);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.2, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, 0.35); g.gain.setTargetAtTime(0, end, 0.05);
    const f = filter('lowpass', 2200, g);
    osc('triangle', mtof(m), t, end + 0.3, f);
    osc('sine', mtof(m) * 2, t, end + 0.3, gainNode(f, 0.15));
  },
};

// Voicings
let lastVoicing = null;
function voicing(ch, { power = false, rootless = false } = {}) {
  const pc = chordPc(ch);
  if (power) { const r = 40 + mod12(pc - 4); return [r, r + 7, r + 12]; }
  let iv = QUAL[ch.q].iv;
  if (rootless && iv.length >= 4) iv = iv.slice(1);
  const notes = iv.map((i) => { let n = 48 + mod12(pc + i); while (n < 53) n += 12; while (n > 67) n -= 12; return n; });
  return [...new Set(notes)].sort((a, b) => a - b);
}
const bassBase = (pc) => 33 + mod12(pc - 9);   // A1..G#2
function bassTone(ch, tone) {
  const root = bassBase(chordPc(ch)), iv = QUAL[ch.q].iv;
  switch (tone) {
    case '3': return root + (iv.find((i) => i >= 2 && i <= 5) ?? 4);
    case '5': return root + (iv.find((i) => i >= 6 && i <= 8) ?? 7);
    case '6': return root + 9;
    case 'b7': return root + (iv.find((i) => i >= 9 && i <= 11) ?? 10);
    case '8': return root + 12;
    default: return root;
  }
}
let lastWalk = 40;
function walkNote(ch, local, nextCh) {
  const root = bassBase(chordPc(ch));
  const left = ch.beats * 4 - local;
  let target;
  if (local === 0) target = root;
  else if (left <= 4 && nextCh) target = bassBase(chordPc(nextCh)) + (Math.random() < 0.5 ? -1 : 1);
  else {
    const iv = QUAL[ch.q].iv.filter((i) => i < 12);
    const pool = [...iv, 12, 2, 5].map((i) => root + i).filter((n) => Math.abs(n - lastWalk) % 12 !== 0);
    target = pool[Math.floor(Math.random() * pool.length)] ?? root;
  }
  // choose the octave closest to the previous note, inside the bass range
  let best = target, dist = 99;
  for (const n of [target - 12, target, target + 12]) {
    if (n < 28 || n > 52) continue;
    const dd = Math.abs(n - lastWalk);
    if (dd < dist) { dist = dd; best = n; }
  }
  lastWalk = best;
  return best;
}

// ---------- Sequencer ----------
let timer = null, nextTime = 0, stepN = 0, playing = false;
const visQueue = [];

function totalSteps() { return state.prog.reduce((a, c) => a + c.beats * 4, 0); }
function chordAt(s) {
  let acc = 0;
  for (let i = 0; i < state.prog.length; i++) {
    const len = state.prog[i].beats * 4;
    if (s < acc + len) return { idx: i, start: acc };
    acc += len;
  }
  return { idx: 0, start: 0 };
}
const stepDur = () => 60 / state.bpm / 4;
function swingOffset(n) {
  const s = 0.5 + (state.swing / 100) * 0.25;       // 0..100 -> 50%..75% placement of the off-beat 8th
  const pos = [0, s / 2, s, s + (1 - s) / 2][((n % 4) + 4) % 4];
  return (pos - (((n % 4) + 4) % 4) * 0.25) * stepDur() * 4;
}

function scheduleStep(n, t) {
  if (n < 0) {
    if (n % 4 === 0) DRUM.c(t, n === -16 ? 1 : 0.75);
    visQueue.push({ t, count: (n + 16) / 4 + 1 });
    return;
  }
  const total = totalSteps();
  if (!total) return;
  const s = n % total, bs = s % 16;
  const { idx, start } = chordAt(s);
  const ch = state.prog[idx], local = s - start, sd = stepDur();
  const st = STYLES[state.style];
  const chordLeft = ch.beats * 4 - local;
  const nextCh = state.prog[(idx + 1) % state.prog.length];

  for (const [lane, pat] of Object.entries(st.drums)) {
    const c = pat[bs];
    if (c !== '.') DRUM[lane](t, VEL[c]);
  }
  if (s === 0 && state.style !== 'jazz' && state.style !== 'bossa') DRUM.o(t, 0.9);

  if (st.bass === 'walk') {
    if (bs % 4 === 0) VOICE.bass(walkNote(ch, local, nextCh), t, sd * 3.6, 0.85);
  } else {
    for (const [step, tone, len] of st.bass) {
      if (step === bs) VOICE.bass(bassTone(ch, tone), t, Math.min(len, chordLeft) * sd * 0.92, 0.85);
    }
  }

  const comp = st.comp;
  const notes = voicing(ch, comp);
  lastVoicing = notes;
  const vel = 1 / Math.sqrt(notes.length);
  if (comp.pad && local === 0) {
    notes.forEach((m) => VOICE.pad(m, t, ch.beats * 4 * sd, 1.1 * vel));
  }
  for (const [step, len] of comp.hits) {
    if (step === bs) notes.forEach((m, i) => VOICE[comp.sound](m, t + i * 0.006, Math.min(len, chordLeft) * sd * 0.85, vel * (bs % 4 === 0 ? 1 : 0.85)));
  }
  if (comp.organ) for (const [step, len] of comp.organ) {
    if (step === bs) notes.forEach((m) => VOICE.organ(m, t, len * sd * 0.8, vel * 0.7));
  }
  if (comp.arp && bs % 2 === 0) {
    const seq = [...notes, notes[0] + 12, notes[1] + 12 || notes[0] + 12];
    VOICE.keys(seq[(local / 2) % seq.length] + 12, t, sd * 3, 0.55);
  }
  visQueue.push({ t, idx, local, s, total });
}

function tick() {
  while (nextTime < ctx.currentTime + 0.12) {
    scheduleStep(stepN, nextTime + swingOffset(stepN));
    nextTime += stepDur();
    stepN++;
  }
}
function start() {
  if (!state.prog.length) return;
  initAudio();
  playing = true;
  stepN = state.countIn ? -16 : 0;
  nextTime = ctx.currentTime + 0.08;
  lastWalk = 40;
  timer = setInterval(tick, 25);
  tick();
  requestAnimationFrame(drawLoop);
  renderPlay();
}
function stop() {
  playing = false;
  clearInterval(timer); timer = null;
  visQueue.length = 0;
  silence();
  current = null;
  renderPlay(); renderNow(); renderStripProgress();
}
function toggle() { playing ? stop() : start(); }

// ---------- Visuals ----------
let current = null;   // {idx, local, s, total} or {count}
function drawLoop() {
  if (!playing) return;
  let changed = false;
  while (visQueue.length && visQueue[0].t <= ctx.currentTime) { current = visQueue.shift(); changed = true; }
  if (changed) { renderNow(); renderStripProgress(); }
  requestAnimationFrame(drawLoop);
}

function renderNow() {
  const nowEl = $('#now'), big = $('#nowChord'), alt = $('#nowAlt'), next = $('#nextChord');
  const beats = document.querySelectorAll('#beats i');
  const other = state.notation === 'roman' ? 'letters' : 'roman';
  nowEl.classList.toggle('counting', !!(current && current.count));
  if (current && current.count) {
    $('#nowLabel').textContent = 'Count-in';
    big.textContent = String(current.count);
    alt.textContent = '';
    next.innerHTML = state.prog[0] ? nameHTML(state.prog[0]) : '';
    beats.forEach((b, i) => b.classList.toggle('on', i === current.count - 1));
    $('#barCount').textContent = '';
    return;
  }
  const idx = current ? current.idx : (state.selected ?? 0);
  const ch = state.prog[idx];
  $('#nowLabel').textContent = current ? 'Now' : 'First chord';
  big.innerHTML = ch ? nameHTML(ch) : '–';
  alt.textContent = ch ? `${nameText(ch, other)} · ${keyName()} ${state.mode}` : '';
  const nx = state.prog.length ? state.prog[(idx + 1) % state.prog.length] : null;
  next.innerHTML = nx ? nameHTML(nx) : '';
  const beat = current ? Math.floor((current.s % 16) / 4) : -1;
  beats.forEach((b, i) => b.classList.toggle('on', i === beat));
  const bars = Math.ceil(totalSteps() / 16);
  $('#barCount').textContent = current ? `Bar ${Math.floor(current.s / 16) + 1} of ${bars}` : `${bars} bar${bars === 1 ? '' : 's'} per loop`;
}

function renderStripProgress() {
  document.querySelectorAll('#strip .chip[data-i]').forEach((el) => {
    const i = +el.dataset.i;
    const on = !!(current && !current.count && current.idx === i);
    el.classList.toggle('playing', on);
    const fill = el.querySelector('.fill');
    fill.style.width = on ? `${((current.local + 1) / (state.prog[i].beats * 4)) * 100}%` : '0';
  });
}

// ---------- Rendering ----------
function renderAll() {
  renderControls(); renderLibrary(); renderStrip(); renderEditor(); renderText(); renderNow();
}

function renderControls() {
  document.querySelectorAll('#notation button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === state.notation)));
  const keySel = $('#key');
  keySel.innerHTML = (state.mode === 'minor' ? KEY_MIN : KEY_MAJ).map((n, i) => `<option value="${i}">${n}</option>`).join('');
  keySel.value = state.key;
  $('#mode').value = state.mode;
  $('#style').value = state.style;
  $('#tempo').value = state.bpm; $('#tempoOut').textContent = state.bpm;
  $('#swing').value = state.swing; $('#swingOut').textContent = state.swing + '%';
  $('#countin').checked = state.countIn;
  $('#mixDrums').value = state.mix.drums; $('#mixBass').value = state.mix.bass; $('#mixChords').value = state.mix.chords;
  $('#progTitle').textContent = state.title || 'Custom progression';
  $('#progMeta').textContent = `${keyName()} ${state.mode} · ${STYLES[state.style].name} · ${state.bpm} BPM`;
}

function renderLibrary() {
  const groups = {};
  for (const p of PRESETS) (groups[p.g] ||= []).push(p);
  let html = '';
  const preview = (prog) => esc(prog.map((c) => nameText(c)).join(' '));
  html += `<section class="genre"><h3>My progressions</h3>`;
  if (state.saved.length) {
    html += '<ul>' + state.saved.map((sv, i) => {
      let prog; try { prog = parseRoman(sv.p); } catch { prog = []; }
      const cur = state.presetId === 's' + i;
      return `<li class="saved-item"><button type="button" class="preset" data-saved="${i}" aria-current="${cur}"><b>${esc(sv.name)}</b><span>${preview(prog)}</span></button><button type="button" class="x" data-del="${i}" aria-label="Delete ${esc(sv.name)}">×</button></li>`;
    }).join('') + '</ul>';
  } else {
    html += `<p class="empty">Build a progression and save it here.</p>`;
  }
  html += '</section>';
  for (const [g, list] of Object.entries(groups)) {
    html += `<section class="genre"><h3>${esc(g)}</h3><ul>` + list.map((p) => {
      const prog = parseRoman(p.p);
      return `<li><button type="button" class="preset" data-preset="${p.id}" aria-current="${state.presetId === p.id}"><b>${esc(p.name)}</b><span>${preview(prog)}</span></button></li>`;
    }).join('') + '</ul></section>';
  }
  $('#library').innerHTML = html;
}

function renderStrip() {
  const other = state.notation === 'roman' ? 'letters' : 'roman';
  $('#strip').innerHTML = state.prog.map((c, i) => `
    <button type="button" role="listitem" class="chip${state.selected === i ? ' selected' : ''}" data-i="${i}" style="--b:${c.beats}" aria-label="Chord ${i + 1}: ${esc(nameText(c))}, ${c.beats} beats. Edit">
      <span class="fill"></span>
      <span class="nm">${nameHTML(c)}</span>
      <span class="sub">${esc(nameText(c, other))}${c.beats !== 4 ? ' · ' + c.beats + ' beats' : ''}</span>
      <span class="bt">${'<i></i>'.repeat(c.beats)}</span>
    </button>`).join('') +
    `<button type="button" class="chip add" id="addChord" aria-label="Add a chord">+</button>`;
  renderStripProgress();
}

function renderEditor() {
  const ed = $('#editor');
  const ch = state.prog[state.selected];
  if (state.selected == null || !ch) { ed.hidden = true; return; }
  ed.hidden = false;
  const other = state.notation === 'roman' ? 'letters' : 'roman';
  $('#edDeg').innerHTML = ROMAN.map((r, i) => {
    const probe = { d: i + 1, acc: ch.acc, q: ch.q, beats: 4 };
    return `<button type="button" data-d="${i + 1}" aria-pressed="${ch.d === i + 1}">${esc(nameParts(probe)[0])}<small>${esc(nameParts(probe, other)[0])}</small></button>`;
  }).join('');
  $('#edAcc').innerHTML = [[-1, '♭ flat'], [0, '♮ natural'], [1, '♯ sharp']]
    .map(([a, l]) => `<button type="button" data-acc="${a}" aria-pressed="${ch.acc === a}">${l}</button>`).join('');
  $('#edQual').innerHTML = Object.entries(QUAL)
    .map(([k, q]) => `<button type="button" data-q="${k}" aria-pressed="${ch.q === k}">${esc(q.label)}</button>`).join('');
  $('#edLen').innerHTML = [[1, '1 beat'], [2, '2 beats'], [3, '3 beats'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars']]
    .map(([b, l]) => `<button type="button" data-b="${b}" aria-pressed="${ch.beats === b}">${l}</button>`).join('');
}

function renderText() {
  if (document.activeElement !== $('#progText')) $('#progText').value = progText(state.prog);
  const hint = $('#textHint');
  hint.classList.remove('err');
  hint.innerHTML = 'Letters (<code>G D Em C</code>) or Roman numerals (<code>ii7 V7 Imaj7</code>). Chords last one bar; add <code>:2</code> for two beats or <code>:8</code> for two bars.';
}

function renderPlay() {
  $('#play').setAttribute('aria-pressed', String(playing));
  $('#playLabel').textContent = playing ? 'Stop' : 'Play';
}

// ---------- Editing ----------
function edited() {
  markCustom();
  renderControls(); renderLibrary(); renderStrip(); renderEditor(); renderText(); renderNow();
}
function audition(ch) {
  if (playing) return;
  initAudio();
  const t = ctx.currentTime + 0.02;
  voicing(ch).forEach((m) => VOICE.keys(m, t, 0.9, 0.7));
  VOICE.bass(bassTone(ch, 'R'), t, 0.9, 0.6);
}

// ---------- Events ----------
$('#notation').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.notation = b.dataset.n; store.set('notation', state.notation);
  renderAll();
});
$('#play').addEventListener('click', toggle);
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea', 'button'].includes(tag)) return;
  e.preventDefault(); toggle();
});
$('#tempo').addEventListener('input', (e) => { state.bpm = +e.target.value; $('#tempoOut').textContent = state.bpm; renderControls(); });
$('#swing').addEventListener('input', (e) => { state.swing = +e.target.value; $('#swingOut').textContent = state.swing + '%'; });
$('#key').addEventListener('change', (e) => { state.key = +e.target.value; store.set('key', state.key); renderAll(); });
$('#mode').addEventListener('change', (e) => { state.mode = e.target.value; renderAll(); });
$('#style').innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
$('#style').addEventListener('change', (e) => { state.style = e.target.value; state.swing = STYLES[state.style].swing; renderControls(); });
$('#countin').addEventListener('change', (e) => { state.countIn = e.target.checked; store.set('countIn', state.countIn); });
for (const [id, k] of [['#mixDrums', 'drums'], ['#mixBass', 'bass'], ['#mixChords', 'chords']]) {
  $(id).addEventListener('input', (e) => { state.mix[k] = +e.target.value; applyMix(); store.set('mix', state.mix); });
}

$('#library').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const i = +del.dataset.del;
    state.saved.splice(i, 1); store.set('saved', state.saved);
    if (state.presetId === 's' + i) state.presetId = null;
    else if (state.presetId && state.presetId[0] === 's' && +state.presetId.slice(1) > i) state.presetId = 's' + (+state.presetId.slice(1) - 1);
    renderLibrary(); return;
  }
  const sv = e.target.closest('[data-saved]');
  if (sv) {
    const i = +sv.dataset.saved, item = state.saved[i];
    state.prog = parseRoman(item.p); state.style = item.style; state.bpm = item.bpm; state.swing = item.swing ?? STYLES[item.style].swing;
    state.mode = item.mode || 'major'; if (item.key != null) state.key = item.key;
    state.title = item.name; state.presetId = 's' + i; state.selected = null;
    renderAll(); return;
  }
  const b = e.target.closest('[data-preset]');
  if (b) loadPreset(PRESETS.find((p) => p.id === b.dataset.preset), { keepTempo: false });
});

$('#strip').addEventListener('click', (e) => {
  if (e.target.closest('#addChord')) {
    const last = state.prog[state.prog.length - 1] || { d: 1, acc: 0, q: 'maj', beats: 4 };
    state.prog.push({ ...last });
    state.selected = state.prog.length - 1;
    edited(); return;
  }
  const chip = e.target.closest('.chip[data-i]'); if (!chip) return;
  const i = +chip.dataset.i;
  state.selected = state.selected === i ? null : i;
  renderStrip(); renderEditor(); renderNow();
  if (state.selected != null) audition(state.prog[i]);
});

$('#editor').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const i = state.selected, ch = state.prog[i]; if (!ch) return;
  if (b.dataset.d) ch.d = +b.dataset.d;
  else if (b.dataset.acc) ch.acc = +b.dataset.acc;
  else if (b.dataset.q) ch.q = b.dataset.q;
  else if (b.dataset.b) ch.beats = +b.dataset.b;
  else if (b.dataset.act) {
    const a = b.dataset.act;
    if (a === 'close') { state.selected = null; renderStrip(); renderEditor(); renderNow(); return; }
    if (a === 'left' && i > 0) { [state.prog[i - 1], state.prog[i]] = [state.prog[i], state.prog[i - 1]]; state.selected = i - 1; }
    else if (a === 'right' && i < state.prog.length - 1) { [state.prog[i + 1], state.prog[i]] = [state.prog[i], state.prog[i + 1]]; state.selected = i + 1; }
    else if (a === 'dup') { state.prog.splice(i + 1, 0, { ...ch }); state.selected = i + 1; }
    else if (a === 'del') {
      if (state.prog.length === 1) return;
      state.prog.splice(i, 1); state.selected = null;
    } else return;
    edited(); return;
  } else return;
  edited();
  audition(ch);
});

$('#textForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const hint = $('#textHint');
  try {
    state.prog = parseProg($('#progText').value);
    state.selected = null;
    state.title = 'Custom progression'; state.presetId = null;
    $('#progText').blur();
    edited();
  } catch (err) {
    hint.textContent = err.message; hint.classList.add('err');
  }
});

$('#saveForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#saveName').value.trim() || state.title.replace(/ \(edited\)$/, '') || 'My progression';
  state.saved.push({ name, p: progText(state.prog, 'roman'), style: state.style, bpm: state.bpm, swing: state.swing, mode: state.mode, key: state.key });
  store.set('saved', state.saved);
  state.title = name; state.presetId = 's' + (state.saved.length - 1);
  $('#saveName').value = '';
  $('#saveHint').textContent = `Saved “${name}”. It stays in this browser.`;
  renderControls(); renderLibrary();
});

document.addEventListener('visibilitychange', () => { if (ctx && !document.hidden && ctx.state === 'suspended' && playing) ctx.resume(); });

// ---------- Boot ----------
loadPreset(PRESETS[0]);
