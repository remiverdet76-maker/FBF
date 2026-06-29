/* ═══════════════════════════════════════════
   04-vesica-ui.js — Sphères Vesica & édition
   ═══════════════════════════════════════════ */

// Short tap = mute/unmute | 420ms = show micro-btns | 480ms = open modal
var _vpTimer=null, _vpFired=false, _vpMbTimer=null, _vpMbFired=false;
function _vpStart(i,e){
  if(e.type==='touchstart'){try{e.preventDefault();}catch(x){}}
  _vpFired=false; _vpMbFired=false;
  clearTimeout(_vpTimer); clearTimeout(_vpMbTimer);
  _vpMbTimer=setTimeout(()=>{
    _vpMbFired=true;
    const wrap=document.getElementById('vp'+i);
    if(wrap)wrap.querySelectorAll('.micro-btn').forEach(b=>b.classList.add('mb-visible'));
    _vpMbTimer=setTimeout(()=>{
      const w=document.getElementById('vp'+i);
      if(w)w.querySelectorAll('.micro-btn').forEach(b=>b.classList.remove('mb-visible'));
    },3200);
  },420);
  _vpTimer=setTimeout(()=>{_vpFired=true;_vpTimer=null;clearTimeout(_vpMbTimer);openOscModal(i);},480);
}
function _vpEnd(i){
  clearTimeout(_vpMbTimer);
  if(_vpTimer){clearTimeout(_vpTimer);_vpTimer=null;if(!_vpFired&&!_vpMbFired)toggleMutePair(i);}
}
function _vpCancel(){clearTimeout(_vpTimer);_vpTimer=null;clearTimeout(_vpMbTimer);_vpMbTimer=null;}

function buildVesicaPairs() {
  const layer = document.getElementById('sphere-layer');
  if (!layer) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dockEl = document.getElementById('bottom-dock');
  const dockH = (dockEl && !dockEl.classList.contains('collapsed')) ? (dockEl.offsetHeight || 54) : 0;
  const sz = Math.min(vw, vh - dockH);
  document.querySelectorAll('.vp-wrap,.vp-center-wrap').forEach(n => n.remove());

  const cx = vw / 2;
  const cy = vh / 2;   // centre RÉEL de l'image (et non plus le centre de la zone au-dessus du dock)
  // Rayon : garde la bulle du bas au-dessus du dock et la bulle du haut sous le bord
  const R  = Math.max(70, Math.min(sz * 0.32, vh / 2 - dockH - 56, cy - 40));

  for (let i = 0; i < 6; i++) {
    const pair = PAIRS[i];
    const c    = pair.color;
    const rad  = (HEX_DEG[i] - 90) * Math.PI / 180;
    const px   = cx + R * Math.cos(rad);
    const py   = cy + R * Math.sin(rad);
    const isMutedP = !!mutedOscs[pair.pingala.id];
    const pF   = calcPFreq(i);

    const vp = document.createElement('div');
    vp.className = 'vp-wrap';
    vp.id = 'vp' + i;
    vp.style.left = px + 'px';
    vp.style.top  = py + 'px';
    vp.innerHTML = `
      <div class="vp-p ${isMutedP?'vp-muted':''} ${flowing&&!isMutedP?'vp-live':''}"
           id="vpc-p${i}"
           style="border-color:${c}AA;background:radial-gradient(circle,${c}44 0%,${c}1A 60%,transparent 100%);box-shadow:0 0 18px ${c}35;cursor:pointer;user-select:none;"
           onmousedown="_vpStart(${i},event)" onmouseup="_vpEnd(${i})" onmouseleave="_vpCancel()"
           ontouchstart="_vpStart(${i},event)" ontouchend="_vpEnd(${i})">
        <span class="vp-type" style="color:${c}CC">Canal ${i+1}</span>
        <span class="vp-freq" id="vp-pf-${i}">${fmtShort(pF)}</span>
      </div>
      <div class="micro-btn micro-left"  style="border-color:${c}99;color:${c};background:${c}22;" onclick="event.stopPropagation();nDecrement(${i})">−</div>
      <div class="micro-btn micro-right" style="border-color:${c}99;color:${c};background:${c}22;" onclick="event.stopPropagation();nIncrement(${i})">+</div>
      <div class="micro-btn micro-top"   style="border-color:${c}99;color:${c};background:${c}22;" onclick="event.stopPropagation();nReset(${i})">↺</div>
      <div class="micro-btn micro-bot"   style="border-color:${c}99;color:${c};background:${c}22;" onclick="event.stopPropagation();nRandom(${i})">⚄</div>`;
    layer.appendChild(vp);
  }

  const mp  = PAIRS[MASTER_IDX];
  const mc  = mp.color;
  const isMutedMP = !!mutedOscs[mp.pingala.id];

  const vcw = document.createElement('div');
  vcw.className = 'vp-center-wrap';
  vcw.id = 'vp' + MASTER_IDX;
  vcw.innerHTML = `
    <div class="vp-p ${isMutedMP?'vp-muted':''} ${flowing&&!isMutedMP?'vp-live':''}"
         id="vpc-p${MASTER_IDX}"
         style="border-color:${mc}CC;background:radial-gradient(circle,${mc}50 0%,${mc}20 55%,rgba(26,5,51,.6) 100%);box-shadow:0 0 25px ${mc}50;backdrop-filter:blur(4px);cursor:pointer;user-select:none;"
         onmousedown="_vpStart(${MASTER_IDX},event)" onmouseup="_vpEnd(${MASTER_IDX})" onmouseleave="_vpCancel()"
         ontouchstart="_vpStart(${MASTER_IDX},event)" ontouchend="_vpEnd(${MASTER_IDX})">
      <span class="vp-type" style="color:${mc}BB;font-size:.7rem;letter-spacing:.14em;">MAÎTRE</span>
      <span class="ms-freq" id="ms-freq" onclick="event.stopPropagation();openFreqEdit();">${masterFreq}</span>
      <input type="number" id="freq-input-master" min="36" max="864" placeholder="${masterFreq}" autocomplete="off"
             onkeydown="handleFreqKey(event);">
      <span class="ms-state" id="ms-state">Binaural</span>
    </div>
    <div class="micro-btn micro-left"  style="border-color:${mc}BB;color:${mc};" onclick="masterStep(-18)" title="-18 Hz">−18</div>
    <div class="micro-btn micro-right" style="border-color:${mc}BB;color:${mc};" onclick="masterStep(18)"  title="+18 Hz">+18</div>
    <div class="micro-btn micro-top"   style="border-color:${mc}BB;color:${mc};" onclick="resetAll()"      title="Reset">↺</div>
    <div class="micro-btn micro-bot"   style="border-color:${mc}BB;color:${mc};" onclick="triggerMagicAuto()" title="Aléatoire">⚄</div>`;
  layer.appendChild(vcw);

  const inp = document.getElementById('freq-input-master');
  if (inp && !inp._bound) {
    inp._bound = true;
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); exitEditMaster(true); }
      if (e.key === 'Escape') exitEditMaster(false);
    });
    inp.addEventListener('blur', () => exitEditMaster(true));
  }
}

function openFreqEdit() {
  const freq = document.getElementById('ms-freq');
  const inp  = document.getElementById('freq-input-master');
  if (!freq || !inp) return;
  freq.style.display = 'none';
  inp.style.display = 'block'; inp.value = masterFreq; inp.focus(); inp.select();
}
function handleFreqKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); exitEditMaster(true); }
  if (e.key === 'Escape') exitEditMaster(false);
}
function exitEditMaster(apply) {
  const freq = document.getElementById('ms-freq');
  const inp  = document.getElementById('freq-input-master');
  if (!freq || !inp) return;
  inp.style.display = 'none';
  freq.style.display = 'block';
  if (!apply) return;
  const v = parseInt(inp.value);
  if (isNaN(v) || v < 36 || v > 864) return;
  setMasterFreq(v);
}

function toggleAccord(id) {
  const body  = document.getElementById('ab-'+id);
  const arrow = document.getElementById('aa-'+id);
  if (!body || !arrow) return;
  const open = body.classList.toggle('open');
  arrow.classList.toggle('open', open);
}
