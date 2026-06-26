/* ═══════════════════════════════════════════
   05-controls.js — Contrôles oscillateurs & UI
   ═══════════════════════════════════════════ */

// ── Options mode aléatoire ────────────────────────────────────────
const RAND_OPTS={freqMin:36,freqMax:864,ratioMode:'random',useFX:false,rangeOn:false};
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
  masterFreq = Math.max(36, Math.min(864, f));
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
  setMasterFreq(Math.max(36, Math.min(864, masterFreq + delta)));
}
function onMasterInput(raw) {
  const v = parseInt(raw);
  if (isNaN(v) || v < 36 || v > 864) return;
  masterFreq = v;
  const msf = document.getElementById('ms-freq'); if (msf) msf.textContent = v;
  document.title = 'FBF ' + v;
  PAIRS.forEach((pair, i) => {
    const pF = Math.max(36, Math.min(864, v * RATIO_OPTS[pair.pingala.ri].r * pair.pingala.n));
    const iF = Math.max(36, Math.min(864, pF + pair.ida.polarity * pair.ida.delta));
    if (flowing) { tuneOsc(pair.pingala.id, pF); tuneOsc(pair.ida.id, iF); }
    const pf  = document.getElementById('pfreq-'+i); if (pf)  pf.textContent  = fmtFreq(pF);
    const iff = document.getElementById('ifreq-'+i); if (iff) iff.textContent = fmtFreq(iF);
    const vpf = document.getElementById('vp-pf-'+i); if (vpf) vpf.textContent = fmtShort(pF);
  });
}
function onMasterChange(raw) {
  const v = Math.max(36, Math.min(864, parseInt(raw)));
  if (!isNaN(v)) setMasterFreq(v);
}

// FBF toggle — Rayonner / Dissoudre
function fbfToggle() {
  if (flowing) stopFlow(); else startFlow();
}

function triggerMagicAuto() {
  const {freqMin,freqMax,rangeOn,useFX}=RAND_OPTS;
  const lo = rangeOn ? freqMin : 36;
  const hi = rangeOn ? freqMax : 432;

  // ── 1. Ratio-graine : UN seul ratio tire tout le champ ───────────
  const seedRi  = Math.floor(Math.random() * RATIO_OPTS.length);
  const seedR   = RATIO_OPTS[seedRi].r;
  // Inverse du ratio-graine (paires en miroir)
  const invRi   = RATIO_OPTS.reduce((best,r,i) =>
    Math.abs(r.r - 1/seedR) < Math.abs(RATIO_OPTS[best].r - 1/seedR) ? i : best, 0);
  // Ratio composé (seedR²), cherche le plus proche dans le pool
  const sq      = seedR * seedR;
  const sqRi    = RATIO_OPTS.reduce((best,r,i) =>
    Math.abs(r.r - sq) < Math.abs(RATIO_OPTS[best].r - sq) ? i : best, 0);

  // Schéma d'assignation des 6 paires : R / 1/R / R / 1/R / R² / 1/R
  const RI_SCHEME = [seedRi, invRi, seedRi, invRi, sqRi, invRi];

  // ── 2. n = densités fixes par position hexagonale ─────────────────
  // Centre plus dense (fondamental), périphérie plus légère
  const N_SCHEME = [1.0, 2.0, 0.5, 1.5, 3.0, 0.75];

  // ── 3. Delta-base + multiplicateurs cohérents ─────────────────────
  const BASE_DELTAS = [0.5, 1.0, 1.5, 1.8, 2.1, 3.5, 4.0, 6.0, 7.83];
  const baseDelta   = BASE_DELTAS[Math.floor(Math.random() * BASE_DELTAS.length)];
  const D_MULT      = [1, 2, 0.5, 3, 1.5, 4]; // multiplicateurs par paire

  // ── 4. Nouvelle fréquence maître via ratio-graine ─────────────────
  const newMaster = Math.max(lo, Math.min(hi, Math.round(masterFreq * seedR)));

  PAIRS.forEach((pair, idx) => {
    if (idx === MASTER_IDX) {
      pair.pingala.ri = seedRi;
      pair.pingala.n  = 1.0;
      pair.ida.delta  = baseDelta;
    } else {
      pair.pingala.ri = RI_SCHEME[idx];
      pair.pingala.n  = N_SCHEME[idx];
      pair.ida.delta  = Math.max(0.1, Math.min(36,
        Math.round(baseDelta * D_MULT[idx] * 10) / 10));
    }
    const pf   = Math.max(36, Math.min(432,
      newMaster * RATIO_OPTS[pair.pingala.ri].r * pair.pingala.n));
    const base = idx === MASTER_IDX ? 0.14 : 0.12;
    pair.pingala.vol  = isosonicVol(pf, base);
    pair.ida.vol      = isosonicVol(pf, base);
    pair.ida.polarity = Math.random() > 0.5 ? 1 : -1;
  });

  setMasterFreq(newMaster);
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
