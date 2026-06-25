/* ═══════════════════════════════════════════
   10-recorder.js — Enregistrement binaural
   ═══════════════════════════════════════════ */

let _recDest   = null;
let _recMR     = null;
let _recChunks = [];

function recToggle() {
  if (_recMR && _recMR.state === 'recording') {
    _recMR.stop();
    return;
  }
  if (typeof flowing === 'undefined' || !flowing || typeof limiter === 'undefined' || !limiter) {
    const btn = document.getElementById('btn-rec');
    if (btn) { const prev = btn.textContent; btn.textContent = '⚠ Lance le flux d\'abord'; setTimeout(() => { btn.textContent = '⏺ Rec'; }, 2000); }
    return;
  }
  const c = audioCtx();
  _recDest = c.createMediaStreamDestination();
  limiter.connect(_recDest);
  _recChunks = [];

  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  const mime  = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch(e) { return false; } }) || '';
  try {
    _recMR = new MediaRecorder(_recDest.stream, mime ? { mimeType: mime } : {});
  } catch(e) {
    _recMR = new MediaRecorder(_recDest.stream);
  }

  _recMR.ondataavailable = e => { if (e.data && e.data.size > 0) _recChunks.push(e.data); };

  _recMR.onstop = () => {
    const usedMime = (_recMR.mimeType || mime || 'audio/webm');
    const blob = new Blob(_recChunks, { type: usedMime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    const now  = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yy   = now.getFullYear();
    const ext  = usedMime.includes('ogg') ? 'ogg' : 'webm';
    a.download = `Record binaural ${dd}-${mm}-${yy}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    try { limiter.disconnect(_recDest); } catch(e) {}
    _recDest = null; _recMR = null; _recChunks = [];
    const btn = document.getElementById('btn-rec');
    if (btn) { btn.textContent = '⏺ Rec'; btn.style.color = '#FFB347'; }
  };

  _recMR.start(1000);
  const btn = document.getElementById('btn-rec');
  if (btn) { btn.textContent = '⏹ Stop Rec'; btn.style.color = '#FF6B6B'; }
}
