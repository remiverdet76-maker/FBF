/* ═══════════════════════════════════════════
   02-audio.js — Moteur audio NATIF (Web Audio API)
   Migration Tone.js → natif. API publique inchangée.
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
let ppSendBus = null, reverbSendBus = null;
let compressor = null;
let busTrim = null, mEqLow = null, mEqMid = null, mEqHigh = null, masterGlue = null, masterFader = null;
let _fxInput = null;
let _stereo3D = false;
// Positions 3D hexagonales [x, y, z] — listener au centre regardant +z
const HEX_3D_POS = [
  [ 0.9, 0, -0.4],  // Paire 1 → droite avant
  [ 0.5, 0,  0.9],  // Paire 2 → droite arrière
  [-0.5, 0,  0.9],  // Paire 3 → gauche arrière
  [-0.9, 0, -0.4],  // Paire 4 → gauche avant
  [-0.5, 0, -0.9],  // Paire 5 → gauche avant-proche
  [ 0.5, 0, -0.9],  // Paire 6 → droite avant-proche
  [ 0.0, 0,  0.0],  // Maître  → centre
];
const LFO_STATE    = {on:false, rate:.25,  depth:.08};
const BREATH_STATE = {on:false, rate:0.13, depth:0.35};
let _lfoNode = null, _lfoGain = null, _lfoDepthGain = null;
let _breathLFO = null, _breathGain = null, _breathDepthGain = null;
let _btKeepalive = null;
let _fadeDur = 2;
let metaAngle = 0, masterRAF = null;
let _waveBuf = null;
let _spectroidBuf = null;
const OSC_WAVES  = {}; // id → 'sine'|'triangle'|'square'|'sawtooth'|'sine2'
const OSC_FILTER = {}; // id → {cutoff:Hz, res:Q}

/* ---------- 2.1 · OSCILLATEURS (persistants, retune lisse) ---------- */
let hiDelayBus = null;
function ensureHiDelay() {
  if (hiDelayBus) return hiDelayBus;
  if (!masterGain) return null;
  const c = audioCtx();
  hiDelayBus = c.createGain(); hiDelayBus.gain.value = 1;
  const dL = c.createDelay(1.0); dL.delayTime.value = 0.18;
  const dR = c.createDelay(1.0); dR.delayTime.value = 0.27;
  const fbL = c.createGain(); fbL.gain.value = 0.30;
  const fbR = c.createGain(); fbR.gain.value = 0.30;
  const panL = c.createStereoPanner(); panL.pan.value = -0.85;
  const panR = c.createStereoPanner(); panR.pan.value =  0.85;
  const outG = c.createGain(); outG.gain.value = 0.5;
  hiDelayBus.connect(dL); hiDelayBus.connect(dR);
  dL.connect(fbL); fbL.connect(dR);
  dR.connect(fbR); fbR.connect(dL);
  dL.connect(panL); dR.connect(panR);
  panL.connect(outG); panR.connect(outG);
  outG.connect(masterGain);
  return hiDelayBus;
}

function applyHiBand(node, freq) {
  if (!node) return;
  const hi = freq > 432, now = aNow();
  try {
    if (node.hpf)    node.hpf.frequency.setTargetAtTime(hi ? 420 : 20, now, 0.05);
    if (node.hiTrim) node.hiTrim.gain.setTargetAtTime(hi ? 0.75 : 1.0, now, 0.08);
    if (node.dSend)  node.dSend.gain.setTargetAtTime(hi ? 0.40 : 0.0, now, 0.08);
  } catch(e) {}
}

function buildOsc(id, freq, vol, pan) {
  const c       = audioCtx();
  const wType   = OSC_WAVES[id]  || 'sine';
  const isSine2 = wType === 'sine2';
  const fs      = OSC_FILTER[id] || { cutoff: 20000, res: 0 };

  const o = c.createOscillator();
  o.type = isSine2 ? 'sine' : wType;
  o.frequency.value = safeF(freq);
  if (isSine2) o.detune.value = -7;

  const signalIn = c.createGain(); signalIn.gain.value = isSine2 ? 0.65 : 1;
  o.connect(signalIn);

  let o2 = null;
  if (isSine2) {
    o2 = c.createOscillator(); o2.type = 'sine';
    o2.frequency.value = safeF(freq); o2.detune.value = +7;
    const o2g = c.createGain(); o2g.gain.value = 0.65;
    o2.connect(o2g); o2g.connect(signalIn);
    o2.start();
  }

  const p   = c.createStereoPanner(); p.pan.value = pan;
  const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 20; hpf.Q.value = 0.707;
  const flt = c.createBiquadFilter(); flt.type = 'lowpass';
  flt.frequency.value = Math.max(20, Math.min(20000, fs.cutoff));
  flt.Q.value = Math.max(0, Math.min(30, fs.res));
  const g      = c.createGain(); g.gain.value = 0;
  const hiTrim = c.createGain(); hiTrim.gain.value = 1;

  signalIn.connect(p); p.connect(hpf); hpf.connect(flt); flt.connect(g); g.connect(hiTrim);
  hiTrim.connect(masterGain);

  const dSend = c.createGain(); dSend.gain.value = 0;
  hiTrim.connect(dSend);
  const bus = ensureHiDelay(); if (bus) dSend.connect(bus);

  const rSend  = c.createGain(); rSend.gain.value  = 0; hiTrim.connect(rSend);
  const ppSend = c.createGain(); ppSend.gain.value = 0; hiTrim.connect(ppSend);
  if (reverbSendBus) rSend.connect(reverbSendBus);
  if (ppSendBus)     ppSend.connect(ppSendBus);

  o.start();
  const node = { o, o2, signalIn, g, p, hpf, flt, hiTrim, dSend, rSend, ppSend };
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
    if (node.o2) {
      node.o2.frequency.cancelScheduledValues(now);
      node.o2.frequency.setValueAtTime(node.o2.frequency.value, now);
      node.o2.frequency.exponentialRampToValueAtTime(Math.max(1, f), now + TUNE_T);
    }
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
    if (node.o2) try { node.o2.stop(now + FADE + 0.1); } catch(e) {}
  } catch(e) {}
  setTimeout(() => {
    try {
      node.o.disconnect(); node.g.disconnect(); node.p.disconnect();
      if (node.o2)      node.o2.disconnect();
      if (node.signalIn) node.signalIn.disconnect();
      if (node.hpf)     node.hpf.disconnect();
      if (node.flt)     node.flt.disconnect();
      if (node.hiTrim)  node.hiTrim.disconnect();
      if (node.dSend)   node.dSend.disconnect();
      if (node.rSend)   node.rSend.disconnect();
      if (node.ppSend)  node.ppSend.disconnect();
    } catch(e){}
  }, (FADE + 0.4) * 1000);
}

function swapPingala(i) {
  if (!flowing || !masterGain) return;
  const { pingala } = PAIRS[i];
  const pan = (typeof OSC_PAN !== 'undefined' && OSC_PAN[i]) ? OSC_PAN[i][0] : -1;
  const vol = typeof isosonicVol === 'function' ? isosonicVol(calcPFreq(i), pingala.vol) : pingala.vol;
  if (nodes[pingala.id]) {
    tuneOsc(pingala.id, calcPFreq(i));
  } else {
    nodes[pingala.id] = buildOsc(pingala.id, calcPFreq(i), vol, pan);
  }
  setTimeout(() => { if (flowing && masterGain) swapIda(i); }, 40);
  _applyAntiCrack();
  updatePairUI(i);
}
function swapIda(i) {
  if (!flowing || !masterGain) return;
  const { ida } = PAIRS[i];
  const pan = (typeof OSC_PAN !== 'undefined' && OSC_PAN[i]) ? OSC_PAN[i][1] : 1;
  const vol = typeof isosonicVol === 'function' ? isosonicVol(calcIFreq(i), ida.vol) : ida.vol;
  if (nodes[ida.id]) {
    tuneOsc(ida.id, calcIFreq(i));
  } else {
    nodes[ida.id] = buildOsc(ida.id, calcIFreq(i), vol, pan);
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

/* ---------- 2.2 · ANTI-CRACK (gain ∝ 1/√actifs) ---------- */
let _antiCrackTarget = 1;
function _applyAntiCrack() {
  if (!masterGain) return;
  const active = Object.keys(nodes).length || 1;
  _antiCrackTarget = Math.max(0.25, 1 / Math.sqrt(active));
}

/* ---------- 2.3 · IR DE RÉVERBE GÉNÉRÉE PAR CODE ---------- */
function _makeIR(decay, preDelay) {
  const c = audioCtx(), sr = c.sampleRate;
  const decayCap = Math.min(decay, 8.0); // mobile CPU cap
  const len = Math.max(1, Math.floor(sr * (preDelay + decayCap)));
  const pd  = Math.floor(sr * preDelay);
  const onset = Math.max(1, Math.floor(sr * 0.008)); // 8ms soft onset → no transient crack
  const ir  = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let maxAmp = 0;
    for (let i = 0; i < len; i++) {
      if (i < pd) { d[i] = 0; continue; }
      const rel = i - pd;
      const t   = rel / (sr * decayCap);
      const env = Math.exp(-t * (2.8 + decayCap * 0.3));
      const fade = Math.min(1, rel / onset);
      const noise = ch === 0
        ? (Math.random() * 2 - 1)
        : (Math.random() * 2 - 1) * 0.78 + Math.sin(rel * 0.0031) * 0.22; // L/R decorrel
      d[i] = noise * env * fade;
      if (Math.abs(d[i]) > maxAmp) maxAmp = Math.abs(d[i]);
    }
    if (maxAmp > 0.001) {
      const scale = 0.82 / maxAmp;
      for (let i = pd; i < len; i++) d[i] *= scale;
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

  compressor = c.createDynamicsCompressor();
  compressor.threshold.value=-24; compressor.ratio.value=4; compressor.attack.value=0.02; compressor.release.value=0.25;

  masterDelay   = c.createDelay(1.0); masterDelay.delayTime.value=0.3;
  masterDelayFb = c.createGain(); masterDelayFb.gain.value=0.3;
  masterDelay.connect(masterDelayFb); masterDelayFb.connect(masterDelay);
  const delayWet = c.createGain(); delayWet.gain.value=0; masterDelay.connect(delayWet);

  // Reverb — always connected; reverbWetGain.gain controls wet (starts at 0 → no crack)
  masterReverb  = c.createConvolver();
  masterReverb.buffer = _makeIR(1.5, 0.05);
  reverbWetGain = c.createGain(); reverbWetGain.gain.value = 0;
  reverbDryGain = c.createGain(); reverbDryGain.gain.value = 1; // kept for compat
  reverbSendBus = c.createGain(); reverbSendBus.gain.value = 1; // per-osc reverb sends

  // True stereo ping-pong — cross-feedback (L→R→L cross-bounce)
  const ppDelL = c.createDelay(2.0); ppDelL.delayTime.value = 0.25;
  const ppDelR = c.createDelay(2.0); ppDelR.delayTime.value = 0.375;
  const ppFbLR = c.createGain(); ppFbLR.gain.value = 0.35;  // L→R cross
  const ppFbRL = c.createGain(); ppFbRL.gain.value = 0.35;  // R→L cross
  const ppPanL = c.createStereoPanner(); ppPanL.pan.value = -1;
  const ppPanR = c.createStereoPanner(); ppPanR.pan.value =  1;
  ppWet    = c.createGain(); ppWet.gain.value = 0;
  ppSendBus = c.createGain(); ppSendBus.gain.value = 1; // per-osc PP sends

  // Master PP send (controlled by ppMasterSend gain, starts silent)
  const ppMasterSend = c.createGain(); ppMasterSend.gain.value = 0;
  compressor.connect(ppMasterSend); ppMasterSend.connect(ppSendBus);

  // Ping-pong routing
  ppSendBus.connect(ppDelL);
  ppDelL.connect(ppFbLR); ppFbLR.connect(ppDelR);
  ppDelR.connect(ppFbRL); ppFbRL.connect(ppDelL);
  ppDelL.connect(ppPanL); ppDelR.connect(ppPanR);
  ppPanL.connect(ppWet); ppPanR.connect(ppWet);
  pingPongDelay = { delayL: ppDelL, delayR: ppDelR, _fbLR: ppFbLR, _fbRL: ppFbRL, _wet: ppWet };
  ppL = ppDelL; ppR = ppDelR; // keep legacy refs

  busTrim = c.createGain(); busTrim.gain.value = 1;

  mEqLow  = c.createBiquadFilter(); mEqLow.type='lowshelf';  mEqLow.frequency.value=54;   mEqLow.gain.value=0;
  mEqMid  = c.createBiquadFilter(); mEqMid.type='peaking';   mEqMid.frequency.value=216;  mEqMid.Q.value=0.9; mEqMid.gain.value=0;
  mEqHigh = c.createBiquadFilter(); mEqHigh.type='highshelf';mEqHigh.frequency.value=432; mEqHigh.gain.value=0;

  masterGlue = c.createDynamicsCompressor();
  masterGlue.threshold.value=-18; masterGlue.knee.value=6; masterGlue.ratio.value=2;
  masterGlue.attack.value=0.03; masterGlue.release.value=0.25;

  masterFader = c.createGain(); masterFader.gain.value = 1;

  limiter = c.createDynamicsCompressor();
  limiter.threshold.value=-3.6; limiter.knee.value=0; limiter.ratio.value=20;
  limiter.attack.value=0.002; limiter.release.value=0.18;

  // Master bus chain
  busTrim.connect(mEqLow); mEqLow.connect(mEqMid); mEqMid.connect(mEqHigh);
  mEqHigh.connect(masterGlue); masterGlue.connect(masterFader);
  masterFader.connect(limiter); limiter.connect(c.destination);

  // Channel insert → compressor
  eqLow.connect(eqMid); eqMid.connect(eqHigh); eqHigh.connect(compressor);

  // Compressor parallel sends (all permanent connections)
  compressor.connect(busTrim);                          // dry path
  compressor.connect(masterDelay); delayWet.connect(busTrim);  // delay
  compressor.connect(reverbWetGain);                    // reverb (always on, gain=0 by default)
  reverbWetGain.connect(masterReverb);
  reverbSendBus.connect(masterReverb);                  // per-osc reverb input
  masterReverb.connect(busTrim);
  ppWet.connect(busTrim);                               // ping-pong output

  _fxInput = eqLow;
  _fxRefs = { delayWet, ppMasterSend };
}
let _fxRefs = {};

/* ---------- 2.5 · REVERB ---------- */
let _reverbActive = false;
function _setReverbActive(on) {
  // no-op: reverb always connected — reverbWetGain.gain controls wet level (no crackling)
  _reverbActive = on;
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

/* ---------- 2.6 · LFO & BREATH ---------- */
function lfoToggle(on) {
  LFO_STATE.on = on;
  if (!_lfoNode || !_lfoDepthGain || !_lfoGain) return;
  if (on) {
    _lfoDepthGain.gain.value = LFO_STATE.depth;
  } else {
    _lfoDepthGain.gain.setTargetAtTime(0, aNow(), 0.1);
  }
}
function lfoSet(param, v) {
  LFO_STATE[param] = parseFloat(v);
  if (_lfoNode) {
    if (param === 'rate')  _lfoNode.frequency.setTargetAtTime(LFO_STATE.rate, aNow(), 0.05);
    if (param === 'depth' && LFO_STATE.on) _lfoDepthGain.gain.setTargetAtTime(LFO_STATE.depth, aNow(), 0.05);
  }
  const el = document.getElementById('sv-lfo-' + param); if (el) el.textContent = parseFloat(v).toFixed(2);
}

function breathToggle(on) {
  BREATH_STATE.on = on;
  if (!_breathLFO || !_breathDepthGain || !_breathGain) return;
  if (on) {
    _breathDepthGain.gain.value = BREATH_STATE.depth;
  } else {
    _breathDepthGain.gain.setTargetAtTime(0, aNow(), 0.5);
  }
}
function breathSet(param, v) {
  BREATH_STATE[param] = parseFloat(v);
  if (_breathLFO) {
    if (param === 'rate')  _breathLFO.frequency.setTargetAtTime(BREATH_STATE.rate, aNow(), 0.05);
    if (param === 'depth' && BREATH_STATE.on) _breathDepthGain.gain.setTargetAtTime(BREATH_STATE.depth, aNow(), 0.05);
  }
  const el = document.getElementById('sv-breath-' + param);
  if (el) el.textContent = param === 'rate'
    ? (BREATH_STATE.rate * 60).toFixed(1) + ' /min'
    : parseFloat(v).toFixed(2);
}

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

function setChorusDepth(v) { /* no-op : chorus supprimé */ }
function setChorusRate(v)  { /* no-op */ }
function setCompThresh(v)  { if (compressor) try { compressor.threshold.value = parseFloat(v); } catch(e) {} }
function setCompRatio(v)   { if (compressor) try { compressor.ratio.value = parseFloat(v); } catch(e) {} }

/* ---------- 2.6c · OSCILLATEUR — WAVEFORM & FILTRE ---------- */
const OSC_WAVE_TYPES = ['sine','sine2','triangle','square','sawtooth'];
const OSC_WAVE_LABELS = { sine:'≈ Sin', sine2:'≈≈ Sin+', triangle:'△ Tri', square:'⊓ Sqr', sawtooth:'/ Saw' };

function setOscWave(id, type) {
  OSC_WAVES[id] = type;
  // Rebuild only if flowing — find pair index
  if (!flowing) return;
  PAIRS.forEach((p, i) => {
    if (p.pingala.id === id) swapPingala(i);
    else if (p.ida.id === id) swapIda(i);
  });
}

function cycleOscWave(id) {
  const cur = OSC_WAVES[id] || 'sine';
  const idx = OSC_WAVE_TYPES.indexOf(cur);
  const next = OSC_WAVE_TYPES[(idx + 1) % OSC_WAVE_TYPES.length];
  setOscWave(id, next);
  // Update button label if present
  const btn = document.getElementById('wbtn-' + id);
  if (btn) btn.textContent = OSC_WAVE_LABELS[next] || next;
  return next;
}

function setOscFilter(id, cutoff, res) {
  const cur = OSC_FILTER[id] || { cutoff: 20000, res: 0 };
  if (cutoff !== null && cutoff !== undefined) cur.cutoff = Math.max(20, Math.min(20000, parseFloat(cutoff)));
  if (res    !== null && res    !== undefined) cur.res    = Math.max(0,  Math.min(30,    parseFloat(res)));
  OSC_FILTER[id] = cur;
  const node = nodes[id]; if (!node?.flt) return;
  const now = aNow();
  node.flt.frequency.setTargetAtTime(cur.cutoff, now, 0.05);
  node.flt.Q.setTargetAtTime(cur.res, now, 0.05);
}

function setOscReverbSend(id, v) {
  const node = nodes[id]; if (!node?.rSend) return;
  node.rSend.gain.setTargetAtTime(Math.max(0, Math.min(1, parseFloat(v))), aNow(), 0.05);
}

function setOscPPSend(id, v) {
  const node = nodes[id]; if (!node?.ppSend) return;
  node.ppSend.gain.setTargetAtTime(Math.max(0, Math.min(1, parseFloat(v))), aNow(), 0.05);
}

function setPingPongTime(t) {
  if (!pingPongDelay) return;
  const time = Math.max(0.04, Math.min(1.5, parseFloat(t)));
  try {
    pingPongDelay.delayL.delayTime.setTargetAtTime(time, aNow(), 0.05);
    pingPongDelay.delayR.delayTime.setTargetAtTime(time * 1.5, aNow(), 0.05);
  } catch(e) {}
}

function setPingPongFb(v) {
  if (!pingPongDelay) return;
  const fb = Math.max(0, Math.min(0.85, parseFloat(v)));
  try {
    pingPongDelay._fbLR.gain.setTargetAtTime(fb, aNow(), 0.05);
    pingPongDelay._fbRL.gain.setTargetAtTime(fb, aNow(), 0.05);
  } catch(e) {}
}

function setPingPongWet(v) {
  if (ppWet) ppWet.gain.setTargetAtTime(Math.max(0, Math.min(1, parseFloat(v))), aNow(), 0.05);
}

function setPingPongMasterSend(v) {
  if (_fxRefs.ppMasterSend) _fxRefs.ppMasterSend.gain.setTargetAtTime(Math.max(0, Math.min(1, parseFloat(v))), aNow(), 0.05);
}

/* ---------- 2.6b · CONTRÔLES RACK MASTER ---------- */
function setMasterTrim(v) {
  if (busTrim) busTrim.gain.setTargetAtTime(Math.max(0, Math.min(1.5, parseFloat(v))), aNow(), 0.05);
}
function setMasterFader(v) {
  if (masterFader) masterFader.gain.setTargetAtTime(Math.max(0, Math.min(1.2, parseFloat(v))), aNow(), 0.05);
}
function setMasterEQ(band, dB) {
  const g = Math.max(-12, Math.min(12, parseFloat(dB)));
  if (band === 'low'  && mEqLow)  mEqLow.gain.setTargetAtTime(g, aNow(), 0.05);
  if (band === 'mid'  && mEqMid)  mEqMid.gain.setTargetAtTime(g, aNow(), 0.05);
  if (band === 'high' && mEqHigh) mEqHigh.gain.setTargetAtTime(g, aNow(), 0.05);
}
function setMasterGlue(amount) {
  if (!masterGlue) return;
  const a = Math.max(0, Math.min(1, parseFloat(amount)));
  masterGlue.threshold.setTargetAtTime(-24 * a, aNow(), 0.05);
}
let _masterDimmed = false, _faderBeforeDim = 1;
function toggleMasterDim() {
  if (!masterFader) return;
  if (_masterDimmed) { masterFader.gain.setTargetAtTime(_faderBeforeDim, aNow(), 0.05); _masterDimmed = false; }
  else { _faderBeforeDim = masterFader.gain.value; masterFader.gain.setTargetAtTime(_faderBeforeDim * 0.25, aNow(), 0.05); _masterDimmed = true; }
  return _masterDimmed;
}

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

function limiterReductionDb() {
  try { return limiter ? limiter.reduction : 0; } catch(e) { return 0; }
}

/* ---------- 2.8 · START / STOP ---------- */
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
      document.addEventListener('resume', () => {
        if (flowing && AC && AC.state !== 'running') AC.resume();
      });
      startFlow._visBound = true;
    }
    if (!startFlow._heartbeat) {
      startFlow._heartbeat = setInterval(() => {
        if (flowing && AC && AC.state !== 'running') AC.resume().catch(() => {});
      }, 12000);
    }
    if (!startFlow._wakeLock && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => {
        startFlow._wakeLock = lock;
        lock.addEventListener('release', () => { startFlow._wakeLock = null; });
      }).catch(() => {});
    }
    _startBTKeepalive();
    initFXChain();

    // analyser natif + shim getValue() pour compatibilité 06-ui-builders et masterTick
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
    _breathGain = c.createGain(); _breathGain.gain.value = 1;
    masterGain.connect(_lfoGain); _lfoGain.connect(_breathGain); _breathGain.connect(_fxInput);
    masterGain.connect(_rawAnalyser);

    _lfoNode = c.createOscillator(); _lfoNode.type='sine'; _lfoNode.frequency.value=LFO_STATE.rate;
    _lfoDepthGain = c.createGain(); _lfoDepthGain.gain.value = LFO_STATE.on ? LFO_STATE.depth : 0;
    _lfoNode.connect(_lfoDepthGain); _lfoDepthGain.connect(_lfoGain.gain); _lfoNode.start();

    _breathLFO = c.createOscillator(); _breathLFO.type='sine'; _breathLFO.frequency.value=BREATH_STATE.rate;
    _breathDepthGain = c.createGain(); _breathDepthGain.gain.value = BREATH_STATE.on ? BREATH_STATE.depth : 0;
    _breathLFO.connect(_breathDepthGain); _breathDepthGain.connect(_breathGain.gain); _breathLFO.start();

    flowing = true;
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
  if (startFlow._heartbeat) { clearInterval(startFlow._heartbeat); startFlow._heartbeat = null; }
  if (startFlow._wakeLock)  { try { startFlow._wakeLock.release(); } catch(e) {} startFlow._wakeLock = null; }
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
    setTimeout(() => {
      try {
        n.o.disconnect(); n.g.disconnect(); n.p.disconnect();
        if (n.o2)      n.o2.disconnect();
        if (n.signalIn) n.signalIn.disconnect();
        if (n.hpf)     n.hpf.disconnect();
        if (n.flt)     n.flt.disconnect();
        if (n.hiTrim)  n.hiTrim.disconnect();
        if (n.dSend)   n.dSend.disconnect();
        if (n.rSend)   n.rSend.disconnect();
        if (n.ppSend)  n.ppSend.disconnect();
      } catch(e){}
    }, 500);
  });
  setTimeout(() => {
    [_lfoNode, _breathLFO].forEach(x => { try { x?.stop(); } catch(e){} });
    [_lfoNode, _lfoGain, _lfoDepthGain, _breathLFO, _breathGain, _breathDepthGain, masterGain]
      .forEach(x => { try { x?.disconnect(); } catch(e){} });
    if (analyser) { try { analyser.disconnect(); } catch(e){} }
    _lfoNode=_lfoGain=_lfoDepthGain=_breathLFO=_breathGain=_breathDepthGain=masterGain=analyser=null;
    hiDelayBus = null;
    PAIRS.forEach((_, i) => updateOrbUI(i));
    const mc = document.getElementById('vpc-p' + MASTER_IDX);
    if (mc) mc.style.boxShadow = '';
    ui('idle', 'Metatron immobile');
  }, 600);
}

/* ---------- 2.9 · MASTER TICK (RAF) ---------- */
let _glowFrame = 0;
function masterTick() {
  masterRAF = requestAnimationFrame(masterTick);
  metaAngle = (metaAngle + 0.003) % (Math.PI * 2);
  drawMetatron();
  if (!flowing || !analyser || document.visibilityState === 'hidden') return;

  if (_lfoGain) _lfoGain.gain.setTargetAtTime(_antiCrackTarget, aNow(), 0.2);

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

/* ---------- 2.10 · LFO DOUX PAR OSCILLATEUR ---------- */
const _oscVolLFOs = {};

function attachOscVolLFO(id, rate, depth) {
  clearOscVolLFO(id);
  const node = nodes[id]; if (!node) return;
  const c = audioCtx();
  const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = rate || 0.2;
  const dg  = c.createGain(); dg.gain.value = depth || 0.07;
  lfo.connect(dg); dg.connect(node.g.gain);
  lfo.start();
  _oscVolLFOs[id] = { lfo, dg };
}

function clearOscVolLFO(id) {
  const l = _oscVolLFOs[id]; if (!l) return;
  try { l.lfo.stop(); l.lfo.disconnect(); l.dg.disconnect(); } catch(e) {}
  delete _oscVolLFOs[id];
}

function toggleOscVolLFO(i) {
  const pid = PAIRS[i].pingala.id;
  const iid = PAIRS[i].ida.id;
  if (_oscVolLFOs[pid] || _oscVolLFOs[iid]) {
    clearOscVolLFO(pid); clearOscVolLFO(iid);
    const btn = document.getElementById('btn-lfo-' + i);
    if (btn) { btn.textContent = '〜 Activer'; btn.style.opacity = ''; }
  } else {
    const rate = 0.08 + Math.random() * 0.35;
    attachOscVolLFO(pid, rate, 0.07);
    attachOscVolLFO(iid, rate, 0.07);
    const btn = document.getElementById('btn-lfo-' + i);
    if (btn) { btn.textContent = '〜 Actif'; btn.style.opacity = '0.55'; }
  }
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
