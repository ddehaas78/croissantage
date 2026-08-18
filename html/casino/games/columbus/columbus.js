/* columbus.js — Columbus Deluxe pour Croissantage
   Machine à sous 5 rouleaux x 3 lignes, 10 lignes de paiement fixes,
   Wild (Colomb), Scatter (caravelles) -> Free Spins avec retrigger,
   plusieurs lignes gagnantes simultanées, feature Gamble.
   Symboles en emoji (placeholders en attendant les visuels définitifs).
*/
const Columbus = (() => {
  /* ---------------- Table des symboles (paytable) ---------------- */
  const SYMBOLS = {
    WILD:    { id: 'WILD',    img: '../../assets/columbus/Columbus.png', name: 'Christophe Colomb (Wild)', pay: { 2: 10, 3: 100, 4: 1000, 5: 5000 } },
    QUEEN:   { id: 'QUEEN',   img: '../../assets/columbus/Isabelle.png', name: 'Reine Isabelle',           pay: { 2: 5,  3: 50,  4: 200,  5: 1000 } },
    NECKLACE:{ id: 'NECKLACE',img: '../../assets/columbus/Collier.png',  name: "Collier d'or",             pay: { 2: 5,  3: 25,  4: 100,  5: 500 } },
    SEXTANT: { id: 'SEXTANT', img: '../../assets/columbus/Sextant.png',  name: 'Sextant',                  pay: { 2: 5,  3: 15,  4: 75,   5: 250 } },
    CARD_A:  { id: 'CARD_A',  img: '../../assets/columbus/A.png',        name: 'As',                       pay: { 3: 10, 4: 40,  5: 150 } },
    CARD_K:  { id: 'CARD_K',  img: '../../assets/columbus/K.png',        name: 'Roi',                      pay: { 3: 10, 4: 40,  5: 150 } },
    CARD_Q:  { id: 'CARD_Q',  img: '../../assets/columbus/Q.png',        name: 'Dame',                     pay: { 3: 10, 4: 40,  5: 150 } },
    CARD_J:  { id: 'CARD_J',  img: '../../assets/columbus/J.png',        name: 'Valet',                    pay: { 3: 5,  4: 20,  5: 100 } },
    CARD_10: { id: 'CARD_10', img: '../../assets/columbus/10.png',       name: 'Dix',                      pay: { 3: 5,  4: 20,  5: 100 } },
    SCATTER: { id: 'SCATTER', img: '../../assets/columbus/Bateau.png', name: 'Caravelle (Scatter)',      pay: {} },
  };

  /* ---------------- Les 10 lignes de paiement (indices de rangée 0-2 par rouleau) ---------------- */
  const PAYLINES = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [1, 0, 1, 2, 1],
  ];

  /* ---------------- Poids des symboles pour générer les bandes de rouleaux ---------------- */
  const SYMBOL_WEIGHTS = [
    ['WILD', 2], ['QUEEN', 3], ['NECKLACE', 4], ['SEXTANT', 5],
    ['CARD_A', 7], ['CARD_K', 7], ['CARD_Q', 7], ['CARD_J', 8], ['CARD_10', 8],
    ['SCATTER', 3],
  ];

  const LINES_COUNT = 10; // Toutes les lignes sont désormais actives en permanence
  // Jetons : valeurs fixes (mise/ligne) + jetons "fraction du solde total"
  // (1/4, 1/2, ALL), répartis sur les 10 lignes actives.
  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  let selectedChipIndex = 0; // '25' par défaut
  let betPerLine = 25; // recalculé via refreshBetPerLine() dès que le Wallet est prêt
  let spinning = false;
  let inFreeSpins = false;
  let freeSpinsRemaining = 0;
  let freeSpinsTotalWin = 0;
  let pendingWin = 0;
  let coinRotation = 0;
  let gambling = false;
  let grid = [];
  let built = false;
  let REELS = [];

  function fmt(n) {
    return n.toLocaleString('fr-FR');
  }

  // Montant d'un jeton pour la mise TOTALE (les 10 lignes sont fixes et
  // toujours actives, donc le jeton représente directement ce qui sera
  // débité du solde) : pour un jeton fixe c'est sa valeur telle quelle ;
  // pour un jeton fraction, on prend cette fraction du solde total.
  function chipAmount(def) {
    if (def.type === 'fixed') return def.value;
    return Math.max(1, Math.floor(Wallet.get() * def.fraction));
  }

  // betPerLine reste utilisé en interne pour le calcul des gains par ligne
  // (table des paiements), mais la mise totale (celle réellement débitée)
  // est désormais directement la valeur du jeton sélectionné.
  function refreshBetPerLine() {
    betPerLine = chipAmount(CHIP_DEFS[selectedChipIndex]) / LINES_COUNT;
  }

  function getTotalBet() {
    return chipAmount(CHIP_DEFS[selectedChipIndex]);
  }

  // Les jetons "fraction" affichent leur montant réel (mise totale) en
  // tooltip ; on la rafraîchit à chaque changement de solde.
  function refreshFractionChipTooltips() {
    document.querySelectorAll('.cd-bet-mult-btn[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') {
        btn.dataset.tooltip = `Mise totale : ${fmt(chipAmount(def))} 🪙`;
      }
    });
  }

  function buildStrip() {
    let strip = [];
    SYMBOL_WEIGHTS.forEach(([id, w]) => {
      for (let i = 0; i < w; i++) strip.push(id);
    });
    for (let i = strip.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [strip[i], strip[j]] = [strip[j], strip[i]];
    }
    return strip;
  }

  function buildReels() {
    REELS = [buildStrip(), buildStrip(), buildStrip(), buildStrip(), buildStrip()];
  }

  function cellHTML(symbolId, row) {
    const def = SYMBOLS[symbolId];
    const content = def.img
      ? `<img class="cd-symbol-img" src="${def.img}" alt="${def.name}" draggable="false">`
      : def.emoji;
    return `<div class="cd-cell" data-row="${row}">${content}</div>`;
  }

  /* ---------------- Construction du panneau Paytable ---------------- */
  function paytableTile(symbolIds, title, mult) {
    const def = SYMBOLS[symbolIds[0]];
    const emojis = symbolIds
      .map((id) => {
        const s = SYMBOLS[id];
        return s.img
          ? `<img class="cd-symbol-img cd-pt-card" src="${s.img}" alt="${s.name}" draggable="false">`
          : s.emoji;
      })
      .join(' ');
    const rows = Object.keys(def.pay)
      .sort((a, b) => b - a)
      .map((n) => `<div class="cd-pt-row"><span>${n}x</span><span>${fmt(def.pay[n] * mult)} 🪙</span></div>`)
      .join('');
    return `<div class="cd-pt-tile"><div class="cd-pt-emoji">${emojis}</div><div class="cd-pt-name">${title}</div>${rows}</div>`;
  }

  function scatterTile() {
    return `
      <div class="cd-pt-tile cd-pt-tile-scatter">
        <div class="cd-pt-scatter-title">⛵ Scatter</div>
        <div class="cd-pt-scatter-body">
          <span class="cd-pt-scatter-emoji">⛵ ⛵ ⛵</span>
          <span>3 caravelles n'importe où sur la grille déclenchent <strong>10 Free Spins</strong>. En Free Spins, elles sont aussi Wild et peuvent retrigger.</span>
        </div>
      </div>
    `;
  }

  function buildPaytableHTML(mult) {
    return `
      <p class="cd-paytable-sub">Gains pour la mise actuelle (${fmt(getTotalBet())} 🪙 au total, 10 lignes fixes)</p>
      <div class="cd-paytable-grid">
        ${paytableTile(['QUEEN'], 'Reine Isabelle', mult)}
        ${paytableTile(['WILD'], 'Christophe Colomb (Wild)', mult)}
        ${paytableTile(['SEXTANT'], 'Sextant', mult)}
        ${paytableTile(['NECKLACE'], "Collier d'or", mult)}
        ${paytableTile(['CARD_A', 'CARD_K', 'CARD_Q'], 'As • Roi • Dame', mult)}
        ${paytableTile(['CARD_J', 'CARD_10'], 'Valet • Dix', mult)}
        ${scatterTile()}
      </div>
    `;
  }

  function refreshPaytableValues() {
    const el = document.getElementById('cd-paytable-content');
    if (el) el.innerHTML = buildPaytableHTML(betPerLine);
  }

  /* ---------------- Init / DOM ---------------- */
  function init() {
    const container = document.querySelector('#columbus .game-body');
    if (!container || built) return;
    built = true;
    buildReels();
    refreshBetPerLine();

    container.innerHTML = `
      <div class="cd-wrap">
        <div id="cd-fs-banner" class="cd-fs-banner" hidden>🎉 FREE SPINS — <span id="cd-fs-count">10</span> tours restants · Gains en cours : <span id="cd-fs-total">0</span> 🪙</div>

        <div class="cd-layout">
          <div id="cd-paytable-panel" class="cd-paytable-side" hidden>
            <button type="button" class="cd-paytable-close" id="cd-paytable-close">✕</button>
            <h3 class="cd-paytable-title">🗺️ Table des gains</h3>
            <div id="cd-paytable-content">${buildPaytableHTML(betPerLine)}</div>
          </div>

          <div class="cd-reels-stage" id="cd-reels-stage">
            <div class="cd-reels" id="cd-reels">
              ${[0, 1, 2, 3, 4].map((i) => `
                <div class="cd-reel" data-reel="${i}">
                  <div class="cd-reel-track"></div>
                </div>`).join('')}
            </div>
            <svg id="cd-winlines" class="cd-winlines-svg"></svg>
            <div class="cd-coin-burst" id="cd-coin-burst"></div>
          </div>
        </div>

        <div class="cd-controls-bar">
          <div class="cd-control">
            <span class="cd-control-label">Mise</span>
            <div class="cd-bet-multipliers" id="cd-bet-multipliers">
              ${CHIP_DEFS.map((def, i) => {
                const active = i === selectedChipIndex ? ' active' : '';
                const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise totale : ${fmt(chipAmount(def))} 🪙"` : '';
                return `<button type="button" class="cd-bet-mult-btn${active}" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
              }).join('')}
            </div>
          </div>
          <div class="cd-total-bet">Mise totale : <span id="cd-total-bet">${getTotalBet()}</span> 🪙</div>
          <button type="button" class="btn-action cd-paytable-btn" id="cd-paytable-btn">Paytable</button>
          <button type="button" class="btn-action cd-spin-btn" id="cd-spin-btn">LANCER</button>
        </div>

        <div id="cd-gamble-panel" class="cd-gamble-panel" hidden>
          <div class="cd-gamble-amount">Gain à sécuriser : <span id="cd-gamble-amount">0</span> 🪙</div>
          <div class="cd-coin-wrap">
            <div class="cd-coin" id="cd-coin">
              <div class="cd-coin-side cd-coin-side-pile">🪙<span>PILE</span></div>
              <div class="cd-coin-side cd-coin-side-face">🦅<span>FACE</span></div>
            </div>
          </div>
          <div class="cd-gamble-actions">
            <button type="button" class="btn-action cd-gamble-pile" id="cd-gamble-pile">Pile</button>
            <button type="button" class="btn-action cd-gamble-face" id="cd-gamble-face">Face</button>
            <button type="button" class="btn-action cd-gamble-cashout" id="cd-gamble-cashout">Encaisser</button>
          </div>
        </div>

        <div class="cd-info-bar">
          <p id="cd-message" class="game-msg">Placez votre mise et lancez les rouleaux !</p>
          <div id="cd-wins-list" class="cd-wins-list"></div>
        </div>
      </div>
    `;

    // Rouleaux au repos : on affiche 3 symboles aléatoires par rouleau
    document.querySelectorAll('.cd-reel').forEach((reelEl, idx) => {
      const track = reelEl.querySelector('.cd-reel-track');
      const startSymbols = [0, 1, 2].map(() => REELS[idx][Math.floor(Math.random() * REELS[idx].length)]);
      track.innerHTML = startSymbols.map((id, row) => cellHTML(id, row)).join('');
      grid[idx] = startSymbols;
    });

    bindEvents(container);
    Wallet.refreshUI();
    updateTotalBetDisplay();
  }

  function bindEvents(container) {
    container.querySelectorAll('.cd-bet-mult-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectChip(Number(btn.dataset.chipIndex)));
    });
    container.querySelector('#cd-spin-btn').addEventListener('click', spin);
    container.querySelector('#cd-paytable-btn').addEventListener('click', () => togglePaytable());
    container.querySelector('#cd-paytable-close').addEventListener('click', () => togglePaytable(false));
    container.querySelector('#cd-gamble-pile').addEventListener('click', () => gambleChoice('pile'));
    container.querySelector('#cd-gamble-face').addEventListener('click', () => gambleChoice('face'));
    container.querySelector('#cd-gamble-cashout').addEventListener('click', cashOutGamble);
    Wallet.onChange(() => {
      // On ne recalcule la mise "fraction" (1/4, 1/2, ALL) que lorsque le
      // joueur peut à nouveau modifier ses contrôles, c'est-à-dire une fois
      // le tour totalement résolu (gains recrédités compris). Sinon, le
      // débit de la mise elle-même déclenchait ce onChange en pleine
      // résolution et recalculait la mise sur un solde déjà amputé de la
      // mise en cours (pas encore des gains) -> effondrement en cascade
      // (1/4 du solde, puis 1/4 de ce qu'il en reste, etc.).
      if (!canEditControls()) return;
      refreshBetPerLine();
      updateTotalBetDisplay();
      refreshFractionChipTooltips();
    });
  }

  function setMessage(msg) {
    const el = document.getElementById('cd-message');
    if (el) el.textContent = msg;
  }

  function togglePaytable(show) {
    const panel = document.getElementById('cd-paytable-panel');
    if (!panel) return;
    const next = typeof show === 'boolean' ? show : panel.hidden;
    panel.hidden = !next;
  }

  /* ---------------- Contrôle de mise ---------------- */
  function canEditControls() {
    return !spinning && !inFreeSpins && pendingWin === 0;
  }

  function selectChip(index) {
    if (!canEditControls()) return;
    if (!CHIP_DEFS[index]) return;
    selectedChipIndex = index;
    refreshBetPerLine();
    document.querySelectorAll('.cd-bet-mult-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.chipIndex) === selectedChipIndex);
    });
    updateTotalBetDisplay();
    refreshPaytableValues();
  }

  function updateTotalBetDisplay() {
    const el = document.getElementById('cd-total-bet');
    if (el) el.textContent = fmt(getTotalBet());
  }

  function toggleControls(enabled) {
    const spinBtn = document.getElementById('cd-spin-btn');
    const paytableBtn = document.getElementById('cd-paytable-btn');
    if (spinBtn) spinBtn.disabled = !enabled || gambling;
    if (paytableBtn) paytableBtn.disabled = !enabled;
    const lockControls = !enabled || inFreeSpins || pendingWin > 0;
    document.querySelectorAll('.cd-bet-mult-btn').forEach((btn) => {
      btn.disabled = lockControls;
    });
  }

  /* ---------------- Free Spins UI ---------------- */
  function updateFreeSpinsBanner() {
    const banner = document.getElementById('cd-fs-banner');
    const countEl = document.getElementById('cd-fs-count');
    const totalEl = document.getElementById('cd-fs-total');
    const stage = document.getElementById('cd-reels-stage');
    if (!banner) return;
    if (inFreeSpins) {
      banner.hidden = false;
      if (countEl) countEl.textContent = freeSpinsRemaining;
      if (totalEl) totalEl.textContent = fmt(freeSpinsTotalWin);
      if (stage) stage.classList.add('cd-fs-glow');
    } else {
      banner.hidden = true;
      if (stage) stage.classList.remove('cd-fs-glow');
    }
  }

  let coinVariantIndex = 0;

  function spawnCoinBurst(count = 45) {
    const variant = coinVariantIndex % 2 === 0 ? 'rain' : 'glitter';
    coinVariantIndex++;
    if (variant === 'rain') spawnCoinRain(count);
    else spawnCoinGlitter(count);
  }

  function spawnCoinRain(count) {
    const container = document.getElementById('cd-coin-burst');
    if (!container) return;
    const stageWidth = container.clientWidth || 700;
    const coinChars = ['🪙', '🪙', '🪙', '💰', '💵'];
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('span');
      coin.className = 'cd-coin-particle cd-coin-rain';
      coin.textContent = coinChars[Math.floor(Math.random() * coinChars.length)];
      const startX = Math.random() * stageWidth;
      const sway = (Math.random() * 120 - 60);
      const fall = 420 + Math.random() * 160;
      const size = 1.1 + Math.random() * 1.1;
      const dur = 1.1 + Math.random() * 0.9;
      const spin = 360 + Math.random() * 540;
      coin.style.left = `${startX}px`;
      coin.style.setProperty('--sway', `${sway}px`);
      coin.style.setProperty('--fall', `${fall}px`);
      coin.style.setProperty('--size', `${size}rem`);
      coin.style.setProperty('--dur', `${dur}s`);
      coin.style.setProperty('--spin', `${spin}deg`);
      coin.style.animationDelay = `${Math.random() * 0.5}s`;
      container.appendChild(coin);
      setTimeout(() => coin.remove(), (dur + 0.6) * 1000);
    }
  }

  function spawnCoinGlitter(count) {
    const container = document.getElementById('cd-coin-burst');
    if (!container) return;
    const coinChars = ['🪙', '🪙', '💰', '✨', '✨'];
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('span');
      coin.className = 'cd-coin-particle cd-coin-glitter';
      coin.textContent = coinChars[Math.floor(Math.random() * coinChars.length)];
      const top = Math.random() * 90;
      const left = Math.random() * 94;
      const size = 1 + Math.random() * 1.3;
      const dur = 0.9 + Math.random() * 0.8;
      const spin = Math.random() * 360 - 180;
      coin.style.top = `${top}%`;
      coin.style.left = `${left}%`;
      coin.style.setProperty('--size', `${size}rem`);
      coin.style.setProperty('--dur', `${dur}s`);
      coin.style.setProperty('--spin', `${spin}deg`);
      coin.style.animationDelay = `${Math.random() * 0.6}s`;
      container.appendChild(coin);
      setTimeout(() => coin.remove(), (dur + 0.8) * 1000);
    }
  }

  /* ---------------- Spin ---------------- */
  function spin() {
    if (spinning || gambling) return;

    if (pendingWin > 0) {
      // La personne relance directement sans passer par "Encaisser" : on encaisse pour elle
      Wallet.add(pendingWin);
      pendingWin = 0;
      hideGamblePanel();
    }

    // On verrouille AVANT de débiter la mise : Wallet.subtract() déclenche
    // Wallet.onChange en synchrone, qui ne doit surtout pas recalculer une
    // mise "fraction" (1/4, 1/2, ALL) sur le solde tout juste amputé de la
    // mise en cours (canEditControls() doit déjà renvoyer false ici).
    spinning = true;

    if (inFreeSpins) {
      if (freeSpinsRemaining <= 0) {
        spinning = false;
        return;
      }
    } else {
      const totalBet = getTotalBet();
      if (!Wallet.canAfford(totalBet)) {
        setMessage('Solde insuffisant pour cette mise.');
        spinning = false;
        return;
      }
      Wallet.subtract(totalBet);
    }

    toggleControls(false);
    clearWinHighlights();
    document.getElementById('cd-wins-list').innerHTML = '';
    setMessage(inFreeSpins ? 'Free Spin en cours...' : 'Les rouleaux tournent...');

    const finalGrid = [0, 1, 2, 3, 4].map((reelIdx) => {
      const strip = REELS[reelIdx];
      const start = Math.floor(Math.random() * strip.length);
      return [0, 1, 2].map((offset) => strip[(start + offset) % strip.length]);
    });

    animateReels(finalGrid).then(() => resolveSpin(finalGrid));
  }

  function animateReels(finalGrid) {
    return new Promise((resolve) => {
      const reelEls = document.querySelectorAll('.cd-reel');
      let maxDuration = 0;

      reelEls.forEach((reelEl, idx) => {
        const track = reelEl.querySelector('.cd-reel-track');
        const fillerCount = 16 + idx * 4;
        const spinSymbols = [];
        for (let i = 0; i < fillerCount; i++) {
          spinSymbols.push(REELS[idx][Math.floor(Math.random() * REELS[idx].length)]);
        }
        finalGrid[idx].forEach((id) => spinSymbols.push(id));

        track.style.transition = 'none';
        track.style.transform = 'translateY(0)';
        track.innerHTML = spinSymbols.map((id) => cellHTML(id, -1)).join('');
        void track.getBoundingClientRect();

        // Mesure la hauteur réelle d'une cellule rendue (et non le conteneur / 3),
        // pour éviter tout écart d'arrondi lié aux bordures / box-sizing qui
        // désalignait progressivement les cartes pendant le défilement.
        const cellH = track.firstElementChild.getBoundingClientRect().height;

        const totalCells = spinSymbols.length;
        const finalOffset = -(totalCells - 3) * cellH;
        const duration = 900 + idx * 260;
        maxDuration = Math.max(maxDuration, duration);

        requestAnimationFrame(() => {
          track.style.transition = `transform ${duration}ms cubic-bezier(0.17, 0.67, 0.24, 1)`;
          track.style.transform = `translateY(${finalOffset}px)`;
        });
      });

      setTimeout(resolve, maxDuration + 150);
    });
  }

  function settleReels(finalGrid) {
    document.querySelectorAll('.cd-reel').forEach((reelEl, idx) => {
      const track = reelEl.querySelector('.cd-reel-track');
      track.style.transition = 'none';
      track.style.transform = 'translateY(0)';
      track.innerHTML = finalGrid[idx].map((id, row) => cellHTML(id, row)).join('');
    });
  }

  function clearWinHighlights() {
    document.querySelectorAll('.cd-cell-win').forEach((c) => c.classList.remove('cd-cell-win'));
    clearWinLines();
  }

  const LINE_COLORS = ['#f4d976', '#17a589', '#e0526b', '#5aa9e6', '#c060e0', '#ffb703', '#5ad1c9', '#e07b39', '#8ecae6', '#9c1f30'];

  function clearWinLines() {
    const svg = document.getElementById('cd-winlines');
    if (svg) svg.innerHTML = '';
  }

  function drawWinLines(wins) {
    const svg = document.getElementById('cd-winlines');
    if (!svg || wins.length === 0) return;
    const svgRect = svg.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) return;
    svg.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);

    function cellCenter(reelIdx, row) {
      const cell = document.querySelector(`.cd-reel[data-reel="${reelIdx}"] .cd-cell[data-row="${row}"]`);
      if (!cell) return null;
      const r = cell.getBoundingClientRect();
      return { x: r.left + r.width / 2 - svgRect.left, y: r.top + r.height / 2 - svgRect.top };
    }

    wins.forEach((w, idx) => {
      const pattern = PAYLINES[w.lineIndex - 1];
      const color = LINE_COLORS[(w.lineIndex - 1) % LINE_COLORS.length];

      // Tracé complet de la ligne sur les 5 rouleaux (trait fin en fond)
      const fullPoints = [];
      for (let i = 0; i < pattern.length; i++) {
        const c = cellCenter(i, pattern[i]);
        if (!c) return;
        fullPoints.push(`${c.x},${c.y}`);
      }
      const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      ghost.setAttribute('points', fullPoints.join(' '));
      ghost.setAttribute('class', 'cd-winline-ghost');
      ghost.style.stroke = color;
      ghost.style.animationDelay = `${idx * 120}ms`;
      svg.appendChild(ghost);

      // Segment gagnant (les symboles qui ont réellement matché), en trait plein
      const winPoints = fullPoints.slice(0, w.count);
      if (winPoints.length < 2) return;
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', winPoints.join(' '));
      poly.setAttribute('class', 'cd-winline');
      poly.style.stroke = color;
      poly.style.animationDelay = `${idx * 120}ms`;
      svg.appendChild(poly);
    });
  }

  function highlightWinningCells(wins) {
    wins.forEach((w) => {
      const pattern = PAYLINES[w.lineIndex - 1];
      for (let i = 0; i < w.count; i++) {
        const row = pattern[i];
        const cell = document.querySelector(`.cd-reel[data-reel="${i}"] .cd-cell[data-row="${row}"]`);
        if (cell) cell.classList.add('cd-cell-win');
      }
    });
  }

  /* ---------------- Évaluation d'une ligne (avec priorité au gain le plus élevé) ---------------- */
  function evaluateLine(symbols, scattersAreWild) {
    const candidates = new Set(['WILD']);
    symbols.forEach((id) => {
      if (id !== 'WILD' && id !== 'SCATTER') candidates.add(id);
    });

    let best = { payout: 0, count: 0, symbolId: null };

    candidates.forEach((candId) => {
      let count = 0;
      for (let i = 0; i < symbols.length; i++) {
        const id = symbols[i];
        const isWildHere = id === 'WILD' || (scattersAreWild && id === 'SCATTER');
        if (candId === 'WILD') {
          if (isWildHere) count++; else break;
        } else if (id === candId || isWildHere) {
          count++;
        } else {
          break;
        }
      }
      const def = SYMBOLS[candId];
      const payout = def.pay && def.pay[count] ? def.pay[count] : 0;
      if (payout > best.payout) best = { payout, count, symbolId: candId };
    });

    return best;
  }

  function checkScatterTrigger(finalGrid) {
    // Compte le nombre total de caravelles sur toute la grille (peu importe la position)
    let scatterCount = 0;
    finalGrid.forEach((reel) => {
      reel.forEach((id) => {
        if (id === 'SCATTER') scatterCount++;
      });
    });
    return scatterCount >= 3;
  }

  /* ---------------- Résolution du tour ---------------- */
  function resolveSpin(finalGrid) {
    settleReels(finalGrid);
    grid = finalGrid;

    const scattersAreWild = inFreeSpins;
    const wins = [];
    let totalWin = 0;

    for (let i = 0; i < LINES_COUNT; i++) {
      const pattern = PAYLINES[i];
      const symbols = pattern.map((row, reelIdx) => finalGrid[reelIdx][row]);
      const best = evaluateLine(symbols, scattersAreWild);
      if (best.payout > 0) {
        const amount = Math.round(best.payout * betPerLine);
        wins.push({ lineIndex: i + 1, symbolId: best.symbolId, count: best.count, amount });
        totalWin += amount;
      }
    }

    const scatterTriggered = checkScatterTrigger(finalGrid);

    highlightWinningCells(wins);
    drawWinLines(wins);
    renderWinsList(wins, totalWin);

    if (inFreeSpins) {
      freeSpinsRemaining -= 1;
      freeSpinsTotalWin += totalWin;
      if (totalWin > 0) spawnCoinBurst(Math.min(70, 25 + wins.length * 10));

      if (scatterTriggered) {
        freeSpinsRemaining += 10;
        spawnCoinBurst(60);
        setMessage(`⛵ Nouvelles caravelles ! +10 Free Spins (${fmt(totalWin)} 🪙 mis de côté sur ce tour).`);
      } else if (totalWin > 0) {
        setMessage(`Gain : ${fmt(totalWin)} 🪙 mis de côté (total : ${fmt(freeSpinsTotalWin)} 🪙)`);
      } else {
        setMessage('Aucun gain sur ce tour.');
      }

      updateFreeSpinsBanner();

      if (freeSpinsRemaining <= 0) {
        inFreeSpins = false;
        updateFreeSpinsBanner();

        spinning = false;

        if (freeSpinsTotalWin > 0) {
          pendingWin = freeSpinsTotalWin;
          setMessage(`🎉 Free Spins terminés ! Gain total : ${fmt(freeSpinsTotalWin)} 🪙. Encaisser ou tenter de doubler ?`);
          offerGamble();
        } else {
          setMessage('Free Spins terminés ! Aucun gain sur ces tours.');
          finishRound();
        }
        return;
      }

      spinning = false;
      finishRound();
      return;
    }

    // Jeu de base
    if (scatterTriggered) {
      inFreeSpins = true;
      freeSpinsRemaining = 10;
      freeSpinsTotalWin = 0;
      updateFreeSpinsBanner();
      spawnCoinBurst(60);
      setMessage('⛵⛵⛵ 3 Caravelles ! 10 Free Spins gagnés !');
    } else if (totalWin > 0) {
      spawnCoinBurst(Math.min(70, 25 + wins.length * 10));
      setMessage(wins.length > 1 ? `Gagné sur ${wins.length} lignes !` : 'Ligne gagnante !');
    } else {
      setMessage('Aucun gain, retentez votre chance.');
    }

    spinning = false;

    if (totalWin > 0) {
      pendingWin = totalWin;
      offerGamble();
    } else {
      finishRound();
    }
  }

  function finishRound() {
    toggleControls(true);
    // Le solde est désormais définitif pour ce tour (gains recrédités
    // compris) : on peut recalculer en toute sécurité une mise "fraction".
    refreshBetPerLine();
    updateTotalBetDisplay();
    refreshFractionChipTooltips();
  }

  function renderWinsList(wins, totalWin) {
    const el = document.getElementById('cd-wins-list');
    if (!el) return;
    if (wins.length === 0) {
      el.innerHTML = '';
      return;
    }
    const chips = wins
      .map((w) => `<span class="cd-win-chip">Ligne ${w.lineIndex} • ${SYMBOLS[w.symbolId].name} x${w.count} → <strong>${fmt(w.amount)} 🪙</strong></span>`)
      .join('');
    const totalChip = wins.length > 1 ? `<span class="cd-win-chip cd-win-total">Total : <strong>${fmt(totalWin)} 🪙</strong></span>` : '';
    el.innerHTML = chips + totalChip;
  }

  /* ---------------- Gamble (Pile ou Face) ---------------- */
  function setGambleButtonsDisabled(disabled) {
    ['cd-gamble-pile', 'cd-gamble-face', 'cd-gamble-cashout'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = disabled;
    });
  }

  function offerGamble() {
    const panel = document.getElementById('cd-gamble-panel');
    const amountEl = document.getElementById('cd-gamble-amount');
    const coin = document.getElementById('cd-coin');
    if (amountEl) amountEl.textContent = fmt(pendingWin);
    if (coin) {
      coin.style.transition = 'none';
      coin.style.transform = 'rotateY(0deg)';
      void coin.getBoundingClientRect();
    }
    coinRotation = 0;
    gambling = false;
    setGambleButtonsDisabled(false);
    if (panel) panel.hidden = false;
    toggleControls(true); // remet le multiplicateur/paytable dispo, mais spin reste bloqué via pendingWin>0
  }

  function hideGamblePanel() {
    const panel = document.getElementById('cd-gamble-panel');
    if (panel) panel.hidden = true;
  }

  function gambleChoice(choice) {
    if (pendingWin <= 0 || gambling) return;
    gambling = true;
    setGambleButtonsDisabled(true);
    setMessage('La pièce est lancée...');

    const result = Math.random() < 0.5 ? 'pile' : 'face';
    const coin = document.getElementById('cd-coin');
    const spins = 4; // tours complets pour l'effet visuel avant de se stabiliser
    const targetDeg = result === 'face' ? 180 : 0;
    coinRotation = coinRotation - (coinRotation % 360) + spins * 360 + targetDeg;
    if (coin) {
      coin.style.transition = 'transform 1.1s cubic-bezier(0.22, 0.61, 0.36, 1)';
      coin.style.transform = `rotateY(${coinRotation}deg)`;
    }

    setTimeout(() => {
      if (choice === result) {
        pendingWin *= 2;
        const amountEl = document.getElementById('cd-gamble-amount');
        if (amountEl) amountEl.textContent = fmt(pendingWin);
        setMessage(`${result === 'pile' ? 'Pile' : 'Face'} ! Gain doublé : ${fmt(pendingWin)} 🪙. Encaisser ou retenter ?`);
        gambling = false;
        setGambleButtonsDisabled(false);
      } else {
        setMessage(`${result === 'pile' ? 'Pile' : 'Face'} ! Perdu, le gain de ce tour est envolé.`);
        pendingWin = 0;
        gambling = false;
        hideGamblePanel();
        finishRound();
      }
    }, 1150);
  }

  function cashOutGamble() {
    if (pendingWin <= 0 || gambling) return;
    Wallet.add(pendingWin);
    setMessage(`Encaissé : ${fmt(pendingWin)} 🪙 !`);
    pendingWin = 0;
    hideGamblePanel();
    finishRound();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Columbus.init());