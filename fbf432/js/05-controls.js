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
function randomizeFX(){
  const delT  = +(0.08 + Math.random() * 0.9).toFixed(2);
  const delFB = +(Math.random() * 0.5).toFixed(2);
  const delW  = +(Math.random() * 0.3).toFixed(2);
  const revW  = +(Math.random() * 0.45).toFixed(2);
  const eqLF  = Math.round(50  + Math.random() * 300);
  const eqLG  = Math.round((Math.random() * 16 - 8) * 10) / 10;
  const eqMF  = Math.round(300 + Math.random() * 3000);
  const eqMG  = Math.round((Math.random() * 16 - 8) * 10) / 10;
  const eqHF  = Math.round(3000 + Math.random() * 9000);
  const eqHG  = Math.round((Math.random() * 16 - 8) * 10) / 10;
  [['eqLowFreq',eqLF],['eqLowGain',eqLG],['eqMidFreq',eqMF],['eqMidGain',eqMG],
   ['eqHighFreq',eqHF],['eqHighGain',eqHG],['delayTime',delT],['delayFeedback',delFB],
   ['delayWet',delW],['reverbWet',revW]].forEach(([id,val])=>{
    const sl = document.getElementById(id); if (sl) sl.value = val;
    if (typeof updateFX === 'function') updateFX(id, val);
  });
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
  const spread = RAND_OPTS.spread, useFX = RAND_OPTS.useFX;

  // ── 1. Fréquence maître = SOURCE (jamais > 432) ───────────────────
  // Le maître reste la base ; le random le garde s'il est verrouillé.
  const masterLocked = (typeof isLocked === 'function' && isLocked(MASTER_IDX)) || keepMaster;
  const newMaster = masterLocked ? masterFreq
    : Math.max(F_MIN, Math.min(432, masterFreq)); // pas de saut sauvage : on garde la source

  // ── 2. Binaural global : un seul Δ, appliqué ± à toutes les paires ─
  const BASE_DELTAS = [0.5, 1.0, 1.5, 1.8, 2.1, 3.5, 4.0, 7.83];
  const baseDelta   = BASE_DELTAS[Math.floor(Math.random() * BASE_DELTAS.length)];

  // ── 3. Une graine miroir par bande (ratios miroir R / 1/R) ────────
  const bandData = FBF_BANDS.map(([blo, bhi]) => {
    const geoC = Math.sqrt(blo * bhi);
    // léger jeu autour du centre + ouverture selon spread
    const seed = geoC * (1 + (Math.random() - 0.5) * 0.2 * (0.4 + spread));
    const maxR = Math.min(bhi / seed, seed / blo);            // garde R et 1/R dans la bande
    const cands = RATIO_OPTS.map((o, i) => ({ i, r: o.r })).filter(o => o.r >= 1.0 && o.r <= maxR);
    const pick  = cands.length ? cands[Math.floor(Math.random() * cands.length)] : { i: closestRatioIdx(1), r: 1 };
    return { seed, Ri: pick.i, invRi: closestRatioIdx(1 / pick.r) };
  });

  PAIRS.forEach((pair, idx) => {
    if (typeof isLocked === 'function' && isLocked(idx)) return;

    if (idx === MASTER_IDX) {
      pair.pingala.n = 1.0;
      pair.ida.delta = baseDelta;
      pair.ida.polarity = 1;
      const pf = Math.min(432, newMaster);
      pair.pingala.vol = isosonicVol(pf, 0.14);
      pair.ida.vol     = isosonicVol(pf, 0.14);
      return;
    }

    const b = PAIR_BAND[idx];
    const bd = bandData[b];
    const isFirst = (idx % 2 === 0);              // 0,2,4 = première paire de la bande
    // Ratios miroir : une paire monte, l'autre descend (polarité 432)
    pair.pingala.ri  = isFirst ? bd.invRi : bd.Ri;
    pair.pingala.n   = bd.seed / newMaster;       // freq = master × ratio × n = seed × ratio
    pair.ida.delta   = baseDelta;                 // même Δ binaural partout
    pair.ida.polarity = isFirst ? -1 : 1;         // ± appliqué vers IDA

    const pf = Math.max(F_MIN, Math.min(F_MAX, newMaster * RATIO_OPTS[pair.pingala.ri].r * pair.pingala.n));
    pair.pingala.vol = isosonicVol(pf, 0.12);
    pair.ida.vol     = isosonicVol(pf, 0.12);

    // Filtres par bande :
    //  · bande basse (54-144)  → low-cut (passe-haut) 100 Hz : nettoie le sub profond
    //  · bande haute (288-566) → lowpass 200 Hz : aération, anti-agressivité
    const cut = (b === 2) ? 200 : 6000;
    const hp  = (b === 0) ? 100 : 20;
    OSC_FILTER[pair.pingala.id] = { cutoff: cut, res: 0.707, hp };  // Q neutre = pas de surtension
    OSC_FILTER[pair.ida.id]     = { cutoff: cut, res: 0.707, hp };
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
  if (useFX) randomizeFX();
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
  masterFreq = 252; globalDelta = 1.8; masterVol = 0.8;
  PAIRS.forEach((p, i) => {
    p.pingala.ri = i % RATIO_OPTS.length;
    p.pingala.n  = (i === MASTER_IDX) ? 1.0 : 0.2 + (i*0.5);
    p.pingala.vol = .12;
    p.ida.delta   = 1.8;
    p.ida.polarity = 1;
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
