/* fit.js — "tout tient dans la fenêtre" pour les pages de jeu.
   Aucune page du site ne doit défiler : si le contenu d'un jeu est plus
   haut que la place disponible sous le bandeau (petit écran, portable en
   1366x768...), on le réduit proportionnellement avec la propriété CSS
   `zoom` (comme un Ctrl - automatique, mais seulement pour le jeu).
   Sur un grand écran où tout tient déjà, rien ne change (zoom 1).

   À inclure sur chaque page de jeu, après topbar.js :
     <script src="../../core/fit.js"></script>      (games/<jeu>/)
     <script src="../../../core/fit.js"></script>   (games/arcade/<jeu>/)

   Le recalcul est automatique quand la fenêtre change de taille ou que le
   contenu du jeu grandit (message plus long, panneau qui apparaît...).
*/
(function () {
  const MIN_ZOOM = 0.5;
  let scheduled = false;
  let target = null;
  let body = null;

  function fit() {
    scheduled = false;
    if (!body || !target) return;
    // on mesure à taille réelle, puis on applique le zoom nécessaire
    target.style.zoom = '';
    let zoom = 1;
    for (let i = 0; i < 4; i++) {
      const overflow = body.scrollHeight - body.clientHeight;
      if (overflow <= 1) break;
      zoom = Math.max(MIN_ZOOM, zoom * (body.clientHeight / body.scrollHeight) - 0.005);
      target.style.zoom = String(zoom);
      if (zoom === MIN_ZOOM) break;
    }
    document.documentElement.style.setProperty('--fit-zoom', String(zoom));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(fit);
  }

  function start() {
    body = document.querySelector('.game-body');
    target = body ? body.firstElementChild : null;
    if (!body) return;
    // le jeu est injecté en JS après DOMContentLoaded : on attend qu'il existe
    if (!target) {
      const mo = new MutationObserver(() => {
        if (body.firstElementChild) {
          mo.disconnect();
          target = body.firstElementChild;
          watch();
        }
      });
      mo.observe(body, { childList: true });
      return;
    }
    watch();
  }

  function watch() {
    fit();
    window.addEventListener('resize', schedule);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(schedule);
      ro.observe(body);
      ro.observe(target);
    }
    // les polices et images peuvent changer la hauteur une fois chargées
    window.addEventListener('load', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
