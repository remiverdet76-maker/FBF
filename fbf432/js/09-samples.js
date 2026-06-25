/* ═══════════════════════════════════════════
   09-samples.js — Banque de samples
   ═══════════════════════════════════════════ */

const SAMPLE_CATS = {
  'Voix':        { files: [] },
  'Instruments': { files: [] },
  'Drone':       { files: [] },
  'Ambiance':    { files: [] },
  'Chakra':      { files: [] }
};

let _sampleSrc  = null;
let _sampleGain = null;
let _curSampleCat = null;

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
    <div style="display:flex;align-items:center;gap:.35rem;margin:.25rem 0;">
      <button onclick="samplePlay('${cat}',${idx})"
        style="flex:1;text-align:left;font-size:.72rem;padding:.28rem .5rem;background:rgba(255,255,255,.04);
               border:1px solid rgba(200,170,255,.18);color:rgba(220,200,255,.75);border-radius:6px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ▶ ${f.name}
      </button>
      <button onclick="sampleStop()"
        style="font-size:.68rem;padding:.28rem .4rem;background:transparent;border:1px solid rgba(255,142,142,.3);
               color:rgba(255,142,142,.6);border-radius:6px;cursor:pointer;">■</button>
    </div>`).join('');
}

function sampleImport() {
  if (!_curSampleCat) return;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'audio/*'; input.multiple = true;
  input.onchange = async () => {
    const cat = SAMPLE_CATS[_curSampleCat];
    for (const file of Array.from(input.files)) {
      try {
        const ab  = await file.arrayBuffer();
        const buf = await audioCtx().decodeAudioData(ab);
        cat.files.push({ name: file.name, buf });
      } catch(e) {}
    }
    sampleOpenCat(_curSampleCat);
  };
  input.click();
}

function samplePlay(cat, idx) {
  sampleStop();
  const catData = SAMPLE_CATS[cat]; if (!catData || !catData.files[idx]) return;
  const { buf } = catData.files[idx];
  const c = audioCtx();
  _sampleSrc  = c.createBufferSource();
  _sampleSrc.buffer = buf; _sampleSrc.loop = true;
  _sampleGain = c.createGain();
  const sl = document.getElementById('sample-vol-sl');
  _sampleGain.gain.value = sl ? parseFloat(sl.value) : 0.5;
  _sampleSrc.connect(_sampleGain);
  if (typeof limiter !== 'undefined' && limiter) _sampleGain.connect(limiter);
  else if (typeof masterGain !== 'undefined' && masterGain) _sampleGain.connect(masterGain);
  else _sampleGain.connect(c.destination);
  _sampleSrc.start();
}

function sampleStop() {
  try { if (_sampleSrc) { _sampleSrc.stop(); _sampleSrc.disconnect(); } } catch(e) {}
  try { if (_sampleGain) _sampleGain.disconnect(); } catch(e) {}
  _sampleSrc = null; _sampleGain = null;
}

function sampleSetVol(v) {
  if (_sampleGain && typeof audioCtx === 'function')
    _sampleGain.gain.setTargetAtTime(parseFloat(v), audioCtx().currentTime, 0.05);
}
