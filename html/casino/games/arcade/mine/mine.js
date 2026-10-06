/* mines.js — Mines pour Croissantage
   Inspiré du Mines de stake-originals-clone (github.com/tanh1c/stake-originals-clone) :
   grille 5x5, nombre de mines réglable, multiplicateur qui grimpe à chaque
   case sûre révélée, encaissement à tout moment. Redessiné dans le thème
   or/bordeaux/émeraude du site, jetons de mise reliés au Wallet (mêmes
   jetons 25 / 50 / 100 / 1/4 / 1/2 / ALL que les autres jeux).
*/
const Mines = (() => {
  const GRID_SIZE = 25; // grille 5x5
  const HOUSE_EDGE = 0.99; // 1% d'avantage maison, comme la référence
  const MIN_MINES = 1;
  const MAX_MINES = 24;
  const DEFAULT_MINES = 3;

  // Jetons : valeurs fixes + jetons "fraction du solde" (1/4, 1/2, ALL),
  // recalculés en live sur le solde réel (le Wallet n'est débité qu'au
  // moment de DÉMARRER, une seule mise par manche donc pas d'accumulation).
  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  let selectedChipIndex = 1; // '50' par défaut
  let stake = 0; // mise composée en cliquant sur les jetons (100 ×3 = 300)
  let lastStake = 0;
  let lastChipIndex = null; // dernier jeton utilisé, pour "Même mise"
  let minesCount = DEFAULT_MINES;
  let bet = 0;
  let playing = false;
  let revealed = []; // indices de cases révélées (sûres) pendant la manche en cours
  let mineLocations = []; // positions des mines, connues seulement côté serveur/local à la manche
  let gameOverState = null; // 'win' | 'loss' | null
  let built = false;

  // Images (assets/misc/arcade/mine/)
  const ASSET_PATH = '../../../assets/misc/arcade/mine/';
  const IMG_GEM = `<img class="mn-tile-img" src="${ASSET_PATH}diamant.svg" alt="Diamant" draggable="false">`;
  const IMG_BOMB = `<img class="mn-tile-img" src="${ASSET_PATH}bombe.svg" alt="Mine" draggable="false">`;
  const IMG_BOOM = `<img class="mn-tile-boom" src="${ASSET_PATH}explosion.svg" alt="" draggable="false">`;

  function fmt(n) {
    return Math.round(n).toLocaleString('fr-FR');
  }

  /* ---------------- Jetons ---------------- */
  // Montant d'un jeton. Les jetons "fraction" (1/4, 1/2, ALL) se calculent
  // sur ce qui reste disponible (solde - mise déjà composée).
  function chipAmount(def) {
    if (def.type === 'fixed') return def.value;
    return Math.floor(Math.max(0, Wallet.get() - stake) * def.fraction);
  }

  function betAmount() {
    return stake;
  }

  function buildChipsHTML() {
    return CHIP_DEFS.map((def, i) => {
      const active = ''; // plus de jeton "sélectionné" : chaque clic ajoute
      const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise : ${fmt(chipAmount(def))} jetons"` : '';
      return `<button type="button" class="mn-chip${active}" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  function refreshFractionChipTooltips() {
    document.querySelectorAll('.mn-chip[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') {
        btn.dataset.tooltip = `Mise : ${fmt(chipAmount(def))} jetons`;
      }
    });
  }

  // Chaque clic sur un jeton AJOUTE sa valeur à la mise (100 ×3 = 300)
  function selectChip(index) {
    if (playing) return;
    const amount = chipAmount(CHIP_DEFS[index]);
    if (amount <= 0 || !Wallet.canAfford(stake + amount)) {
      setMessage('Solde insuffisant pour ajouter ce jeton.', 'msg-warn');
      Sfx.denied();
      return;
    }
    stake += amount;
    Sfx.chip();
    const btn = document.querySelector(`.mn-chip[data-chip-index="${index}"]`);
    if (btn) {
      btn.classList.remove('chip-bump');
      void btn.offsetWidth;
      btn.classList.add('chip-bump');
    }
    updateBetPreview();
    updateStartButton();
    updateMultiplierDisplay();
    setMessage(`Mise : ${fmt(stake)} jetons. Cliquez encore pour ajouter.`);
  }

  function clearStake() {
    if (playing || stake === 0) return;
    stake = 0;
    Sfx.chipsSweep();
    updateBetPreview();
    updateStartButton();
    updateMultiplierDisplay();
    setMessage('Mise effacée. Cliquez sur les jetons pour composer votre mise.');
  }

  /* ---------------- Multiplicateur (formule Mines classique) ---------------- */
  // À chaque case sûre révélée, le multiplicateur grimpe selon les
  // probabilités réelles de ne pas tomber sur une mine, moins 1% d'avantage
  // maison — exactement la formule utilisée par la référence Stake.
  function calculateMultiplier(mines, hits) {
    if (hits === 0) return 1;
    let mult = 1;
    for (let i = 0; i < hits; i++) {
      mult *= (GRID_SIZE - i) / (GRID_SIZE - mines - i);
    }
    return mult * HOUSE_EDGE;
  }

  function currentMultiplier() {
    return calculateMultiplier(minesCount, revealed.length);
  }

  function potentialWin() {
    return bet * currentMultiplier();
  }

  /* ---------------- Réglage du nombre de mines ---------------- */
  function updateMinesDisplay() {
    const el = document.getElementById('mn-mines-value');
    if (el) el.textContent = minesCount;
  }

  function adjustMines(delta) {
    if (playing) return;
    minesCount = Math.min(MAX_MINES, Math.max(MIN_MINES, minesCount + delta));
    Sfx.click();
    updateMinesDisplay();
    updateMultiplierDisplay();
  }

  /* ---------------- Affichages ---------------- */
  function setMessage(msg, cls) {
    const el = document.getElementById('mn-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg mn-message' + (cls ? ' ' + cls : '');
  }

  function updateBetPreview() {
    const el = document.getElementById('mn-bet-amount');
    if (el) el.textContent = fmt(playing ? bet : betAmount());
    refreshFractionChipTooltips();
  }

  function updateMultiplierDisplay() {
    const multEl = document.getElementById('mn-mult');
    const potEl = document.getElementById('mn-potential');
    if (multEl) multEl.textContent = currentMultiplier().toFixed(2) + '×';
    if (potEl) potEl.innerHTML = fmt(playing ? potentialWin() : betAmount()) + ' <span class="coin-icon" aria-hidden="true"></span>';
  }

  function updateStartButton() {
    const btn = document.getElementById('mn-start-btn');
    if (!btn) return;
    btn.disabled = playing || betAmount() <= 0 || !Wallet.canAfford(betAmount());
    updateRepeatButton();
  }

  function updateRepeatButton() {
    const btn = document.getElementById('mn-repeat-btn');
    if (!btn) return;
    btn.disabled = playing || lastStake <= 0 || !Wallet.canAfford(lastStake);
  }

  function updateCashoutButton() {
    const btn = document.getElementById('mn-cashout-btn');
    if (!btn) return;
    btn.disabled = !playing || revealed.length === 0;
  }

  function toggleBetControls(showBetting) {
    const betActions = document.getElementById('mn-bet-actions');
    const playActions = document.getElementById('mn-play-actions');
    const newGameBtn = document.getElementById('mn-newgame-btn');
    if (betActions) betActions.style.display = showBetting ? 'flex' : 'none';
    if (playActions) playActions.style.display = showBetting ? 'none' : 'flex';
    if (newGameBtn) newGameBtn.hidden = true;
    document.querySelectorAll('.mn-chip, #mn-stake-clear').forEach((c) => (c.disabled = !showBetting));
    document.querySelectorAll('.mn-mines-btn').forEach((c) => (c.disabled = !showBetting));
  }

  /* ---------------- Grille ---------------- */
  function tileContent(index, forceReveal) {
    const isMine = mineLocations.includes(index);
    const isRevealed = revealed.includes(index);

    if (isRevealed) {
      // la mine qui a sauté : explosion derrière la bombe
      return isMine ? IMG_BOOM + IMG_BOMB : IMG_GEM;
    }
    if (forceReveal) {
      // Fin de manche : on montre le reste de la grille en estompé
      return isMine ? IMG_BOMB : IMG_GEM;
    }
    return '';
  }

  function tileClass(index, forceReveal) {
    const isMine = mineLocations.includes(index);
    const isRevealed = revealed.includes(index);
    let cls = 'mn-tile';
    if (isRevealed) {
      cls += isMine ? ' mn-tile-bomb' : ' mn-tile-gem';
    } else if (forceReveal) {
      cls += isMine ? ' mn-tile-bomb-dim' : ' mn-tile-gem-dim';
    }
    if (!playing || isRevealed) cls += ' mn-tile-inactive';
    return cls;
  }

  function buildGridHTML() {
    let html = '';
    for (let i = 0; i < GRID_SIZE; i++) {
      html += `<button type="button" class="mn-tile" data-index="${i}"></button>`;
    }
    return html;
  }

  function renderGrid() {
    const forceReveal = !playing && gameOverState !== null;
    document.querySelectorAll('.mn-tile').forEach((btn) => {
      const i = Number(btn.dataset.index);
      btn.className = tileClass(i, forceReveal);
      btn.innerHTML = tileContent(i, forceReveal);
    });
  }

  /* ---------------- Déroulement d'une manche ---------------- */
  function generateMines() {
    const positions = [];
    while (positions.length < minesCount) {
      const pick = Math.floor(Math.random() * GRID_SIZE);
      if (!positions.includes(pick)) positions.push(pick);
    }
    return positions;
  }

  function startGame() {
    if (playing) return;
    const amount = betAmount();
    if (amount <= 0) {
      setMessage('Choisissez un jeton pour votre mise.', 'msg-warn');
      return;
    }
    if (!Wallet.canAfford(amount)) {
      setMessage('Solde insuffisant pour cette mise.', 'msg-warn');
      Sfx.denied();
      return;
    }
    Wallet.subtract(amount);
    Sfx.arm();
    if (window.Stats) Stats.round();

    lastStake = stake;
    bet = amount;
    mineLocations = generateMines();
    revealed = [];
    gameOverState = null;
    playing = true;

    toggleBetControls(false);
    updateBetPreview();
    updateMultiplierDisplay();
    updateCashoutButton();
    renderGrid();
    setMessage(`Mise en jeu : ${fmt(bet)} jetons. Choisissez une case.`);
  }

  function repeatBet() {
    if (playing || lastStake <= 0) return;
    stake = lastStake;
    startGame();
  }

  function handleTileClick(index) {
    if (!playing || revealed.includes(index) || gameOverState) return;

    if (mineLocations.includes(index)) {
      revealed.push(index);
      Sfx.explosion();
      endGame('loss');
      return;
    }

    revealed.push(index);
    Sfx.gem(revealed.length); // plus la série est longue, plus c'est aigu
    renderGrid();
    updateMultiplierDisplay();
    updateCashoutButton();

    if (revealed.length === GRID_SIZE - minesCount) {
      // Toutes les cases sûres ont été trouvées : victoire automatique
      endGame('win');
      return;
    }

    setMessage(`Case sûre ! Multiplicateur : ${currentMultiplier().toFixed(2)}×.`);
  }

  function pickRandomTile() {
    if (!playing) return;
    const free = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      if (!revealed.includes(i)) free.push(i);
    }
    if (free.length === 0) return;
    const pick = free[Math.floor(Math.random() * free.length)];
    handleTileClick(pick);
  }

  function cashout() {
    if (!playing || revealed.length === 0) return;
    endGame('win');
  }

  function endGame(reason) {
    playing = false;
    gameOverState = reason;

    if (reason === 'win') {
      const payout = Math.round(potentialWin());
      const profit = payout - bet;
      Wallet.add(payout);
      Sfx.cashRegister();
      Sfx.winFor(payout, bet);
      if (window.Stats) Stats.best(currentMultiplier());
      setMessage(`Encaissé ${fmt(payout)} jetons à ${currentMultiplier().toFixed(2)}× (profit ${fmt(profit)}).`, 'msg-good');
    } else {
      setMessage(`Boum ! Vous perdez ${fmt(bet)} jetons.`, 'msg-bad');
    }

    renderGrid();
    updateMultiplierDisplay();
    updateBetPreview();

    const betActions = document.getElementById('mn-bet-actions');
    const playActions = document.getElementById('mn-play-actions');
    const newGameBtn = document.getElementById('mn-newgame-btn');
    if (betActions) betActions.style.display = 'none';
    if (playActions) playActions.style.display = 'none';
    if (newGameBtn) newGameBtn.hidden = false;
  }

  function newGame() {
    revealed = [];
    mineLocations = [];
    gameOverState = null;
    bet = 0;
    toggleBetControls(true);
    updateBetPreview();
    updateMultiplierDisplay();
    updateStartButton();
    renderGrid();
    setMessage('Choisissez votre mise et le nombre de mines.');
  }

  /* ---------------- Init / DOM binding ---------------- */
  function init() {
    const container = document.querySelector('#mine .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="mn-wrap">
        <div class="mn-board-panel">
          <div class="mn-top-bar">
            <div class="mn-stat">
              <span class="mn-stat-label">Multiplicateur</span>
              <span class="mn-stat-value" id="mn-mult">1.00×</span>
            </div>
            <div class="mn-stat">
              <span class="mn-stat-label">Gain potentiel</span>
              <span class="mn-stat-value" id="mn-potential">0</span>
            </div>
          </div>
          <div class="mn-grid" id="mn-grid">${buildGridHTML()}</div>
        </div>

        <div class="mn-side-panel">
          <div class="mn-bet-panel">
            <p id="mn-message" class="game-msg mn-message">Choisissez votre mise et le nombre de mines.</p>
            <div class="mn-total-bet">Mise : <span id="mn-bet-amount">0</span> <span class="coin-icon" aria-hidden="true"></span><button type="button" class="stake-clear" id="mn-stake-clear">Effacer</button></div>
            <div class="mn-chip-row" id="mn-chip-row">${buildChipsHTML()}</div>
          </div>

          <div class="mn-mines-group">
            <span class="mn-mines-label">Nombre de mines</span>
            <div class="mn-mines-wrapper">
              <button type="button" class="mn-mines-btn" id="mn-mines-down">▼</button>
              <span class="mn-mines-value" id="mn-mines-value">${minesCount}</span>
              <button type="button" class="mn-mines-btn" id="mn-mines-up">▲</button>
            </div>
          </div>

          <div class="mn-actions" id="mn-bet-actions">
            <button type="button" class="btn-action mn-repeat" id="mn-repeat-btn" disabled>Même mise</button>
            <button type="button" class="btn-action mn-start" id="mn-start-btn">DÉMARRER</button>
          </div>

          <div class="mn-actions" id="mn-play-actions" style="display:none;">
            <button type="button" class="btn-action mn-random" id="mn-random-btn">Case au hasard</button>
            <button type="button" class="btn-action mn-cashout" id="mn-cashout-btn" disabled>ENCAISSER</button>
          </div>

          <button type="button" class="btn-action mn-newgame" id="mn-newgame-btn" hidden>Nouvelle partie</button>
        </div>
      </div>
    `;

    bindEvents(container);
    Wallet.refreshUI();
    updateStartButton();
  }

  function bindEvents(container) {
    container.querySelectorAll('.mn-chip').forEach((btn) => {
      btn.addEventListener('click', () => selectChip(Number(btn.dataset.chipIndex)));
    });
    container.querySelector('#mn-stake-clear').addEventListener('click', clearStake);

    container.querySelectorAll('.mn-tile').forEach((btn) => {
      btn.addEventListener('click', () => handleTileClick(Number(btn.dataset.index)));
    });

    container.querySelector('#mn-mines-up').addEventListener('click', () => adjustMines(1));
    container.querySelector('#mn-mines-down').addEventListener('click', () => adjustMines(-1));

    container.querySelector('#mn-start-btn').addEventListener('click', startGame);
    container.querySelector('#mn-repeat-btn').addEventListener('click', repeatBet);
    container.querySelector('#mn-random-btn').addEventListener('click', pickRandomTile);
    container.querySelector('#mn-cashout-btn').addEventListener('click', cashout);
    container.querySelector('#mn-newgame-btn').addEventListener('click', newGame);

    Wallet.onChange(() => {
      updateBetPreview();
      updateStartButton();
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Mines.init());