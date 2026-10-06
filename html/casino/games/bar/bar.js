/* bar.js — Le Bar de Croissantage
   La scène (bar en bois, étagères de bouteilles, barman, comptoir) +
   le menu des boissons, achetées via Wallet. Chaque boisson dose le
   niveau d'ivresse via le module global Drunk (voir drunk.js), dont
   l'effet visuel (drunk.css) suit le joueur sur toutes les pages.
*/
const Bar = (() => {
  const COCKTAILS = [
    { id: 'aperol-spritz', name: 'Aperol Spritz', price: 30, dose: 14, tagline: 'Léger, pétillant, parfait à l\'apéro.' },
    { id: 'bloody-mary', name: 'Bloody Mary', price: 35, dose: 16, tagline: 'Piquant et costaud dès le matin.' },
    { id: 'cuba-libre', name: 'Cuba Libre', price: 25, dose: 15, tagline: 'Rhum, cola, et cette bulle qui pique.' },
    { id: 'daiquiri', name: 'Daiquiri', price: 30, dose: 17, tagline: 'Frais, acidulé, dangereusement facile à boire.' },
    { id: 'espresso-martini', name: 'Espresso Martini', price: 45, dose: 22, tagline: 'Ça réveille et ça enivre en même temps.' },
    { id: 'french-75', name: 'French 75', price: 50, dose: 20, tagline: 'Gin et champagne, la classe assumée.' },
    { id: 'gin-tonic', name: 'Gin Tonic', price: 28, dose: 15, tagline: 'Le classique qui ne déçoit jamais.' },
    { id: 'harvey-wallbanger', name: 'Harvey Wallbanger', price: 38, dose: 19, tagline: 'Vodka, orange, et une touche de folie.' },
    { id: 'irish-coffee', name: 'Irish Coffee', price: 32, dose: 18, tagline: 'Café chaud arrosé d\'un bon whiskey.' },
    { id: 'jungle-bird', name: 'Jungle Bird', price: 40, dose: 20, tagline: 'Tropical et bien plus fort qu\'il n\'y paraît.' },
    { id: 'kir-royal', name: 'Kir Royal', price: 42, dose: 16, tagline: 'Champagne et cassis, pour les grandes occasions.' },
    { id: 'long-island-iced-tea', name: 'Long Island Iced Tea', price: 55, dose: 32, tagline: 'Cinq alcools dans un seul verre. Attention.' },
    { id: 'mojito', name: 'Mojito', price: 28, dose: 14, tagline: 'Menthe, citron vert, et une pointe de rhum.' },
    { id: 'negroni', name: 'Negroni', price: 38, dose: 24, tagline: 'Amer, fort, pour les habitués.' },
    { id: 'old-fashioned', name: 'Old Fashioned', price: 45, dose: 26, tagline: 'Whiskey, sucre, amertume. Un intemporel.' },
    { id: 'pina-colada', name: 'Piña Colada', price: 32, dose: 15, tagline: 'Ananas, coco, vacances immédiates.' },
    { id: 'queens-park-swizzle', name: 'Queens Park Swizzle', price: 44, dose: 23, tagline: 'Rhum et menthe pilée, une vraie claque tropicale.' },
    { id: 'rossini', name: 'Rossini', price: 40, dose: 12, tagline: 'Champagne et fraise, tout en délicatesse.' },
    { id: 'sex-on-the-beach', name: 'Sex on the Beach', price: 34, dose: 18, tagline: 'Fruité, sucré, et ça monte vite.' },
    { id: 'tequila-sunrise', name: 'Tequila Sunrise', price: 33, dose: 19, tagline: 'Tequila et orange, un lever de soleil qui tourne.' },
    { id: 'unicum', name: 'Unicum', price: 36, dose: 21, tagline: 'Amer hongrois corsé, à tenter une fois.' },
    { id: 'vodka-martini', name: 'Vodka Martini', price: 46, dose: 25, tagline: 'Secoué, pas mélangé. Direct et fort.' },
    { id: 'whiskey-sour', name: 'Whiskey Sour', price: 37, dose: 20, tagline: 'Whiskey, citron, mousse d\'œuf. Un équilibre parfait.' },
    { id: 'xalixco', name: 'Xalixco', price: 48, dose: 22, tagline: 'Une création maison, mystérieuse et forte.' },
    { id: 'yellow-bird', name: 'Yellow Bird', price: 39, dose: 18, tagline: 'Rhum et liqueurs, un chant tropical garanti.' },
    { id: 'zombie', name: 'Zombie', price: 60, dose: 35, tagline: 'Le cocktail qui porte bien son nom.' },
  ];

  // Boissons "remède", posées sur la table du barman (pas sur les étagères),
  // pour faire baisser le taux d'ivresse. Pas d'image dédiée : emoji.
  const REMEDIES = [
    { id: 'water', emoji: '🥤', name: 'Eau fraîche', price: 10, dose: -20, tagline: 'Un petit remède rapide.', color: '#5aa7e0' },
    { id: 'coffee', emoji: '☕', name: 'Café serré', price: 15, dose: -26, tagline: 'Ça réveille direct.', color: '#a5661a' },
  ];

  // Utilisé par order() pour retrouver n'importe quelle boisson, cocktail ou remède
  const DRINKS = [...COCKTAILS, ...REMEDIES];

  // Palette de bouteilles décoratives sur les étagères (pur décor, non cliquable)
  const BOTTLE_COLORS = [
    'linear-gradient(180deg, #e0a63e, #a5661a)', // ambre / whisky
    'linear-gradient(180deg, #9c2a35, #5c1420)', // bordeaux
    'linear-gradient(180deg, #2f6b52, #163b2c)', // émeraude / absinthe
    'linear-gradient(180deg, #d8cdb0, #a89a76)', // verre clair
    'linear-gradient(180deg, #6b4326, #3b2410)', // rhum foncé
    'linear-gradient(180deg, #c9a227, #8a6f1f)', // liqueur dorée
  ];

  // Halo coloré tournant derrière chaque cocktail (pas besoin d'une couleur par nom)
  const ACCENT_COLORS = [
    '#ff8a3d',
    '#e0475a',
    '#57d1ae',
    '#f4d976',
    '#5aa7e0',
    '#d75fb8',
    '#9c6bd9',
    '#e0a63e',
  ];

  let built = false;

  function fmt(n) {
    return n.toLocaleString('fr-FR');
  }

  function buildShelfBottlesHTML(count, seedBase, rowDrinks) {
    // Positions (espacées régulièrement) où l'on insère un vrai cocktail commandable
    const realPositions = {};
    if (rowDrinks && rowDrinks.length) {
      const step = Math.max(1, Math.floor(count / (rowDrinks.length + 1)));
      rowDrinks.forEach((d, i) => {
        realPositions[Math.min(count - 1, step * (i + 1))] = d;
      });
    }

    let html = '';
    for (let i = 0; i < count; i++) {
      const drink = realPositions[i];
      if (drink) {
        const accent = ACCENT_COLORS[COCKTAILS.indexOf(drink) % ACCENT_COLORS.length];
        html += `<button type="button" class="bar-real-drink" data-drink="${drink.id}">
          <span class="bar-real-drink-glow" style="background:${accent};"></span>
          <span class="bar-real-drink-emoji">
            <img src="../../boisson/${drink.id}.png" alt="${drink.name}" loading="lazy">
          </span>
          <span class="bar-real-drink-tag">
            <span class="bar-real-drink-name">${drink.name}</span>
            <span class="bar-real-drink-price">${drink.price} 🪙</span>
          </span>
        </button>`;
      } else {
        const h = 30 + ((i * 13 + seedBase * 7) % 22); // hauteur pseudo-aléatoire stable
        const color = BOTTLE_COLORS[(i + seedBase) % BOTTLE_COLORS.length];
        html += `<span class="bar-deco-bottle" style="height:${h}px; background:${color};" aria-hidden="true"></span>`;
      }
    }
    return html;
  }

  function buildShelvesHTML() {
    // Les 26 cocktails sont répartis sur les 4 étagères (7/7/6/6)
    const rows = [
      { count: 16, seed: 0, drinks: COCKTAILS.slice(0, 7) },
      { count: 16, seed: 2, drinks: COCKTAILS.slice(7, 14) },
      { count: 18, seed: 4, drinks: COCKTAILS.slice(14, 20) },
      { count: 18, seed: 1, drinks: COCKTAILS.slice(20, 26) },
    ];
    return rows
      .map(
        (r) => `<div class="bar-shelf-row">
          <div class="bar-shelf-bottles">${buildShelfBottlesHTML(r.count, r.seed, r.drinks)}</div>
          <div class="bar-shelf-ledge"></div>
        </div>`
      )
      .join('');
  }

  // Eau et café, posés sur la table/comptoir du barman (pas sur les étagères)
  function buildRemediesHTML() {
    return REMEDIES.map(
      (d) => `<button type="button" class="bar-counter-remedy" data-drink="${d.id}">
        <span class="bar-real-drink-glow" style="background:${d.color};"></span>
        <span class="bar-counter-remedy-emoji">${d.emoji}</span>
        <span class="bar-real-drink-tag">
          <span class="bar-real-drink-name">${d.name}</span>
          <span class="bar-real-drink-price">${d.price} 🪙</span>
        </span>
      </button>`
    ).join('');
  }

  // --- Sélecteur de skin + caisses ---
  // rootPrefix '../../' car bar.html est dans games/bar/, deux niveaux sous
  // la racine où se trouve assets/player/.
  const SKIN_ROOT_PREFIX = '../../';

  // Caisse façon Counter-Strike : on tire d'abord une RARETÉ selon son poids,
  // puis un perso au hasard dans cette rareté. En cas de doublon, une partie
  // de la mise est remboursée selon la rareté.
  const CASE_PRICE = 750;
  const CASE_ODDS = [
    { rarity: 'commun',     weight: 55, refund: 150 },
    { rarity: 'rare',       weight: 28, refund: 300 },
    { rarity: 'epique',     weight: 12, refund: 600 },
    { rarity: 'legendaire', weight: 4,  refund: 1500 },
    { rarity: 'mythique',   weight: 1,  refund: 3000 },
  ];
  const CASE_REEL_LENGTH = 60;   // nombre de cartes dans la bande
  const CASE_WIN_INDEX = 52;     // position de la carte gagnante dans la bande
  const CASE_SPIN_MS = 6500;     // durée du défilement (doit matcher le JS ci-dessous uniquement)

  let caseOpening = false;

  function caseSkins() {
    return Skins.getAll().filter((s) => !s.starter);
  }

  // Ne garde que les raretés qui ont au moins un perso dans la caisse
  function activeOdds() {
    const pool = caseSkins();
    return CASE_ODDS.filter((o) => pool.some((s) => s.rarity === o.rarity));
  }

  function rollSkin() {
    const odds = activeOdds();
    const total = odds.reduce((sum, o) => sum + o.weight, 0);
    let r = Math.random() * total;
    let picked = odds[odds.length - 1];
    for (const o of odds) {
      if (r < o.weight) { picked = o; break; }
      r -= o.weight;
    }
    const pool = caseSkins().filter((s) => s.rarity === picked.rarity);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function refundFor(skin) {
    const o = CASE_ODDS.find((x) => x.rarity === skin.rarity);
    return o ? o.refund : 0;
  }

  function buildSkinGridHTML() {
    const currentId = Skins.getCurrentId();
    return Skins.getAll()
      .map((skin) => {
        const url = Skins.urlFor(skin.id, SKIN_ROOT_PREFIX);
        const owned = Skins.isOwned(skin.id);
        const rar = Skins.rarityOf(skin.id);
        const cls = (skin.id === currentId ? ' active' : '') + (owned ? '' : ' locked');
        const label = owned ? `Choisir le skin ${skin.name}` : `${skin.name} — à débloquer dans une caisse`;
        return `<button type="button" class="skin-thumb${cls}" data-skin="${skin.id}" style="--rarity:${rar.color}" aria-label="${label}">
          <span class="skin-thumb-sprite" style="background-image:url('${url}')"></span>
          <span class="skin-thumb-name">${owned ? skin.name : '???'}</span>
          ${owned ? '' : '<span class="skin-thumb-lock" aria-hidden="true">🔒</span>'}
        </button>`;
      })
      .join('');
  }

  function buildOddsHTML() {
    const odds = activeOdds();
    const total = odds.reduce((sum, o) => sum + o.weight, 0);
    const rows = odds
      .map((o) => {
        const rar = Skins.RARITIES[o.rarity];
        const names = caseSkins().filter((s) => s.rarity === o.rarity).map((s) => s.name).join(', ');
        const pct = ((o.weight / total) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
        return `<li style="--rarity:${rar.color}">
          <span class="bar-case-odds-name">${rar.label}</span>
          <span class="bar-case-odds-pct">${pct} %</span>
          <span class="bar-case-odds-who">${names} · doublon : +${fmt(o.refund)} 🪙</span>
        </li>`;
      })
      .join('');
    const ev = odds.reduce((sum, o) => sum + (o.weight / total) * o.refund, 0);
    return `<ul class="bar-case-odds-list">${rows}</ul>
      <p class="bar-case-odds-note">💡 Une fois la collection complète, une caisse ne rapporte plus en moyenne que
      <strong>${fmt(Math.round(ev))} 🪙</strong> pour ${fmt(CASE_PRICE)} 🪙 payés : c'est l'avantage de la maison.</p>`;
  }

  function buildSkinPanelHTML() {
    if (typeof Skins === 'undefined') return '';
    return `<div class="bar-skin-panel">
      <div class="bar-skin-title">Mes personnages <span id="bar-skin-count"></span></div>
      <div class="bar-skin-grid" id="bar-skin-grid">${buildSkinGridHTML()}</div>
      <div class="bar-case">
        <div class="bar-case-crate" aria-hidden="true"><span>🥐</span></div>
        <button type="button" class="bar-case-btn" id="bar-case-open">Ouvrir une caisse · ${fmt(CASE_PRICE)} 🪙</button>
        <button type="button" class="bar-case-odds-toggle" id="bar-case-odds-toggle">Voir les chances ▾</button>
        <div class="bar-case-odds hidden" id="bar-case-odds">${buildOddsHTML()}</div>
      </div>
    </div>`;
  }

  function refreshSkinGrid() {
    const grid = document.getElementById('bar-skin-grid');
    if (!grid) return;
    grid.innerHTML = buildSkinGridHTML();
    grid.querySelectorAll('.skin-thumb').forEach((btn) => {
      btn.addEventListener('click', () => selectSkin(btn.dataset.skin));
    });
    const count = document.getElementById('bar-skin-count');
    if (count) count.textContent = `(${Skins.getOwnedIds().length}/${Skins.getAll().length})`;
    applyThumbFrame();
  }

  function selectSkin(id) {
    const skin = Skins.getSkinById(id);
    if (!Skins.isOwned(id)) {
      setMessage(`🔒 Ce personnage se débloque en ouvrant une caisse (${fmt(CASE_PRICE)} 🪙).`, 'msg-warn');
      Sfx.denied();
      return;
    }
    Skins.setCurrentId(id);
    Sfx.click();
    document.querySelectorAll('#bar-skin-grid .skin-thumb').forEach((b) => {
      b.classList.toggle('active', b.dataset.skin === id);
    });
    setMessage(`👤 ${skin.name} équipé.`, 'msg-good');
  }

  // Anime toutes les vignettes en boucle : gauche -> haut -> droite -> bas,
  // avec un petit cycle de marche (pas gauche / idle / pas droit / idle) sur
  // chaque direction, façon aperçu vivant du personnage.
  const SKIN_THUMB_CELL = 40; // doit matcher .skin-thumb-sprite (width/height) en CSS
  const SKIN_ROW_ORDER = [1, 3, 2, 0]; // gauche, haut, droite, bas (lignes du spritesheet)
  const SKIN_WALK_FRAMES = [0, 1, 2, 1]; // colonnes : pas gauche, idle, pas droit, idle
  let thumbRowIdx = 0;
  let thumbFrameIdx = 0;

  function applyThumbFrame() {
    const row = SKIN_ROW_ORDER[thumbRowIdx];
    const col = SKIN_WALK_FRAMES[thumbFrameIdx];
    const pos = `${-col * SKIN_THUMB_CELL}px ${-row * SKIN_THUMB_CELL}px`;
    // requête à chaque tick : la grille est reconstruite après chaque caisse
    document.querySelectorAll('#bar-skin-grid .skin-thumb-sprite').forEach((el) => {
      el.style.backgroundPosition = pos;
    });
  }

  function initSkinThumbAnimation() {
    setInterval(() => {
      thumbFrameIdx = (thumbFrameIdx + 1) % SKIN_WALK_FRAMES.length;
      if (thumbFrameIdx === 0) thumbRowIdx = (thumbRowIdx + 1) % SKIN_ROW_ORDER.length;
      applyThumbFrame();
    }, 260);
  }

  // --- Ouverture de caisse (sons : core/sfx.js) ---

  function caseCardHTML(skin, extraClass) {
    const rar = Skins.RARITIES[skin.rarity];
    const url = Skins.urlFor(skin.id, SKIN_ROOT_PREFIX);
    return `<div class="bar-case-card${extraClass || ''}" style="--rarity:${rar.color}">
      <span class="bar-case-card-sprite" style="background-image:url('${url}')"></span>
      <span class="bar-case-card-name">${skin.name}</span>
      <span class="bar-case-card-rarity">${rar.label}</span>
    </div>`;
  }

  function toggleCaseControls(enabled) {
    const btn = document.getElementById('bar-case-open');
    if (btn) btn.disabled = !enabled;
  }

  function openCase() {
    if (caseOpening || typeof Skins === 'undefined') return;
    if (!Wallet.canAfford(CASE_PRICE)) {
      setMessage(`Solde insuffisant : une caisse coûte ${fmt(CASE_PRICE)} 🪙.`, 'msg-warn');
      Sfx.denied();
      return;
    }
    Wallet.subtract(CASE_PRICE);
    if (window.Stats) Stats.bar('cases');
    Sfx.chipStack();
    caseOpening = true;
    toggleCaseControls(false);

    // Le résultat est tiré AVANT l'animation (comme dans CS) : la bande
    // n'est qu'une mise en scène construite autour de la carte gagnante.
    const winner = rollSkin();
    const isNew = Skins.unlock(winner.id);

    const cards = [];
    for (let i = 0; i < CASE_REEL_LENGTH; i++) {
      cards.push(i === CASE_WIN_INDEX ? caseCardHTML(winner, ' is-winner') : caseCardHTML(rollSkin()));
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop bar-case-backdrop';
    overlay.innerHTML = `
      <div class="modal bar-case-modal" role="dialog" aria-label="Ouverture de caisse">
        <div class="bar-case-modal-title">Caisse Croissantage</div>
        <div class="bar-case-reel">
          <div class="bar-case-track">${cards.join('')}</div>
          <div class="bar-case-marker"></div>
        </div>
        <p class="game-msg bar-case-result" id="bar-case-result">Ça tourne…</p>
        <div class="bar-case-actions hidden" id="bar-case-actions"></div>
      </div>`;
    document.body.appendChild(overlay);
    refreshSkinGrid();

    const reel = overlay.querySelector('.bar-case-reel');
    const track = overlay.querySelector('.bar-case-track');
    const cardEls = track.querySelectorAll('.bar-case-card');
    const cardW = cardEls[0].offsetWidth;
    const step = cardEls[1].offsetLeft - cardEls[0].offsetLeft;
    const firstLeft = cardEls[0].offsetLeft;
    // Arrêt aléatoire DANS la carte gagnante (pas toujours pile au centre)
    const jitter = (Math.random() - 0.5) * (cardW - 16);
    const targetX = -(firstLeft + CASE_WIN_INDEX * step + cardW / 2 + jitter) + reel.clientWidth / 2;

    void track.offsetWidth; // force le reflow pour que la transition parte bien de 0
    track.style.transition = `transform ${CASE_SPIN_MS}ms cubic-bezier(0.08, 0.75, 0.15, 1)`;
    track.style.transform = `translateX(${targetX}px)`;

    // "Tic" à chaque carte qui passe sous le repère
    let lastIdx = -1;
    let rafId = 0;
    function watch() {
      const x = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
      const idx = Math.floor((reel.clientWidth / 2 - x - firstLeft) / step);
      if (idx !== lastIdx) { lastIdx = idx; Sfx.caseTick(); }
      rafId = requestAnimationFrame(watch);
    }
    rafId = requestAnimationFrame(watch);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(rafId);
      revealCase(overlay, winner, isNew);
    };
    track.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, CASE_SPIN_MS + 300); // filet de sécurité
  }

  function revealCase(overlay, winner, isNew) {
    const rar = Skins.RARITIES[winner.rarity];
    overlay.querySelector('.bar-case-card.is-winner').classList.add('revealed');
    overlay.querySelector('.bar-case-modal').style.setProperty('--rarity', rar.color);
    overlay.querySelector('.bar-case-modal').classList.add('revealed');
    Sfx.caseReveal(CASE_ODDS.findIndex((o) => o.rarity === winner.rarity));

    const result = overlay.querySelector('#bar-case-result');
    const actions = overlay.querySelector('#bar-case-actions');
    if (isNew) {
      result.innerHTML = `✨ Nouveau personnage : <strong style="color:${rar.color}">${winner.name}</strong> (${rar.label}) !`;
      result.className = 'game-msg bar-case-result msg-good';
      setMessage(`🎉 ${winner.name} débloqué !`, 'msg-good');
    } else {
      const refund = refundFor(winner);
      Wallet.add(refund);
      if (window.Stats) Stats.bar('duplicates');
      setTimeout(() => Sfx.coins(10, 0.6), 400);
      result.innerHTML = `Doublon : <strong style="color:${rar.color}">${winner.name}</strong>, tu récupères ${fmt(refund)} 🪙.`;
      result.className = 'game-msg bar-case-result msg-warn';
      setMessage(`Doublon ${winner.name} : +${fmt(refund)} 🪙.`, 'msg-warn');
    }

    actions.innerHTML = `
      ${isNew ? '<button type="button" class="bar-case-btn" data-act="equip">Équiper</button>' : ''}
      <button type="button" class="bar-case-again" data-act="again">Rouvrir · ${fmt(CASE_PRICE)} 🪙</button>
      <button type="button" class="bar-case-close" data-act="close">Fermer</button>`;
    actions.classList.remove('hidden');

    const close = () => {
      overlay.remove();
      caseOpening = false;
      toggleCaseControls(true);
    };
    actions.querySelector('[data-act="close"]').addEventListener('click', close);
    actions.querySelector('[data-act="again"]').addEventListener('click', () => { close(); openCase(); });
    const equip = actions.querySelector('[data-act="equip"]');
    if (equip) equip.addEventListener('click', () => { selectSkin(winner.id); close(); });
  }

  function setMessage(msg, cls) {
    const el = document.getElementById('bar-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg' + (cls ? ' ' + cls : '');
  }

  function order(id) {
    const drink = DRINKS.find((d) => d.id === id);
    if (!drink) return;
    if (drink.price > 0 && !Wallet.canAfford(drink.price)) {
      setMessage('Solde insuffisant pour cette commande.', 'msg-warn');
      Sfx.denied();
      return;
    }
    Wallet.subtract(drink.price);
    Drunk.addDose(drink.dose);
    if (window.Stats) Stats.bar(drink.dose < 0 ? 'remedies' : 'cocktails');
    // cocktail : on verse puis les verres trinquent ; eau / café : on verse puis on boit
    if (drink.dose < 0) {
      Sfx.pour(0.5);
      Sfx.sip(0.55);
    } else {
      Sfx.pour(0.8);
      Sfx.clink(0.8);
    }
    setMessage(`🍹 ${drink.name} servi — ${drink.tagline}`, drink.dose < 0 ? 'msg-good' : '');
  }

  function updateMeterUI(level) {
    const fill = document.getElementById('bar-meter-fill');
    const state = document.getElementById('bar-meter-state');
    if (fill) fill.style.width = level + '%';
    if (state) {
      state.textContent = Drunk.stateLabel(level);
      state.style.color =
        level >= 80 ? '#e0685f' : level >= 55 ? '#e8964f' : level >= 32 ? 'var(--gold-bright)' : 'var(--cream)';
    }
  }

  function init() {
    const container = document.querySelector('#bar .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="bar-wrap">
        <div class="bar-scene">
          <div class="bar-neon-wrap"><span class="bar-neon">🥐</span></div>

          <div class="bar-light bar-light-left"><span class="bar-light-bulb"></span></div>
          <div class="bar-light bar-light-right"><span class="bar-light-bulb"></span></div>

          <div class="bar-shelves">${buildShelvesHTML()}</div>

          <div class="bar-bartender">
            <img class="bar-bartender-img" src="../../assets/misc/bar/barman.png" alt="Le barman">
          </div>

          <div class="bar-counter">
            <div class="bar-counter-top"></div>
            <div class="bar-counter-remedies">${buildRemediesHTML()}</div>
          </div>
        </div>

        <div class="bar-side-panel">
          <div class="bar-meter-label">Niveau : <span id="bar-meter-state">Sobre</span></div>
          <div class="bar-meter"><div class="bar-meter-fill" id="bar-meter-fill"></div></div>
          <p id="bar-message" class="game-msg">Le barman essuie un verre en attendant votre commande.</p>
          <p class="bar-hint">🖱️ Cliquez sur une bouteille de l'étagère pour commander, ou sur l'eau/café du comptoir pour dessaouler.</p>
          ${buildSkinPanelHTML()}
        </div>
      </div>
    `;

    container.querySelectorAll('.bar-real-drink, .bar-counter-remedy').forEach((btn) => {
      btn.addEventListener('click', () => order(btn.dataset.drink));
    });

    if (typeof Skins !== 'undefined') {
      refreshSkinGrid();
      initSkinThumbAnimation();
      document.getElementById('bar-case-open').addEventListener('click', openCase);
      document.getElementById('bar-case-odds-toggle').addEventListener('click', (e) => {
        const odds = document.getElementById('bar-case-odds');
        const hidden = odds.classList.toggle('hidden');
        e.currentTarget.textContent = hidden ? 'Voir les chances ▾' : 'Masquer les chances ▴';
      });
    }

    // Si une image de cocktail est manquante/mal nommée, on retombe sur un emoji
    // générique plutôt que d'afficher l'icône "image cassée" du navigateur.
    container.querySelectorAll('.bar-real-drink-emoji img').forEach((img) => {
      img.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'bar-real-drink-fallback';
        fallback.textContent = '🍹';
        img.replaceWith(fallback);
      });
    });

    Drunk.onChange(updateMeterUI);
    updateMeterUI(Drunk.getLevel());
    Wallet.refreshUI();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Bar.init());