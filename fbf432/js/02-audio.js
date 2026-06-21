/* ═══════════════════════════════════════════
   02-audio.js — Moteur audio, FX chain, Flow
   ═══════════════════════════════════════════ */

const swapTimers = {};
let nodes = {}, masterGain = null, analyser = null;

let limiter = null;
let eqLow = null, eqMid = null, eqHigh = null;
let masterDelay = null, masterReverb = null, pingPong = null, masterGlue = null;
let chorus = null, compressor = null;
const LFO_STATE = {on:false, rate:.25, depth:.08};
let _lfoNode = null, _lfoGain = null;  // LFO natif Tone.js (audio thread)
let _btKeepalive = null;               // oscillateur silencieux — maintient le stream A2DP actif
let _busLP=null, _filtLFO=null, _fxLFO=null;  // LFO filtre + LFO FX intensité
let _fadeDur = 2;
let metaAngle = 0, masterRAF = null;

// ── Bande aiguë 432–648 Hz : HPF (~420) + volume −25 % (comme Omcha396) ──
function applyHiBand(node, freq) {
  if (!node || !node.hpf || !node.trim) return;
  const hi = freq > 432;
  try {
    node.hpf.frequency.rampTo(hi ? 420 : 20, 0.05);
    node.trim.gain.rampTo(hi ? 0.75 : 1.0, 0.08);
  } catch(e) {}
}

// ── Oscillateurs ─────────────────────────────────────────────
function buildOsc(id, freq, vol, pan) {
  const p   = new Tone.Panner(pan);
  const o   = new Tone.Oscillator({ frequency: safeF(freq), type: 'sine' });
  const hpf = new Tone.Filter({ type: 'highpass', frequency: 20, Q: 0.707 });
  const trim = new Tone.Gain(1);
  const g   = new Tone.Gain(0);
  // o → pan → HPF → trim(−25% si aigu) → gain → master
  o.connect(p); p.connect(hpf); hpf.connect(trim); trim.connect(g); g.connect(masterGain);
  o.start();
  const node = { o, g, p, hpf, trim };
  applyHiBand(node, safeF(freq));
  if (!mutedOscs[id] && vol > 0) {
    const now = Tone.now();
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0, now);
    g.gain.setTargetAtTime(vol, now, FADE / 5);
  }
  return node;
}

function tuneOsc(id, freq) {
  const node = nodes[id]; if (!node) return;
  try {
    const f = safeF(freq), now = Tone.now();
    node.o.frequency.cancelScheduledValues(now);
    node.o.frequency.setValueAtTime(node.o.frequency.value, now);
    node.o.frequency.exponentialRampToValueAtTime(Math.max(1, f), now + TUNE_T);
    applyHiBand(node, f);
  } catch(e) {}
}

function releaseOsc(node) {
  try {
    const now = Tone.now();
    node.g.gain.cancelScheduledValues(now);
    node.g.gain.setValueAtTime(node.g.gain.value, now);
    node.g.gain.setTargetAtTime(0, now, FADE / 5);
    node.o.stop(now + FADE + 0.1);
  } catch(e) {}
  setTimeout(() => {
    ['o','g','p','hpf','trim'].forEach(k => { try { node[k]?.dispose?.(); } catch(e){} });
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
  updatePairUI(i);
}
function swapPDebounced(i) { clearTimeout(swapTimers['p'+i]); swapTimers['p'+i] = setTimeout(() => swapPingala(i), 380); }
function swapIDebounced(i) { clearTimeout(swapTimers['i'+i]); swapTimers['i'+i] = setTimeout(() => swapIda(i), 380); }

function safeRamp(gainParam, target, duration) {
  const now = Tone.now();
  gainParam.cancelScheduledValues(now);
  gainParam.setValueAtTime(gainParam.value, now);
  gainParam.setTargetAtTime(target, now, Math.max(0.01, duration / 5));
}

// ── FX Chain (créée une seule fois) ──────────────────────────
function initFXChain() {
  if (eqLow) return;
  eqLow       = new Tone.Filter({ type: 'lowshelf',  frequency: 200,  Q: 1, gain: 0 });
  eqMid       = new Tone.Filter({ type: 'peaking',   frequency: 1000, Q: 1, gain: 0 });
  eqHigh      = new Tone.Filter({ type: 'highshelf', frequency: 5000, Q: 1, gain: 0 });
  chorus      = new Tone.Chorus({ frequency: 0.8, delayTime: 3.5, depth: 0, wet: 1 }).start();
  compressor  = new Tone.Compressor({ threshold: -24, ratio: 4, attack: 0.02, release: 0.25 });
  // Glue de bus (cohésion douce — comme Omcha396), toujours actif.
  masterGlue   = new Tone.Compressor({ threshold: -18, ratio: 2, knee: 6, attack: 0.05, release: 0.3 });
  masterDelay  = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.3, wet: 0 });
  // Ping-pong stéréo (disponible, wet pilotable) — spatialisation Omcha396.
  pingPong     = new Tone.PingPongDelay({ delayTime: 0.25, feedback: 0.3, wet: 0 });
  masterReverb = new Tone.Reverb({ decay: 1.5, preDelay: 0.05, wet: 0 });
  limiter      = new Tone.Limiter(-1.5).toDestination();
  // Filtre de bus (lowpass) + LFOs filtre/FX
  _busLP   = new Tone.Filter({ type:'lowpass', frequency:18000, Q:0.6 });
  _filtLFO = new Tone.LFO({ frequency:0.1, min:500,  max:16000, type:'sine' }).start();
  _fxLFO   = new Tone.LFO({ frequency:0.12, min:0,   max:0.5,   type:'sine' }).start();
  // Réverbe à convolution NON inline par défaut (off) : elle convolue en
  // permanence sinon = gros coût CPU mobile → underrun BT. On la branche
  // seulement quand wet > 0 (voir _setReverbActive).
  eqLow.chain(eqMid, eqHigh, _busLP, chorus, compressor, masterGlue, masterDelay, pingPong, limiter);
}

// Branche/débranche la réverbe selon qu'elle est utilisée (anti-craquement BT).
let _reverbActive = false;
function _setReverbActive(on) {
  if (!masterReverb || !pingPong || !limiter || on === _reverbActive) return;
  try {
    if (on) {
      pingPong.disconnect(limiter);
      pingPong.connect(masterReverb);
      masterReverb.connect(limiter);
    } else {
      pingPong.disconnect(masterReverb);
      try { masterReverb.disconnect(limiter); } catch(e) {}
      pingPong.connect(limiter);
    }
    _reverbActive = on;
  } catch(e) {}
}

// Espaces de réverbe spatiale
const REVERB_SPACES = {
  sec:        { decay: 0.4,  preDelay: 0.01 },
  grotte:     { decay: 2.8,  preDelay: 0.08 },
  cathedrale: { decay: 5.5,  preDelay: 0.15 },
  cosmos:     { decay: 14.0, preDelay: 0.40 }
};
async function setReverbSpace(name) {
  const s = REVERB_SPACES[name]; if (!s || !masterReverb) return;
  masterReverb.decay = s.decay; masterReverb.preDelay = s.preDelay;
  try { await masterReverb.generate(); } catch(e) {}
  const sl = document.getElementById('reverbWet');
  if (sl && parseFloat(sl.value) < 0.05) { sl.value = 0.32; updateFX('reverbWet', 0.32); }
}

function setFadeDur(v) {
  _fadeDur = Math.max(0.5, Math.min(15, parseFloat(v)));
  const el = document.getElementById('sv-fade'); if (el) el.textContent = _fadeDur.toFixed(1) + 's';
}

function lfoToggle(on) {
  LFO_STATE.on = on;
  if (!_lfoNode || !_lfoGain) return;
  if (on) {
    _lfoNode.connect(_lfoGain.gain);
  } else {
    try { _lfoNode.disconnect(); } catch(e) {}
    _lfoGain.gain.setTargetAtTime(1, Tone.now(), 0.1);
  }
}
function lfoSet(param, v) {
  LFO_STATE[param] = parseFloat(v);
  if (_lfoNode) {
    if (param === 'rate')  _lfoNode.frequency.value = LFO_STATE.rate;
    if (param === 'depth') { _lfoNode.min = 1 - LFO_STATE.depth; _lfoNode.max = 1 + LFO_STATE.depth; }
  }
  const el = document.getElementById('sv-lfo-' + param); if (el) el.textContent = parseFloat(v).toFixed(2);
}

// ── LFO filtre (timbre) & LFO FX (intensité) ──
function filtLfoToggle(on){ if(!_filtLFO||!_busLP)return; if(on){try{_filtLFO.connect(_busLP.frequency);}catch(e){}} else {try{_filtLFO.disconnect();}catch(e){} try{_busLP.frequency.rampTo(18000,0.2);}catch(e){}} }
function filtLfoRate(v){ if(_filtLFO)try{_filtLFO.frequency.value=parseFloat(v);}catch(e){} }
function fxLfoToggle(on){ if(!_fxLFO||!masterDelay)return; if(on){try{_fxLFO.connect(masterDelay.wet);}catch(e){}} else {try{_fxLFO.disconnect();}catch(e){}} }
function fxLfoRate(v){ if(_fxLFO)try{_fxLFO.frequency.value=parseFloat(v);}catch(e){} }

function _startBTKeepalive() {
  if (_btKeepalive) return;
  try {
    const ctx = Tone.context.rawContext;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(ctx.destination);
    src.start();
    _btKeepalive = src;
  } catch(e) {}
}

function setChorusDepth(v) { if (chorus) try { chorus.depth = parseFloat(v); } catch(e) {} }
function setChorusRate(v)  { if (chorus) try { chorus.frequency.value = parseFloat(v); } catch(e) {} }
function setCompThresh(v)  { if (compressor) try { compressor.threshold.value = parseFloat(v); } catch(e) {} }
function setCompRatio(v)   { if (compressor) try { compressor.ratio.value = parseFloat(v); } catch(e) {} }

function playBell() {
  try {
    if (Tone.context.state !== 'running') return;
    const b = new Tone.Synth({ oscillator:{type:'sine'}, envelope:{attack:.001, decay:3, sustain:.1, release:4} }).toDestination();
    b.triggerAttackRelease(432, '8n', Tone.now());
    setTimeout(() => { try { b.dispose(); } catch(e) {} }, 9000);
  } catch(e) {}
}

// ── Start / Stop ──────────────────────────────────────────────
let flowing = false;

async function startFlow() {
  ui('idle', '✦ Éveil du Metatron…');
  try {
    await Tone.start();
    if (Tone.context.state !== 'running') await Tone.context.resume();
    _startBTKeepalive();
    initFXChain();
    analyser   = new Tone.Analyser('waveform', 256);
    masterGain = new Tone.Gain(0);
    _lfoGain   = new Tone.Gain(1);
    const _now = Tone.now();
    masterGain.gain.setValueAtTime(0, _now);
    masterGain.gain.setTargetAtTime(masterVol, _now, _fadeDur / 3);
    masterGain.connect(_lfoGain);
    _lfoGain.connect(eqLow);
    masterGain.connect(analyser);
    // LFO natif Tone.js — fonctionne dans l'audio thread, zéro commandes JS
    _lfoNode = new Tone.LFO({ frequency: LFO_STATE.rate, min: 1 - LFO_STATE.depth, max: 1 + LFO_STATE.depth, type: 'sine' }).start();
    if (LFO_STATE.on) _lfoNode.connect(_lfoGain.gain);
    flowing = true;
    // APK Android : empêche la veille CPU/écran pendant le flux (anti-throttle
    // Doze → moins de craquement BT). Ignoré sur le web (Capacitor absent).
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
  if (progRunning) stopProgression();
  Object.keys(swapTimers).forEach(k => { clearTimeout(swapTimers[k]); delete swapTimers[k]; });
  try {
    if (masterGain) {
      const _t = Tone.now();
      masterGain.gain.cancelScheduledValues(_t);
      masterGain.gain.setTargetAtTime(0, _t, _fadeDur / 8);
    }
  } catch(e) {}
  const nodesCopy = {...nodes};
  nodes = {};
  flowing = false;
  Object.values(nodesCopy).forEach(n => {
    if (!n) return;
    try {
      const _t = Tone.now();
      n.g.gain.cancelScheduledValues(_t);
      n.g.gain.setTargetAtTime(0, _t, 0.05);
      n.o.stop(_t + 0.3);
    } catch(e) {}
    setTimeout(() => { ['o','g','p','hpf','trim'].forEach(k => { try { n[k]?.dispose?.(); } catch(e){} }); }, 500);
  });
  setTimeout(() => {
    [_lfoNode, _lfoGain, masterGain, analyser].forEach(x => {
      try { x?.disconnect(); } catch(e){}
      try { x?.dispose?.(); } catch(e){}
    });
    _lfoNode = null; _lfoGain = null; masterGain = null; analyser = null;
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
  // LFO géré nativement par Tone.LFO — aucun traitement JS ici
  if (!flowing || !analyser || document.visibilityState === 'hidden') return;
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
