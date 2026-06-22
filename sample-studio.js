/* ═══════════════════════════════════════════════════════════════
   sample-studio.js — Voie « Sample / Studio » partagée (FBF 432 & Omcha 396)
   ───────────────────────────────────────────────────────────────
   Une piste audio À PART (bol + entrée micro) routée sur le même bus
   master DB4 (Allen & Heath) que les oscillateurs.

   Chaîne de la voie :
     [Bowl + Micro] → inGain → EQ 3 bandes (pré-mastering)
                    → premaster (fader + VU −36/0/+6 dB) → bus master (eqLow)

   EQ 3 bandes (grille 432) :
     Low    : lowshelf  144 Hz   (36–144)
     Medium : peaking   180 Hz   (144–216)
     High   : highshelf 216 Hz   (216–432)

   Fonctions clés :
     SampleStudio.init()              prépare la voie (idempotent)
     SampleStudio.buildUI(elId)       injecte l'UI dans un conteneur
     SampleStudio.setEQ(band,dB)      low|mid|high
     SampleStudio.setPremaster(dB)    −36 … +6 dB
     SampleStudio.micEnable/Disable() entrée directe (Zoom H1 32-bit float)
     SampleStudio.toggleAutoSync(on)  cale le bol sur la fréquence maître
     SampleStudio.recStart(fmt)/recStop()   wav | m4a, 48 kHz max def
   ═══════════════════════════════════════════════════════════════ */

window.SampleStudio = (function () {
  'use strict';

  let ctx = null, started = false;
  let inGain, eqL, eqM, eqH, preGain, vuAnalyser, out;
  let micStream = null, micSrc = null, micOn = false;
  let autoSync = false, autoSyncTimer = null;
  let _vuBuf = null, _vuRAF = null;
  let _premasterDb = 0;

  // Enregistrement
  let recWavNode = null, recWavChunksL = [], recWavChunksR = [], recWavLen = 0;
  let mediaRec = null, mediaChunks = [], recTap = null, msd = null;
  let recording = false, recFmt = 'wav', recStartT = 0;

  function _ctx() {
    if (window.AC) return window.AC;
    if (typeof audioCtx === 'function') return audioCtx();
    return new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
  }
  const _db2lin = (db) => Math.pow(10, db / 20);

  // ── Init de la voie (branchée sur le bus master DB4 si présent) ──
  function init() {
    if (started) return;
    ctx = _ctx();
    try { if (typeof initFXChain === 'function') initFXChain(); } catch (e) {}

    inGain = ctx.createGain(); inGain.gain.value = 1;

    eqL = ctx.createBiquadFilter(); eqL.type = 'lowshelf';  eqL.frequency.value = 144; eqL.gain.value = 0;
    eqM = ctx.createBiquadFilter(); eqM.type = 'peaking';   eqM.frequency.value = 180; eqM.Q.value = 2.5; eqM.gain.value = 0;
    eqH = ctx.createBiquadFilter(); eqH.type = 'highshelf'; eqH.frequency.value = 216; eqH.gain.value = 0;

    preGain = ctx.createGain(); preGain.gain.value = 1;
    vuAnalyser = ctx.createAnalyser(); vuAnalyser.fftSize = 1024;
    _vuBuf = new Float32Array(vuAnalyser.fftSize);
    out = ctx.createGain(); out.gain.value = 1;

    inGain.connect(eqL); eqL.connect(eqM); eqM.connect(eqH); eqH.connect(preGain);
    preGain.connect(vuAnalyser); preGain.connect(out);

    // Vers le bus master (entrée FX = eqLow). Sinon sortie directe.
    const bus = (typeof eqLow !== 'undefined' && eqLow) ? eqLow : ctx.destination;
    try { out.connect(bus); } catch (e) { out.connect(ctx.destination); }

    started = true;
    _vuLoop();
  }

  // Point d'entrée pour le moteur de bol (voir 08-bowl-engine _route).
  function inputNode() { init(); return inGain; }

  // ── Source : charge un sample depuis le stockage (mémoire) ──
  async function loadSampleFile(file) {
    if (!file || !window.Bowl) return;
    init();
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
    try {
      const url = URL.createObjectURL(file);
      await Bowl.loadSample('user_' + Date.now(), url);
      if (Bowl.start) Bowl.start();
      const el = document.getElementById('ss-src-info'); if (el) el.textContent = '✓ ' + file.name;
    } catch (e) { alert('Sample illisible : ' + (e && e.message ? e.message : e)); }
  }
  function bowlStart() { init(); if (window.Bowl && Bowl.start) Bowl.start(); }
  function bowlStop() { if (window.Bowl && Bowl.stop) Bowl.stop(); }

  // ── EQ 3 bandes (pré-mastering) ──
  function setEQ(band, dB) {
    init();
    const g = Math.max(-18, Math.min(18, parseFloat(dB) || 0));
    if (band === 'low'  && eqL) eqL.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
    if (band === 'mid'  && eqM) eqM.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
    if (band === 'high' && eqH) eqH.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
    const el = document.getElementById('ss-eq-' + band + '-val'); if (el) el.textContent = g.toFixed(1) + ' dB';
  }

  // ── Premaster (−36 … +6 dB) ──
  function setPremaster(dB) {
    init();
    _premasterDb = Math.max(-36, Math.min(6, parseFloat(dB) || 0));
    preGain.gain.setTargetAtTime(_db2lin(_premasterDb), ctx.currentTime, 0.03);
    const el = document.getElementById('ss-pre-val'); if (el) el.textContent = (_premasterDb >= 0 ? '+' : '') + _premasterDb.toFixed(1) + ' dB';
  }

  // ── VU-mètre (−36 / 0 / +6 dB) ──
  function _vuLoop() {
    if (_vuRAF) cancelAnimationFrame(_vuRAF);
    const tick = () => {
      _vuRAF = requestAnimationFrame(tick);
      if (!vuAnalyser) return;
      vuAnalyser.getFloatTimeDomainData(_vuBuf);
      let peak = 0;
      for (let i = 0; i < _vuBuf.length; i++) { const a = Math.abs(_vuBuf[i]); if (a > peak) peak = a; }
      const db = peak > 0 ? 20 * Math.log10(peak) : -120;
      const bar = document.getElementById('ss-vu-bar');
      const txt = document.getElementById('ss-vu-db');
      if (bar) {
        // échelle −36 → +6 (42 dB) en 0..100 %
        const pct = Math.max(0, Math.min(100, ((db + 36) / 42) * 100));
        bar.style.width = pct.toFixed(1) + '%';
        bar.style.background = db > 0 ? '#ff5a5a' : db > -6 ? '#ffd166' : '#56ffb0';
      }
      if (txt) txt.textContent = (db <= -120 ? '−∞' : (db >= 0 ? '+' : '') + db.toFixed(1)) + ' dB';
      // témoin enreg
      if (recording) {
        const r = document.getElementById('ss-rec-time');
        if (r) { const s = (ctx.currentTime - recStartT); r.textContent = '● ' + s.toFixed(1) + ' s'; }
      }
    };
    tick();
  }

  // ── Entrée micro directe (Zoom H1 — 32-bit float, sans traitement) ──
  async function micEnable() {
    init();
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          channelCount: 2, sampleRate: 48000
        }, video: false
      });
      micSrc = ctx.createMediaStreamSource(micStream);
      micSrc.connect(inGain);
      micOn = true;
      _setMicUI(true);
    } catch (e) {
      micOn = false; _setMicUI(false);
      alert('Entrée audio indisponible : ' + (e && e.message ? e.message : e));
    }
  }
  function micDisable() {
    try { micSrc && micSrc.disconnect(); } catch (e) {}
    try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    micSrc = null; micStream = null; micOn = false; _setMicUI(false);
  }
  function micToggle() { micOn ? micDisable() : micEnable(); }
  function _setMicUI(on) {
    const b = document.getElementById('ss-mic-btn');
    if (b) { b.textContent = on ? '🎙️ Micro ON' : '🎙️ Connecter micro'; b.classList.toggle('on', on); }
    const lab = document.getElementById('ss-mic-info');
    if (lab && on && micStream) {
      const tr = micStream.getAudioTracks()[0];
      const s = tr && tr.getSettings ? tr.getSettings() : {};
      lab.textContent = 'Entrée : ' + (tr ? tr.label : '—') + (s.sampleRate ? ' · ' + s.sampleRate + ' Hz' : '');
    } else if (lab && !on) lab.textContent = '';
  }

  // ── Auto-sync sur la fréquence maître (cale le fondamental du bol) ──
  function toggleAutoSync(on) {
    autoSync = !!on;
    if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
    if (autoSync) {
      const apply = () => {
        const f = (typeof masterFreq !== 'undefined') ? masterFreq : 216;
        if (window.Bowl && Bowl.setParams) Bowl.setParams({ syncFreq: f });
      };
      apply();
      autoSyncTimer = setInterval(apply, 500);
    } else if (window.Bowl && Bowl.setParams) {
      Bowl.setParams({ syncFreq: null });
    }
    const b = document.getElementById('ss-sync-btn');
    if (b) { b.textContent = autoSync ? 'Auto-sync maître : ON' : 'Auto-sync maître : OFF'; b.classList.toggle('on', autoSync); }
  }

  /* ── ENREGISTREMENT ─────────────────────────────────────────────
     Tap = sortie master (limiter) si présent, sinon la voie sample.   */
  function _tapNode() {
    return (typeof limiter !== 'undefined' && limiter) ? limiter : out;
  }

  // WAV 32-bit float via AudioWorklet (capture le thread audio, sans craquement).
  const _REC_WORKLET = `
  class SSRecorder extends AudioWorkletProcessor {
    process(inputs){
      const inp = inputs[0];
      if (inp && inp[0]) {
        const L = inp[0], R = inp[1] || inp[0];
        this.port.postMessage({ l: L.slice(0), r: R.slice(0) });
      }
      return true;
    }
  }
  registerProcessor('ss-recorder', SSRecorder);`;

  async function _recStartWav() {
    const url = URL.createObjectURL(new Blob([_REC_WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    recWavChunksL = []; recWavChunksR = []; recWavLen = 0;
    recWavNode = new AudioWorkletNode(ctx, 'ss-recorder', { numberOfInputs: 1, numberOfOutputs: 0 });
    recWavNode.port.onmessage = (e) => {
      recWavChunksL.push(e.data.l); recWavChunksR.push(e.data.r); recWavLen += e.data.l.length;
    };
    _tapNode().connect(recWavNode);
  }
  function _recStopWav() {
    try { _tapNode().disconnect(recWavNode); } catch (e) {}
    const sr = ctx.sampleRate;
    const L = _merge(recWavChunksL, recWavLen), R = _merge(recWavChunksR, recWavLen);
    const wav = _encodeWavFloat32(L, R, sr);
    _download(wav, 'wav', sr);
    recWavNode = null; recWavChunksL = []; recWavChunksR = [];
  }
  function _merge(chunks, len) {
    const o = new Float32Array(len); let p = 0;
    for (const c of chunks) { o.set(c, p); p += c.length; }
    return o;
  }
  // WAV PCM 32-bit float (format 3), entrelacé stéréo — définition maximale.
  function _encodeWavFloat32(L, R, sr) {
    const n = L.length, bytesPerSamp = 4, ch = 2;
    const dataLen = n * ch * bytesPerSamp;
    const buf = new ArrayBuffer(44 + dataLen);
    const dv = new DataView(buf);
    const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true); // 3 = IEEE float
    dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * ch * bytesPerSamp, true); dv.setUint16(32, ch * bytesPerSamp, true);
    dv.setUint16(34, 32, true);
    wstr(36, 'data'); dv.setUint32(40, dataLen, true);
    let off = 44;
    for (let i = 0; i < n; i++) { dv.setFloat32(off, L[i], true); off += 4; dv.setFloat32(off, R[i], true); off += 4; }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // M4A / fallback WebM via MediaRecorder sur un MediaStreamDestination.
  function _recStartMedia() {
    msd = ctx.createMediaStreamDestination();
    recTap = _tapNode(); recTap.connect(msd);
    const types = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    let mime = '';
    for (const t of types) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) { mime = t; break; } }
    mediaChunks = [];
    mediaRec = new MediaRecorder(msd.stream, mime ? { mimeType: mime, audioBitsPerSecond: 320000 } : undefined);
    mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) mediaChunks.push(e.data); };
    mediaRec.onstop = () => {
      const type = mediaRec.mimeType || 'audio/webm';
      const ext = type.indexOf('mp4') >= 0 ? 'm4a' : 'webm';
      _download(new Blob(mediaChunks, { type }), ext, ctx.sampleRate);
      try { recTap.disconnect(msd); } catch (e) {}
      msd = null; mediaRec = null;
    };
    mediaRec.start();
  }
  function _recStopMedia() { try { mediaRec && mediaRec.stop(); } catch (e) {} }

  async function recStart(fmt) {
    init();
    if (recording) return;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
    recFmt = (fmt === 'm4a') ? 'm4a' : 'wav';
    try {
      if (recFmt === 'wav') await _recStartWav(); else _recStartMedia();
      recording = true; recStartT = ctx.currentTime;
      _setRecUI(true);
    } catch (e) {
      recording = false; _setRecUI(false);
      alert('Enregistrement impossible : ' + (e && e.message ? e.message : e));
    }
  }
  function recStop() {
    if (!recording) return;
    recording = false;
    if (recFmt === 'wav') _recStopWav(); else _recStopMedia();
    _setRecUI(false);
  }
  function recToggle(fmt) { recording ? recStop() : recStart(fmt || _selFmt()); }
  function _selFmt() { const s = document.getElementById('ss-rec-fmt'); return s ? s.value : 'wav'; }
  function _setRecUI(on) {
    const b = document.getElementById('ss-rec-btn');
    if (b) { b.textContent = on ? '■ Stop' : '● Enregistrer'; b.classList.toggle('on', on); }
    const t = document.getElementById('ss-rec-time'); if (t && !on) t.textContent = '';
  }

  function _download(blob, ext, sr) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url; a.download = 'studio-432_' + sr + 'Hz_' + ts + '.' + ext;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
  }

  // ── UI : injectée dans un conteneur fourni par chaque app ──
  function buildUI(elId) {
    init();
    const box = document.getElementById(elId); if (!box) return;
    box.innerHTML = `
      <div class="ss-sec">
        <div class="ss-title">PISTE SAMPLE — bus master DB4</div>
        <div class="ss-sub">Bol + entrée directe, pré-mastering 3 bandes (36–144 / 144–216 / 216–432)</div>
      </div>
      <div class="ss-sec">
        <div class="ss-title" style="font-size:.66rem">SOURCE</div>
        <label class="ss-btn" style="display:block;text-align:center">📂 Charger un sample (mémoire)
          <input type="file" accept="audio/*" style="display:none" onchange="SampleStudio.loadSampleFile(this.files[0])"></label>
        <div id="ss-src-info" class="ss-sub"></div>
        <div style="display:flex;gap:.4rem;margin-top:.3rem">
          <button class="ss-btn" style="margin-top:0" onclick="SampleStudio.bowlStart()">▶ Jouer bol</button>
          <button class="ss-btn" style="margin-top:0" onclick="SampleStudio.bowlStop()">■ Stop bol</button>
        </div>
      </div>
      <div class="ss-sec ss-eq">
        <div class="ss-eqrow"><span>Low 144</span><input type="range" min="-18" max="18" step="0.5" value="0" oninput="SampleStudio.setEQ('low',this.value)"><span id="ss-eq-low-val">0.0 dB</span></div>
        <div class="ss-eqrow"><span>Mid 180</span><input type="range" min="-18" max="18" step="0.5" value="0" oninput="SampleStudio.setEQ('mid',this.value)"><span id="ss-eq-mid-val">0.0 dB</span></div>
        <div class="ss-eqrow"><span>High 216</span><input type="range" min="-18" max="18" step="0.5" value="0" oninput="SampleStudio.setEQ('high',this.value)"><span id="ss-eq-high-val">0.0 dB</span></div>
      </div>
      <div class="ss-sec">
        <div class="ss-eqrow"><span>Premaster</span><input type="range" min="-36" max="6" step="0.5" value="0" oninput="SampleStudio.setPremaster(this.value)"><span id="ss-pre-val">0.0 dB</span></div>
        <div class="ss-vu"><div class="ss-vu-scale"><span>−36</span><span>0</span><span>+6</span></div>
          <div class="ss-vu-track"><div id="ss-vu-bar" class="ss-vu-bar"></div></div>
          <div id="ss-vu-db" class="ss-vu-db">−∞ dB</div></div>
      </div>
      <div class="ss-sec">
        <button id="ss-sync-btn" class="ss-btn" onclick="SampleStudio.toggleAutoSync(!SampleStudio.isAutoSync())">Auto-sync maître : OFF</button>
      </div>
      <div class="ss-sec">
        <button id="ss-mic-btn" class="ss-btn" onclick="SampleStudio.micToggle()">🎙️ Connecter micro</button>
        <div id="ss-mic-info" class="ss-sub"></div>
        <div class="ss-sub">Zoom H1 Essential — 32-bit float (sans EC/NS/AGC)</div>
      </div>
      <div class="ss-sec ss-rec">
        <select id="ss-rec-fmt" class="ss-sel">
          <option value="wav">WAV 32-bit float (max def)</option>
          <option value="m4a">M4A / AAC 320k</option>
        </select>
        <button id="ss-rec-btn" class="ss-btn ss-rec-btn" onclick="SampleStudio.recToggle()">● Enregistrer</button>
        <span id="ss-rec-time" class="ss-sub"></span>
        <div class="ss-sub">Capture la sortie master · ${ctx ? ctx.sampleRate : 48000} Hz</div>
      </div>`;
    _ensureCSS();
  }

  function _ensureCSS() {
    if (document.getElementById('ss-css')) return;
    const s = document.createElement('style'); s.id = 'ss-css';
    s.textContent = `
    .ss-sec{margin:.5rem 0;padding:.55rem .65rem;background:rgba(160,100,255,.06);border:1px solid rgba(200,100,255,.16);border-radius:10px;}
    .ss-title{font-size:.72rem;letter-spacing:.12em;color:#E0C8FF;font-weight:bold;}
    .ss-sub{font-size:.62rem;color:rgba(200,170,255,.55);font-style:italic;margin-top:.2rem;}
    .ss-eqrow{display:grid;grid-template-columns:62px 1fr 56px;align-items:center;gap:.4rem;font-size:.66rem;color:rgba(200,170,255,.8);padding:.18rem 0;}
    .ss-eqrow input{accent-color:#A060F0;}
    .ss-btn{width:100%;margin-top:.25rem;padding:.45rem;border-radius:8px;border:1px solid rgba(200,100,255,.3);background:rgba(25,8,48,.8);color:#E0C8FF;font-size:.7rem;cursor:pointer;}
    .ss-btn.on{background:linear-gradient(90deg,#7a3cff,#c060ff);color:#fff;border-color:#c060ff;}
    .ss-vu{margin-top:.4rem;}
    .ss-vu-scale{display:flex;justify-content:space-between;font-size:.55rem;color:rgba(200,170,255,.5);}
    .ss-vu-track{height:12px;background:rgba(0,0,0,.45);border-radius:6px;overflow:hidden;border:1px solid rgba(200,100,255,.2);}
    .ss-vu-bar{height:100%;width:0%;background:#56ffb0;transition:width .05s linear;}
    .ss-vu-db{font-family:monospace;font-size:.62rem;color:#E8DDFF;text-align:right;margin-top:.15rem;}
    .ss-sel{width:100%;padding:.35rem;border-radius:8px;background:rgba(25,8,48,.85);color:#E0C8FF;border:1px solid rgba(200,100,255,.3);font-size:.66rem;}
    .ss-rec-btn.on{background:linear-gradient(90deg,#ff3b3b,#ff7a3b);border-color:#ff5a5a;}`;
    document.head.appendChild(s);
  }

  return {
    init, buildUI, inputNode,
    loadSampleFile, bowlStart, bowlStop,
    setEQ, setPremaster,
    micEnable, micDisable, micToggle,
    toggleAutoSync, isAutoSync: () => autoSync,
    recStart, recStop, recToggle,
    get started() { return started; }
  };
})();
