/* ═══════════════════════════════════════════
   01-config.js — Constantes, données, helpers
   ═══════════════════════════════════════════ */

const FADE   = 1.6;
const TUNE_T = 0.08;
const LS_KEY = 'fbf432_state_cosmic';

const HEX_DEG    = [0, 60, 120, 180, 240, 300];
const MASTER_IDX = 6;

const RATIO_OPTS = [
  {r:9/10,  l:'9/10'},
  {r:10/9,  l:'10/9'},
  {r:11/10, l:'11/10'},
  {r:10/11, l:'10/11'},
  {r:12/11, l:'12/11'},
  {r:11/12, l:'11/12'},
  {r:13/12, l:'13/12'},
  {r:12/13, l:'12/13'},
  {r:10/12, l:'10/12'},
  {r:12/10, l:'12/10'}
];

const PAIRS = [
  { label:'Paire 1', color:'#FF6B6B', grad:['#FF6B6B','#FF9A8B'],
    pingala:{id:'p0', ri:2, n:0.3, vol:.12}, ida:{id:'i0', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 2', color:'#FFB347', grad:['#FFB347','#FFD080'],
    pingala:{id:'p1', ri:2, n:0.6, vol:.12}, ida:{id:'i1', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 3', color:'#E8FF60', grad:['#E8FF60','#C8FF80'],
    pingala:{id:'p2', ri:2, n:1.2, vol:.12}, ida:{id:'i2', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 4', color:'#56FFB0', grad:['#56FFB0','#80FFD0'],
    pingala:{id:'p3', ri:2, n:1.8, vol:.12}, ida:{id:'i3', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 5', color:'#60D8FF', grad:['#60D8FF','#80B0FF'],
    pingala:{id:'p4', ri:2, n:2.5, vol:.12}, ida:{id:'i4', delta:1.8, polarity:1, vol:.12} },
  { label:'Paire 6', color:'#C080FF', grad:['#C080FF','#E080FF'],
    pingala:{id:'p5', ri:2, n:2.9, vol:.12}, ida:{id:'i5', delta:1.8, polarity:1, vol:.12} },
  { label:'Maître',  color:'#FFB0FF', grad:['#FFB0FF','#FF80C0'],
    pingala:{id:'p6', ri:0, n:1.0, vol:.14}, ida:{id:'i6', delta:1.8, polarity:1, vol:.14} },
];

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

// Indices des ratios triés par valeur (mode Harmonique)
const RATIO_SORTED = RATIO_OPTS.map((o,i)=>i).sort((a,b)=>RATIO_OPTS[a].r-RATIO_OPTS[b].r);

// Repliement d'octave : ramène f dans [lo,hi] sans écrêter (préserve la variété)
function foldFreq(f, lo, hi) {
  lo = lo || 36; hi = hi || 648;
  if (!(f > 0)) return lo;
  while (f > hi) f /= 2;
  while (f < lo) f *= 2;
  return f;
}
function calcPFreq(i) {
  const p = PAIRS[i].pingala;
  if (i === MASTER_IDX) return Math.max(36, Math.min(648, masterFreq));
  return foldFreq(masterFreq * RATIO_OPTS[p.ri].r * p.n);
}
// Binaural garanti : Ida = Pingala ± beat (calculé APRÈS repliement). Si hors
// bande, on inverse le signe → le battement est conservé, jamais Pingala=Ida.
function calcIFreq(i) {
  const { ida } = PAIRS[i];
  const pf = calcPFreq(i);
  let f = pf + ida.polarity * ida.delta;
  if (f > 648 || f < 36) f = pf - ida.polarity * ida.delta;
  return Math.max(36, Math.min(648, f));
}
function safeF(f)    { return Math.max(36, Math.min(648, f)); }
function fmtFreq(f)  { return f.toFixed(1) + ' Hz'; }
function fmtShort(f) { return f.toFixed(1); }

// AudioContext NATIF (Web Audio) — exposé via window.AC, partagé par 02-audio + 08-bowl-engine.
// latencyHint:'playback' = gros buffers → zéro underrun sur casques Bluetooth (anti-craquement).
let AC = null;
