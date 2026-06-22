/* ═══════════════════════════════════════════
   06-ui-builders.js — HTML builders & affichage
   ═══════════════════════════════════════════ */

// ── EQ 2D Parametric Canvas ───────────────────────────────────────
const EQ_BANDS=[
  {id:'low', freq:200, gain:0,color:'#60D8FF',type:'lowshelf', fMin:20,  fMax:600,  label:'BAS'},
  {id:'mid', freq:1000,gain:0,color:'#FFD060',type:'peak',     fMin:200, fMax:6000, label:'MID'},
  {id:'high',freq:5000,gain:0,color:'#FF8EFF',type:'highshelf',fMin:2000,fMax:20000,label:'HAUT'},
];
var _eqDrag=null;
function _f2x(f,w){return w*Math.log(f/20)/Math.log(1000);}
function _x2f(x,w){return 20*Math.pow(1000,x/w);}
function _g2y(g,h){return h*(1-(g+18)/36);}
function _y2g(y,h){return(1-y/h)*36-18;}
function _eqCurveY(f){
  let s=0;
  EQ_BANDS.forEach(b=>{
    if(b.type==='lowshelf')s+=b.gain*(1-Math.min(1,Math.max(0,Math.log(f/b.freq)/Math.log(4))));
    else if(b.type==='highshelf')s+=b.gain*Math.min(1,Math.max(0,Math.log(f/b.freq)/Math.log(4)));
    else s+=b.gain*Math.exp(-0.5*Math.pow(Math.log(f/b.freq)/1.5,2));
  });
  return Math.max(-18,Math.min(18,s));
}
function drawEQ2D(cv){
  if(!cv)return;
  const W=cv.offsetWidth||240,H=cv.offsetHeight||110;
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='rgba(4,2,16,.9)';ctx.fillRect(0,0,W,H);
  // Grid
  [50,100,200,500,1000,2000,5000,10000].forEach(f=>{
    if(f>20000)return;
    const x=_f2x(f,W);
    ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
    if(f>=100){ctx.fillStyle='rgba(255,255,255,.2)';ctx.font=`${Math.max(7,W*.028)}px monospace`;
      ctx.fillText(f>=1000?(f/1000)+'k':f,x+2,H-3);}
  });
  // 0 dB line
  const y0=_g2y(0,H);
  ctx.strokeStyle='rgba(255,255,255,.1)';ctx.setLineDash([3,4]);
  ctx.beginPath();ctx.moveTo(0,y0);ctx.lineTo(W,y0);ctx.stroke();ctx.setLineDash([]);
  // EQ curve
  const N=100;
  ctx.beginPath();
  for(let i=0;i<=N;i++){const f=20*Math.pow(1000,i/N);const x=_f2x(f,W);const y=_g2y(_eqCurveY(f),H);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
  ctx.strokeStyle='rgba(160,210,255,.6)';ctx.lineWidth=1.5;ctx.stroke();
  ctx.lineTo(W,y0);ctx.lineTo(0,y0);ctx.closePath();
  ctx.fillStyle='rgba(80,150,255,.06)';ctx.fill();
  // Band nodes
  EQ_BANDS.forEach(b=>{
    const x=_f2x(b.freq,W),y=_g2y(b.gain,H);
    ctx.shadowColor=b.color;ctx.shadowBlur=10;
    ctx.fillStyle=b.color+'99';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=b.color;ctx.font=`bold ${Math.max(7,W*.03)}px monospace`;ctx.fillText(b.label,x+8,y-5);
    ctx.fillStyle='rgba(255,255,255,.5)';ctx.font=`${Math.max(6,W*.026)}px monospace`;
    ctx.fillText(b.freq>=1000?(b.freq/1000).toFixed(1)+'k':Math.round(b.freq),x+8,y+7);
    ctx.fillText((b.gain>=0?'+':'')+b.gain.toFixed(1)+'dB',x+8,y+16);
  });
}
function _eqApply(bi){
  const b=EQ_BANDS[bi];
  if(bi===0&&typeof eqLow!=='undefined'&&eqLow){eqLow.frequency.value=b.freq;eqLow.gain.value=b.gain;}
  if(bi===1&&typeof eqMid!=='undefined'&&eqMid){eqMid.frequency.value=b.freq;eqMid.gain.value=b.gain;}
  if(bi===2&&typeof eqHigh!=='undefined'&&eqHigh){eqHigh.frequency.value=b.freq;eqHigh.gain.value=b.gain;}
}
function initEQ2D(cv){
  if(!cv)return;
  if(cv.offsetWidth<10){requestAnimationFrame(()=>initEQ2D(cv));return;}
  if(cv._eq2d)return;cv._eq2d=true;
  const getXY=(e)=>{const r=cv.getBoundingClientRect();const s=e.touches?e.touches[0]:e;return{x:s.clientX-r.left,y:s.clientY-r.top};};
  const findBand=(x,y)=>EQ_BANDS.findIndex(b=>{const W=cv.offsetWidth,H=cv.offsetHeight;return Math.hypot(x-_f2x(b.freq,W),y-_g2y(b.gain,H))<18;});
  const drag=(x,y)=>{
    if(_eqDrag===null||_eqDrag<0)return;
    const b=EQ_BANDS[_eqDrag],W=cv.offsetWidth,H=cv.offsetHeight;
    b.freq=Math.max(b.fMin,Math.min(b.fMax,_x2f(x,W)));
    b.gain=Math.max(-18,Math.min(18,_y2g(y,H)));
    _eqApply(_eqDrag);drawEQ2D(cv);
  };
  cv.addEventListener('mousedown',e=>{const{x,y}=getXY(e);_eqDrag=findBand(x,y);if(_eqDrag>=0)e.preventDefault();});
  window.addEventListener('mousemove',e=>{if(_eqDrag===null||_eqDrag<0)return;const r=cv.getBoundingClientRect();drag(e.clientX-r.left,e.clientY-r.top);});
  window.addEventListener('mouseup',()=>{_eqDrag=null;});
  cv.addEventListener('touchstart',e=>{const{x,y}=getXY(e);_eqDrag=findBand(x,y);if(_eqDrag>=0)e.preventDefault();},{passive:false});
  cv.addEventListener('touchmove',e=>{if(_eqDrag===null||_eqDrag<0)return;e.preventDefault();const r=cv.getBoundingClientRect();drag(e.touches[0].clientX-r.left,e.touches[0].clientY-r.top);},{passive:false});
  cv.addEventListener('touchend',()=>{_eqDrag=null;});
  (function loop(){drawEQ2D(cv);requestAnimationFrame(loop);})();
}

// ── Mini frequency table (bottom left) ───────────────────────────
function buildFreqMini() {
  const wrap = document.getElementById('freq-mini');
  if (!wrap) return;
  const head = wrap.querySelector('.fmini-head');
  wrap.innerHTML = '';
  if (head) wrap.appendChild(head);
  else { const h=document.createElement('div'); h.className='fmini-head'; h.textContent='Hz · Ratio · N'; wrap.appendChild(h); }
  PAIRS.forEach((pair, i) => {
    const pF = calcPFreq(i);
    const row = document.createElement('div');
    row.className = 'fmini-row';
    row.innerHTML = `
      <span class="fmini-dot" style="background:${pair.color}cc" id="fmini-dot-${i}"></span>
      <span class="fmini-freq"  id="fmini-f-${i}" style="color:${pair.color}">${pF.toFixed(0)} Hz</span>
      <span class="fmini-ratio" id="fmini-r-${i}" style="color:${pair.color}bb">${RATIO_OPTS[pair.pingala.ri].l}</span>
      <span class="fmini-n"     id="fmini-n-${i}" style="color:${pair.color}88">×${pair.pingala.n}</span>`;
    wrap.appendChild(row);
  });
}

function patchFreqMini() {
  PAIRS.forEach((pair, i) => {
    const pF = calcPFreq(i);
    const f = document.getElementById('fmini-f-'+i); if (f) f.textContent = pF.toFixed(0)+' Hz';
    const r = document.getElementById('fmini-r-'+i); if (r) r.textContent = RATIO_OPTS[pair.pingala.ri].l;
    const n = document.getElementById('fmini-n-'+i); if (n) n.textContent = '×'+pair.pingala.n;
  });
}

// ── Geometry grid (Paramètres 3D panel) ──────────────────────────
function buildGeoGrid() {
  const grid = document.getElementById('geo-grid');
  if (!grid) return;
  grid.innerHTML = GEO_NAMES.map((name, i) =>
    `<button class="geometry-btn${i===activeGeometry?' active':''}" onclick="setGeometry(${i})">${name}</button>`
  ).join('');
}

// ── Random table (Jeu Aléatoire panel) ───────────────────────────
function buildRandomTable() {
  const wrap = document.getElementById('random-table');
  if (!wrap) return;
  wrap.innerHTML = PAIRS.map((pair, i) => {
    const pF = calcPFreq(i);
    return `<div class="rand-row" style="background:${pair.color}11;border:1px solid ${pair.color}33;">
      <span class="rand-dot" style="background:${pair.color}"></span>
      <span class="rand-freq"  id="rt-f-${i}" style="color:${pair.color}">${pF.toFixed(1)} Hz</span>
      <span class="rand-ratio" id="rt-r-${i}" style="color:${pair.color}bb">${RATIO_OPTS[pair.pingala.ri].l}</span>
      <span class="rand-n"     id="rt-n-${i}" style="color:${pair.color}88">×${pair.pingala.n}</span>
    </div>`;
  }).join('');
}

function patchRandomTable() {
  PAIRS.forEach((pair, i) => {
    const pF = calcPFreq(i);
    const f = document.getElementById('rt-f-'+i); if (f) f.textContent = pF.toFixed(1)+' Hz';
    const r = document.getElementById('rt-r-'+i); if (r) r.textContent = RATIO_OPTS[pair.pingala.ri].l;
    const n = document.getElementById('rt-n-'+i); if (n) n.textContent = '×'+pair.pingala.n;
  });
}

// ── FBF hz + state ────────────────────────────────────────────────
function patchFBFHz() {
  const el = document.getElementById('fbf-hz');
  if (el) el.textContent = masterFreq;
}

function patchFBFState() {
  const btn  = document.getElementById('fbf-btn');
  const stEl = document.getElementById('fbf-state');
  const fBtn = document.getElementById('flux-btn');
  const fIcon= document.getElementById('flux-icon');
  const fSt  = document.getElementById('flux-state-side');
  const fTxt = document.getElementById('flux-txt');

  if (btn)  btn.classList.toggle('flowing', !!flowing);
  if (stEl) stEl.textContent = flowing ? '◉ Rayonnant' : '⬤ Veille';
  if (fBtn) fBtn.classList.toggle('flowing', !!flowing);
  if (fIcon) fIcon.textContent = flowing ? '◉' : '◎';
  if (fSt)  fSt.textContent   = flowing ? 'ON'  : 'OFF';
  if (fTxt) fTxt.style.color  = flowing ? '#63E6FF' : '';
}

// ── Spectroid bar ─────────────────────────────────────────────────
function _drawSpectroidOnCanvas(canvas) {
  if (!canvas) return;
  const parent = canvas.parentElement; if (!parent) return;
  const pw = parent.clientWidth, ph = parent.clientHeight;
  if (pw > 0 && (canvas.width !== pw || canvas.height !== ph)) { canvas.width = pw; canvas.height = ph; }
  const ctx = canvas.getContext('2d');
  if (!flowing || !analyser) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(180,190,220,.18)'; ctx.font = 'italic 11px IM Fell English';
    ctx.textAlign = 'center';
    ctx.fillText('· en attente de rayonnement ·', canvas.width/2, canvas.height/2+4);
    return;
  }
  const values = analyser.getValue();
  ctx.fillStyle = 'rgba(5,3,18,.7)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath(); ctx.lineWidth = 2;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0,'rgba(180,190,220,.6)'); grad.addColorStop(.25,'rgba(220,200,255,.9)');
  grad.addColorStop(.5,'rgba(255,255,255,.95)'); grad.addColorStop(.75,'rgba(200,220,255,.9)');
  grad.addColorStop(1,'rgba(160,180,220,.6)');
  ctx.strokeStyle = grad;
  const sliceW = canvas.width / values.length; let x = 0;
  for (let i = 0; i < values.length; i++) {
    const y = (values[i] * 1.4 + 1) * canvas.height / 2;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); x += sliceW;
  }
  ctx.stroke();
  ctx.globalAlpha = 0.28; ctx.beginPath(); x = 0;
  for (let i = 0; i < values.length; i++) {
    const y = canvas.height - (values[i] * 1.4 + 1) * canvas.height / 2;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); x += sliceW;
  }
  ctx.stroke(); ctx.globalAlpha = 1;
}
function drawSpectroidBar() {
  _drawSpectroidOnCanvas(document.getElementById('spectroid-canvas'));
  _drawSpectroidOnCanvas(document.getElementById('fx-spectroid-canvas'));
}
const drawSpectroid = drawSpectroidBar;

// ── FX panel HTML — 9 améliorations ──────────────────────────────
function buildMasterFXHTML() {
  const psRows = [0,1,2,3,4].map(s=>`
    <div class="fx-preset-row" id="ps-row-${s}">
      <span class="fx-preset-name" id="ps-name-${s}">— Vide —</span>
      <button class="fx-preset-btn load" id="ps-load-${s}" onclick="loadPreset(${s})" disabled>▶</button>
      <button class="fx-preset-btn save" onclick="savePreset(${s})">■</button>
      <button class="fx-preset-btn del"  id="ps-del-${s}"  onclick="delPreset(${s})"  disabled>✕</button>
    </div>`).join('');
  return `<div class="fx-panel">
    <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.4rem;">
      <div class="dot" id="dot"></div>
      <span id="stxt" style="font-size:.9rem;font-style:italic;letter-spacing:.1em;color:rgba(200,170,255,.7);">Initialisation...</span>
      <span class="wave-badge" id="wave-badge"></span>
    </div>
    <div class="flow-row">
      <button class="btn-flow" id="btn-ray" onclick="startFlow()" style="border-color:#86FFC0;color:#86FFC0;background:rgba(134,255,192,0.06);">Rayonner</button>
      <button class="btn-flow" id="btn-dis" onclick="stopFlow()"  style="border-color:#FF8E8E;color:#FF8E8E;background:rgba(255,142,142,0.06);">Dissoudre</button>
    </div>
    <div class="mvol-wrap" style="margin-top:.55rem;">
      <span class="mvol-label">Volume général</span>
      <div class="mvol-row">
        <input type="range" id="mvol-slider" class="mvol-slider" min="0" max="1" step="0.01" value="0.8" oninput="setMasterVol(this.value)">
        <span class="mvol-val" id="mvol-val">80%</span>
        <button class="btn-reset" onclick="resetAll()" title="Réinitialiser">↺</button>
      </div>
    </div>
    <div class="mfreq-ctrl" style="margin-top:.38rem;">
      <div class="mfreq-label">Fréquence maître</div>
      <div class="mfreq-row">
        <button class="mfreq-btn sm" onclick="masterStep(-1)">−</button>
        <input type="number" id="master-input" class="mfreq-input" min="36" max="648" value="432" step="1" oninput="onMasterInput(this.value)" onchange="onMasterChange(this.value)">
        <button class="mfreq-btn" onclick="masterStep(1)">+</button>
      </div>
      <div class="mfreq-range">36 — 648 Hz</div>
    </div>
    <div class="delta-sphere-wrap" style="margin-top:.5rem;">
      <div class="delta-sphere-label">Battement Binaural Global</div>
      <div class="delta-sphere-row">
        <button class="delta-sphere-btn" onclick="deltaStep(-0.1)">−</button>
        <div class="delta-sphere-val">
          <input type="number" class="delta-sphere-num" id="global-delta-input" min="0.1" max="36" step="0.1" value="1.8" oninput="setGlobalDelta(this.value)" onchange="setGlobalDelta(this.value)">
          <span class="delta-sphere-wave" id="global-ws">Delta</span>
          <span class="delta-sphere-range">0.1 — 36 Hz</span>
        </div>
        <button class="delta-sphere-btn" onclick="deltaStep(0.1)">+</button>
      </div>
    </div>

    <!-- ① Fondu -->
    <div class="fx-block">
      <div class="fx-title">① Fondu d'entrée / sortie</div>
      <div class="fx-row">
        <div class="fx-control-group" style="flex:1">
          <span class="fx-label">Durée</span>
          <input type="range" class="fx-slider" id="fadeDur" min="0.5" max="15" step="0.5" value="2" oninput="setFadeDur(this.value)">
          <span class="fx-val-disp" id="sv-fade">2.0s</span>
        </div>
      </div>
    </div>

    <!-- ② LFO -->
    <div class="fx-block">
      <div class="fx-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>② LFO — Trémolo organique</span>
        <label class="fx-toggle"><input type="checkbox" id="lfo-on" onchange="lfoToggle(this.checked)"><span class="fx-tog-track"></span></label>
      </div>
      <div class="fx-row">
        <div class="fx-control-group">
          <span class="fx-label">Rythme</span>
          <input type="range" class="fx-slider" id="lfo-rate" min="0.09" max="1.8" step="0.09" value="0.27" oninput="lfoSet('rate',this.value)">
          <span class="fx-val-disp" id="sv-lfo-rate">0.27</span>
        </div>
        <div class="fx-control-group">
          <span class="fx-label">Profond.</span>
          <input type="range" class="fx-slider" id="lfo-depth" min="0.09" max="0.72" step="0.09" value="0.27" oninput="lfoSet('depth',this.value)">
          <span class="fx-val-disp" id="sv-lfo-depth">0.27</span>
        </div>
      </div>
    </div>

    <!-- ③ EQ Multiband 2D — glisser les points Bas/Mid/Haut -->
    <div class="fx-block">
      <div class="fx-title">③ EQ Paramétrique 2D <span style="font-size:.68rem;font-weight:400;color:rgba(200,180,255,.5);">· glisser les points</span></div>
      <canvas id="eq2d-canvas" style="width:100%;height:115px;display:block;border-radius:8px;cursor:crosshair;touch-action:none;"></canvas>
      <!-- Hidden sliders for compat -->
      <input type="range" id="eqLowFreq"  min="20"   max="600"   value="200"  style="display:none" oninput="updateFX('eqLowFreq',this.value)">
      <input type="range" id="eqLowGain"  min="-18"  max="18"    value="0"    style="display:none" oninput="updateFX('eqLowGain',this.value)">
      <input type="range" id="eqMidFreq"  min="200"  max="6000"  value="1000" style="display:none" oninput="updateFX('eqMidFreq',this.value)">
      <input type="range" id="eqMidGain"  min="-18"  max="18"    value="0"    style="display:none" oninput="updateFX('eqMidGain',this.value)">
      <input type="range" id="eqHighFreq" min="2000" max="20000" value="5000" style="display:none" oninput="updateFX('eqHighFreq',this.value)">
      <input type="range" id="eqHighGain" min="-18"  max="18"    value="0"    style="display:none" oninput="updateFX('eqHighGain',this.value)">
      <span id="eqLowFreq-val" style="display:none">200 Hz</span><span id="eqLowGain-val" style="display:none">0 dB</span>
      <span id="eqMidFreq-val" style="display:none">1000 Hz</span><span id="eqMidGain-val" style="display:none">0 dB</span>
      <span id="eqHighFreq-val" style="display:none">5000 Hz</span><span id="eqHighGain-val" style="display:none">0 dB</span>
    </div>

    <!-- ④ Delay FX -->
    <div class="fx-block">
      <div class="fx-title">④ Delay</div>
      <div class="fx-row">
        <div class="fx-control-group">
          <span class="fx-label">Temps</span>
          <input type="range" class="fx-slider" id="delayTime" min="0.04" max="1.5" step="0.01" value="0.3" oninput="updateFX('delayTime',this.value)">
          <span class="fx-val-disp" id="delayTime-val">0.30s</span>
        </div>
        <div class="fx-control-group">
          <span class="fx-label">Feedback</span>
          <input type="range" class="fx-slider" id="delayFeedback" min="0" max="0.85" step="0.01" value="0.3" oninput="updateFX('delayFeedback',this.value)">
          <span class="fx-val-disp" id="delayFeedback-val">30%</span>
        </div>
        <div class="fx-control-group">
          <span class="fx-label">Mix</span>
          <input type="range" class="fx-slider" id="delayWet" min="0" max="1" step="0.02" value="0" oninput="updateFX('delayWet',this.value)">
          <span class="fx-val-disp" id="delayWet-val">0%</span>
        </div>
      </div>
    </div>

    <!-- ⑤ Réverbe spatiale -->
    <div class="fx-block">
      <div class="fx-title">⑤ Réverbe Spatiale</div>
      <div class="fx-space-btns">
        <button class="fx-space-btn" onclick="setReverbSpace('sec')">Sec</button>
        <button class="fx-space-btn" onclick="setReverbSpace('grotte')">Grotte</button>
        <button class="fx-space-btn" onclick="setReverbSpace('cathedrale')">Cathédrale</button>
        <button class="fx-space-btn" onclick="setReverbSpace('cosmos')">Cosmos</button>
      </div>
      <div class="fx-row" style="margin-top:.35rem;">
        <div class="fx-control-group">
          <span class="fx-label">Reverb</span>
          <input type="range" class="fx-slider" id="reverbWet" min="0" max="1" step="0.02" value="0" oninput="updateFX('reverbWet',this.value)">
          <span class="fx-val-disp" id="reverbWet-val">0%</span>
        </div>
      </div>
    </div>

    <!-- ⑥ Chorus -->
    <div class="fx-block">
      <div class="fx-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>⑥ Chorus / Ensemble</span>
        <label class="fx-toggle"><input type="checkbox" id="chorus-on" onchange="setChorusDepth(this.checked?parseFloat(document.getElementById('chorus-depth').value):0)"><span class="fx-tog-track"></span></label>
      </div>
      <div class="fx-row">
        <div class="fx-control-group">
          <span class="fx-label">Profond.</span>
          <input type="range" class="fx-slider" id="chorus-depth" min="0" max="1" step="0.01" value="0.35" oninput="if(document.getElementById('chorus-on').checked)setChorusDepth(this.value);document.getElementById('chd-val').textContent=parseFloat(this.value).toFixed(2)">
          <span class="fx-val-disp" id="chd-val">0.35</span>
        </div>
        <div class="fx-control-group">
          <span class="fx-label">Rythme</span>
          <input type="range" class="fx-slider" id="chorus-rate" min="0.1" max="8" step="0.1" value="0.8" oninput="setChorusRate(this.value);document.getElementById('chr-val').textContent=parseFloat(this.value).toFixed(1)+'Hz'">
          <span class="fx-val-disp" id="chr-val">0.8Hz</span>
        </div>
      </div>
    </div>

    <!-- ⑦ Compresseur -->
    <div class="fx-block">
      <div class="fx-title">⑦ Compresseur Dynamique</div>
      <div class="fx-row">
        <div class="fx-control-group">
          <span class="fx-label">Seuil</span>
          <input type="range" class="fx-slider" id="compThresh" min="-60" max="0" value="-24" oninput="setCompThresh(this.value);document.getElementById('compThresh-val').textContent=this.value+'dB'">
          <span class="fx-val-disp" id="compThresh-val">−24dB</span>
        </div>
        <div class="fx-control-group">
          <span class="fx-label">Ratio</span>
          <input type="range" class="fx-slider" id="compRatio" min="1" max="20" step="0.5" value="4" oninput="setCompRatio(this.value);document.getElementById('compRatio-val').textContent=this.value+':1'">
          <span class="fx-val-disp" id="compRatio-val">4:1</span>
        </div>
      </div>
    </div>

    <!-- ⑧ Spectre harmonique -->
    <div class="fx-block" style="padding-bottom:.35rem;">
      <div class="fx-title">⑧ Spectre Harmonique</div>
      <div style="height:54px;background:rgba(5,3,18,.65);border-radius:8px;overflow:hidden;">
        <canvas id="fx-spectroid-canvas" style="width:100%;height:100%;display:block;"></canvas>
      </div>
    </div>

    <!-- ⑨ Minuterie -->
    <div class="fx-block">
      <div class="fx-title">⑨ Minuterie de Méditation</div>
      <div class="fx-timer-presets">
        <button class="fx-timer-btn" onclick="timerPreset(10)">10'</button>
        <button class="fx-timer-btn" onclick="timerPreset(20)">20'</button>
        <button class="fx-timer-btn" onclick="timerPreset(30)">30'</button>
        <button class="fx-timer-btn" onclick="timerPreset(45)">45'</button>
        <button class="fx-timer-btn" onclick="timerPreset(60)">60'</button>
      </div>
      <div class="fx-timer-row">
        <div class="fx-timer-display" id="timer-display">--:--</div>
        <button class="fx-timer-start" id="btn-timer-start" onclick="timerToggle()">▶ Démarrer</button>
      </div>
    </div>

    <!-- ⑩ Presets de session -->
    <div class="fx-block">
      <div class="fx-title">⑩ Presets de Session</div>
      <div class="fx-presets-list" id="fx-presets-list">${psRows}</div>
    </div>

    <div style="text-align:center;margin-top:.4rem;padding-bottom:.5rem;">
      <button class="btn-flow" onclick="exportState()" style="padding:.45rem 1.1rem;font-size:.72rem;border-color:rgba(99,230,255,.5);color:#63E6FF;background:rgba(99,230,255,.06);">⎘ Partager Config</button>
    </div>
  </div>`;
}

// ── Horloge UT432 HTML ────────────────────────────────────────────
function buildHorloge432HTML() {
  return `<div class="h432-panel">
    <div class="h432-display">
      <div class="h432-num" id="h432-val" style="color:#FFD060;">—</div>
      <div class="h432-seuil" id="h432-seuil" style="color:rgba(255,200,80,.6);">UT432</div>
    </div>
    <div class="h432-bar-wrap">
      <div class="h432-bar-bg"><div class="h432-bar-fill" id="h432-progress" style="width:0%"></div></div>
      <div class="h432-bar-labels"><span>0</span><span>108</span><span>216</span><span>324</span><span>432</span></div>
    </div>
    <div class="h432-civil" id="h432-civil">--:--:--</div>
    <button class="btn-h432" id="btn-h432" onclick="triggerHorloge432()">⊙ Jeu UT432</button>
    <div class="h432-desc">
      <p>Le nombre UT432 mesure le temps solaire de Paris (0 → 432) en résonance avec les 9 Sephirot de la Kabbale.</p>
      <p>⊙ Jeu UT432 génère une configuration harmonique basée sur la valeur de l'instant présent.</p>
    </div>
    <div style="margin-top:.5rem;padding:.8rem;background:rgba(255,200,60,.06);border:1px solid rgba(255,200,60,.18);border-radius:10px;font-size:.65rem;font-family:'IM Fell English',serif;font-style:italic;color:rgba(255,200,100,.55);text-align:center;line-height:1.6;">
      <b>Les Seuils UT432</b><br>
      0 Kether · 54 Chokhmah · 108 Binah<br>
      162 Chesed · 216 Tiphereth · 270 Netzach<br>
      324 Hod · 378 Yesod · 432 Malkuth
    </div>
  </div>`;
}

// ── Progression HTML ──────────────────────────────────────────────
function buildProgHTML() {
  return `<div class="prog-wrap">
    <div class="prog-title">✦ Progression Harmonique ✦</div>
    <div class="prog-row">
      <span class="prog-label">Ratio</span>
      <select class="prog-select" id="prog-ratio">
        ${RATIO_OPTS.map((r,i)=>`<option value="${i}">${r.l}</option>`).join('')}
      </select>
    </div>
    <div class="prog-mode-row">
      <button class="prog-mode-btn active" id="btn-prog-up" onclick="progDir=1;this.classList.add('active');document.getElementById('btn-prog-dn').classList.remove('active')">▲ Montée</button>
      <button class="prog-mode-btn"        id="btn-prog-dn" onclick="progDir=-1;this.classList.add('active');document.getElementById('btn-prog-up').classList.remove('active')">▼ Descente</button>
    </div>
    <div class="prog-range-row">
      <span class="prog-label">Min</span>
      <input type="number" class="prog-range-input" id="prog-min" min="36" max="648" value="36">
      <span class="prog-label" style="min-width:auto;">Max</span>
      <input type="number" class="prog-range-input" id="prog-max" min="36" max="648" value="648">
    </div>
    <div class="prog-range-row">
      <span class="prog-label">Durée</span>
      <input type="number" class="prog-range-input" id="prog-dur" min="500" max="30000" step="500" value="4000">
      <span style="font-size:.75rem;color:rgba(255,210,130,.6);font-style:italic;">ms</span>
    </div>
    <div class="prog-freq-display" id="prog-display">—</div>
    <div style="display:flex;gap:.5rem;justify-content:center;">
      <button class="btn-prog" id="btn-prog-on"  onclick="startProgression()">▶ Démarrer</button>
      <button class="btn-prog" id="btn-prog-off" onclick="stopProgression()">■ Arrêter</button>
    </div>
  </div>`;
}

// ── FX helpers ────────────────────────────────────────────────────
function adjustFX(paramId, step) {
  const slider = document.getElementById(paramId); if (!slider) return;
  slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), parseFloat(slider.value)+step));
  updateFX(paramId, slider.value);
}
function updateFX(paramId, value) {
  const v = parseFloat(value);
  const valDisp = document.getElementById(paramId+'-val');
  if (paramId==='eqLowFreq')  { if(valDisp)valDisp.textContent=Math.round(v)+' Hz'; if(eqLow)eqLow.frequency.value=v; EQ_BANDS[0].freq=v; }
  else if(paramId==='eqLowGain')  { if(valDisp)valDisp.textContent=v.toFixed(1)+' dB'; if(eqLow)eqLow.gain.value=v; EQ_BANDS[0].gain=v; }
  else if(paramId==='eqMidFreq')  { if(valDisp)valDisp.textContent=Math.round(v)+' Hz'; if(eqMid)eqMid.frequency.value=v; EQ_BANDS[1].freq=v; }
  else if(paramId==='eqMidGain')  { if(valDisp)valDisp.textContent=v.toFixed(1)+' dB'; if(eqMid)eqMid.gain.value=v; EQ_BANDS[1].gain=v; }
  else if(paramId==='eqHighFreq') { if(valDisp)valDisp.textContent=Math.round(v)+' Hz'; if(eqHigh)eqHigh.frequency.value=v; EQ_BANDS[2].freq=v; }
  else if(paramId==='eqHighGain') { if(valDisp)valDisp.textContent=v.toFixed(1)+' dB'; if(eqHigh)eqHigh.gain.value=v; EQ_BANDS[2].gain=v; }
  else if(paramId==='delayTime')     { if(valDisp)valDisp.textContent=v.toFixed(2)+'s'; try{if(masterDelay)masterDelay.delayTime.value=v;}catch(e){} }
  else if(paramId==='delayFeedback') { if(valDisp)valDisp.textContent=Math.round(v*100)+'%'; try{if(masterDelayFb)masterDelayFb.gain.value=v;}catch(e){} }
  else if(paramId==='delayWet')  { if(valDisp)valDisp.textContent=Math.round(v*100)+'%'; try{if(_fxRefs&&_fxRefs.delayWet)_fxRefs.delayWet.gain.setTargetAtTime(v,aNow(),0.05);}catch(e){} }
  else if(paramId==='reverbWet') { if(valDisp)valDisp.textContent=Math.round(v*100)+'%'; try{if(reverbWetGain){_setReverbActive(v>0.001);reverbWetGain.gain.setTargetAtTime(v,aNow(),0.05);if(reverbDryGain)reverbDryGain.gain.setTargetAtTime(1-v*0.4,aNow(),0.05);}}catch(e){} }
}

// ── updateMasterState ─────────────────────────────────────────────
function updateMasterState() {
  const active = PAIRS.filter(p => !mutedOscs[p.ida.id]);
  const el    = document.getElementById('ms-state');
  const badge = document.getElementById('wave-badge');
  if (!active.length) {
    if (el)    { el.textContent='Binaural'; el.style.color='rgba(200,140,255,.5)'; }
    if (badge) { badge.textContent=''; badge.className='wave-badge'; }
    return;
  }
  const avg = active.reduce((s,p)=>s+p.ida.delta,0)/active.length;
  const ws  = waveState(avg);
  if (el)    { el.textContent=ws.s; el.style.color=ws.c; }
  if (badge && flowing) {
    badge.textContent=ws.s+' · '+avg.toFixed(2)+' Hz';
    badge.style.color=ws.c;
    badge.className='wave-badge live';
  } else if (badge) { badge.textContent=''; badge.className='wave-badge'; }
}

// ── updateDisplay ─────────────────────────────────────────────────
function updateDisplay() {
  const msf = document.getElementById('ms-freq'); if (msf) msf.textContent = masterFreq;
  const mi  = document.getElementById('master-input');
  if (mi && document.activeElement!==mi) mi.value = masterFreq;
  document.title = 'FBF '+masterFreq;
  PAIRS.forEach((_,i) => updatePairUI(i));
  updateMasterState();
  patchRandomTable();
  patchFBFHz();
}

// ── updatePairUI ──────────────────────────────────────────────────
function updatePairUI(i) {
  const pair = PAIRS[i];
  const pF   = calcPFreq(i), iF = calcIFreq(i);
  const ws   = waveState(pair.ida.delta);

  const pfreq=document.getElementById('pfreq-'+i); if(pfreq) pfreq.textContent=fmtFreq(pF);
  const ifreq=document.getElementById('ifreq-'+i); if(ifreq) ifreq.textContent=fmtFreq(iF);
  const bmf  =document.getElementById('bmf-'+i);   if(bmf)   bmf.textContent  =masterFreq;
  const brl  =document.getElementById('brl-'+i);   if(brl)   brl.textContent  =RATIO_OPTS[pair.pingala.ri].l;
  const bfn  =document.getElementById('bfn-'+i);   if(bfn)   bfn.textContent  =pair.pingala.n;
  const bfr  =document.getElementById('bfr-'+i);   if(bfr)   bfr.textContent  =fmtFreq(pF);
  const brs  =document.getElementById('brat-'+i);  if(brs)   brs.value        =pair.pingala.ri;
  const bn   =document.getElementById('bn-'+i);
  if(bn&&document.activeElement!==bn) bn.value=pair.pingala.n;

  const ibp=document.getElementById('ibf-p-'+i); if(ibp) ibp.textContent=fmtShort(pF);
  const ipol=document.getElementById('ipol-'+i);
  if(ipol){ipol.textContent=pair.ida.polarity===1?'+':'−';ipol.classList.toggle('negative',pair.ida.polarity===-1);}
  const ibd=document.getElementById('ibf-d-'+i); if(ibd) ibd.textContent=pair.ida.delta;
  const ibr=document.getElementById('ibf-r-'+i); if(ibr) ibr.textContent=fmtFreq(iF);
  const bws=document.getElementById('bws-'+i);   if(bws){bws.textContent=ws.s;bws.style.color=ws.c;}
  const bd=document.getElementById('bd-'+i);
  if(bd&&document.activeElement!==bd) bd.value=pair.ida.delta;

  const pmb=document.getElementById('pmute-'+i);
  const isMutedP=!!mutedOscs[pair.pingala.id];
  if(pmb){pmb.textContent=isMutedP?'Son':'Mute';pmb.classList.toggle('muted',isMutedP);}
  const imb=document.getElementById('imute-'+i);
  const isMutedI=!!mutedOscs[pair.ida.id];
  if(imb){
    if(isMutedI){imb.textContent='Activer';imb.className='btn-activer';}
    else{imb.textContent='Couper';imb.className='pair-mute-i muted';}
  }
  updateOrbUI(i);
}

function updateOrbUI(i) {
  const pair=PAIRS[i];
  const pF=calcPFreq(i);
  const isMutedP=!!mutedOscs[pair.pingala.id];
  const vcp=document.getElementById('vpc-p'+i);
  if(vcp){
    vcp.classList.toggle('vp-muted',isMutedP);
    vcp.classList.toggle('vp-live', flowing&&!isMutedP);
    if(i===MASTER_IDX){
      const msf=document.getElementById('ms-freq'); if(msf) msf.textContent=fmtShort(pF);
    } else {
      const f=document.getElementById('vp-pf-'+i); if(f) f.textContent=fmtShort(pF);
    }
  }
  patchFBFState();
}

// ── Pair HTML (modal oscillateur) ────────────────────────────────
function buildPairHTML(pair, i) {
  const c=pair.color;
  const pF=calcPFreq(i),iF=calcIFreq(i);
  const ws=waveState(pair.ida.delta);
  const isMutedI=!!mutedOscs[pair.ida.id];
  const isMutedP=!!mutedOscs[pair.pingala.id];
  return `<div class="pair-panel" style="border-left-color:${c};">
    <div class="pair-head">
      <span class="pair-dot" style="background:${c}"></span>
      <span class="pair-name" style="color:${c}">${pair.label} — Pingala / Ida</span>
    </div>
    <div style="background:rgba(0,0,0,.2);border-radius:10px;border-left:4px solid ${c}88;margin-bottom:.8rem;">
      <div class="accord-header" onclick="toggleAccord('p${i}')">
        <span class="accord-arrow open" id="aa-p${i}">▶</span>
        <span style="font-family:'Cinzel Decorative',serif;font-size:.75rem;letter-spacing:.14em;color:${c};font-weight:bold;">☀ PINGALA (DROIT)</span>
        <span id="pfreq-${i}" style="font-family:'IM Fell English',serif;font-size:1.2rem;color:${c};margin-left:auto;font-weight:bold;">${fmtFreq(pF)}</span>
        <button class="pair-mute-p${isMutedP?' muted':''}" id="pmute-${i}" onclick="event.stopPropagation();toggleMuteP(${i})">${isMutedP?'Son':'Mute'}</button>
      </div>
      <div class="accord-body open" id="ab-p${i}" style="padding:0 .8rem .8rem;">
        <div class="block-formula">
          <span class="bf-master" id="bmf-${i}">${masterFreq}</span><span class="bf-sym">×</span>
          <span class="bf-ratio"  id="brl-${i}">${RATIO_OPTS[pair.pingala.ri].l}</span><span class="bf-sym">×</span>
          <span class="bf-n"      id="bfn-${i}">${pair.pingala.n}</span><span class="bf-sym">=</span>
          <span class="bf-result" id="bfr-${i}">${fmtFreq(pF)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem;padding:.4rem 0;">
          <span style="font-size:.75rem;font-style:italic;color:rgba(220,190,255,.6);min-width:50px;font-weight:bold;">Vol P</span>
          <input type="range" class="brange" id="pvol-${i}" min="0" max="0.45" step="0.01" value="${pair.pingala.vol}" style="flex:1;accent-color:${c};" oninput="setVolP(${i},parseFloat(this.value))">
          <span style="font-family:'IM Fell English',serif;font-size:.85rem;color:rgba(225,200,255,.85);min-width:36px;text-align:right;font-weight:bold;" id="o-pvol-${i}">${pair.pingala.vol.toFixed(2)}</span>
        </div>
        <div class="bctrl">
          <div class="bctrl-row"><span class="bctrl-label">Ratio harmonique</span></div>
          <select class="bsel" id="brat-${i}" onchange="setRatio(${i},parseInt(this.value))">
            ${RATIO_OPTS.map((r,j)=>`<option value="${j}"${j===pair.pingala.ri?' selected':''}>${r.l}</option>`).join('')}
          </select>
        </div>
        <div class="param-row" style="margin-top:.4rem;">
          <span class="param-label">n =</span>
          <input type="number" class="param-input" id="bn-${i}" min="0.1" step="0.1" value="${pair.pingala.n}" oninput="setN(${i},this.value)">
          <span class="param-hint">Multiplier n</span>
        </div>
      </div>
    </div>
    <div style="background:rgba(0,0,0,.14);border-radius:10px;border-left:4px dashed ${c}55;">
      <div class="accord-header" onclick="toggleAccord('i${i}')">
        <span class="accord-arrow open" id="aa-i${i}">▶</span>
        <span style="font-family:'Cinzel Decorative',serif;font-size:.75rem;letter-spacing:.14em;color:${c};opacity:.8;font-weight:bold;">☽ IDA (GAUCHE)</span>
        <span id="ifreq-${i}" style="font-family:'IM Fell English',serif;font-size:1.15rem;color:${c};opacity:.8;margin-left:auto;font-weight:bold;">${fmtFreq(iF)}</span>
        <button id="imute-${i}" class="${isMutedI?'btn-activer':'pair-mute-i muted'}" onclick="event.stopPropagation();toggleMuteI(${i})">${isMutedI?'Activer':'Couper'}</button>
      </div>
      <div class="accord-body open" id="ab-i${i}" style="padding:0 .8rem .8rem;">
        <div class="block-formula">
          <span class="bf-link" id="ibf-p-${i}">${fmtShort(pF)}</span>
          <button class="polarity-btn${pair.ida.polarity===-1?' negative':''}" id="ipol-${i}" onclick="togglePolarity(${i})">${pair.ida.polarity===1?'+':'−'}</button>
          <span class="bf-delta" id="ibf-d-${i}">${pair.ida.delta}</span><span class="bf-sym">=</span>
          <span class="bf-result" id="ibf-r-${i}">${fmtFreq(iF)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem;padding:.4rem 0;">
          <span style="font-size:.75rem;font-style:italic;color:rgba(220,190,255,.6);min-width:50px;font-weight:bold;">Vol I</span>
          <input type="range" class="brange" id="ivol-${i}" min="0" max="0.45" step="0.01" value="${pair.ida.vol}" style="flex:1;accent-color:${c}88;" oninput="setVolI(${i},parseFloat(this.value))">
          <span style="font-family:'IM Fell English',serif;font-size:.85rem;color:rgba(225,200,255,.85);min-width:36px;text-align:right;font-weight:bold;" id="o-ivol-${i}">${pair.ida.vol.toFixed(2)}</span>
        </div>
        <div class="bctrl">
          <div class="bctrl-row">
            <span class="bctrl-label">Δ Binaural</span>
            <span class="wave-state" id="bws-${i}" style="color:${ws.c}">${ws.s}</span>
          </div>
          <div class="param-row">
            <span class="param-label">Δ =</span>
            <input type="number" class="param-input" id="bd-${i}" min="0.1" max="36" step="0.1" value="${pair.ida.delta}" oninput="setDelta(${i},this.value)">
            <span class="param-hint">Hz (0.1 → 36)</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
