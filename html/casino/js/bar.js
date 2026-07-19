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
            <img src="../boisson/${drink.id}.png" alt="${drink.name}" loading="lazy">
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

  // --- Sélecteur de skin ---
  // rootPrefix '../' car bar.html est dans /html/, un niveau sous la racine
  // où se trouve assets/player/.
  const SKIN_ROOT_PREFIX = '../';

  function buildSkinPanelHTML() {
    if (typeof Skins === 'undefined') return '';
    const currentId = Skins.getCurrentId();
    const thumbs = Skins.getAll()
      .map((skin) => {
        const url = Skins.urlFor(skin.id, SKIN_ROOT_PREFIX);
        const active = skin.id === currentId ? ' active' : '';
        return `<button type="button" class="skin-thumb${active}" data-skin="${skin.id}" aria-label="Choisir le skin ${skin.name}">
          <span class="skin-thumb-sprite" style="background-image:url('${url}')"></span>
          <span class="skin-thumb-name">${skin.name}</span>
        </button>`;
      })
      .join('');
    return `<div class="bar-skin-panel">
      <div class="bar-skin-title">Apparence du personnage</div>
      <div class="bar-skin-grid">${thumbs}</div>
    </div>`;
  }

  // Anime toutes les vignettes en boucle : gauche -> haut -> droite -> bas,
  // avec un petit cycle de marche (pas gauche / idle / pas droit / idle) sur
  // chaque direction, façon aperçu vivant du personnage.
  const SKIN_THUMB_CELL = 40; // doit matcher .skin-thumb-sprite (width/height) en CSS
  const SKIN_ROW_ORDER = [1, 3, 2, 0]; // gauche, haut, droite, bas (lignes du spritesheet)
  const SKIN_WALK_FRAMES = [0, 1, 2, 1]; // colonnes : pas gauche, idle, pas droit, idle

  function initSkinThumbAnimation(container) {
    const thumbs = container.querySelectorAll('.skin-thumb-sprite');
    if (!thumbs.length) return;
    let rowIdx = 0;
    let frameIdx = 0;
    setInterval(() => {
      frameIdx = (frameIdx + 1) % SKIN_WALK_FRAMES.length;
      if (frameIdx === 0) rowIdx = (rowIdx + 1) % SKIN_ROW_ORDER.length;
      const row = SKIN_ROW_ORDER[rowIdx];
      const col = SKIN_WALK_FRAMES[frameIdx];
      const pos = `${-col * SKIN_THUMB_CELL}px ${-row * SKIN_THUMB_CELL}px`;
      thumbs.forEach((el) => { el.style.backgroundPosition = pos; });
    }, 260);
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
      return;
    }
    Wallet.subtract(drink.price);
    Drunk.addDose(drink.dose);
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
            <img class="bar-bartender-img" src="../assets/misc/bar/barman.png" alt="Le barman">
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

    container.querySelectorAll('.skin-thumb').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof Skins === 'undefined') return;
        Skins.setCurrentId(btn.dataset.skin);
        container.querySelectorAll('.skin-thumb').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    initSkinThumbAnimation(container);

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