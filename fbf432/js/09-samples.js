/* ═══════════════════════════════════════════
   09-samples.js — Banque de samples (v2)
   · Persistance IndexedDB (bytes bruts re-décodés)
   · Moteur FX dédié INDÉPENDANT du jeu FBF432
     (Limiter · Ping-Pong · Reverb · EQ 3 bandes 36–512 Hz)
   · Détection de la fondamentale → jeu binaural aléatoire cohérent
   ═══════════════════════════════════════════ */

const SAMPLE_CATS = {
  'Voix':        { files: [] },
  'Instruments': { files: [] },
  'Drone':       { files: [] },
  'Ambiance':    { files: [] },
  'Chakra':      { files: [] }
};

let _sampleSrc  = null;
let _curSampleCat = null;
let _curSampleFund = null;   // dernière fondamentale détectée

/* ---------- 9.0 · INDEXEDDB (persistance) ---------- */
const SDB_NAME = 'fbf432_samples', SDB_STORE = 'clips';
let _sdb = null;
function _sdbOpen() {
  return new Promise((resolve, reject) => {
    if (_sdb) return resolve(_sdb);
    const req = indexedDB.open(SDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SDB_STORE))
        db.createObjectStore(SDB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => { _sdb = req.result; resolve(_sdb); };
    req.onerror   = () => reject(req.error);
  });
}
async function _sdbPut(rec) {
  const db = await _sdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SDB_STORE, 'readwrite');
    const r  = tx.objectStore(SDB_STORE).put(rec);
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}
async function _sdbAll() {
  const db = await _sdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SDB_STORE, 'readonly');
    const r  = tx.objectStore(SDB_STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror   = () => reject(r.error);
  });
}
async function _sdbDel(id) {
  const db = await _sdbOpen();
  return new Promise((resolve) => {
    const tx = db.transaction(SDB_STORE, 'readwrite');
    tx.objectStore(SDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

// Restaure tous les samples au lancement
async function sampleRestoreAll() {
  try {
    const recs = await _sdbAll();
    for (const rec of recs) {
      const cat = SAMPLE_CATS[rec.cat]; if (!cat) continue;
      try {
        const buf = await audioCtx().decodeAudioData(rec.bytes.slice(0));
        cat.files.push({ id: rec.id, name: rec.name, buf, fund: rec.fund || null });
      } catch(e) {}
    }
    if (_curSampleCat) sampleOpenCat(_curSampleCat);
  } catch(e) {}
}

/* ---------- 9.1 · MOTEUR FX DÉDIÉ (indépendant du jeu) ---------- */
let _sfx = null; // { in, eqLow, eqMid, eqHigh, comp, out, rev, revSend, ppSend, ... }
function ensureSampleFX() {
  if (_sfx) return _sfx;
  const c = audioCtx();
  const inGain = c.createGain(); inGain.gain.value = 1;

  // EQ 3 bandes confinées 36–512 Hz
  const eqLow  = c.createBiquadFilter(); eqLow.type='lowshelf';  eqLow.frequency.value=80;   eqLow.gain.value=0;
  const eqMid  = c.createBiquadFilter(); eqMid.type='peaking';   eqMid.frequency.value=200;  eqMid.Q.value=0.9; eqMid.gain.value=0;
  const eqHigh = c.createBiquadFilter(); eqHigh.type='highshelf';eqHigh.frequency.value=512; eqHigh.gain.value=0;

  // Reverb dédiée (réutilise _makeIR du moteur si dispo)
  const rev = c.createConvolver();
  try { rev.buffer = (typeof _makeIR === 'function') ? _makeIR(1.8, 0.04) : null; } catch(e) {}
  const revSend = c.createGain(); revSend.gain.value = 0;

  // Ping-pong stéréo dédié (cross-feedback)
  const ppSend = c.createGain(); ppSend.gain.value = 0;
  const ppL = c.createDelay(2.0); ppL.delayTime.value = 0.27;
  const ppR = c.createDelay(2.0); ppR.delayTime.value = 0.40;
  const ppFbLR = c.createGain(); ppFbLR.gain.value = 0.34;
  const ppFbRL = c.createGain(); ppFbRL.gain.value = 0.34;
  const ppPanL = c.createStereoPanner(); ppPanL.pan.value = -1;
  const ppPanR = c.createStereoPanner(); ppPanR.pan.value =  1;
  const ppWet  = c.createGain(); ppWet.gain.value = 1;

  // Limiter dédié
  const comp = c.createDynamicsCompressor();
  comp.threshold.value=-3.6; comp.knee.value=0; comp.ratio.value=20; comp.attack.value=0.002; comp.release.value=0.18;

  const out = c.createGain(); out.gain.value = 1;

  // Routage : in → EQ → comp → out → destination
  inGain.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
  eqHigh.connect(comp);
  // sends pris après EQ
  eqHigh.connect(revSend); revSend.connect(rev); rev.connect(comp);
  eqHigh.connect(ppSend);
  ppSend.connect(ppL);
  ppL.connect(ppFbLR); ppFbLR.connect(ppR);
  ppR.connect(ppFbRL); ppFbRL.connect(ppL);
  ppL.connect(ppPanL); ppR.connect(ppPanR);
  ppPanL.connect(ppWet); ppPanR.connect(ppWet); ppWet.connect(comp);
  comp.connect(out); out.connect(c.destination);

  _sfx = { in:inGain, eqLow, eqMid, eqHigh, comp, out, rev, revSend, ppSend, ppL, ppR, ppFbLR, ppFbRL, ppWet };
  return _sfx;
}

function sampleFX(param, v) {
  const fx = ensureSampleFX(); const now = audioCtx().currentTime; const val = parseFloat(v);
  switch (param) {
    case 'eqLow':  fx.eqLow.gain.setTargetAtTime(val, now, 0.05); break;
    case 'eqMid':  fx.eqMid.gain.setTargetAtTime(val, now, 0.05); break;
    case 'eqHigh': fx.eqHigh.gain.setTargetAtTime(val, now, 0.05); break;
    case 'reverb': fx.revSend.gain.setTargetAtTime(val, now, 0.08); break;
    case 'pp':     fx.ppSend.gain.setTargetAtTime(val, now, 0.08); break;
    case 'ppTime':
      fx.ppL.delayTime.setTargetAtTime(val, now, 0.05);
      fx.ppR.delayTime.setTargetAtTime(val * 1.5, now, 0.05); break;
    case 'ppFb':
      fx.ppFbLR.gain.setTargetAtTime(val, now, 0.05);
      fx.ppFbRL.gain.setTargetAtTime(val, now, 0.05); break;
    case 'out':    fx.out.gain.setTargetAtTime(val, now, 0.05); break;
  }
  const disp = document.getElementById('sfx-' + param + '-val');
  if (disp) disp.textContent = (param.startsWith('eq')) ? val.toFixed(1)+' dB'
            : (param==='ppTime') ? val.toFixed(2)+'s'
            : Math.round(val*100)+'%';
}

/* ---------- 9.2 · DÉTECTION DE LA FONDAMENTALE (autocorrélation) ---------- */
function detectFundamental(buf) {
  try {
    const sr = buf.sampleRate;
    const ch = buf.getChannelData(0);
    // fenêtre centrale ~100ms
    const N = Math.min(4096, ch.length);
    const start = Math.max(0, (ch.length >> 1) - (N >> 1));
    const x = new Float32Array(N);
    for (let i = 0; i < N; i++) x[i] = ch[start + i];
    // RMS — si trop faible, abandon
    let rms = 0; for (let i = 0; i < N; i++) rms += x[i]*x[i];
    rms = Math.sqrt(rms / N);
    if (rms < 0.005) return null;
    // autocorrélation sur plage 40–600 Hz
    const minLag = Math.floor(sr / 600), maxLag = Math.floor(sr / 40);
    let bestLag = -1, best = 0;
    for (let lag = minLag; lag <= maxLag && lag < N; lag++) {
      let sum = 0;
      for (let i = 0; i < N - lag; i++) sum += x[i] * x[i + lag];
      if (sum > best) { best = sum; bestLag = lag; }
    }
    if (bestLag <= 0) return null;
    return sr / bestLag;
  } catch(e) { return null; }
}

// Replie une fréquence dans la bande 54–432 par octaves
function foldToBand(f) {
  if (!f || !isFinite(f)) return null;
  while (f > 432) f /= 2;
  while (f < F_MIN) f *= 2;
  return Math.round(f);
}

/* ---------- 9.3 · LISTE / CATÉGORIES ---------- */
function sampleOpenCat(cat) {
  _curSampleCat = cat;
  document.querySelectorAll('.sample-cat-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.cat === cat)
  );
  const list = document.getElementById('sample-file-list');
  if (!list) return;
  const data = SAMPLE_CATS[cat];
  if (!data || !data.files.length) {
    list.innerHTML = '<div style="color:rgba(200,170,255,.45);font-style:italic;font-size:.76rem;padding:.35rem 0;">Aucun sample — ▲ Importer</div>';
    return;
  }
  list.innerHTML = data.files.map((f, idx) => `
    <div style="display:flex;align-items:center;gap:.35rem;margin:.3rem 0;">
      <button onclick="samplePlay('${cat}',${idx})"
        style="flex:1;text-align:left;font-size:.72rem;padding:.32rem .5rem;background:rgba(255,255,255,.04);
               border:1px solid rgba(200,170,255,.18);color:rgba(220,200,255,.8);border-radius:6px;cursor:pointer;
               overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ▶ ${f.name}${f.fund ? ` <span style="color:rgba(140,255,200,.6);">· ${Math.round(f.fund)}Hz</span>` : ''}
      </button>
      <button onclick="sampleDelete('${cat}',${idx})" title="Supprimer"
        style="font-size:.68rem;padding:.32rem .42rem;background:transparent;border:1px solid rgba(255,142,142,.3);
               color:rgba(255,142,142,.6);border-radius:6px;cursor:pointer;">✕</button>
    </div>`).join('');
}

/* ---------- 9.4 · IMPORT (avec persistance + détection) ---------- */
function sampleImport() {
  if (!_curSampleCat) { _curSampleCat = 'Voix'; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'audio/*'; input.multiple = true;
  input.onchange = async () => {
    const catName = _curSampleCat, cat = SAMPLE_CATS[catName];
    for (const file of Array.from(input.files)) {
      try {
        const ab  = await file.arrayBuffer();
        const buf = await audioCtx().decodeAudioData(ab.slice(0));
        const fund = foldToBand(detectFundamental(buf));
        const id = await _sdbPut({ cat: catName, name: file.name, bytes: ab, fund });
        cat.files.push({ id, name: file.name, buf, fund });
      } catch(e) {}
    }
    sampleOpenCat(catName);
  };
  input.click();
}

async function sampleDelete(cat, idx) {
  const data = SAMPLE_CATS[cat]; if (!data || !data.files[idx]) return;
  const f = data.files[idx];
  if (f.id != null) await _sdbDel(f.id);
  data.files.splice(idx, 1);
  if (_sampleSrc && _sampleSrc._idx === idx && _sampleSrc._cat === cat) sampleStop();
  sampleOpenCat(cat);
}

/* ---------- 9.5 · LECTURE (via moteur FX dédié) ---------- */
function samplePlay(cat, idx) {
  sampleStop();
  const catData = SAMPLE_CATS[cat]; if (!catData || !catData.files[idx]) return;
  const { buf, fund } = catData.files[idx];
  _curSampleFund = fund || foldToBand(detectFundamental(buf));
  const c = audioCtx();
  const fx = ensureSampleFX();
  _sampleSrc = c.createBufferSource();
  _sampleSrc.buffer = buf; _sampleSrc.loop = true;
  _sampleSrc._idx = idx; _sampleSrc._cat = cat;
  const sl = document.getElementById('sample-vol-sl');
  fx.in.gain.value = sl ? parseFloat(sl.value) : 0.5;
  _sampleSrc.connect(fx.in);
  _sampleSrc.start();
  // Affiche la fondamentale détectée
  const fd = document.getElementById('sample-fund-disp');
  if (fd) fd.textContent = _curSampleFund ? (_curSampleFund + ' Hz') : '—';
}

function sampleStop() {
  try { if (_sampleSrc) { _sampleSrc.stop(); _sampleSrc.disconnect(); } } catch(e) {}
  _sampleSrc = null;
}

function sampleSetVol(v) {
  const fx = ensureSampleFX();
  fx.in.gain.setTargetAtTime(parseFloat(v), audioCtx().currentTime, 0.05);
}

/* ---------- 9.6 · JEU ALÉATOIRE DEPUIS LA FONDAMENTALE ---------- */
function sampleAutoGame() {
  if (!_curSampleFund) {
    if (_sampleSrc && _sampleSrc.buffer) _curSampleFund = foldToBand(detectFundamental(_sampleSrc.buffer));
  }
  if (!_curSampleFund) return;
  // Ancre le maître sur la fondamentale repliée, puis génère un champ cohérent
  setMasterFreq(_curSampleFund);
  triggerMagicAuto({ keepMaster: true });
  const fd = document.getElementById('sample-fund-disp');
  if (fd) { fd.style.color = '#8CFFC8'; setTimeout(() => { if (fd) fd.style.color = ''; }, 500); }
}
// Relance un random cohérent (sans ré-ancrer le maître)
function sampleRerollGame() { triggerMagicAuto(); }
