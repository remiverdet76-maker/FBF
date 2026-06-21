/* ════════════════════════════════════════════════════════════════
   audio-bus.js — Exclusivité audio entre les écrans (frames).
   Injecté dans chaque MODULE (iframe). Dès qu'un son démarre dans le
   module, on prévient la page d'accueil (parent) pour qu'elle coupe son
   binaural. Règle : un seul HTML sonore à la fois.
   ════════════════════════════════════════════════════════════════ */
(function () {
  if (window.self === window.top) return;          // seulement dans un iframe
  function claim() {
    try { window.parent.postMessage({ fbf: 'audio-claim' }, '*'); } catch (e) {}
  }
  // Tout démarrage de source audio (oscillateur, sample…) = un son est lancé.
  try {
    var SS = window.AudioScheduledSourceNode;
    if (SS && SS.prototype && SS.prototype.start) {
      var _start = SS.prototype.start;
      SS.prototype.start = function () { claim(); return _start.apply(this, arguments); };
    }
  } catch (e) {}
  // Reprise d'un AudioContext (souvent au 1er geste) = intention de jouer.
  try {
    var BC = window.BaseAudioContext || window.AudioContext;
    if (BC && BC.prototype && BC.prototype.resume) {
      var _resume = BC.prototype.resume;
      BC.prototype.resume = function () { claim(); return _resume.apply(this, arguments); };
    }
  } catch (e) {}
})();
