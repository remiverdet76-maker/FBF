/* ═══════════════════════════════════════════
   02-audio.js — Moteur audio NATIF (Web Audio API)
   Migration Tone.js → natif (anti-craquement APK / Bluetooth).
   API publique inchangée : buildOsc, tuneOsc, releaseOsc, swap*,
   initFXChain, setReverbSpace, lfoToggle/Set, filtLfo*, fxLfo*,
   startFlow, stopFlow, masterTick…
   ═══════════════════════════════════════════ */

/* ---------- 2.0 · HORLOGE AUDIO CENTRALE ---------- */
function audioCtx() {
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext;
    AC = new C({ latencyHint: 'playback' });
    window.AC = AC;
  }
  return AC;
}
const aNow = () => audioCtx().currentTime;

const swapTimers = {};
let nodes = {}, masterGain = null, analyser = null;

let limiter = null;
let eqLow = null, eqMid = null, eqHigh = null;
let masterDelay = null, masterDelayFb = null;
let masterReverb = null, reverbWetGain = null, reverbDryGain = null;
let pingPongDelay = null, ppL = null, ppR = null, ppFb = null, ppWet = null;
let compressor = null;
let busTrim = null, mEqLow = null, mEqMid = null, mEqHigh = null, masterGlue = null, masterFader = null;
let _fxInput = null;
let _fxRefs = {};
// Filtre de bus (lowpass) + LFO filtre (timbre) + LFO FX (intensité) — features 19h43.
let _busLP = null;
let _filtLFO = null, _filtLFODepth = null;
let _fxLFO = null, _fxLFODepth = null;
const LFO_STATE = {on:false, rate:.27, depth:.27};
// Anti-crack (∝ 1/√voix actives) : empêche la sommation des oscillateurs de
// saturer le limiteur → 0 craquement + dynamique préservée (recette Omcha396).
// Grille 432 : plancher 0.18 (= 18/100, 18=2×9) → plus de headroom.
let _antiCrackTarget = 1;
function _applyAntiCrack() {
  const active = Object.keys(nodes).length || 1;
  _antiCrackTarget = Math.max(0.18, 1 / Math.sqrt(active));
}
let _lfoNode = null, _lfoGain = null, _lfoDepthGain = null;
let _btKeepalive = null;               // oscillateur silencieux — maintient le stream A2DP actif
let _fadeDur = 2;
let metaAngle = 0, masterRAF = null;
let _waveBuf = null;

// Constantes LFO filtre/FX (équivalent natif des Tone.LFO d'origine)
const _FILT_LFO_MIN = 108,  _FILT_LFO_MAX = 1800;    // grille 432 : 108=12×9, 1800=200×9 (audible sur sinus ≤648 Hz)
const _FILT_LFO_OPEN = 18000;                         // coupure repos (filtre ouvert)
const _FX_LFO_MIN = 0,      _FX_LFO_MAX = 0.5;        // wet du delay

/* ---------- 2.1 · OSCILLATEURS (persistants, retune lisse) ---------- */
// ── Bande aiguë 432–648 Hz : HPF (~420) + volume −25 % (comme Omcha396) ──
function applyHiBand(node, freq) {
  if (!node) return;
  const hi = freq > 432, now = aNow();
  try {
    if (node.hpf)  node.hpf.frequency.setTargetAtTime(hi ? 420 : 20, now, 0.05);
    if (node.trim) node.trim.gain.setTargetAtTime(hi ? 0.75 : 1.0, now, 0.08);
  } catch(e) {}
}

function buildOsc(id, freq, vol, pan) {
  const c = audioCtx();
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = safeF(freq);
  const p = c.createStereoPanner(); p.pan.value = pan;
  const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 20; hpf.Q.value = 0.707;
  const trim = c.createGain(); trim.gain.value = 1;
  const g = c.createGain(); g.gain.value = 0;
  // o → pan → HPF → trim(−25% si aigu) → gain → master
  o.connect(p); p.connect(hpf); hpf.connect(trim); trim.connect(g); g.connect(masterGain);
  o.start();
  const node = { o, g, p, hpf, trim };
  applyHiBand(node, safeF(freq));
  if (!mutedOscs[id] && vol > 0) {
    const now = c.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0, now);
    g.gain.setTargetAtTime(vol, now, FADE / 5);
  }
  return node;
}

function tuneOsc(id, freq) {
  const node = nodes[id]; if (!node) return;
  try {
    const f = safeF(freq), now = aNow();
    node.o.frequency.cancelScheduledValues(now);
    node.o.frequency.setValueAtTime(node.o.frequency.value, now);
    node.o.frequency.exponentialRampToValueAtTime(Math.max(1, f), now + TUNE_T);
    applyHiBand(node, f);
  } catch(e) {}
}

function releaseOsc(node) {
  try {
    const now = aNow();
    node.g.gain.cancelScheduledValues(now);
    node.g.gain.setValueAtTime(node.g.gain.value, now);
    node.g.gain.setTargetAtTime(0, now, FADE / 5);
    node.o.stop(now + FADE + 0.1);
  } catch(e) {}
  setTimeout(() => {
    ['o','g','p','hpf','trim'].forEach(k => { try { node[k]?.disconnect?.(); } catch(e){} });
  }, (FADE + 0.4) * 1000);
}

// Oscillateurs PERSISTANTS : on ne détruit/recrée jamais en plein jeu.
// 1re fois → on construit ; ensuite → retune lisse (zéro clic, zéro GC).
function swapPingala(i) {
  if (!flowing || !masterGain) return;
  const { pingala } = PAIRS[i];
  if (nodes[pingala.id]) {
    tuneOsc(pingala.id, calcPFreq(i));
  } else {
    nodes[pingala.id] = buildOsc(pingala.id, calcPFreq(i), pingala.vol, -1);
  }
  setTimeout(() => { if (flowing && masterGain) swapIda(i); }, 40);
  _applyAntiCrack();
  updatePairUI(i);
}
function swapIda(i) {
  if (!flowing || !masterGain) return;
  const { ida } = PAIRS[i];
  if (nodes[ida.id]) {
    tuneOsc(ida.id, calcIFreq(i));
  } else {
    nodes[ida.id] = buildOsc(ida.id, calcIFreq(i), ida.vol, 1);
  }
  _applyAntiCrack();
  updatePairUI(i);
}
function swapPDebounced(i) { clearTimeout(swapTimers['p'+i]); swapTimers['p'+i] = setTimeout(() => swapPingala(i), 380); }
function swapIDebounced(i) { clearTimeout(swapTimers['i'+i]); swapTimers['i'+i] = setTimeout(() => swapIda(i), 380); }

function safeRamp(gainParam, target, duration) {
  const now = aNow();
  gainParam.cancelScheduledValues(now);
  gainParam.setValueAtTime(gainParam.value, now);
  gainParam.setTargetAtTime(target, now, Math.max(0.01, duration / 5));
}

/* ---------- 2.3 · IR DE RÉVERBE GÉNÉRÉE PAR CODE ---------- */
function _makeIR(decay, preDelay) {
  const c = audioCtx(), sr = c.sampleRate;
  const len = Math.max(1, Math.floor(sr * (preDelay + decay)));
  const pd  = Math.floor(sr * preDelay);
  const ir  = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      if (i < pd) { d[i] = 0; continue; }
      const t = (i - pd) / (sr * decay);
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.4);
    }
  }
  return ir;
}

/* ---------- 2.4 · FX CHAIN NATIVE (créée une seule fois) ---------- */
function initFXChain() {
  if (eqLow) return;
  const c = audioCtx();

  eqLow  = c.createBiquadFilter(); eqLow.type='lowshelf';  eqLow.frequency.value=200;  eqLow.gain.value=0;
  eqMid  = c.createBiquadFilter(); eqMid.type='peaking';   eqMid.frequency.value=1000; eqMid.Q.value=1; eqMid.gain.value=0;
  eqHigh = c.createBiquadFilter(); eqHigh.type='highshelf';eqHigh.frequency.value=5000; eqHigh.gain.value=0;

  // Filtre de bus (lowpass) — repos grand ouvert (18 kHz), piloté par le LFO filtre.
  _busLP = c.createBiquadFilter(); _busLP.type='lowpass'; _busLP.frequency.value=_FILT_LFO_OPEN; _busLP.Q.value=0.6;

  compressor = c.createDynamicsCompressor();
  // Grille 432 : seuil −27 (3×9), ratio 9, attaque 0.009, release 0.27.
  compressor.threshold.value=-27; compressor.ratio.value=9; compressor.attack.value=0.009; compressor.release.value=0.27;

  masterDelay   = c.createDelay(1.0); masterDelay.delayTime.value=0.3;
  masterDelayFb = c.createGain(); masterDelayFb.gain.value=0.3;
  masterDelay.connect(masterDelayFb); masterDelayFb.connect(masterDelay);
  const delayWet = c.createGain(); delayWet.gain.value=0; masterDelay.connect(delayWet);

  masterReverb = c.createConvolver();
  masterReverb.buffer = _makeIR(1.5, 0.05);
  reverbWetGain = c.createGain(); reverbWetGain.gain.value=0;
  reverbDryGain = c.createGain(); reverbDryGain.gain.value=1;

  ppL = c.createDelay(1.0); ppL.delayTime.value=0.25;
  ppR = c.createDelay(1.0); ppR.delayTime.value=0.25;
  ppFb = c.createGain(); ppFb.gain.value=0.3;
  ppL.connect(ppR); ppR.connect(ppFb); ppFb.connect(ppL);
  const splitMerge = c.createChannelMerger(2);
  ppL.connect(splitMerge, 0, 0); ppR.connect(splitMerge, 0, 1);
  ppWet = c.createGain(); ppWet.gain.value=0; splitMerge.connect(ppWet);
  pingPongDelay = { delayTime: ppL.delayTime, _fb: ppFb, _wet: ppWet };

  busTrim = c.createGain(); busTrim.gain.value = 1;

  mEqLow  = c.createBiquadFilter(); mEqLow.type='lowshelf';  mEqLow.frequency.value=54;   mEqLow.gain.value=0;
  mEqMid  = c.createBiquadFilter(); mEqMid.type='peaking';   mEqMid.frequency.value=216;  mEqMid.Q.value=0.9; mEqMid.gain.value=0;
  mEqHigh = c.createBiquadFilter(); mEqHigh.type='highshelf';mEqHigh.frequency.value=432; mEqHigh.gain.value=0;

  masterGlue = c.createDynamicsCompressor();
  // Grille 432 : seuil −18 (2×9), knee 9, attaque 0.009, release 0.27.
  masterGlue.threshold.value=-18; masterGlue.knee.value=9; masterGlue.ratio.value=2;
  masterGlue.attack.value=0.009; masterGlue.release.value=0.27;

  masterFader = c.createGain(); masterFader.gain.value = 1;

  limiter = c.createDynamicsCompressor();
  // Grille 432 : seuil −1.8 (18), ratio 18 (2×9), attaque douce 0.009, release 0.18.
  limiter.threshold.value=-1.8; limiter.knee.value=0; limiter.ratio.value=18;
  limiter.attack.value=0.009; limiter.release.value=0.18;

  // Bus master : busTrim → mEQ → glue → fader → limiter → sortie
  busTrim.connect(mEqLow); mEqLow.connect(mEqMid); mEqMid.connect(mEqHigh);
  mEqHigh.connect(masterGlue); masterGlue.connect(masterFader);
  masterFader.connect(limiter); limiter.connect(c.destination);

  // Chaîne : eqLow → eqMid → eqHigh → _busLP → compressor → (dry + FX parallèles) → busTrim
  eqLow.connect(eqMid); eqMid.connect(eqHigh);
  eqHigh.connect(_busLP); _busLP.connect(compressor);
  compressor.connect(busTrim);                       // dry direct
  compressor.connect(masterDelay);   delayWet.connect(busTrim);
  compressor.connect(reverbDryGain); reverbDryGain.connect(busTrim);
  compressor.connect(ppL);           ppWet.connect(busTrim);
  reverbWetGain.connect(masterReverb); masterReverb.connect(busTrim);

  // ── LFO filtre (timbre) : oscillateur natif → depth → _busLP.frequency ──
  _filtLFO = c.createOscillator(); _filtLFO.type='sine'; _filtLFO.frequency.value=0.1;
  _filtLFODepth = c.createGain(); _filtLFODepth.gain.value=(_FILT_LFO_MAX-_FILT_LFO_MIN)/2;
  _filtLFO.connect(_filtLFODepth);   // branché sur _busLP.frequency au toggle
  _filtLFO.start();

  // ── LFO FX (intensité) : oscillateur natif → depth → delayWet.gain ──
  _fxLFO = c.createOscillator(); _fxLFO.type='sine'; _fxLFO.frequency.value=0.12;
  _fxLFODepth = c.createGain(); _fxLFODepth.gain.value=(_FX_LFO_MAX-_FX_LFO_MIN)/2;
  _fxLFO.connect(_fxLFODepth);       // branché sur delayWet.gain au toggle
  _fxLFO.start();

  _fxInput = eqLow;
  _fxRefs = { delayWet };
}

/* ---------- 2.5 · REVERB ON/OFF (anti-CPU BT : convolution branchée si wet>0) ---------- */
let _reverbActive = false;
function _setReverbActive(on) {
  if (!compressor || !reverbWetGain || on === _reverbActive) return;
  try {
    if (on) compressor.connect(reverbWetGain);
    else    compressor.disconnect(reverbWetGain);
    _reverbActive = on;
  } catch(e) {}
}

const REVERB_SPACES = {
  sec:        { decay: 0.4,  preDelay: 0.01 },
  grotte:     { decay: 2.8,  preDelay: 0.08 },
  cathedrale: { decay: 5.5,  preDelay: 0.15 },
  cosmos:     { decay: 14.0, preDelay: 0.40 }
};
async function setReverbSpace(name) {
  const s = REVERB_SPACES[name]; if (!s || !masterReverb) return;
  masterReverb.buffer = _makeIR(s.decay, s.preDelay);
  const sl = document.getElementById('reverbWet');
  if (sl && parseFloat(sl.value) < 0.05) { sl.value = 0.32; updateFX('reverbWet', 0.32); }
}

function setFadeDur(v) {
  _fadeDur = Math.max(0.5, Math.min(15, parseFloat(v)));
  const el = document.getElementById('sv-fade'); if (el) el.textContent = _fadeDur.toFixed(1) + 's';
}

/* ---------- 2.6 · LFO VOLUME (natif, dans l'audio thread) ---------- */
function lfoToggle(on) {
  LFO_STATE.on = on;
  if (!_lfoNode || !_lfoDepthGain || !_lfoGain) return;
  if (on) _lfoDepthGain.gain.setTargetAtTime(LFO_STATE.depth, aNow(), 0.1);
  else    _lfoDepthGain.gain.setTargetAtTime(0, aNow(), 0.1);
}
function lfoSet(param, v) {
  LFO_STATE[param] = parseFloat(v);
  if (_lfoNode) {
    if (param === 'rate')  _lfoNode.frequency.setTargetAtTime(LFO_STATE.rate, aNow(), 0.05);
    if (param === 'depth' && LFO_STATE.on) _lfoDepthGain.gain.setTargetAtTime(LFO_STATE.depth, aNow(), 0.05);
  }
  const el = document.getElementById('sv-lfo-' + param); if (el) el.textContent = parseFloat(v).toFixed(2);
}

/* ---------- 2.6b · LFO FILTRE (timbre) & LFO FX (intensité) ---------- */
function filtLfoToggle(on) {
  if (!_busLP || !_filtLFODepth) return;
  if (on) {
    // recentre la coupure puis branche l'oscillation 500 ↔ 16 000 Hz
    _busLP.frequency.setTargetAtTime((_FILT_LFO_MIN+_FILT_LFO_MAX)/2, aNow(), 0.1);
    try { _filtLFODepth.connect(_busLP.frequency); } catch(e) {}
  } else {
    try { _filtLFODepth.disconnect(); } catch(e) {}
    _busLP.frequency.setTargetAtTime(_FILT_LFO_OPEN, aNow(), 0.2);   // filtre ré-ouvert
  }
}
function filtLfoRate(v) { if (_filtLFO) try { _filtLFO.frequency.setTargetAtTime(parseFloat(v), aNow(), 0.05); } catch(e) {} }

function fxLfoToggle(on) {
  if (!_fxLFODepth || !_fxRefs.delayWet) return;
  if (on) {
    _fxRefs.delayWet.gain.setTargetAtTime((_FX_LFO_MIN+_FX_LFO_MAX)/2, aNow(), 0.1);
    try { _fxLFODepth.connect(_fxRefs.delayWet.gain); } catch(e) {}
  } else {
    try { _fxLFODepth.disconnect(); } catch(e) {}
    // revient à la valeur du curseur Delay (ou 0)
    const sl = document.getElementById('delayWet');
    const target = sl ? parseFloat(sl.value) : 0;
    _fxRefs.delayWet.gain.setTargetAtTime(target, aNow(), 0.2);
  }
}
function fxLfoRate(v) { if (_fxLFO) try { _fxLFO.frequency.setTargetAtTime(parseFloat(v), aNow(), 0.05); } catch(e) {} }

function _startBTKeepalive() {
  if (_btKeepalive) return;
  try {
    const c = audioCtx();
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(c.destination);
    src.start();
    _btKeepalive = src;
  } catch(e) {}
}

function setChorusDepth(v) { /* no-op : chorus supprimé (ScriptProcessor = craquements BT) */ }
function setChorusRate(v)  { /* no-op */ }
function setCompThresh(v)  { if (compressor) try { compressor.threshold.value = parseFloat(v); } catch(e) {} }
function setCompRatio(v)   { if (compressor) try { compressor.ratio.value = parseFloat(v); } catch(e) {} }

function playBell() {
  try {
    const c = audioCtx();
    if (c.state !== 'running') return;
    const o = c.createOscillator(); o.type='sine'; o.frequency.value=432;
    const g = c.createGain();
    const now = c.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.001);
    g.gain.setTargetAtTime(0.05, now + 0.001, 1);
    g.gain.setTargetAtTime(0, now + 0.3, 1.3);
    o.connect(g); g.connect(limiter || c.destination);
    o.start(now); o.stop(now + 8);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch(e){} };
  } catch(e) {}
}

// ── Start / Stop ──────────────────────────────────────────────
let flowing = false;

async function startFlow() {
  ui('idle', '✦ Éveil du Metatron…');
  try {
    const c = audioCtx();
    if (c.state !== 'running') await c.resume();
    if (!startFlow._visBound) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && AC && AC.state !== 'running') AC.resume();
      });
      startFlow._visBound = true;
    }
    _startBTKeepalive();
    initFXChain();

    // analyser natif + shim getValue() pour compatibilité 06-ui-builders / masterTick
    const _rawAnalyser = c.createAnalyser(); _rawAnalyser.fftSize = 256;
    _waveBuf = new Float32Array(_rawAnalyser.frequencyBinCount);
    analyser = {
      getValue() { _rawAnalyser.getFloatTimeDomainData(_waveBuf); return _waveBuf; },
      getFloatTimeDomainData(buf) { _rawAnalyser.getFloatTimeDomainData(buf); },
      fftSize: _rawAnalyser.fftSize,
      frequencyBinCount: _rawAnalyser.frequencyBinCount,
      _node: _rawAnalyser,
      connect(dest) { _rawAnalyser.connect(dest && dest._node ? dest._node : dest); },
      disconnect() { try { _rawAnalyser.disconnect(); } catch(e) {} }
    };

    masterGain = c.createGain(); masterGain.gain.value = 0;
    const now = c.currentTime;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.setTargetAtTime(masterVol, now, _fadeDur / 3);

    _lfoGain = c.createGain(); _lfoGain.gain.value = 1;
    masterGain.connect(_lfoGain); _lfoGain.connect(_fxInput);
    masterGain.connect(_rawAnalyser);

    // LFO volume natif — oscillateur dans l'audio thread, zéro commande JS périodique
    _lfoNode = c.createOscillator(); _lfoNode.type='sine'; _lfoNode.frequency.value=LFO_STATE.rate;
    _lfoDepthGain = c.createGain(); _lfoDepthGain.gain.value = LFO_STATE.on ? LFO_STATE.depth : 0;
    _lfoNode.connect(_lfoDepthGain); _lfoDepthGain.connect(_lfoGain.gain); _lfoNode.start();

    flowing = true;
    // APK Android : empêche la veille CPU/écran pendant le flux (anti-throttle Doze → moins de craquement BT).
    try { window.Capacitor?.Plugins?.KeepAwake?.keepAwake?.(); } catch(e) {}
    PAIRS.forEach((_, i) => setTimeout(() => swapPingala(i), 60 + i * 60));
    PAIRS.forEach((_, i) => updateOrbUI(i));
    ui('live', 'En expansion…');
  } catch(err) {
    flowing = false; nodes = {};
    ui('idle', 'Erreur audio — relancer');
  }
}

async function stopFlow() {
  ui('idle', 'Dissolution…');
  try { window.Capacitor?.Plugins?.KeepAwake?.allowSleep?.(); } catch(e) {}
  if (typeof progRunning !== 'undefined' && progRunning) stopProgression();
  Object.keys(swapTimers).forEach(k => { clearTimeout(swapTimers[k]); delete swapTimers[k]; });
  try {
    if (masterGain) {
      const t = aNow();
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setTargetAtTime(0, t, _fadeDur / 8);
    }
  } catch(e) {}
  const nodesCopy = {...nodes};
  nodes = {};
  flowing = false;
  Object.values(nodesCopy).forEach(n => {
    if (!n) return;
    try {
      const t = aNow();
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setTargetAtTime(0, t, 0.05);
      n.o.stop(t + 0.3);
    } catch(e) {}
    setTimeout(() => { ['o','g','p','hpf','trim'].forEach(k => { try { n[k]?.disconnect?.(); } catch(e){} }); }, 500);
  });
  setTimeout(() => {
    try { _lfoNode?.stop(); } catch(e){}
    [_lfoNode, _lfoGain, _lfoDepthGain, masterGain].forEach(x => { try { x?.disconnect(); } catch(e){} });
    if (analyser) { try { analyser.disconnect(); } catch(e){} }
    _lfoNode = _lfoGain = _lfoDepthGain = masterGain = analyser = null;
    PAIRS.forEach((_, i) => updateOrbUI(i));
    const mc = document.getElementById('vpc-p' + MASTER_IDX);
    if (mc) mc.style.boxShadow = '';
    ui('idle', 'Metatron immobile');
  }, 600);
}

// ── Master Tick (RAF) ─────────────────────────────────────────
let _glowFrame = 0;
function masterTick() {
  masterRAF = requestAnimationFrame(masterTick);
  metaAngle = (metaAngle + 0.003) % (Math.PI * 2);
  drawMetatron();
  // LFO géré nativement (Web Audio) — aucun traitement JS ici
  if (!flowing || !analyser || document.visibilityState === 'hidden') return;
  // Gain global réel = anti-crack (porteur) + modulation LFO volume (a-rate, par-dessus).
  if (_lfoGain) _lfoGain.gain.setTargetAtTime(_antiCrackTarget, aNow(), 0.2);
  // Throttle des écritures boxShadow (style-recalc) : 1 frame sur 2.
  // Soulage le thread principal → moins d'underruns audio sur mobile/BT.
  if ((_glowFrame++ & 1) === 0) { drawSpectroid(); return; }
  const data = analyser.getValue();
  let sum = 0, count = 0;
  for (let k = 0; k < data.length; k += 4) { sum += Math.abs(data[k]); count++; }
  const e = Math.min(1, sum / count * 7);
  const mc = document.getElementById('vpc-p' + MASTER_IDX);
  if (mc) {
    const g = Math.round(e * 45);
    const a = (0.12 + e * .48).toFixed(2);
    mc.style.boxShadow = `0 0 ${g}px rgba(255,160,255,${a}),0 0 ${g*2}px rgba(255,160,255,${(+a*.35).toFixed(2)}),inset 0 0 ${Math.round(g*.5)}px rgba(255,160,255,${(+a*.25).toFixed(2)})`;
  }
  PAIRS.forEach((pair, i) => {
    if (i === MASTER_IDX) return;
    const vcp = document.getElementById('vpc-p' + i);
    if (!vcp || mutedOscs[pair.pingala.id]) return;
    const lvl = Math.min(1, e * 0.65 + 0.12);
    const alpha = Math.round(lvl * 200).toString(16).padStart(2, '0');
    vcp.style.boxShadow = `0 0 ${Math.round(lvl*22)}px ${pair.color}${alpha},0 0 ${Math.round(lvl*10)}px ${pair.color}44`;
  });
  drawSpectroid();
}

function ui(state, text) {
  const dot=document.getElementById('dot'); if(dot) dot.classList.toggle('live', state === 'live');
  const st=document.getElementById('status'); if(st) st.classList.toggle('live', state === 'live');
  const stxt=document.getElementById('stxt'); if(stxt) stxt.textContent = text;
  const bdis = document.getElementById('btn-dis');
  const bray = document.getElementById('btn-ray');
  if (bdis) bdis.disabled = (state !== 'live');
  if (bray) bray.disabled = (state === 'live');
}
