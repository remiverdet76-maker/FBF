/* ═══════════════════════════════════════════
   01-config.js — Constantes, données, helpers
   ═══════════════════════════════════════════ */

const FADE   = 1.6;
const TUNE_T = 0.08;
const LS_KEY = 'fbf432_state_cosmic';

// ── Bande de jeu des oscillateurs (v2) ────────────────────────────
// Ancienne base 36–864 → empilement au plafond 432. Nouvelle base 54–396 :
// les oscillateurs respirent sous le maître, qui garde son accès au 432.
const F_MIN   = 54;
const F_MAX   = 566;        // plafond du jeu aléatoire (bande haute 288–566)
const N_MAX   = 8.0;        // n libre : sert à placer le carrier dans sa bande
const F_SEUIL = 360;        // (conservé pour info — protection auto désactivée v2.x)

// Bandes fréquentielles attitrées (boue sub évitée par répartition)
const FBF_BANDS = [[54, 144], [144, 288], [288, 566]];
const PAIR_BAND = [0, 0, 1, 1, 2, 2];   // paires 0-5 → bande (master = source)

const HEX_DEG    = [0, 60, 120, 180, 240, 300];
const MASTER_IDX = 6;

const RATIO_OPTS = [
  {r:10/11, l:'10/11'}, {r:11/10, l:'11/10'},
  {r:11/12, l:'11/12'}, {r:12/11, l:'12/11'},
  {r:10/12, l:'10/12'}, {r:12/10, l:'12/10'},
  {r:12/13, l:'12/13'}, {r:13/12, l:'13/12'},
  {r:11/13, l:'11/13'}, {r:13/11, l:'13/11'},
  {r:10/13, l:'10/13'}, {r:13/10, l:'13/10'},
  {r: 9/10, l: '9/10'}, {r:10/ 9, l:'10/9'},
  {r: 9/11, l: '9/11'}, {r:11/ 9, l:'11/9'},
  {r: 9/12, l: '9/12'}, {r:12/ 9, l:'12/9'},
  {r: 9/13, l: '9/13'}, {r:13/ 9, l:'13/9'},
];

const PAIRS = [
  { label:'Paire 1', color:'#FF6B6B', grad:['#FF6B6B','#FF9A8B'],
    pingala:{id:'p0', ri:2, n:0.30, vol:.12}, ida:{id:'i0', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 2', color:'#FFB347', grad:['#FFB347','#FFD080'],
    pingala:{id:'p1', ri:2, n:0.50, vol:.12}, ida:{id:'i1', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 3', color:'#E8FF60', grad:['#E8FF60','#C8FF80'],
    pingala:{id:'p2', ri:2, n:0.70, vol:.12}, ida:{id:'i2', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 4', color:'#56FFB0', grad:['#56FFB0','#80FFD0'],
    pingala:{id:'p3', ri:2, n:0.85, vol:.12}, ida:{id:'i3', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 5', color:'#60D8FF', grad:['#60D8FF','#80B0FF'],
    pingala:{id:'p4', ri:13, n:0.90, vol:.12}, ida:{id:'i4', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 6', color:'#C080FF', grad:['#C080FF','#E080FF'],
    pingala:{id:'p5', ri:2, n:0.40, vol:.12}, ida:{id:'i5', delta:1.8, polarity:1, vol:.12} },
  { label:'Maître',  color:'#FFB0FF', grad:['#FFB0FF','#FF80C0'],
    pingala:{id:'p6', ri:0, n:1.0, vol:.14}, ida:{id:'i6', delta:1.8, polarity:1, vol:.14} },
];

// Panoramique stéréo — éventail : chaque paire a un CENTRE distinct (gauche→droite),
// Pingala/Ida légèrement écartés autour de ce centre (battement binaural aéré).
// Modulé par RAND_OPTS.spread (largeur de l'éventail) au moment du random.
const PAN_CENTERS = [-0.78, -0.50, -0.20, 0.20, 0.50, 0.78, 0.0]; // 6 paires + maître
const PAN_SPREAD  = 0.10; // écart Pingala/Ida autour du centre
function buildOscPan(width) {
  const w = (typeof width === 'number') ? Math.max(0, Math.min(1, width)) : 0.7;
  return PAN_CENTERS.map((ctr, i) => {
    const c = i === MASTER_IDX ? 0 : ctr * w;
    const sp = i === MASTER_IDX ? PAN_SPREAD * 0.5 : PAN_SPREAD;
    return [Math.max(-1, c - sp), Math.min(1, c + sp)];
  });
}
let OSC_PAN = buildOscPan(0.7);

// Courbe isosonique : graves plus forts, aigus plus doux
function isosonicVol(freq, base) {
  const f = Math.max(F_MIN, Math.min(F_MAX, freq));
  const k = 1 + 0.48 * (1 - Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN));
  return base * Math.max(0.5, Math.min(1.5, k));  // dynamique grave rendue (mais maîtrisée)
}

let mutedOscs = {};
PAIRS.forEach(p => {
  mutedOscs[p.pingala.id] = false;
  mutedOscs[p.ida.id]     = false;
});

let masterFreq  = 252;
let globalDelta = 1.8;
let masterVol   = 0.8;

function waveState(hz) {
  const a = Math.abs(hz);
  if (a < 0.5) return {s:'—',     c:'rgba(200,200,255,.4)'};
  if (a <= 4)  return {s:'Delta', c:'#C890FF'};
  if (a <= 8)  return {s:'Thêta', c:'#F5D460'};
  if (a <= 13) return {s:'Alpha', c:'#56FFB0'};
  if (a <= 30) return {s:'Bêta',  c:'#60D8FF'};
  return              {s:'Gamma', c:'#FF9A8B'};
}

function calcPFreq(i) {
  const p = PAIRS[i].pingala;
  if (i === MASTER_IDX) return Math.min(432, masterFreq);
  return Math.max(F_MIN, Math.min(F_MAX, masterFreq * RATIO_OPTS[p.ri].r * Math.min(N_MAX, p.n)));
}
function calcIFreq(i) {
  const { ida } = PAIRS[i];
  const hi = i === MASTER_IDX ? 432 : F_MAX;
  return Math.max(F_MIN, Math.min(hi, calcPFreq(i) + ida.polarity * ida.delta));
}
function safeF(f)    { return Math.max(32, Math.min(460, f)); }

// Au-dessus du seuil : protection auto (vol −50% + spatialisation imposée)
function isAboveSeuil(i) { return calcPFreq(i) > F_SEUIL && i !== MASTER_IDX; }

const HARMONIC_RATIOS = [1, 9/8, 5/4, 4/3, 3/2, 5/3, 16/9, 2];
function harmonicRandomInit() {
  const root  = 36 + Math.random() * 72;
  const ratio = HARMONIC_RATIOS[Math.floor(Math.random() * HARMONIC_RATIOS.length)];
  masterFreq  = Math.min(432, Math.max(36, Math.round(root * ratio)));
}
function fmtFreq(f)  { return f.toFixed(1) + ' Hz'; }
function fmtShort(f) { return f.toFixed(1); }

// Couleur organique selon la fréquence : grave = violet/indigo → aigu = ambre/or
function freqHue(f) {
  const n = Math.max(0, Math.min(1, (Math.max(54, Math.min(432, f)) - 54) / (432 - 54)));
  return Math.round(262 - n * 222);  // 54Hz→262 (violet) … 432Hz→40 (ambre)
}
function freqColor(f, l)  { return `hsl(${freqHue(f)},72%,${l != null ? l : 60}%)`; }
function freqColorA(f, l, a) { return `hsla(${freqHue(f)},72%,${l != null ? l : 60}%,${a})`; }

// AudioContext natif — exposé via window.AC (partagé par 08-bowl-engine)
let AC = null;
