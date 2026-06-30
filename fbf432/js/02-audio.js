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
let ppSendBus = null, reverbSendBus = null, delayInBus = null;
// FX par paire : envoi unique (fxSend) vers les 3 tanks. OFF = 100% sec.
const PAIR_FX = {};           // id oscillateur → bool (défaut true)
const FX_SEND_LEVEL = 0.3;    // niveau d'envoi quand FX ON
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
const OSC_WAVES  = {}; // id → clé de OSC_ENGINES
const OSC_FILTER = {}; // id → {cutoff:Hz, res:Q}
const OSC_ENV    = {}; // id → {a:attack s, r:release s}

// Moteurs d'oscillateur façon FL MiniSynth / MiniBrute (multi-partiels)
// partiel : { t:type, d:détune cents, g:gain, r:ratio de fréquence }
const OSC_ENGINES = {
  sine:     [{t:'sine',d:0,g:1}],
  sine2:    [{t:'sine',d:-7,g:.62},{t:'sine',d:7,g:.62}],
  triangle: [{t:'triangle',d:0,g:1}],
  square:   [{t:'square',d:0,g:.85}],
  sawtooth: [{t:'sawtooth',d:0,g:.9}],
  sawsin:   [{t:'sawtooth',d:0,g:.5},{t:'sine',d:0,g:.65}],
  sawsqr:   [{t:'sawtooth',d:-4,g:.5},{t:'square',d:4,g:.4}],
  dualsaw:  [{t:'sawtooth',d:-9,g:.5},{t:'sawtooth',d:9,g:.5}],
  defsaw:   [{t:'sawtooth',d:-13,g:.42},{t:'sawtooth',d:0,g:.5},{t:'sawtooth',d:13,g:.42}],
  defsin:   [{t:'sine',d:-13,g:.42},{t:'sine',d:0,g:.5},{t:'sine',d:13,g:.42}],
  voixduo:  [{t:'sine',d:0,g:.62},{t:'sine',d:0,g:.5,r:3/2}],
  voixtrio: [{t:'sine',d:0,g:.55},{t:'sine',d:0,g:.42,r:5/4},{t:'sine',d:0,g:.42,r:3/2}],
  voixquat: [{t:'sine',d:0,g:.5},{t:'sine',d:0,g:.38,r:5/4},{t:'sine',d:0,g:.38,r:3/2},{t:'sine',d:0,g:.32,r:2}],
};
const OSC_ENGINE_LABELS = {
  sine:'≈ Sin', sine2:'≈≈ Sin×2', triangle:'△ Tri', square:'⊓ Carré', sawtooth:'◣ Saw',
  sawsin:'Saw+Sin', sawsqr:'Saw+Carré', dualsaw:'Saw×2', defsaw:'DefSaw', defsin:'DefSin',
  voixduo:'Voix Duo', voixtrio:'Voix Trio', voixquat:'Voix Quat',
};

// ── Grain analogique (waveshaper doux + drift de pitch) ───────────
// OFF par défaut : une sinus pure doit rester PURE (sinon saturation = bourdonnement).
const GRAIN_STATE = { on: false, drive: 0, drift: 0 };
let _driftLFO = null, _driftDepth = null;
function _grainCurve(drive) {
  const n = 1024, c = new Float32Array(n);
  const k = drive * 30;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = k > 0.0001 ? Math.tanh(k * x) / Math.tanh(k) : x;
  }
  return c;
}
function setGrainDrive(v) {
  const was = GRAIN_STATE.on && GRAIN_STATE.drive > 0.001;
  GRAIN_STATE.drive = Math.max(0, Math.min(1, parseFloat(v)));
  GRAIN_STATE.on = GRAIN_STATE.drive > 0.001;
  const now = GRAIN_STATE.on;
  if (was !== now && flowing) { rebuildAllOscs(); }   // insère/retire le saturateur proprement
  else { const curve = now ? _grainCurve(GRAIN_STATE.drive) : null;
         Object.values(nodes).forEach(n => { if (n && n.shaper) n.shaper.curve = curve; }); }
  const el = document.getElementById('sv-grain-drive'); if (el) el.textContent = GRAIN_STATE.drive.toFixed(2);
}
function setGrainDrift(v) {
  GRAIN_STATE.drift = Math.max(0, Math.min(1, parseFloat(v)));
  if (_driftDepth) _driftDepth.gain.setTargetAtTime(GRAIN_STATE.drift * 5, aNow(), 0.1);
  const el = document.getElementById('sv-grain-drift'); if (el) el.textContent = GRAIN_STATE.drift.toFixed(2);
}

/* ---------- 2.1 · OSCILLATEURS (persistants, retune lisse) ---------- */
// Les filtres sont gérés par bande (cut bas/haut). applyHiBand est neutralisé.
function applyHiBand(node, freq) { /* no-op : géré par les cuts de bande */ }

function buildOsc(id, freq, vol, pan) {
  const c      = audioCtx();
  const engine = OSC_ENGINES[OSC_WAVES[id]] || OSC_ENGINES.sine;
  const fs     = OSC_FILTER[id] || { cutoff: 6000, res: 4 };  // défaut doux (sinus)
  const env    = OSC_ENV[id]    || { a: 0, r: 0 };
  const f0     = safeF(freq);

  const signalIn = c.createGain(); signalIn.gain.value = 1;

  // Construit les partiels du moteur
  const subs = [];
  engine.forEach(part => {
    const osc = c.createOscillator();
    osc.type = part.t;
    const ratio = part.r || 1;
    osc.frequency.value = Math.max(1, f0 * ratio);
    osc.detune.value = part.d || 0;
    const pg = c.createGain(); pg.gain.value = part.g != null ? part.g : 1;
    osc.connect(pg); pg.connect(signalIn);
    if (_driftDepth) { try { _driftDepth.connect(osc.detune); } catch(e) {} }
    osc.start();
    subs.push({ osc, ratio });
  });

  // Grain analogique : saturation douce — UNIQUEMENT si activé (sinon trajet 100% propre)
  const grainOn = GRAIN_STATE.on && GRAIN_STATE.drive > 0.001;
  let shaper = null;
  if (grainOn) {
    shaper = c.createWaveShaper();
    shaper.oversample = '4x';
    shaper.curve = _grainCurve(GRAIN_STATE.drive);
  }

  const p   = c.createStereoPanner(); p.pan.value = pan;
  const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = fs.hp || 20; hpf.Q.value = 0.707;
  const flt = c.createBiquadFilter(); flt.type = 'lowpass';
  flt.frequency.value = Math.max(20, Math.min(20000, fs.cutoff));
  flt.Q.value = Math.max(0, Math.min(30, fs.res));
  const g      = c.createGain(); g.gain.value = 0;
  const hiTrim = c.createGain(); hiTrim.gain.value = 1;

  if (shaper) { signalIn.connect(shaper); shaper.connect(p); }
  else        { signalIn.connect(p); }      // sinus pure → aucun traitement
  p.connect(hpf); hpf.connect(flt); flt.connect(g); g.connect(hiTrim);
  hiTrim.connect(masterGain);

  // Envoi FX unique de la paire (vers reverb + delay + ping-pong)
  const fxOn   = PAIR_FX[id] !== false;
  const fxSend = c.createGain(); fxSend.gain.value = fxOn ? FX_SEND_LEVEL : 0;
  hiTrim.connect(fxSend);
  if (reverbSendBus) fxSend.connect(reverbSendBus);
  if (delayInBus)    fxSend.connect(delayInBus);
  if (ppSendBus)     fxSend.connect(ppSendBus);

  const node = { _id: id, o: subs[0].osc, subs, signalIn, shaper, g, p, hpf, flt, hiTrim, fxSend };
  applyHiBand(node, f0);
  if (OSC_PATCH[id]) setTimeout(() => _reapplyOscPatch(id), 20);
  if (!mutedOscs[id] && vol > 0) {
    const now = c.currentTime;
    const atk = Math.max(FADE / 5, env.a || 0);
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0, now);
    g.gain.setTargetAtTime(vol, now, atk);
  }
  return node;
}

function tuneOsc(id, freq) {
  const node = nodes[id]; if (!node) return;
  try {
    const f = safeF(freq), now = aNow();
    (node.subs || [{ osc: node.o, ratio: 1 }]).forEach(s => {
      const tgt = Math.max(1, f * (s.ratio || 1));
      s.osc.frequency.cancelScheduledValues(now);
      s.osc.frequency.setValueAtTime(s.osc.frequency.value, now);
      s.osc.frequency.exponentialRampToValueAtTime(tgt, now + TUNE_T);
    });
    applyHiBand(node, f);
  } catch(e) {}
}

function releaseOsc(node) {
  const subs = node.subs || (node.o ? [{ osc: node.o }] : []);
  if (node._id) clearOscMods(node._id);
  try {
    const now = aNow();
    const rel = Math.max(FADE / 5, (OSC_ENV[node._id] && OSC_ENV[node._id].r) || 0);
    node.g.gain.cancelScheduledValues(now);
    node.g.gain.setValueAtTime(node.g.gain.value, now);
    node.g.gain.setTargetAtTime(0, now, rel);
    subs.forEach(s => { try { s.osc.stop(now + FADE + 0.1); } catch(e) {} });
  } catch(e) {}
  setTimeout(() => {
    try {
      subs.forEach(s => { try { s.osc.disconnect(); } catch(e) {} });
      node.g.disconnect(); node.p.disconnect();
      if (node.signalIn) node.signalIn.disconnect();
      if (node.shaper)  node.shaper.disconnect();
      if (node.hpf)     node.hpf.disconnect();
      if (node.flt)     node.flt.disconnect();
      if (node.hiTrim)  node.hiTrim.disconnect();
      if (node.fxSend)  node.fxSend.disconnect();
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
  // Appliqué ici (au changement), plus dans la boucle RAF → 0 écriture audio/frame
  if (_lfoGain) _lfoGain.gain.setTargetAtTime(_antiCrackTarget, aNow(), 0.3);
}

/* ---------- 2.2b · PROTECTION SEUIL 360 Hz (point 9) ----------
   Au-dessus de 360 Hz : HPF imposé + envoi reverb/delay (spatialisation)
   + pan élargi (LFO 3D). Le −50% volume est appliqué côté data (vol). */
function _applySeuilProtect(i) {
  if (i === MASTER_IDX || typeof isAboveSeuil !== 'function') return;
  const above = isAboveSeuil(i);
  const pid = PAIRS[i].pingala.id, iid = PAIRS[i].ida.id;
  const now = aNow();
  [[pid, -1], [iid, 1]].forEach(([id, side]) => {
    const node = nodes[id]; if (!node) return;
    try {
      // Au-dessus du seuil : HPF imposé (le −50% volume est géré au random).
      // On ne touche PLUS au pan → l'éventail stéréo (aération) est préservé.
      if (node.hpf) node.hpf.frequency.setTargetAtTime(above ? 120 : 20, now, 0.12);
    } catch(e) {}
  });
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

  // EQ unique (2D) — bandes : Bass 54-144 · Médium 144-288 · Haut 288-566
  eqLow  = c.createBiquadFilter(); eqLow.type='lowshelf';  eqLow.frequency.value=96;  eqLow.gain.value=0;
  eqMid  = c.createBiquadFilter(); eqMid.type='peaking';   eqMid.frequency.value=216; eqMid.Q.value=1; eqMid.gain.value=0;
  eqHigh = c.createBiquadFilter(); eqHigh.type='highshelf';eqHigh.frequency.value=427; eqHigh.gain.value=0;

  compressor = c.createDynamicsCompressor();
  compressor.threshold.value=-24; compressor.ratio.value=4; compressor.attack.value=0.02; compressor.release.value=0.25;

  // ═══ FX GLOBAUX façon DB4 : tanks partagés, alimentés UNIQUEMENT par les
  //     envois de paires (fxSend). Une paire FX-off n'envoie rien → 100% sèche.
  //     Le maître (panneau FX) règle les RETOURS (wet) et les paramètres. ═══

  // Delay — entrée = ppSendBus/reverbSendBus pattern ; ici delayInBus
  masterDelay   = c.createDelay(1.0); masterDelay.delayTime.value=0.3;
  masterDelayFb = c.createGain(); masterDelayFb.gain.value=0.25;
  masterDelay.connect(masterDelayFb); masterDelayFb.connect(masterDelay);
  delayInBus = c.createGain(); delayInBus.gain.value = 0.5;   // bus d'entrée (envois de paires, headroom)
  const delayWet = c.createGain(); delayWet.gain.value = 0; // retour (curseur master)
  delayInBus.connect(masterDelay); masterDelay.connect(delayWet);

  // Reverb — entrée reverbSendBus → convolver → retour reverbWetGain
  masterReverb  = c.createConvolver();
  masterReverb.buffer = _makeIR(1.5, 0.05);
  reverbSendBus = c.createGain(); reverbSendBus.gain.value = 0.5; // entrée (envois de paires, headroom)
  reverbWetGain = c.createGain(); reverbWetGain.gain.value = 0; // retour (curseur master)
  reverbDryGain = c.createGain(); reverbDryGain.gain.value = 1; // compat (inutilisé)
  reverbSendBus.connect(masterReverb); masterReverb.connect(reverbWetGain);

  // Ping-pong stéréo cross-feedback — entrée ppSendBus → tank → retour ppWet
  const ppDelL = c.createDelay(2.0); ppDelL.delayTime.value = 0.25;
  const ppDelR = c.createDelay(2.0); ppDelR.delayTime.value = 0.375;
  const ppFbLR = c.createGain(); ppFbLR.gain.value = 0.28;  // L→R cross (amorti, anti-tore)
  const ppFbRL = c.createGain(); ppFbRL.gain.value = 0.28;  // R→L cross
  const ppPanL = c.createStereoPanner(); ppPanL.pan.value = -1;
  const ppPanR = c.createStereoPanner(); ppPanR.pan.value =  1;
  ppWet    = c.createGain(); ppWet.gain.value = 0;   // retour (curseur master)
  ppSendBus = c.createGain(); ppSendBus.gain.value = 0.5; // entrée (envois de paires, headroom)

  ppSendBus.connect(ppDelL);
  ppDelL.connect(ppFbLR); ppFbLR.connect(ppDelR);
  ppDelR.connect(ppFbRL); ppFbRL.connect(ppDelL);
  ppDelL.connect(ppPanL); ppDelR.connect(ppPanR);
  ppPanL.connect(ppWet); ppPanR.connect(ppWet);
  pingPongDelay = { delayL: ppDelL, delayR: ppDelR, _fbLR: ppFbLR, _fbRL: ppFbRL, _wet: ppWet };
  ppL = ppDelL; ppR = ppDelR; // legacy refs

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
  // EQ master 3-bandes retiré (doublon de l'EQ 2D) → busTrim direct vers le glue
  busTrim.connect(masterGlue); masterGlue.connect(masterFader);
  masterFader.connect(limiter); limiter.connect(c.destination);

  // Channel insert (mix sec) → compressor → busTrim
  eqLow.connect(eqMid); eqMid.connect(eqHigh); eqHigh.connect(compressor);
  compressor.connect(busTrim);   // chemin SEC (le seul depuis le bus voix)

  // Retours FX → busTrim (alimentés par les envois de paires, pas par le bus voix)
  delayWet.connect(busTrim);
  reverbWetGain.connect(busTrim);
  ppWet.connect(busTrim);

  _fxInput = eqLow;
  _fxRefs = { delayWet };
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

// FX on/off par oscillateur (envoi unique vers les 3 tanks)
function setOscFX(id, on) {
  PAIR_FX[id] = !!on;
  const node = nodes[id]; if (!node?.fxSend) return;
  node.fxSend.gain.setTargetAtTime(on ? FX_SEND_LEVEL : 0, aNow(), 0.08);
}
function setPairFX(i, on) {
  setOscFX(PAIRS[i].pingala.id, on);
  setOscFX(PAIRS[i].ida.id, on);
}
function isPairFX(i) { return PAIR_FX[PAIRS[i].pingala.id] !== false; }
function setOscHPF(id, hz) {
  const node = nodes[id]; if (!node?.hpf) return;
  node.hpf.frequency.setTargetAtTime(Math.max(20, Math.min(2000, parseFloat(hz))), aNow(), 0.05);
}
function setPairHPF(i, hz) { setOscHPF(PAIRS[i].pingala.id, hz); setOscHPF(PAIRS[i].ida.id, hz); }
// Stéréo 3D : largeur symétrique pingala/ida
function setPair3DWidth(i, w) {
  const width = Math.max(0, Math.min(1, parseFloat(w))), now = aNow();
  const np = nodes[PAIRS[i].pingala.id], ni = nodes[PAIRS[i].ida.id];
  if (np?.p) np.p.pan.setTargetAtTime(-width, now, 0.08);
  if (ni?.p) ni.p.pan.setTargetAtTime( width, now, 0.08);
}
function setPairFilter(i, cutoff, res) { setOscFilter(PAIRS[i].pingala.id, cutoff, res); setOscFilter(PAIRS[i].ida.id, cutoff, res); }

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

/* ---------- 2.6d · SNAPSHOT / RESTORE FX (pour ❤️ presets) ---------- */
function getFXState() {
  return {
    eq: eqLow ? { lf:eqLow.frequency.value, lg:eqLow.gain.value,
                  mf:eqMid.frequency.value, mg:eqMid.gain.value,
                  hf:eqHigh.frequency.value, hg:eqHigh.gain.value } : null,
    delay: masterDelay ? { t:masterDelay.delayTime.value,
                           fb:masterDelayFb ? masterDelayFb.gain.value : 0,
                           wet:_fxRefs.delayWet ? _fxRefs.delayWet.gain.value : 0 } : null,
    reverb: reverbWetGain ? reverbWetGain.gain.value : 0,
    pp: pingPongDelay ? { t:pingPongDelay.delayL.delayTime.value,
                          fb:pingPongDelay._fbLR.gain.value,
                          wet:ppWet ? ppWet.gain.value : 0 } : null,
    lfo: { ...LFO_STATE }, breath: { ...BREATH_STATE }, grain: { ...GRAIN_STATE },
    comp: compressor ? { th:compressor.threshold.value, ra:compressor.ratio.value } : null,
    waves: { ...OSC_WAVES },
    filters: JSON.parse(JSON.stringify(OSC_FILTER)),
    pairFX: { ...PAIR_FX }
  };
}

function applyFXState(s) {
  if (!s) return;
  initFXChain();
  const setSl = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  if (s.eq) {
    [['eqLowFreq',s.eq.lf],['eqLowGain',s.eq.lg],['eqMidFreq',s.eq.mf],['eqMidGain',s.eq.mg],
     ['eqHighFreq',s.eq.hf],['eqHighGain',s.eq.hg]].forEach(([id,v]) => { setSl(id,v); if (typeof updateFX==='function') updateFX(id,v); });
  }
  if (s.delay) { [['delayTime',s.delay.t],['delayFeedback',s.delay.fb],['delayWet',s.delay.wet]]
    .forEach(([id,v]) => { setSl(id,v); if (typeof updateFX==='function') updateFX(id,v); }); }
  if (s.reverb != null) { setSl('reverbWet',s.reverb); if (typeof updateFX==='function') updateFX('reverbWet',s.reverb); }
  if (s.pp) {
    setPingPongTime(s.pp.t); setPingPongFb(s.pp.fb); setPingPongWet(s.pp.wet || 0);
    setSl('ppTime',s.pp.t); setSl('ppFb',s.pp.fb); setSl('ppWetSlider', s.pp.wet || 0);
  }
  if (s.lfo)    { LFO_STATE.rate=s.lfo.rate; LFO_STATE.depth=s.lfo.depth; lfoToggle(!!s.lfo.on);
                  const c=document.getElementById('lfo-on'); if (c) c.checked=!!s.lfo.on; }
  if (s.breath) { BREATH_STATE.rate=s.breath.rate; BREATH_STATE.depth=s.breath.depth; breathToggle(!!s.breath.on); }
  if (s.grain)  { GRAIN_STATE.on=s.grain.on!==false; setGrainDrive(s.grain.drive); setGrainDrift(s.grain.drift); }
  if (s.comp)   { setCompThresh(s.comp.th); setCompRatio(s.comp.ra); }
  let wavesChanged = false;
  if (s.waves)   { if (JSON.stringify(OSC_WAVES) !== JSON.stringify(s.waves)) wavesChanged = true; Object.assign(OSC_WAVES, s.waves); }
  if (s.filters) { Object.keys(s.filters).forEach(id => { OSC_FILTER[id] = s.filters[id]; if (nodes[id]) setOscFilter(id, s.filters[id].cutoff, s.filters[id].res); }); }
  if (s.pairFX)  { Object.keys(s.pairFX).forEach(id => { PAIR_FX[id] = s.pairFX[id]; const n=nodes[id]; if (n?.fxSend) n.fxSend.gain.setTargetAtTime(s.pairFX[id]!==false?FX_SEND_LEVEL:0, aNow(), 0.08); }); }
  if (wavesChanged) rebuildAllOscs();
}

function rebuildAllOscs() {
  if (!flowing) return;
  const old = { ...nodes };
  nodes = {};
  Object.values(old).forEach(n => { try { releaseOsc(n); } catch(e) {} });
  PAIRS.forEach((_, i) => setTimeout(() => { if (flowing && masterGain) swapPingala(i); }, 50 + i * 50));
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

    // Drift de pitch analogique — LFO lent partagé (cents) vers tous les detune
    _driftLFO = c.createOscillator(); _driftLFO.type='sine'; _driftLFO.frequency.value = 0.07;
    _driftDepth = c.createGain(); _driftDepth.gain.value = GRAIN_STATE.on ? GRAIN_STATE.drift * 5 : 0;
    _driftLFO.connect(_driftDepth); _driftLFO.start();

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
    const subs = n.subs || (n.o ? [{ osc: n.o }] : []);
    if (n._id) clearOscMods(n._id);
    try {
      const t = aNow();
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setTargetAtTime(0, t, 0.05);
      subs.forEach(s => { try { s.osc.stop(t + 0.3); } catch(e) {} });
    } catch(e) {}
    setTimeout(() => {
      try {
        subs.forEach(s => { try { s.osc.disconnect(); } catch(e) {} });
        n.g.disconnect(); n.p.disconnect();
        if (n.signalIn) n.signalIn.disconnect();
        if (n.shaper)  n.shaper.disconnect();
        if (n.hpf)     n.hpf.disconnect();
        if (n.flt)     n.flt.disconnect();
        if (n.hiTrim)  n.hiTrim.disconnect();
        if (n.fxSend)  n.fxSend.disconnect();
      } catch(e){}
    }, 500);
  });
  setTimeout(() => {
    [_lfoNode, _breathLFO, _driftLFO].forEach(x => { try { x?.stop(); } catch(e){} });
    [_lfoNode, _lfoGain, _lfoDepthGain, _breathLFO, _breathGain, _breathDepthGain, _driftLFO, _driftDepth, masterGain]
      .forEach(x => { try { x?.disconnect(); } catch(e){} });
    if (analyser) { try { analyser.disconnect(); } catch(e){} }
    _lfoNode=_lfoGain=_lfoDepthGain=_breathLFO=_breathGain=_breathDepthGain=_driftLFO=_driftDepth=masterGain=analyser=null;
    PAIRS.forEach((_, i) => updateOrbUI(i));
    const mc = document.getElementById('vpc-p' + MASTER_IDX);
    if (mc) mc.style.boxShadow = '';
    ui('idle', 'Metatron immobile');
  }, 600);
}

/* ---------- 2.9 · MASTER TICK (RAF, bridé 30 fps, pausé si menu ouvert) ---------- */
let _glowFrame = 0, _lastTick = 0;
// L'UI doit céder au thread audio : on suspend tous les dessins quand un
// panneau/modal couvre l'écran (c'est ce qui affamait l'audio = craquement).
function _uiBusy() {
  return !!document.querySelector('.pan-left.open, .pan-right.open, #osc-modal.open');
}
function masterTick(ts) {
  masterRAF = requestAnimationFrame(masterTick);
  // Bride à ~30 fps (moitié de charge CPU, invisible à l'œil)
  if (ts && _lastTick && ts - _lastTick < 33) return;
  _lastTick = ts || 0;
  if (document.visibilityState === 'hidden') return;
  // Menu/modal ouvert → on ne dessine RIEN (priorité au son)
  if (_uiBusy()) return;

  metaAngle = (metaAngle + 0.006) % (Math.PI * 2);
  drawMetatron();
  if (!flowing || !analyser) return;

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

/* ---------- 2.9b · MINI-SYNTH : MOTEUR D'ONDE, ENVELOPPE, FILTRE ---------- */
function setOscEngine(id, key) {
  if (!OSC_ENGINES[key]) return;
  OSC_WAVES[id] = key;
  if (!flowing) return;
  PAIRS.forEach((p, i) => {
    if (p.pingala.id === id) { if (nodes[id]) { releaseOsc(nodes[id]); delete nodes[id]; } swapPingala(i); }
    else if (p.ida.id === id) { if (nodes[id]) { releaseOsc(nodes[id]); delete nodes[id]; } swapIda(i); }
  });
}
// Applique le même moteur aux deux oscillateurs d'une paire
function setPairEngine(i, key) {
  setOscEngine(PAIRS[i].pingala.id, key);
  setOscEngine(PAIRS[i].ida.id, key);
}
function setOscEnv(id, a, r) {
  const cur = OSC_ENV[id] || { a: 0, r: 0 };
  if (a != null) cur.a = Math.max(0, Math.min(4, parseFloat(a)));
  if (r != null) cur.r = Math.max(0, Math.min(6, parseFloat(r)));
  OSC_ENV[id] = cur;
}
function setPairEnv(i, a, r) { setOscEnv(PAIRS[i].pingala.id, a, r); setOscEnv(PAIRS[i].ida.id, a, r); }

/* ---------- 2.9c · PATCHBAY MODULAIRE PAR OSCILLATEUR (MiniBrute 2S) ---------- */
const _oscMods  = {};   // id → { lfo, r1, r2, rndSum, conns:{} }
const OSC_PATCH = {};   // id → { 'src:dest': level(0-3), _rate:Hz }
const PATCH_SRC   = ['lfo', 'rnd'];
const PATCH_DEST  = ['cutoff', 'pitch', 'pan', 'vol'];
const PATCH_SCALE = {
  cutoff: [0, 300, 900, 2400],   // Hz
  pitch:  [0, 50, 150, 400],     // cents
  pan:    [0, 0.3, 0.6, 0.95],
  vol:    [0, 0.03, 0.07, 0.12],
};
function _ensureOscMods(id) {
  if (_oscMods[id]) return _oscMods[id];
  const node = nodes[id]; if (!node) return null;
  const c = audioCtx();
  const lfo = c.createOscillator(); lfo.type='sine';
  lfo.frequency.value = (OSC_PATCH[id] && OSC_PATCH[id]._rate) || 0.4; lfo.start();
  const r1 = c.createOscillator(); r1.type='sine'; r1.frequency.value=0.07; r1.start();
  const r2 = c.createOscillator(); r2.type='sine'; r2.frequency.value=0.11; r2.start();
  const rndSum = c.createGain(); rndSum.gain.value=0.5; r1.connect(rndSum); r2.connect(rndSum);
  _oscMods[id] = { lfo, r1, r2, rndSum, conns:{} };
  return _oscMods[id];
}
function setOscPatch(id, src, dest, level) {
  OSC_PATCH[id] = OSC_PATCH[id] || {};
  const key = src + ':' + dest;
  OSC_PATCH[id][key] = level;
  const node = nodes[id]; if (!node) return;
  const mods = _ensureOscMods(id); if (!mods) return;
  const c = audioCtx();
  if (mods.conns[key]) { try { mods.conns[key].disconnect(); } catch(e) {} delete mods.conns[key]; }
  if (!level) return;
  const scale = (PATCH_SCALE[dest] || [0])[level] || 0;
  const dg = c.createGain(); dg.gain.value = scale;
  (src === 'lfo' ? mods.lfo : mods.rndSum).connect(dg);
  if (dest === 'pitch') (node.subs || []).forEach(s => { try { dg.connect(s.osc.detune); } catch(e) {} });
  else if (dest === 'cutoff' && node.flt) dg.connect(node.flt.frequency);
  else if (dest === 'pan'    && node.p)   dg.connect(node.p.pan);
  else if (dest === 'vol'    && node.g)   dg.connect(node.g.gain);
  mods.conns[key] = dg;
}
function setOscLfoRate(id, hz) {
  OSC_PATCH[id] = OSC_PATCH[id] || {};
  OSC_PATCH[id]._rate = Math.max(0.02, Math.min(36, parseFloat(hz)));
  const m = _oscMods[id]; if (m) m.lfo.frequency.setTargetAtTime(OSC_PATCH[id]._rate, aNow(), 0.05);
}
function _reapplyOscPatch(id) {
  const data = OSC_PATCH[id]; if (!data) return;
  Object.keys(data).forEach(key => {
    if (key === '_rate') return;
    const [src, dest] = key.split(':');
    if (data[key]) setOscPatch(id, src, dest, data[key]);
  });
}
function clearOscMods(id) {
  const m = _oscMods[id]; if (!m) return;
  try { m.lfo.stop(); m.r1.stop(); m.r2.stop(); } catch(e) {}
  Object.values(m.conns).forEach(g => { try { g.disconnect(); } catch(e) {} });
  try { m.lfo.disconnect(); m.rndSum.disconnect(); } catch(e) {}
  delete _oscMods[id];
}
// Patch appliqué aux deux oscillateurs d'une paire
function setPairPatch(i, src, dest, level) {
  setOscPatch(PAIRS[i].pingala.id, src, dest, level);
  setOscPatch(PAIRS[i].ida.id, src, dest, level);
}
function setPairLfoRate(i, hz) { setOscLfoRate(PAIRS[i].pingala.id, hz); setOscLfoRate(PAIRS[i].ida.id, hz); }

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
