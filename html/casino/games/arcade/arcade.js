/* arcade.js — Hub Arcade
   Menu carrousel façon "chaînes Wii" : les jeux solo défilent en arc, celui
   du centre est le jeu sélectionné, on peut naviguer au clic sur une
   vignette latérale, aux flèches, au clavier ou en glissant (swipe).

   Chaque entrée de GAMES pointe vers son propre dossier
   games/arcade/<jeu>/<jeu>.html (trois niveaux sous la racine, donc ../../../
   depuis là-bas). Tant que `ready` est false, on n'y navigue pas : on
   affiche juste un message "bientôt disponible" (voir README section 4.4).

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
      id: 'craps',
      name: 'Craps',
      icon: '🎲',
      tagline: 'Le classique jeu de dés du casino.',
      href: './craps/craps.html',
      ready: false,
    },
  ];

  const VISIBLE_RANGE = 2; // vignettes rendues de -2 à +2 autour du centre
  const TRANSITION = 'transform 0.45s cubic-bezier(.2, .8, .2, 1), opacity 0.45s ease';
  const REMOVE_DELAY = 460; // légèrement > durée de la transition

  // Paramètres visuels indexés par |décalage| (0 à 3 : 3 = juste hors champ,
  // utilisé comme point de départ/arrivée invisible pour les entrées/sorties).
  const STEP = {
    x: [0, 165, 300, 420],
    y: [0, 12, 34, 60],
    scale: [1, 0.72, 0.5, 0.32],
    rotate: [0, 24, 34, 40],
    opacity: [1, 0.62, 0.32, 0],
    z: [4, 2, 1, 0],
  };

  let built = false;
  let center = 0; // position virtuelle du jeu sélectionné (peut dépasser 0..N-1)
  const slotEls = new Map(); // position virtuelle -> élément DOM
  let track, dotsEl, infoIcon, infoName, infoTagline, playBtn, flashTimer;

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function currentGame() {
    return GAMES[mod(center, GAMES.length)];
  }

  function styleForOffset(offset) {
    const clamped = Math.max(-3, Math.min(3, offset));
    const abs = Math.abs(clamped);
    const sign = Math.sign(clamped);
    return {
      x: sign * STEP.x[abs],
      y: STEP.y[abs],
      scale: STEP.scale[abs],
      rotate: sign * STEP.rotate[abs],
      opacity: STEP.opacity[abs],
      z: STEP.z[abs],
    };
  }

  function applyStyle(el, offset, animated) {
    const s = styleForOffset(offset);
    el.style.transition = animated ? TRANSITION : 'none';
    el.style.transform = `translate(-50%, -50%) translate(${s.x}px, ${s.y}px) scale(${s.scale}) rotateY(${s.rotate}deg)`;
    el.style.opacity = String(s.opacity);
    el.style.zIndex = String(s.z);
    el.classList.toggle('ac-slot-active', offset === 0);
    el.setAttribute('aria-current', offset === 0 ? 'true' : 'false');
  }

  function makeSlotEl(virtualPos) {
    const game = GAMES[mod(virtualPos, GAMES.length)];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ac-slot';
    el.setAttribute('aria-label', game.name);
    el.innerHTML = `
      <span class="ac-slot-icon">${game.icon}</span>
      <span class="ac-slot-name">${game.name}</span>
      ${!game.ready ? '<span class="ac-slot-lock">Bientôt</span>' : ''}
    `;
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
    infoIcon.textContent = current.icon;
    infoName.textContent = current.name;
    infoTagline.textContent = current.tagline;
    playBtn.textContent = current.ready ? 'Jouer' : 'Bientôt disponible';
    playBtn.classList.remove('ac-play-btn-flash');
    playBtn.classList.toggle('ac-play-btn-locked', !current.ready);

    const gi = mod(center, GAMES.length);
    dotsEl.querySelectorAll('.ac-dot').forEach((d, i) => {
      d.classList.toggle('active', i === gi);
    });
  }

  // Déplace les vignettes existantes vers leur nouvelle position, fait
  // entrer les nouvelles depuis le bord, et programme la sortie de celles
  // qui quittent la fenêtre visible.
  function syncSlots(prevCenter) {
    const needed = new Set();
    for (let o = -VISIBLE_RANGE; o <= VISIBLE_RANGE; o++) needed.add(center + o);

    // Les vignettes déjà présentes glissent vers leur nouveau décalage.
    slotEls.forEach((el, pos) => {
      applyStyle(el, pos - center, true);
    });

    // Nouvelles vignettes : elles apparaissent au bord (décalage ±3, cachées)
    // puis glissent vers leur vraie place.
    needed.forEach((pos) => {
      if (slotEls.has(pos)) return;
      const el = makeSlotEl(pos);
      const enterFrom = Math.sign(pos - prevCenter) * (VISIBLE_RANGE + 1);
      applyStyle(el, enterFrom, false);
      void el.offsetWidth; // force le reflow pour que le "from" soit bien appliqué avant l'animation
      applyStyle(el, pos - center, true);
      slotEls.set(pos, el);
    });

    // Vignettes qui sortent de la fenêtre : elles ont déjà leur transform
    // de sortie (via la boucle du dessus), on les retire une fois glissées.
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

  function flashMessage(msg) {
    clearTimeout(flashTimer);
    playBtn.textContent = msg;
    playBtn.classList.add('ac-play-btn-flash');
    flashTimer = setTimeout(updateInfo, 1400);
  }

  function playCurrent() {
    const game = currentGame();
    if (!game.ready) {
      flashMessage(`${game.name} arrive bientôt 🔧`);
      return;
    }
    window.location.href = game.href;
  }

  function bindEvents(container) {
    container.querySelector('.ac-nav-prev').addEventListener('click', () => go(-1));
    container.querySelector('.ac-nav-next').addEventListener('click', () => go(1));
    playBtn.addEventListener('click', playCurrent);

    const carousel = container.querySelector('.ac-carousel');
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        playCurrent();
      }
    });

    // Glisser / swipe à la souris ou au doigt pour changer de jeu.
    const stage = container.querySelector('.ac-stage');
    let dragging = false;
    let startX = 0;

    stage.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - startX;
      if (dx > 40) go(-1);
      else if (dx < -40) go(1);
    });
    stage.addEventListener('pointercancel', () => {
      dragging = false;
    });
  }

  function init() {
    const container = document.querySelector('#arcade .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="ac-wrap">
        <div class="ac-carousel" tabindex="0">
          <button type="button" class="ac-nav ac-nav-prev" aria-label="Jeu précédent">‹</button>
          <div class="ac-stage"><div class="ac-track"></div></div>
          <button type="button" class="ac-nav ac-nav-next" aria-label="Jeu suivant">›</button>
        </div>

        <div class="ac-info">
          <div class="ac-info-icon" id="ac-info-icon"></div>
          <h2 class="ac-info-name" id="ac-info-name"></h2>
          <p class="ac-info-tagline" id="ac-info-tagline"></p>
          <button type="button" class="btn btn-primary ac-play-btn" id="ac-play-btn">Jouer</button>
        </div>

        <div class="ac-dots" id="ac-dots">
          ${GAMES.map(() => '<span class="ac-dot"></span>').join('')}
        </div>
      </div>
    `;

    track = container.querySelector('.ac-track');
    dotsEl = container.querySelector('#ac-dots');
    infoIcon = container.querySelector('#ac-info-icon');
    infoName = container.querySelector('#ac-info-name');
    infoTagline = container.querySelector('#ac-info-tagline');
    playBtn = container.querySelector('#ac-play-btn');

    bindEvents(container);

    // Rendu initial : les 5 vignettes posées directement à leur place, sans
    // animation d'entrée (on ne veut pas de glissement au chargement).
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