/* ═══════════════════════════════════════════
   07-app.js — État, presets, progression, navigation, Horloge UT432, init
   ═══════════════════════════════════════════ */

// ── Progression Harmonique ────────────────────────────────────────
let progRunning = false;
let progTimer   = null;
let progDir     = 1;
let progFreqCur = 252;

function getProgRange() {
  const lo = Math.max(36,   Math.min(864, parseInt(document.getElementById('prog-min')?.value)||36));
  const hi = Math.max(lo+1, Math.min(864, parseInt(document.getElementById('prog-max')?.value)||864));
  return { lo, hi };
}
function progStep() {
  const ri = parseInt(document.getElementById('prog-ratio').value);
  const r  = RATIO_OPTS[ri].r;
  const { lo, hi } = getProgRange();
  let next = Math.round(progFreqCur * (progDir===1 ? r : 1/r) * 100) / 100;
  if (next > hi) next = lo;
  if (next < lo) next = hi;
  progFreqCur = Math.max(lo, Math.min(hi, next));
  masterFreq  = Math.round(progFreqCur);
  updateDisplay();
  if (flowing) PAIRS.forEach((pair,i) => { tuneOsc(pair.pingala.id,calcPFreq(i)); tuneOsc(pair.ida.id,calcIFreq(i)); });
  const disp = document.getElementById('prog-display');
  if (disp) { disp.textContent=masterFreq+' Hz · '+RATIO_OPTS[ri].l; disp.classList.add('active'); }
  saveState();
}
function startProgression() {
  const dur = parseInt(document.getElementById('prog-dur').value)||4000;
  progFreqCur = masterFreq; progRunning = true;
  const on = document.getElementById('btn-prog-on'), off = document.getElementById('btn-prog-off');
  if (on) on.classList.add('running');
  if (off) off.classList.remove('running');
  const disp = document.getElementById('prog-display');
  if (disp) disp.textContent = masterFreq+' Hz — départ';
  progStep();
  progTimer = setInterval(progStep, dur);
}
function stopProgression() {
  progRunning = false;
  clearInterval(progTimer); progTimer = null;
  const on = document.getElementById('btn-prog-on'), off = document.getElementById('btn-prog-off');
  if (on) on.classList.remove('running');
  const disp = document.getElementById('prog-display');
  if (disp) { disp.textContent=masterFreq+' Hz — arrêté'; disp.classList.remove('active'); }
}

// ── Persistance localStorage ──────────────────────────────────────
let _saveTimer = null;
function saveState() { clearTimeout(_saveTimer); _saveTimer = setTimeout(_doSave, 500); }
function _doSave() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      masterFreq, globalDelta, masterVol, activeGeometry,
      pairs: PAIRS.map(p => ({
        ri:p.pingala.ri, n:p.pingala.n, volP:p.pingala.vol,
        delta:p.ida.delta, polarity:p.ida.polarity, volI:p.ida.vol,
        mutedP:!!mutedOscs[p.pingala.id], mutedI:!!mutedOscs[p.ida.id]
      }))
    }));
  } catch(e) {}
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (!s) return;
    if (s.masterFreq>=36&&s.masterFreq<=864) masterFreq = s.masterFreq;
    if (s.globalDelta>0) globalDelta = s.globalDelta;
    if (s.masterVol>=0&&s.masterVol<=1) masterVol = s.masterVol;
    if (typeof s.activeGeometry==='number') activeGeometry = s.activeGeometry;
    (s.pairs||[]).forEach((sp,i) => {
      if (!PAIRS[i]) return;
      if (sp.ri>=0&&sp.ri<RATIO_OPTS.length) PAIRS[i].pingala.ri = sp.ri;
      if (!isNaN(sp.n)&&sp.n>=0) PAIRS[i].pingala.n = sp.n;
      if (sp.volP>=0) PAIRS[i].pingala.vol = sp.volP;
      if (sp.delta>0) PAIRS[i].ida.delta = sp.delta;
      if (sp.polarity===1||sp.polarity===-1) PAIRS[i].ida.polarity = sp.polarity;
      if (sp.volI>=0) PAIRS[i].ida.vol = sp.volI;
      mutedOscs[PAIRS[i].pingala.id] = !!sp.mutedP;
      mutedOscs[PAIRS[i].ida.id]     = !!sp.mutedI;
    });
  } catch(e) {}
}

// ── Presets ───────────────────────────────────────────────────────
const SOLFEGE = {
  36:'Ut₁', 72:'Ut₂', 108:'Sol₁', 144:'Ré₂', 180:'La₂',
  216:'Mi₂', 252:'Si♭₂', 288:'Ré₃', 324:'Sol₃', 360:'La₃',
  396:'Sol♭₃', 432:'La₃☉'
};
let presetSelected = 252;

function selectPreset(freq) {
  presetSelected = freq;
  document.querySelectorAll('.preset-freq-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.freq)===freq);
  });
}
function applyPreset() {
  setMasterFreq(presetSelected);
  if (flowing) PAIRS.forEach((_,i) => swapPingala(i));
  else updateDisplay();
  saveState();
  const btn = document.getElementById('preset-launch-btn');
  if (btn) { btn.textContent='✓ Appliqué'; setTimeout(()=>btn.textContent='▶ Lancer',1800); }
}

// ── Export config ─────────────────────────────────────────────────
function exportState() {
  const state = {
    f:masterFreq, d:globalDelta, v:masterVol,
    p:PAIRS.map(p=>({ri:p.pingala.ri,n:p.pingala.n,vp:p.pingala.vol,dt:p.ida.delta,po:p.ida.polarity,vi:p.ida.vol}))
  };
  try {
    navigator.clipboard.writeText(JSON.stringify(state));
    const s = document.getElementById('stxt');
    if (s) { const prev=s.textContent; s.textContent='✓ Config copiée !'; setTimeout(()=>s.textContent=prev,2200); }
  } catch(e) {}
}

// ── UT432 Horloge Solaire ─────────────────────────────────────────
// Longitude Paris ~2.35°E. Heure solaire = UTC+heure légale + longitude/15 + équation du temps
const UT432_SEUILS = [
  { v:0,   name:'Kether',    color:'#FFFFFF' },
  { v:54,  name:'Chokhmah',  color:'#E0CFFF' },
  { v:108, name:'Binah',     color:'#63E6FF' },
  { v:162, name:'Chesed',    color:'#86FFC0' },
  { v:216, name:'Tiphereth', color:'#FFD060' },
  { v:270, name:'Netzach',   color:'#FF8EFF' },
  { v:324, name:'Hod',       color:'#FF8E8E' },
  { v:378, name:'Yesod',     color:'#C0AAFF' },
  { v:432, name:'Malkuth',   color:'#A8F0B0' }
];

// Equation du temps — approximation sinusoïdale (minutes)
function _eqT(doy) {
  const B = 2 * Math.PI * (doy - 81) / 364;
  return 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B);
}
// Offset DST France : +120 min en été (dernier dim mars → dernier dim oct), +60 en hiver
function _frOff(d) {
  const y = d.getUTCFullYear();
  // Dernier dimanche de mars
  const marchEnd  = new Date(Date.UTC(y,2,31)); marchEnd.setUTCDate(31-marchEnd.getUTCDay());
  // Dernier dimanche d'octobre
  const octEnd    = new Date(Date.UTC(y,9,31)); octEnd.setUTCDate(31-octEnd.getUTCDay());
  return (d >= marchEnd && d < octEnd) ? 120 : 60;
}

function calcUT432() {
  const now = new Date();
  const doy = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  const eqMin  = _eqT(doy);
  const lngMin = (2.35 / 15) * 60;           // +9.4 min pour Paris
  const dstMin = _frOff(now);
  // Heure solaire vraie en minutes depuis minuit (UTC)
  const utcMin = now.getUTCHours()*60 + now.getUTCMinutes() + now.getUTCSeconds()/60;
  const solarMin = utcMin + dstMin + lngMin + eqMin;
  // Normalise 0–1440 → 0–432
  const ut = Math.max(0, Math.min(432, (solarMin / 1440) * 432));
  return Math.round(ut);
}

function getCurSeuil432(ut) {
  let seuil = UT432_SEUILS[0];
  for (const s of UT432_SEUILS) { if (ut >= s.v) seuil = s; else break; }
  return seuil;
}

let _h432Timer = null;

function _tickHorloge432() {
  updateInfobar();
  const ut      = calcUT432();
  const seuil   = getCurSeuil432(ut);
  const pct     = (ut / 432) * 100;
  const now     = new Date();
  const civil   = now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit',second:'2-digit'});

  const valEl   = document.getElementById('h432-val');
  const seuilEl = document.getElementById('h432-seuil');
  const progEl  = document.getElementById('h432-progress');
  const civEl   = document.getElementById('h432-civil');

  if (valEl)   { valEl.textContent = ut; valEl.style.color = seuil.color; }
  if (seuilEl) { seuilEl.textContent = seuil.name; seuilEl.style.color = seuil.color+'99'; }
  if (progEl)  { progEl.style.width = pct.toFixed(2)+'%'; progEl.style.background = `linear-gradient(90deg,${seuil.color}44,${seuil.color})`; }
  if (civEl)   civEl.textContent = civil;
}

function startHorloge432() {
  _tickHorloge432();
  if (!_h432Timer) _h432Timer = setInterval(_tickHorloge432, 1000);
}
function stopHorloge432() {
  clearInterval(_h432Timer); _h432Timer = null;
}

function triggerHorloge432() {
  const ut    = calcUT432();
  const seuil = getCurSeuil432(ut);

  // Fréquence maître = UT432 (clampé 36–432)
  const freq = Math.max(36, Math.min(432, ut || 216));
  setMasterFreq(freq);

  // Géométrie aléatoire
  setGeometry(Math.floor(Math.random() * GEO_NAMES.length));

  // Ratios et deltas harmoniques aléatoires pour chaque paire
  PAIRS.forEach((pair, i) => {
    pair.pingala.ri = Math.floor(Math.random() * RATIO_OPTS.length);
    const deltas = [0.5, 1.0, 1.5, 2.1, 3.5, 4.0, 6.0, 7.83];
    pair.ida.delta = deltas[Math.floor(Math.random() * deltas.length)];
    pair.ida.polarity = Math.random() > 0.5 ? 1 : -1;
  });

  updateDisplay();
  if (flowing) PAIRS.forEach((_,i) => { tuneOsc(PAIRS[i].pingala.id,calcPFreq(i)); tuneOsc(PAIRS[i].ida.id,calcIFreq(i)); });
  saveState();

  // Flash du bouton
  const btn = document.getElementById('btn-h432');
  if (btn) {
    btn.textContent = `⊙ ${ut} · ${seuil.name}`;
    btn.style.borderColor = seuil.color;
    btn.style.color = seuil.color;
    setTimeout(() => {
      if (btn) { btn.textContent = '⊙ Jeu UT432'; btn.style.borderColor=''; btn.style.color=''; }
    }, 3500);
  }
}

// ── Dock collapse ─────────────────────────────────────────────────
function toggleDock() {
  const dock    = document.getElementById('bottom-dock');
  const chevron = document.getElementById('dock-chevron');
  if (!dock) return;
  const collapsed = dock.classList.toggle('collapsed');
  if (chevron) {
    chevron.classList.toggle('dock-up', collapsed);
    chevron.textContent = collapsed ? '⌃' : '⌄';
  }
  setTimeout(buildVesicaPairs, 370);
}

// ── Randomisation harmonique globale ─────────────────────────────
function globalHarmonicRandom() {
  harmonicRandomInit();
  PAIRS.forEach((pair, i) => {
    pair.pingala.ri = Math.floor(Math.random() * RATIO_OPTS.length);
    const deltas = [0.5, 1.0, 1.5, 1.8, 2.1, 3.5, 4.0, 6.0, 7.83];
    pair.ida.delta = deltas[Math.floor(Math.random() * deltas.length)];
  });
  updateDisplay();
  if (flowing) PAIRS.forEach((_,i) => { tuneOsc(PAIRS[i].pingala.id,calcPFreq(i)); tuneOsc(PAIRS[i].ida.id,calcIFreq(i)); });
  saveState();
  const btn = document.getElementById('btn-harmonic');
  if (btn) { btn.style.color='#86FFC0'; setTimeout(()=>{ if(btn)btn.style.color=''; },900); }
}

// ── Plein écran ───────────────────────────────────────────────────
function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}
document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('btn-fs');
  if (btn) btn.textContent = document.fullscreenElement ? '✕' : '⤢';
});

// ── Panel navigation (tab-nav centré) ────────────────────────────
let _openPanel = null;
let _openBtnId = null;

function tPanel(panId, btnId) {
  const pan = document.getElementById(panId);
  const btn = document.getElementById(btnId);
  if (!pan) return;

  if (_openPanel === panId) {
    pan.classList.remove('open');
    if (btn) btn.classList.remove('on');
    if (panId === 'panUT') stopHorloge432();
    _openPanel = null; _openBtnId = null;
    return;
  }

  if (_openPanel) {
    const old = document.getElementById(_openPanel);
    if (old) old.classList.remove('open');
    if (_openBtnId) { const ob = document.getElementById(_openBtnId); if (ob) ob.classList.remove('on'); }
    if (_openPanel === 'panUT') stopHorloge432();
  }

  pan.classList.add('open');
  if (btn) btn.classList.add('on');
  _openPanel = panId; _openBtnId = btnId;
  if (panId === 'panUT') startHorloge432();
  if (panId === 'panFX') requestAnimationFrame(()=>initEQ2D(document.getElementById('eq2d-canvas')));
}

function openTab(id) { tPanel(id, null); }
function closePanel() {
  if (_openPanel) {
    const old = document.getElementById(_openPanel);
    if (old) old.classList.remove('open');
    if (_openBtnId) { const ob = document.getElementById(_openBtnId); if (ob) ob.classList.remove('on'); }
    if (_openPanel === 'panUT') stopHorloge432();
    _openPanel = null; _openBtnId = null;
  }
}

// ── Infobar live ───────────────────────────────────────────────────
function updateInfobar() {
  const ibFreq = document.getElementById('ib-freq');
  const ibFlux = document.getElementById('ib-flux');
  const ibGeo  = document.getElementById('ib-geo');
  const ibUT   = document.getElementById('ib-ut');
  const hdrFreq = document.getElementById('hdr-freq');

  if (ibFreq) ibFreq.textContent = masterFreq + ' Hz';
  if (ibFlux) {
    ibFlux.textContent = flowing ? 'ON' : 'OFF';
    ibFlux.className   = 'ib-v ' + (flowing ? 'ib-live' : 'ib-off');
  }
  if (ibGeo) ibGeo.textContent = GEO_NAMES[activeGeometry] || '—';
  if (hdrFreq) hdrFreq.textContent = masterFreq + ' Hz · ' + (GEO_NAMES[activeGeometry] || '');

  if (ibUT) {
    const ut    = calcUT432();
    const seuil = getCurSeuil432(ut);
    ibUT.textContent = ut + ' · ' + seuil.name;
    ibUT.style.color = seuil.color;
  }
}

// ── Oscillator modal ───────────────────────────────────────────────
let _oscModalIdx = -1;

function openOscModal(i) {
  _oscModalIdx = i;
  const modal    = document.getElementById('osc-modal');
  const backdrop = document.getElementById('backdrop');
  const title    = document.getElementById('osc-modal-title');
  const body     = document.getElementById('osc-modal-body');
  if (!modal || !body) return;

  const pair = PAIRS[i];
  if (title) title.textContent = i===MASTER_IDX ? '✦ Oscillateur Maître' : `✦ Canal ${i+1} — ${pair.label}`;
  body.innerHTML = buildPairHTML(pair, i);

  modal.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

function closeOscModal() {
  const modal    = document.getElementById('osc-modal');
  const backdrop = document.getElementById('backdrop');
  if (modal)    modal.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  _oscModalIdx = -1;
}

// ── Minuterie de méditation ───────────────────────────────────────
let _sesTimer = null, _sesDur = 0, _sesElapsed = 0, _sesMins = 20;

function timerPreset(mins) {
  _sesMins = mins;
  document.querySelectorAll('.fx-timer-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent) === mins);
  });
  _updateTimerDisplay(_sesDur > 0 ? (_sesDur - _sesElapsed) : mins * 60);
}

function timerToggle() {
  if (_sesTimer) { _stopTimer(); return; }
  _sesDur = _sesMins * 60; _sesElapsed = 0;
  _updateTimerDisplay(_sesDur);
  _updateTimerHUD(_sesDur, _sesDur);
  playBell();
  _sesTimer = setInterval(() => {
    _sesElapsed++;
    const rem = _sesDur - _sesElapsed;
    _updateTimerDisplay(rem);
    _updateTimerHUD(rem, _sesDur);
    if (rem <= 0) { _stopTimer(); playBell(); setTimeout(playBell,2500); _doFadeStop(); }
  }, 1000);
  const btn = document.getElementById('btn-timer-start');
  if (btn) { btn.textContent = '■ Arrêter'; btn.style.color = '#FF8E8E'; btn.style.borderColor = '#FF8E8E44'; }
}
function _stopTimer() {
  clearInterval(_sesTimer); _sesTimer = null;
  _updateTimerHUD(0, 0);
  const btn = document.getElementById('btn-timer-start');
  if (btn) { btn.textContent = '▶ Démarrer'; btn.style.color = ''; btn.style.borderColor = ''; }
}

function _updateTimerHUD(remaining, total) {
  const hud = document.getElementById('ses-timer-hud');
  const arc = document.getElementById('timer-arc');
  const pctEl = document.getElementById('timer-hud-pct');
  if (!hud) return;
  if (!total || remaining <= 0) {
    hud.classList.remove('active');
    return;
  }
  hud.classList.add('active');
  const pct = Math.max(0, Math.min(1, remaining / total));
  const circ = 113.1;
  if (arc) arc.setAttribute('stroke-dashoffset', (circ * (1 - pct)).toFixed(1));
  const color = pct > 0.5 ? '#86FFC0' : pct > 0.25 ? '#FFD060' : '#FF8E8E';
  if (arc) arc.setAttribute('stroke', color);
  if (pctEl) { pctEl.textContent = Math.ceil(pct * 100) + '%'; pctEl.style.color = color; }
}
function _updateTimerDisplay(seconds) {
  const el = document.getElementById('timer-display'); if (!el) return;
  if (seconds <= 0) { el.textContent = '— fin —'; return; }
  const m = Math.floor(seconds / 60), s = seconds % 60;
  el.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function _doFadeStop() {
  if (!flowing) return;
  const orig = masterVol, steps = 40;
  let i = 0;
  const fi = setInterval(() => {
    i++; setMasterVol(orig * (1 - i/steps));
    if (i >= steps) { clearInterval(fi); setTimeout(stopFlow, 200); setTimeout(() => setMasterVol(orig), 800); }
  }, 150);
}

// ── Presets de session ────────────────────────────────────────────
const PS_KEY = 'fbf432-session-presets';
let _sessionPresets = [null, null, null, null, null];

function _loadSessionPresets() {
  try {
    const p = JSON.parse(localStorage.getItem(PS_KEY));
    if (Array.isArray(p)) _sessionPresets = p;
  } catch(e) {}
  _renderPresets();
}

function _snapshotGame(name) {
  return {
    name, masterFreq, globalDelta, masterVol,
    geo: activeGeometry,
    pairs: PAIRS.map(p => ({
      ri:p.pingala.ri, n:p.pingala.n, vp:p.pingala.vol,
      dt:p.ida.delta, po:p.ida.polarity, vi:p.ida.vol
    })),
    fx: (typeof getFXState === 'function') ? getFXState() : null  // ❤️ FX inclus
  };
}

function savePreset(slot) {
  const name = window.prompt('Nom du preset :', _sessionPresets[slot]?.name || 'Preset '+(slot+1));
  if (!name) return;
  _sessionPresets[slot] = _snapshotGame(name);
  try { localStorage.setItem(PS_KEY, JSON.stringify(_sessionPresets)); } catch(e) {}
  _renderPresets();
}

// ❤️ — sauve le jeu complet (FX inclus) dans le premier slot libre
function favGame() {
  let slot = _sessionPresets.findIndex(p => !p);
  if (slot < 0) {
    if (!window.confirm('Banque pleine — écraser le 1er preset ?')) return;
    slot = 0;
  }
  const def = 'FBF ' + masterFreq + 'Hz';
  const name = window.prompt('❤️ Nom du jeu :', def) || def;
  _sessionPresets[slot] = _snapshotGame(name);
  try { localStorage.setItem(PS_KEY, JSON.stringify(_sessionPresets)); } catch(e) {}
  _renderPresets();
  const b = document.getElementById('btn-fav-dock');
  if (b) { b.classList.add('fav-flash'); setTimeout(()=>b.classList.remove('fav-flash'), 600); }
  const s = document.getElementById('stxt');
  if (s) { const prev=s.textContent; s.textContent='❤️ Jeu sauvé : '+name; setTimeout(()=>{ if(s) s.textContent=prev; }, 2200); }
}

function loadPreset(slot) {
  const p = _sessionPresets[slot]; if (!p) return;
  if (p.masterFreq>=36 && p.masterFreq<=864) setMasterFreq(p.masterFreq);
  if (p.globalDelta>0) setGlobalDelta(p.globalDelta);
  if (p.masterVol>=0)  setMasterVol(p.masterVol);
  if (typeof p.geo === 'number') setGeometry(p.geo);
  (p.pairs||[]).forEach((sp,i) => {
    if (!PAIRS[i]) return;
    if (sp.ri>=0 && sp.ri<RATIO_OPTS.length) PAIRS[i].pingala.ri = sp.ri;
    if (!isNaN(sp.n) && sp.n>0) PAIRS[i].pingala.n = sp.n;
    if (sp.vp>=0) PAIRS[i].pingala.vol = sp.vp;
    if (sp.dt>0)  PAIRS[i].ida.delta   = sp.dt;
    if (sp.po===1||sp.po===-1) PAIRS[i].ida.polarity = sp.po;
    if (sp.vi>=0) PAIRS[i].ida.vol = sp.vi;
  });
  if (p.fx && typeof applyFXState === 'function') applyFXState(p.fx);
  updateDisplay();
  if (flowing) PAIRS.forEach((_,i) => { tuneOsc(PAIRS[i].pingala.id,calcPFreq(i)); tuneOsc(PAIRS[i].ida.id,calcIFreq(i)); });
  saveState();
}

function delPreset(slot) {
  _sessionPresets[slot] = null;
  try { localStorage.setItem(PS_KEY, JSON.stringify(_sessionPresets)); } catch(e) {}
  _renderPresets();
}

function _renderPresets() {
  _sessionPresets.forEach((p, s) => {
    const nameEl = document.getElementById('ps-name-'+s);
    if (nameEl) nameEl.textContent = p?.name || '— Vide —';
    const loadEl = document.getElementById('ps-load-'+s);
    if (loadEl) loadEl.disabled = !p;
    const delEl = document.getElementById('ps-del-'+s);
    if (delEl) delEl.disabled = !p;
  });
}

// ── Init ──────────────────────────────────────────────────────────
function init() {
  loadState();
  harmonicRandomInit();

  // Inject FX panel
  const fxBody = document.getElementById('panel-fx-body');
  if (fxBody) {
    fxBody.innerHTML = buildMasterFXHTML();
    requestAnimationFrame(() => initEQ2D(document.getElementById('eq2d-canvas')));
  }

  // Inject Horloge 432 panel
  const h432Body = document.getElementById('panel-horloge-body');
  if (h432Body) h432Body.innerHTML = buildHorloge432HTML();

  // Inject progression into random panel
  const progWrap = document.getElementById('rand-prog-wrap');
  if (progWrap) progWrap.innerHTML = buildProgHTML();

  // Load session presets
  _loadSessionPresets();

  // Build geometry grid
  buildGeoGrid();

  // Build vesica spheres
  buildVesicaPairs();

  // Build random table
  buildRandomTable();

  // Restaure les samples persistés (IndexedDB)
  if (typeof sampleRestoreAll === 'function') sampleRestoreAll();

  // Init 3D geometry engine
  animMetatron();

  // Sync global delta
  setGlobalDelta(globalDelta);

  // Sync UI state
  updateDisplay();
  patchFBFState();
  updateInfobar();

  // Infobar tick indépendant (1s)
  setInterval(updateInfobar, 1000);

  ui('idle', 'Prêt · Cliquez FLUX ou FBF pour rayonner');
}

// ── Deux orientations supportées (app Android : paysage + portrait) ──
function _checkOrientation() {
  const ov = document.getElementById('rotate-overlay');
  if (ov) ov.style.display = 'none';               // plus de blocage d'orientation
  try { screen.orientation.unlock(); } catch(e) {}
}
window.addEventListener('resize', _checkOrientation);
window.addEventListener('orientationchange', _checkOrientation);

function launchInit() {
  let done = false;
  function go() { if (done) return; done=true; setTimeout(init, 60); }
  try { document.fonts.ready.then(go); } catch(e) {}
  setTimeout(go, 800);
  _checkOrientation();
}

if (document.readyState==='complete') { launchInit(); }
else { window.addEventListener('load', launchInit); }

window.addEventListener('resize', () => setTimeout(() => {
  if (masterRAF) { cancelAnimationFrame(masterRAF); masterRAF=null; }
  buildVesicaPairs();
  masterTick();
}, 150));

document.addEventListener('keydown', e => {
  if (e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA') return;
  if (e.code==='Space')  { e.preventDefault(); fbfToggle(); }
  if (e.code==='Escape') { closeOscModal(); closePanel(); }
});

// Message parent (Omcha396) → arrêt propre du flux + accusé de réception
window.addEventListener('message', async function(e) {
  const d = e.data || {};
  if (d.fbf === 'stop-flow') {
    if (typeof flowing !== 'undefined' && flowing) await stopFlow();
    try { window.parent.postMessage({fbf:'stop-ack'}, '*'); } catch(ex) {}
  }
});
