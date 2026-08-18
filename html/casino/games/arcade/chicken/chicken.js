/* chicken.js — Chicken Road pour Croissantage
   Le poulet avance case par case sur une route ; chaque case franchie fait
   grimper le multiplicateur, une voiture met fin à la manche et perd la
   mise. Encaissement possible à tout moment après la première case
   franchie. Le poulet est un sprite animé qui saute de case en case ; en
   cas de crash, une voiture "descend" et traverse la case fatale. Emojis
   pour l'instant, remplaçables plus tard par des images (mêmes IDs /
   classes, il suffira de changer le contenu textuel par des <img>).
*/
const Chicken = (() => {
  const HOUSE_EDGE = 0.97; // léger avantage maison, appliqué à chaque case
  const COL_STEP = 100; // largeur d'une case/colonne "four", doit matcher le CSS
  const ROAD_PAD_LEFT = 0; // padding gauche de .ch-road (les colonnes gèrent leur propre marge)

  // Niveaux de difficulté : plus il y a de cases et plus la probabilité de
  // survie par case est basse, plus le multiplicateur grimpe vite mais plus
  // le risque de crash est élevé.
  const DIFFICULTIES = [
    { id: 'moyen', label: 'Moyen', steps: 12, survival: 0.86 },
    { id: 'difficile', label: 'Difficile', steps: 10, survival: 0.76 },
    { id: 'extreme', label: 'Extrême', steps: 8, survival: 0.62 },
  ];

  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  // Emojis utilisés pour le moment — à remplacer plus tard par des <img>.
  const SPRITES = {
    chicken: '🐔',
    fire: '🔥',
    oven: '🧱',
    coin: '🪙',
    check: '✅',
  };

  let selectedChipIndex = 1; // '50' par défaut
  let lastChipIndex = null;
  let lastDifficultyIndex = null;
  let selectedDifficultyIndex = 0; // 'Facile' par défaut
  let bet = 0;
  let playing = false;
  let position = 0; // nombre de cases franchies avec succès dans la manche en cours
  let crashedAt = null; // index (1-based) de la case fatale, sinon null
  let built = false;

  function fmt(n) {
    return Math.round(n).toLocaleString('fr-FR');
  }

  function currentDifficulty() {
    return DIFFICULTIES[selectedDifficultyIndex];
  }

  /* ---------------- Jetons ---------------- */
  function chipAmount(def) {
    if (def.type === 'fixed') return def.value;
    return Math.floor(Wallet.get() * def.fraction);
  }

  function betAmount() {
    return chipAmount(CHIP_DEFS[selectedChipIndex]);
  }

  function buildChipsHTML() {
    return CHIP_DEFS.map((def, i) => {
      const active = i === selectedChipIndex ? ' active' : '';
      const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise : ${fmt(chipAmount(def))} 🪙"` : '';
      return `<button type="button" class="ch-chip${active}" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  function refreshFractionChipTooltips() {
    document.querySelectorAll('.ch-chip[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') {
        btn.dataset.tooltip = `Mise : ${fmt(chipAmount(def))} 🪙`;
      }
    });
  }

  function selectChip(index) {
    if (playing) return;
    selectedChipIndex = index;
    document.querySelectorAll('.ch-chip').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.chipIndex) === index);
    });
    updateBetPreview();
    updateStartButton();
  }

  /* ---------------- Difficulté ---------------- */
  function buildDifficultyHTML() {
    return DIFFICULTIES.map((d, i) => {
      const active = i === selectedDifficultyIndex ? ' active' : '';
      return `<button type="button" class="ch-diff-btn${active}" data-diff-index="${i}" data-tooltip="${d.steps} cases · ${Math.round(d.survival * 100)}% de survie par case">${d.label}</button>`;
    }).join('');
  }

  function selectDifficulty(index) {
    if (playing) return;
    selectedDifficultyIndex = index;
    document.querySelectorAll('.ch-diff-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.diffIndex) === index);
    });
    renderRoad();
    positionChickenSprite(0, false);
    updateMultiplierDisplay();
  }

  /* ---------------- Multiplicateur ---------------- */
  function stepFactor(diff) {
    return HOUSE_EDGE / diff.survival;
  }

  function multiplierAt(diff, n) {
    if (n <= 0) return 1;
    return Math.pow(stepFactor(diff), n);
  }

  function currentMultiplier() {
    return multiplierAt(currentDifficulty(), position);
  }

  function potentialWin() {
    return bet * currentMultiplier();
  }

  /* ---------------- Affichages ---------------- */
  function setMessage(msg, cls) {
    const el = document.getElementById('ch-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg ch-message' + (cls ? ' ' + cls : '');
  }

  function updateBetPreview() {
    const el = document.getElementById('ch-bet-amount');
    if (el) el.textContent = fmt(playing ? bet : betAmount());
    refreshFractionChipTooltips();
  }

  function updateMultiplierDisplay() {
    const multEl = document.getElementById('ch-mult');
    const potEl = document.getElementById('ch-potential');
    if (multEl) multEl.textContent = currentMultiplier().toFixed(2) + '×';
    if (potEl) potEl.textContent = fmt(playing ? potentialWin() : betAmount()) + ' 🪙';
  }

  function updateStartButton() {
    const btn = document.getElementById('ch-start-btn');
    if (!btn) return;
    btn.disabled = playing || betAmount() <= 0 || !Wallet.canAfford(betAmount());
    updateRepeatButton();
  }

  function updateRepeatButton() {
    const btn = document.getElementById('ch-repeat-btn');
    if (!btn) return;
    const amount = lastChipIndex === null ? 0 : chipAmount(CHIP_DEFS[lastChipIndex]);
    btn.disabled = playing || lastChipIndex === null || amount <= 0 || !Wallet.canAfford(amount);
  }

  function updateActionButtons() {
    const advanceBtn = document.getElementById('ch-advance-btn');
    const cashoutBtn = document.getElementById('ch-cashout-btn');
    if (advanceBtn) advanceBtn.disabled = !playing;
    if (cashoutBtn) cashoutBtn.disabled = !playing || position === 0;
  }

  function toggleBetControls(showBetting) {
    const betActions = document.getElementById('ch-bet-actions');
    const playActions = document.getElementById('ch-play-actions');
    const newGameBtn = document.getElementById('ch-newgame-btn');
    if (betActions) betActions.style.display = showBetting ? 'flex' : 'none';
    if (playActions) playActions.style.display = showBetting ? 'none' : 'flex';
    if (newGameBtn) newGameBtn.hidden = true;
    document.querySelectorAll('.ch-chip').forEach((c) => (c.disabled = !showBetting));
    document.querySelectorAll('.ch-diff-btn').forEach((c) => (c.disabled = !showBetting));
  }

  /* ---------------- Route ---------------- */
  function tileClass(index) {
    let cls = 'ch-tile';
    if (crashedAt !== null) {
      if (index < crashedAt) cls += ' ch-tile-safe';
      else if (index === crashedAt) cls += ' ch-tile-crash';
      else cls += ' ch-tile-future ch-tile-dim';
    } else if (index < position) {
      cls += ' ch-tile-safe';
    } else if (index === position && playing) {
      cls += ' ch-tile-current';
    } else {
      cls += ' ch-tile-future';
    }
    return cls;
  }

  function tileContent(index) {
    // Le poulet et la voiture sont désormais des sprites animés superposés
    // à la route (voir positionChickenSprite / spawnFireSprite) : les cases
    // ne montrent qu'un check une fois validées.
    if (index < position || (crashedAt !== null && index < crashedAt)) return SPRITES.check;
    return '';
  }

  function tileOvenClass(index) {
    if (crashedAt !== null && index === crashedAt) return 'ch-tile-oven ch-oven-crash';
    return 'ch-tile-oven';
  }

  function buildRoadHTML() {
    const diff = currentDifficulty();
    let html = `
      <div class="ch-tile-col">
        <div class="ch-tile ch-tile-start">
          <div class="ch-tile-badge">${SPRITES.coin}</div>
          <div class="ch-tile-oven"></div>
        </div>
      </div>`;
    for (let i = 1; i <= diff.steps; i++) {
      html += `
        <div class="ch-tile-col">
          <div class="${tileClass(i)}" data-step="${i}">
            <div class="ch-tile-badge">${multiplierAt(diff, i).toFixed(2)}×</div>
            <div class="${tileOvenClass(i)}">${tileContent(i)}</div>
          </div>
        </div>`;
    }
    return html;
  }

  function renderRoad() {
    const el = document.getElementById('ch-tiles-row');
    if (el) el.innerHTML = buildRoadHTML();
  }

  /* ---------------- Sprites animés ---------------- */
  function positionChickenSprite(index, hop) {
    const sprite = document.getElementById('ch-chicken-sprite');
    if (!sprite) return;
    sprite.style.opacity = '1';
    sprite.style.left = `${ROAD_PAD_LEFT + index * COL_STEP}px`;
    if (hop) {
      sprite.classList.remove('ch-hop');
      // force reflow pour rejouer l'animation
      void sprite.offsetWidth;
      sprite.classList.add('ch-hop');
    }
  }

  function clearFireSprite() {
    const existing = document.getElementById('ch-fire-sprite');
    if (existing) existing.remove();
  }

  function spawnFireSprite(index) {
    clearFireSprite();
    const road = document.getElementById('ch-road');
    if (!road) return;
    const fire = document.createElement('div');
    fire.id = 'ch-fire-sprite';
    fire.className = 'ch-fire-sprite';
    fire.style.left = `${ROAD_PAD_LEFT + index * COL_STEP}px`;
    fire.textContent = SPRITES.fire;
    road.appendChild(fire);
  }

  /* ---------------- Déroulement d'une manche ---------------- */
  function startGame() {
    if (playing) return;
    const amount = betAmount();
    if (amount <= 0) {
      setMessage('Choisissez un jeton pour votre mise.', 'msg-warn');
      return;
    }
    if (!Wallet.canAfford(amount)) {
      setMessage('Solde insuffisant pour cette mise.', 'msg-warn');
      return;
    }
    Wallet.subtract(amount);

    lastChipIndex = selectedChipIndex;
    lastDifficultyIndex = selectedDifficultyIndex;
    bet = amount;
    position = 0;
    crashedAt = null;
    playing = true;

    clearFireSprite();
    toggleBetControls(false);
    updateBetPreview();
    updateMultiplierDisplay();
    updateActionButtons();
    renderRoad();
    positionChickenSprite(0, false);
    setMessage(`Mise en jeu : ${fmt(bet)} 🪙. Avancez le poulet !`);
  }

  function repeatBet() {
    if (playing || lastChipIndex === null) return;
    selectChip(lastChipIndex);
    if (lastDifficultyIndex !== null) selectDifficulty(lastDifficultyIndex);
    startGame();
  }

  function advance() {
    if (!playing) return;
    const diff = currentDifficulty();
    const survived = Math.random() < diff.survival;

    if (!survived) {
      crashedAt = position + 1;
      spawnFireSprite(crashedAt);
      const sprite = document.getElementById('ch-chicken-sprite');
      if (sprite) sprite.style.opacity = '0';
      renderRoad();
      updateActionButtons();
      // laisse le feu "jaillir" avant de conclure la manche
      setTimeout(() => endGame('loss'), 450);
      return;
    }

    position += 1;
    positionChickenSprite(position, true);
    renderRoad();
    updateMultiplierDisplay();
    updateActionButtons();

    if (position >= diff.steps) {
      setMessage('🏁 Route terminée ! Grand prix décroché !');
      endGame('win');
      return;
    }

    setMessage(`🐔 Traversée réussie ! Multiplicateur : ${currentMultiplier().toFixed(2)}×.`);
  }

  function cashout() {
    if (!playing || position === 0) return;
    endGame('win');
  }

  function endGame(reason) {
    playing = false;

    if (reason === 'win') {
      const payout = Math.round(potentialWin());
      const profit = payout - bet;
      Wallet.add(payout);
      setMessage(`🎉 Encaissé ${fmt(payout)} 🪙 à ${currentMultiplier().toFixed(2)}× (profit ${fmt(profit)} 🪙).`, 'msg-good');
    } else {
      setMessage(`🔥 Brûlé ! Vous perdez ${fmt(bet)} 🪙.`, 'msg-bad');
    }

    renderRoad();
    updateMultiplierDisplay();
    updateBetPreview();
    updateActionButtons();

    const betActions = document.getElementById('ch-bet-actions');
    const playActions = document.getElementById('ch-play-actions');
    const newGameBtn = document.getElementById('ch-newgame-btn');
    if (betActions) betActions.style.display = 'none';
    if (playActions) playActions.style.display = 'none';
    if (newGameBtn) newGameBtn.hidden = false;
  }

  function newGame() {
    position = 0;
    crashedAt = null;
    bet = 0;
    clearFireSprite();
    toggleBetControls(true);
    updateBetPreview();
    updateMultiplierDisplay();
    updateStartButton();
    updateActionButtons();
    renderRoad();
    positionChickenSprite(0, false);
    setMessage('Choisissez votre mise et la difficulté.');
  }

  /* ---------------- Init / DOM binding ---------------- */
  function init() {
    const container = document.querySelector('#chicken .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="ch-wrap">
        <div class="ch-board-panel">
          <div class="ch-top-bar">
            <div class="ch-stat">
              <span class="ch-stat-label">Multiplicateur</span>
              <span class="ch-stat-value" id="ch-mult">1.00×</span>
            </div>
            <div class="ch-stat">
              <span class="ch-stat-label">Gain potentiel</span>
              <span class="ch-stat-value" id="ch-potential">0 🪙</span>
            </div>
          </div>
          <div class="ch-road-scroll">
            <div class="ch-road" id="ch-road">
              <div class="ch-tiles-row" id="ch-tiles-row">${buildRoadHTML()}</div>
              <div class="ch-chicken-sprite" id="ch-chicken-sprite">${SPRITES.chicken}</div>
            </div>
          </div>
        </div>

        <div class="ch-side-panel">
          <p id="ch-message" class="game-msg ch-message">Choisissez votre mise et la difficulté.</p>
          <div class="ch-total-bet">Mise : <span id="ch-bet-amount">0</span> 🪙</div>
          <div class="ch-chip-row" id="ch-chip-row">${buildChipsHTML()}</div>

          <div class="ch-diff-group" id="ch-diff-group">${buildDifficultyHTML()}</div>

          <div class="ch-actions" id="ch-bet-actions">
            <button type="button" class="btn-action ch-repeat" id="ch-repeat-btn" disabled>Même mise</button>
            <button type="button" class="btn-action ch-start" id="ch-start-btn">DÉMARRER</button>
          </div>

          <div class="ch-actions" id="ch-play-actions" style="display:none;">
            <button type="button" class="btn-action ch-advance" id="ch-advance-btn">AVANCER 🐔</button>
            <button type="button" class="btn-action ch-cashout" id="ch-cashout-btn" disabled>ENCAISSER</button>
          </div>

          <button type="button" class="btn-action ch-newgame" id="ch-newgame-btn" hidden>Nouvelle partie</button>
        </div>
      </div>
    `;

    bindEvents(container);
    positionChickenSprite(0, false);
    Wallet.refreshUI();
    updateStartButton();
    updateActionButtons();
  }

  function bindEvents(container) {
    container.querySelectorAll('.ch-chip').forEach((btn) => {
      btn.addEventListener('click', () => selectChip(Number(btn.dataset.chipIndex)));
    });

    container.querySelectorAll('.ch-diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectDifficulty(Number(btn.dataset.diffIndex)));
    });

    container.querySelector('#ch-start-btn').addEventListener('click', startGame);
    container.querySelector('#ch-repeat-btn').addEventListener('click', repeatBet);
    container.querySelector('#ch-advance-btn').addEventListener('click', advance);
    container.querySelector('#ch-cashout-btn').addEventListener('click', cashout);
    container.querySelector('#ch-newgame-btn').addEventListener('click', newGame);

    Wallet.onChange(() => {
      updateBetPreview();
      updateStartButton();
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Chicken.init());