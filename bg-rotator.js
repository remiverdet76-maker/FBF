/* ════════════════════════════════════════════════════════════════
   bg-rotator.js — Diaporama de fond cosmique (crossfade) partagé.
   Injecte #bg-rotator (calques) derrière le contenu et fait tourner
   les images recalibrées 9:16. Aucune dépendance.

   Override possible par page (avant ce script) :
     window.__BG_IMAGES__ = ['img/bg-cosmic.jpg'];  // jeu d'images dédié
     window.__BG_HOLD__   = 108000;                 // durée par image (ms)
   ════════════════════════════════════════════════════════════════ */
(function () {
  var DEFAULT = [
    'img/bg1.jpg','img/bg2.jpg','img/bg3.jpg','img/bg4.jpg','img/bg5.jpg',
    'img/bg6.jpg','img/bg7.jpg','img/bg8.jpg','img/bg9.jpg','img/bg10.jpg',
    'img/bg11.jpg','img/bg12.jpg'
  ];
  var IMGS = (window.__BG_IMAGES__ && window.__BG_IMAGES__.length) ? window.__BG_IMAGES__ : DEFAULT;
  var HOLD = window.__BG_HOLD__ || 108000;   // changement toutes les 108 s

  function init() {
    if (document.getElementById('bg-rotator')) return;
    var root = document.createElement('div');
    root.id = 'bg-rotator';

    var layers = IMGS.map(function (src) {
      var d = document.createElement('div');
      d.className = 'bg-layer';
      d.style.backgroundImage = "url('" + src + "')";
      root.appendChild(d);
      return d;
    });

    var veil = document.createElement('div');
    veil.className = 'bg-veil';
    root.appendChild(veil);

    document.body.insertBefore(root, document.body.firstChild);

    var i = 0;
    layers[0].classList.add('on');
    if (layers.length > 1) {
      setInterval(function () {
        layers[i].classList.remove('on');
        i = (i + 1) % layers.length;
        layers[i].classList.add('on');
      }, HOLD);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
