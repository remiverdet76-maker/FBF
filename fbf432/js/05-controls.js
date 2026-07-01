/* ═══════════════════════════════════════════
   05-controls.js — Contrôles oscillateurs & UI
   ═══════════════════════════════════════════ */

// ── Verrouillage par paire (lock) ─────────────────────────────────
// Le random ne touche QUE les paires non verrouillées. Master = index 6.
let lockedPairs = {};
function isLocked(i) { return !!lockedPairs[i]; }
function toggleLock(i) {
  lockedPairs[i] = !lockedPairs[i];
  updatePairUI(i);
  patchRandomTable();
  ['lock-' + i, 'lockm-' + i].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.textContent = lockedPairs[i] ? '🔒' : '🔓'; b.classList.toggle('locked', lockedPairs[i]); }
  });
}

// ── Options mode aléatoire ────────────────────────────────────────
const RAND_OPTS={freqMin:36,freqMax:864,ratioMode:'random',useFX:false,rangeOn:false,spread:0.6};

// Spatialisation : aération fréquentielle + largeur de l'éventail stéréo
function setRandSpread(v) {
  RAND_OPTS.spread = Math.max(0, Math.min(1, parseFloat(v)));
  OSC_PAN = buildOscPan(0.35 + RAND_OPTS.spread * 0.6); // éventail 0.35 → 0.95
  // Re-pan les oscillateurs vivants
  if (flowing) PAIRS.forEach((pair, i) => {
    const np = nodes[pair.pingala.id], ni = nodes[pair.ida.id];
    if (np?.p && OSC_PAN[i]) np.p.pan.setTargetAtTime(OSC_PAN[i][0], aNow(), 0.1);
    if (ni?.p && OSC_PAN[i]) ni.p.pan.setTargetAtTime(OSC_PAN[i][1], aNow(), 0.1);
  });
  const el = document.getElementById('sv-spread'); if (el) el.textContent = Math.round(RAND_OPTS.spread*100)+'%';
}
function setRandRange(v){RAND_OPTS.rangeOn=!!v;}
function setRandFreqMin(v){
  RAND_OPTS.freqMin=Math.max(36,Math.min(RAND_OPTS.freqMax-1,parseInt(v)));
  const el=document.getElementById('rv-fmin');if(el)el.textContent=RAND_OPTS.freqMin;
  const sl=document.getElementById('sl-fmin');if(sl)sl.value=RAND_OPTS.freqMin;
}
function setRandFreqMax(v){
  RAND_OPTS.freqMax=Math.min(864,Math.max(RAND_OPTS.freqMin+1,parseInt(v)));
  const el=document.getElementById('rv-fmax');if(el)el.textContent=RAND_OPTS.freqMax;
  const sl=document.getElementById('sl-fmax');if(sl)sl.value=RAND_OPTS.freqMax;
}
function setRandRatioMode(m,btn){
  RAND_OPTS.ratioMode=m;
  document.querySelectorAll('[id^="rrm-"]').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
}
function setRandUseFX(v){RAND_OPTS.useFX=!!v;}

// FX aléatoire — randomise delay, reverb, EQ
// Random FX — INDÉPENDANT du random fréquence. FX globaux en fin de chaîne.
function randomizeFX(){
  // Valeurs franches → changement CLAIREMENT audible (avant : trop timide)
  const delT  = +(0.18 + Math.random() * 0.6).toFixed(2);
  const delFB = +(0.15 + Math.random() * 0.4).toFixed(2);
  const delW  = +(0.25 + Math.random() * 0.45).toFixed(2);
  const revW  = +(0.35 + Math.random() * 0.5).toFixed(2);
  const ppT   = +(0.15 + Math.random() * 0.45).toFixed(2);
  const ppFb  = +(0.2 + Math.random() * 0.4).toFixed(2);
  const ppW   = +(0.25 + Math.random() * 0.45).toFixed(2);
  const fxInt = +(0.55 + Math.random() * 0.4).toFixed(2);
  // Delay + Reverb (via sliders + updateFX → gating auto)
  [['delayTime',delT],['delayFeedback',delFB],['delayWet',delW],['reverbWet',revW]].forEach(([id,val])=>{
    const sl = document.getElementById(id); if (sl) sl.value = val;
    if (typeof updateFX === 'function') updateFX(id, val);
  });
  // Ping-pong (fonctions dédiées)
  if (typeof setPingPongTime === 'function') setPingPongTime(ppT);
  if (typeof setPingPongFb   === 'function') setPingPongFb(ppFb);
  if (typeof setPingPongWet  === 'function') setPingPongWet(ppW);
  if (typeof setFXIntensity  === 'function') setFXIntensity(fxInt);
  // Reflète sur les curseurs visibles
  [['ppTime',ppT],['ppFb',ppFb],['ppWetSlider',ppW],['fxIntensity',fxInt]].forEach(([id,v])=>{
    const s = document.getElementById(id); if (s) s.value = v;
  });
  const d1=document.getElementById('ppTime-val'); if(d1)d1.textContent=ppT.toFixed(2)+'s';
  const d2=document.getElementById('ppFb-val');   if(d2)d2.textContent=Math.round(ppFb*100)+'%';
  const d3=document.getElementById('ppWet-val');  if(d3)d3.textContent=Math.round(ppW*100)+'%';
  const d4=document.getElementById('sv-fxint');   if(d4)d4.textContent=Math.round(fxInt*100)+'%';
}

// Raccourci Random FX (bouton jaune du dock + bouton panneau FX)
function triggerRandomFX(){
  randomizeFX();
  const b = document.getElementById('btn-rfx-dock');
  if (b) { b.style.color='#fff'; setTimeout(()=>{ if(b) b.style.color=''; }, 400); }
}

function setN(i, raw) {
  const n = Math.round(Math.max(0.1, parseFloat(raw)) * 10) / 10;
  if (isNaN(n)) return;
  PAIRS[i].pingala.n = n;
  updatePairUI(i);
  if (flowing) {
    tuneOsc(PAIRS[i].pingala.id, calcPFreq(i));
    tuneOsc(PAIRS[i].ida.id,     calcIFreq(i));
  }
  saveState();
}
function setRatio(i, ri) {
  PAIRS[i].pingala.ri = ri;
  if (flowing) swapPingala(i); else updatePairUI(i);
  saveState();
}
function setDelta(i, raw) {
  const d = Math.round(Math.max(0.1, Math.min(36, parseFloat(raw))) * 10) / 10;
  if (isNaN(d)) return;
  PAIRS[i].ida.delta = d;
  updatePairUI(i);
  if (flowing) swapIDebounced(i);
  saveState();
}
function togglePolarity(i) {
  PAIRS[i].ida.polarity *= -1;
  if (flowing) swapIda(i); else updatePairUI(i);
  saveState();
}

function toggleMuteP(i) {
  const pid = PAIRS[i].pingala.id;
  mutedOscs[pid] = !mutedOscs[pid];
  const node = nodes[pid];
  if (node) safeRamp(node.g.gain, mutedOscs[pid] ? 0 : PAIRS[i].pingala.vol, 0.5);
  updatePairUI(i); saveState();
}
// Taper une bulle = couper/activer la PAIRE ENTIÈRE (Pingala + Ida)
function toggleMutePair(i) {
  const pid = PAIRS[i].pingala.id, iid = PAIRS[i].ida.id;
  const newMuted = !(mutedOscs[pid] && mutedOscs[iid]); // si pas déjà tout coupé → on coupe
  mutedOscs[pid] = newMuted;
  mutedOscs[iid] = newMuted;
  const np = nodes[pid], ni = nodes[iid];
  if (np) safeRamp(np.g.gain, newMuted ? 0 : PAIRS[i].pingala.vol, 0.4);
  if (ni) safeRamp(ni.g.gain, newMuted ? 0 : PAIRS[i].ida.vol, 0.4);
  updatePairUI(i); updateMasterState(); saveState();
}
function toggleMuteI(i) {
  const iid = PAIRS[i].ida.id;
  mutedOscs[iid] = !mutedOscs[iid];
  const node = nodes[iid];
  if (node) safeRamp(node.g.gain, mutedOscs[iid] ? 0 : PAIRS[i].ida.vol, 0.5);
  updatePairUI(i); updateMasterState(); saveState();
}
function setVolP(i, vol) {
  PAIRS[i].pingala.vol = vol;
  const pid = PAIRS[i].pingala.id;
  const d = document.getElementById('o-pvol-'+i); if (d) d.textContent = vol.toFixed(2);
  const node = nodes[pid]; if (node && !mutedOscs[pid]) safeRamp(node.g.gain, vol, 0.3);
  saveState();
}
function setVolI(i, vol) {
  PAIRS[i].ida.vol = vol;
  const iid = PAIRS[i].ida.id;
  const d = document.getElementById('o-ivol-'+i); if (d) d.textContent = vol.toFixed(2);
  const node = nodes[iid]; if (node && !mutedOscs[iid]) safeRamp(node.g.gain, vol, 0.3);
  saveState();
}
function setMasterVol(v) {
  masterVol = Math.max(0, Math.min(1, parseFloat(v)));
  if (masterGain) safeRamp(masterGain.gain, masterVol, 0.3);
  const d = document.getElementById('mvol-val');
  if (d) d.textContent = Math.round(masterVol*100) + '%';
  saveState();
}
function setMasterFreq(f) {
  masterFreq = Math.max(F_MIN, Math.min(432, f));
  updateDisplay();
  if (flowing) PAIRS.forEach((_, i) => {
    tuneOsc(PAIRS[i].pingala.id, calcPFreq(i));
    tuneOsc(PAIRS[i].ida.id,     calcIFreq(i));
  });
  saveState();
}

function deltaStep(delta) {
  setGlobalDelta(Math.round(Math.max(0.1, Math.min(36, globalDelta + delta)) * 10) / 10);
}
function setGlobalDelta(raw) {
  const d = Math.round(Math.max(0.1, Math.min(36, parseFloat(raw))) * 10) / 10;
  if (isNaN(d)) return;
  globalDelta = d;
  PAIRS.forEach((pair, i) => {
    pair.ida.delta = d;
    updatePairUI(i);
    if (flowing) tuneOsc(pair.ida.id, calcIFreq(i));
  });
  const ws  = waveState(d);
  const gws = document.getElementById('global-ws');
  if (gws) { gws.textContent = ws.s; gws.style.color = ws.c; }
  const gdi = document.getElementById('global-delta-input');
  if (gdi && document.activeElement !== gdi) gdi.value = d.toFixed(1);
  saveState();
}

// Rafraîchit l'affichage binaural sans imposer un battement unique à toutes les paires.
function syncDeltaUI() {
  PAIRS.forEach((_, i) => updatePairUI(i));
  const ws  = waveState(globalDelta);
  const gws = document.getElementById('global-ws');
  if (gws) { gws.textContent = ws.s; gws.style.color = ws.c; }
  const gdi = document.getElementById('global-delta-input');
  if (gdi && document.activeElement !== gdi) gdi.value = globalDelta.toFixed(1);
}

function nDecrement(i) { setN(i, Math.max(0.1, Math.round((PAIRS[i].pingala.n - 0.1)*10)/10)); }
function nIncrement(i) { setN(i, Math.round((PAIRS[i].pingala.n + 0.1)*10)/10); }
function nReset(i) {
  PAIRS[i].pingala.n = (i === MASTER_IDX) ? 1.0 : 0.2 + (i*0.5);
  updatePairUI(i);
  if (flowing) swapPDebounced(i);
}
function nRandom(i) {
  PAIRS[i].pingala.n = Math.round((0.1 + Math.random()*5.0)*10)/10;
  updatePairUI(i);
  if (flowing) swapPDebounced(i);
}

function masterStep(delta) {
  setMasterFreq(Math.max(F_MIN, Math.min(432, masterFreq + delta)));
}
function onMasterInput(raw) {
  const v = parseInt(raw);
  if (isNaN(v) || v < F_MIN || v > 432) return;
  masterFreq = v;
  const msf = document.getElementById('ms-freq'); if (msf) msf.textContent = v;
  document.title = 'FBF ' + v;
  PAIRS.forEach((pair, i) => {
    const pF = calcPFreq(i);
    const iF = calcIFreq(i);
    if (flowing) { tuneOsc(pair.pingala.id, pF); tuneOsc(pair.ida.id, iF); }
    const pf  = document.getElementById('pfreq-'+i); if (pf)  pf.textContent  = fmtFreq(pF);
    const iff = document.getElementById('ifreq-'+i); if (iff) iff.textContent = fmtFreq(iF);
    const vpf = document.getElementById('vp-pf-'+i); if (vpf) vpf.textContent = fmtShort(pF);
  });
}
function onMasterChange(raw) {
  const v = Math.max(F_MIN, Math.min(432, parseInt(raw)));
  if (!isNaN(v)) setMasterFreq(v);
}

// FBF toggle — Rayonner / Dissoudre
function fbfToggle() {
  if (flowing) stopFlow(); else startFlow();
}

// ── Densité n recalculée selon la fréquence maître (points 8 & 9) ──
// Palette de densité ; pas plus fins quand le maître est haut (>360 Hz).
function densityScheme(master) {
  return master > F_SEUIL
    ? [0.03, 0.06, 0.09, 0.12, 0.15, 0.18]   // maître haut → granularité fine
    : [0.09, 0.12, 0.18, 0.24, 0.30, 0.36];  // maître bas/moyen → densité de base
}
// Monte n par octaves pour rester audible (≥ F_MIN) sans dépasser N_MAX (=1).
function fitDensityN(master, ratio, baseN) {
  let n = baseN, guard = 0;
  while (master * ratio * n < F_MIN && n < N_MAX && guard++ < 8) n = Math.min(N_MAX, n * 2);
  return Math.min(N_MAX, Math.round(n * 100) / 100);
}

// AÉRATION : cible fréquentielle log-espacée par paire, étalée selon `spread`.
// spread=0 → tout regroupé au médium (~146 Hz) ; spread=1 → étalé sur 54–396.
function aeratedN(master, ratio, idx, spread) {
  const GEO = Math.sqrt(F_MIN * F_MAX);                       // ~146 Hz (centre géométrique)
  const anchor = F_MIN * Math.pow(F_MAX / F_MIN, (idx + 0.5) / 6); // étage log de la paire
  const target = GEO * Math.pow(anchor / GEO, spread);       // spread = ouverture de l'éventail
  let n = target / (master * ratio);
  return Math.max(0.03, Math.min(N_MAX, Math.round(n * 100) / 100));
}

// Indice de ratio le plus proche d'une valeur cible dans RATIO_OPTS
function closestRatioIdx(target) {
  return RATIO_OPTS.reduce((best, o, i) =>
    Math.abs(o.r - target) < Math.abs(RATIO_OPTS[best].r - target) ? i : best, 0);
}

function triggerMagicAuto(opts) {
  const keepMaster = !!(opts && opts.keepMaster);
  const spread = RAND_OPTS.spread;

  // ── MAÎTRE = fondamentale (varie sur tap, sauf verrou de fréquence) ─
  const masterLocked = (typeof isLocked === 'function' && isLocked(MASTER_IDX)) || keepMaster;
  // Fondamentales graves 432-family (la pile harmonique tient dans 54–566)
  const FUND_POOL = [108, 120, 135, 144, 162, 180];
  const newMaster = masterLocked ? masterFreq
    : FUND_POOL[Math.floor(Math.random() * FUND_POOL.length)];

  // ── Δ binaural DOUX (thêta/alpha, relaxant) ───────────────────────
  const DELTAS = [3, 4, 5, 6, 7.83];
  const baseDelta = DELTAS[Math.floor(Math.random() * DELTAS.length)];

  // ── Ratios OmcV en MIROIR, étalés par OCTAVES (aération douce) ────
  // 3 paires-miroir : (0,1)=(11/10,10/11) · (2,3)=(12/11,11/12) · (4,5)=(12/10,10/12)
  // Chaque paire-miroir posée sur une octave différente → 3 étages, shimmer OmcV.
  const OCTAVES = [1, 2, 0.5];                  // registres : médium · aigu · grave
  if (Math.random() < 0.5) OCTAVES.reverse();   // crescendo / decrescendo
  const RI_ORDER = [0, 1, 2, 3, 4, 5];          // miroirs consécutifs

  PAIRS.forEach((pair, idx) => {
    if (typeof isLocked === 'function' && isLocked(idx)) return;

    if (idx === MASTER_IDX) {
      pair.pingala.ri = 0; pair.pingala.n = 1.0;
      pair.ida.delta = baseDelta; pair.ida.polarity = 1;
      const pf = Math.min(432, newMaster);
      pair.pingala.vol = isosonicVol(pf, 0.11);
      pair.ida.vol     = isosonicVol(pf, 0.11);
      return;
    }

    const ri  = RI_ORDER[idx];                  // ratio OmcV
    const oct = OCTAVES[Math.floor(idx / 2)];   // paires 0-1→oct0, 2-3→oct1, 4-5→oct2
    pair.pingala.ri = ri;
    pair.pingala.n  = oct;                       // freq = maître × ratioOmcV × octave
    pair.ida.delta  = baseDelta;
    pair.ida.polarity = (idx % 2 === 0) ? 1 : -1; // miroir de polarité

    const pf = Math.max(F_MIN, Math.min(F_MAX, newMaster * RATIO_OPTS[ri].r * oct));
    pair.pingala.vol = isosonicVol(pf, 0.085);   // doux
    pair.ida.vol     = isosonicVol(pf, 0.085);

    OSC_FILTER[pair.pingala.id] = { cutoff: 3200, res: 0.707, hp: 20 };
    OSC_FILTER[pair.ida.id]     = { cutoff: 3200, res: 0.707, hp: 20 };
  });

  // Éventail stéréo selon le spread
  OSC_PAN = buildOscPan(0.35 + spread * 0.6);

  setMasterFreq(newMaster);
  // Applique volumes + pan + filtres sur les nœuds vivants
  if (flowing) PAIRS.forEach((pair, i) => {
    const pid = pair.pingala.id, iid = pair.ida.id;
    if (nodes[pid] && !mutedOscs[pid]) safeRamp(nodes[pid].g.gain, pair.pingala.vol, 0.4);
    if (nodes[iid] && !mutedOscs[iid]) safeRamp(nodes[iid].g.gain, pair.ida.vol, 0.4);
    if (nodes[pid]?.p && OSC_PAN[i]) nodes[pid].p.pan.setTargetAtTime(OSC_PAN[i][0], aNow(), 0.15);
    if (nodes[iid]?.p && OSC_PAN[i]) nodes[iid].p.pan.setTargetAtTime(OSC_PAN[i][1], aNow(), 0.15);
    if (i !== MASTER_IDX) {
      setOscFilter(pid, OSC_FILTER[pid].cutoff, OSC_FILTER[pid].res);
      setOscFilter(iid, OSC_FILTER[iid].cutoff, OSC_FILTER[iid].res);
      if (typeof setOscHPF === 'function') { setOscHPF(pid, OSC_FILTER[pid].hp); setOscHPF(iid, OSC_FILTER[iid].hp); }
    }
  });
  // Random FX DÉCOUPLÉ : le random fréquence ne déclenche plus les FX
  // (évite le double calcul). Utiliser le bouton jaune Random FX.
  if (!flowing) startFlow();
  buildVesicaPairs();
  patchRandomTable();
  saveState();

  const btn = document.getElementById('btn-rand-dock');
  if (btn) { btn.style.color='#fff'; setTimeout(()=>{if(btn)btn.style.color='';},400); }
}

function toggleFullscreen() {
  const btn = document.getElementById('btn-fs') || document.getElementById('btn-fullscreen');
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function(){});
    if (btn) btn.textContent = '✕';
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    try { screen.orientation.unlock(); } catch(e) {}
    if (btn) btn.textContent = '⛶';
  }
}

function resetAll() {
  if (flowing) return;
  masterFreq = 252; globalDelta = 4.0; masterVol = 0.8;
  PAIRS.forEach((p, i) => {
    p.pingala.ri = i % RATIO_OPTS.length;
    p.pingala.n  = (i === MASTER_IDX) ? 1.0 : 0.2 + (i*0.5);
    p.pingala.vol = .12;
    p.ida.delta   = DEFAULT_DELTAS[i];   // battements distincts & doux (plus de lock)
    p.ida.polarity = (i % 2 === 0) ? 1 : -1;
    p.ida.vol     = .12;
    mutedOscs[p.pingala.id] = false;
    mutedOscs[p.ida.id]     = false;
  });
  PAIRS[MASTER_IDX].pingala.vol = .14;
  PAIRS[MASTER_IDX].ida.vol     = .14;
  try { localStorage.removeItem(LS_KEY); } catch(e) {}
  const mvs = document.getElementById('mvol-slider'); if (mvs) mvs.value = 0.8;
  const mvv = document.getElementById('mvol-val');    if (mvv) mvv.textContent = '80%';
  updateDisplay();
  setGlobalDelta(1.8);
}
