/* ════════════════════════════════════════════════════════════════
   bg-rotator.js — Diaporama de fond cosmique (crossfade) partagé.
   Injecte #bg-rotator (9 calques) derrière le contenu et fait tourner
   les 9 images recalibrées 9:16. Aucune dépendance.
   ════════════════════════════════════════════════════════════════ */
(function () {
  var IMGS = [
    'img/bg1.jpg','img/bg2.jpg','img/bg3.jpg','img/bg4.jpg','img/bg5.jpg',
    'img/bg6.jpg','img/bg7.jpg','img/bg8.jpg','img/bg9.jpg'
  ];
  var HOLD = 11000;   // durée d'affichage par image (ms)

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

    // insère en tout premier pour rester derrière le reste
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
