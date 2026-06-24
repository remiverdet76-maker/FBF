/* ═══════════════════════════════════════════════════════════════════
   ChaVibe Engine — jeu évolutif harmonieux accompagnant Omcha396
   ─────────────────────────────────────────────────────────────────
   • Samples classés par thème via samples/manifest.json
   • Synthèse intégrée (voix, drones) quand aucun sample n'est chargé
   • Spirale 72 s : montée douce → plateau → pic → dissolution
   • Auto-gain RMS → -20 dBFS + placement stéréo par zone
   • Scheduler harmonique : préfère les samples en accord avec masterFreq
   • Reverb ConvolutionReverb générée UNE SEULE FOIS à l'init (zéro craquement)

   API globale :
     ChaVibe.init()
     ChaVibe.start() / stop()
     ChaVibe.setIntensity(0..9.9)
     ChaVibe.setThemes(['nature','voix',...])
     ChaVibe.setEnabled(bool)
     ChaVibe.setOutputVol(0..1)
     ChaVibe.loadManifest(url?)   → Promise
     ChaVibe.playing / intensity / themes / enabled
   ═══════════════════════════════════════════════════════════════════ */

const ChaVibe = (() => {
  'use strict';

  // ── Durée de la spirale macro (secondes) ─────────────────────────
  const WAVE_DUR = 72;

  // ── Zones stéréo prédéfinies ──────────────────────────────────────
  // Principe : les oscillateurs Omcha occupent ±1.0 (hard pan)
  // ChaVibe remplit le champ intérieur et wide sans empiéter
  const ZONE = {
    center: ()  => (Math.random() - 0.5) * 0.18,
    left:   ()  => -(0.22 + Math.random() * 0.45),
    right:  ()  =>  (0.22 + Math.random() * 0.45),
    wide:   ()  => (Math.random() < 0.5 ? -1 : 1) * (0.52 + Math.random() * 0.38),
    spread: ()  => (Math.random() - 0.5) * 0.88,
    auto:   (hz) => {
      // Log : 54 Hz → centre, 486 Hz → wide ±0.82
      const n = Math.log2(Math.max(54, Math.min(4000, hz)) / 54) / Math.log2(486 / 54);
      return (Math.random() < 0.5 ? -1 : 1) * Math.min(0.88, n * 0.82);
    },
  };

  // ── Synthèse de secours — toujours disponible même sans manifest ──
  const SYNTH_POOL = [
    { id:'fb_throat',   file:null, synthType:'throat',   dominantHz:108, stereoZone:'left'   },
    { id:'fb_angelic',  file:null, synthType:'angelic',  dominantHz:324, stereoZone:'right'  },
    { id:'fb_tibetan',  file:null, synthType:'tibetan',  dominantHz:72,  stereoZone:'center' },
    { id:'fb_harmonic', file:null, synthType:'harmonic', dominantHz:216, stereoZone:'spread' },
    { id:'fb_whisper',  file:null, synthType:'whisper',  dominantHz:800, stereoZone:'wide'   },
    { id:'fb_drone',    file:null, synthType:'drone',    dominantHz:162, stereoZone:'spread' },
  ];

  // ── État interne ─────────────────────────────────────────────────
  let _AC = null, _outG = null, _comp = null, _rvNode = null, _rvWet = null, _rvDry = null;
  let _ready = false, _initing = null;
  let _playing = false, _enabled = true, _sched = null;
  let _intensity = 5.0;
  let _themes = new Set(['nature', 'voix']);
  let _manifest = null;
  let _buffers = {};  // id → { buf: AudioBuffer, meta: { rmsGain, hz } }
  let _loading = {};  // id → Promise
  let _recent  = [];  // ids récents (variété)
  let _waveT0  = 0;   // référence temps spiral

  // ── Contexte audio partagé ────────────────────────────────────────
  function _ctx() {
    if (_AC) return _AC;
    _AC = window.AC || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    window.AC = _AC;
    return _AC;
  }

  // ── Spirale 72 s ─ 4 phases ──────────────────────────────────────
  // t ∈ [0,1] → amplitude ∈ [0.38, 1.0]
  // Phase 1 : montée douce          [0.00 → 0.28]
  // Phase 2 : plateau animé         [0.28 → 0.62]
  // Phase 3 : pic progressif        [0.62 → 0.82]
  // Phase 4 : dissolution           [0.82 → 1.00]
  function _wave() {
    const t = (((_ctx().currentTime - _waveT0) % WAVE_DUR) + WAVE_DUR) % WAVE_DUR / WAVE_DUR;
    if (t < 0.28) return 0.38 + 0.52 * _ss(0.00, 0.28, t);
    if (t < 0.62) return 0.86 + 0.11 * Math.sin(t * Math.PI * 5.0);
    if (t < 0.82) return 0.90 + 0.10 * _ss(0.62, 0.82, t);
    return 1.00 - 0.62 * _ss(0.82, 1.00, t);
  }
  function _ss(lo, hi, t) { const x = (t - lo) / (hi - lo); return x * x * (3 - 2 * x); }

  // ── Auto-gain : RMS → target -20 dBFS ────────────────────────────
  function _analyzeBuffer(buf) {
    const d   = buf.getChannelData(0);
    const sr  = buf.sampleRate;
    const len = Math.min(d.length, sr * 3);
    let rms = 0;
    for (let i = 0; i < len; i++) rms += d[i] * d[i];
    rms = Math.sqrt(rms / len);
    const rmsGain = rms > 1e-4 ? Math.min(5.0, 0.10 / rms) : 1.0;

    // Fréquence dominante approchée (taux de franchissement de zéro)
    let cross = 0;
    for (let i = 1; i < len; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) cross++;
    const hz = Math.max(54, Math.min(3000, (cross / 2) / (len / sr)));
    return { rmsGain, hz };
  }

  // ── IR de reverb — générée UNE SEULE FOIS à l'init ───────────────
  // décroissance exponentielle lisse → aucun craquement possible
  function _makeIR(c, decay, pre) {
    decay = decay || 2.8; pre = pre || 0.06;
    const sr  = c.sampleRate;
    const len = Math.floor(sr * (pre + decay));
    const pd  = Math.floor(sr * pre);
    const ir  = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = pd; i < len; i++) {
        const t = (i - pd) / (sr * decay);
        d[i] = (Math.random() * 2 - 1) * Math.exp(-3.6 * t);
      }
    }
    return ir;
  }

  // ── Destination : FX chain Omcha si dispo, sinon direct ──────────
  function _dest(c) {
    try { if (typeof eqLow !== 'undefined' && eqLow) return eqLow; } catch(e) {}
    return c.destination;
  }

  // ── Init du graphe audio ──────────────────────────────────────────
  async function init() {
    if (_ready)   return true;
    if (_initing) return _initing;
    _initing = (async () => {
      const c = _ctx();
      if (c.state !== 'running') try { await c.resume(); } catch(e) {}

      _outG = c.createGain();
      _outG.gain.value = 0.52;

      // Compresseur léger : évite que les samples dépassent les oscillateurs
      _comp = c.createDynamicsCompressor();
      _comp.threshold.value = -22; _comp.knee.value = 8;
      _comp.ratio.value = 3; _comp.attack.value = 0.06; _comp.release.value = 0.50;

      // Reverb fixe (pas de re-génération IR = zéro craquement)
      _rvNode = c.createConvolver(); _rvNode.buffer = _makeIR(c);
      _rvWet  = c.createGain(); _rvWet.gain.value = 0.28;
      _rvDry  = c.createGain(); _rvDry.gain.value = 0.76;

      const dest = _dest(c);
      _outG.connect(_comp);
      _comp.connect(_rvDry);   _rvDry.connect(dest);
      _comp.connect(_rvNode);  _rvNode.connect(_rvWet); _rvWet.connect(dest);

      _ready = true; return true;
    })();
    return _initing;
  }

  // ── Chargement du manifest ────────────────────────────────────────
  async function loadManifest(url) {
    try {
      const base = window.ChaVibe_base || '';
      const r = await fetch((url || base + 'samples/manifest.json'));
      _manifest = await r.json();
    } catch(e) { _manifest = { themes: {} }; }
    return _manifest;
  }

  // ── Chargement paresseux d'un sample ─────────────────────────────
  async function _getBuffer(entry) {
    if (_buffers[entry.id]) return _buffers[entry.id];
    if (_loading[entry.id]) return _loading[entry.id];
    if (!entry.file) return null;
    _loading[entry.id] = (async () => {
      try {
        const base = window.ChaVibe_base || '';
        const res = await fetch(base + 'samples/' + entry.file);
        if (!res.ok) return null;
        const buf = await _ctx().decodeAudioData(await res.arrayBuffer());
        const meta = _analyzeBuffer(buf);
        // Les valeurs du manifest écrasent l'analyse auto
        if (entry.dominantHz != null) meta.hz     = entry.dominantHz;
        if (entry.rmsNorm    != null) meta.rmsGain = entry.rmsNorm;
        _buffers[entry.id] = { buf, meta };
        return _buffers[entry.id];
      } catch(e) { return null; }
    })();
    return _loading[entry.id];
  }

  // ── Score harmonique (proximité avec masterFreq) ──────────────────
  function _hScore(hz) {
    const mf = (typeof masterFreq !== 'undefined' ? masterFreq : 252);
    const ratios = [1, 2, 3/2, 4/3, 5/4, 9/8, 3/4, 5/3, 16/9, 1/2, 1/3];
    let best = 99;
    for (const r of ratios) {
      const d = Math.abs(Math.log2(Math.max(1, hz) / Math.max(1, mf * r)));
      if (d < best) best = d;
    }
    return Math.max(0, 1 - best * 2.2);
  }

  // ── Sélection pondérée d'une entrée ──────────────────────────────
  function _pick() {
    // Pool manifest (thèmes actifs) + toujours le pool de synthèse de secours
    const pool = [...SYNTH_POOL];
    if (_manifest) {
      for (const th of _themes) {
        const t = _manifest.themes[th];
        if (t && t.samples) t.samples.forEach(s => pool.push(s));
      }
    }

    const weights = pool.map(e => {
      const harmony = 0.30 + 0.70 * _hScore(e.dominantHz || 200);
      const fresh   = _recent.includes(e.id) ? 0.20 : 1.0;
      // Légère préférence pour les samples réels (plus riches) quand disponibles
      const pref    = e.file ? 1.25 : 1.0;
      return harmony * fresh * pref;
    });
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < pool.length; i++) { if ((r -= weights[i]) <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  // ── Spawn sample réel ─────────────────────────────────────────────
  async function _spawnSample(entry) {
    const loaded = await _getBuffer(entry);
    if (!loaded) { _spawnSynth(entry); return; }

    const c = _ctx(), { buf, meta } = loaded;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = !!entry.loop;

    const wave   = _wave();
    const vol    = meta.rmsGain * (0.22 + 0.65 * (_intensity / 9.9)) * wave;
    const g      = c.createGain(); g.gain.value = 0;
    const pan    = c.createStereoPanner();
    const zone   = entry.stereoZone || 'auto';
    pan.pan.value = (ZONE[zone] || ZONE.auto)(meta.hz);

    src.connect(g); g.connect(pan); pan.connect(_outG);

    const now   = c.currentTime;
    const dur   = entry.loop ? (8 + Math.random() * 12) : Math.min(buf.duration, 24);
    const endFd = now + dur - 2.0;

    g.gain.setValueAtTime(0, now);
    g.gain.setTargetAtTime(vol, now, 0.9);
    g.gain.setValueAtTime(vol, endFd);
    g.gain.setTargetAtTime(0, endFd, 1.1);
    src.start(now); src.stop(now + dur + 1.2);
    src.onended = () => { try { src.disconnect(); g.disconnect(); pan.disconnect(); } catch(e) {} };

    _recent = [entry.id, ..._recent].slice(0, 6);
  }

  // ── Dispatch synthèse ─────────────────────────────────────────────
  function _spawnSynth(entry) {
    const c  = _ctx();
    const mf = (typeof masterFreq !== 'undefined' ? masterFreq : 252);
    switch (entry.synthType || 'drone') {
      case 'throat':   _vThroat(c, mf, entry);   break;
      case 'angelic':  _vAngelic(c, mf, entry);  break;
      case 'tibetan':  _vTibetan(c, mf, entry);  break;
      case 'harmonic': _vHarmonic(c, mf, entry); break;
      case 'whisper':  _vWhisper(c, mf, entry);  break;
      default:         _vDrone(c, mf, entry);    break;
    }
  }

  // ── Utilitaire commun : masterGain + pan + fade in/out ───────────
  function _voice(c, dur, panVal, volMult) {
    const wave = _wave();
    const vol  = (volMult || 0.45) * (_intensity / 9.9) * wave;
    const g    = c.createGain(); g.gain.value = 0;
    const pan  = c.createStereoPanner(); pan.pan.value = panVal;
    g.connect(pan); pan.connect(_outG);
    const now   = c.currentTime;
    const endFd = now + dur - 2.2;
    g.gain.setValueAtTime(0, now);
    g.gain.setTargetAtTime(vol, now, 1.2);
    g.gain.setValueAtTime(vol, endFd);
    g.gain.setTargetAtTime(0, endFd, 1.4);
    return { g, pan, now, stop: now + dur, vol };
  }

  function _cleanup(nodes, stopAt) {
    nodes.forEach(n => { try { n.stop && n.stop(stopAt + 1); } catch(e) {} });
    nodes[0].onended = () => { nodes.forEach(n => { try { n.disconnect(); } catch(e) {} }); };
  }

  // ── Chant de gorge — Khoomei ──────────────────────────────────────
  // Oscillateurs harmoniques → formants → master
  function _vThroat(c, mf, entry) {
    const hz  = Math.max(54, Math.min(108, mf / Math.max(1, Math.round(mf / 81))));
    const dur = 11 + Math.random() * 9;
    const pan = entry.stereoZone === 'right' ? (0.18 + Math.random() * 0.30) : -(0.18 + Math.random() * 0.30);
    const { g, now, stop } = _voice(c, dur, pan, 0.55);

    // Fondamentale sawtooh + harmoniques sine
    const specs = [[1, 'sawtooth', 0.9], [2.005, 'sine', 0.50], [3.01, 'sine', 0.30], [4.018, 'sine', 0.16]];
    const oscs  = specs.map(([r, type, amp]) => {
      const o  = c.createOscillator(); o.type = type; o.frequency.value = hz * r;
      const og = c.createGain(); og.gain.value = amp * 0.065;
      o.connect(og); return { o, og };
    });

    // Formants en cascade (khoomei : F1 = vocalisation basse, F2 = harmoniques sélectifs)
    const fmts = [[270, 6, 8], [900, 5, 7], [2400, 4, 5], [3400, 3, 3]].map(([f, Q, db]) => {
      const bq = c.createBiquadFilter(); bq.type = 'peaking';
      bq.frequency.value = f; bq.Q.value = Q; bq.gain.value = db; return bq;
    });

    // LFO respiration très lente
    const breath  = c.createOscillator(); breath.type = 'sine'; breath.frequency.value = 0.08 + Math.random() * 0.04;
    const breathG = c.createGain(); breathG.gain.value = 0.22; breath.connect(breathG); breathG.connect(g.gain);

    // Câblage : chaque osc → fmts[0] (ça somme), fmts cascade → g
    oscs.forEach(({ og }) => og.connect(fmts[0]));
    for (let i = 0; i < fmts.length - 1; i++) fmts[i].connect(fmts[i + 1]);
    fmts[fmts.length - 1].connect(g);

    oscs.forEach(({ o }) => o.start(now)); breath.start(now);
    _cleanup([...oscs.map(x => x.o), breath], stop);
  }

  // ── Voix angélique ─────────────────────────────────────────────────
  function _vAngelic(c, mf, entry) {
    const hz   = Math.max(162, Math.min(486, mf));
    const dur  = 9 + Math.random() * 9;
    const side = Math.random() < 0.5 ? -1 : 1;
    const pan  = side * (0.58 + Math.random() * 0.28);
    const { g, now, stop } = _voice(c, dur, pan, 0.42);

    // Cluster de sines légèrement désaccordées → son de voix diffus
    const detunes = [-8, -3, 0, 3, 8, 14];
    const oscs = detunes.map(d => {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.value = hz * Math.pow(2, d / 1200);
      const og = c.createGain(); og.gain.value = 0.014;
      o.connect(og); og.connect(g); return { o, og };
    });

    // Vibrato doux
    const vib  = c.createOscillator(); vib.type = 'sine'; vib.frequency.value = 3.1 + Math.random() * 0.4;
    const vibG = c.createGain(); vibG.gain.value = hz * 0.0035;
    vib.connect(vibG); oscs.forEach(({ o }) => vibG.connect(o.frequency));

    // HPF : retire les fréquences indésirables sous 400 Hz
    const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 400; hpf.Q.value = 0.5;
    // Rebrancher via hpf : chaque og → hpf → g
    oscs.forEach(({ og }) => { og.disconnect(g); og.connect(hpf); });
    hpf.connect(g);

    oscs.forEach(({ o }) => o.start(now)); vib.start(now);
    _cleanup([...oscs.map(x => x.o), vib], stop);
  }

  // ── Drone tibétain ─────────────────────────────────────────────────
  function _vTibetan(c, mf, _entry) {
    const hz  = Math.max(54, Math.min(108, mf / Math.max(2, Math.round(mf / 81))));
    const dur = 13 + Math.random() * 11;
    const { g, now, stop } = _voice(c, dur, (Math.random() - 0.5) * 0.14, 0.58);

    const harmonics = [1, 2, 3, 5, 7, 9];
    const amps      = [1, 0.55, 0.38, 0.22, 0.14, 0.08];
    const oscs = harmonics.map((r, k) => {
      const o  = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz * r;
      const og = c.createGain(); og.gain.value = amps[k] * 0.07;
      o.connect(og); og.connect(g); return { o, og };
    });

    // Swell très lent (houle de la voix tibétaine)
    const swell  = c.createOscillator(); swell.type = 'sine'; swell.frequency.value = 0.048;
    const swellG = c.createGain(); swellG.gain.value = 0.16; swell.connect(swellG); swellG.connect(g.gain);

    oscs.forEach(({ o }) => o.start(now)); swell.start(now);
    _cleanup([...oscs.map(x => x.o), swell], stop);
  }

  // ── Voix harmonique / chorale ──────────────────────────────────────
  function _vHarmonic(c, mf, _entry) {
    const hz  = Math.max(108, Math.min(486, mf));
    const dur = 7 + Math.random() * 8;
    const { g, now, stop } = _voice(c, dur, (Math.random() - 0.5) * 0.7, 0.38);

    // Triade harmonique (fondamentale + quinte + octave légèrement désaccordés)
    const specs = [[1, -4], [3/2, 2], [2, -6], [5/4, 5]];
    const oscs = specs.map(([r, cents]) => {
      const o  = c.createOscillator(); o.type = 'sine';
      o.frequency.value = hz * r * Math.pow(2, cents / 1200);
      const og = c.createGain(); og.gain.value = 0.018;
      o.connect(og); og.connect(g); return { o, og };
    });

    // Crescendo très lent
    const env  = c.createOscillator(); env.type = 'sine'; env.frequency.value = 0.11;
    const envG = c.createGain(); envG.gain.value = 0.12; env.connect(envG); envG.connect(g.gain);

    oscs.forEach(({ o }) => o.start(now)); env.start(now);
    _cleanup([...oscs.map(x => x.o), env], stop);
  }

  // ── Chuchotement sacré ─────────────────────────────────────────────
  function _vWhisper(c, mf, _entry) {
    const hz  = Math.max(300, Math.min(2000, mf * 3));
    const dur = 5 + Math.random() * 7;
    const { g, now, stop } = _voice(c, dur, (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.3), 0.30);

    // Bruit filtré (simulation souffle / vent / chuchotement)
    const buf = c.createBuffer(1, c.sampleRate * Math.min(dur, 4), c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const bpf = c.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = hz; bpf.Q.value = 4;
    const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hz * 0.4; hpf.Q.value = 0.5;

    src.connect(bpf); bpf.connect(hpf); hpf.connect(g);
    src.start(now); src.stop(stop + 1);
    src.onended = () => { try { src.disconnect(); bpf.disconnect(); hpf.disconnect(); } catch(e) {} };
  }

  // ── Drone générique ───────────────────────────────────────────────
  function _vDrone(c, mf, _entry) {
    const hz  = Math.max(54, Math.min(486, mf * (Math.random() < 0.5 ? 1 : 0.5)));
    const dur = 7 + Math.random() * 9;
    const { g, now, stop } = _voice(c, dur, (Math.random() - 0.5) * 0.65, 0.35);
    const o  = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
    const og = c.createGain(); og.gain.value = 0.08;
    o.connect(og); og.connect(g); o.start(now);
    _cleanup([o], stop);
  }

  // ── Scheduler principal ───────────────────────────────────────────
  // Timing : intensité 0 → ~25s, intensité 5 → ~6s, intensité 9.9 → ~1.5s
  function _nextWait() {
    const t = _intensity / 9.9;
    const base = 1.5 + 23.5 * Math.pow(1 - t, 2.2);
    const wave = _wave();
    // La spirale 72s module légèrement le rythme (phase de pic = plus dense)
    const wMod = 0.7 + 0.6 * (1 - wave);
    return base * wMod * (0.75 + 0.5 * Math.random());
  }

  function _fireEntry() {
    const entry = _pick();
    if (!entry) return;
    if (entry.file) _spawnSample(entry).catch(() => _spawnSynth(entry));
    else            _spawnSynth(entry);
  }

  function _schedule() {
    if (!_playing) return;
    _fireEntry();
    _sched = setTimeout(_schedule, _nextWait() * 1000);
  }

  // ── API publique ──────────────────────────────────────────────────
  async function start() {
    if (!_enabled) return;
    await init();
    if (_playing) return;
    _playing = true;
    _waveT0  = _ctx().currentTime;
    _recent  = [];
    // Premier son immédiat (1.2 s après start pour laisser l'AC respirer)
    setTimeout(() => { if (_playing) _fireEntry(); }, 1200);
    // Puis scheduler régulier
    _sched = setTimeout(_schedule, _nextWait() * 1000);
  }

  function stop() {
    _playing = false;
    clearTimeout(_sched); _sched = null;
  }

  function setIntensity(v) {
    _intensity = Math.max(0, Math.min(9.9, parseFloat(v) || 0));
  }

  function setThemes(arr) {
    _themes = new Set(Array.isArray(arr) ? arr : [arr]);
  }

  function setEnabled(b) {
    _enabled = !!b;
    if (!_enabled && _playing) stop();
  }

  function setOutputVol(v) {
    if (!_outG) return;
    _outG.gain.setTargetAtTime(Math.max(0, Math.min(1, parseFloat(v) || 0)), _ctx().currentTime, 0.15);
  }

  function setReverbMix(wet) {
    if (!_rvWet || !_rvDry) return;
    const w = Math.max(0, Math.min(1, parseFloat(wet) || 0));
    const now = _ctx().currentTime;
    _rvWet.gain.setTargetAtTime(w * 0.38, now, 0.2);
    _rvDry.gain.setTargetAtTime(0.5 + (1 - w) * 0.38, now, 0.2);
  }

  return {
    init, start, stop, loadManifest,
    setIntensity, setThemes, setEnabled, setOutputVol, setReverbMix,
    get playing()   { return _playing; },
    get intensity() { return _intensity; },
    get themes()    { return [..._themes]; },
    get enabled()   { return _enabled; },
    get ready()     { return _ready; },
  };
})();

if (typeof window !== 'undefined') window.ChaVibe = ChaVibe;
