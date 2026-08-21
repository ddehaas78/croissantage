/* arcade.js — Hub Arcade
   Menu façon "chaîne Wii" (Disc Channel) : les jeux solo sont disposés en
   éventail (comme des cartes tenues en main, pivot sous le plateau), la
   pochette du centre est le jeu sélectionné. Navigation au clic sur une
   vignette latérale, aux flèches, au clavier ou en glissant (swipe).

   Chaque entrée de GAMES pointe vers son propre dossier
   games/arcade/<jeu>/<jeu>.html (trois niveaux sous la racine, donc ../../../
   depuis là-bas). Tant que `ready` est false, on n'y navigue pas : on
   Cliquer sur la pochette centrale (déjà sélectionnée) lance le jeu ; si
   elle est verrouillée (`ready` false), une info-bulle "bientôt
   disponible" apparaît au-dessus au lieu de naviguer.

   Animation : on utilise une position "virtuelle" non bornée (`center`,
   `virtualPos`) plutôt qu'un simple index 0..N-1. Chaque vignette DOM garde
   son identité (sa position virtuelle) tant qu'elle reste dans la fenêtre
   visible : on ne la recrée jamais, on met juste à jour son `transform`, ce
   qui laisse la transition CSS l'animer en douceur d'une position à
   l'autre. Seules les vignettes qui entrent (au bord) ou sortent (hors
   fenêtre) sont créées/retirées, avec un glissement depuis/vers le bord.
*/
const Arcade = (() => {
  const GAMES = [
    {
      id: 'fusee',
      name: 'Fusée',
      icon: '🚀',
      tagline: 'Encaissez avant que la fusée n\'explose.',
      href: './fusee/fusee.html',
      ready: true,
    },
    {
      id: 'mine',
      name: 'Mines',
      icon: '💣',
      tagline: 'Avancez case par case, évitez les mines.',
      href: './mine/mine.html',
      ready: true,
    },
    {
      id: 'chicken',
      name: 'Chicken Road',
      icon: '🐔',
      tagline: 'Traversez la route, encaissez avant le crash.',
      href: './chicken/chicken.html',
      ready: true,
    },
    {
      id: 'plinko',
      name: 'Plinko',
      icon: '🔴',
      tagline: 'Lâchez la balle, laissez la physique décider.',
      href: './plinko/plinko.html',
      ready: true,
    },
    {
      id: 'craps',
      name: 'Craps',
      icon: '🎲',
      tagline: 'Le classique jeu de dés du casino.',
      href: './craps/craps.html',
      ready: false,
    },
  ];

  const VISIBLE_RANGE = 3; // vignettes rendues de -3 à +3 autour du centre
  const TRANSITION = 'transform 0.5s cubic-bezier(.22, .85, .28, 1), opacity 0.5s ease';
  const REMOVE_DELAY = 510; // légèrement > durée de la transition

  // Géométrie de l'éventail, indexée par |décalage| (0 à 4 : 4 = juste hors
  // champ, utilisé comme point de départ/arrivée invisible pour les
  // entrées/sorties). Rotation en 2D (pas de perspective 3D) pour l'effet
  // "cartes tenues en main", pivot sous le plateau (voir transform-origin
  // en CSS sur .ac-slot).
  const STEP = {
    x: [0, 190, 350, 470, 570],
    y: [0, 22, 55, 96, 148],
    scale: [1, 0.86, 0.7, 0.55, 0.4],
    rotate: [0, 14, 26, 36, 44],
    opacity: [1, 1, 0.85, 0.5, 0],
  };

  let built = false;
  let center = 0; // position virtuelle du jeu sélectionné (peut dépasser 0..N-1)
  const slotEls = new Map(); // position virtuelle -> élément DOM
  let track, infoTagline, playTooltip, counterEl, tooltipTimer;

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function currentGame() {
    return GAMES[mod(center, GAMES.length)];
  }

  function styleForOffset(offset) {
    const clamped = Math.max(-4, Math.min(4, offset));
    const abs = Math.abs(clamped);
    const sign = Math.sign(clamped);
    return {
      x: sign * STEP.x[abs],
      y: STEP.y[abs],
      scale: STEP.scale[abs],
      rotate: sign * STEP.rotate[abs],
      opacity: STEP.opacity[abs],
      // z-index dérivé de la distance au centre, avec un pas assez large
      // (x10) pour ne jamais être à égalité avec un décalage d'entrée/sortie
      // voisin, PLUS un léger bonus pour le côté gauche (sign<0) afin que
      // deux cartes symétriques (ex: -1 et +1) ne soient jamais ex æquo :
      // sans ce départage, l'ordre de superposition dépendait de l'ordre
      // d'insertion dans le DOM et pouvait sembler incohérent/instable.
      z: (100 - abs * 10) + (sign < 0 ? 1 : 0),
    };
  }

  function applyStyle(el, offset, animated) {
    const s = styleForOffset(offset);
    el.style.transition = animated ? TRANSITION : 'none';
    el.style.transform = `translate(-50%, -50%) translate(${s.x}px, ${s.y}px) scale(${s.scale}) rotate(${s.rotate}deg)`;
    el.style.opacity = String(s.opacity);
    el.style.zIndex = String(s.z);
    el.classList.toggle('ac-slot-active', offset === 0);
    el.setAttribute('aria-current', offset === 0 ? 'true' : 'false');
    if (offset === 0) {
      const game = GAMES[mod(center, GAMES.length)];
      el.setAttribute('aria-label', game.ready ? `Jouer à ${game.name}` : `${game.name} bientôt disponible`);
    }
  }

  function coverFaceHTML(game, { withLock } = {}) {
    return `
      <span class="ac-slot-icon">${game.icon}</span>
      <span class="ac-slot-name">${game.name}</span>
      ${withLock && !game.ready ? '<span class="ac-slot-lock">Bientôt</span>' : ''}
    `;
  }

  function makeSlotEl(virtualPos) {
    const game = GAMES[mod(virtualPos, GAMES.length)];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ac-slot';
    el.setAttribute('aria-label', game.name);
    el.innerHTML = `<div class="ac-cover-face">${coverFaceHTML(game, { withLock: true })}</div>`;
    el.addEventListener('click', () => {
      const offset = virtualPos - center;
      if (offset === 0) playCurrent();
      else go(offset);
    });
    track.appendChild(el);
    return el;
  }

  function updateInfo() {
    const current = currentGame();
    infoTagline.textContent = current.tagline;
    playTooltip.classList.remove('ac-show');

    const gi = mod(center, GAMES.length);
    counterEl.textContent = `${gi + 1} / ${GAMES.length}`;
  }

  // Déplace les vignettes existantes vers leur nouvelle position, fait
  // entrer les nouvelles depuis le bord, et programme la sortie de celles
  // qui quittent la fenêtre visible.
  function syncSlots(prevCenter) {
    const needed = new Set();
    for (let o = -VISIBLE_RANGE; o <= VISIBLE_RANGE; o++) needed.add(center + o);

    slotEls.forEach((el, pos) => {
      applyStyle(el, pos - center, true);
    });

    needed.forEach((pos) => {
      if (slotEls.has(pos)) return;
      const el = makeSlotEl(pos);
      const enterFrom = Math.sign(pos - prevCenter) * (VISIBLE_RANGE + 1);
      applyStyle(el, enterFrom, false);
      void el.offsetWidth;
      applyStyle(el, pos - center, true);
      slotEls.set(pos, el);
    });

    slotEls.forEach((el, pos) => {
      if (needed.has(pos)) return;
      setTimeout(() => {
        el.remove();
        slotEls.delete(pos);
      }, REMOVE_DELAY);
    });
  }

  function go(delta) {
    const prevCenter = center;
    center += delta;
    syncSlots(prevCenter);
    updateInfo();
  }

  function flashLocked(msg) {
    clearTimeout(tooltipTimer);
    playTooltip.textContent = msg;
    playTooltip.classList.add('ac-show');
    tooltipTimer = setTimeout(() => playTooltip.classList.remove('ac-show'), 1600);
  }

  function playCurrent() {
    const game = currentGame();
    if (!game.ready) {
      flashLocked(`${game.name} arrive bientôt 🔧`);
      return;
    }
    window.location.href = game.href;
  }

  function bindEvents(container) {
    container.querySelector('.ac-nav-prev').addEventListener('click', () => go(-1));
    container.querySelector('.ac-nav-next').addEventListener('click', () => go(1));

    const carousel = container.querySelector('.ac-carousel');
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        playCurrent();
      }
    });

    const stage = container.querySelector('.ac-stage');
    const DRAG_THRESHOLD = 10;
    let pointerDownX = null;
    let dragStarted = false;

    stage.addEventListener('pointerdown', (e) => {
      pointerDownX = e.clientX;
      dragStarted = false;
    });
    stage.addEventListener('pointermove', (e) => {
      if (pointerDownX === null || dragStarted) return;
      if (Math.abs(e.clientX - pointerDownX) > DRAG_THRESHOLD) {
        dragStarted = true;
        stage.setPointerCapture(e.pointerId);
      }
    });
    stage.addEventListener('pointerup', (e) => {
      if (pointerDownX === null) return;
      const dx = e.clientX - pointerDownX;
      if (dragStarted) {
        if (dx > 40) go(-1);
        else if (dx < -40) go(1);
        if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      }
      pointerDownX = null;
      dragStarted = false;
    });
    stage.addEventListener('pointercancel', () => {
      pointerDownX = null;
      dragStarted = false;
    });
  }

  function init() {
    const container = document.querySelector('#arcade .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="ac-wrap">
        <div class="ac-frame">
          <div class="ac-carousel" tabindex="0">
            <button type="button" class="ac-nav ac-nav-prev" aria-label="Jeu précédent">‹</button>
            <div class="ac-stage">
              <div class="ac-track"></div>
              <div class="ac-play-tooltip" id="ac-play-tooltip"></div>
            </div>
            <button type="button" class="ac-nav ac-nav-next" aria-label="Jeu suivant">›</button>
          </div>
        </div>

        <div class="ac-info-bar">
          <div class="ac-info-main">
            <span class="ac-counter" id="ac-counter"></span>
            <p class="ac-info-tagline" id="ac-info-tagline"></p>
          </div>
        </div>
      </div>
    `;

    track = container.querySelector('.ac-track');
    infoTagline = container.querySelector('#ac-info-tagline');
    playTooltip = container.querySelector('#ac-play-tooltip');
    counterEl = container.querySelector('#ac-counter');

    bindEvents(container);

    for (let o = -VISIBLE_RANGE; o <= VISIBLE_RANGE; o++) {
      const pos = center + o;
      const el = makeSlotEl(pos);
      applyStyle(el, o, false);
      slotEls.set(pos, el);
    }
    updateInfo();

    Wallet.refreshUI();
  }

  return { init, go, playCurrent };
})();

document.addEventListener('DOMContentLoaded', () => Arcade.init());